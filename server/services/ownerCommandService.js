const { db } = require('../database/db');
const { getSettings, updateSettings } = require('./settingsService');
const { getPublicProviderSettings, testProviderConnection } = require('./aiProviderService');
const { buildReportByType } = require('./reportingService');
const { detectReportIntent, isReportTrigger } = require('./reportIntentService');
const { listAdminGroups, upsertAdminGroup } = require('./adminGroupService');
const { listPeople } = require('./peopleService');
const { addLog, getLogs } = require('./logsService');
const { getLastSkips } = require('./groupRouterService');
const { normalizeArabic } = require('./sanitizer');

function normalizeText(text = '') {
  return normalizeArabic(text)
    .replace(/[؟?]/g, '')
    .trim();
}

function hasAny(text = '', probes = []) {
  const n = normalizeText(text);
  return probes.some((p) => n.includes(normalizeText(p)));
}

function isOwnerCommand(text = '') {
  const n = normalizeText(text);
  if (!n) return false;

  const probes = [
    'من أنا',
    'فعّل هذه المجموعة',
    'فعل هذه المجموعة',
    'اجعل هذه مجموعة إدارة',
    'اجعل هذه مجموعة ادارة',
    'عطّل هذه المجموعة',
    'عطل هذه المجموعة',
    'اعرض المجموعات',
    'اعرض الأشخاص',
    'اعرض الاشخاص',
    'حالة النظام',
    'اختبر الذكاء',
    'لماذا لم ترد',
    'اعرض آخر الأخطاء',
    'اعرض اخر الاخطاء',
    'فعّل الرد في المجموعات',
    'فعل الرد في المجموعات',
    'تقرير اليوم',
    'وش وضع العملاء اليوم',
    'وش صار اليوم'
  ];

  return probes.some((c) => n.includes(normalizeText(c))) || isReportTrigger(text);
}

function chatTypeFromParsed(parsed) {
  return parsed?.isGroup ? 'group' : 'private';
}

function buildSystemStatusText(whatsappClient) {
  const settings = getSettings();
  const provider = getPublicProviderSettings();
  const status = whatsappClient.getStatus ? whatsappClient.getStatus() : { status: 'unknown' };
  const recentErrors = db.prepare(`
    SELECT source, message, created_at
    FROM logs
    WHERE level = 'error'
    ORDER BY id DESC
    LIMIT 5
  `).all();

  const errors = recentErrors.length
    ? recentErrors.map((e, i) => `${i + 1}. [${e.source}] ${e.message} (${e.created_at})`).join('\n')
    : 'لا توجد أخطاء حرجة حديثة.';

  return `حالة النظام الحالية:
واتساب: ${status.status || 'unknown'}
مزود الذكاء: ${provider.provider || settings.ai_provider}
النموذج: ${provider.model || settings.ai_model || '-'}
AI mode: ${provider.ai_mode || settings.ai_mode || '-'}
ENABLE_GROUPS: ${settings.enable_groups ? 'true' : 'false'}
ENABLE_ADMIN_GROUP_MODE: ${settings.enable_admin_group_mode ? 'true' : 'false'}
REPLY_ONLY_WHEN_MENTIONED: ${settings.reply_only_when_mentioned ? 'true' : 'false'}
OWNER_BYPASS_GROUP_RULES: ${settings.owner_bypass_group_rules ? 'true' : 'false'}

آخر الأخطاء:
${errors}`;
}

function buildIdentityText(identity, parsed) {
  return `حياك الله أستاذ ${identity.preferredName || identity.fullName || 'عباوي'}، تم التعرف عليك كمالك النظام.
الاسم: ${identity.fullName || '-'}
الدور: ${identity.roleLabel || '-'}
isSuperAdmin: ${identity.isSuperAdmin ? 'true' : 'false'}
المعرفات المطابقة: ${identity.identifiersMatched?.join(', ') || 'لا يوجد'}
نوع المحادثة: ${parsed.isGroup ? 'مجموعة' : 'خاص'}
remoteJid: ${parsed.jid}
participant: ${parsed.participant || parsed.jid}`;
}

function buildGroupsText() {
  const groups = listAdminGroups();
  if (!groups.length) return 'لا توجد مجموعات مكتشفة حتى الآن.';

  return `المجموعات الحالية:
${groups
  .map((g, i) => `${i + 1}. ${g.group_name || g.group_jid}
- jid: ${g.group_jid}
- enabled: ${g.enabled ? 'ON' : 'OFF'}
- report_enabled: ${g.report_enabled ? 'ON' : 'OFF'}
- allow_ai_answers: ${g.allow_ai_answers ? 'ON' : 'OFF'}
- reply_only_when_mentioned: ${g.reply_only_when_mentioned ? 'ON' : 'OFF'}`)
  .join('\n\n')}`;
}

function buildPeopleText() {
  const people = listPeople({}).slice(0, 20);
  if (!people.length) return 'لا يوجد أشخاص معروفون في النظام.';

  return `الأشخاص والصلاحيات (أول 20):
${people
  .map((p, i) => `${i + 1}. ${p.full_name || p.preferred_name || '-'} | ${p.role_label || '-'} | ${p.enabled ? 'مفعّل' : 'غير مفعّل'} | ${p.normalized_phone || p.phone || '-'}`)
  .join('\n')}`;
}

function buildLastSkipsText() {
  const skips = getLastSkips(10);
  if (!skips.length) return 'لا توجد حالات تخطي رد مسجلة مؤخرًا.';

  return `أسباب آخر حالات عدم الرد:
${skips
  .map((s, i) => `${i + 1}. السبب: ${s.reason}
- group: ${s.groupJid || '-'}
- sender: ${s.participantJid || '-'}
- text: ${String(s.text || '').slice(0, 120)}`)
  .join('\n\n')}`;
}

async function executeOwnerCommand({ parsed, identity, whatsappClient, options = {} }) {
  const dryRun = Boolean(options.dryRun);
  const text = String(parsed?.text || '').trim();
  const isGroup = Boolean(parsed?.isGroup);
  const groupJid = parsed?.jid || '';

  if (!identity?.isOwner && !identity?.isSuperAdmin) return { handled: false };
  if (!isOwnerCommand(text)) return { handled: false };

  let reply = '';
  let command = 'unknown';

  if (hasAny(text, ['من أنا'])) {
    command = 'who_am_i';
    reply = buildIdentityText(identity, parsed);
  } else if (hasAny(text, ['فعّل هذه المجموعة', 'فعل هذه المجموعة', 'اجعل هذه مجموعة إدارة', 'اجعل هذه مجموعة ادارة'])) {
    command = 'enable_current_group';
    if (!isGroup) {
      reply = 'هذا الأمر يعمل من داخل المجموعة. أرسل الأمر داخل المجموعة المراد تفعيلها.';
    } else {
      if (!dryRun) {
        upsertAdminGroup({
          group_jid: groupJid,
          group_name: parsed.groupName || '',
          enabled: true,
          report_enabled: true,
          allow_ai_answers: true,
          reply_only_when_mentioned: false,
          allow_daily_summary: false
        });
      }
      reply = 'تم تفعيل هذه المجموعة كمجموعة إدارة ✅';
    }
  } else if (hasAny(text, ['عطّل هذه المجموعة', 'عطل هذه المجموعة'])) {
    command = 'disable_current_group';
    if (!isGroup) {
      reply = 'هذا الأمر يعمل من داخل المجموعة فقط.';
    } else {
      if (!dryRun) {
        upsertAdminGroup({
          group_jid: groupJid,
          group_name: parsed.groupName || '',
          enabled: false
        });
      }
      reply = 'تم تعطيل هذه المجموعة.';
    }
  } else if (hasAny(text, ['فعّل الرد في المجموعات', 'فعل الرد في المجموعات'])) {
    command = 'enable_group_mode';
    if (!dryRun) {
      updateSettings({
        enable_groups: 'true',
        enable_admin_group_mode: 'true'
      });
    }
    reply = 'تم تفعيل الرد في المجموعات المصرح بها ✅';
  } else if (hasAny(text, ['حالة النظام'])) {
    command = 'system_status';
    reply = buildSystemStatusText(whatsappClient);
  } else if (hasAny(text, ['اختبر الذكاء'])) {
    command = 'test_provider';
    const result = dryRun
      ? { success: true, data: { provider: getPublicProviderSettings().provider, model: getPublicProviderSettings().model, text: 'جاهز' } }
      : await testProviderConnection({ useSavedKey: true });

    if (result.success) {
      reply = `تم الاتصال بمزود الذكاء بنجاح ✅
provider: ${result.data?.provider || '-'}
model: ${result.data?.model || '-'}
reply: ${result.data?.text || '-'}`;
    } else {
      reply = `فشل اختبار المزود:
${result.data?.error_ar || result.data?.error || result.message || 'غير معروف'}
HTTP: ${result.data?.responseStatus || '-'} ${result.data?.responseStatusText || ''}`;
    }
  } else if (hasAny(text, ['اعرض المجموعات'])) {
    command = 'list_groups';
    reply = buildGroupsText();
  } else if (hasAny(text, ['اعرض الاشخاص', 'اعرض الأشخاص'])) {
    command = 'list_people';
    reply = buildPeopleText();
  } else if (hasAny(text, ['لماذا لم ترد'])) {
    command = 'why_no_reply';
    reply = buildLastSkipsText();
  } else if (hasAny(text, ['اعرض آخر الأخطاء', 'اعرض اخر الاخطاء'])) {
    command = 'list_errors';
    const errors = getLogs({ level: 'error' }).slice(0, 10);
    reply = errors.length
      ? `آخر الأخطاء:
${errors.map((e, i) => `${i + 1}. [${e.source}] ${e.message} (${e.created_at})`).join('\n')}`
      : 'لا توجد أخطاء في السجلات.';
  } else if (isReportTrigger(text)) {
    command = 'owner_report';
    const reportType = detectReportIntent(text).type;
    reply = buildReportByType(reportType, {
      requesterPerson: identity.person,
      requesterPolicy: identity.policy,
      detailLevel: 'تقني عميق'
    });
  } else {
    return { handled: false };
  }

  addLog('info', 'owner_command', `Owner command executed: ${command}`, {
    chatType: chatTypeFromParsed(parsed),
    groupJid: isGroup ? groupJid : null,
    sender: identity.raw?.participantJid || identity.senderJid || '',
    dryRun
  });

  return {
    handled: true,
    command,
    reply,
    dryRun
  };
}

module.exports = {
  executeOwnerCommand,
  isOwnerCommand
};
