function normalizeIdentifier(value = '') {
  return String(value || '').trim().toLowerCase();
}

function unique(items = []) {
  return Array.from(new Set(items.filter(Boolean)));
}

const defaultOwnerPhone = process.env.OWNER_PHONE || '0578448146';
const defaultOwnerNormalizedPhone = process.env.OWNER_NORMALIZED_PHONE || '966578448146';
const defaultOwnerLid = process.env.OWNER_LID || '271352091164856@lid';
const defaultOwnerRawLid = String(defaultOwnerLid).replace(/@lid$/i, '');

const OWNER_IDENTIFIERS = unique([
  '0578448146',
  '966578448146',
  '966578448146@s.whatsapp.net',
  '271352091164856',
  '271352091164856@lid',
  defaultOwnerPhone,
  defaultOwnerNormalizedPhone,
  `${defaultOwnerNormalizedPhone}@s.whatsapp.net`,
  defaultOwnerLid,
  defaultOwnerRawLid
].map(normalizeIdentifier));

const OWNER_PROFILE = {
  full_name: process.env.OWNER_NAME || 'عبد الله',
  preferred_name: process.env.OWNER_PREFERRED_NAME || 'عباوي',
  title: process.env.OWNER_TITLE || 'مدير التطوير التقني',
  role_key: 'system_owner',
  role_label: 'مالك النظام',
  is_super_admin: true
};

module.exports = {
  OWNER_IDENTIFIERS,
  OWNER_PROFILE,
  normalizeIdentifier
};
