function sanitizeText(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArabic(input) {
  return sanitizeText(input)
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

module.exports = {
  sanitizeText,
  normalizeArabic
};