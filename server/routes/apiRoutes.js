const express = require('express');
const { db } = require('../database/db');
const { getStatus } = require('../baileys/whatsappClient');
const { trackEvent } = require('../services/replyEngine');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ success: true, data: getStatus() });
});

router.get('/dashboard', (req, res) => {
  const today = "date('now', 'localtime')";
  const conversationsToday = db.prepare(`SELECT COUNT(*) as count FROM contacts WHERE date(updated_at, 'localtime') = ${today}`).get().count;
  const incomingToday = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE direction='incoming' AND date(created_at, 'localtime') = ${today}`).get().count;
  const autoRepliesToday = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE direction='outgoing' AND from_bot=1 AND date(created_at, 'localtime') = ${today}`).get().count;
  const handoffCount = db.prepare('SELECT COUNT(*) as count FROM contacts WHERE human_handoff = 1').get().count;
  const authorizedPeopleTotal = db.prepare('SELECT COUNT(*) as count FROM people').get().count;
  const authorizedPeopleActive = db.prepare('SELECT COUNT(*) as count FROM people WHERE enabled = 1').get().count;
  const vipPeopleCount = db.prepare('SELECT COUNT(*) as count FROM people WHERE enabled = 1 AND is_vip = 1').get().count;
  const groupAccessEnabledCount = db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM people p
    JOIN person_permissions pp ON pp.person_id = p.id
    WHERE p.enabled = 1
      AND p.group_reply_enabled = 1
      AND pp.permission_key = 'groups.ask_reports'
      AND pp.allowed = 1
  `).get().count;
  const lastRecognized = db.prepare(`
    SELECT p.full_name, p.role_label, a.created_at
    FROM person_audit_logs a
    LEFT JOIN people p ON p.id = a.person_id
    WHERE a.action = 'identity_recognized'
    ORDER BY a.id DESC
    LIMIT 1
  `).get();
  const lastActivity = db.prepare('SELECT created_at FROM messages ORDER BY id DESC LIMIT 1').get();
  const recentMessages = db.prepare('SELECT contact_jid, body, direction, created_at FROM messages ORDER BY id DESC LIMIT 8').all();

  res.json({
    success: true,
    data: {
      status: getStatus(),
      cards: {
        conversationsToday,
        incomingToday,
        autoRepliesToday,
        handoffCount,
        lastActivity: lastActivity?.created_at || null,
        authorizedPeopleTotal,
        authorizedPeopleActive,
        vipPeopleCount,
        groupAccessEnabledCount,
        lastRecognizedSpeaker: lastRecognized ? `${lastRecognized.full_name || '-'} (${lastRecognized.role_label || '-'})` : 'لا يوجد'
      },
      recentMessages
    }
  });
});

router.get('/analytics', (req, res) => {
  const todayFilter = "date(created_at, 'localtime') = date('now', 'localtime')";
  const messagesToday = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE direction='incoming' AND ${todayFilter}`).get().count;
  const repliesToday = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE direction='outgoing' AND from_bot=1 AND ${todayFilter}`).get().count;
  const handoffCount = db.prepare("SELECT COUNT(*) as count FROM analytics_events WHERE event_type='handoff_triggered' AND date(created_at, 'localtime') = date('now', 'localtime')").get().count;

  const mostMatchedRules = db.prepare(`
    SELECT r.name, COUNT(a.id) as count
    FROM analytics_events a
    LEFT JOIN rules r ON r.id = a.rule_id
    WHERE a.event_type = 'rule_matched'
    GROUP BY a.rule_id
    ORDER BY count DESC
    LIMIT 6
  `).all();

  const topContacts = db.prepare(`
    SELECT contact_jid, COUNT(*) as count
    FROM messages
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
    GROUP BY contact_jid
    ORDER BY count DESC
    LIMIT 6
  `).all();

  const hourly = db.prepare(`
    SELECT strftime('%H', created_at, 'localtime') as hour, COUNT(*) as count
    FROM messages
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
    GROUP BY hour
    ORDER BY hour ASC
  `).all();

  const topIntents = db.prepare(`
    SELECT current_intent as intent, COUNT(*) as count
    FROM conversation_memory
    WHERE current_intent IS NOT NULL
    GROUP BY current_intent
    ORDER BY count DESC
    LIMIT 8
  `).all();

  const mediaStats = {
    voice: db.prepare("SELECT COUNT(*) as count FROM media_messages WHERE media_type='voice'").get().count,
    image: db.prepare("SELECT COUNT(*) as count FROM media_messages WHERE media_type='image'").get().count,
    failed: db.prepare("SELECT COUNT(*) as count FROM media_messages WHERE processing_status='failed'").get().count
  };

  const groupReportsCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM report_logs
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
  `).get().count;

  res.json({
    success: true,
    data: {
      messagesToday,
      repliesToday,
      handoffCount,
      mostMatchedRules,
      topContacts,
      hourly,
      topIntents,
      mediaStats,
      groupReportsCount
    }
  });
});

router.post('/session/reset', async (req, res) => {
  try {
    const { resetSession } = require('../baileys/whatsappClient');
    await resetSession();
    trackEvent('session_reset', null, null, { by: 'admin' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
