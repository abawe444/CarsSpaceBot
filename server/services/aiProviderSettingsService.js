const { db } = require('../database/db');
const { encryptText, decryptText, maskApiKey } = require('./encryptionService');

const providerDefaults = {
  rules_only: { base_url: '', model: '' },
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  openrouter: { base_url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  deepseek: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  grok: { base_url: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  google: { base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  custom_openai_compatible: { base_url: '', model: '' }
};

function getProviderDefaults(provider) {
  return providerDefaults[provider] || providerDefaults.rules_only;
}

function getProviderSettingsRow() {
  return db.prepare('SELECT * FROM ai_provider_settings ORDER BY id ASC LIMIT 1').get();
}

function getProviderSettings() {
  const row = getProviderSettingsRow();
  if (!row) {
    return {
      provider: 'rules_only',
      api_key_masked: '',
      base_url: '',
      model: '',
      temperature: 0.4,
      max_output_tokens: 1200,
      ai_mode: 'ai_first',
      enabled: true
    };
  }

  return {
    id: row.id,
    provider: row.provider,
    api_key_masked: row.api_key_masked || '',
    has_api_key: Boolean(row.api_key_encrypted),
    base_url: row.base_url || '',
    model: row.model || '',
    temperature: Number(row.temperature || 0.3),
    max_output_tokens: Number(row.max_output_tokens || 1200),
    ai_mode: row.ai_mode || 'ai_first',
    enabled: Boolean(row.enabled)
  };
}

function getProviderSettingsWithSecret() {
  const row = getProviderSettingsRow();
  if (!row) {
    return {
      provider: 'rules_only',
      api_key: '',
      api_key_masked: '',
      base_url: '',
      model: '',
      temperature: 0.4,
      max_output_tokens: 1200,
      ai_mode: 'ai_first',
      enabled: true
    };
  }

  return {
    id: row.id,
    provider: row.provider,
    api_key: row.api_key_encrypted ? decryptText(row.api_key_encrypted) : '',
    api_key_masked: row.api_key_masked || '',
    base_url: row.base_url || '',
    model: row.model || '',
    temperature: Number(row.temperature || 0.3),
    max_output_tokens: Number(row.max_output_tokens || 1200),
    ai_mode: row.ai_mode || 'ai_first',
    enabled: Boolean(row.enabled)
  };
}

function saveProviderSettings(payload = {}) {
  const current = getProviderSettingsWithSecret();
  const provider = String(payload.provider || current.provider || 'rules_only');
  const defaults = getProviderDefaults(provider);

  const rawApiKey = payload.api_key ?? payload.apiKey ?? payload.api_key_raw ?? payload.openaiApiKey ?? payload.providerApiKey;
  const apiKeyInputRaw = String(rawApiKey || '').trim();
  const isMaskedLike = /\*{3,}/.test(apiKeyInputRaw);
  const apiKeyInput = (rawApiKey === undefined || rawApiKey === null || apiKeyInputRaw === '' || isMaskedLike)
    ? null
    : apiKeyInputRaw;
  const apiKey = apiKeyInput === null
    ? current.api_key
    : apiKeyInput
      ? apiKeyInput
      : '';

  const encrypted = apiKey ? encryptText(apiKey) : null;
  const masked = apiKey ? maskApiKey(apiKey) : null;

  const normalized = {
    provider,
    api_key_encrypted: encrypted,
    api_key_masked: masked,
    base_url: String(payload.base_url ?? current.base_url ?? defaults.base_url ?? '').trim(),
    model: String(payload.model ?? current.model ?? defaults.model ?? '').trim(),
    temperature: Number(payload.temperature ?? current.temperature ?? 0.4),
    max_output_tokens: Number(payload.max_output_tokens ?? current.max_output_tokens ?? 1200),
    ai_mode: String(payload.ai_mode ?? current.ai_mode ?? 'ai_first'),
    enabled: payload.enabled === undefined ? (current.enabled ? 1 : 0) : (payload.enabled ? 1 : 0)
  };

  if (current.id) {
    db.prepare(`
      UPDATE ai_provider_settings
      SET provider = ?,
          api_key_encrypted = ?,
          api_key_masked = ?,
          base_url = ?,
          model = ?,
          temperature = ?,
          max_output_tokens = ?,
          ai_mode = ?,
          enabled = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      normalized.provider,
      normalized.api_key_encrypted,
      normalized.api_key_masked,
      normalized.base_url,
      normalized.model,
      normalized.temperature,
      normalized.max_output_tokens,
      normalized.ai_mode,
      normalized.enabled,
      current.id
    );
  } else {
    db.prepare(`
      INSERT INTO ai_provider_settings (
        provider, api_key_encrypted, api_key_masked, base_url, model,
        temperature, max_output_tokens, ai_mode, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      normalized.provider,
      normalized.api_key_encrypted,
      normalized.api_key_masked,
      normalized.base_url,
      normalized.model,
      normalized.temperature,
      normalized.max_output_tokens,
      normalized.ai_mode,
      normalized.enabled
    );
  }

  return getProviderSettings();
}

module.exports = {
  getProviderDefaults,
  getProviderSettings,
  getProviderSettingsWithSecret,
  saveProviderSettings
};
