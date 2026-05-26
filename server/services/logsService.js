const { db } = require('../database/db');

function addLog(level, source, message, meta = null) {
  const stmt = db.prepare(`
    INSERT INTO logs (level, source, message, meta_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(level, source, message, meta ? JSON.stringify(meta) : null);
}

function getLogs({ search = '', level = '' } = {}) {
  let sql = 'SELECT * FROM logs WHERE 1=1';
  const args = [];
  if (search) {
    sql += ' AND message LIKE ?';
    args.push(`%${search}%`);
  }
  if (level) {
    sql += ' AND level = ?';
    args.push(level);
  }
  sql += ' ORDER BY id DESC LIMIT 1000';
  return db.prepare(sql).all(...args);
}

function clearLogs() {
  db.prepare('DELETE FROM logs').run();
}

module.exports = {
  addLog,
  getLogs,
  clearLogs
};