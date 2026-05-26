PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 100,
  match_type TEXT NOT NULL,
  keywords TEXT NOT NULL,
  reply TEXT NOT NULL,
  delay_seconds INTEGER DEFAULT 0,
  handoff_on_match INTEGER DEFAULT 0,
  force_rule INTEGER DEFAULT 0,
  category TEXT DEFAULT 'عام',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT UNIQUE NOT NULL,
  display_name TEXT,
  phone TEXT,
  human_handoff INTEGER DEFAULT 0,
  last_message TEXT,
  last_message_at TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_jid TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL,
  body TEXT,
  raw_json TEXT,
  from_bot INTEGER DEFAULT 0,
  rule_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  contact_jid TEXT,
  rule_id INTEGER,
  meta_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS setup_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  completed INTEGER DEFAULT 0,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'rules_only',
  api_key_encrypted TEXT,
  api_key_masked TEXT,
  base_url TEXT,
  model TEXT,
  temperature REAL DEFAULT 0.3,
  max_output_tokens INTEGER DEFAULT 250,
  ai_mode TEXT DEFAULT 'rules_first',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS company_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_number TEXT,
  business_description TEXT,
  general_manager TEXT,
  company_responsible TEXT,
  center_manager TEXT,
  center_manager_current TEXT,
  center_manager_notes TEXT,
  company_location_title TEXT,
  company_location_url TEXT,
  center_location_title TEXT,
  center_location_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_jid TEXT UNIQUE NOT NULL,
  conversation_type TEXT DEFAULT 'customer_private',
  current_intent TEXT DEFAULT 'unknown',
  collected_data_json TEXT,
  missing_fields_json TEXT,
  last_assistant_question TEXT,
  emotional_tone TEXT DEFAULT 'neutral',
  conversation_summary TEXT,
  last_user_message TEXT,
  last_assistant_reply TEXT,
  frustration_level INTEGER DEFAULT 0,
  open_request_status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT UNIQUE NOT NULL,
  group_name TEXT,
  enabled INTEGER DEFAULT 0,
  report_enabled INTEGER DEFAULT 1,
  allow_ai_answers INTEGER DEFAULT 1,
  reply_only_when_mentioned INTEGER DEFAULT 1,
  allow_daily_summary INTEGER DEFAULT 0,
  daily_report_time TEXT DEFAULT '21:00',
  last_message_at TEXT,
  last_message_preview TEXT,
  participants_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT NOT NULL,
  participant_jid TEXT NOT NULL,
  display_name TEXT,
  role TEXT DEFAULT 'viewer',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_jid, participant_jid)
);

CREATE TABLE IF NOT EXISTS report_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT NOT NULL,
  requested_by TEXT,
  report_type TEXT,
  question TEXT,
  answer TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_jid TEXT NOT NULL,
  message_id TEXT,
  media_type TEXT NOT NULL,
  file_path TEXT,
  transcript TEXT,
  analysis TEXT,
  processing_status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_jid TEXT NOT NULL,
  request_type TEXT,
  status TEXT DEFAULT 'open',
  summary TEXT,
  car_make TEXT,
  car_model TEXT,
  car_year TEXT,
  vin TEXT,
  part_name TEXT,
  missing_fields_json TEXT,
  emotional_tone TEXT,
  source_message_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  preferred_name TEXT,
  title TEXT,
  role_key TEXT NOT NULL DEFAULT 'viewer',
  role_label TEXT NOT NULL DEFAULT 'مشاهد',
  phone TEXT,
  normalized_phone TEXT UNIQUE,
  whatsapp_jid TEXT,
  enabled INTEGER DEFAULT 1,
  is_vip INTEGER DEFAULT 0,
  greeting_style TEXT DEFAULT 'مهني',
  private_reply_enabled INTEGER DEFAULT 1,
  group_reply_enabled INTEGER DEFAULT 1,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS person_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  permission_key TEXT NOT NULL,
  allowed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(person_id, permission_key)
);

CREATE TABLE IF NOT EXISTS person_interaction_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL UNIQUE,
  private_tone TEXT,
  group_tone TEXT,
  custom_greeting TEXT,
  custom_system_instruction TEXT,
  report_detail_level TEXT DEFAULT 'متوسط',
  show_full_customer_numbers INTEGER DEFAULT 0,
  allow_sensitive_reports INTEGER DEFAULT 0,
  allow_financial_reports INTEGER DEFAULT 0,
  allow_technical_reports INTEGER DEFAULT 0,
  allow_customer_lookup INTEGER DEFAULT 0,
  allow_conversation_lookup INTEGER DEFAULT 0,
  allow_bot_control INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS person_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER,
  actor_jid TEXT,
  action TEXT,
  details_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_key TEXT UNIQUE NOT NULL,
  role_label TEXT NOT NULL,
  default_permissions_json TEXT,
  default_policy_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS unknown_group_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_jid TEXT NOT NULL,
  participant_jid TEXT NOT NULL,
  normalized_phone TEXT,
  last_message_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_jid, participant_jid)
);

CREATE TABLE IF NOT EXISTS person_identifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  verified INTEGER DEFAULT 1,
  confidence INTEGER DEFAULT 100,
  source TEXT DEFAULT 'system',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identifier_type, identifier_value)
);
