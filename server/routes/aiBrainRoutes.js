const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const {
  getKnowledgeEntries,
  createKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry
} = require('../services/knowledgeService');
const { buildAiTestReply } = require('../services/aiBrainService');
const { getPublicProviderSettings } = require('../services/aiProviderService');
const { getCompanyProfile, saveCompanyProfile } = require('../services/companyProfileService');

const router = express.Router();

router.get('/ai-brain', (req, res) => {
  res.json({
    success: true,
    data: {
      settings: getSettings(),
      company: getCompanyProfile(),
      provider: getPublicProviderSettings(),
      knowledgeEntries: getKnowledgeEntries({})
    }
  });
});

router.put('/ai-brain', (req, res) => {
  const payload = req.body || {};
  if (
    payload.company_name ||
    payload.contact_number ||
    payload.business_description ||
    payload.general_manager ||
    payload.company_responsible ||
    payload.center_manager ||
    payload.center_manager_current ||
    payload.center_manager_notes ||
    payload.company_location_title ||
    payload.company_location_url ||
    payload.center_location_title ||
    payload.center_location_url
  ) {
    saveCompanyProfile(payload);
  }
  const updated = updateSettings(payload, { scope: 'ai_brain' });
  res.json({ success: true, data: { settings: updated, company: getCompanyProfile() } });
});

router.post('/ai-brain/test', async (req, res) => {
  const message = String(req.body?.message || '');
  const result = await buildAiTestReply(message);
  res.json({ success: true, data: result });
});

router.get('/knowledge', (req, res) => {
  const data = getKnowledgeEntries({
    search: req.query.search || '',
    category: req.query.category || ''
  });
  res.json({ success: true, data });
});

router.post('/knowledge', (req, res) => {
  const row = createKnowledgeEntry(req.body || {});
  res.json({ success: true, data: row });
});

router.put('/knowledge/:id', (req, res) => {
  const row = updateKnowledgeEntry(Number(req.params.id), req.body || {});
  if (!row) return res.status(404).json({ success: false, error: 'Knowledge entry not found' });
  res.json({ success: true, data: row });
});

router.delete('/knowledge/:id', (req, res) => {
  deleteKnowledgeEntry(Number(req.params.id));
  res.json({ success: true });
});

module.exports = router;
