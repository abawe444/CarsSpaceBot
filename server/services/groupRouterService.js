const { addLog } = require('./logsService');
const { normalizeArabic } = require('./sanitizer');

const lastSkips = [];
const MAX_SKIP_CACHE = 200;
const groupEvents = [];
const MAX_GROUP_EVENTS = 500;

function pushSkip(skip = {}) {
  lastSkips.unshift({
    at: new Date().toISOString(),
    ...skip
  });
  if (lastSkips.length > MAX_SKIP_CACHE) lastSkips.length = MAX_SKIP_CACHE;
}

function recordSkipReason(payload = {}) {
  const row = {
    groupJid: payload.groupJid || '',
    participantJid: payload.participantJid || '',
    text: String(payload.text || '').slice(0, 500),
    reason: payload.reason || 'unknown',
    isGroup: Boolean(payload.isGroup),
    isOwner: Boolean(payload.isOwner),
    isKnown: Boolean(payload.isKnown),
    metadata: payload.metadata || {}
  };
  pushSkip(row);
  addLog('info', 'group_router', 'Reply skipped in group/private router', row);
}

function getLastSkips(limit = 50) {
  return lastSkips.slice(0, Math.max(1, Number(limit || 50)));
}

function recordGroupDebugEvent(event = {}) {
  const row = {
    at: new Date().toISOString(),
    ...event
  };
  groupEvents.unshift(row);
  if (groupEvents.length > MAX_GROUP_EVENTS) groupEvents.length = MAX_GROUP_EVENTS;
  try {
    addLog('info', 'group_debug', 'Group event', row);
  } catch {
    // ignore
  }
  try {
    console.log('=== GROUP MESSAGE DEBUG ===', row);
  } catch {
    // ignore
  }
  return row;
}

function getGroupDebugEvents(limit = 50) {
  return groupEvents.slice(0, Math.max(1, Number(limit || 50)));
}

function isManagementCommandText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.startsWith('!') || raw.startsWith('/') || raw.startsWith('#تقرير') || raw.startsWith('#ملخص')) return true;

  const normalized = normalizeArabic(raw);
  const probes = [
    'تقرير',
    'ملخص',
    'وش صار اليوم',
    'من تواصل معنا',
    'كم عميل',
    'فيه شكاوى',
    'اكثر الطلبات',
    'حلل اداء البوت',
    'اعطني تقرير',
    'عطني تقرير',
    'اعطني ملخص',
    'عطني ملخص',
    'من انا',
    'فعّل هذه المجموعة',
    'فعل هذه المجموعة',
    'عطّل هذه المجموعة',
    'عطل هذه المجموعة',
    'حالة النظام',
    'اعرض المجموعات'
  ];

  return probes.some((p) => normalized.includes(normalizeArabic(p)));
}

function evaluateGroupRouting({
  parsed,
  gateResult,
  identity,
  isMentioned,
  isDirectedByName,
  hasCommand,
  hasReportIntent
}) {
  const text = String(parsed?.text || '').trim();
  const hasManagementCommand = hasCommand || hasReportIntent || isManagementCommandText(text);
  const directed = Boolean(isMentioned || isDirectedByName || hasManagementCommand);

  if (identity?.isOwner || identity?.isSuperAdmin) {
    return {
      shouldReply: directed || Boolean(text),
      reason: directed ? 'owner_directed_message' : 'owner_message',
      bypassed: true,
      hasManagementCommand
    };
  }

  if (!gateResult?.allowed) {
    return {
      shouldReply: false,
      reason: gateResult?.reason || 'group_not_allowed',
      bypassed: false,
      hasManagementCommand
    };
  }

  if (!directed) {
    return {
      shouldReply: false,
      reason: 'casual_message',
      bypassed: false,
      hasManagementCommand
    };
  }

  return {
    shouldReply: true,
    reason: hasManagementCommand ? 'management_command' : 'directed_message',
    bypassed: false,
    hasManagementCommand
  };
}

module.exports = {
  recordSkipReason,
  getLastSkips,
  recordGroupDebugEvent,
  getGroupDebugEvents,
  isManagementCommandText,
  evaluateGroupRouting
};
