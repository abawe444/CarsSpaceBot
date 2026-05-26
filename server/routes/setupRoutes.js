const express = require('express');
const { getStatus } = require('../baileys/whatsappClient');
const { getSetupState, completeSetup, resetSetup } = require('../services/setupService');
const { getCompanyProfile, saveCompanyProfile } = require('../services/companyProfileService');
const { getProviderSettings, updateProviderSettings } = require('../services/aiProviderService');
const { getSettings, updateSettings } = require('../services/settingsService');

const router = express.Router();

router.get('/setup/state', (req, res) => {
  res.json({ success: true, data: getSetupState() });
});

router.get('/setup/data', (req, res) => {
  res.json({
    success: true,
    data: {
      setup: getSetupState(),
      company: getCompanyProfile(),
      provider: getProviderSettings(),
      settings: getSettings(),
      whatsapp: getStatus()
    }
  });
});

router.post('/setup/company', (req, res) => {
  const profile = saveCompanyProfile({
    company_name: req.body?.company_name,
    contact_number: req.body?.contact_number,
    business_description: req.body?.business_description,
    general_manager: req.body?.general_manager,
    company_responsible: req.body?.company_responsible,
    center_manager: req.body?.center_manager
  });
  res.json({ success: true, data: profile });
});

router.post('/setup/locations', (req, res) => {
  const profile = saveCompanyProfile({
    company_location_title: req.body?.company_location_title,
    company_location_url: req.body?.company_location_url,
    center_location_title: req.body?.center_location_title,
    center_location_url: req.body?.center_location_url
  });
  res.json({ success: true, data: profile });
});

router.post('/setup/provider', (req, res) => {
  const provider = updateProviderSettings({
    provider: req.body?.provider,
    apiKey: req.body?.apiKey ?? req.body?.api_key ?? req.body?.api_key_raw ?? req.body?.openaiApiKey ?? req.body?.providerApiKey,
    baseUrl: req.body?.baseUrl ?? req.body?.base_url,
    model: req.body?.model,
    temperature: req.body?.temperature,
    maxOutputTokens: req.body?.maxOutputTokens,
    aiMode: req.body?.aiMode,
    enabled: req.body?.enabled === undefined ? true : Boolean(req.body?.enabled)
  });

  updateSettings({
    ai_provider: provider.provider,
    ai_base_url: provider.base_url,
    ai_model: provider.model,
    ai_temperature: provider.temperature,
    ai_max_output_tokens: provider.max_output_tokens,
    ai_mode: provider.ai_mode
  });

  res.json({ success: true, data: provider });
});

router.post('/setup/assistant', (req, res) => {
  const updated = updateSettings({
    assistant_name: req.body?.assistant_name,
    assistant_tone: req.body?.assistant_tone,
    assistant_prompt: req.body?.assistant_prompt
  });
  res.json({ success: true, data: updated });
});

router.post('/setup/complete', (req, res) => {
  const state = completeSetup();
  res.json({ success: true, data: state });
});

router.post('/setup/reset', (req, res) => {
  const state = resetSetup();
  res.json({ success: true, data: state });
});

module.exports = router;
