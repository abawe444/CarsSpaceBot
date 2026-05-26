const { db } = require('../database/db');
const { sanitizeText } = require('./sanitizer');

function ensureContact({ jid, display_name = '', phone = '' }) {
  const existing = db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid);
  if (!existing) {
    db.prepare(`
      INSERT INTO contacts (jid, display_name, phone, human_handoff, unread_count, created_at, updated_at)
      VALUES (?, ?, ?, 0, 0, datetime('now'), datetime('now'))
    `).run(jid, display_name, phone);
  }
  return db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid);
}

function updateContactMessage(jid, message, isIncoming = true) {
  const stmt = db.prepare(`
    UPDATE contacts
    SET last_message = ?,
        last_message_at = datetime('now'),
        unread_count = CASE WHEN ? = 1 THEN unread_count + 1 ELSE unread_count END,
        updated_at = datetime('now')
    WHERE jid = ?
  `);
  stmt.run(sanitizeText(message), isIncoming ? 1 : 0, jid);
}

function resetUnread(jid) {
  db.prepare('UPDATE contacts SET unread_count = 0, updated_at = datetime(\'now\') WHERE jid = ?').run(jid);
}

function setHandoff(jid, enabled) {
  db.prepare('UPDATE contacts SET human_handoff = ?, updated_at = datetime(\'now\') WHERE jid = ?').run(enabled ? 1 : 0, jid);
  return db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid);
}

function saveMessage({ contact_jid, direction, message_type, body, raw_json = null, from_bot = false, rule_id = null }) {
  const stmt = db.prepare(`
    INSERT INTO messages (contact_jid, direction, message_type, body, raw_json, from_bot, rule_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(contact_jid, direction, message_type, body || '', raw_json ? JSON.stringify(raw_json) : null, from_bot ? 1 : 0, rule_id);
}

function getConversations(search = '') {
  let sql = `
    SELECT c.*,
           m.current_intent,
           m.missing_fields_json,
           m.emotional_tone,
           m.conversation_summary
    FROM contacts c
    LEFT JOIN conversation_memory m ON m.contact_jid = c.jid
  `;
  const args = [];
  if (search) {
    sql += ' WHERE c.jid LIKE ? OR c.display_name LIKE ? OR c.phone LIKE ?';
    args.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY datetime(c.last_message_at) DESC, c.id DESC';
  return db.prepare(sql).all(...args);
}

function getMessages(jid, limit = 200) {
  return db.prepare('SELECT * FROM messages WHERE contact_jid = ? ORDER BY id DESC LIMIT ?').all(jid, limit).reverse();
}

function countAutoRepliesLastHour(jid) {
  const row = db
    .prepare(`
      SELECT COUNT(*) as count
      FROM messages
      WHERE contact_jid = ?
        AND direction = 'outgoing'
        AND from_bot = 1
        AND datetime(created_at) >= datetime('now', '-1 hour')
    `)
    .get(jid);
  return row.count;
}

module.exports = {
  ensureContact,
  updateContactMessage,
  resetUnread,
  setHandoff,
  saveMessage,
  getConversations,
  getMessages,
  countAutoRepliesLastHour
};
