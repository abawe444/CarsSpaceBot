const { db } = require('../database/db');

const PERMISSION_KEYS = [
  'reports.daily',
  'reports.executive',
  'reports.operations',
  'reports.financial',
  'reports.complaints',
  'reports.parts',
  'reports.customers',
  'reports.technical',
  'reports.ai_logs',
  'reports.media',
  'customers.lookup',
  'customers.full_numbers',
  'conversations.read_summaries',
  'conversations.read_full',
  'handoff.manage',
  'bot.ask_private',
  'bot.ask_group',
  'bot.control_settings',
  'bot.control_ai',
  'bot.control_rules',
  'groups.ask_reports',
  'groups.receive_auto_reports',
  'admin.people_manage'
];

const PERMISSION_LABELS_AR = {
  'reports.daily': 'تقارير يومية',
  'reports.executive': 'تقارير تنفيذية',
  'reports.operations': 'تقارير تشغيلية',
  'reports.financial': 'تقارير مالية',
  'reports.complaints': 'تقارير الشكاوى',
  'reports.parts': 'تقارير قطع الغيار',
  'reports.customers': 'تقارير العملاء',
  'reports.technical': 'تقارير تقنية',
  'reports.ai_logs': 'تقارير سجلات الذكاء',
  'reports.media': 'تقارير الوسائط',
  'customers.lookup': 'بحث العملاء',
  'customers.full_numbers': 'عرض أرقام العملاء كاملة',
  'conversations.read_summaries': 'قراءة ملخصات المحادثات',
  'conversations.read_full': 'قراءة المحادثات كاملة',
  'handoff.manage': 'إدارة التدخل البشري',
  'bot.ask_private': 'استخدام المساعد في الخاص',
  'bot.ask_group': 'استخدام المساعد في المجموعات',
  'bot.control_settings': 'التحكم بالإعدادات',
  'bot.control_ai': 'التحكم بإعدادات الذكاء',
  'bot.control_rules': 'التحكم بقواعد الردود',
  'groups.ask_reports': 'طلب تقارير في المجموعات',
  'groups.receive_auto_reports': 'استلام تقارير تلقائية',
  'admin.people_manage': 'إدارة الأشخاص والصلاحيات'
};

const ROLE_TEMPLATES = [
  {
    role_key: 'general_manager',
    role_label: 'الإدارة العامة',
    default_permissions_json: {
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
    },
    default_policy_json: {
      report_detail_level: 'تنفيذي',
      allow_sensitive_reports: true,
      show_full_customer_numbers: false,
      allow_financial_reports: true,
      allow_technical_reports: true
    }
  },
  {
    role_key: 'technical_development_manager',
    role_label: 'مدير التطوير التقني',
    default_permissions_json: {
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
    },
    default_policy_json: {
      report_detail_level: 'تقني عميق',
      allow_sensitive_reports: true,
      show_full_customer_numbers: false,
      allow_technical_reports: true
    }
  },
  {
    role_key: 'finance_manager',
    role_label: 'المدير المالي',
    default_permissions_json: {
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
    },
    default_policy_json: {
      report_detail_level: 'متوسط',
      allow_sensitive_reports: false,
      allow_financial_reports: true,
      show_full_customer_numbers: false
    }
  },
  {
    role_key: 'operations_manager',
    role_label: 'مدير التشغيل',
    default_permissions_json: {
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
    },
    default_policy_json: {
      report_detail_level: 'متوسط',
      allow_sensitive_reports: false
    }
  },
  {
    role_key: 'center_manager',
    role_label: 'مدير المركز',
    default_permissions_json: {
      'reports.daily': true,
      'reports.operations': true,
      'reports.complaints': true,
      'reports.customers': true,
      'customers.lookup': true,
      'conversations.read_summaries': true,
      'bot.ask_private': true,
      'bot.ask_group': true,
      'groups.ask_reports': true
    },
    default_policy_json: {
      report_detail_level: 'متوسط',
      allow_sensitive_reports: false
    }
  },
  {
    role_key: 'marketing_manager',
    role_label: 'مدير التسويق',
    default_permissions_json: {
      'reports.daily': true,
      'reports.customers': true,
      'reports.parts': true,
      'reports.complaints': true,
      'conversations.read_summaries': true,
      'bot.ask_private': true,
      'bot.ask_group': true,
      'groups.ask_reports': true
    },
    default_policy_json: {
      report_detail_level: 'مختصر',
      allow_sensitive_reports: false,
      show_full_customer_numbers: false
    }
  },
  {
    role_key: 'viewer',
    role_label: 'مشاهد',
    default_permissions_json: {
      'reports.daily': true,
      'reports.executive': true,
      'bot.ask_group': true
    },
    default_policy_json: {
      report_detail_level: 'مختصر',
      allow_sensitive_reports: false,
      show_full_customer_numbers: false
    }
  },
  {
    role_key: 'custom',
    role_label: 'مخصص',
    default_permissions_json: {},
    default_policy_json: {
      report_detail_level: 'متوسط',
      allow_sensitive_reports: false,
      show_full_customer_numbers: false
    }
  }
];

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePhone(input = '') {
  let digits = String(input || '').replace(/[^\d]/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('966') && digits.length === 12) return digits;
  if (digits.startsWith('05') && digits.length === 10) return `966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `966${digits}`;
  if (digits.startsWith('9660') && digits.length === 13) return `966${digits.slice(4)}`;
  if (digits.length > 12) return '';
  return digits;
}

function normalizeJid(jid = '') {
  const raw = String(jid || '').trim().toLowerCase();
  if (!raw || raw.endsWith('@g.us')) return '';
  if (raw.endsWith('@lid') || raw.endsWith('@hosted.lid')) return '';
  if (!raw.endsWith('@s.whatsapp.net') && !raw.endsWith('@c.us') && !raw.endsWith('@hosted')) return '';
  const phone = raw.split('@')[0].split(':')[0];
  return normalizePhone(phone);
}

function normalizeIdentifierValue(input = '') {
  return String(input || '').trim().toLowerCase();
}

function normalizeIdentifierForLookup(input = '') {
  const raw = normalizeIdentifierValue(input);
  if (!raw) return '';
  if (raw.endsWith('@g.us')) return raw;
  if (raw.endsWith('@lid') || raw.endsWith('@hosted.lid')) return raw.split(':')[0];
  if (raw.endsWith('@s.whatsapp.net') || raw.endsWith('@c.us') || raw.endsWith('@hosted')) {
    return raw.split(':')[0];
  }
  const normalizedPhone = normalizePhone(raw);
  return normalizedPhone || raw.split(':')[0];
}

function detectIdentifierType(input = '') {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return 'unknown';
  if (value.endsWith('@lid') || value.endsWith('@hosted.lid')) return 'lid';
  if (value.endsWith('@g.us')) return 'group_jid';
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@c.us') || value.endsWith('@hosted')) return 'jid';
  if (/^\d+$/.test(value) && normalizePhone(value)) return 'phone';
  return 'unknown';
}

function phoneToWhatsAppJid(normalizedPhone = '') {
  return normalizedPhone ? `${normalizedPhone}@s.whatsapp.net` : '';
}

function getRoleTemplates() {
  const rows = db.prepare('SELECT * FROM role_templates ORDER BY id ASC').all();
  return rows.map((r) => ({
    ...r,
    default_permissions_json: parseJson(r.default_permissions_json, {}),
    default_policy_json: parseJson(r.default_policy_json, {})
  }));
}

function getRoleTemplate(roleKey = 'viewer') {
  const row = db.prepare('SELECT * FROM role_templates WHERE role_key = ?').get(roleKey);
  if (!row) {
    const fallback = ROLE_TEMPLATES.find((r) => r.role_key === roleKey) || ROLE_TEMPLATES.find((r) => r.role_key === 'viewer');
    return fallback;
  }
  return {
    ...row,
    default_permissions_json: parseJson(row.default_permissions_json, {}),
    default_policy_json: parseJson(row.default_policy_json, {})
  };
}

function listPeople(filters = {}) {
  let sql = `
    SELECT p.*,
      (SELECT COUNT(*) FROM person_permissions pp WHERE pp.person_id = p.id AND pp.allowed = 1) AS permissions_count,
      (SELECT MAX(created_at) FROM person_audit_logs pa WHERE pa.person_id = p.id) AS last_interaction
    FROM people p
    WHERE 1=1
  `;
  const args = [];

  if (filters.search) {
    sql += ' AND (p.full_name LIKE ? OR p.preferred_name LIKE ? OR p.phone LIKE ? OR p.normalized_phone LIKE ? OR p.role_label LIKE ?)';
    const q = `%${filters.search}%`;
    args.push(q, q, q, q, q);
  }
  if (filters.role) {
    sql += ' AND p.role_key = ?';
    args.push(filters.role);
  }
  if (filters.enabled === 'true' || filters.enabled === 'false') {
    sql += ' AND p.enabled = ?';
    args.push(filters.enabled === 'true' ? 1 : 0);
  }
  if (filters.vip === 'true' || filters.vip === 'false') {
    sql += ' AND p.is_vip = ?';
    args.push(filters.vip === 'true' ? 1 : 0);
  }

  sql += ' ORDER BY p.enabled DESC, p.is_vip DESC, datetime(p.updated_at) DESC';
  return db.prepare(sql).all(...args);
}

function getPersonById(id) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(id));
  if (!person) return null;
  return {
    ...person,
    permissions: getPersonPermissionsMap(person.id),
    interaction_policy: getPersonPolicy(person.id)
  };
}

function getPersonByNormalizedPhone(normalizedPhone = '') {
  return db.prepare('SELECT * FROM people WHERE normalized_phone = ? AND enabled = 1').get(normalizedPhone);
}

function getPersonByWhatsAppJid(jid = '') {
  const normalizedLookup = normalizeIdentifierForLookup(jid);
  if (normalizedLookup) {
    const byIdentifier = db
      .prepare(`
        SELECT p.*
        FROM person_identifiers i
        JOIN people p ON p.id = i.person_id
        WHERE i.identifier_value = ?
          AND p.enabled = 1
        ORDER BY i.id DESC
        LIMIT 1
      `)
      .get(normalizedLookup);
    if (byIdentifier) return byIdentifier;
  }

  const direct = db
    .prepare(`
      SELECT p.*
      FROM person_identifiers i
      JOIN people p ON p.id = i.person_id
      WHERE i.identifier_type = 'jid'
        AND i.identifier_value = ?
        AND p.enabled = 1
      LIMIT 1
    `)
    .get(normalizeIdentifierValue(jid));
  if (direct) return direct;

  const normalized = normalizeJid(jid);
  if (!normalized) return null;
  return getPersonByNormalizedPhone(normalized);
}

function upsertPersonIdentifier(personId, identifierType, identifierValue) {
  const val = normalizeIdentifierForLookup(identifierValue);
  if (!personId || !identifierType || !val) return;
  db.prepare(`
    INSERT INTO person_identifiers (
      person_id, identifier_type, identifier_value, source, verified, confidence, created_at, updated_at
    )
    VALUES (?, ?, ?, 'people_service', 1, 100, datetime('now'), datetime('now'))
    ON CONFLICT(identifier_type, identifier_value)
    DO UPDATE SET
      person_id = excluded.person_id,
      source = excluded.source,
      verified = excluded.verified,
      confidence = excluded.confidence,
      updated_at = datetime('now')
  `).run(personId, detectIdentifierType(val) === 'lid' ? 'lid' : identifierType, val);
}

function ensurePolicy(personId, seed = {}) {
  const existing = db.prepare('SELECT * FROM person_interaction_policies WHERE person_id = ?').get(personId);
  const base = {
    private_tone: seed.private_tone || 'مهني ولبق',
    group_tone: seed.group_tone || 'مهني مختصر',
    custom_greeting: seed.custom_greeting || '',
    custom_system_instruction: seed.custom_system_instruction || '',
    report_detail_level: seed.report_detail_level || 'متوسط',
    show_full_customer_numbers: seed.show_full_customer_numbers ? 1 : 0,
    allow_sensitive_reports: seed.allow_sensitive_reports ? 1 : 0,
    allow_financial_reports: seed.allow_financial_reports ? 1 : 0,
    allow_technical_reports: seed.allow_technical_reports ? 1 : 0,
    allow_customer_lookup: seed.allow_customer_lookup ? 1 : 0,
    allow_conversation_lookup: seed.allow_conversation_lookup ? 1 : 0,
    allow_bot_control: seed.allow_bot_control ? 1 : 0
  };

  if (!existing) {
    db.prepare(`
      INSERT INTO person_interaction_policies (
        person_id, private_tone, group_tone, custom_greeting, custom_system_instruction,
        report_detail_level, show_full_customer_numbers, allow_sensitive_reports,
        allow_financial_reports, allow_technical_reports, allow_customer_lookup,
        allow_conversation_lookup, allow_bot_control, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      personId,
      base.private_tone,
      base.group_tone,
      base.custom_greeting,
      base.custom_system_instruction,
      base.report_detail_level,
      base.show_full_customer_numbers,
      base.allow_sensitive_reports,
      base.allow_financial_reports,
      base.allow_technical_reports,
      base.allow_customer_lookup,
      base.allow_conversation_lookup,
      base.allow_bot_control
    );
    return;
  }

  db.prepare(`
    UPDATE person_interaction_policies
    SET private_tone = ?, group_tone = ?, custom_greeting = ?, custom_system_instruction = ?,
        report_detail_level = ?, show_full_customer_numbers = ?, allow_sensitive_reports = ?,
        allow_financial_reports = ?, allow_technical_reports = ?, allow_customer_lookup = ?,
        allow_conversation_lookup = ?, allow_bot_control = ?, updated_at = datetime('now')
    WHERE person_id = ?
  `).run(
    base.private_tone,
    base.group_tone,
    base.custom_greeting,
    base.custom_system_instruction,
    base.report_detail_level,
    base.show_full_customer_numbers,
    base.allow_sensitive_reports,
    base.allow_financial_reports,
    base.allow_technical_reports,
    base.allow_customer_lookup,
    base.allow_conversation_lookup,
    base.allow_bot_control,
    personId
  );
}

function getPersonPolicy(personId) {
  return db.prepare('SELECT * FROM person_interaction_policies WHERE person_id = ?').get(personId) || null;
}

function setPersonPermissions(personId, permissions = {}) {
  const tx = db.transaction(() => {
    PERMISSION_KEYS.forEach((key) => {
      const allowed = permissions[key] ? 1 : 0;
      db.prepare(`
        INSERT INTO person_permissions (person_id, permission_key, allowed, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(person_id, permission_key)
        DO UPDATE SET allowed = excluded.allowed, updated_at = datetime('now')
      `).run(personId, key, allowed);
    });
  });
  tx();
}

function getPersonPermissionsMap(personId) {
  const map = {};
  PERMISSION_KEYS.forEach((key) => {
    map[key] = false;
  });

  const rows = db.prepare('SELECT permission_key, allowed FROM person_permissions WHERE person_id = ?').all(personId);
  rows.forEach((r) => {
    map[r.permission_key] = Boolean(r.allowed);
  });
  return map;
}

function createPerson(payload = {}, actorJid = 'system') {
  const normalized = normalizePhone(payload.phone || payload.normalized_phone || '');
  if (!normalized) throw new Error('رقم واتساب غير صالح');

  const roleKey = payload.role_key || 'custom';
  const template = getRoleTemplate(roleKey);
  const roleLabel = payload.role_label || template.role_label || 'مخصص';

  const info = db.prepare(`
    INSERT INTO people (
      full_name, preferred_name, title, role_key, role_label,
      phone, normalized_phone, whatsapp_jid,
      enabled, is_vip, greeting_style, private_reply_enabled, group_reply_enabled, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    payload.full_name || '',
    payload.preferred_name || '',
    payload.title || '',
    roleKey,
    roleLabel,
    payload.phone || normalized,
    normalized,
    payload.whatsapp_jid || phoneToWhatsAppJid(normalized),
    payload.enabled === false ? 0 : 1,
    payload.is_vip ? 1 : 0,
    payload.greeting_style || 'مهني',
    payload.private_reply_enabled === false ? 0 : 1,
    payload.group_reply_enabled === false ? 0 : 1,
    payload.notes || ''
  );

  const personId = Number(info.lastInsertRowid);
  upsertPersonIdentifier(personId, 'jid', payload.whatsapp_jid || phoneToWhatsAppJid(normalized));
  upsertPersonIdentifier(personId, 'normalized_phone', normalized);
  upsertPersonIdentifier(personId, 'phone', payload.phone || normalized);
  const mergedPermissions = {
    ...(template.default_permissions_json || {}),
    ...(payload.permissions || {})
  };
  setPersonPermissions(personId, mergedPermissions);

  const policy = {
    ...(template.default_policy_json || {}),
    ...(payload.interaction_policy || {})
  };
  ensurePolicy(personId, policy);

  addPersonAudit({ personId, actorJid, action: 'create_person', details: { role_key: roleKey } });
  return getPersonById(personId);
}

function updatePerson(id, payload = {}, actorJid = 'system') {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(id));
  if (!person) return null;

  const normalized = normalizePhone(payload.phone ?? person.phone ?? person.normalized_phone);
  const roleKey = payload.role_key || person.role_key || 'custom';
  const template = getRoleTemplate(roleKey);

  db.prepare(`
    UPDATE people
    SET full_name = ?, preferred_name = ?, title = ?, role_key = ?, role_label = ?,
        phone = ?, normalized_phone = ?, whatsapp_jid = ?, enabled = ?, is_vip = ?,
        greeting_style = ?, private_reply_enabled = ?, group_reply_enabled = ?, notes = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    payload.full_name ?? person.full_name,
    payload.preferred_name ?? person.preferred_name,
    payload.title ?? person.title,
    roleKey,
    payload.role_label ?? person.role_label ?? template.role_label,
    payload.phone ?? person.phone,
    normalized,
    payload.whatsapp_jid || phoneToWhatsAppJid(normalized),
    payload.enabled === undefined ? person.enabled : (payload.enabled ? 1 : 0),
    payload.is_vip === undefined ? person.is_vip : (payload.is_vip ? 1 : 0),
    payload.greeting_style ?? person.greeting_style,
    payload.private_reply_enabled === undefined ? person.private_reply_enabled : (payload.private_reply_enabled ? 1 : 0),
    payload.group_reply_enabled === undefined ? person.group_reply_enabled : (payload.group_reply_enabled ? 1 : 0),
    payload.notes ?? person.notes,
    person.id
  );
  upsertPersonIdentifier(person.id, 'jid', payload.whatsapp_jid || phoneToWhatsAppJid(normalized));
  upsertPersonIdentifier(person.id, 'normalized_phone', normalized);
  upsertPersonIdentifier(person.id, 'phone', payload.phone || normalized);

  if (payload.permissions) {
    setPersonPermissions(person.id, payload.permissions);
  }
  if (payload.interaction_policy) {
    ensurePolicy(person.id, payload.interaction_policy);
  }

  addPersonAudit({ personId: person.id, actorJid, action: 'update_person', details: { role_key: roleKey } });
  return getPersonById(person.id);
}

function deletePerson(id, actorJid = 'system') {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(id));
  if (!person) return false;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM person_identifiers WHERE person_id = ?').run(person.id);
    db.prepare('DELETE FROM person_permissions WHERE person_id = ?').run(person.id);
    db.prepare('DELETE FROM person_interaction_policies WHERE person_id = ?').run(person.id);
    db.prepare('DELETE FROM person_audit_logs WHERE person_id = ?').run(person.id);
    db.prepare('DELETE FROM people WHERE id = ?').run(person.id);
  });
  tx();
  addPersonAudit({ personId: person.id, actorJid, action: 'delete_person', details: { full_name: person.full_name } });
  return true;
}

function addPersonAudit({ personId = null, actorJid = '', action = '', details = null }) {
  db.prepare(`
    INSERT INTO person_audit_logs (person_id, actor_jid, action, details_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(personId, actorJid || '', action || '', details ? JSON.stringify(details) : null);
}

function listPersonAudit(limit = 100) {
  return db.prepare(`
    SELECT a.*, p.full_name, p.role_label
    FROM person_audit_logs a
    LEFT JOIN people p ON p.id = a.person_id
    ORDER BY a.id DESC
    LIMIT ?
  `).all(Number(limit || 100));
}

function testIdentity(input = '') {
  const lookup = normalizeIdentifierForLookup(input || normalizeJid(input));
  if (!lookup) {
    return { matched: false, normalized_phone: '', reason: 'invalid_input' };
  }
  const person = getPersonByWhatsAppJid(lookup) || getPersonByNormalizedPhone(normalizePhone(lookup));
  if (!person) {
    return { matched: false, normalized_phone: normalizePhone(lookup), identifier: lookup };
  }
  return {
    matched: true,
    normalized_phone: normalizePhone(lookup),
    identifier: lookup,
    person: getPersonById(person.id)
  };
}

function importPeople(list = [], actorJid = 'system') {
  const created = [];
  list.forEach((item) => {
    try {
      const existing = getPersonByNormalizedPhone(normalizePhone(item.phone));
      if (existing) {
        created.push(updatePerson(existing.id, item, actorJid));
      } else {
        created.push(createPerson(item, actorJid));
      }
    } catch {
      // ignore bad rows
    }
  });
  return created;
}

module.exports = {
  PERMISSION_KEYS,
  PERMISSION_LABELS_AR,
  ROLE_TEMPLATES,
  normalizePhone,
  normalizeJid,
  normalizeIdentifierForLookup,
  detectIdentifierType,
  phoneToWhatsAppJid,
  getRoleTemplates,
  getRoleTemplate,
  listPeople,
  getPersonById,
  getPersonByNormalizedPhone,
  getPersonByWhatsAppJid,
  upsertPersonIdentifier,
  getPersonPermissionsMap,
  getPersonPolicy,
  setPersonPermissions,
  createPerson,
  updatePerson,
  deletePerson,
  addPersonAudit,
  listPersonAudit,
  testIdentity,
  importPeople
};
