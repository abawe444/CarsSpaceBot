function isSettingsPage() {
  const page = document.body.dataset.page;
  return page === 'settings';
}

async function loadSettings() {
  if (!isSettingsPage()) return;
  const form = document.getElementById('settingsForm');
  if (!form) return;

  const { data } = await api('/api/settings');
  const companyDisplay = document.getElementById('settingsCompanyDisplay');
  if (companyDisplay) {
    companyDisplay.value = data.company_name || 'فضاء المحركات / Cars Space';
  }
  Object.keys(data).forEach((key) => {
    const el = form.querySelector(`[name="${key}"]`);
    if (el) el.value = data[key];
  });
}

function bindSettings() {
  if (!isSettingsPage()) return;
  const form = document.getElementById('settingsForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {};
    const fields = form.querySelectorAll('[name]');
    fields.forEach((field) => {
      payload[field.name] = field.value;
    });
    await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
    showToast('تم حفظ الإعدادات بنجاح');
  });

  loadSettings();
}

document.addEventListener('DOMContentLoaded', bindSettings);
