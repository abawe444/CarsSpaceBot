const { db } = require('../database/db');
const { sanitizeText } = require('./sanitizer');

function getKnowledgeEntries({ search = '', category = '' } = {}) {
  let sql = 'SELECT * FROM knowledge_entries WHERE 1=1';
  const args = [];
  if (search) {
    sql += ' AND (title LIKE ? OR content LIKE ?)';
    args.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ' AND category = ?';
    args.push(category);
  }
  sql += ' ORDER BY id DESC';
  return db.prepare(sql).all(...args);
}

function createKnowledgeEntry(payload = {}) {
  const stmt = db.prepare(`
    INSERT INTO knowledge_entries (title, category, content, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const info = stmt.run(
    sanitizeText(payload.title || 'إدخال جديد'),
    sanitizeText(payload.category || 'عام'),
    sanitizeText(payload.content || ''),
    payload.enabled === false ? 0 : 1
  );
  return db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(info.lastInsertRowid);
}

function updateKnowledgeEntry(id, payload = {}) {
  const current = db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id);
  if (!current) return null;
  const next = { ...current, ...payload };
  db.prepare(`
    UPDATE knowledge_entries
    SET title = ?, category = ?, content = ?, enabled = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    sanitizeText(next.title),
    sanitizeText(next.category),
    sanitizeText(next.content),
    next.enabled === false || next.enabled === 0 ? 0 : 1,
    id
  );
  return db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id);
}

function deleteKnowledgeEntry(id) {
  return db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(id);
}

module.exports = {
  getKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry
};