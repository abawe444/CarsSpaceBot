const crypto = require('crypto');
const { db, upsertSetting } = require('../database/db');
const { getProviderSettings } = require('./aiProviderSettingsService');

const CANONICAL_AI = {
  provider: 'ai.provider',
  baseUrl: 'ai.base_url',
  model: 'ai.model',
  temperature: 'ai.temperature',
  maxOutputTokens: 'ai.max_output_tokens',
  mode: 'ai.mode',
  contextMessagesCount: 'ai.context_messages_count',
  enableMemory: 'ai.enable_memory',
  enableVoiceTranscription: 'ai.enable_voice_transcription',
  enableImageAnalysis: 'ai.enable_image_analysis',
  enableTypingSimulation: 'ai.enable_typing_simulation',
  systemPrompt: 'ai.system_prompt',
  fallbackReply: 'ai.fallback_reply',
  welcomeReply: 'ai.welcome_reply'
};

const GENERAL_KEYS_WHITELIST = new Set([
  'company_name',
  'logo_url',
  'default_language',
  'theme',
  'reply_delay',
  'enable_logs',
  'enable_analytics',
  'session_path',
  'admin_password',
  'enable_groups',
  'enable_admin_group_mode',
  'reply_to_random_groups',
  'reply_only_when_mentioned',
  'owner_bypass_group_rules',
  'allow_report_commands_in_admin_groups',
  'auto_enable_first_group_for_demo',
  'reply_unknown_group_request_with_auth_message',
  'daily_admin_report_enabled',
  'daily_admin_report_time',
  'daily_admin_report_group_jid',
  'show_full_customer_numbers_in_admin_reports'
]);

const AI_KEY_ALIASES = {
  [CANONICAL_AI.provider]: ['ai_provider', 'AI_PROVIDER', 'provider'],
  [CANONICAL_AI.baseUrl]: ['ai_base_url', 'AI_BASE_URL', 'base_url', 'baseUrl'],
  [CANONICAL_AI.model]: ['ai_model', 'AI_MODEL', 'OPENAI_MODEL', 'model'],
  [CANONICAL_AI.temperature]: ['ai_temperature', 'AI_TEMPERATURE', 'temperature'],
  [CANONICAL_AI.maxOutputTokens]: ['ai_max_output_tokens', 'AI_MAX_OUTPUT_TOKENS', 'max_output_tokens', 'maxOutputTokens'],
  [CANONICAL_AI.mode]: ['ai_mode', 'AI_MODE', 'mode'],
  [CANONICAL_AI.contextMessagesCount]: ['context_messages_count', 'CONTEXT_MESSAGES_COUNT'],
  [CANONICAL_AI.enableMemory]: ['enable_memory', 'ENABLE_MEMORY'],
  [CANONICAL_AI.enableVoiceTranscription]: ['enable_voice_transcription', 'ENABLE_VOICE_TRANSCRIPTION'],
  [CANONICAL_AI.enableImageAnalysis]: ['enable_image_analysis', 'ENABLE_IMAGE_ANALYSIS'],
  [CANONICAL_AI.enableTypingSimulation]: ['enable_typing_simulation', 'ENABLE_TYPING_SIMULATION'],
  [CANONICAL_AI.systemPrompt]: ['assistant_prompt', 'system_prompt', 'prompt'],
  [CANONICAL_AI.fallbackReply]: ['fallback_reply', 'fallback'],
  [CANONICAL_AI.welcomeReply]: ['welcome_reply', 'welcome']
};

function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  rows.forEach((row) => {
    map[row.key] = row.value;
  });
  return map;
}

function firstDefined(map, keys = [], fallback = '') {
  for (const key of keys) {
    if (map[key] !== undefined && map[key] !== null && String(map[key]).trim() !== '') {
      return map[key];
    }
  }
  return fallback;
}

function toBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
}

function toNumber(value, defaultValue = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

function canonicalAiDefaults(provider = null) {
  const selectedProvider = provider?.provider || 'custom_openai_compatible';
  return {
    [CANONICAL_AI.provider]: selectedProvider || 'custom_openai_compatible',
    [CANONICAL_AI.baseUrl]: provider?.base_url || 'https://openrouter.ai/api/v1',
    [CANONICAL_AI.model]: provider?.model || 'openai/gpt-4o-mini',
    [CANONICAL_AI.temperature]: String(provider?.temperature ?? 0.4),
    [CANONICAL_AI.maxOutputTokens]: String(provider?.max_output_tokens ?? 1200),
    [CANONICAL_AI.mode]: provider?.ai_mode || 'ai_first',
    [CANONICAL_AI.contextMessagesCount]: '30',
    [CANONICAL_AI.enableMemory]: 'true',
    [CANONICAL_AI.enableVoiceTranscription]: 'true',
    [CANONICAL_AI.enableImageAnalysis]: 'true',
    [CANONICAL_AI.enableTypingSimulation]: 'true',
    [CANONICAL_AI.systemPrompt]: '',
    [CANONICAL_AI.fallbackReply]: 'وصلت رسالتك 👍\nخلني أراجع سياق المحادثة وأساعدك بأقرب طريقة. إذا كان طلبك عن قطعة، أرسل اسم القطعة أو صورة لها، وإذا كان عن صيانة اكتب المشكلة باختصار.',
    [CANONICAL_AI.welcomeReply]: 'وعليكم السلام ورحمة الله وبركاته 👋\nحياك الله في فضاء المحركات. كيف نقدر نخدمك؟'
  };
}

let canonicalMigrated = false;

function ensureCanonicalAiSettings() {
  if (canonicalMigrated) return;
  const map = getSettingsMap();
  const provider = getProviderSettings();
  const defaults = canonicalAiDefaults(provider);

  Object.entries(AI_KEY_ALIASES).forEach(([canonicalKey, aliases]) => {
    const value = firstDefined(map, [canonicalKey, ...aliases], defaults[canonicalKey] ?? '');
    if (value !== undefined && value !== null && String(value) !== '') {
      upsertSetting(canonicalKey, String(value));
    }
  });

  // Keep legacy keys synced from canonical to avoid stale overwrites.
  const latest = getSettingsMap();
  const numericMaxTokens = Number(latest[CANONICAL_AI.maxOutputTokens] || defaults[CANONICAL_AI.maxOutputTokens] || 1200);
  if (!Number.isFinite(numericMaxTokens) || numericMaxTokens < 200) {
    upsertSetting(CANONICAL_AI.maxOutputTokens, '1200');
  }
  const modeNow = String(latest[CANONICAL_AI.mode] || defaults[CANONICAL_AI.mode] || 'ai_first');
  if (!['rules_only', 'rules_first', 'ai_first', 'ai_only'].includes(modeNow)) {
    upsertSetting(CANONICAL_AI.mode, 'ai_first');
  }

  Object.entries(AI_KEY_ALIASES).forEach(([canonicalKey, aliases]) => {
    const canonicalValue = latest[canonicalKey] ?? defaults[canonicalKey] ?? '';
    aliases.forEach((legacyKey) => {
      if (legacyKey) upsertSetting(legacyKey, String(canonicalValue));
    });
  });

  // Harden default admin password if still unchanged in demo.
  if ((latest.admin_password || '') === 'change-me') {
    upsertSetting('admin_password', process.env.ADMIN_PASSWORD || 'sarh-demo-admin-2026');
  }

  canonicalMigrated = true;
}

function mapPayloadToCanonicalAi(payload = {}) {
  const out = {};
  const get = (...keys) => {
    for (const key of keys) {
      if (payload[key] !== undefined) return payload[key];
    }
    return undefined;
  };

  const assignIfDefined = (canonicalKey, value) => {
    if (value !== undefined) out[canonicalKey] = value;
  };

  assignIfDefined(CANONICAL_AI.provider, get('ai.provider', 'ai_provider', 'provider'));
  assignIfDefined(CANONICAL_AI.baseUrl, get('ai.base_url', 'ai_base_url', 'base_url', 'baseUrl'));
  assignIfDefined(CANONICAL_AI.model, get('ai.model', 'ai_model', 'model', 'OPENAI_MODEL'));
  assignIfDefined(CANONICAL_AI.temperature, get('ai.temperature', 'ai_temperature', 'temperature'));
  assignIfDefined(CANONICAL_AI.maxOutputTokens, get('ai.max_output_tokens', 'ai_max_output_tokens', 'max_output_tokens', 'maxOutputTokens'));
  assignIfDefined(CANONICAL_AI.mode, get('ai.mode', 'ai_mode', 'aiMode'));
  assignIfDefined(CANONICAL_AI.contextMessagesCount, get('ai.context_messages_count', 'context_messages_count'));
  assignIfDefined(CANONICAL_AI.enableMemory, get('ai.enable_memory', 'enable_memory'));
  assignIfDefined(CANONICAL_AI.enableVoiceTranscription, get('ai.enable_voice_transcription', 'enable_voice_transcription'));
  assignIfDefined(CANONICAL_AI.enableImageAnalysis, get('ai.enable_image_analysis', 'enable_image_analysis'));
  assignIfDefined(CANONICAL_AI.enableTypingSimulation, get('ai.enable_typing_simulation', 'enable_typing_simulation'));
  assignIfDefined(CANONICAL_AI.systemPrompt, get('ai.system_prompt', 'assistant_prompt', 'system_prompt'));
  assignIfDefined(CANONICAL_AI.fallbackReply, get('ai.fallback_reply', 'fallback_reply', 'fallback'));
  assignIfDefined(CANONICAL_AI.welcomeReply, get('ai.welcome_reply', 'welcome_reply', 'welcome'));

  return out;
}

function getSettings() {
  ensureCanonicalAiSettings();
  const map = getSettingsMap();
  const provider = getProviderSettings();
  const defaults = canonicalAiDefaults(provider);

  const aiProvider = firstDefined(map, [CANONICAL_AI.provider], defaults[CANONICAL_AI.provider]);
  const aiBaseUrl = firstDefined(map, [CANONICAL_AI.baseUrl], defaults[CANONICAL_AI.baseUrl]);
  const aiModel = firstDefined(map, [CANONICAL_AI.model], defaults[CANONICAL_AI.model]);
  const aiTemperature = toNumber(firstDefined(map, [CANONICAL_AI.temperature], defaults[CANONICAL_AI.temperature]), 0.4);
  const aiMaxTokens = toNumber(firstDefined(map, [CANONICAL_AI.maxOutputTokens], defaults[CANONICAL_AI.maxOutputTokens]), 1200);
  const aiMode = firstDefined(map, [CANONICAL_AI.mode], defaults[CANONICAL_AI.mode]);

  const systemPrompt = firstDefined(map, [CANONICAL_AI.systemPrompt], '');
  const fallbackReply = firstDefined(map, [CANONICAL_AI.fallbackReply], defaults[CANONICAL_AI.fallbackReply]);
  const welcomeReply = firstDefined(map, [CANONICAL_AI.welcomeReply], defaults[CANONICAL_AI.welcomeReply]);

  return {
    company_name: map.company_name || 'فضاء المحركات / Cars Space',
    company_field: map.company_field || '',
    company_contact_number: map.company_contact_number || '0578448146',
    management_general_manager: map.management_general_manager || '',
    management_company_manager: map.management_company_manager || '',
    management_center_manager: map.management_center_manager || '',
    management_center_manager_notes: map.management_center_manager_notes || '',
    location_company_name: map.location_company_name || '',
    location_company_address: map.location_company_address || '',
    location_company_map_url: map.location_company_map_url || '',
    location_center_name: map.location_center_name || '',
    location_center_address: map.location_center_address || '',
    location_center_map_url: map.location_center_map_url || '',
    logo_url: map.logo_url || '',
    default_language: map.default_language || 'ar',
    theme: map.theme || 'auto',
    reply_delay: Number(map.reply_delay || 2),
    enable_logs: map.enable_logs !== 'false',
    enable_analytics: map.enable_analytics !== 'false',
    session_path: map.session_path || './storage/sessions',
    admin_password: map.admin_password || 'sarh-demo-admin-2026',

    assistant_name: map.assistant_name || 'مساعد فضاء المحركات',
    assistant_tone: map.assistant_tone || 'رسمي',
    assistant_prompt: systemPrompt,
    assistant_reply_policy: map.assistant_reply_policy || '',
    assistant_car_knowledge_behavior: map.assistant_car_knowledge_behavior || '',
    fallback_reply: fallbackReply,
    welcome_reply: welcomeReply,
    assistant_enabled: map.assistant_enabled !== 'false',
    rules_enabled: map.rules_enabled !== 'false',
    assistant_reply_delay_seconds: Number(map.assistant_reply_delay_seconds || 2),
    assistant_max_replies_per_hour: Number(map.assistant_max_replies_per_hour || 80),
    assistant_auto_handoff_keywords: map.assistant_auto_handoff_keywords || 'شكوى,مدير,موظف,اتصلوا,غير راضي,مشكلة',

    enable_groups: map.enable_groups !== 'false',
    enable_admin_group_mode: map.enable_admin_group_mode !== 'false',
    reply_to_random_groups: map.reply_to_random_groups === 'true',
    reply_only_when_mentioned: map.reply_only_when_mentioned === 'true',
    owner_bypass_group_rules: map.owner_bypass_group_rules !== 'false',
    allow_report_commands_in_admin_groups: map.allow_report_commands_in_admin_groups !== 'false',
    auto_enable_first_group_for_demo: map.auto_enable_first_group_for_demo === 'true',
    reply_unknown_group_request_with_auth_message: map.reply_unknown_group_request_with_auth_message !== 'false',
    daily_admin_report_enabled: map.daily_admin_report_enabled === 'true',
    daily_admin_report_time: map.daily_admin_report_time || '21:00',
    daily_admin_report_group_jid: map.daily_admin_report_group_jid || '',
    show_full_customer_numbers_in_admin_reports: map.show_full_customer_numbers_in_admin_reports === 'true',

    enable_typing_simulation: toBool(firstDefined(map, [CANONICAL_AI.enableTypingSimulation], defaults[CANONICAL_AI.enableTypingSimulation]), true),
    min_typing_delay_ms: Number(map.min_typing_delay_ms || 1200),
    max_typing_delay_ms: Number(map.max_typing_delay_ms || 8000),
    typing_speed_chars_per_second: Number(map.typing_speed_chars_per_second || 18),
    enable_memory: toBool(firstDefined(map, [CANONICAL_AI.enableMemory], defaults[CANONICAL_AI.enableMemory]), true),
    context_messages_count: Number(firstDefined(map, [CANONICAL_AI.contextMessagesCount], defaults[CANONICAL_AI.contextMessagesCount]) || 30),
    enable_voice_transcription: toBool(firstDefined(map, [CANONICAL_AI.enableVoiceTranscription], defaults[CANONICAL_AI.enableVoiceTranscription]), true),
    voice_transcription_provider: map.voice_transcription_provider || 'openai_optional',
    voice_fallback_to_ai_context: map.voice_fallback_to_ai_context !== 'false',
    enable_image_analysis: toBool(firstDefined(map, [CANONICAL_AI.enableImageAnalysis], defaults[CANONICAL_AI.enableImageAnalysis]), true),
    image_analysis_provider: map.image_analysis_provider || 'openrouter',
    vision_model: map.vision_model || 'openai/gpt-4o-mini',

    ai_mode: aiMode,
    ai_provider: aiProvider,
    ai_base_url: aiBaseUrl,
    ai_model: aiModel,
    openai_model: aiModel,
    ai_temperature: aiTemperature,
    ai_max_output_tokens: aiMaxTokens,
    contact_number: map.company_contact_number || '0578448146',

    ai: {
      provider: aiProvider,
      base_url: aiBaseUrl,
      model: aiModel,
      temperature: aiTemperature,
      max_output_tokens: aiMaxTokens,
      mode: aiMode,
      context_messages_count: Number(firstDefined(map, [CANONICAL_AI.contextMessagesCount], defaults[CANONICAL_AI.contextMessagesCount]) || 30),
      enable_memory: toBool(firstDefined(map, [CANONICAL_AI.enableMemory], defaults[CANONICAL_AI.enableMemory]), true),
      enable_voice_transcription: toBool(firstDefined(map, [CANONICAL_AI.enableVoiceTranscription], defaults[CANONICAL_AI.enableVoiceTranscription]), true),
      enable_image_analysis: toBool(firstDefined(map, [CANONICAL_AI.enableImageAnalysis], defaults[CANONICAL_AI.enableImageAnalysis]), true),
      enable_typing_simulation: toBool(firstDefined(map, [CANONICAL_AI.enableTypingSimulation], defaults[CANONICAL_AI.enableTypingSimulation]), true),
      system_prompt: systemPrompt,
      fallback_reply: fallbackReply,
      welcome_reply: welcomeReply
    }
  };
}

function updateSettings(payload = {}, options = {}) {
  ensureCanonicalAiSettings();
  const scope = options.scope || 'any';

  const aiMapped = mapPayloadToCanonicalAi(payload);
  const directEntries = Object.entries(payload || {});

  directEntries.forEach(([key, value]) => {
    if (scope === 'general' && !GENERAL_KEYS_WHITELIST.has(key)) return;
    upsertSetting(key, String(value ?? ''));
  });

  if (scope !== 'general') {
    Object.entries(aiMapped).forEach(([key, value]) => {
      upsertSetting(key, String(value ?? ''));
    });
  }

  // Keep legacy keys in sync after update for compatibility.
  const current = getSettingsMap();
  Object.entries(AI_KEY_ALIASES).forEach(([canonicalKey, aliases]) => {
    const canonicalValue = current[canonicalKey];
    if (canonicalValue === undefined) return;
    aliases.forEach((legacyKey) => upsertSetting(legacyKey, String(canonicalValue)));
  });

  return getSettings();
}

function getEffectiveSettings() {
  const settings = getSettings();
  const provider = getProviderSettings();
  const prompt = settings.assistant_prompt || '';
  return {
    provider: settings.ai_provider || provider.provider || 'custom_openai_compatible',
    baseUrl: settings.ai_base_url || provider.base_url || 'https://openrouter.ai/api/v1',
    model: settings.ai_model || provider.model || 'openai/gpt-4o-mini',
    aiMode: settings.ai_mode || provider.ai_mode || 'ai_first',
    temperature: Number(settings.ai_temperature || provider.temperature || 0.4),
    maxOutputTokens: Number(settings.ai_max_output_tokens || provider.max_output_tokens || 1200),
    contextMessagesCount: Number(settings.context_messages_count || 30),
    enableMemory: Boolean(settings.enable_memory),
    enableVoiceTranscription: Boolean(settings.enable_voice_transcription),
    enableImageAnalysis: Boolean(settings.enable_image_analysis),
    enableTypingSimulation: Boolean(settings.enable_typing_simulation),
    rulesEnabled: Boolean(settings.rules_enabled),
    assistantEnabled: Boolean(settings.assistant_enabled),
    fallbackReply: settings.fallback_reply,
    systemPromptHash: crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16)
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getSettingsMap,
  getEffectiveSettings,
  CANONICAL_AI
};
