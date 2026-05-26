const express = require('express');
const { getLogs, clearLogs } = require('../services/logsService');

const router = express.Router();

router.get('/logs', (req, res) => {
  const logs = getLogs({ search: req.query.search || '', level: req.query.level || '' });
  res.json({ success: true, data: logs });
});

router.delete('/logs', (req, res) => {
  clearLogs();
  res.json({ success: true });
});

module.exports = router;