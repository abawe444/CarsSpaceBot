const express = require('express');
const { testProviderConnection, getPublicProviderSettings, updateProviderSettings } = require('../services/aiProviderService');
const { updateSettings } = require('../services/settingsService');

const router = express.Router();

router.get('/provider', (req, res) => {
  res.json({ success: true, data: getPublicProviderSettings() });
});

router.put('/provider', (req, res) => {
  const row = updateProviderSettings({
    provider: req.body?.provider,
    apiKey: req.body?.apiKey ?? req.body?.api_key ?? req.body?.api_key_raw ?? req.body?.openaiApiKey ?? req.body?.providerApiKey,
    baseUrl: req.body?.baseUrl,
    model: req.body?.model,
    temperature: req.body?.temperature,
    maxOutputTokens: req.body?.maxOutputTokens,
    aiMode: req.body?.aiMode,
    enabled: req.body?.enabled
  });

  updateSettings({
    ai_provider: row.provider,
    ai_base_url: row.base_url,
    ai_model: row.model,
    ai_temperature: row.temperature,
    ai_max_output_tokens: row.max_output_tokens,
    ai_mode: row.ai_mode
  });

  res.json({ success: true, data: row });
});

router.post('/provider/test', async (req, res) => {
  try {
    const apiKey = req.body?.apiKey
      ?? req.body?.api_key
      ?? req.body?.api_key_raw
      ?? req.body?.openaiApiKey
      ?? req.body?.providerApiKey
      ?? '';
    const useSavedKey = req.body?.useSavedKey === true || req.body?.useSavedKey === 'true';
    console.log('Provider test received:', {
      provider: req.body?.provider,
      baseUrl: req.body?.baseUrl ?? req.body?.base_url,
      model: req.body?.model,
      hasApiKey: Boolean(String(apiKey || '').trim()),
      useSavedKey,
      keySourceHint: (String(apiKey || '').trim() ? 'request' : 'saved')
    });

    const result = await testProviderConnection({
      provider: req.body?.provider,
      apiKey,
      baseUrl: req.body?.baseUrl ?? req.body?.base_url,
      model: req.body?.model,
      temperature: req.body?.temperature,
      maxOutputTokens: req.body?.maxOutputTokens,
      aiMode: req.body?.aiMode,
      useSavedKey
    });

    if (!result.success) {
      const error = new Error(result.data?.error || result.message || 'Provider test failed');
      error.response = {
        status: result.data?.responseStatus || 400,
        statusText: result.data?.responseStatusText || 'Provider Test Failed',
        data: result.data?.responseData || { error: result.data?.error || result.message }
      };
      error.providerMeta = result.data || {};
      throw error;
    }

    return res.json({
      success: true,
      message: 'تم الاتصال بمزود الذكاء بنجاح',
      data: result.data
    });
  } catch (error) {
    console.error('PROVIDER TEST ERROR:');
    console.error(error.response?.data || error.message);

    const status = Number(error.response?.status || 500);
    return res.status(status).json({
      success: false,
      ok: false,
      message: error.providerMeta?.error_ar || 'تعذر الاتصال بمزود الذكاء',
      data: {
        provider: error.providerMeta?.provider || req.body?.provider || null,
        model: error.providerMeta?.model || req.body?.model || null,
        keySource: error.providerMeta?.keySource || null,
        error: error.providerMeta?.error || error.message,
        error_ar: error.providerMeta?.error_ar || 'تعذر الاتصال بمزود الذكاء',
        responseData: error.providerMeta?.responseData || error.response?.data || null,
        responseStatus: error.providerMeta?.responseStatus || error.response?.status || null,
        responseStatusText: error.providerMeta?.responseStatusText || error.response?.statusText || null,
        status: error.providerMeta?.responseStatus || error.response?.status || null,
        statusText: error.providerMeta?.responseStatusText || error.response?.statusText || null,
        details: error.providerMeta?.responseData || error.response?.data || null
      }
    });
  }
});

module.exports = router;
