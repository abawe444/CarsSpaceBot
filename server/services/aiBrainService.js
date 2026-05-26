const { getSettings } = require('./settingsService');
const { getEnabledRules, findMatchedRule } = require('./rulesEngine');
const { normalizeArabic } = require('./sanitizer');
const { generateAIReply, getPublicProviderSettings } = require('./aiProviderService');
const { getKnowledgeEntries } = require('./knowledgeService');
const { getCompanyProfile } = require('./companyProfileService');

function safetyResponse() {
  return 'سلامتك أهم شيء. فضلاً وقف السيارة في مكان آمن ولا تواصل القيادة، وراح أحوّل طلبك للموظف المختص مباشرة.';
}

function detectDanger(text) {
  const normalized = normalizeArabic(String(text || ''));
  const dangerKeywords = ['حراره', 'حرارة', 'فرامل', 'دخان', 'تسريب', 'احتراق'];
  return dangerKeywords.some((k) => normalized.includes(normalizeArabic(k)));
}

function getKnowledgeHints(message) {
  const normalized = normalizeArabic(String(message || ''));
  const all = getKnowledgeEntries({}).filter((row) => row.enabled);
  const words = normalized.split(/\s+/).filter((w) => w.length >= 2);

  const matched = all.filter((entry) => {
    const text = normalizeArabic(`${entry.title} ${entry.category} ${entry.content || ''}`).slice(0, 1200);
    if (!normalized) return false;
    if (text.includes(normalized) || normalized.includes(normalizeArabic(entry.category || ''))) return true;
    let hits = 0;
    for (const w of words) {
      if (text.includes(w)) hits += 1;
    }
    return hits >= 2;
  });

  if (matched.length) return matched.slice(0, 3);
  return all.slice(0, 2);
}

function isWildcardRule(rule) {
  if (!rule) return false;
  const keywords = String(rule.keywords || '');
  return rule.match_type === 'wildcard' || keywords.includes('*') || normalizeArabic(String(rule.name || '')) === 'fallback';
}

function smartLocalReply(message, settings) {
  const text = normalizeArabic(String(message || ''));
  const company = getCompanyProfile();
  const contactNumber = company?.contact_number || settings.company_contact_number || '0578448146';
  const companyMap = company?.company_location_url || settings.location_company_map_url || 'https://maps.app.goo.gl/E3h8iazC7MMeBTQX6';
  const centerMap = company?.center_location_url || settings.location_center_map_url || 'https://maps.app.goo.gl/b1c3qkPPfKnQzQEs9';
  const gm = company?.general_manager || settings.management_general_manager || 'الأستاذ عبد الحكيم المذهول';

  if (/(سلام|هلا|مرحبا|اهلين|السلام عليكم)/.test(text)) {
    return 'وعليكم السلام ورحمة الله وبركاته، حياك الله في فضاء المحركات. كيف نقدر نخدمك؟';
  }
  if (/(مين انت|من انت|وش تسوي|وش خدماتكم|ايش خدماتكم|تعريف)/.test(text)) {
    return 'أنا مساعد فضاء المحركات. أساعدك في طلبات الصيانة وقطع الغيار والحجز والموقع، وأقدر أحوّل طلبك مباشرة للموظف المختص عند الحاجة.';
  }
  if (/(سعر|قطعه|قطع|صدام|رفرف|باب|كبوت|اسطب|شمعة|مكينه|قير|vin|هيكل)/.test(text)) {
    return 'أكيد، أبشر. عشان نعطيك إفادة أدق فضلاً أرسل رقم الهيكل VIN إن توفر، واسم القطعة، ونوع السيارة والموديل والسنة.';
  }
  if (/(موقع|وين|لوكيشن|العنوان|فرع)/.test(text)) {
    return `حياك الله، تفضل المواقع:\nالشركة: ${companyMap}\nالمركز: ${centerMap}`;
  }
  if (/(رقم|جوال|اتصال|تواصل)/.test(text)) {
    return `رقم التواصل معنا: ${contactNumber}\nوتقدر ترسل طلبك هنا مباشرة ونخدمك بإذن الله.`;
  }
  if (/(حجز|موعد|صيانه|فحص|عطل|مشكله)/.test(text)) {
    return 'حياك الله. حتى نخدمك بسرعة أرسل: نوع السيارة، الموديل والسنة، وصف المشكلة، وهل السيارة تمشي أو تحتاج سطحة.';
  }
  if (/(مدير|اداره|مسؤول)/.test(text)) {
    return `حياك الله، للإدارة العامة: ${gm}. وإذا عندك ملاحظة أقدر أحوّلها مباشرة للموظف المختص.`;
  }
  if (/(زعلان|شكوى|غير راضي|سيء|تاخير)/.test(text)) {
    return 'نعتذر لك عن أي إزعاج، وحقك علينا. راح أحوّل طلبك للموظف المختص عشان يتابع معك بشكل مباشر.';
  }
  return 'وصلت رسالتك 👍\nخلني أراجع سياق المحادثة وأساعدك بأقرب طريقة. إذا كان طلبك عن قطعة، أرسل اسم القطعة أو صورة لها، وإذا كان عن صيانة اكتب المشكلة باختصار.';
}

async function buildAiTestReply(message) {
  const settings = getSettings();
  const text = String(message || '').trim();
  const mode = settings.ai_mode || getPublicProviderSettings().ai_mode || 'rules_first';

  if (detectDanger(text)) {
    return {
      providerUsed: 'handoff',
      matchedRule: null,
      knowledgeUsed: ['السلامة في الأعطال الخطيرة'],
      finalReply: safetyResponse(),
      modeUsed: 'handoff'
    };
  }

  const matchedRule = settings.rules_enabled ? findMatchedRule(text, getEnabledRules()) : null;
  const meaningfulRule = matchedRule && !isWildcardRule(matchedRule) ? matchedRule : null;
  const forceRule = meaningfulRule && meaningfulRule.force_rule ? meaningfulRule : null;

  if (mode === 'rules_only') {
    if (meaningfulRule) {
      return {
        providerUsed: 'rules',
        matchedRule: { id: meaningfulRule.id, name: meaningfulRule.name, category: meaningfulRule.category },
        knowledgeUsed: [],
        finalReply: meaningfulRule.reply,
        modeUsed: 'rules'
      };
    }
    return {
      providerUsed: 'rules',
      matchedRule: null,
      knowledgeUsed: getKnowledgeHints(text).map((k) => k.title),
      finalReply: smartLocalReply(text, settings),
      modeUsed: 'rules'
    };
  }

  if (mode === 'rules_first' && meaningfulRule) {
    return {
      providerUsed: 'rules',
      matchedRule: { id: meaningfulRule.id, name: meaningfulRule.name, category: meaningfulRule.category },
      knowledgeUsed: [],
      finalReply: meaningfulRule.reply,
      modeUsed: 'rules'
    };
  }

  let aiResult = null;
  if (mode !== 'rules_only') {
    aiResult = await generateAIReply({
      userMessage: text,
      systemPrompt: settings.assistant_prompt
    });
  }

  if (mode === 'ai_first' && forceRule) {
    return {
      providerUsed: 'rules',
      matchedRule: { id: forceRule.id, name: forceRule.name, category: forceRule.category },
      knowledgeUsed: [],
      finalReply: forceRule.reply,
      modeUsed: 'rules'
    };
  }

  if (aiResult && aiResult.ok) {
    const hints = getKnowledgeHints(text).map((k) => k.title);
    return {
      providerUsed: aiResult.source,
      matchedRule: meaningfulRule ? { id: meaningfulRule.id, name: meaningfulRule.name, category: meaningfulRule.category } : null,
      knowledgeUsed: hints,
      finalReply: aiResult.text,
      modeUsed: 'ai'
    };
  }

  if (forceRule) {
    return {
      providerUsed: 'rules',
      matchedRule: { id: forceRule.id, name: forceRule.name, category: forceRule.category },
      knowledgeUsed: [],
      finalReply: forceRule.reply,
      modeUsed: 'rules'
    };
  }

  return {
    providerUsed: mode === 'ai_only' ? 'fallback' : 'rules',
    matchedRule: null,
    knowledgeUsed: getKnowledgeHints(text).map((k) => k.title),
    finalReply: smartLocalReply(text, settings),
    modeUsed: mode === 'ai_only' ? 'fallback' : 'rules'
  };
}

module.exports = {
  buildAiTestReply
};
