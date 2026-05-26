const { getProviderSettingsWithSecret, getProviderSettings, saveProviderSettings, getProviderDefaults } = require('./aiProviderSettingsService');
const { sendOpenAICompatibleRequest } = require('./openaiCompatibleService');
const { addLog } = require('./logsService');

function providerSourceName(provider) {
  if (provider === 'custom_openai_compatible') return 'custom';
  return provider;
}

function translateProviderError(result = {}) {
  const status = Number(result.responseStatus || 0);
  const raw = String(result.error || '').toLowerCase();
  const responseRaw = JSON.stringify(result.responseData || {}).toLowerCase();

  if (status === 401 || raw.includes('invalid api key') || raw.includes('incorrect api key') || raw.includes('user not found')) {
    return 'مفتاح API غير صالح أو لا يخص هذا المزود';
  }
  if (status === 404 || raw.includes('model_not_found') || raw.includes('not found')) {
    return 'النموذج غير موجود';
  }
  if (status === 429 || raw.includes('insufficient_quota') || raw.includes('quota') || raw.includes('rate limit')) {
    return 'انتهى الرصيد أو الحد المسموح';
  }
  if (raw.includes('base url') || raw.includes('invalid url') || raw.includes('failed to parse url')) {
    return 'Base URL غير صحيح';
  }
  if (raw.includes('abort') || raw.includes('timeout') || raw.includes('timed out')) {
    return 'انتهت مهلة الاتصال بالمزود';
  }
  if (raw.includes('fetch failed') || raw.includes('network') || raw.includes('econnrefused') || raw.includes('enotfound')) {
    return 'خطأ شبكة أو فشل الاتصال بالمزود';
  }
  if (responseRaw.includes('invalid_api_key')) {
    return 'مفتاح API غير صالح';
  }
  if (responseRaw.includes('model_not_found')) {
    return 'النموذج غير موجود';
  }
  return 'فشل الاتصال بـ OpenAI أو المزود المتوافق';
}

function resolveEffectiveConfig(overrides = null) {
  const saved = getProviderSettingsWithSecret();
  if (overrides) {
    const provider = overrides.provider || saved.provider || 'rules_only';
    const defaults = getProviderDefaults(provider);
    const requestApiKey = overrides.apiKey
      ?? overrides.api_key
      ?? overrides.api_key_raw
      ?? overrides.openaiApiKey
      ?? overrides.providerApiKey;
    const useSavedKey = overrides.useSavedKey === true || overrides.useSavedKey === 'true';
    const normalizedRequestKey = String(requestApiKey || '').trim();
    const requestKeyLooksMasked = /\*{3,}/.test(normalizedRequestKey);
    const savedKey = String(saved.api_key || '').trim();
    const fromSaved = (!normalizedRequestKey || requestKeyLooksMasked || useSavedKey);
    const effectiveKey = fromSaved
      ? savedKey
      : normalizedRequestKey;

    return {
      provider,
      api_key: effectiveKey,
      base_url: String(overrides.baseUrl ?? overrides.base_url ?? saved.base_url ?? defaults.base_url ?? '').trim(),
      model: String(overrides.model ?? saved.model ?? defaults.model ?? '').trim(),
      temperature: Number(overrides.temperature ?? saved.temperature ?? 0.3),
      max_output_tokens: Number(overrides.maxOutputTokens ?? overrides.max_output_tokens ?? saved.max_output_tokens ?? 1200),
      ai_mode: String(overrides.aiMode || overrides.ai_mode || saved.ai_mode || 'ai_first'),
      enabled: true,
      useSavedKey,
      keySource: fromSaved ? 'saved' : 'request'
    };
  }

  const defaults = getProviderDefaults(saved.provider);
  return {
    ...saved,
    base_url: saved.base_url || defaults.base_url || '',
    model: saved.model || defaults.model || ''
  };
}

async function runProviderRequest({ systemPrompt, userMessage, messages = null, config }) {
  if (config.provider === 'rules_only') {
    return {
      ok: false,
      provider: 'rules_only',
      model: '',
      error: 'rules_only'
    };
  }

  if (!config.api_key) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: 'API Key غير موجود'
    };
  }

  if (!config.model) {
    return {
      ok: false,
      provider: config.provider,
      model: '',
      error: 'اسم النموذج غير محدد'
    };
  }

  if (!config.base_url) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: 'Base URL غير محدد'
    };
  }

  return sendOpenAICompatibleRequest({
    provider: config.provider,
    apiKey: config.api_key,
    baseUrl: config.base_url,
    model: config.model,
    systemPrompt,
    userMessage,
    messages,
    temperature: config.temperature,
    maxOutputTokens: config.max_output_tokens
  });
}

async function testProviderConnection(payload = {}) {
  const config = resolveEffectiveConfig(payload);
  console.log('Provider test received:', {
    provider: config.provider,
    baseUrl: config.base_url,
    model: config.model,
    hasApiKey: Boolean(config.api_key),
    useSavedKey: Boolean(config.useSavedKey),
    keySource: config.keySource || 'saved'
  });

  let result;
  const baseUrlNormalized = String(config.base_url || '').toLowerCase();
  const isOpenRouter = config.provider === 'openrouter' || baseUrlNormalized.includes('openrouter.ai');

  if (config.provider === 'openai') {
    result = await runProviderRequest({
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Reply with the word جاهز',
      config: {
        ...config,
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_output_tokens: 50
      }
    });
  } else if (isOpenRouter) {
    result = await runProviderRequest({
      systemPrompt: 'You are a helpful assistant.',
      userMessage: 'Reply with the word جاهز',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Reply with the word جاهز' }
      ],
      config: {
        ...config,
        base_url: config.base_url || 'https://openrouter.ai/api/v1',
        model: config.model || 'openai/gpt-4o-mini',
        temperature: Number(config.temperature || 0.3),
        max_output_tokens: Number(config.max_output_tokens || 50)
      }
    });
  } else {
    result = await runProviderRequest({
      systemPrompt: 'أنت مساعد اختبار بسيط. رد بكلمة واحدة فقط.',
      userMessage: 'رد بكلمة: جاهز',
      config
    });
  }

  if (config.provider === 'rules_only') {
    return {
      success: true,
      message: 'تم الاتصال بمزود الذكاء بنجاح',
      data: {
        provider: 'rules_only',
        model: '',
        text: 'جاهز'
      }
    };
  }

  if (!result.ok) {
    const translated = translateProviderError(result);
    addLog('error', 'ai_provider', 'Provider test failed', {
      provider: config.provider,
      model: config.model,
      error: result.error,
      responseStatus: result.responseStatus,
      responseStatusText: result.responseStatusText
    });

    return {
      success: false,
      ok: false,
      message: translated,
      data: {
        provider: config.provider,
        model: config.model,
        keySource: config.keySource || 'saved',
        error: result.error,
        error_ar: translated,
        responseData: result.responseData || null,
        responseStatus: result.responseStatus || null,
        responseStatusText: result.responseStatusText || null,
        status: result.responseStatus || null,
        statusText: result.responseStatusText || null,
        details: result.responseData || null
      }
    };
  }

  addLog('info', 'ai_provider', 'Provider test success', {
    provider: config.provider,
    model: config.model
  });

  return {
    success: true,
    ok: true,
    message: 'تم الاتصال بمزود الذكاء بنجاح',
    data: {
      provider: config.provider,
      model: config.model,
      keySource: config.keySource || 'saved',
      text: result.text
    }
  };
}

async function generateAIReply({ userMessage, systemPrompt, messages = null }) {
  const config = resolveEffectiveConfig(null);
  if (!config.enabled) {
    return {
      ok: false,
      provider: config.provider,
      model: config.model,
      error: 'AI disabled'
    };
  }

  const result = await runProviderRequest({ systemPrompt, userMessage, messages, config });
  return {
    ...result,
    source: providerSourceName(config.provider)
  };
}

function getPublicProviderSettings() {
  return getProviderSettings();
}

function updateProviderSettings(payload = {}) {
  return saveProviderSettings({
    provider: payload.provider,
    api_key: payload.apiKey ?? payload.api_key ?? payload.api_key_raw ?? payload.openaiApiKey ?? payload.providerApiKey,
    base_url: payload.baseUrl ?? payload.base_url,
    model: payload.model,
    temperature: payload.temperature,
    max_output_tokens: payload.maxOutputTokens ?? payload.max_output_tokens,
    ai_mode: payload.aiMode ?? payload.ai_mode,
    enabled: payload.enabled
  });
}

module.exports = {
  testProviderConnection,
  generateAIReply,
  getProviderSettings: getPublicProviderSettings,
  getPublicProviderSettings,
  updateProviderSettings
};
