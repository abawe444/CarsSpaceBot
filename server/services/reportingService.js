const { db } = require('../database/db');
const { getSettings } = require('./settingsService');

function maskPhone(value = '') {
  const s = String(value || '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return s || '-';
  const prefix = digits.slice(0, 4);
  const suffix = digits.slice(-3);
  return `${prefix}${'*'.repeat(Math.max(1, digits.length - 7))}${suffix}`;
}

function contactLabel(jid, requesterPolicy = null) {
  const row = db.prepare('SELECT display_name, phone FROM contacts WHERE jid = ?').get(jid) || {};
  const settings = getSettings();
  const canShowFull = Boolean(requesterPolicy?.show_full_customer_numbers) || settings.show_full_customer_numbers_in_admin_reports;
  const phone = canShowFull ? (row.phone || jid.split('@')[0]) : maskPhone(row.phone || jid.split('@')[0]);
  return row.display_name ? `${row.display_name} (${phone})` : phone;
}

function getTodayDailyStats() {
  const conversations = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE date(updated_at, 'localtime') = date('now', 'localtime')").get().c;
  const inbound = db.prepare("SELECT COUNT(*) as c FROM messages WHERE direction='incoming' AND date(created_at, 'localtime') = date('now', 'localtime')").get().c;
  const botReplies = db.prepare("SELECT COUNT(*) as c FROM messages WHERE direction='outgoing' AND from_bot=1 AND date(created_at, 'localtime') = date('now', 'localtime')").get().c;
  const handoff = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE human_handoff = 1").get().c;
  const complaints = db.prepare("SELECT COUNT(*) as c FROM conversation_memory WHERE current_intent='complaint' AND date(updated_at, 'localtime') = date('now', 'localtime')").get().c;
  return { conversations, inbound, botReplies, handoff, complaints };
}

function getTopIntents(limit = 5) {
  return db.prepare(`
    SELECT current_intent as intent, COUNT(*) as count
    FROM conversation_memory
    WHERE current_intent IS NOT NULL
    GROUP BY current_intent
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

function getTopParts(limit = 5) {
  return db.prepare(`
    SELECT COALESCE(part_name, 'غير محدد') as part_name, COUNT(*) as count
    FROM customer_requests
    WHERE request_type IN ('spare_part_request','price_request')
    GROUP BY COALESCE(part_name, 'غير محدد')
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

function getTopCars(limit = 5) {
  return db.prepare(`
    SELECT COALESCE(car_make, 'غير محدد') as car_make, COALESCE(car_model, 'غير محدد') as car_model, COUNT(*) as count
    FROM customer_requests
    GROUP BY COALESCE(car_make, 'غير محدد'), COALESCE(car_model, 'غير محدد')
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
}

function getOpenRequests(limit = 6) {
  return db.prepare(`
    SELECT * FROM customer_requests
    WHERE status IN ('open','pending')
    ORDER BY datetime(updated_at) DESC
    LIMIT ?
  `).all(limit);
}

function getComplaints(limit = 8) {
  return db.prepare(`
    SELECT contact_jid, conversation_summary, emotional_tone, updated_at
    FROM conversation_memory
    WHERE current_intent = 'complaint'
    ORDER BY datetime(updated_at) DESC
    LIMIT ?
  `).all(limit);
}

function getMediaStats() {
  const voice = db.prepare("SELECT COUNT(*) as c FROM media_messages WHERE media_type='voice'").get().c;
  const image = db.prepare("SELECT COUNT(*) as c FROM media_messages WHERE media_type='image'").get().c;
  const failed = db.prepare("SELECT COUNT(*) as c FROM media_messages WHERE processing_status='failed'").get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM media_messages WHERE processing_status IN ('pending','downloading')").get().c;
  return { voice, image, failed, pending };
}

function getHandoffRows(limit = 8) {
  return db.prepare(`
    SELECT jid, display_name, phone, last_message, last_message_at
    FROM contacts
    WHERE human_handoff = 1
    ORDER BY datetime(last_message_at) DESC
    LIMIT ?
  `).all(limit);
}

function getRequestsByRange(hours = 1) {
  return db.prepare(`
    SELECT COUNT(*) as c
    FROM messages
    WHERE direction='incoming'
      AND datetime(created_at) >= datetime('now', ?)
  `).get(`-${Math.max(1, Number(hours || 1))} hour`).c;
}

function buildRoleHint(person = null) {
  if (!person) return '';
  if (person.role_key === 'general_manager') return 'ملخص تنفيذي مركز على المخاطر والنتائج.';
  if (person.role_key === 'technical_development_manager') return 'تفاصيل تقنية أعمق تشمل أداء النظام وسجلات الذكاء.';
  if (person.role_key === 'finance_manager') return 'تركيز على الأرقام والأثر المالي وفرص التحويل.';
  if (person.role_key === 'operations_manager') return 'تركيز على التشغيل والطلبات المفتوحة والاختناقات.';
  if (person.role_key === 'marketing_manager') return 'تركيز على الاهتمامات والأسئلة المتكررة والمشاعر.';
  return '';
}

function formatDailySummaryReport(options = {}) {
  const stats = getTodayDailyStats();
  const topIntents = getTopIntents(3);
  const topParts = getTopParts(3);
  const open = getOpenRequests(3);

  const intentsText = topIntents.length
    ? topIntents.map((r, i) => `${i + 1}. ${r.intent} (${r.count})`).join('\n')
    : 'لا توجد بيانات';

  const partsText = topParts.length
    ? topParts.map((r) => `- ${r.part_name} (${r.count})`).join('\n')
    : 'لا توجد بيانات';

  const openText = open.length
    ? open.map((r, i) => `${i + 1}. ${contactLabel(r.contact_jid, options.requesterPolicy)} - ${r.summary || r.request_type || 'طلب مفتوح'}`).join('\n')
    : 'لا توجد طلبات تحتاج متابعة';

  return `📊 تقرير اليوم - فضاء المحركات

العملاء الذين تواصلوا اليوم: ${stats.conversations}
الرسائل الواردة: ${stats.inbound}
الردود الآلية: ${stats.botReplies}
التدخل البشري: ${stats.handoff}
الشكاوى: ${stats.complaints}

أكثر الطلبات:
${intentsText}

أكثر القطع تكرارًا:
${partsText}

طلبات تحتاج متابعة:
${openText}`;
}

function formatExecutiveSummary(options = {}) {
  const stats = getTodayDailyStats();
  const open = getOpenRequests(5);
  const complaints = getComplaints(3);
  return `📌 ملخص تنفيذي

إجمالي العملاء اليوم: ${stats.conversations}
الحالات المفتوحة: ${open.length}
التدخل البشري: ${stats.handoff}
الشكاوى النشطة: ${complaints.length}

أهم المخاطر:
${open.length ? `- ${open.length} طلبات بانتظار بيانات أو متابعة.` : '- لا توجد مخاطر حرجة.'}
${complaints.length ? '- توجد شكاوى تحتاج متابعة سريعة.' : '- لا توجد شكاوى عالية حالياً.'}`;
}

function formatTechnicalReport() {
  const fallbackHits = db.prepare("SELECT COUNT(*) as c FROM analytics_events WHERE event_type='auto_reply' AND json_extract(meta_json, '$.provider')='fallback' AND date(created_at, 'localtime')=date('now','localtime')").get().c;
  const media = getMediaStats();
  const logsErrors = db.prepare("SELECT COUNT(*) as c FROM logs WHERE level='error' AND date(created_at, 'localtime')=date('now','localtime')").get().c;
  return `🛠️ تقرير تقني

أخطاء اليوم: ${logsErrors}
Fallback triggers اليوم: ${fallbackHits}
تسجيلات صوتية: ${media.voice}
صور: ${media.image}
فشل معالجة الوسائط: ${media.failed}

اقتراحات:
- راجع القواعد الأعلى تسببًا في fallback.
- راقب سجلات مزود الذكاء إذا زادت الأخطاء.`;
}

function formatFinancialSummary() {
  const stats = getTodayDailyStats();
  const parts = getTopParts(5);
  return `💰 ملخص مالي وتشغيلي

العملاء اليوم: ${stats.conversations}
إجمالي الرسائل الواردة: ${stats.inbound}
طلبات قطع الغيار المتكررة:
${parts.length ? parts.map((p) => `- ${p.part_name}: ${p.count}`).join('\n') : '- لا توجد بيانات'}

فرص محتملة:
- متابعة الطلبات المفتوحة قد ترفع نسبة التحويل.
- الطلبات المتكررة على قطع محددة تدعم التخطيط للمخزون.`;
}

function formatMarketingSummary() {
  const intents = getTopIntents(6);
  const parts = getTopParts(5);
  return `📣 ملخص تسويقي

أكثر اهتمامات العملاء:
${intents.length ? intents.map((i) => `- ${i.intent}: ${i.count}`).join('\n') : '- لا توجد بيانات'}

أكثر الكلمات/القطع تكرارًا:
${parts.length ? parts.map((p) => `- ${p.part_name} (${p.count})`).join('\n') : '- لا توجد بيانات'}

مؤشر خدمة العملاء:
- راجع الأسئلة المتكررة لبناء محتوى توضيحي أسرع.`;
}

function formatOperationsReport(options = {}) {
  const open = getOpenRequests(10);
  const handoff = getHandoffRows(8);
  return `⚙️ تقرير التشغيل

طلبات مفتوحة: ${open.length}
حالات تدخل بشري: ${handoff.length}

طلبات تحتاج متابعة:
${open.length ? open.map((r, i) => `${i + 1}. ${contactLabel(r.contact_jid, options.requesterPolicy)} - ${r.summary || r.request_type || '-'}`).join('\n') : 'لا توجد طلبات مفتوحة'}

حالات التدخل:
${handoff.length ? handoff.map((r, i) => `${i + 1}. ${contactLabel(r.jid, options.requesterPolicy)} - ${r.last_message || '-'}`).join('\n') : 'لا توجد'} `;
}

function formatCustomersReport(options = {}) {
  const rows = db.prepare(`
    SELECT contact_jid, COUNT(*) as c
    FROM messages
    WHERE direction='incoming' AND date(created_at, 'localtime')=date('now', 'localtime')
    GROUP BY contact_jid
    ORDER BY c DESC
    LIMIT 10
  `).all();

  if (!rows.length) return 'لا توجد بيانات كافية لهذا التقرير حتى الآن.';
  return `👥 ملخص العملاء

${rows.map((r, i) => `${i + 1}. ${contactLabel(r.contact_jid, options.requesterPolicy)} - ${r.c} رسائل`).join('\n')}`;
}

function formatComplaintsReport(options = {}) {
  const rows = getComplaints(8);
  if (!rows.length) return 'لا توجد بيانات كافية لهذا التقرير حتى الآن.';
  return `📋 تقرير الشكاوى\n\n${rows.map((r, i) => `${i + 1}. ${contactLabel(r.contact_jid, options.requesterPolicy)}\nالنبرة: ${r.emotional_tone || 'neutral'}\nالملخص: ${r.conversation_summary || '-'}\nآخر تحديث: ${r.updated_at}`).join('\n\n')}`;
}

function formatPartsReport() {
  const parts = getTopParts(8);
  const cars = getTopCars(6);
  if (!parts.length && !cars.length) return 'لا توجد بيانات كافية لهذا التقرير حتى الآن.';
  const partsText = parts.length ? parts.map((r) => `- ${r.part_name}: ${r.count}`).join('\n') : '- لا توجد';
  const carsText = cars.length ? cars.map((r) => `- ${r.car_make} ${r.car_model}: ${r.count}`).join('\n') : '- لا توجد';
  return `🧩 تقرير قطع الغيار\n\nأكثر القطع المطلوبة:\n${partsText}\n\nأكثر السيارات تكرارًا:\n${carsText}`;
}

function formatHandoffReport(options = {}) {
  const rows = getHandoffRows(10);
  if (!rows.length) return 'لا توجد محادثات تحت التدخل البشري حاليًا.';
  return `👥 تقرير التدخل البشري\n\n${rows.map((r, i) => `${i + 1}. ${contactLabel(r.jid, options.requesterPolicy)}\nآخر رسالة: ${r.last_message || '-'}\nالوقت: ${r.last_message_at || '-'}`).join('\n\n')}`;
}

function formatMediaReport() {
  const stats = getMediaStats();
  return `🎙️🖼️ تقرير الوسائط

عدد التسجيلات الصوتية: ${stats.voice}
عدد الصور: ${stats.image}
فشل المعالجة: ${stats.failed}
تحتاج متابعة: ${stats.pending}`;
}

function formatOpenRequestsReport(options = {}) {
  const rows = getOpenRequests(12);
  if (!rows.length) return 'لا توجد بيانات كافية لهذا التقرير حتى الآن.';
  return `📌 الطلبات المفتوحة\n\n${rows.map((r, i) => `${i + 1}. ${contactLabel(r.contact_jid, options.requesterPolicy)}\nالنوع: ${r.request_type || '-'}\nالحالة: ${r.status || '-'}\nالناقص: ${r.missing_fields_json || '[]'}\nآخر تحديث: ${r.updated_at}`).join('\n\n')}`;
}

function formatHourlySummaryReport() {
  const count = getRequestsByRange(1);
  return `⏱️ تقرير آخر ساعة\n\nعدد الرسائل الواردة خلال آخر ساعة: ${count}`;
}

function buildReportByType(type, options = {}) {
  let body;
  if (type === 'executive_summary') body = formatExecutiveSummary(options);
  else if (type === 'technical_report' || type === 'ai_logs') body = formatTechnicalReport(options);
  else if (type === 'financial_summary') body = formatFinancialSummary(options);
  else if (type === 'marketing_summary') body = formatMarketingSummary(options);
  else if (type === 'operations') body = formatOperationsReport(options);
  else if (type === 'customers') body = formatCustomersReport(options);
  else if (type === 'complaints') body = formatComplaintsReport(options);
  else if (type === 'parts') body = formatPartsReport(options);
  else if (type === 'handoff') body = formatHandoffReport(options);
  else if (type === 'media') body = formatMediaReport(options);
  else if (type === 'open_requests') body = formatOpenRequestsReport(options);
  else if (type === 'hourly_summary') body = formatHourlySummaryReport(options);
  else body = formatDailySummaryReport(options);

  if (options.requesterPerson) {
    const hint = buildRoleHint(options.requesterPerson);
    if (hint) {
      body = `${body}\n\nملاحظة حسب دورك:\n${hint}`;
    }
  }

  return body;
}

module.exports = {
  buildReportByType,
  formatDailySummaryReport
};
