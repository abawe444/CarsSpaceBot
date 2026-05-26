const { normalizeArabic } = require('./sanitizer');

function includesAny(text, probes = []) {
  return probes.some((probe) => text.includes(normalizeArabic(probe)));
}

function isReportTrigger(text = '') {
  const n = normalizeArabic(text);
  return includesAny(n, [
    'تقرير',
    'ملخص',
    'وش صار',
    'كم عميل',
    'كم واحد',
    'شكاوى',
    'متابعة',
    'طلبات',
    'اكثر',
    'آخر ساعة',
    'تقني',
    'مالي',
    'تنفيذي',
    'أداء البوت',
    'عملاء',
    'محادثات',
    'قطع',
    'تسويقي'
  ]);
}

function detectReportIntent(text = '') {
  const n = normalizeArabic(text);

  if (includesAny(n, ['تنفيذي', 'اداري', 'الادارة العامة'])) return { type: 'executive_summary' };
  if (includesAny(n, ['تقني', 'أداء البوت', 'تحليل البوت', 'سجلات الذكاء', 'fallback', 'ai'])) return { type: 'technical_report' };
  if (includesAny(n, ['مالي', 'ارقام', 'أرقام', 'فرص', 'عوائد'])) return { type: 'financial_summary' };
  if (includesAny(n, ['تشغيل', 'تشغيلي', 'طلبات مفتوحة'])) return { type: 'operations' };
  if (includesAny(n, ['تسويقي', 'تسويق', 'اهتمامات', 'أسئلة العملاء'])) return { type: 'marketing_summary' };
  if (includesAny(n, ['عملاء', 'من تواصل معنا', 'ملخص العملاء'])) return { type: 'customers' };
  if (includesAny(n, ['آخر ساعة', 'اخر ساعة'])) return { type: 'hourly_summary' };
  if (includesAny(n, ['شكاوى', 'زعلان', 'غاضب'])) return { type: 'complaints' };
  if (includesAny(n, ['قطع', 'قطعة', 'صدام', 'اسعار', 'أسعار'])) return { type: 'parts' };
  if (includesAny(n, ['تحويل', 'تدخل بشري', 'موظف'])) return { type: 'handoff' };
  if (includesAny(n, ['صوت', 'تسجيل', 'صورة', 'وسائط'])) return { type: 'media' };
  if (includesAny(n, ['مفتوح', 'متابعة'])) return { type: 'open_requests' };
  if (includesAny(n, ['من تواصل', 'كم عميل', 'ملخص اليوم', 'تقرير اليوم', 'وش صار اليوم', 'وش اكثر'])) return { type: 'daily_summary' };

  return { type: 'daily_summary' };
}

function isCommandMessage(text = '') {
  const raw = String(text || '').trim();
  return raw.startsWith('!') || raw.startsWith('/') || raw.startsWith('#تقرير') || raw.startsWith('#ملخص');
}

module.exports = {
  isReportTrigger,
  detectReportIntent,
  isCommandMessage
};
