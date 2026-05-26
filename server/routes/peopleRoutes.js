const express = require('express');
const {
  PERMISSION_KEYS,
  PERMISSION_LABELS_AR,
  getRoleTemplates,
  listPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePerson,
  setPersonPermissions,
  getPersonPermissionsMap,
  testIdentity,
  importPeople,
  listPersonAudit
} = require('../services/peopleService');

const router = express.Router();

router.get('/roles', (req, res) => {
  res.json({
    success: true,
    data: {
      roles: getRoleTemplates(),
      permissionKeys: PERMISSION_KEYS,
      permissionLabels: PERMISSION_LABELS_AR
    }
  });
});

router.get('/people', (req, res) => {
  const data = listPeople({
    search: req.query.search || '',
    role: req.query.role || '',
    enabled: req.query.enabled,
    vip: req.query.vip
  });
  res.json({ success: true, data });
});

router.post('/people', (req, res) => {
  try {
    const row = createPerson(req.body || {}, req.body?.actor_jid || 'admin');
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/people/test-identity', (req, res) => {
  const result = testIdentity(req.body?.input || req.body?.phone || req.body?.jid || '');
  res.json({ success: true, data: result });
});

router.post('/people/import', (req, res) => {
  const rows = importPeople(Array.isArray(req.body?.people) ? req.body.people : [], req.body?.actor_jid || 'admin');
  res.json({ success: true, data: rows });
});

router.get('/people/audit', (req, res) => {
  const data = listPersonAudit(Number(req.query.limit || 120));
  res.json({ success: true, data });
});

router.get('/people/:id', (req, res) => {
  const row = getPersonById(Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, error: 'Person not found' });
  res.json({ success: true, data: row });
});

router.put('/people/:id', (req, res) => {
  try {
    const row = updatePerson(Number(req.params.id), req.body || {}, req.body?.actor_jid || 'admin');
    if (!row) return res.status(404).json({ success: false, error: 'Person not found' });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/people/:id', (req, res) => {
  const ok = deletePerson(Number(req.params.id), req.body?.actor_jid || 'admin');
  if (!ok) return res.status(404).json({ success: false, error: 'Person not found' });
  res.json({ success: true });
});

router.post('/people/:id/permissions', (req, res) => {
  const personId = Number(req.params.id);
  const person = getPersonById(personId);
  if (!person) return res.status(404).json({ success: false, error: 'Person not found' });

  setPersonPermissions(personId, req.body?.permissions || {});
  const updated = updatePerson(personId, {
    interaction_policy: req.body?.interaction_policy || undefined
  }, req.body?.actor_jid || 'admin');

  res.json({
    success: true,
    data: {
      permissions: getPersonPermissionsMap(personId),
      person: updated
    }
  });
});

module.exports = router;
