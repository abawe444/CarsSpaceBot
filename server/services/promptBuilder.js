const { db } = require('../database/db');
const { getCompanyProfile } = require('./companyProfileService');
const { getKnowledgeEntries } = require('./knowledgeService');
const { getMemoryView } = require('./conversationMemoryService');
const { sanitizeText } = require('./sanitizer');

function getRecentMessages(contactJid, limit = 30) {
  return db
    .prepare(`
      SELECT direction, body, message_type, from_bot, created_at
      FROM messages
      WHERE contact_jid = ?
      ORDER BY id DESC
      LIMIT ?
    `)
    .all(contactJid, limit)
    .reverse();
}

function pickRelevantKnowledge(messageText = '', memorySummary = '') {
  const all = getKnowledgeEntries({}).filter((k) => k.enabled);
  const query = `${messageText} ${memorySummary}`.toLowerCase();
  const scored = all
    .map((entry) => {
      const text = `${entry.title} ${entry.category} ${entry.content}`.toLowerCase();
      let score = 0;
      query.split(/\s+/).filter(Boolean).forEach((token) => {
        if (token.length > 1 && text.includes(token)) score += 1;
      });
      return { entry, score };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored.filter((s) => s.score > 0).slice(0, 6).map((s) => s.entry);
  if (top.length) return top;
  return all.slice(0, 3);
}

function formatKnowledge(entries = []) {
  return entries
    .map((e, i) => `${i + 1}) [${e.category}] ${e.title}: ${sanitizeText(e.content).slice(0, 700)}`)
    .join('\n');
}

function formatHistory(messages = []) {
  return messages
    .map((m) => `${m.from_bot ? 'المساعد' : 'العميل'} (${m.message_type}): ${sanitizeText(m.body || '').slice(0, 500)}`)
    .join('\n');
}

function buildPromptContext({
  contactJid,
  settings,
  currentUserMessage,
  messageType = 'text',
  mediaInsight = '',
  conversationType = 'customer_private',
  requesterIdentity = null
}) {
  const company = getCompanyProfile();
  const memory = getMemoryView(contactJid);
  const history = getRecentMessages(contactJid, Number(settings.context_messages_count || 30));
  const knowledge = pickRelevantKnowledge(currentUserMessage, memory.conversation_summary || '');
  const person = requesterIdentity?.known ? requesterIdentity.person : null;
  const personPermissions = requesterIdentity?.known ? requesterIdentity.permissions : null;
  const personPolicy = requesterIdentity?.known ? requesterIdentity.policy : null;

  const companyContext = `
اسم الشركة: ${company.company_name || settings.company_name || 'شركة فضاء المحركات / Cars Space'}
رقم التواصل: ${company.contact_number || settings.company_contact_number || '0578448146'}
المدير العام: ${company.general_manager || settings.management_general_manager || ''}
مسؤول جهة الشركة: ${company.company_responsible || settings.management_company_manager || ''}
مدير المركز: ${company.center_manager_current || company.center_manager || settings.management_center_manager || ''}
موقع الشركة: ${company.company_location_url || settings.location_company_map_url || ''}
موقع المركز: ${company.center_location_url || settings.location_center_map_url || ''}
`.trim();

  const memoryContext = `
conversation_type: ${conversationType}
current_intent: ${memory.current_intent || 'unknown'}
collected_data_json: ${memory.collected_data_json || '{}'}
missing_fields_json: ${memory.missing_fields_json || '[]'}
last_assistant_question: ${memory.last_assistant_question || ''}
emotional_tone: ${memory.emotional_tone || 'neutral'}
frustration_level: ${memory.frustration_level || 0}
conversation_summary: ${memory.conversation_summary || ''}
`.trim();

  const personContext = person
    ? `
المتحدث الحالي معروف في النظام:
الاسم: ${person.full_name || ''}
اسم النداء: ${person.preferred_name || ''}
المسمى: ${person.title || ''}
الدور: ${person.role_key || ''}
مستوى التفاصيل: ${personPolicy?.report_detail_level || 'متوسط'}
الصلاحيات: ${Object.entries(personPermissions || {}).filter(([, allowed]) => allowed).map(([k]) => k).join(', ') || 'لا توجد'}
تعليمات مخصصة لهذا الشخص: ${personPolicy?.custom_system_instruction || 'لا يوجد'}
نوع القناة: ${conversationType}
`
    : 'المتحدث الحالي عميل/جهة غير معرّفة بصلاحيات إدارية.';

  const control = `
تعليمات جودة الرد:
- افهم السياق ولا تعتمد فقط على الكلمات المفتاحية.
- تجنب تكرار نفس fallback أو نفس السؤال.
- إذا العميل جاوب على سؤالك السابق، أكمل من نفس النقطة.
- اسأل سؤالًا واحدًا مفيدًا غالبًا (بحد أقصى سؤالين).
- لا تخترع أسعار أو توفر قطع.
- إذا المعلومة غير مؤكدة قل: "خلني أتأكد لك من الموظف المختص 👌".
- الرد يكون طبيعي وقصير ومهني باللهجة السعودية البيضاء.
`.trim();

  const systemPrompt = (settings.assistant_prompt || '').trim();
  const finalSystemPrompt = `${systemPrompt}\n\n${control}\n\nسياق الشركة:\n${companyContext}`;

  const userContextPayload = `
قاعدة معرفة ذات صلة:
${formatKnowledge(knowledge)}

سياق المتحدث:
${personContext}

ذاكرة المحادثة:
${memoryContext}

آخر ${history.length} رسالة:
${formatHistory(history)}

تحليل الوسائط:
${mediaInsight || 'لا يوجد'}

رسالة العميل الحالية (${messageType}):
${sanitizeText(currentUserMessage || '')}

المطلوب:
1) اكتب الرد النهائي المناسب للعميل.
2) لا تكرر ردود عامة مملة.
3) إذا في بيانات ناقصة اطلب أهم معلومة ناقصة فقط.
`.trim();

  const messages = [
    { role: 'system', content: finalSystemPrompt },
    ...history.map((m) => ({ role: m.from_bot ? 'assistant' : 'user', content: sanitizeText(m.body || '') })),
    { role: 'user', content: userContextPayload }
  ];

  return {
    systemPrompt: finalSystemPrompt,
    messages,
    memory,
    history,
    knowledge
  };
}

module.exports = {
  buildPromptContext
};
