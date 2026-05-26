const { db } = require('../database/db');
const { normalizeArabic, sanitizeText } = require('./sanitizer');

function getRules() {
  return db.prepare('SELECT * FROM rules ORDER BY priority ASC, id ASC').all();
}

function getEnabledRules() {
  return db.prepare('SELECT * FROM rules WHERE enabled = 1 ORDER BY priority ASC, id ASC').all();
}

function createRule(data) {
  const stmt = db.prepare(`
    INSERT INTO rules (name, enabled, priority, match_type, keywords, reply, delay_seconds, handoff_on_match, force_rule, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  const info = stmt.run(
    sanitizeText(data.name || 'قاعدة جديدة'),
    data.enabled ? 1 : 0,
    Number(data.priority || 100),
    sanitizeText(data.match_type || 'contains'),
    sanitizeText(data.keywords || ''),
    sanitizeText(data.reply || ''),
    Number(data.delay_seconds || 0),
    data.handoff_on_match ? 1 : 0,
    data.force_rule ? 1 : 0,
    sanitizeText(data.category || 'عام')
  );
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(info.lastInsertRowid);
}

function updateRule(id, data) {
  const current = db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
  if (!current) return null;
  const next = { ...current, ...data };
  db.prepare(`
    UPDATE rules
    SET name = ?, enabled = ?, priority = ?, match_type = ?, keywords = ?, reply = ?, delay_seconds = ?, handoff_on_match = ?, force_rule = ?, category = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    sanitizeText(next.name),
    next.enabled ? 1 : 0,
    Number(next.priority),
    sanitizeText(next.match_type),
    sanitizeText(next.keywords),
    sanitizeText(next.reply),
    Number(next.delay_seconds || 0),
    next.handoff_on_match ? 1 : 0,
    next.force_rule ? 1 : 0,
    sanitizeText(next.category || 'عام'),
    id
  );
  return db.prepare('SELECT * FROM rules WHERE id = ?').get(id);
}

function deleteRule(id) {
  return db.prepare('DELETE FROM rules WHERE id = ?').run(id);
}

function splitKeywords(raw) {
  return String(raw || '')
    .split(',')
    .map((k) => sanitizeText(k))
    .filter(Boolean);
}

function isMatch(rule, text) {
  const cleaned = sanitizeText(text);
  const normalizedText = normalizeArabic(cleaned);
  const keywords = splitKeywords(rule.keywords);

  if (rule.match_type === 'wildcard' || keywords.includes('*')) return true;

  if (rule.match_type === 'regex') {
    return keywords.some((k) => {
      try {
        return new RegExp(k, 'i').test(cleaned);
      } catch {
        return false;
      }
    });
  }

  return keywords.some((keyword) => {
    const value = normalizeArabic(keyword);
    if (!value) return false;
    if (rule.match_type === 'equals') return normalizedText === value;
    if (rule.match_type === 'starts_with') return normalizedText.startsWith(value);
    return normalizedText.includes(value);
  });
}

function findMatchedRule(text, rules = getEnabledRules()) {
  for (const rule of rules) {
    if (isMatch(rule, text)) {
      return rule;
    }
  }
  return null;
}

module.exports = {
  getRules,
  getEnabledRules,
  createRule,
  updateRule,
  deleteRule,
  findMatchedRule,
  isMatch
};
