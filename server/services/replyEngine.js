const { db } = require('../database/db');
const { getSettings } = require('./settingsService');
const { addLog, getLogs } = require('./logsService');
const { getEnabledRules, findMatchedRule } = require('./rulesEngine');
const { generateAIReply, getPublicProviderSettings } = require('./aiProviderService');
const {
  ensureContact,
  updateContactMessage,
  saveMessage,
  setHandoff,
  countAutoRepliesLastHour
} = require('./conversationService');
const { sanitizeText } = require('./sanitizer');
const { updateMemoryAfterInbound, updateMemoryAfterAssistantReply, getMemoryView } = require('./conversationMemoryService');
const { buildPromptContext } = require('./promptBuilder');
const { validateAndImproveReply } = require('./replyValidator');
const { withTyping } = require('./presenceService');
const { downloadIncomingMedia, updateMediaMessageRecord } = require('./mediaService');
const { transcribeVoiceFile } = require('./transcriptionService');
const { analyzeImageWithContext } = require('./visionService');
const {
  shouldRespondInGroup,
  isAuthorizedAdminMember,
  saveReportLog,
  markGroupMessageSeen
} = require('./adminGroupService');
const { buildReportByType } = require('./reportingService');
const { isReportTrigger, detectReportIntent, isCommandMessage } = require('./reportIntentService');
const { resolveIdentityFromParsed, can, resolveReportPermission, personalizeReply } = require('./identityService');
const { executeOwnerCommand } = require('./ownerCommandService');
const {
  evaluateGroupRouting,
  recordSkipReason,
  isManagementCommandText,
  recordGroupDebugEvent,
  getLastSkips
} = require('./groupRouterService');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trackEvent(event_type, contact_jid, rule_id = null, meta = null) {
  db.prepare(`
    INSERT INTO analytics_events (event_type, contact_jid, rule_id, meta_json, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(event_type, contact_jid || null, rule_id, meta ? JSON.stringify(meta) : null);
}

function detectAutoHandoff(text, keywordsRaw) {
  const keywords = String(keywordsRaw || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const lowered = sanitizeText(text).toLowerCase();
  return keywords.find((k) => lowered.includes(k.toLowerCase())) || null;
}

function resolveAiMode(settings, provider) {
  const allowed = ['rules_only', 'rules_first', 'ai_first', 'ai_only'];
  const mode = provider?.ai_mode || settings.ai_mode || 'ai_first';
  return allowed.includes(mode) ? mode : 'ai_first';
}

function isWildcardRule(rule) {
  if (!rule) return false;
  return rule.match_type === 'wildcard' || String(rule.keywords || '').includes('*');
}

function normalizeJid(jid = '') {
  return String(jid || '').split(':')[0].toLowerCase();
}

function normalizeIdLike(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(':')[0];
}

function isBotSelfParticipant(participantJid = '', whatsappClient = null) {
  if (!participantJid || !whatsappClient?.getBotIdentity) return false;
  const bot = whatsappClient.getBotIdentity() || {};
  const normalized = normalizeIdLike(participantJid);
  const participantRaw = normalized.split('@')[0];
  const jids = (bot.possibleSelfJids || []).map(normalizeIdLike);
  const lids = (bot.possibleSelfLids || []).map(normalizeIdLike);
  if (jids.includes(normalized) || lids.includes(normalized)) return true;
  if (jids.includes(participantRaw) || lids.includes(participantRaw)) return true;
  return false;
}

function isDirectedToBotText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (raw.startsWith('!') || raw.startsWith('/') || raw.startsWith('#\u062A\u0642\u0631\u064A\u0631') || raw.startsWith('#\u0645\u0644\u062E\u0635')) return true;
  const lowered = raw.toLowerCase();
  const aliases = [
    '\u0645\u0633\u0627\u0639\u062F',
    '\u0627\u0644\u0628\u0648\u062A',
    '\u064A\u0627 \u0645\u0633\u0627\u0639\u062F',
    '\u064A\u0627 \u0628\u0648\u062A',
    '\u0635\u0631\u062D',
    '\u0641\u0636\u0627\u0621 \u0627\u0644\u0645\u062D\u0631\u0643\u0627\u062A',
    'assistant',
    'bot'
  ];
  return aliases.some((a) => lowered.includes(a.toLowerCase()));
}

function meaningfulRuleForText(text, settings, options = {}) {
  if (!settings.rules_enabled) return null;
  const matched = findMatchedRule(text || '', getEnabledRules());
  if (!matched || isWildcardRule(matched)) return null;
  if (options.onlyForceRule && !matched.force_rule) return null;
  return matched;
}

function composeFallbackReply(settings, memory, messageType = 'text') {
  const contextual = localSmartFallback(memory, messageType);
  if (messageType === 'voice' || messageType === 'image' || messageType === 'document') {
    return contextual;
  }
  return settings.fallback_reply || contextual;
}

function wasSameFallbackSentRecently(contactJid, fallbackText, minutes = 30) {
  if (!contactJid || !fallbackText) return false;
  const row = db.prepare(`
    SELECT body
    FROM messages
    WHERE contact_jid = ?
      AND direction = 'outgoing'
      AND from_bot = 1
      AND datetime(created_at) >= datetime('now', ?)
    ORDER BY id DESC
    LIMIT 1
  `).get(contactJid, `-${Number(minutes || 30)} minutes`);

  if (!row || !row.body) return false;
  return sanitizeText(row.body) === sanitizeText(fallbackText);
}

function buildNonRepeatedFallback(memory, messageType = 'text') {
  let missing = [];
  try {
    missing = JSON.parse(memory?.missing_fields_json || '[]');
  } catch {
    missing = [];
  }

  if (messageType === 'voice') {
    return 'وصلني التسجيل 👍 إذا تقدر اكتب لي اسم القطعة أو نوع السيارة كتابة عشان أخدمك أسرع وأدق.';
  }
  if (messageType === 'image') {
    return 'واضحة الصورة 👌 إذا تقدر أرسل نوع السيارة والموديل والسنة أو رقم الهيكل عشان نحدد القطعة بشكل أدق.';
  }
  if (missing.includes('vin')) {
    return 'ولا يهمك 👌 إذا ما توفر رقم الهيكل، أرسل نوع السيارة والموديل والسنة واسم القطعة ونكمل الطلب.';
  }
  if (missing.includes('part_name')) {
    return 'تمام 👍 باقي فقط اسم القطعة بالتحديد أو صورة لها إذا متوفرة.';
  }
  if (missing.includes('car_year')) {
    return 'ممتاز 👌 أرسل سنة السيارة فقط ونكمل مباشرة.';
  }
  return 'تمام 👍 وصلت الفكرة. خلنا نكمل خطوة خطوة وبعطيك الإفادة الأدق.';
}

function localSmartFallback(memory, messageType = 'text') {
  const intent = memory?.current_intent || 'unknown';
  let missing = [];
  try {
    missing = JSON.parse(memory?.missing_fields_json || '[]');
  } catch {
    missing = [];
  }

  if (messageType === 'voice') {
    return 'وصلني التسجيل 👍 إذا تقدر اكتب لي اسم القطعة أو نوع السيارة كتابة عشان أخدمك أسرع وأدق.';
  }
  if (messageType === 'image') {
    return 'واضحة الصورة 👌 إذا تقدر أرسل نوع السيارة والموديل والسنة أو رقم الهيكل عشان نحدد المطلوب بدقة.';
  }

  if (intent === 'spare_part_request' || intent === 'price_request') {
    if (missing.includes('vin')) return 'ولا يهمك إذا ما توفر VIN 👌 أرسل نوع السيارة والموديل والسنة واسم القطعة ونكمل عليها.';
    if (missing.includes('part_name')) return 'ممتاز 👌 باقي فقط اسم القطعة بالتحديد أو صورة لها إذا متوفرة.';
    if (missing.includes('car_year')) return 'تمام 👍 أرسل سنة السيارة فقط عشان نكمل الطلب بدقة.';
    return 'أكيد 👌 أرسل اسم القطعة ونوع السيارة والموديل والسنة، وإذا عندك VIN يكون أدق.';
  }

  if (intent === 'maintenance_request' || intent === 'booking_request') {
    return 'أبشر 👍 أرسل نوع السيارة والموديل والسنة ووصف المشكلة، وهل السيارة تمشي أو تحتاج سطحة.';
  }

  if (intent === 'location_request') {
    return 'حياك الله، عندنا موقع الشركة وموقع المركز. إذا تبي أوجهك للأنسب حسب نوع الخدمة.';
  }

  if (intent === 'complaint') {
    return 'حقك علينا 🌹 خلني أرفع طلبك للموظف المختص ويتابع معك مباشرة.';
  }

  return 'تمام، وصلت الفكرة 👍 وش أقرب طلب عندك: قطع غيار، صيانة، أو موقع الفرع؟';
}

async function attemptAI({
  contactJid,
  userMessage,
  settings,
  messageType = 'text',
  mediaInsight = '',
  conversationType = 'customer_private',
  requesterIdentity = null
}) {
  const prompt = buildPromptContext({
    contactJid,
    settings,
    currentUserMessage: userMessage,
    messageType,
    mediaInsight,
    conversationType,
    requesterIdentity
  });

  const result = await generateAIReply({
    userMessage,
    systemPrompt: prompt.systemPrompt,
    messages: prompt.messages
  });

  if (!result.ok) return null;
  return {
    reply: result.text,
    source: result.source,
    model: result.model
  };
}

async function resolveReplyByMode({ mode, parsed, settings, memory, mediaInsight = '', requesterIdentity = null }) {
  const text = parsed.text || '';
  const forceRule = meaningfulRuleForText(text, settings, { onlyForceRule: true });
  const regularRule = meaningfulRuleForText(text, settings);
  const fallbackReply = composeFallbackReply(settings, memory, parsed.messageType);

  if (mode === 'rules_only') {
    if (regularRule) return { reply: regularRule.reply, source: 'rules', rule: regularRule };
    return { reply: fallbackReply, source: 'fallback', rule: null };
  }

  if (mode === 'rules_first') {
    if (regularRule) return { reply: regularRule.reply, source: 'rules', rule: regularRule };
    const ai = await attemptAI({
      contactJid: parsed.jid,
      userMessage: text,
      settings,
      messageType: parsed.messageType,
      mediaInsight,
      requesterIdentity
    });
    if (ai) return { reply: ai.reply, source: ai.source, model: ai.model, rule: null };
    return { reply: fallbackReply, source: 'fallback', rule: null };
  }

  if (mode === 'ai_first') {
    if (forceRule) return { reply: forceRule.reply, source: 'rules', rule: forceRule };

    const ai = await attemptAI({
      contactJid: parsed.jid,
      userMessage: text,
      settings,
      messageType: parsed.messageType,
      mediaInsight,
      requesterIdentity
    });
    if (ai) return { reply: ai.reply, source: ai.source, model: ai.model, rule: null };
    return { reply: fallbackReply, source: 'fallback', rule: null };
  }

  if (forceRule) return { reply: forceRule.reply, source: 'rules', rule: forceRule };

  const ai = await attemptAI({
    contactJid: parsed.jid,
    userMessage: text,
    settings,
    messageType: parsed.messageType,
    mediaInsight,
    requesterIdentity
  });
  if (ai) return { reply: ai.reply, source: ai.source, model: ai.model, rule: null };
  return { reply: fallbackReply, source: 'fallback', rule: null };
}

async function handleAdminGroupMessage(parsed, whatsappClient, io, settings) {
  const text = String(parsed.text || '').trim();
  const identity = resolveIdentityFromParsed(parsed);
  const participantJid = parsed.participant || parsed.senderJid || '';
  const isOwnerLike = Boolean(identity.isOwner || identity.isSuperAdmin);
  const isSelfParticipant = isBotSelfParticipant(participantJid, whatsappClient);

  const baseDebug = {
    remoteJid: parsed.jid,
    participant: participantJid,
    fromMe: Boolean(parsed.fromMe),
    pushName: parsed.pushName || '',
    messageType: parsed.messageType,
    extractedText: text,
    isGroup: true,
    isOwner: isOwnerLike,
    identityResult: {
      isKnown: Boolean(identity.isKnown),
      isOwner: Boolean(identity.isOwner),
      isSuperAdmin: Boolean(identity.isSuperAdmin),
      roleKey: identity.roleKey || ''
    }
  };

  if (isSelfParticipant) {
    recordSkipReason({
      groupJid: parsed.jid,
      participantJid,
      text,
      reason: 'bot_self_participant',
      isGroup: true,
      isOwner: false,
      isKnown: false,
      metadata: baseDebug
    });
    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: false,
      shouldReply: false,
      skipReason: 'bot_self_participant'
    });
    return false;
  }

  const myJid = normalizeJid(whatsappClient.getMyJid());
  const isMentioned = (parsed.mentionedJid || []).some((jid) => normalizeJid(jid) === myJid);
  const isDirectedByName = isDirectedToBotText(text);
  const hasCommand = isCommandMessage(text);
  const hasReportIntent = isReportTrigger(text);
  const hasCommandOrReportIntent = hasCommand || hasReportIntent || isDirectedByName || isManagementCommandText(text);

  const seenGroup = markGroupMessageSeen({
    groupJid: parsed.jid,
    groupName: parsed.groupName || '',
    participantJid,
    participantPhoneHint: parsed.participantPn || '',
    messagePreview: text || '[' + parsed.messageType + ']',
    participantsCount: Number(parsed.groupParticipantsCount || 0)
  });

  const gate = shouldRespondInGroup({
    groupJid: parsed.jid,
    isMentioned,
    hasCommandOrReportIntent,
    bypassAuthorization: isOwnerLike
  });

  const routeDecision = evaluateGroupRouting({
    parsed,
    settings,
    gateResult: gate,
    identity,
    isMentioned,
    isDirectedByName,
    hasCommand,
    hasReportIntent
  });

  const debugBase = {
    groupJid: parsed.jid,
    participant: participantJid,
    participantPn: parsed.participantPn || '',
    participantLid: parsed.participantLid || '',
    messageText: text,
    groupEnabled: Boolean(seenGroup?.enabled),
    isAdminGroup: Boolean(gate.group?.enabled || seenGroup?.enabled),
    personResolved: identity.isKnown ? (identity.roleKey + ':' + (identity.personId || 'owner')) : false,
    isMentioned,
    hasCommand,
    hasReportIntent,
    isDirectedByName,
    isOwner: isOwnerLike
  };

  recordGroupDebugEvent({
    ...baseDebug,
    groupEnabled: Boolean(seenGroup?.enabled),
    shouldReply: Boolean(routeDecision.shouldReply),
    skipReason: routeDecision.shouldReply ? null : (routeDecision.reason || gate.reason || 'gate_block')
  });
  addLog('info', 'message_router', 'Group message received', debugBase);

  const ownerAction = await executeOwnerCommand({ parsed, identity, whatsappClient });
  if (ownerAction.handled) {
    let replyText = ownerAction.reply;
    if (!seenGroup?.enabled && ownerAction.command !== 'enable_current_group') {
      replyText = 'حياك الله أستاذ عباوي، تم التعرف عليك كمالك النظام. هذه المجموعة غير مفعلة كمجموعة إدارة. اكتب: فعّل هذه المجموعة';
    }

    await withTyping({
      whatsappClient,
      jid: parsed.jid,
      messageType: 'text',
      previewReply: replyText,
      task: async () => whatsappClient.sendMessage(parsed.jid, replyText)
    });

    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: Boolean(seenGroup?.enabled),
      shouldReply: true,
      skipReason: null,
      action: 'owner_command',
      command: ownerAction.command,
      send_target: parsed.jid
    });
    addLog('info', 'group_router', 'Reply sent to group', { ...debugBase, reason: 'owner_command', command: ownerAction.command });
    return true;
  }

  if (!routeDecision.shouldReply) {
    const reason = routeDecision.reason || gate.reason || 'not_allowed';
    recordSkipReason({
      groupJid: parsed.jid,
      participantJid,
      text,
      reason,
      isGroup: true,
      isOwner: isOwnerLike,
      isKnown: Boolean(identity.isKnown),
      metadata: debugBase
    });
    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: Boolean(seenGroup?.enabled),
      shouldReply: false,
      skipReason: reason
    });
    return false;
  }

  if (!identity.isKnown || !identity.person?.enabled || !identity.person?.group_reply_enabled) {
    if (hasCommandOrReportIntent || isMentioned) {
      if (settings.reply_unknown_group_request_with_auth_message) {
        const unauthorizedMsg = 'عذرًا، هذا الطلب يحتاج تعريفك في صفحة الأشخاص والصلاحيات.';
        await whatsappClient.sendMessage(parsed.jid, unauthorizedMsg);
      }
      recordGroupDebugEvent({
        ...baseDebug,
        groupEnabled: Boolean(seenGroup?.enabled),
        shouldReply: true,
        skipReason: 'person_not_authorized',
        send_target: settings.reply_unknown_group_request_with_auth_message ? parsed.jid : null
      });
      addLog('warning', 'group_router', 'Sender unknown in admin group', { ...debugBase, reason: 'person_not_authorized' });
      addLog('warning', 'security', 'Unauthorized report request', {
        by: participantJid,
        group: parsed.jid,
        reason: 'person_not_authorized'
      });
      trackEvent('admin_group_unauthorized', parsed.jid, null, { by: participantJid, reason: 'person_not_authorized' });
    }
    return true;
  }

  if (!can(identity, 'bot.ask_group')) {
    recordSkipReason({
      groupJid: parsed.jid,
      participantJid,
      text,
      reason: 'permission_bot_ask_group',
      isGroup: true,
      isOwner: false,
      isKnown: true,
      metadata: debugBase
    });
    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: Boolean(seenGroup?.enabled),
      shouldReply: false,
      skipReason: 'permission_bot_ask_group'
    });
    addLog('warning', 'group_router', 'Reply skipped: sender lacks bot.ask_group', { ...debugBase, reason: 'permission_bot_ask_group' });
    return true;
  }

  if (gate.group && !isAuthorizedAdminMember(parsed.jid, participantJid) && !can(identity, 'groups.ask_reports')) {
    if (hasCommandOrReportIntent || isMentioned) {
      const unauthorizedMsg = 'عذرًا، التقارير متاحة فقط للمصرح لهم في مجموعة الإدارة.';
      await whatsappClient.sendMessage(parsed.jid, unauthorizedMsg);
      recordGroupDebugEvent({
        ...baseDebug,
        groupEnabled: Boolean(seenGroup?.enabled),
        shouldReply: true,
        skipReason: 'member_not_authorized',
        send_target: parsed.jid
      });
      addLog('warning', 'group_router', 'Reply sent: unauthorized group member', { ...debugBase, reason: 'member_not_authorized' });
      trackEvent('admin_group_unauthorized', parsed.jid, null, { by: participantJid });
    }
    return true;
  }

  if (!hasCommandOrReportIntent && !isMentioned && !isDirectedByName) {
    recordSkipReason({
      groupJid: parsed.jid,
      participantJid,
      text,
      reason: 'casual_message',
      isGroup: true,
      isKnown: true,
      metadata: debugBase
    });
    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: Boolean(seenGroup?.enabled),
      shouldReply: false,
      skipReason: 'casual_message'
    });
    return true;
  }

  if (hasCommand || hasReportIntent || isDirectedByName || isManagementCommandText(text)) {
    const reportType = detectReportIntent(text).type;
    if (!can(identity, 'groups.ask_reports')) {
      const msg = 'عذرًا، هذا الطلب يحتاج صلاحية أعلى.';
      await whatsappClient.sendMessage(parsed.jid, msg);
      recordGroupDebugEvent({
        ...baseDebug,
        groupEnabled: Boolean(seenGroup?.enabled),
        shouldReply: true,
        skipReason: 'unauthorized_groups_ask_reports',
        send_target: parsed.jid
      });
      addLog('warning', 'security', 'Unauthorized report request', {
        by: participantJid,
        group: parsed.jid,
        reportType
      });
      trackEvent('admin_group_unauthorized', parsed.jid, null, { reportType, by: participantJid });
      return true;
    }

    const neededPermission = resolveReportPermission(reportType);
    if (!can(identity, neededPermission)) {
      const msg = 'عذرًا، هذا الطلب يحتاج صلاحية أعلى.';
      await whatsappClient.sendMessage(parsed.jid, msg);
      recordGroupDebugEvent({
        ...baseDebug,
        groupEnabled: Boolean(seenGroup?.enabled),
        shouldReply: true,
        skipReason: 'unauthorized_report_permission',
        send_target: parsed.jid
      });
      addLog('warning', 'security', 'Unauthorized report permission', {
        by: participantJid,
        group: parsed.jid,
        reportType,
        neededPermission
      });
      return true;
    }

    let reportBody = buildReportByType(reportType, {
      requesterPerson: identity.person,
      requesterPolicy: identity.policy,
      detailLevel: identity.policy?.report_detail_level || 'medium'
    });
    reportBody = personalizeReply(identity, reportBody, {
      channelKey: parsed.jid,
      forceGreeting: true,
      contextType: 'group'
    });

    await withTyping({
      whatsappClient,
      jid: parsed.jid,
      messageType: 'text',
      previewReply: reportBody,
      task: async () => whatsappClient.sendMessage(parsed.jid, reportBody)
    });
    recordGroupDebugEvent({
      ...baseDebug,
      groupEnabled: Boolean(seenGroup?.enabled),
      shouldReply: true,
      skipReason: null,
      action: 'report_sent',
      reportType,
      send_target: parsed.jid
    });
    saveReportLog({
      groupJid: parsed.jid,
      requestedBy: participantJid,
      reportType,
      question: text,
      answer: reportBody
    });
    trackEvent('admin_report_sent', parsed.jid, null, { reportType, by: participantJid });
    addLog('info', 'group_router', 'Reply sent to group', { ...debugBase, reportType, reason: 'report_sent' });
    io.emit('conversation:updated', { jid: parsed.jid });
    return true;
  }

  if ((isMentioned || hasCommandOrReportIntent) && gate.group?.allow_ai_answers) {
    const ai = await attemptAI({
      contactJid: parsed.jid,
      userMessage: text,
      settings,
      messageType: 'text',
      conversationType: 'admin_group',
      requesterIdentity: identity
    });
    if (ai?.reply) {
      const reply = personalizeReply(identity, ai.reply, {
        channelKey: parsed.jid,
        contextType: 'group'
      });
      await withTyping({
        whatsappClient,
        jid: parsed.jid,
        messageType: 'text',
        previewReply: reply,
        task: async () => whatsappClient.sendMessage(parsed.jid, reply)
      });
      recordGroupDebugEvent({
        ...baseDebug,
        groupEnabled: Boolean(seenGroup?.enabled),
        shouldReply: true,
        skipReason: null,
        action: 'ai_answer_sent',
        send_target: parsed.jid
      });
      saveReportLog({
        groupJid: parsed.jid,
        requestedBy: participantJid,
        reportType: 'ai_group_answer',
        question: text,
        answer: reply
      });
      trackEvent('admin_ai_answer_sent', parsed.jid, null, { by: participantJid });
      addLog('info', 'group_router', 'Reply sent to group', { ...debugBase, reason: 'ai_answer_sent' });
      return true;
    }
  }

  recordGroupDebugEvent({
    ...baseDebug,
    groupEnabled: Boolean(seenGroup?.enabled),
    shouldReply: false,
    skipReason: 'no_matching_group_path'
  });
  return true;
}

async function processCustomerMedia(parsed, whatsappClient, memorySummary = '') {
  if (!['voice', 'image', 'document'].includes(parsed.messageType)) {
    return { userText: parsed.text || '', mediaInsight: '', mediaRecordId: null };
  }

  const download = await downloadIncomingMedia({
    whatsappClient,
    rawMessage: parsed.raw,
    mediaType: parsed.messageType,
    contactJid: parsed.jid,
    messageId: parsed.messageId
  });

  if (!download.ok) {
    return {
      userText: parsed.text || '',
      mediaInsight: '',
      mediaRecordId: download.recordId || null
    };
  }

  if (parsed.messageType === 'voice') {
    const trans = await transcribeVoiceFile(download.filePath);
    if (trans.ok) {
      updateMediaMessageRecord(download.recordId, {
        transcript: trans.text,
        processing_status: 'processed'
      });
      return {
        userText: trans.text,
        mediaInsight: `voice_transcript: ${trans.text}`,
        mediaRecordId: download.recordId
      };
    }
    updateMediaMessageRecord(download.recordId, {
      processing_status: 'failed',
      error_message: trans.error || trans.reason || 'transcription_failed'
    });
    return {
      userText: parsed.text || '',
      mediaInsight: 'voice_transcript_unavailable',
      mediaRecordId: download.recordId
    };
  }

  if (parsed.messageType === 'image') {
    const vision = await analyzeImageWithContext({
      filePath: download.filePath,
      customerText: parsed.text || '',
      memorySummary
    });
    if (vision.ok) {
      updateMediaMessageRecord(download.recordId, {
        analysis: vision.text,
        processing_status: 'processed'
      });
      return {
        userText: parsed.text || '',
        mediaInsight: `image_analysis: ${vision.text}`,
        mediaRecordId: download.recordId
      };
    }
    updateMediaMessageRecord(download.recordId, {
      processing_status: 'failed',
      error_message: vision.error || vision.reason || 'vision_failed'
    });
    return {
      userText: parsed.text || '',
      mediaInsight: 'image_analysis_unavailable',
      mediaRecordId: download.recordId
    };
  }

  updateMediaMessageRecord(download.recordId, { processing_status: 'processed' });
  return { userText: parsed.text || '', mediaInsight: 'document_received', mediaRecordId: download.recordId };
}

async function processInboundMessage(parsed, whatsappClient, io) {
  try {
    if (!parsed || parsed.fromMe) return;

    addLog('info', 'message_router', 'Inbound message received', {
      remoteJid: parsed.jid,
      participantJid: parsed.participant || '',
      isGroup: Boolean(parsed.isGroup),
      messagePreview: String(parsed.text || `[${parsed.messageType}]`).slice(0, 200)
    });

    const settings = getSettings();
    const providerSettings = getPublicProviderSettings();
    const mode = resolveAiMode(settings, providerSettings);

    if (parsed.isGroup) {
      const groupIdentity = resolveIdentityFromParsed(parsed);
      const ownerBypass = Boolean(groupIdentity.isOwner || groupIdentity.isSuperAdmin);
      if (!settings.enable_groups) {
        if (ownerBypass) {
          await handleAdminGroupMessage(parsed, whatsappClient, io, settings);
          return;
        }
        recordSkipReason({
          groupJid: parsed.jid,
          participantJid: parsed.participant || '',
          text: parsed.text || '',
          reason: 'group_feature_disabled',
          isGroup: true,
          isOwner: false,
          isKnown: false
        });
        recordGroupDebugEvent({
          remoteJid: parsed.jid,
          participant: parsed.participant || '',
          fromMe: Boolean(parsed.fromMe),
          pushName: parsed.pushName || '',
          messageType: parsed.messageType,
          extractedText: String(parsed.text || '').trim(),
          isGroup: true,
          isOwner: false,
          identityResult: { isKnown: false, isOwner: false, isSuperAdmin: false, roleKey: '' },
          groupEnabled: false,
          shouldReply: false,
          skipReason: 'group_feature_disabled'
        });
        return;
      }
      await handleAdminGroupMessage(parsed, whatsappClient, io, settings);
      return;
    }

    const identity = resolveIdentityFromParsed(parsed);

    ensureContact({ jid: parsed.jid, display_name: parsed.pushName || '', phone: parsed.phone || '' });

    const existingMemory = getMemoryView(parsed.jid);
    const mediaHandled = await processCustomerMedia(parsed, whatsappClient, existingMemory.conversation_summary || '');
    const inboundBody = mediaHandled.userText || parsed.text || `[${parsed.messageType}]`;

    saveMessage({
      contact_jid: parsed.jid,
      direction: 'incoming',
      message_type: parsed.messageType,
      body: inboundBody,
      raw_json: parsed.raw,
      from_bot: false
    });
    updateContactMessage(parsed.jid, inboundBody || '[media]', true);
    trackEvent('incoming_message', parsed.jid, null, { messageType: parsed.messageType });
    io.emit('conversation:updated', { jid: parsed.jid });

    const updatedMemory = updateMemoryAfterInbound({
      contactJid: parsed.jid,
      conversationType: 'customer_private',
      messageType: parsed.messageType,
      userText: inboundBody,
      sourceMessageId: parsed.messageId
    });

    if (!settings.assistant_enabled) {
      recordSkipReason({
        groupJid: '',
        participantJid: parsed.jid,
        text: inboundBody,
        reason: 'assistant_disabled',
        isGroup: false,
        isOwner: Boolean(identity.isOwner),
        isKnown: Boolean(identity.isKnown)
      });
      return;
    }

    const ownerAction = await executeOwnerCommand({ parsed, identity, whatsappClient });
    if (ownerAction.handled) {
      await withTyping({
        whatsappClient,
        jid: parsed.jid,
        messageType: 'text',
        previewReply: ownerAction.reply,
        task: async () => whatsappClient.sendMessage(parsed.jid, ownerAction.reply)
      });
      saveMessage({
        contact_jid: parsed.jid,
        direction: 'outgoing',
        message_type: 'text',
        body: ownerAction.reply,
        from_bot: true
      });
      updateContactMessage(parsed.jid, ownerAction.reply, false);
      updateMemoryAfterAssistantReply(parsed.jid, ownerAction.reply);
      io.emit('conversation:updated', { jid: parsed.jid });
      return;
    }

    const freshContact = db.prepare('SELECT * FROM contacts WHERE jid = ?').get(parsed.jid);
    if (freshContact && freshContact.human_handoff) return;

    const isManagerPrivateRequest = identity.isKnown && identity.person?.private_reply_enabled && (isReportTrigger(inboundBody) || isCommandMessage(inboundBody) || isManagementCommandText(inboundBody));
    if (isManagerPrivateRequest) {
      if (!can(identity, 'bot.ask_private')) {
        const denied = 'عذرًا، هذا الطلب يحتاج صلاحية أعلى.';
        await whatsappClient.sendMessage(parsed.jid, denied);
        addLog('warning', 'security', 'Unauthorized private manager request', {
          by: identity.senderJid,
          reportLikeText: inboundBody
        });
        return;
      }

      const reportType = detectReportIntent(inboundBody).type;
      const neededPermission = resolveReportPermission(reportType);
      if (!can(identity, neededPermission)) {
        const denied = 'عذرًا، هذا الطلب يحتاج صلاحية أعلى.';
        await whatsappClient.sendMessage(parsed.jid, denied);
        addLog('warning', 'security', 'Unauthorized private report permission', {
          by: identity.senderJid,
          reportType,
          neededPermission
        });
        return;
      }

      let report = buildReportByType(reportType, {
        requesterPerson: identity.person,
        requesterPolicy: identity.policy,
        detailLevel: identity.policy?.report_detail_level || 'medium'
      });
      report = personalizeReply(identity, report, {
        channelKey: parsed.jid,
        forceGreeting: true,
        contextType: 'private'
      });

      await withTyping({
        whatsappClient,
        jid: parsed.jid,
        messageType: 'text',
        previewReply: report,
        task: async () => whatsappClient.sendMessage(parsed.jid, report)
      });

      saveMessage({
        contact_jid: parsed.jid,
        direction: 'outgoing',
        message_type: 'text',
        body: report,
        from_bot: true
      });
      updateContactMessage(parsed.jid, report, false);
      updateMemoryAfterAssistantReply(parsed.jid, report);
      trackEvent('admin_private_report_sent', parsed.jid, null, { reportType, role: identity.roleKey || identity.person?.role_key });
      io.emit('conversation:updated', { jid: parsed.jid });
      return;
    }

    const inboundNormalized = String(inboundBody || '').trim().toLowerCase();
    const looksLikePrivateReportRequest = isCommandMessage(inboundBody)
      || inboundNormalized.startsWith('تقرير')
      || inboundNormalized.startsWith('ملخص')
      || inboundNormalized.includes('وش صار اليوم')
      || inboundNormalized.includes('عطني ملخص')
      || isManagementCommandText(inboundBody);
    if (!identity.isKnown && looksLikePrivateReportRequest) {
      const denied = 'عذرًا، هذا النوع من التقارير متاح فقط للأشخاص المصرح لهم.';
      await whatsappClient.sendMessage(parsed.jid, denied);
      addLog('warning', 'security', 'Unauthorized private report request', { jid: parsed.jid });
      trackEvent('unauthorized_private_report', parsed.jid);
      return;
    }

    const autoHandoffHit = detectAutoHandoff(inboundBody, settings.assistant_auto_handoff_keywords);
    if (autoHandoffHit) {
      setHandoff(parsed.jid, true);
      const handoffMsg = 'حقك علينا 🌹 خلني أحوّل المحادثة للموظف المختص ويتابع معك مباشرة.';
      await withTyping({
        whatsappClient,
        jid: parsed.jid,
        messageType: parsed.messageType,
        previewReply: handoffMsg,
        task: async () => whatsappClient.sendMessage(parsed.jid, handoffMsg)
      });

      saveMessage({
        contact_jid: parsed.jid,
        direction: 'outgoing',
        message_type: 'text',
        body: handoffMsg,
        from_bot: true
      });
      updateContactMessage(parsed.jid, handoffMsg, false);
      updateMemoryAfterAssistantReply(parsed.jid, handoffMsg);

      addLog('warning', 'rules', 'Auto handoff triggered', { jid: parsed.jid, keyword: autoHandoffHit });
      trackEvent('handoff_triggered', parsed.jid, null, { keyword: autoHandoffHit, provider: 'handoff' });
      io.emit('conversation:updated', { jid: parsed.jid });
      return;
    }

    const repliesLastHour = countAutoRepliesLastHour(parsed.jid);
    if (repliesLastHour >= settings.assistant_max_replies_per_hour) {
      const softLimitMsg = 'وصلني طلبك 👍 وباقي متابعين معك. إذا كان عاجل اكتب "عاجل" وأحوّلك مباشرة للموظف المختص.';
      await whatsappClient.sendMessage(parsed.jid, softLimitMsg);
      saveMessage({
        contact_jid: parsed.jid,
        direction: 'outgoing',
        message_type: 'text',
        body: softLimitMsg,
        from_bot: true
      });
      updateContactMessage(parsed.jid, softLimitMsg, false);
      updateMemoryAfterAssistantReply(parsed.jid, softLimitMsg);
      addLog('warning', 'rules', 'Reply limit reached', { jid: parsed.jid });
      trackEvent('reply_limit_hit', parsed.jid);
      io.emit('conversation:updated', { jid: parsed.jid });
      return;
    }

    await wait(Math.max(0, Number(settings.assistant_reply_delay_seconds || 0)) * 1000);
    await withTyping({
      whatsappClient,
      jid: parsed.jid,
      messageType: parsed.messageType,
      previewReply: inboundBody,
      task: async () => {
        const resolved = await resolveReplyByMode({
          mode,
          parsed: { ...parsed, text: inboundBody },
          settings,
          memory: updatedMemory,
          mediaInsight: mediaHandled.mediaInsight || '',
          requesterIdentity: identity
        });

        const missingFields = (() => {
          try {
            return JSON.parse(updatedMemory.missing_fields_json || '[]');
          } catch {
            return [];
          }
        })();

        const validated = validateAndImproveReply({
          replyText: resolved.reply,
          lastAssistantReply: updatedMemory.last_assistant_reply || '',
          lastAssistantQuestion: updatedMemory.last_assistant_question || '',
          missingFields
        });

        let finalReply = validated.ok ? validated.text : composeFallbackReply(settings, updatedMemory, parsed.messageType);
        if (resolved.source === 'fallback' && wasSameFallbackSentRecently(parsed.jid, finalReply, 30)) {
          finalReply = buildNonRepeatedFallback(updatedMemory, parsed.messageType);
        }
        if (identity.isKnown && identity.person?.private_reply_enabled && can(identity, 'bot.ask_private')) {
          finalReply = personalizeReply(identity, finalReply, {
            channelKey: parsed.jid,
            contextType: 'private'
          });
        }
        await whatsappClient.sendMessage(parsed.jid, finalReply);

        saveMessage({
          contact_jid: parsed.jid,
          direction: 'outgoing',
          message_type: 'text',
          body: finalReply,
          from_bot: true,
          rule_id: resolved.rule ? resolved.rule.id : null
        });
        updateContactMessage(parsed.jid, finalReply, false);
        updateMemoryAfterAssistantReply(parsed.jid, finalReply);

        if (resolved.rule) {
          addLog('info', 'rules', `Matched rule: ${resolved.rule.name}`, { jid: parsed.jid, rule_id: resolved.rule.id });
          trackEvent('rule_matched', parsed.jid, resolved.rule.id, { rule: resolved.rule.name, provider: 'rules' });
          if (resolved.rule.handoff_on_match) {
            setHandoff(parsed.jid, true);
            trackEvent('handoff_triggered', parsed.jid, resolved.rule.id, { reason: 'rule_handoff_on_match', provider: 'handoff' });
          }
        }

        trackEvent('auto_reply', parsed.jid, resolved.rule ? resolved.rule.id : null, {
          provider: resolved.rule ? 'rules' : resolved.source,
          mode,
          messageType: parsed.messageType
        });

        addLog('info', 'rules', 'Reply delivered', {
          jid: parsed.jid,
          provider: resolved.rule ? 'rules' : resolved.source,
          mode,
          rule_id: resolved.rule ? resolved.rule.id : null
        });
      }
    });

    io.emit('conversation:updated', { jid: parsed.jid });
  } catch (error) {
    addLog('error', 'whatsapp', 'Failed to process inbound message', { error: error.message });
  }
}

module.exports = {
  processInboundMessage,
  trackEvent
};
