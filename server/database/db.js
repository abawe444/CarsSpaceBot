const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { DATABASE_PATH } = require('../config/appConfig');
const { OWNER_PROFILE, OWNER_IDENTIFIERS } = require('../config/ownerConfig');

const absoluteDbPath = path.resolve(process.cwd(), DATABASE_PATH);
fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

const db = new Database(absoluteDbPath);
db.pragma('journal_mode = WAL');

function runSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);
}

function hasColumn(table, column) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((row) => row.name === column);
}

function hasTable(table) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
  return Boolean(row);
}

function ensureMigrations() {
  if (!hasColumn('rules', 'handoff_on_match')) {
    db.exec("ALTER TABLE rules ADD COLUMN handoff_on_match INTEGER DEFAULT 0");
  }
  if (!hasColumn('rules', 'force_rule')) {
    db.exec("ALTER TABLE rules ADD COLUMN force_rule INTEGER DEFAULT 0");
  }

  if (!hasTable('knowledge_entries')) {
    db.exec(`
      CREATE TABLE knowledge_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasTable('setup_state')) {
    db.exec(`
      CREATE TABLE setup_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        completed INTEGER DEFAULT 0,
        completed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasTable('ai_provider_settings')) {
    db.exec(`
      CREATE TABLE ai_provider_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL DEFAULT 'rules_only',
        api_key_encrypted TEXT,
        api_key_masked TEXT,
        base_url TEXT,
        model TEXT,
        temperature REAL DEFAULT 0.4,
        max_output_tokens INTEGER DEFAULT 1200,
        ai_mode TEXT DEFAULT 'ai_first',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasTable('company_profile')) {
    db.exec(`
      CREATE TABLE company_profile (
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
      )
    `);
  }
  if (!hasColumn('company_profile', 'center_manager_current')) {
    db.exec("ALTER TABLE company_profile ADD COLUMN center_manager_current TEXT");
  }
  if (!hasColumn('company_profile', 'center_manager_notes')) {
    db.exec("ALTER TABLE company_profile ADD COLUMN center_manager_notes TEXT");
  }

  if (!hasTable('conversation_memory')) {
    db.exec(`
      CREATE TABLE conversation_memory (
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
      )
    `);
  }

  if (!hasTable('admin_groups')) {
    db.exec(`
      CREATE TABLE admin_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_jid TEXT UNIQUE NOT NULL,
        group_name TEXT,
        enabled INTEGER DEFAULT 0,
        report_enabled INTEGER DEFAULT 1,
        allow_ai_answers INTEGER DEFAULT 1,
        reply_only_when_mentioned INTEGER DEFAULT 1,
        allow_daily_summary INTEGER DEFAULT 0,
        daily_report_time TEXT DEFAULT '21:00',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasColumn('admin_groups', 'reply_only_when_mentioned')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN reply_only_when_mentioned INTEGER DEFAULT 1");
  }
  if (!hasColumn('admin_groups', 'allow_daily_summary')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN allow_daily_summary INTEGER DEFAULT 0");
  }
  if (!hasColumn('admin_groups', 'daily_report_time')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN daily_report_time TEXT DEFAULT '21:00'");
  }

  if (!hasTable('admin_group_members')) {
    db.exec(`
      CREATE TABLE admin_group_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_jid TEXT NOT NULL,
        participant_jid TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'viewer',
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_jid, participant_jid)
      )
    `);
  }

  if (!hasTable('unknown_group_participants')) {
    db.exec(`
      CREATE TABLE unknown_group_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_jid TEXT NOT NULL,
        participant_jid TEXT NOT NULL,
        normalized_phone TEXT,
        last_message_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_jid, participant_jid)
      )
    `);
  }

  if (!hasTable('person_identifiers')) {
    db.exec(`
      CREATE TABLE person_identifiers (
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
      )
    `);
  }
  if (!hasColumn('person_identifiers', 'verified')) {
    db.exec("ALTER TABLE person_identifiers ADD COLUMN verified INTEGER DEFAULT 1");
  }
  if (!hasColumn('person_identifiers', 'confidence')) {
    db.exec("ALTER TABLE person_identifiers ADD COLUMN confidence INTEGER DEFAULT 100");
  }
  if (!hasColumn('person_identifiers', 'source')) {
    db.exec("ALTER TABLE person_identifiers ADD COLUMN source TEXT DEFAULT 'system'");
  }

  if (!hasColumn('admin_groups', 'last_message_at')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN last_message_at TEXT");
  }
  if (!hasColumn('admin_groups', 'last_message_preview')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN last_message_preview TEXT");
  }
  if (!hasColumn('admin_groups', 'participants_count')) {
    db.exec("ALTER TABLE admin_groups ADD COLUMN participants_count INTEGER DEFAULT 0");
  }

  if (!hasTable('report_logs')) {
    db.exec(`
      CREATE TABLE report_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_jid TEXT NOT NULL,
        requested_by TEXT,
        report_type TEXT,
        question TEXT,
        answer TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasTable('media_messages')) {
    db.exec(`
      CREATE TABLE media_messages (
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
      )
    `);
  }

  if (!hasTable('customer_requests')) {
    db.exec(`
      CREATE TABLE customer_requests (
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
      )
    `);
  }

  if (!hasTable('people')) {
    db.exec(`
      CREATE TABLE people (
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
      )
    `);
  }

  if (!hasTable('person_permissions')) {
    db.exec(`
      CREATE TABLE person_permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER NOT NULL,
        permission_key TEXT NOT NULL,
        allowed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(person_id, permission_key)
      )
    `);
  }

  if (!hasTable('person_interaction_policies')) {
    db.exec(`
      CREATE TABLE person_interaction_policies (
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
      )
    `);
  }

  if (!hasTable('person_audit_logs')) {
    db.exec(`
      CREATE TABLE person_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        person_id INTEGER,
        actor_jid TEXT,
        action TEXT,
        details_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  if (!hasTable('role_templates')) {
    db.exec(`
      CREATE TABLE role_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_key TEXT UNIQUE NOT NULL,
        role_label TEXT NOT NULL,
        default_permissions_json TEXT,
        default_policy_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
}

function upsertSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, created_at, updated_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value));
}

function insertSettingIfMissing(key, value) {
  const row = db.prepare('SELECT id FROM settings WHERE key = ?').get(key);
  if (!row) upsertSetting(key, value);
}

function getDefaultSystemPrompt() {
  return `أنت مساعد واتساب ذكي واحترافي لشركة فضاء المحركات / Cars Space في الرياض.

أنت لست بوت ردود ثابتة.
أنت وكيل محادثات ذكي يتحدث طبيعيًا مثل ChatGPT الحقيقي.

مهمتك:
- خدمة العملاء باحترافية.
- فهم نية العميل من السياق.
- تذكّر المحادثة.
- جمع المعلومات تدريجيًا.
- التعامل مع الصور والتسجيلات بذكاء.
- عدم تكرار الردود.
- تحويل الشكاوى للموظف المختص.
- مساعدة الإدارة في المجموعات الداخلية بالتقارير والتحليلات.

معلومات الشركة:
- اسم الشركة: شركة فضاء المحركات / Cars Space.
- رقم التواصل: 0578448146.
- المدير العام: الأستاذ عبد الحكيم المذهول.
- مسؤول جهة الشركة: الأستاذ أبو شادي.
- مدير المركز: الأستاذ جهاد.

موقع الشركة:
https://maps.app.goo.gl/E3h8iazC7MMeBTQX6

موقع المركز:
https://maps.app.goo.gl/b1c3qkPPfKnQzQEs9

أسلوب الرد للعملاء:
- تحدث باللهجة السعودية البيضاء.
- كن لبقًا وهادئًا.
- لا تكن روبوتيًا.
- لا تكرر نفس الجملة.
- لا تطلب نفس المعلومات أكثر من مرة.
- لا تعط سعرًا نهائيًا بدون تأكيد.
- لا تخترع توفر قطع.
- اسأل سؤالًا واحدًا مفيدًا عند الحاجة.
- تحمّل العميل حتى لو كان غاضبًا.

في طلبات قطع الغيار:
اجمع تدريجيًا:
- رقم الهيكل VIN إن توفر
- اسم القطعة
- نوع السيارة
- الموديل
- السنة
- صورة القطعة إن وجدت

إذا لم يوجد VIN:
تابع بالسيارة والموديل والسنة ولا توقف المحادثة.

في التسجيلات الصوتية:
تعامل مع التفريغ كنص العميل.
إذا لم يتم التفريغ، اطلب منه كتابة المعلومة الأساسية بلطف.

في الصور:
استخدم سياق المحادثة.
لا تقل فقط "وصلت الصورة".
اسأل سؤالًا ذكيًا بناءً على السياق.

في الشكاوى:
اعتذر وفعّل التدخل البشري.

في مجموعات الإدارة:
أجب فقط في المجموعات المصرح بها.
أجب على التقارير والاستفسارات الإدارية بناءً على بيانات النظام.
لا تخترع أرقامًا.
إذا لا توجد بيانات، قل ذلك بوضوح.`;
}

function getDefaultCompany() {
  return {
    company_name: 'فضاء المحركات / Cars Space',
    company_contact_number: '0578448146',
    company_field: 'صيانة السيارات، قطع الغيار، استقبال الطلبات، الحجز، خدمة العملاء.',
    management_general_manager: 'الأستاذ عبد الحكيم المذهول',
    management_company_manager: 'الأستاذ أبو شادي',
    management_center_manager: 'الأستاذ جهاد',
    management_center_manager_current: 'الأستاذ جهاد',
    management_center_manager_notes: '',
    location_company_name: 'شركة فضاء المحركات',
    location_company_address: 'الطريق الدائري الغربي، الرياض',
    location_company_map_url: 'https://maps.app.goo.gl/E3h8iazC7MMeBTQX6',
    location_center_name: 'مركز شركة فضاء المحركات',
    location_center_address: 'أبي الحسن الفصيحي، الرياض',
    location_center_map_url: 'https://maps.app.goo.gl/b1c3qkPPfKnQzQEs9'
  };
}

function insertDefaultSettings() {
  const company = getDefaultCompany();
  const defaults = {
    ...company,
    logo_url: '',
    default_language: 'ar',
    theme: 'auto',
    reply_delay: '2',
    enable_logs: 'true',
    enable_analytics: 'true',
    session_path: './storage/sessions',
    admin_password: process.env.ADMIN_PASSWORD || 'change-me',
    assistant_name: 'مساعد فضاء المحركات',
    assistant_tone: 'رسمي',
    assistant_enabled: 'true',
    rules_enabled: 'true',
    fallback_reply: 'وصلت رسالتك 👍\nخلني أراجع سياق المحادثة وأساعدك بأقرب طريقة. إذا كان طلبك عن قطعة، أرسل اسم القطعة أو صورة لها، وإذا كان عن صيانة اكتب المشكلة باختصار.',
    welcome_reply: 'وعليكم السلام ورحمة الله وبركاته 👋\nحياك الله في فضاء المحركات. كيف نقدر نخدمك؟',
    assistant_prompt: getDefaultSystemPrompt(),
    assistant_reply_policy: 'لبق، محترم، مختصر، يتحمل العميل، لا يجادل، لا يرفع نبرة الكلام، لا يعطي وعودًا غير مؤكدة، لا يخترع معلومات، يحوّل للموظف المختص عند الحاجة.',
    assistant_car_knowledge_behavior: 'في طلبات قطع الغيار اطلب VIN واسم القطعة ونوع السيارة والموديل والسنة وصورة القطعة. في الصيانة اطلب وصف المشكلة وقابلية الحركة والوقت المناسب. في الأعطال الخطيرة أعطِ تنبيه سلامة أولًا.',
    assistant_reply_delay_seconds: '2',
    assistant_max_replies_per_hour: '80',
    assistant_auto_handoff_keywords: 'شكوى,مدير,زعلان,مشكلة,سيء,تأخير,ما رديتوا,غير راضي',
    enable_groups: process.env.ENABLE_GROUPS || 'true',
    enable_admin_group_mode: process.env.ENABLE_ADMIN_GROUP_MODE || 'true',
    reply_to_random_groups: process.env.REPLY_TO_RANDOM_GROUPS || 'false',
    reply_only_when_mentioned: process.env.REPLY_ONLY_WHEN_MENTIONED || 'false',
    owner_bypass_group_rules: process.env.OWNER_BYPASS_GROUP_RULES || 'true',
    allow_report_commands_in_admin_groups: process.env.ALLOW_REPORT_COMMANDS_IN_ADMIN_GROUPS || 'true',
    auto_enable_first_group_for_demo: process.env.AUTO_ENABLE_FIRST_GROUP_FOR_DEMO || 'false',
    reply_unknown_group_request_with_auth_message: process.env.REPLY_UNKNOWN_GROUP_REQUEST_WITH_AUTH_MESSAGE || 'true',
    daily_admin_report_enabled: process.env.DAILY_ADMIN_REPORT_ENABLED || 'false',
    daily_admin_report_time: process.env.DAILY_ADMIN_REPORT_TIME || '21:00',
    daily_admin_report_group_jid: process.env.DAILY_ADMIN_REPORT_GROUP_JID || '',
    show_full_customer_numbers_in_admin_reports: process.env.SHOW_FULL_CUSTOMER_NUMBERS_IN_ADMIN_REPORTS || 'false',
    enable_typing_simulation: process.env.ENABLE_TYPING_SIMULATION || 'true',
    min_typing_delay_ms: process.env.MIN_TYPING_DELAY_MS || '1200',
    max_typing_delay_ms: process.env.MAX_TYPING_DELAY_MS || '8000',
    typing_speed_chars_per_second: process.env.TYPING_SPEED_CHARS_PER_SECOND || '18',
    enable_memory: process.env.ENABLE_MEMORY || 'true',
    context_messages_count: process.env.CONTEXT_MESSAGES_COUNT || '30',
    enable_voice_transcription: process.env.ENABLE_VOICE_TRANSCRIPTION || 'true',
    voice_transcription_provider: process.env.VOICE_TRANSCRIPTION_PROVIDER || 'openai_optional',
    voice_fallback_to_ai_context: process.env.VOICE_FALLBACK_TO_AI_CONTEXT || 'true',
    enable_image_analysis: process.env.ENABLE_IMAGE_ANALYSIS || 'true',
    image_analysis_provider: process.env.IMAGE_ANALYSIS_PROVIDER || 'openrouter',
    vision_model: process.env.VISION_MODEL || 'openai/gpt-4o-mini',
    ai_mode: process.env.AI_MODE || 'ai_first',
    ai_provider: process.env.AI_PROVIDER || 'custom_openai_compatible',
    ai_base_url: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
    ai_model: process.env.AI_MODEL || 'openai/gpt-4o-mini',
    ai_temperature: process.env.AI_TEMPERATURE || '0.4',
    ai_max_output_tokens: process.env.AI_MAX_OUTPUT_TOKENS || '1200',

    'ai.provider': process.env.AI_PROVIDER || 'custom_openai_compatible',
    'ai.base_url': process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
    'ai.model': process.env.AI_MODEL || 'openai/gpt-4o-mini',
    'ai.temperature': process.env.AI_TEMPERATURE || '0.4',
    'ai.max_output_tokens': process.env.AI_MAX_OUTPUT_TOKENS || '1200',
    'ai.mode': process.env.AI_MODE || 'ai_first',
    'ai.context_messages_count': process.env.CONTEXT_MESSAGES_COUNT || '30',
    'ai.enable_memory': process.env.ENABLE_MEMORY || 'true',
    'ai.enable_voice_transcription': process.env.ENABLE_VOICE_TRANSCRIPTION || 'true',
    'ai.enable_image_analysis': process.env.ENABLE_IMAGE_ANALYSIS || 'true',
    'ai.enable_typing_simulation': process.env.ENABLE_TYPING_SIMULATION || 'true',
    'ai.system_prompt': getDefaultSystemPrompt(),
    'ai.fallback_reply': 'وصلت رسالتك 👍\nخلني أراجع سياق المحادثة وأساعدك بأقرب طريقة. إذا كان طلبك عن قطعة، أرسل اسم القطعة أو صورة لها، وإذا كان عن صيانة اكتب المشكلة باختصار.',
    'ai.welcome_reply': 'وعليكم السلام ورحمة الله وبركاته 👋\nحياك الله في فضاء المحركات. كيف نقدر نخدمك؟'
  };

  Object.entries(defaults).forEach(([key, value]) => insertSettingIfMissing(key, value));
}

function defaultRulesSeed() {
  return [
    {
      names: ['ترحيب', 'قاعدة الترحيب'],
      data: {
        name: 'ترحيب',
        enabled: 1,
        priority: 1,
        match_type: 'contains',
        keywords: 'السلام عليكم,سلام,مرحبا,هلا,اهلين',
        reply: 'وعليكم السلام ورحمة الله وبركاته 👋\nحياك الله في فضاء المحركات. كيف نقدر نخدمك؟',
        delay_seconds: 1,
        handoff_on_match: 0,
        force_rule: 0,
        category: 'ترحيب'
      }
    },
    {
      names: ['رقم التواصل', 'قاعدة رقم التواصل'],
      data: {
        name: 'رقم التواصل',
        enabled: 1,
        priority: 2,
        match_type: 'contains',
        keywords: 'رقم,جوال,اتصال,تواصل',
        reply: 'حياك الله، رقم التواصل معنا:\n0578448146\nوتقدر ترسل طلبك هنا ونخدمك بإذن الله.',
        delay_seconds: 1,
        handoff_on_match: 0,
        force_rule: 1,
        category: 'عام'
      }
    },
    {
      names: ['الموقع', 'قاعدة الموقع'],
      data: {
        name: 'الموقع',
        enabled: 1,
        priority: 3,
        match_type: 'contains',
        keywords: 'موقع,وين,العنوان,مكانكم,اللوكيشن',
        reply: 'حياك الله، عندنا موقع الشركة وموقع المركز:\n\nموقع الشركة:\nhttps://maps.app.goo.gl/E3h8iazC7MMeBTQX6\n\nموقع المركز:\nhttps://maps.app.goo.gl/b1c3qkPPfKnQzQEs9\n\nإذا تحب، أرسل لي نوع الخدمة المطلوبة وأوجهك للمكان الأنسب.',
        delay_seconds: 1,
        handoff_on_match: 0,
        force_rule: 1,
        category: 'موقع'
      }
    },
    {
      names: ['سعر وقطع غيار', 'قاعدة السعر وقطع الغيار'],
      data: {
        name: 'سعر وقطع غيار',
        enabled: 1,
        priority: 4,
        match_type: 'contains',
        keywords: 'سعر,قطعة,قطع,صدام,رفرف,باب,كبوت,شمعة,اسطب,مكينة,قير',
        reply: 'أكيد، أبشر.\nعشان نعطيك إفادة أدق فضلاً أرسل:\n1. رقم الهيكل VIN إن توفر\n2. اسم القطعة\n3. نوع السيارة والموديل والسنة\n4. صورة القطعة إن وجدت',
        delay_seconds: 2,
        handoff_on_match: 0,
        force_rule: 0,
        category: 'قطع غيار'
      }
    },
    {
      names: ['حجز وصيانة', 'قاعدة الحجز والصيانة'],
      data: {
        name: 'حجز وصيانة',
        enabled: 1,
        priority: 5,
        match_type: 'contains',
        keywords: 'حجز,موعد,صيانة,فحص,مشكلة,عطل',
        reply: 'حياك الله، نقدر نخدمك بإذن الله.\nفضلاً أرسل:\n1. نوع السيارة\n2. الموديل والسنة\n3. وصف المشكلة أو الخدمة المطلوبة\n4. الوقت المناسب للتواصل',
        delay_seconds: 2,
        handoff_on_match: 0,
        force_rule: 0,
        category: 'حجز'
      }
    },
    {
      names: ['شكوى وتصعيد', 'قاعدة الشكوى والتصعيد'],
      data: {
        name: 'شكوى وتصعيد',
        enabled: 1,
        priority: 6,
        match_type: 'contains',
        keywords: 'شكوى,مدير,زعلان,مشكلة,سيء,تأخير,ما رديتوا,غير راضي',
        reply: 'نعتذر لك عن أي إزعاج، وحقك علينا.\nراح يتم تحويل المحادثة للموظف المختص عشان يتابع معك بشكل مباشر.',
        delay_seconds: 1,
        handoff_on_match: 1,
        force_rule: 1,
        category: 'شكوى'
      }
    },
    {
      names: ['fallback'],
      data: {
        name: 'fallback',
        enabled: 1,
        priority: 999,
        match_type: 'wildcard',
        keywords: '*',
        reply: 'وصلت رسالتك 👍\nخلني أراجع سياق المحادثة وأساعدك بأقرب طريقة. إذا كان طلبك عن قطعة، أرسل اسم القطعة أو صورة لها، وإذا كان عن صيانة اكتب المشكلة باختصار.',
        delay_seconds: 1,
        handoff_on_match: 0,
        force_rule: 0,
        category: 'عام'
      }
    }
  ];
}

function upsertDefaultRules() {
  const insertStmt = db.prepare(`
    INSERT INTO rules (name, enabled, priority, match_type, keywords, reply, delay_seconds, handoff_on_match, force_rule, category, created_at, updated_at)
    VALUES (@name, @enabled, @priority, @match_type, @keywords, @reply, @delay_seconds, @handoff_on_match, @force_rule, @category, datetime('now'), datetime('now'))
  `);

  const updateStmt = db.prepare(`
    UPDATE rules
    SET name = @name,
        enabled = @enabled,
        priority = @priority,
        match_type = @match_type,
        keywords = @keywords,
        reply = @reply,
        delay_seconds = @delay_seconds,
        handoff_on_match = @handoff_on_match,
        force_rule = @force_rule,
        category = @category,
        updated_at = datetime('now')
    WHERE id = @id
  `);

  const tx = db.transaction(() => {
    defaultRulesSeed().forEach((seedRule) => {
      const placeholders = seedRule.names.map(() => '?').join(',');
      const existing = db
        .prepare(`SELECT * FROM rules WHERE name IN (${placeholders}) ORDER BY id ASC LIMIT 1`)
        .get(...seedRule.names);

      if (existing) {
        updateStmt.run({ ...seedRule.data, id: existing.id });
      } else {
        insertStmt.run(seedRule.data);
      }
    });

    db.prepare(`
      DELETE FROM rules
      WHERE id NOT IN (
        SELECT MIN(id) FROM rules GROUP BY name
      )
    `).run();
  });

  tx();
}

function insertDefaultKnowledgeEntries() {
  const count = db.prepare('SELECT COUNT(*) as count FROM knowledge_entries').get().count;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO knowledge_entries (title, category, content, enabled, created_at, updated_at)
    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  const items = [
    {
      title: 'معلومات شركة فضاء المحركات',
      category: 'معلومات الشركة',
      content: 'شركة فضاء المحركات / Cars Space تعمل في خدمات السيارات، الصيانة، قطع الغيار، استقبال طلبات العملاء، الحجز، وتوجيه العملاء للفرع أو الموظف المناسب. رقم التواصل الأساسي: 0578448146.'
    },
    {
      title: 'الإدارة والمسؤولون',
      category: 'الإدارة',
      content: 'المدير العام: الأستاذ عبد الحكيم المذهول. مسؤول/مدير جهة الشركة: الأستاذ أبو شادي. مدير المركز: الأستاذ جهاد. عند سؤال العميل عن الإدارة أو المسؤولين، يتم الرد بأدب واختصار.'
    },
    {
      title: 'موقع الشركة',
      category: 'المواقع',
      content: 'شركة فضاء المحركات، الطريق الدائري الغربي، الرياض. رابط الموقع: https://maps.app.goo.gl/E3h8iazC7MMeBTQX6'
    },
    {
      title: 'موقع المركز',
      category: 'المواقع',
      content: 'مركز شركة فضاء المحركات، أبي الحسن الفصيحي، الرياض. رابط الموقع: https://maps.app.goo.gl/b1c3qkPPfKnQzQEs9'
    },
    {
      title: 'طريقة استقبال طلب قطع غيار',
      category: 'قطع الغيار',
      content: 'عند طلب سعر أو توفر قطعة: اطلب رقم الهيكل VIN إن وجد، واسم القطعة، ونوع السيارة، والموديل، وسنة الصنع، وصورة القطعة إن توفرت. لا يتم إعطاء سعر نهائي مؤكد إلا من الموظف المختص أو النظام الداخلي.'
    },
    {
      title: 'أسلوب التعامل مع العميل',
      category: 'سياسة الرد',
      content: 'يجب الرد باللهجة السعودية البيضاء، باحترام وهدوء. يجب تحمّل العميل حتى لو كان غاضبًا. لا يتم الجدال مع العميل. عند وجود شكوى أو غضب، يتم الاعتذار وتحويل المحادثة للموظف المختص.'
    },
    {
      title: 'سياسة الشكاوى',
      category: 'الشكاوى',
      content: 'في الشكاوى أو العميل الغاضب: اعتذار بلطف، وعدم الدخول في جدال، وتحويل مباشر للموظف المختص مع تفعيل التدخل البشري.'
    },
    {
      title: 'السلامة في الأعطال الخطيرة',
      category: 'السلامة',
      content: 'في الأعطال الحرجة مثل حرارة المكينة، الفرامل، الدخان، أو تسريب قوي: يتم تنبيه العميل للتوقف في مكان آمن وعدم مواصلة القيادة، ثم تحويل الحالة لمختص.'
    }
  ];

  const tx = db.transaction(() => {
    items.forEach((item) => insert.run(item.title, item.category, item.content));
  });
  tx();
}

function insertDefaultRoleTemplates() {
  const templates = [
    {
      role_key: 'general_manager',
      role_label: 'الإدارة العامة',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.executive': true,
        'reports.operations': true,
        'reports.financial': true,
        'reports.complaints': true,
        'reports.parts': true,
        'reports.customers': true,
        'reports.technical': true,
        'reports.ai_logs': true,
        'reports.media': true,
        'customers.lookup': true,
        'customers.full_numbers': true,
        'conversations.read_summaries': true,
        'conversations.read_full': true,
        'handoff.manage': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'groups.ask_reports': true,
        'groups.receive_auto_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'تنفيذي',
        allow_sensitive_reports: true,
        show_full_customer_numbers: false,
        allow_financial_reports: true,
        allow_technical_reports: true
      })
    },
    {
      role_key: 'technical_development_manager',
      role_label: 'مدير التطوير التقني',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.executive': true,
        'reports.operations': true,
        'reports.complaints': true,
        'reports.parts': true,
        'reports.customers': true,
        'reports.technical': true,
        'reports.ai_logs': true,
        'reports.media': true,
        'customers.lookup': true,
        'conversations.read_summaries': true,
        'conversations.read_full': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'bot.control_ai': true,
        'bot.control_rules': true,
        'groups.ask_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'تقني عميق',
        allow_sensitive_reports: true,
        allow_technical_reports: true
      })
    },
    {
      role_key: 'finance_manager',
      role_label: 'المدير المالي',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.executive': true,
        'reports.operations': true,
        'reports.financial': true,
        'reports.complaints': true,
        'reports.customers': true,
        'customers.lookup': true,
        'conversations.read_summaries': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'groups.ask_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'متوسط',
        allow_sensitive_reports: false,
        allow_financial_reports: true
      })
    },
    {
      role_key: 'operations_manager',
      role_label: 'مدير التشغيل',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.operations': true,
        'reports.complaints': true,
        'reports.parts': true,
        'reports.customers': true,
        'reports.media': true,
        'customers.lookup': true,
        'conversations.read_summaries': true,
        'handoff.manage': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'groups.ask_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'متوسط'
      })
    },
    {
      role_key: 'center_manager',
      role_label: 'مدير المركز',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.operations': true,
        'reports.complaints': true,
        'reports.customers': true,
        'customers.lookup': true,
        'conversations.read_summaries': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'groups.ask_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'متوسط'
      })
    },
    {
      role_key: 'marketing_manager',
      role_label: 'مدير التسويق',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.customers': true,
        'reports.parts': true,
        'reports.complaints': true,
        'conversations.read_summaries': true,
        'bot.ask_private': true,
        'bot.ask_group': true,
        'groups.ask_reports': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'مختصر',
        show_full_customer_numbers: false
      })
    },
    {
      role_key: 'viewer',
      role_label: 'مشاهد',
      default_permissions_json: JSON.stringify({
        'reports.daily': true,
        'reports.executive': true,
        'bot.ask_group': true
      }),
      default_policy_json: JSON.stringify({
        report_detail_level: 'مختصر'
      })
    },
    {
      role_key: 'custom',
      role_label: 'مخصص',
      default_permissions_json: JSON.stringify({}),
      default_policy_json: JSON.stringify({
        report_detail_level: 'متوسط'
      })
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO role_templates (role_key, role_label, default_permissions_json, default_policy_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(role_key)
    DO UPDATE SET
      role_label = excluded.role_label,
      default_permissions_json = excluded.default_permissions_json,
      default_policy_json = excluded.default_policy_json,
      updated_at = datetime('now')
  `);

  const tx = db.transaction(() => {
    templates.forEach((t) => stmt.run(t.role_key, t.role_label, t.default_permissions_json, t.default_policy_json));
  });
  tx();
}

function ensurePeoplePlaceholder() {
  const existing = db.prepare('SELECT id FROM people WHERE normalized_phone = ?').get('966500000000');
  if (existing) return;

  db.prepare(`
    INSERT INTO people (
      full_name, preferred_name, title, role_key, role_label, phone, normalized_phone,
      whatsapp_jid, enabled, is_vip, greeting_style, private_reply_enabled, group_reply_enabled, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, 0, ?, datetime('now'), datetime('now'))
  `).run(
    'مثال مدير مالي',
    'مثال',
    'المدير المالي',
    'finance_manager',
    'المدير المالي',
    '9665XXXXXXXX',
    '966500000000',
    '966500000000@s.whatsapp.net',
    'مهني',
    'عينة افتراضية غير مفعلة'
  );
}

function normalizeOwnerPhone(input = '') {
  const digits = String(input || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('966') && digits.length === 12) return digits;
  if (digits.startsWith('05') && digits.length === 10) return `966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `966${digits}`;
  return digits;
}

function ensureSystemOwner() {
  const ownerPhone = process.env.OWNER_PHONE || '0578448146';
  const normalizedPhone = process.env.OWNER_NORMALIZED_PHONE || normalizeOwnerPhone(ownerPhone) || '966578448146';
  const ownerJid = `${normalizedPhone}@s.whatsapp.net`;
  const ownerLid = (process.env.OWNER_LID || '271352091164856@lid').toLowerCase();
  const ownerRawLid = ownerLid.replace(/@lid$/i, '');

  const existing = db.prepare(`
    SELECT *
    FROM people
    WHERE normalized_phone = ?
       OR whatsapp_jid = ?
       OR full_name = ?
    ORDER BY id ASC
    LIMIT 1
  `).get(normalizedPhone, ownerJid, OWNER_PROFILE.full_name);

  let ownerId = null;
  if (existing) {
    db.prepare(`
      UPDATE people
      SET full_name = ?, preferred_name = ?, title = ?, role_key = ?, role_label = ?,
          phone = ?, normalized_phone = ?, whatsapp_jid = ?, enabled = 1, is_vip = 1,
          private_reply_enabled = 1, group_reply_enabled = 1, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      OWNER_PROFILE.full_name,
      OWNER_PROFILE.preferred_name,
      OWNER_PROFILE.title,
      OWNER_PROFILE.role_key,
      OWNER_PROFILE.role_label,
      ownerPhone,
      normalizedPhone,
      ownerJid,
      existing.id
    );
    ownerId = existing.id;
  } else {
    const inserted = db.prepare(`
      INSERT INTO people (
        full_name, preferred_name, title, role_key, role_label, phone, normalized_phone, whatsapp_jid,
        enabled, is_vip, greeting_style, private_reply_enabled, group_reply_enabled, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 'تقني', 1, 1, ?, datetime('now'), datetime('now'))
    `).run(
      OWNER_PROFILE.full_name,
      OWNER_PROFILE.preferred_name,
      OWNER_PROFILE.title,
      OWNER_PROFILE.role_key,
      OWNER_PROFILE.role_label,
      ownerPhone,
      normalizedPhone,
      ownerJid,
      'Owner seeded automatically'
    );
    ownerId = Number(inserted.lastInsertRowid);
  }

  const identifierCandidates = [
    { type: 'phone', value: ownerPhone },
    { type: 'normalized_phone', value: normalizedPhone },
    { type: 'jid', value: ownerJid },
    { type: 'lid', value: ownerLid },
    { type: 'lid', value: ownerRawLid }
  ];

  OWNER_IDENTIFIERS.forEach((item) => {
    const val = String(item || '').trim().toLowerCase();
    if (!val) return;
    if (val.endsWith('@lid')) identifierCandidates.push({ type: 'lid', value: val });
    else if (val.includes('@')) identifierCandidates.push({ type: 'jid', value: val });
    else if (/^\d+$/.test(val) && val.length > 12) identifierCandidates.push({ type: 'lid', value: val });
    else if (/^\d+$/.test(val)) identifierCandidates.push({ type: 'phone', value: val });
  });

  const uniqueMap = new Map();
  identifierCandidates.forEach((row) => {
    const key = `${row.type}:${row.value}`;
    uniqueMap.set(key, row);
  });

  const upsertIdentifier = db.prepare(`
    INSERT INTO person_identifiers (
      person_id, identifier_type, identifier_value, verified, confidence, source, created_at, updated_at
    )
    VALUES (?, ?, ?, 1, 100, 'owner_seed', datetime('now'), datetime('now'))
    ON CONFLICT(identifier_type, identifier_value)
    DO UPDATE SET
      person_id = excluded.person_id,
      verified = 1,
      confidence = 100,
      source = 'owner_seed',
      updated_at = datetime('now')
  `);
  uniqueMap.forEach((row) => {
    upsertIdentifier.run(ownerId, row.type, row.value);
  });

  const permissionKeys = db.prepare('SELECT DISTINCT permission_key FROM person_permissions').all().map((r) => r.permission_key);
  const upsertPermission = db.prepare(`
    INSERT INTO person_permissions (person_id, permission_key, allowed, created_at, updated_at)
    VALUES (?, ?, 1, datetime('now'), datetime('now'))
    ON CONFLICT(person_id, permission_key)
    DO UPDATE SET allowed = 1, updated_at = datetime('now')
  `);
  permissionKeys.forEach((key) => upsertPermission.run(ownerId, key));

  db.prepare(`
    INSERT INTO person_interaction_policies (
      person_id, private_tone, group_tone, custom_greeting, custom_system_instruction,
      report_detail_level, show_full_customer_numbers, allow_sensitive_reports, allow_financial_reports,
      allow_technical_reports, allow_customer_lookup, allow_conversation_lookup, allow_bot_control,
      created_at, updated_at
    )
    VALUES (?, 'تقني واحترافي', 'قيادي وتقني', 'حياك الله أستاذ عباوي، جاهز معك.', 'هذا المستخدم مالك النظام وله صلاحيات كاملة، قدم له تفاصيل تقنية وإدارية أعمق عند الطلب.', 'تقني عميق', 1, 1, 1, 1, 1, 1, 1, datetime('now'), datetime('now'))
    ON CONFLICT(person_id)
    DO UPDATE SET
      private_tone = excluded.private_tone,
      group_tone = excluded.group_tone,
      custom_greeting = excluded.custom_greeting,
      custom_system_instruction = excluded.custom_system_instruction,
      report_detail_level = excluded.report_detail_level,
      show_full_customer_numbers = 1,
      allow_sensitive_reports = 1,
      allow_financial_reports = 1,
      allow_technical_reports = 1,
      allow_customer_lookup = 1,
      allow_conversation_lookup = 1,
      allow_bot_control = 1,
      updated_at = datetime('now')
  `).run(ownerId);
}

function ensureSetupStateRow() {
  const row = db.prepare('SELECT id FROM setup_state ORDER BY id ASC LIMIT 1').get();
  if (!row) {
    db.prepare(`
      INSERT INTO setup_state (completed, completed_at, created_at, updated_at)
      VALUES (0, NULL, datetime('now'), datetime('now'))
    `).run();
  }
}

function ensureAiProviderSettingsRow() {
  const row = db.prepare('SELECT id FROM ai_provider_settings ORDER BY id ASC LIMIT 1').get();
  if (!row) {
    db.prepare(`
      INSERT INTO ai_provider_settings (
        provider, api_key_encrypted, api_key_masked, base_url, model,
        temperature, max_output_tokens, ai_mode, enabled, created_at, updated_at
      )
      VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(
      process.env.AI_PROVIDER || 'custom_openai_compatible',
      process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
      process.env.AI_MODEL || 'openai/gpt-4o-mini',
      Number(process.env.AI_TEMPERATURE || 0.4),
      Number(process.env.AI_MAX_OUTPUT_TOKENS || 1200),
      process.env.AI_MODE || 'ai_first'
    );
  }
}

function ensureCompanyProfileRow() {
  const row = db.prepare('SELECT id FROM company_profile ORDER BY id ASC LIMIT 1').get();
  if (!row) {
    const d = getDefaultCompany();
    db.prepare(`
      INSERT INTO company_profile (
        company_name, contact_number, business_description,
        general_manager, company_responsible, center_manager, center_manager_current, center_manager_notes,
        company_location_title, company_location_url,
        center_location_title, center_location_url,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      d.company_name,
      d.company_contact_number,
      d.company_field,
      d.management_general_manager,
      d.management_company_manager,
      d.management_center_manager,
      d.management_center_manager_current,
      d.management_center_manager_notes,
      d.location_company_name,
      d.location_company_map_url,
      d.location_center_name,
      d.location_center_map_url
    );
  }
}

function syncCompanySettingsAndProfile() {
  const profile = db.prepare('SELECT * FROM company_profile ORDER BY id ASC LIMIT 1').get();
  if (!profile) return;

  const syncMap = {
    company_name: profile.company_name,
    company_contact_number: profile.contact_number,
    company_field: profile.business_description,
    management_general_manager: profile.general_manager,
    management_company_manager: profile.company_responsible,
    management_center_manager: profile.center_manager_current || profile.center_manager,
    management_center_manager_notes: profile.center_manager_notes || '',
    location_company_name: profile.company_location_title,
    location_company_map_url: profile.company_location_url,
    location_center_name: profile.center_location_title,
    location_center_map_url: profile.center_location_url
  };

  Object.entries(syncMap).forEach(([key, value]) => {
    if (value) upsertSetting(key, value);
  });
}

function applyLegacyMigration() {
  const map = db.prepare('SELECT key, value FROM settings').all().reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  if (map.company_contact_number === '0553011930') {
    upsertSetting('company_contact_number', '0578448146');
  }

  if ((map.company_name || '').includes('صرح / Cars Space')) {
    upsertSetting('company_name', 'فضاء المحركات / Cars Space');
    upsertSetting('assistant_name', 'مساعد فضاء المحركات');
    upsertSetting('welcome_reply', 'وعليكم السلام ورحمة الله وبركاته 👋\nحياك الله في فضاء المحركات. كيف نقدر نخدمك؟');
    upsertSetting('assistant_prompt', getDefaultSystemPrompt());
  }
}

function initDatabase() {
  runSchema();
  ensureMigrations();
  insertDefaultSettings();
  upsertDefaultRules();
  insertDefaultKnowledgeEntries();
  insertDefaultRoleTemplates();
  ensurePeoplePlaceholder();
  ensureSystemOwner();
  ensureSetupStateRow();
  ensureAiProviderSettingsRow();
  ensureCompanyProfileRow();
  applyLegacyMigration();
  syncCompanySettingsAndProfile();
}

module.exports = {
  db,
  initDatabase,
  upsertSetting,
  getDefaultSystemPrompt
};
