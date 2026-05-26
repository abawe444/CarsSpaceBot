let currentStep = 1;
const maxStep = 5;

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.style.background = type === 'error' ? '#b72626' : type === 'warning' ? '#a8670b' : '#1f6feb';
  setTimeout(() => toast.classList.add('hidden'), 2600);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || data.error || 'فشل الطلب');
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;
    error.details = data?.data || null;
    throw error;
  }
  return data;
}

function formatProviderErrorForUi(error) {
  const details = error?.details || {};
  const status = details.responseStatus || error?.status || '';
  const statusText = details.responseStatusText || error?.statusText || '';
  const rawError = details.error || error?.message || 'تعذر الاتصال بمزود الذكاء';
  const responseData = details.responseData ? JSON.stringify(details.responseData, null, 2) : 'null';
  const friendly = details.error_ar || error?.message || 'تعذر الاتصال بمزود الذكاء';

  return {
    friendly,
    full: `السبب: ${friendly}
HTTP: ${status || '-'} ${statusText || ''}
Backend: ${rawError}
Response: ${responseData}`
  };
}

function setStep(step) {
  currentStep = Math.min(maxStep, Math.max(1, step));

  for (let i = 1; i <= maxStep; i += 1) {
    const panel = document.getElementById(`step${i}`);
    panel?.classList.toggle('hidden-step', i !== currentStep);
  }

  document.querySelectorAll('.wiz-step').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.getAttribute('data-step')) === currentStep);
  });

  document.getElementById('prevStepBtn').disabled = currentStep === 1;
  document.getElementById('nextStepBtn').textContent = currentStep === maxStep ? 'الانتقال للوحة' : 'التالي';
}

function setWhatsappStatus(status) {
  const badge = document.getElementById('setupWhatsappStatus');
  const text = document.getElementById('setupQrStatusText');
  const qrArea = document.getElementById('setupQrArea');

  const map = {
    connected: { label: 'متصل وجاهز للرد', cls: 'success' },
    qr: { label: 'بانتظار مسح QR', cls: 'warning' },
    reconnecting: { label: 'إعادة الاتصال', cls: 'warning' },
    disconnected: { label: 'غير متصل بواتساب', cls: 'danger' }
  };

  const item = map[status?.status] || map.disconnected;
  if (badge) {
    badge.textContent = item.label;
    badge.className = `status-pill ${item.cls}`;
  }
  if (text) text.textContent = item.label;

  if (!qrArea) return;
  if (status?.qr) {
    qrArea.innerHTML = `<img src="${status.qr}" alt="QR" />`;
  } else if (status?.status === 'connected') {
    qrArea.innerHTML = '<div class="empty">تم الربط بنجاح ✅</div>';
  } else {
    qrArea.innerHTML = '<div class="empty">بانتظار مسح QR</div>';
  }
}

function setProviderStatus(ok) {
  const badge = document.getElementById('setupProviderStatus');
  if (!badge) return;
  if (ok) {
    badge.textContent = 'تم الاتصال بمزود الذكاء بنجاح';
    badge.className = 'status-pill success';
  } else {
    badge.textContent = 'تعذر الاتصال بمزود الذكاء';
    badge.className = 'status-pill danger';
  }
}

function fillForm(formId, values = {}) {
  const form = document.getElementById(formId);
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    const el = form.querySelector(`[name="${key}"]`);
    if (el && value !== undefined && value !== null) {
      el.value = value;
    }
  });
}

function serializeForm(formId) {
  const form = document.getElementById(formId);
  const payload = {};
  form.querySelectorAll('[name]').forEach((el) => {
    payload[el.name] = el.value;
  });
  return payload;
}

const providerDefaults = {
  rules_only: { baseUrl: '', model: '' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  grok: { baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  custom_openai_compatible: { baseUrl: '', model: '' }
};

function onProviderChange() {
  const provider = document.getElementById('providerSelect').value;
  const defaults = providerDefaults[provider] || providerDefaults.rules_only;
  const baseEl = document.getElementById('providerBaseUrl');
  const modelEl = document.getElementById('providerModel');

  if (!baseEl.value) baseEl.value = defaults.baseUrl;
  if (!modelEl.value) modelEl.value = defaults.model;
}

async function loadSetupData() {
  const { data } = await api('/api/setup/data');

  fillForm('setupCompanyForm', {
    company_name: data.company?.company_name || data.settings?.company_name,
    contact_number: data.company?.contact_number || data.settings?.company_contact_number,
    business_description: data.company?.business_description || data.settings?.company_field,
    general_manager: data.company?.general_manager || data.settings?.management_general_manager,
    company_responsible: data.company?.company_responsible || data.settings?.management_company_manager,
    center_manager: data.company?.center_manager || data.settings?.management_center_manager
  });

  fillForm('setupLocationsForm', {
    company_location_title: data.company?.company_location_title || data.settings?.location_company_name,
    company_location_url: data.company?.company_location_url || data.settings?.location_company_map_url,
    center_location_title: data.company?.center_location_title || data.settings?.location_center_name,
    center_location_url: data.company?.center_location_url || data.settings?.location_center_map_url
  });

  fillForm('setupProviderForm', {
    provider: data.provider?.provider || 'rules_only',
    baseUrl: data.provider?.base_url || '',
    model: data.provider?.model || '',
    temperature: data.provider?.temperature || 0.3,
    maxOutputTokens: data.provider?.max_output_tokens || 250,
    aiMode: data.provider?.ai_mode || 'rules_first',
    enabled: data.provider?.enabled ? 'true' : 'false'
  });

  fillForm('setupAssistantForm', {
    assistant_name: data.settings?.assistant_name,
    assistant_tone: data.settings?.assistant_tone,
    assistant_prompt: data.settings?.assistant_prompt
  });

  setWhatsappStatus(data.whatsapp || { status: 'disconnected' });
}

async function saveCompany(e) {
  e.preventDefault();
  const payload = serializeForm('setupCompanyForm');
  await api('/api/setup/company', { method: 'POST', body: JSON.stringify(payload) });
  showToast('تم حفظ بيانات الشركة');
}

async function saveLocations(e) {
  e.preventDefault();
  const payload = serializeForm('setupLocationsForm');
  await api('/api/setup/locations', { method: 'POST', body: JSON.stringify(payload) });
  showToast('تم حفظ بيانات المواقع');
}

async function saveProvider(e) {
  e.preventDefault();
  const payload = serializeForm('setupProviderForm');
  payload.enabled = payload.enabled === 'true';
  await api('/api/setup/provider', { method: 'POST', body: JSON.stringify(payload) });
  showToast('تم حفظ إعدادات مزود الذكاء');
}

async function testProvider() {
  const payload = serializeForm('setupProviderForm');
  const apiKeyInput = document.querySelector('#setupProviderForm [name="apiKey"]');
  const rawApiKey = String(apiKeyInput?.value || '').trim();
  const isMasked = /\*{3,}/.test(rawApiKey);
  const apiKey = isMasked ? '' : rawApiKey;
  const useSavedKey = !apiKey || isMasked;
  const requestPayload = {
    provider: payload.provider,
    baseUrl: payload.baseUrl,
    model: payload.model,
    apiKey,
    useSavedKey,
    temperature: payload.temperature,
    maxOutputTokens: payload.maxOutputTokens,
    aiMode: payload.aiMode
  };
  console.debug('Provider test payload:', {
    provider: requestPayload.provider,
    baseUrl: requestPayload.baseUrl,
    model: requestPayload.model,
    hasApiKey: !!requestPayload.apiKey,
    useSavedKey: requestPayload.useSavedKey,
    temperature: requestPayload.temperature,
    maxOutputTokens: requestPayload.maxOutputTokens
  });
  const output = document.getElementById('providerTestResult');
  output.textContent = 'جارٍ اختبار الاتصال...';

  try {
    const result = await api('/api/provider/test', {
      method: 'POST',
      body: JSON.stringify(requestPayload)
    });
    output.innerHTML = `<strong>${result.message}</strong><br/>الرد: ${(result.data?.text || '').replace(/\n/g, '<br/>')}`;
    setProviderStatus(true);
    showToast('تم الاتصال بمزود الذكاء بنجاح');
  } catch (error) {
    const formatted = formatProviderErrorForUi(error);
    output.innerHTML = `<strong style="color:#b42318">فشل اختبار مزود الذكاء</strong><br/><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${formatted.full}</pre>`;
    setProviderStatus(false);
    showToast(formatted.friendly, 'error');
  }
}

async function saveAssistant(e) {
  e.preventDefault();
  const payload = serializeForm('setupAssistantForm');
  await api('/api/setup/assistant', { method: 'POST', body: JSON.stringify(payload) });
  showToast('تم حفظ شخصية المساعد');
}

async function finishSetup() {
  await api('/api/setup/complete', { method: 'POST' });
  showToast('تم إنهاء الإعداد بنجاح');
  setTimeout(() => {
    window.location.href = '/';
  }, 600);
}

function bindEvents() {
  document.querySelectorAll('.wiz-step').forEach((btn) => {
    btn.addEventListener('click', () => setStep(Number(btn.getAttribute('data-step'))));
  });

  document.getElementById('prevStepBtn')?.addEventListener('click', () => setStep(currentStep - 1));
  document.getElementById('nextStepBtn')?.addEventListener('click', () => {
    if (currentStep === maxStep) {
      window.location.href = '/';
      return;
    }
    setStep(currentStep + 1);
  });

  document.getElementById('providerSelect')?.addEventListener('change', onProviderChange);
  document.getElementById('setupCompanyForm')?.addEventListener('submit', saveCompany);
  document.getElementById('setupLocationsForm')?.addEventListener('submit', saveLocations);
  document.getElementById('setupProviderForm')?.addEventListener('submit', saveProvider);
  document.getElementById('setupAssistantForm')?.addEventListener('submit', saveAssistant);
  document.getElementById('testProviderBtn')?.addEventListener('click', testProvider);
  document.getElementById('finishSetupBtn')?.addEventListener('click', finishSetup);

  document.getElementById('setupReconnectBtn')?.addEventListener('click', async () => {
    await api('/api/connection/restart', { method: 'POST' });
    showToast('جارٍ إعادة الاتصال بواتساب');
  });

  document.getElementById('setupResetSessionBtn')?.addEventListener('click', async () => {
    if (!confirm('هل تريد حذف الجلسة الحالية؟')) return;
    await api('/api/session/reset', { method: 'POST' });
    showToast('تم حذف الجلسة');
  });
}

function initSocket() {
  const socket = io();
  socket.on('whatsapp:status', (status) => {
    setWhatsappStatus(status);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();
  setStep(1);
  initSocket();
  try {
    await loadSetupData();
  } catch (error) {
    showToast(error.message, 'error');
  }
});
