const { db, upsertSetting } = require('../database/db');

function getCompanyProfile() {
  return db.prepare('SELECT * FROM company_profile ORDER BY id ASC LIMIT 1').get();
}

function mapProfileToSettings(profile) {
  return {
    company_name: profile.company_name,
    company_contact_number: profile.contact_number,
    company_field: profile.business_description,
    management_general_manager: profile.general_manager,
    management_company_manager: profile.company_responsible,
    management_center_manager: profile.center_manager_current || profile.center_manager,
    management_center_manager_notes: profile.center_manager_notes || '',
    location_company_name: profile.company_location_title,
    location_company_map_url: profile.company_location_url,
    location_center_name: profile.center_location_title,
    location_center_map_url: profile.center_location_url
  };
}

function saveCompanyProfile(payload = {}) {
  const current = getCompanyProfile();
  const next = {
    company_name: payload.company_name || current?.company_name || 'شركة فضاء المحركات / Cars Space',
    contact_number: payload.contact_number || current?.contact_number || '0578448146',
    business_description: payload.business_description || current?.business_description || '',
    general_manager: payload.general_manager || current?.general_manager || '',
    company_responsible: payload.company_responsible || current?.company_responsible || '',
    center_manager: payload.center_manager || current?.center_manager || '',
    center_manager_current: payload.center_manager_current || payload.center_manager || current?.center_manager_current || current?.center_manager || '',
    center_manager_notes: payload.center_manager_notes || current?.center_manager_notes || '',
    company_location_title: payload.company_location_title || current?.company_location_title || '',
    company_location_url: payload.company_location_url || current?.company_location_url || '',
    center_location_title: payload.center_location_title || current?.center_location_title || '',
    center_location_url: payload.center_location_url || current?.center_location_url || ''
  };

  if (current?.id) {
    db.prepare(`
      UPDATE company_profile
      SET company_name = ?,
          contact_number = ?,
          business_description = ?,
          general_manager = ?,
          company_responsible = ?,
          center_manager = ?,
          center_manager_current = ?,
          center_manager_notes = ?,
          company_location_title = ?,
          company_location_url = ?,
          center_location_title = ?,
          center_location_url = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      next.company_name,
      next.contact_number,
      next.business_description,
      next.general_manager,
      next.company_responsible,
      next.center_manager,
      next.center_manager_current,
      next.center_manager_notes,
      next.company_location_title,
      next.company_location_url,
      next.center_location_title,
      next.center_location_url,
      current.id
    );
  } else {
    db.prepare(`
      INSERT INTO company_profile (
        company_name, contact_number, business_description,
        general_manager, company_responsible, center_manager, center_manager_current, center_manager_notes,
        company_location_title, company_location_url,
        center_location_title, center_location_url,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      next.company_name,
      next.contact_number,
      next.business_description,
      next.general_manager,
      next.company_responsible,
      next.center_manager,
      next.center_manager_current,
      next.center_manager_notes,
      next.company_location_title,
      next.company_location_url,
      next.center_location_title,
      next.center_location_url
    );
  }

  const map = mapProfileToSettings(next);
  Object.entries(map).forEach(([key, value]) => upsertSetting(key, value || ''));

  return getCompanyProfile();
}

module.exports = {
  getCompanyProfile,
  saveCompanyProfile
};
