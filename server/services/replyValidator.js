const { sanitizeText } = require('./sanitizer');

function normalize(text = '') {
  return sanitizeText(text)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه');
}

function isTooGeneric(text = '') {
  const n = normalize(text);
  const blocked = [
    'فضلا وضح طلبك اكثر',
    'فضلاً وضّح طلبك أكثر',
    'وصلت رسالتك',
    'كيف اقدر اخدمك'
  ];
  return blocked.some((b) => n.includes(normalize(b)));
}

function looksRepeatedQuestion(current = '', lastQuestion = '') {
  if (!current || !lastQuestion) return false;
  const q1 = normalize(current).split('؟')[0];
  const q2 = normalize(lastQuestion).split('؟')[0];
  return Boolean(q1 && q2 && q1 === q2);
}

function validateAndImproveReply({
  replyText,
  lastAssistantReply = '',
  lastAssistantQuestion = '',
  missingFields = []
}) {
  let text = sanitizeText(replyText || '');
  if (!text) return { ok: false, reason: 'empty' };

  const sameAsLast = normalize(text) === normalize(lastAssistantReply || '');
  const repeatedQuestion = looksRepeatedQuestion(text, lastAssistantQuestion || '');
  const generic = isTooGeneric(text);

  if (sameAsLast || repeatedQuestion || generic) {
    if (missingFields.length) {
      const fieldLabelMap = {
        vin: 'رقم الهيكل',
        car_make: 'نوع السيارة',
        car_model: 'موديل السيارة',
        car_year: 'سنة السيارة',
        part_name: 'اسم القطعة',
        problem_description: 'وصف المشكلة',
        is_drivable: 'هل السيارة تمشي؟'
      };
      const next = fieldLabelMap[missingFields[0]] || 'المعلومة الأساسية الناقصة';
      text = `تمام عليك 👌 عشان نكمل بسرعة، أرسل ${next} فقط.`;
    } else {
      text = 'تمام، وصلتني الفكرة 👍 خلنا نكمل خطوة خطوة حسب طلبك.';
    }
  }

  return {
    ok: true,
    text
  };
}

module.exports = {
  validateAndImproveReply
};
