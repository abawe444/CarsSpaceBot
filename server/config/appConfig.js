require('dotenv').config();

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  APP_NAME: process.env.APP_NAME || 'SARH WhatsApp Demo Agent',
  APP_SECRET: process.env.APP_SECRET || '',
  SESSION_DIR: process.env.SESSION_DIR || './storage/sessions',
  DATABASE_PATH: process.env.DATABASE_PATH || './server/database/database.sqlite',
  ENABLE_GROUPS: String(process.env.ENABLE_GROUPS || 'false') === 'true',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'change-me',
  AI_MODE: process.env.AI_MODE || 'ai_first',
  AI_PROVIDER: process.env.AI_PROVIDER || 'custom_openai_compatible',
  AI_BASE_URL: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
  AI_MODEL: process.env.AI_MODEL || 'openai/gpt-4o-mini',
  AI_TEMPERATURE: Number(process.env.AI_TEMPERATURE || 0.4),
  AI_MAX_OUTPUT_TOKENS: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
  ENABLE_ADMIN_GROUP_MODE: String(process.env.ENABLE_ADMIN_GROUP_MODE || 'true') === 'true',
  REPLY_TO_RANDOM_GROUPS: String(process.env.REPLY_TO_RANDOM_GROUPS || 'false') === 'true',
  REPLY_ONLY_WHEN_MENTIONED: String(process.env.REPLY_ONLY_WHEN_MENTIONED || 'false') === 'true',
  DAILY_ADMIN_REPORT_ENABLED: String(process.env.DAILY_ADMIN_REPORT_ENABLED || 'false') === 'true',
  DAILY_ADMIN_REPORT_TIME: process.env.DAILY_ADMIN_REPORT_TIME || '21:00'
};
