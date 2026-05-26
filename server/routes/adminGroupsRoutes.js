const express = require('express');
const {
  listAdminGroups,
  upsertAdminGroup,
  listAdminGroupMembers,
  updateGroupMemberRole,
  listReportLogs,
  setAdminGroupMembers,
  listUnknownGroupParticipants,
  normalizeGroupJid
} = require('../services/adminGroupService');
const { listGroups } = require('../baileys/whatsappClient');
const { getPersonByWhatsAppJid, normalizeJid } = require('../services/peopleService');

const router = express.Router();

router.get('/admin-groups', async (req, res) => {
  const groups = listAdminGroups();
  let detected = [];
  try {
    detected = await listGroups();
    detected.forEach((g) => {
      const members = (g.participants || []).map((p) => ({
        participant_jid: p.id,
        display_name: p.id.split('@')[0],
        role: p.admin === 'superadmin' ? 'owner' : p.admin ? 'admin' : 'viewer'
      }));
      if (members.length) {
        setAdminGroupMembers(g.groupJid, members);
      }
    });
  } catch {
    detected = [];
  }

  const detectedWithIdentity = detected.map((g) => {
    const participants = (g.participants || []).map((p) => {
      const person = getPersonByWhatsAppJid(p.id);
      return {
        ...p,
        normalized_phone: normalizeJid(p.id),
        known_person: person
          ? {
              id: person.id,
              full_name: person.full_name,
              role_label: person.role_label,
              enabled: Boolean(person.enabled)
            }
          : null
      };
    });

    return {
      ...g,
      participants,
      unknownParticipantsCount: participants.filter((p) => !p.known_person).length,
      knownParticipantsCount: participants.filter((p) => p.known_person).length
    };
  });

  const groupsWithUnknown = groups.map((g) => ({
    ...g,
    unknown_participants: listUnknownGroupParticipants(g.group_jid)
  }));

  res.json({ success: true, data: { groups: groupsWithUnknown, detected: detectedWithIdentity } });
});

router.post('/admin-groups', (req, res) => {
  try {
    const row = upsertAdminGroup(req.body || {});
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/admin-groups/:groupJid/members', (req, res) => {
  const groupJid = normalizeGroupJid(decodeURIComponent(req.params.groupJid));
  res.json({ success: true, data: listAdminGroupMembers(groupJid) });
});

router.put('/admin-groups/:groupJid/members/:participantJid', (req, res) => {
  const groupJid = normalizeGroupJid(decodeURIComponent(req.params.groupJid));
  const participantJid = decodeURIComponent(req.params.participantJid);
  updateGroupMemberRole(groupJid, participantJid, req.body?.role || 'viewer', req.body?.enabled !== false);
  res.json({ success: true });
});

router.get('/admin-reports/logs', (req, res) => {
  res.json({ success: true, data: listReportLogs(Number(req.query.limit || 80)) });
});

module.exports = router;
