const { db } = require('../database/db');

function getSetupState() {
  return db.prepare('SELECT * FROM setup_state ORDER BY id ASC LIMIT 1').get();
}

function isSetupCompleted() {
  const state = getSetupState();
  return Boolean(state && state.completed);
}

function completeSetup() {
  const state = getSetupState();
  if (!state) {
    db.prepare(`
      INSERT INTO setup_state (completed, completed_at, created_at, updated_at)
      VALUES (1, datetime('now'), datetime('now'), datetime('now'))
    `).run();
    return getSetupState();
  }

  db.prepare(`
    UPDATE setup_state
    SET completed = 1,
        completed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(state.id);
  return getSetupState();
}

function resetSetup() {
  const state = getSetupState();
  if (!state) return null;
  db.prepare(`
    UPDATE setup_state
    SET completed = 0,
        completed_at = NULL,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(state.id);
  return getSetupState();
}

module.exports = {
  getSetupState,
  isSetupCompleted,
  completeSetup,
  resetSetup
};