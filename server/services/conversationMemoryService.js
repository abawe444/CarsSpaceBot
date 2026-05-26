const { db } = require('../database/db');
const { normalizeArabic, sanitizeText } = require('./sanitizer');

const intents = [
  'greeting',
  'spare_part_request',
  'price_request',
  'maintenance_request',
  'booking_request',
  'location_request',
  'complaint',
  'manager_request',
  'follow_up',
  'image_context',
  'voice_context',
  'unknown'
];

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getMemory(contactJid) {
  return db.prepare('SELECT * FROM conversation_memory WHERE contact_jid = ?').get(contactJid);
}

function ensureMemory(contactJid, conversationType = 'customer_private') {
  let row = getMemory(contactJid);
  if (!row) {
    db.prepare(`
      INSERT INTO conversation_memory (
        contact_jid, conversation_type, current_intent, collected_data_json, missing_fields_json,
        emotional_tone, conversation_summary, frustration_level, open_request_status, created_at, updated_at
      )
      VALUES (?, ?, 'unknown', '{}', '[]', 'neutral', '', 0, 'open', datetime('now'), datetime('now'))
    `).run(contactJid, conversationType);
    row = getMemory(contactJid);
  }
  return row;
}

function detectIntent({ text = '', messageType = 'text', previousIntent = 'unknown' }) {
  const n = normalizeArabic(String(text || ''));
  if (messageType === 'image') return 'image_context';
  if (messageType === 'voice') return 'voice_context';
  if (!n) return previousIntent || 'unknown';

  if (/السلام|هلا|مرحبا|اهلين|سلام/.test(n)) return 'greeting';
  if (/زعلان|شكوى|غير راضي|سيء|تاخير|ما رديتوا/.test(n)) return 'complaint';
  if (/مدير|اداره|ابو شادي|عبد الحكيم|جهاد/.test(n)) return 'manager_request';
  if (/موقع|لوكيشن|العنوان|وين/.test(n)) return 'location_request';
  if (/حجز|موعد/.test(n)) return 'booking_request';
  if (/صيانه|صيانة|فحص|عطل|حراره|حرارة|فرامل|دخان|تهريب|ريحة حرق/.test(n)) return 'maintenance_request';
  if (/سعر|بكم|كم/.test(n) && /قطعه|قطعة|صدام|رفرف|باب|كبوت|شمعة|اسطب|مكينه|مكينة|قير/.test(n)) return 'price_request';
  if (/قطعه|قطعة|صدام|رفرف|باب|كبوت|شمعة|اسطب|مكينه|مكينة|قير|vin|هيكل/.test(n)) return 'spare_part_request';
  if (/202[0-9]|201[0-9]|19[0-9]{2}|لا يوجد|مو موجود|غير موجود/.test(n)) return 'follow_up';

  return previousIntent && previousIntent !== 'unknown' ? 'follow_up' : 'unknown';
}

function detectEmotionalTone(text = '') {
  const n = normalizeArabic(text);
  if (/زعلان|غاضب|معصب|مشكله كبيره|سيء/.test(n)) return { tone: 'angry', frustration: 3 };
  if (/مستعجل|عاجل|ضروري/.test(n)) return { tone: 'urgent', frustration: 2 };
  if (/شكرا|ممتاز|يعطيكم العافيه|بيض الله وجهك/.test(n)) return { tone: 'positive', frustration: 0 };
  return { tone: 'neutral', frustration: 1 };
}

function extractSparePartFields(text = '', collected = {}) {
  const raw = String(text || '');
  const n = normalizeArabic(raw);
  const out = { ...collected };

  const year = n.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) out.car_year = year[1];

  const vin = raw.match(/\b[A-HJ-NPR-Z0-9]{11,17}\b/i);
  if (vin) out.vin = vin[0];

  const makes = ['كامري', 'تويوتا', 'نيسان', 'هونداي', 'هيونداي', 'لكزس', 'فورد', 'شفر', 'كيا'];
  const detectedMake = makes.find((m) => n.includes(normalizeArabic(m)));
  if (detectedMake && !out.car_make) out.car_make = detectedMake;
  if (detectedMake && !out.car_model) out.car_model = detectedMake;

  const parts = ['صدام', 'رفرف', 'باب', 'كبوت', 'شمعة', 'اسطب', 'قير', 'مكينة', 'فلتر', 'رديتر'];
  const detectedPart = parts.find((p) => n.includes(normalizeArabic(p)));
  if (detectedPart && !out.part_name) out.part_name = detectedPart;

  const sides = ['يمين', 'يسار', 'امامي', 'خلفي'];
  const detectedSide = sides.find((s) => n.includes(normalizeArabic(s)));
  if (detectedSide) out.part_side = detectedSide;

  if (/اصلي|جديد|وكاله/.test(n)) out.part_condition = 'new';
  if (/مستعمل/.test(n)) out.part_condition = 'used';

  return out;
}

function extractMaintenanceFields(text = '', collected = {}) {
  const raw = String(text || '');
  const n = normalizeArabic(raw);
  const out = { ...collected };

  const year = n.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) out.car_year = year[1];

  const makes = ['كامري', 'تويوتا', 'نيسان', 'هونداي', 'هيونداي', 'لكزس', 'فورد', 'شفر', 'كيا'];
  const detectedMake = makes.find((m) => n.includes(normalizeArabic(m)));
  if (detectedMake && !out.car_make) out.car_make = detectedMake;
  if (detectedMake && !out.car_model) out.car_model = detectedMake;

  if (/تمشي|تتحرك|مشي/.test(n)) out.is_drivable = 'yes';
  if (/سطحه|ونش|ما تمشي/.test(n)) out.is_drivable = 'no';

  if (/المشكله|عطل|حراره|حرارة|دخان|فرامل|رجة|صوت/.test(n)) {
    out.problem_description = sanitizeText(raw).slice(0, 300);
  }

  return out;
}

function requiredFieldsByIntent(intent) {
  if (intent === 'spare_part_request' || intent === 'price_request') {
    return ['car_make', 'car_model', 'car_year', 'part_name', 'vin'];
  }
  if (intent === 'maintenance_request' || intent === 'booking_request') {
    return ['car_make', 'car_model', 'car_year', 'problem_description', 'is_drivable'];
  }
  return [];
}

function detectMissingFields(intent, collected) {
  const required = requiredFieldsByIntent(intent);
  return required.filter((field) => !collected[field]);
}

function buildSummary({ intent, collected, emotionalTone, lastUserMessage }) {
  const pieces = [];
  pieces.push(`النية الحالية: ${intent || 'unknown'}`);
  if (collected?.car_make || collected?.car_model || collected?.car_year) {
    pieces.push(`السيارة: ${[collected.car_make, collected.car_model, collected.car_year].filter(Boolean).join(' / ')}`);
  }
  if (collected?.part_name) pieces.push(`القطعة: ${collected.part_name}`);
  if (collected?.vin) pieces.push('VIN متوفر');
  if (emotionalTone) pieces.push(`النبرة: ${emotionalTone}`);
  if (lastUserMessage) pieces.push(`آخر رسالة: ${sanitizeText(lastUserMessage).slice(0, 100)}`);
  return pieces.join(' | ');
}

function upsertCustomerRequest({ contactJid, intent, collected, missingFields, emotionalTone, sourceMessageId = '' }) {
  const mappedType = intent === 'price_request' ? 'spare_part_request' : intent;
  if (!['spare_part_request', 'maintenance_request', 'booking_request', 'complaint', 'location_request', 'manager_request'].includes(mappedType)) return;

  const existing = db
    .prepare("SELECT * FROM customer_requests WHERE contact_jid = ? AND status IN ('open','pending') ORDER BY id DESC LIMIT 1")
    .get(contactJid);

  const status = missingFields.length ? 'pending' : 'ready';
  const summary = buildSummary({
    intent: mappedType,
    collected,
    emotionalTone,
    lastUserMessage: ''
  });

  if (existing) {
    db.prepare(`
      UPDATE customer_requests
      SET request_type = ?, status = ?, summary = ?, car_make = ?, car_model = ?, car_year = ?, vin = ?, part_name = ?,
          missing_fields_json = ?, emotional_tone = ?, source_message_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      mappedType,
      status,
      summary,
      collected.car_make || null,
      collected.car_model || null,
      collected.car_year || null,
      collected.vin || null,
      collected.part_name || null,
      JSON.stringify(missingFields || []),
      emotionalTone || null,
      sourceMessageId || null,
      existing.id
    );
    return existing.id;
  }

  const info = db.prepare(`
    INSERT INTO customer_requests (
      contact_jid, request_type, status, summary, car_make, car_model, car_year, vin, part_name,
      missing_fields_json, emotional_tone, source_message_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    contactJid,
    mappedType,
    status,
    summary,
    collected.car_make || null,
    collected.car_model || null,
    collected.car_year || null,
    collected.vin || null,
    collected.part_name || null,
    JSON.stringify(missingFields || []),
    emotionalTone || null,
    sourceMessageId || null
  );

  return info.lastInsertRowid;
}

function updateMemoryAfterInbound({ contactJid, conversationType, messageType, userText, sourceMessageId = '' }) {
  const row = ensureMemory(contactJid, conversationType);
  const prevCollected = parseJson(row.collected_data_json, {});
  const prevIntent = row.current_intent || 'unknown';

  const intent = detectIntent({
    text: userText,
    messageType,
    previousIntent: prevIntent
  });

  let collected = { ...prevCollected };
  if (intent === 'spare_part_request' || intent === 'price_request' || prevIntent === 'spare_part_request' || prevIntent === 'price_request') {
    collected = extractSparePartFields(userText, collected);
  }
  if (intent === 'maintenance_request' || intent === 'booking_request' || prevIntent === 'maintenance_request' || prevIntent === 'booking_request') {
    collected = extractMaintenanceFields(userText, collected);
  }

  if (messageType === 'image') collected.image_received = true;
  if (messageType === 'voice') collected.voice_received = true;

  const missingFields = detectMissingFields(intent === 'follow_up' ? prevIntent : intent, collected);
  const { tone, frustration } = detectEmotionalTone(userText);
  const effectiveIntent = intent === 'follow_up' && prevIntent !== 'unknown' ? prevIntent : intent;
  const summary = buildSummary({
    intent: effectiveIntent,
    collected,
    emotionalTone: tone,
    lastUserMessage: userText
  });

  db.prepare(`
    UPDATE conversation_memory
    SET conversation_type = ?,
        current_intent = ?,
        collected_data_json = ?,
        missing_fields_json = ?,
        emotional_tone = ?,
        conversation_summary = ?,
        last_user_message = ?,
        frustration_level = ?,
        open_request_status = ?,
        updated_at = datetime('now')
    WHERE contact_jid = ?
  `).run(
    conversationType,
    effectiveIntent,
    JSON.stringify(collected),
    JSON.stringify(missingFields),
    tone,
    summary,
    sanitizeText(userText || ''),
    frustration,
    missingFields.length ? 'open' : 'ready',
    contactJid
  );

  upsertCustomerRequest({
    contactJid,
    intent: effectiveIntent,
    collected,
    missingFields,
    emotionalTone: tone,
    sourceMessageId
  });

  return getMemory(contactJid);
}

function updateMemoryAfterAssistantReply(contactJid, replyText) {
  const question = String(replyText || '').includes('؟') ? String(replyText || '').split('؟')[0].slice(-120) + '؟' : '';
  db.prepare(`
    UPDATE conversation_memory
    SET last_assistant_reply = ?,
        last_assistant_question = ?,
        updated_at = datetime('now')
    WHERE contact_jid = ?
  `).run(sanitizeText(replyText || ''), sanitizeText(question), contactJid);
}

function getMemoryView(contactJid) {
  const row = ensureMemory(contactJid, 'customer_private');
  return {
    ...row,
    collected_data: parseJson(row.collected_data_json, {}),
    missing_fields: parseJson(row.missing_fields_json, [])
  };
}

module.exports = {
  intents,
  ensureMemory,
  getMemory,
  getMemoryView,
  updateMemoryAfterInbound,
  updateMemoryAfterAssistantReply
};
