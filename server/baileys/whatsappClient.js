const fs = require('fs');
const path = require('path');
const P = require('pino');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');
const { SESSION_DIR } = require('../config/appConfig');
const { parseIncomingMessage } = require('./messageParser');
const { setConnectionState, getConnectionState } = require('./connectionManager');
const { processInboundMessage } = require('../services/replyEngine');
const { addLog } = require('../services/logsService');

let socket = null;
let ioRef = null;
let isStarting = false;
let baileysLib = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let forcingSessionRefresh = false;
let myJid = '';
let botIdentity = {
  botUser: null,
  possibleSelfJids: [],
  possibleSelfLids: []
};

async function loadBaileys() {
  if (baileysLib) return baileysLib;
  const mod = await import('@whiskeysockets/baileys');
  baileysLib = {
    makeWASocket: mod.default,
    DisconnectReason: mod.DisconnectReason,
    useMultiFileAuthState: mod.useMultiFileAuthState,
    Browsers: mod.Browsers,
    fetchLatestBaileysVersion: mod.fetchLatestBaileysVersion,
    downloadMediaMessage: mod.downloadMediaMessage
  };
  return baileysLib;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

async function ensureSessionDir() {
  const abs = path.resolve(process.cwd(), SESSION_DIR);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}

async function clearSessionFiles() {
  const sessionPath = path.resolve(process.cwd(), SESSION_DIR);
  fs.mkdirSync(sessionPath, { recursive: true });
  const files = fs.readdirSync(sessionPath);
  files.forEach((name) => {
    const full = path.join(sessionPath, name);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: true });
    } else {
      fs.unlinkSync(full);
    }
  });
}

function cleanupSocket() {
  if (!socket) return;
  try {
    socket.ev.removeAllListeners('connection.update');
    socket.ev.removeAllListeners('messages.upsert');
    socket.ev.removeAllListeners('creds.update');
  } catch {
    // ignore
  }
  try {
    socket.end(new Error('Socket cleanup'));
  } catch {
    // ignore
  }
  socket = null;
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildBotIdentity(user = {}) {
  const botUser = user || {};
  const userId = String(botUser.id || '').toLowerCase();
  const pn = String(botUser.phoneNumber || botUser.phone || '').replace(/[^\d]/g, '');
  const lidCandidates = [];
  const jidCandidates = [];

  if (userId) {
    if (userId.includes('@')) jidCandidates.push(userId);
    const raw = userId.split('@')[0].split(':')[0];
    if (raw) {
      jidCandidates.push(`${raw}@s.whatsapp.net`);
      lidCandidates.push(raw);
    }
    if (userId.endsWith('@lid')) {
      lidCandidates.push(userId);
      lidCandidates.push(userId.replace(/@lid$/i, ''));
    }
  }

  const userLid = String(botUser.lid || botUser.lidJid || '').toLowerCase();
  if (userLid) {
    lidCandidates.push(userLid);
    lidCandidates.push(userLid.replace(/@lid$/i, ''));
  }

  if (pn) {
    jidCandidates.push(`${pn}@s.whatsapp.net`);
    jidCandidates.push(pn);
  }

  return {
    botUser,
    possibleSelfJids: unique(jidCandidates.map((x) => String(x).toLowerCase())),
    possibleSelfLids: unique(lidCandidates.map((x) => String(x).toLowerCase()))
  };
}

async function emitState() {
  if (!ioRef) return;
  ioRef.emit('whatsapp:status', getConnectionState());
}

function scheduleReconnect(delayMs = 2500) {
  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    startWhatsApp(ioRef).catch((error) => {
      addLog('error', 'whatsapp', 'Reconnection failed', { error: error.message });
    });
  }, delayMs);
}

async function startWhatsApp(io, options = {}) {
  if (isStarting) return;
  isStarting = true;
  ioRef = io;

  try {
    const {
      makeWASocket,
      useMultiFileAuthState,
      Browsers,
      DisconnectReason,
      fetchLatestBaileysVersion
    } = await loadBaileys();

    clearReconnectTimer();
    if (options.forceNewLogin) {
      await clearSessionFiles();
      addLog('warning', 'whatsapp', 'Session files cleared to regenerate QR');
    }

    cleanupSocket();

    const sessionPath = await ensureSessionDir();
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    addLog('info', 'whatsapp', 'Using WhatsApp Web version', { version, isLatest });

    socket = makeWASocket({
      auth: state,
      logger: P({ level: 'silent' }),
      version,
      browser: Browsers.macOS('Desktop'),
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        reconnectAttempts = 0;
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 280 });
        setConnectionState({ status: 'qr', qr: qrDataUrl, lastError: null });
        addLog('info', 'whatsapp', 'QR generated');
        emitState();
      }

      if (connection === 'connecting') {
        setConnectionState({ status: 'reconnecting', lastError: null });
        emitState();
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        forcingSessionRefresh = false;
        myJid = socket?.user?.id || '';
        botIdentity = buildBotIdentity(socket?.user || {});
        setConnectionState({ status: 'connected', qr: null, lastError: null });
        addLog('info', 'whatsapp', 'WhatsApp connected');
        addLog('info', 'group_debug', 'Bot identity detected', {
          myJid,
          botIdentity: {
            possibleSelfJids: botIdentity.possibleSelfJids,
            possibleSelfLids: botIdentity.possibleSelfLids
          }
        });
        emitState();
      }

      if (connection === 'close') {
        const errorObj = new Boom(lastDisconnect?.error || new Error('Unknown disconnect'));
        const code = errorObj?.output?.statusCode || null;
        const errorMessage = errorObj?.message || 'Unknown error';

        const isLoggedOut = code === DisconnectReason.loggedOut || code === DisconnectReason.forbidden;
        const isSessionIssue = code === DisconnectReason.badSession || code === DisconnectReason.multideviceMismatch || code === 405;

        setConnectionState({
          status: isLoggedOut ? 'disconnected' : 'reconnecting',
          qr: null,
          lastError: code || errorMessage
        });
        addLog('warning', 'whatsapp', 'Connection closed', {
          code,
          errorMessage,
          reconnectAttempts
        });
        emitState();

        if (isLoggedOut) {
          addLog('warning', 'whatsapp', 'Logged out from WhatsApp. Please relink using QR.');
          return;
        }

        if (isSessionIssue && !forcingSessionRefresh) {
          forcingSessionRefresh = true;
          reconnectAttempts = 0;
          addLog('warning', 'whatsapp', 'Detected session issue. Regenerating QR by refreshing session.');
          await startWhatsApp(ioRef, { forceNewLogin: true });
          return;
        }

        reconnectAttempts += 1;

        if (reconnectAttempts >= 6 && !forcingSessionRefresh) {
          forcingSessionRefresh = true;
          reconnectAttempts = 0;
          addLog('warning', 'whatsapp', 'Repeated reconnect failures. Forcing session refresh to regenerate QR.');
          await startWhatsApp(ioRef, { forceNewLogin: true });
          return;
        }

        scheduleReconnect(Math.min(15000, 2000 + reconnectAttempts * 1000));
      }
    });

    socket.ev.on('messages.upsert', async (event) => {
      if (event.type !== 'notify' || !Array.isArray(event.messages)) return;
      for (const message of event.messages) {
        const parsed = parseIncomingMessage(message);
        await processInboundMessage(parsed, module.exports, ioRef);
      }
    });
  } catch (error) {
    setConnectionState({ status: 'disconnected', lastError: error.message });
    addLog('error', 'whatsapp', 'Failed to start WhatsApp client', { error: error.message });
    emitState();
    scheduleReconnect(5000);
  } finally {
    isStarting = false;
  }
}

async function sendMessage(jid, text) {
  if (!socket) throw new Error('WhatsApp socket not initialized yet');
  return socket.sendMessage(jid, { text });
}

async function sendTypingPresence(jid, state = 'composing') {
  if (!socket || !jid) return;
  try {
    await socket.presenceSubscribe(jid);
  } catch {
    // ignore
  }
  try {
    await socket.sendPresenceUpdate(state, jid);
  } catch {
    // ignore
  }
}

async function downloadMessageMedia(rawMessage) {
  if (!socket) throw new Error('WhatsApp socket not initialized yet');
  const { downloadMediaMessage } = await loadBaileys();
  return downloadMediaMessage(rawMessage, 'buffer', {}, {
    logger: P({ level: 'silent' }),
    reuploadRequest: socket.updateMediaMessage
  });
}

async function listGroups() {
  if (!socket) return [];
  try {
    const groups = await socket.groupFetchAllParticipating();
    return Object.values(groups || {}).map((g) => ({
      groupJid: g.id,
      subject: g.subject || '',
      size: g.size || 0,
      participants: (g.participants || []).map((p) => ({
        id: p.id,
        admin: p.admin || null
      }))
    }));
  } catch {
    return [];
  }
}

function getMyJid() {
  return myJid || socket?.user?.id || '';
}

function getBotIdentity() {
  if (!botIdentity.botUser && socket?.user) {
    botIdentity = buildBotIdentity(socket.user);
  }
  return botIdentity;
}

async function restartConnection() {
  reconnectAttempts = 0;
  forcingSessionRefresh = false;
  setConnectionState({ status: 'reconnecting', qr: null, lastError: null });
  emitState();
  await startWhatsApp(ioRef);
}

async function resetSession() {
  reconnectAttempts = 0;
  forcingSessionRefresh = true;
  await clearSessionFiles();
  setConnectionState({ status: 'disconnected', qr: null, lastError: null });
  emitState();
  await startWhatsApp(ioRef, { forceNewLogin: false });
}

function getStatus() {
  return getConnectionState();
}

module.exports = {
  startWhatsApp,
  sendMessage,
  restartConnection,
  resetSession,
  getStatus,
  sendTypingPresence,
  downloadMessageMedia,
  listGroups,
  getMyJid,
  getBotIdentity
};
