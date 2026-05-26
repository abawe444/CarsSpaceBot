const crypto = require('crypto');
const { db, upsertSetting } = require('../database/db');
const { addLog } = require('./logsService');

let warnedMissingSecret = false;

function resolveSecret() {
  if (process.env.APP_SECRET && process.env.APP_SECRET.trim()) {
    return process.env.APP_SECRET.trim();
  }

  const row = db.prepare("SELECT value FROM settings WHERE key = 'app_secret'").get();
  if (row?.value) return row.value;

  const generated = crypto.randomBytes(48).toString('hex');
  upsertSetting('app_secret', generated);

  if (!warnedMissingSecret) {
    addLog('warning', 'admin', 'APP_SECRET missing. Generated local secret in settings for demo environment.');
    warnedMissingSecret = true;
  }
  return generated;
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function maskApiKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  const prefixMatch = value.match(/^[a-zA-Z]{2,4}-/);
  const prefix = prefixMatch ? prefixMatch[0] : '';
  const core = prefix ? value.slice(prefix.length) : value;
  const tail = core.slice(-4);
  return `${prefix}${'*'.repeat(Math.max(8, core.length - 4))}${tail}`;
}

function encryptText(plainText) {
  const text = String(plainText || '');
  if (!text) return '';

  const secret = resolveSecret();
  const key = keyFromSecret(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptText(encryptedText) {
  const payload = String(encryptedText || '');
  if (!payload) return '';

  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return '';

  const secret = resolveSecret();
  const key = keyFromSecret(secret);

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    addLog('warning', 'ai_provider', 'Failed to decrypt saved API key. It may have been encrypted with a different APP_SECRET.', {
      reason: error.message
    });
    return '';
  }
}

module.exports = {
  encryptText,
  decryptText,
  maskApiKey
};
