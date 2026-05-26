const express = require('express');
const { db } = require('../database/db');
const { resolveSenderIdentity } = require('../services/identityService');
const { getLastSkips, getGroupDebugEvents, evaluateGroupRouting, isManagementCommandText } = require('../services/groupRouterService');
const { getEffectiveSettings, getSettings } = require('../services/settingsService');
const { OWNER_IDENTIFIERS, OWNER_PROFILE } = require('../config/ownerConfig');
const { shouldRespondInGroup, getAdminGroup, normalizeGroupJid } = require('../services/adminGroupService');
const { isReportTrigger, isCommandMessage, detectReportIntent } = require('../services/reportIntentService');
const { executeOwnerCommand } = require('../services/ownerCommandService');
const { getBotIdentity } = require('../baileys/whatsappClient');

const router = express.Router();

function normalizeJid(jid = '') {
  return String(jid || '').split(':')[0].toLowerCase();
}

function isDirectedToBotText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.startsWith('!') || raw.startsWith('/') || raw.startsWith('#تقرير') || raw.startsWith('#ملخص')) return true;
  const lowered = raw.toLowerCase();
  const aliases = ['مساعد', 'البوت', 'يا مساعد', 'يا بوت', 'صرح', 'فضاء المحركات'];
  return aliases.some((a) => lowered.includes(a.toLowerCase()));
}

router.post('/debug/identity', (req, res) => {
  const body = req.body || {};
  const identity = resolveSenderIdentity({
    remoteJid: body.remoteJid || '',
    participantJid: body.participantJid || '',
    pushName: body.pushName || '',
    participantPn: body.participantPn || '',
    participantLid: body.participantLid || ''
  });
  res.json({ success: true, data: identity });
});

router.get('/debug/owner', (req, res) => {
  const ownerPerson = db.prepare(`
    SELECT id, full_name, preferred_name, role_key, role_label, phone, normalized_phone, whatsapp_jid, enabled, is_vip
    FROM people
    WHERE normalized_phone = '966578448146'
       OR whatsapp_jid = '966578448146@s.whatsapp.net'
       OR role_key = 'system_owner'
    ORDER BY id ASC
    LIMIT 1
  `).get();

  const ownerIdentifiers = ownerPerson
    ? db.prepare(`
      SELECT identifier_type, identifier_value, verified, confidence, source
      FROM person_identifiers
      WHERE person_id = ?
      ORDER BY id ASC
    `).all(ownerPerson.id)
    : [];

  const permissionsCount = ownerPerson
    ? db.prepare('SELECT COUNT(*) as c FROM person_permissions WHERE person_id = ? AND allowed = 1').get(ownerPerson.id).c
    : 0;

  res.json({
    success: true,
    data: {
      ownerConfig: {
        profile: OWNER_PROFILE,
        identifiers: OWNER_IDENTIFIERS
      },
      ownerPersonFound: Boolean(ownerPerson),
      ownerPerson,
      ownerIdentifiers,
      permissionsCount
    }
  });
});

router.get('/debug/group-last-skips', (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json({ success: true, data: getLastSkips(limit) });
});

router.get('/debug/group-events', (req, res) => {
  const limit = Number(req.query.limit || 50);
  const fromMemory = getGroupDebugEvents(limit);
  if (fromMemory.length) {
    return res.json({ success: true, data: fromMemory });
  }
  const rows = db.prepare(`
    SELECT id, level, source, message, meta_json, created_at
    FROM logs
    WHERE source = 'group_debug'
    ORDER BY id DESC
    LIMIT ?
  `).all(limit).map((r) => {
    let meta = null;
    try {
      meta = r.meta_json ? JSON.parse(r.meta_json) : null;
    } catch {
      meta = null;
    }
    return {
      id: r.id,
      created_at: r.created_at,
      ...meta,
      message: r.message
    };
  });
  return res.json({ success: true, data: rows });
});

router.get('/debug/effective-settings', (req, res) => {
  res.json({
    success: true,
    data: getEffectiveSettings()
  });
});

router.get('/debug/bot-identity', (req, res) => {
  const identity = getBotIdentity();
  res.json({
    success: true,
    data: {
      botUser: identity?.botUser || null,
      possibleSelfJids: identity?.possibleSelfJids || [],
      possibleSelfLids: identity?.possibleSelfLids || []
    }
  });
});

router.post('/debug/simulate-group-message', async (req, res) => {
  try {
    const body = req.body || {};
    const remoteJid = normalizeGroupJid(String(body.remoteJid || '').trim());
    const participantJid = String(body.participantJid || '').trim();
    const text = String(body.text || '').trim();
    const pushName = String(body.pushName || '').trim();
    const isGroup = remoteJid.endsWith('@g.us');

    const parsed = {
      jid: remoteJid,
      participant: participantJid,
      senderJid: participantJid,
      isGroup,
      text,
      fromMe: false,
      messageType: 'text',
      mentionedJid: Array.isArray(body.mentionedJid) ? body.mentionedJid : [],
      participantPn: body.participantPn || '',
      participantLid: body.participantLid || '',
      pushName,
      groupName: body.groupName || ''
    };

    const settings = getSettings();
    const identity = resolveSenderIdentity({
      remoteJid,
      participantJid,
      pushName,
      participantPn: parsed.participantPn,
      participantLid: parsed.participantLid
    });

    const myJid = normalizeJid(body.botJid || '');
    const isMentioned = (parsed.mentionedJid || []).some((jid) => normalizeJid(jid) === myJid);
    const isDirectedByName = isDirectedToBotText(text);
    const hasCommand = isCommandMessage(text);
    const hasReportIntent = isReportTrigger(text);
    const hasCommandOrReportIntent = hasCommand || hasReportIntent || isDirectedByName || isManagementCommandText(text);
    const groupStatus = getAdminGroup(remoteJid) || null;

    const gate = shouldRespondInGroup({
      groupJid: remoteJid,
      isMentioned,
      hasCommandOrReportIntent,
      bypassAuthorization: Boolean(identity.isOwner || identity.isSuperAdmin)
    });

    const routeDecision = evaluateGroupRouting({
      parsed,
      settings,
      gateResult: gate,
      identity,
      isMentioned,
      isDirectedByName,
      hasCommand,
      hasReportIntent
    });

    const ownerPreview = await executeOwnerCommand({
      parsed,
      identity,
      whatsappClient: {
        getStatus: () => ({ status: 'debug' })
      },
      options: { dryRun: true }
    });

    const commandDetected = ownerPreview.handled
      ? ownerPreview.command
      : hasReportIntent
        ? detectReportIntent(text).type
        : hasCommand
          ? 'command'
          : null;

    return res.json({
      success: true,
      data: {
        isGroup,
        identity,
        groupStatus,
        commandDetected,
        shouldReply: Boolean(ownerPreview.handled || routeDecision.shouldReply),
        skipReason: ownerPreview.handled ? null : (routeDecision.reason || gate.reason || null),
        plannedReply: ownerPreview.handled ? ownerPreview.reply : null
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
