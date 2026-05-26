const { db } = require('../database/db');
const { addLog } = require('./logsService');
const {
  normalizePhone,
  normalizeJid,
  normalizeIdentifierForLookup,
  getPersonByWhatsAppJid,
  getPersonByNormalizedPhone,
  getPersonPermissionsMap,
  getPersonPolicy
} = require('./peopleService');
const { OWNER_IDENTIFIERS, OWNER_PROFILE, normalizeIdentifier } = require('../config/ownerConfig');

const greetingCache = new Map();
const OWNER_IDENTIFIER_SET = new Set(OWNER_IDENTIFIERS.map(normalizeIdentifier));

function ensureOwnerPermissionMap() {
  const keys = db.prepare('SELECT DISTINCT permission_key FROM person_permissions').all().map((r) => r.permission_key);
  const map = {};
  keys.forEach((key) => {
    map[key] = true;
  });
  map['admin.super'] = true;
  map['groups.ask_reports'] = true;
  map['bot.ask_group'] = true;
  map['bot.ask_private'] = true;
  map['bot.control_settings'] = true;
  map['bot.control_ai'] = true;
  map['bot.control_rules'] = true;
  map['admin.people_manage'] = true;
  return map;
}

function extractIdentifiers({ remoteJid = '', participantJid = '', participantPn = '', participantLid = '' } = {}) {
  const identifiers = new Set();
  const add = (value) => {
    const normalized = normalizeIdentifier(value);
    if (normalized) identifiers.add(normalized);
  };

  add(remoteJid);
  add(participantJid);
  add(participantPn);
  add(participantLid);

  const normalizedRemotePhone = normalizeJid(remoteJid);
  const normalizedParticipantPhone = normalizeJid(participantJid);
  const normalizedPn = normalizePhone(participantPn);

  if (normalizedRemotePhone) {
    add(normalizedRemotePhone);
    add(`${normalizedRemotePhone}@s.whatsapp.net`);
  }
  if (normalizedParticipantPhone) {
    add(normalizedParticipantPhone);
    add(`${normalizedParticipantPhone}@s.whatsapp.net`);
  }
  if (normalizedPn) {
    add(normalizedPn);
    add(`${normalizedPn}@s.whatsapp.net`);
  }

  const lidRaw = String(participantJid || '').toLowerCase().split('@')[0];
  if ((participantJid || '').toLowerCase().endsWith('@lid') && lidRaw) {
    add(lidRaw);
  }
  if ((remoteJid || '').toLowerCase().endsWith('@lid')) {
    add(String(remoteJid).toLowerCase().split('@')[0]);
  }

  return Array.from(identifiers);
}

function loadPersonByIdentifiers(identifiers = []) {
  for (const id of identifiers) {
    const byJid = getPersonByWhatsAppJid(id);
    if (byJid) return byJid;

    const phone = normalizePhone(id);
    if (phone) {
      const byPhone = getPersonByNormalizedPhone(phone);
      if (byPhone) return byPhone;
      const byRawPhone = db.prepare('SELECT * FROM people WHERE phone = ? AND enabled = 1 LIMIT 1').get(id);
      if (byRawPhone) return byRawPhone;
    }
  }
  return null;
}

function resolveSenderIdentity({ msg = null, remoteJid = '', participantJid = '', pushName = '', participantPn = '', participantLid = '' } = {}) {
  const rawRemote = String(remoteJid || msg?.key?.remoteJid || '').trim();
  const rawParticipant = String(participantJid || msg?.key?.participant || msg?.participant || '').trim();
  const effectiveParticipant = rawParticipant || rawRemote;
  const effectivePn = String(participantPn || msg?.participant_pn || '').trim();
  const effectiveLid = String(participantLid || msg?.participant_lid || '').trim();
  const normalizedPhone = normalizePhone(effectivePn) || normalizeJid(effectiveParticipant) || normalizeJid(rawRemote) || '';
  const lid = String(effectiveLid || (effectiveParticipant.toLowerCase().endsWith('@lid') ? effectiveParticipant : '')).trim().toLowerCase();

  const identifiers = extractIdentifiers({
    remoteJid: rawRemote,
    participantJid: effectiveParticipant,
    participantPn: effectivePn,
    participantLid: effectiveLid
  });

  const matchedOwnerIds = identifiers.filter((id) => OWNER_IDENTIFIER_SET.has(id));
  if (matchedOwnerIds.length) {
    addLog('info', 'identity', 'Recognized owner identity', {
      matched: matchedOwnerIds,
      remoteJid: rawRemote,
      participantJid: effectiveParticipant
    });
    return {
      isKnown: true,
      known: true,
      isOwner: true,
      isSuperAdmin: true,
      personId: null,
      fullName: OWNER_PROFILE.full_name,
      preferredName: OWNER_PROFILE.preferred_name,
      title: OWNER_PROFILE.title,
      roleKey: OWNER_PROFILE.role_key,
      roleLabel: OWNER_PROFILE.role_label,
      permissions: ensureOwnerPermissionMap(),
      policy: {
        report_detail_level: 'تقني عميق',
        allow_sensitive_reports: 1,
        show_full_customer_numbers: 1,
        allow_financial_reports: 1,
        allow_technical_reports: 1,
        allow_customer_lookup: 1,
        allow_conversation_lookup: 1,
        allow_bot_control: 1,
        custom_greeting: 'حياك الله أستاذ عباوي، جاهز معك.'
      },
      person: {
        id: null,
        full_name: OWNER_PROFILE.full_name,
        preferred_name: OWNER_PROFILE.preferred_name,
        title: OWNER_PROFILE.title,
        role_key: OWNER_PROFILE.role_key,
        role_label: OWNER_PROFILE.role_label,
        enabled: 1,
        private_reply_enabled: 1,
        group_reply_enabled: 1,
        is_vip: 1
      },
      identifiersMatched: matchedOwnerIds,
      senderJid: effectiveParticipant,
      normalizedPhone,
      raw: {
        remoteJid: rawRemote,
        participantJid: effectiveParticipant,
        normalizedPhone,
        lid,
        pushName
      }
    };
  }

  const person = loadPersonByIdentifiers(identifiers);
  if (person && person.enabled) {
    const permissions = getPersonPermissionsMap(person.id);
    const policy = getPersonPolicy(person.id) || {};
    const matched = identifiers.filter((id) => {
      if (normalizeIdentifier(person.whatsapp_jid) === id) return true;
      if (normalizeIdentifier(person.normalized_phone) === id) return true;
      if (normalizeIdentifier(person.phone) === id) return true;
      return false;
    });

    addLog('info', 'identity', `Recognized person: ${person.full_name || person.preferred_name || person.normalized_phone} / ${person.role_key}`, {
      person_id: person.id,
      senderJid: effectiveParticipant,
      matched
    });

    return {
      isKnown: true,
      known: true,
      isOwner: false,
      isSuperAdmin: false,
      personId: person.id,
      fullName: person.full_name,
      preferredName: person.preferred_name,
      title: person.title,
      roleKey: person.role_key,
      roleLabel: person.role_label,
      permissions,
      policy,
      person,
      identifiersMatched: matched,
      senderJid: effectiveParticipant,
      normalizedPhone,
      raw: {
        remoteJid: rawRemote,
        participantJid: effectiveParticipant,
        normalizedPhone,
        lid,
        pushName
      }
    };
  }

  return {
    isKnown: false,
    known: false,
    isOwner: false,
    isSuperAdmin: false,
    personId: null,
    fullName: '',
    preferredName: '',
    title: '',
    roleKey: '',
    roleLabel: '',
    permissions: {},
    policy: {},
    person: null,
    identifiersMatched: [],
    senderJid: effectiveParticipant,
    normalizedPhone,
    raw: {
      remoteJid: rawRemote,
      participantJid: effectiveParticipant,
      normalizedPhone,
      lid,
      pushName
    }
  };
}

function resolveIdentityFromParsed(parsed = {}) {
  return resolveSenderIdentity({
    msg: parsed.raw || null,
    remoteJid: parsed.jid || '',
    participantJid: parsed.isGroup ? parsed.participant : parsed.jid,
    pushName: parsed.pushName || '',
    participantPn: parsed.participantPn || '',
    participantLid: parsed.participantLid || ''
  });
}

function can(identity, permissionKey) {
  if (!identity?.isKnown) return false;
  if (identity.isOwner || identity.isSuperAdmin) return true;
  return Boolean(identity.permissions?.[permissionKey]);
}

function resolveReportPermission(reportType = 'daily_summary') {
  const map = {
    daily_summary: 'reports.daily',
    executive_summary: 'reports.executive',
    operations: 'reports.operations',
    financial_summary: 'reports.financial',
    complaints: 'reports.complaints',
    parts: 'reports.parts',
    customers: 'reports.customers',
    technical_report: 'reports.technical',
    ai_logs: 'reports.ai_logs',
    media: 'reports.media',
    open_requests: 'reports.operations',
    hourly_summary: 'reports.daily'
  };
  return map[reportType] || 'reports.daily';
}

function getPersonDisplayName(person = null) {
  if (!person) return '';
  return person.preferred_name || person.full_name || person.title || person.normalized_phone || 'المستخدم';
}

function shouldUseGreeting(personKey, channelKey) {
  const key = `${personKey}:${channelKey}`;
  const now = Date.now();
  const last = greetingCache.get(key) || 0;
  if (now - last < 30 * 60 * 1000) return false;
  greetingCache.set(key, now);
  return true;
}

function buildGreeting(identity, contextType = 'group') {
  if (!identity?.isKnown) return '';
  const name = identity.preferredName || identity.fullName || 'أستاذنا';
  const custom = String(identity.policy?.custom_greeting || '').trim();
  if (custom) return custom;

  if (identity.isOwner) return `حياك الله أستاذ ${name}، جاهز معك.`;
  if (identity.roleKey === 'technical_development_manager') return `حياك الله أستاذ ${name}، حاضر.`;
  if (identity.roleKey === 'finance_manager') return `حياك الله أستاذ ${name}، هذا ملخص الأرقام.`;
  if (identity.roleKey === 'operations_manager') return `حياك الله أستاذ ${name}، هذه حالة التشغيل.`;
  if (identity.roleKey === 'marketing_manager') return `حياك الله أستاذ ${name}، هذا ملخص اهتمامات العملاء.`;
  if (identity.roleKey === 'general_manager') return `حياك الله أستاذ ${name}، أبشر.`;
  return contextType === 'private' ? `حياك الله أستاذ ${name}.` : `حياك الله أستاذ ${name}، أبشر.`;
}

function personalizeReply(identity, baseReply, { channelKey = '', forceGreeting = false, contextType = 'group' } = {}) {
  if (!identity?.isKnown) return baseReply;
  const personKey = identity.personId || (identity.isOwner ? 'system_owner' : 'known');
  const allowGreeting = forceGreeting || shouldUseGreeting(personKey, channelKey || contextType);
  if (!allowGreeting) return baseReply;
  const greeting = buildGreeting(identity, contextType);
  return greeting ? `${greeting}\n${baseReply}` : baseReply;
}

module.exports = {
  resolveSenderIdentity,
  resolveIdentityFromParsed,
  can,
  resolveReportPermission,
  getPersonDisplayName,
  shouldUseGreeting,
  buildGreeting,
  personalizeReply,
  normalizePhone
};
