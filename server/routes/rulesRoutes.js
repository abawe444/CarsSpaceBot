const express = require('express');
const {
  getRules,
  createRule,
  updateRule,
  deleteRule,
  getEnabledRules,
  findMatchedRule
} = require('../services/rulesEngine');
const { getSettings } = require('../services/settingsService');

const router = express.Router();

router.get('/rules', (req, res) => {
  res.json({ success: true, data: getRules() });
});

router.post('/rules', (req, res) => {
  const item = createRule(req.body || {});
  res.json({ success: true, data: item });
});

router.put('/rules/:id', (req, res) => {
  const item = updateRule(Number(req.params.id), req.body || {});
  if (!item) return res.status(404).json({ success: false, error: 'Rule not found' });
  res.json({ success: true, data: item });
});

router.delete('/rules/:id', (req, res) => {
  deleteRule(Number(req.params.id));
  res.json({ success: true });
});

router.post('/rules/test', (req, res) => {
  const message = req.body?.message || '';
  const rulesEnabled = getSettings().rules_enabled;
  if (!rulesEnabled) {
    return res.json({ success: true, data: { matched: null, reply: 'القواعد معطلة حاليًا' } });
  }
  const rule = findMatchedRule(message, getEnabledRules());
  if (rule) {
    return res.json({
      success: true,
      data: {
        matched: {
          id: rule.id,
          name: rule.name,
          category: rule.category,
          handoff_on_match: Boolean(rule.handoff_on_match),
          force_rule: Boolean(rule.force_rule)
        },
        reply: rule.reply
      }
    });
  }
  return res.json({ success: true, data: { matched: null, reply: getSettings().fallback_reply } });
});

module.exports = router;
