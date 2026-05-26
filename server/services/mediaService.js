const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../database/db');
const { addLog } = require('./logsService');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extByMediaType(mediaType) {
  if (mediaType === 'voice') return '.ogg';
  if (mediaType === 'image') return '.jpg';
  if (mediaType === 'document') return '.bin';
  return '.dat';
}

function createMediaPath(mediaType) {
  const base = path.resolve(process.cwd(), 'storage', 'media', mediaType === 'voice' ? 'voice' : mediaType === 'image' ? 'images' : 'files');
  ensureDir(base);
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${extByMediaType(mediaType)}`;
  return path.join(base, name);
}

function createMediaMessageRecord({
  contactJid,
  messageId,
  mediaType,
  filePath = null,
  transcript = null,
  analysis = null,
  processingStatus = 'pending',
  errorMessage = null
}) {
  const info = db.prepare(`
    INSERT INTO media_messages (
      contact_jid, message_id, media_type, file_path, transcript, analysis, processing_status, error_message, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    contactJid,
    messageId || null,
    mediaType,
    filePath,
    transcript,
    analysis,
    processingStatus,
    errorMessage
  );
  return info.lastInsertRowid;
}

function updateMediaMessageRecord(id, fields = {}) {
  const current = db.prepare('SELECT * FROM media_messages WHERE id = ?').get(id);
  if (!current) return null;
  const next = { ...current, ...fields };
  db.prepare(`
    UPDATE media_messages
    SET file_path = ?, transcript = ?, analysis = ?, processing_status = ?, error_message = ?
    WHERE id = ?
  `).run(
    next.file_path,
    next.transcript,
    next.analysis,
    next.processing_status,
    next.error_message,
    id
  );
  return db.prepare('SELECT * FROM media_messages WHERE id = ?').get(id);
}

async function downloadIncomingMedia({ whatsappClient, rawMessage, mediaType, contactJid, messageId }) {
  const recordId = createMediaMessageRecord({
    contactJid,
    messageId,
    mediaType,
    processingStatus: 'downloading'
  });

  try {
    const buffer = await whatsappClient.downloadMessageMedia(rawMessage);
    if (!buffer || !Buffer.isBuffer(buffer)) {
      updateMediaMessageRecord(recordId, { processing_status: 'failed', error_message: 'empty_buffer' });
      return { ok: false, recordId, error: 'empty_buffer' };
    }

    const filePath = createMediaPath(mediaType);
    fs.writeFileSync(filePath, buffer);
    updateMediaMessageRecord(recordId, { file_path: filePath, processing_status: 'downloaded' });
    return { ok: true, recordId, filePath, buffer };
  } catch (error) {
    addLog('error', 'whatsapp', 'Media download failed', { error: error.message, mediaType, contactJid });
    updateMediaMessageRecord(recordId, { processing_status: 'failed', error_message: error.message });
    return { ok: false, recordId, error: error.message };
  }
}

module.exports = {
  downloadIncomingMedia,
  updateMediaMessageRecord
};
