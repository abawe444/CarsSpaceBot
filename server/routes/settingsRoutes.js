const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const router = express.Router();

router.get('/settings', (req, res) => {
  res.json({ success: true, data: getSettings() });
});

router.put('/settings', (req, res) => {
  const updated = updateSettings(req.body || {}, { scope: 'general' });
  res.json({ success: true, data: updated });
});

module.exports = router;
