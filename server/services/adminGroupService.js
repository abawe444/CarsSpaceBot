const { db } = require('../database/db');
const { getSettings } = require('./settingsService');
const { normalizePhone } = require('./peopleService');

function normalizeGroupJid(input = '') {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.endsWith('@g.us')) return raw;
  if (raw.startsWith('g.us@')) {
    return `${raw.slice(5)}@g.us`;
  }
  if (raw.includes('@g.us')) {
    const id = raw.split('@g.us')[0].replace(/^g\.us@/i, '');
    return `${id}@g.us`;
  }
  return raw;
}

function listAdminGroups() {
  return db.prepare('SELECT * FROM admin_groups ORDER BY enabled DESC, updated_at DESC').all();
}

function getAdminGroup(groupJid) {
  const normalized = normalizeGroupJid(groupJid);
  return db.prepare('SELECT * FROM admin_groups WHERE group_jid = ?').get(normalized);
}

function upsertAdminGroup(payload = {}) {
  const groupJid = normalizeGroupJid(payload.group_jid || payload.groupJid || '');
  if (!groupJid) throw new Error('group_jid is required');
  const current = getAdminGroup(groupJid);

  const data = {
    group_jid: groupJid,
    group_name: payload.group_name || payload.groupName || '',
    enabled: payload.enabled ? 1 : 0,
    report_enabled: payload.report_enabled === undefined ? 1 : (payload.report_enabled ? 1 : 0),
    allow_ai_answers: payload.allow_ai_answers === undefined ? 1 : (payload.allow_ai_answers ? 1 : 0),
    reply_only_when_mentioned: payload.reply_only_when_mentioned === undefined ? 1 : (payload.reply_only_when_mentioned ? 1 : 0),
    allow_daily_summary: payload.allow_daily_summary ? 1 : 0,
    daily_report_time: payload.daily_report_time || '21:00'
  };

  if (current) {
    db.prepare(`
      UPDATE admin_groups
      SET group_name = ?, enabled = ?, report_enabled = ?, allow_ai_answers = ?,
          reply_only_when_mentioned = ?, allow_daily_summary = ?, daily_report_time = ?, updated_at = datetime('now')
      WHERE group_jid = ?
    `).run(
      data.group_name,
      data.enabled,
      data.report_enabled,
      data.allow_ai_answers,
      data.reply_only_when_mentioned,
      data.allow_daily_summary,
      data.daily_report_time,
      groupJid
    );
  } else {
    db.prepare(`
      INSERT INTO admin_groups (
        group_jid, group_name, enabled, report_enabled, allow_ai_answers,
        reply_only_when_mentioned, allow_daily_summary, daily_report_time, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      data.group_jid,
      data.group_name,
      data.enabled,
      data.report_enabled,
      data.allow_ai_answers,
      data.reply_only_when_mentioned,
      data.allow_daily_summary,
      data.daily_report_time
    );
  }

  return getAdminGroup(groupJid);
}

function setAdminGroupMembers(groupJid, members = []) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  const tx = db.transaction(() => {
    members.forEach((m) => {
      db.prepare(`
        INSERT INTO admin_group_members (group_jid, participant_jid, display_name, role, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        ON CONFLICT(group_jid, participant_jid)
        DO UPDATE SET
          display_name = excluded.display_name,
          role = excluded.role,
          enabled = 1,
          updated_at = datetime('now')
      `).run(normalizedGroupJid, m.participant_jid, m.display_name || '', m.role || 'viewer');
    });
  });
  tx();
}

function listAdminGroupMembers(groupJid) {
  return db.prepare('SELECT * FROM admin_group_members WHERE group_jid = ? ORDER BY role DESC, display_name ASC').all(normalizeGroupJid(groupJid));
}

function updateGroupMemberRole(groupJid, participantJid, role, enabled = true) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  db.prepare(`
    INSERT INTO admin_group_members (group_jid, participant_jid, display_name, role, enabled, created_at, updated_at)
    VALUES (?, ?, '', ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(group_jid, participant_jid)
    DO UPDATE SET role = excluded.role, enabled = excluded.enabled, updated_at = datetime('now')
  `).run(normalizedGroupJid, participantJid, role || 'viewer', enabled ? 1 : 0);
}

function isAuthorizedAdminMember(groupJid, participantJid) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  const anyRows = db.prepare('SELECT COUNT(*) as c FROM admin_group_members WHERE group_jid = ?').get(normalizedGroupJid).c;
  if (!anyRows) return true;
  const row = db
    .prepare('SELECT * FROM admin_group_members WHERE group_jid = ? AND participant_jid = ? AND enabled = 1')
    .get(normalizedGroupJid, participantJid);
  if (!row) return false;
  return ['owner', 'admin', 'manager'].includes(row.role);
}

function shouldRespondInGroup({ groupJid, isMentioned, hasCommandOrReportIntent, bypassAuthorization = false }) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  const settings = getSettings();
  if (bypassAuthorization) return { allowed: true, group: getAdminGroup(normalizedGroupJid), reason: 'owner_bypass' };
  if (!settings.enable_groups || !settings.enable_admin_group_mode) return { allowed: false, reason: 'group_mode_disabled' };

  const group = getAdminGroup(normalizedGroupJid);
  if (!group || !group.enabled) {
    if (settings.reply_to_random_groups) return { allowed: true, group: null };
    return { allowed: false, reason: 'not_authorized_group' };
  }

  const allowReportCommands = settings.allow_report_commands_in_admin_groups;
  if (group.reply_only_when_mentioned && settings.reply_only_when_mentioned && !isMentioned && !(allowReportCommands && hasCommandOrReportIntent)) {
    return { allowed: false, reason: 'not_mentioned' };
  }

  return { allowed: true, group };
}

function markGroupMessageSeen({
  groupJid,
  groupName = '',
  participantJid = '',
  participantPhoneHint = '',
  messagePreview = '',
  participantsCount = 0
}) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  if (!normalizedGroupJid || !normalizedGroupJid.endsWith('@g.us')) return null;
  const settings = getSettings();
  const current = getAdminGroup(normalizedGroupJid);
  const enableByDemo = settings.auto_enable_first_group_for_demo && listAdminGroups().filter((g) => g.enabled).length === 0;

  if (!current) {
    db.prepare(`
      INSERT INTO admin_groups (
        group_jid, group_name, enabled, report_enabled, allow_ai_answers, reply_only_when_mentioned,
        allow_daily_summary, daily_report_time, last_message_at, last_message_preview, participants_count, created_at, updated_at
      )
      VALUES (?, ?, ?, 1, 1, ?, 0, '21:00', datetime('now'), ?, ?, datetime('now'), datetime('now'))
    `).run(
      normalizedGroupJid,
      groupName || groupJid,
      enableByDemo ? 1 : 0,
      settings.reply_only_when_mentioned ? 1 : 0,
      String(messagePreview || '').slice(0, 500),
      Number(participantsCount || 0)
    );
  } else {
    db.prepare(`
      UPDATE admin_groups
      SET group_name = COALESCE(NULLIF(?, ''), group_name),
          last_message_at = datetime('now'),
          last_message_preview = ?,
          participants_count = CASE WHEN ? > 0 THEN ? ELSE participants_count END,
          updated_at = datetime('now')
      WHERE group_jid = ?
    `).run(
      groupName || '',
      String(messagePreview || '').slice(0, 500),
      Number(participantsCount || 0),
      Number(participantsCount || 0),
      normalizedGroupJid
    );
  }

  if (participantJid) {
    const normalized = normalizePhone(participantPhoneHint || participantJid.split('@')[0].split(':')[0] || '');
    db.prepare(`
      INSERT INTO unknown_group_participants (group_jid, participant_jid, normalized_phone, last_message_at, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      ON CONFLICT(group_jid, participant_jid)
      DO UPDATE SET normalized_phone = COALESCE(excluded.normalized_phone, unknown_group_participants.normalized_phone),
                    last_message_at = datetime('now'),
                    updated_at = datetime('now')
    `).run(normalizedGroupJid, participantJid, normalized || null);
  }

  return getAdminGroup(normalizedGroupJid);
}

function saveReportLog({ groupJid, requestedBy, reportType, question, answer }) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  db.prepare(`
    INSERT INTO report_logs (group_jid, requested_by, report_type, question, answer, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(normalizedGroupJid, requestedBy || null, reportType || null, question || null, answer || null);
}

function listReportLogs(limit = 50) {
  return db.prepare('SELECT * FROM report_logs ORDER BY id DESC LIMIT ?').all(Number(limit || 50));
}

function listUnknownGroupParticipants(groupJid) {
  const normalizedGroupJid = normalizeGroupJid(groupJid);
  return db.prepare(`
    SELECT *
    FROM unknown_group_participants
    WHERE group_jid = ?
    ORDER BY datetime(last_message_at) DESC, id DESC
  `).all(normalizedGroupJid);
}

module.exports = {
  listAdminGroups,
  getAdminGroup,
  upsertAdminGroup,
  normalizeGroupJid,
  setAdminGroupMembers,
  listAdminGroupMembers,
  updateGroupMemberRole,
  isAuthorizedAdminMember,
  shouldRespondInGroup,
  markGroupMessageSeen,
  saveReportLog,
  listReportLogs,
  listUnknownGroupParticipants
};
