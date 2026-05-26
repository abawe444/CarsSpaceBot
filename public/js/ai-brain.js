function isAiBrainPage() {
  return document.body.dataset.page === 'ai-brain';
}

const AI_MODE_DESCRIPTIONS = {
  ai_first: 'الذكاء أولًا: يتم استخدام النموذج لفهم السياق والرد الطبيعي، مع استخدام القواعد للحماية والتحويل والمعلومات الثابتة.',
  rules_first: 'القواعد أولًا: تستخدم القواعد للردود المتكررة، ويُستخدم الذكاء فقط عند عدم وجود قاعدة مناسبة.',
  rules_only: 'القواعد فقط: لن يتم استخدام مزود الذكاء.',
  ai_only: 'الذكاء فقط: يتم الاعتماد على النموذج مباشرة، مع استخدام fallback عند فشل الاتصال.'
};

let knowledgeCache = [];

function openKnowledgeModal(item = null) {
  document.getElementById('knowledgeModal')?.classList.remove('hidden');
  document.getElementById('knowledgeModalTitle').textContent = item ? 'تعديل إدخال معرفة' : 'إضافة إدخال معرفة';
  document.getElementById('knowledgeId').value = item?.id || '';
  document.getElementById('knowledgeTitle').value = item?.title || '';
  document.getElementById('knowledgeCategory').value = item?.category || '';
  document.getElementById('knowledgeContent').value = item?.content || '';
  document.getElementById('knowledgeEnabled').value = item?.enabled ? '1' : '0';
}

function closeKnowledgeModal() {
  document.getElementById('knowledgeModal')?.classList.add('hidden');
}

function fillForm(formId, values = {}) {
  const form = document.getElementById(formId);
  if (!form) return;
  Object.entries(values).forEach(([key, value]) => {
    const field = form.querySelector(`[name="${key}"]`);
    if (field && value !== undefined && value !== null) {
      field.value = value;
    }
  });
}

function serializeForm(formId) {
  const form = document.getElementById(formId);
  const payload = {};
  form.querySelectorAll('[name]').forEach((field) => {
    payload[field.name] = field.value;
  });
  return payload;
}

function formatProviderErrorForUi(error) {
  const details = error?.details || {};
  const status = details.responseStatus || error?.status || '';
  const statusText = details.responseStatusText || error?.statusText || '';
  const rawError = details.error || error?.message || 'تعذر الاتصال بمزود الذكاء';
  const responseData = details.responseData ? JSON.stringify(details.responseData, null, 2) : 'null';
  const friendly = details.error_ar || error?.message || 'تعذر الاتصال بمزود الذكاء';

  const keySource = details.keySource ? `\nKey source: ${details.keySource}` : '';
  return {
    friendly,
    compact: `${friendly}${status ? ` (HTTP ${status}${statusText ? ` ${statusText}` : ''})` : ''}`,
    full: `HTTP: ${status || '-'} ${statusText || ''}\nBackend: ${rawError}\nResponse: ${responseData}${keySource}`
  };
}

function renderKnowledgeTable() {
  const wrap = document.getElementById('knowledgeTableWrap');
  if (!wrap) return;

  if (!knowledgeCache.length) {
    wrap.innerHTML = '<div class="empty">لا توجد بيانات حتى الآن</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>العنوان</th><th>التصنيف</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
      <tbody>
        ${knowledgeCache.map((item) => `
          <tr>
            <td>${item.title}</td>
            <td>${item.category}</td>
            <td>${item.enabled ? 'مفعلة' : 'معطلة'}</td>
            <td>
              <button class="btn ghost" data-edit-knowledge="${item.id}">تعديل</button>
              <button class="btn danger" data-delete-knowledge="${item.id}">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit-knowledge]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-edit-knowledge'));
      const item = knowledgeCache.find((row) => row.id === id);
      openKnowledgeModal(item);
    });
  });

  wrap.querySelectorAll('[data-delete-knowledge]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-delete-knowledge'));
      if (!confirm('هل تريد حذف إدخال المعرفة؟')) return;
      await api(`/api/knowledge/${id}`, { method: 'DELETE' });
      showToast('تم حذف الإدخال');
      await loadAiBrainData();
    });
  });
}

function updateProviderBadge(providerData = {}, success = null, failureText = '') {
  const badge = document.getElementById('providerMaskedHint');
  if (!badge) return;

  const keyHint = providerData.api_key_masked ? ` | ${providerData.api_key_masked}` : '';

  if (success === true) {
    badge.textContent = `تم الاتصال بمزود الذكاء بنجاح${keyHint}`;
    badge.className = 'status-pill success';
    return;
  }

  if (success === false) {
    badge.textContent = failureText || 'تعذر الاتصال بمزود الذكاء';
    badge.className = 'status-pill danger';
    return;
  }

  if (providerData.provider) {
    badge.textContent = `${providerData.provider}${keyHint}`;
    badge.className = 'status-pill warning';
  }
}

function updateModeDescription(mode) {
  const el = document.getElementById('aiModeDescription');
  if (!el) return;
  el.textContent = AI_MODE_DESCRIPTIONS[mode] || AI_MODE_DESCRIPTIONS.ai_first;
}

async function loadEffectiveSettings() {
  const box = document.getElementById('effectiveSettingsOutput');
  if (!box) return;
  box.innerHTML = 'جارٍ التحميل...';
  try {
    const { data } = await api('/api/debug/effective-settings');
    box.innerHTML = `
      <div><strong>provider:</strong> ${data.provider}</div>
      <div><strong>baseUrl:</strong> ${data.baseUrl}</div>
      <div><strong>model:</strong> ${data.model}</div>
      <div><strong>aiMode:</strong> ${data.aiMode}</div>
      <div><strong>temperature:</strong> ${data.temperature}</div>
      <div><strong>maxOutputTokens:</strong> ${data.maxOutputTokens}</div>
      <div><strong>contextMessagesCount:</strong> ${data.contextMessagesCount}</div>
      <div><strong>memory:</strong> ${data.enableMemory ? 'ON' : 'OFF'}</div>
      <div><strong>voice:</strong> ${data.enableVoiceTranscription ? 'ON' : 'OFF'}</div>
      <div><strong>image:</strong> ${data.enableImageAnalysis ? 'ON' : 'OFF'}</div>
      <div><strong>typing:</strong> ${data.enableTypingSimulation ? 'ON' : 'OFF'}</div>
      <div><strong>rulesEnabled:</strong> ${data.rulesEnabled ? 'ON' : 'OFF'}</div>
      <div><strong>assistantEnabled:</strong> ${data.assistantEnabled ? 'ON' : 'OFF'}</div>
      <div><strong>systemPromptHash:</strong> ${data.systemPromptHash}</div>
    `;
  } catch (error) {
    box.innerHTML = `<div class="empty">تعذر تحميل الإعدادات الفعلية: ${error.message}</div>`;
  }
}

async function loadAiBrainData() {
  const { data } = await api('/api/ai-brain');

  fillForm('aiBrainProviderForm', {
    provider: data.provider?.provider,
    baseUrl: data.provider?.base_url,
    model: data.provider?.model,
    temperature: data.provider?.temperature,
    maxOutputTokens: data.provider?.max_output_tokens || data.settings?.ai_max_output_tokens || 1200,
    aiMode: data.provider?.ai_mode || data.settings?.ai_mode || 'ai_first',
    enabled: data.provider?.enabled ? 'true' : 'false',
    context_messages_count: data.settings?.context_messages_count || 30,
    enable_memory: data.settings?.enable_memory ? 'true' : 'false',
    enable_voice_transcription: data.settings?.enable_voice_transcription ? 'true' : 'false',
    enable_image_analysis: data.settings?.enable_image_analysis ? 'true' : 'false',
    enable_typing_simulation: data.settings?.enable_typing_simulation ? 'true' : 'false'
  });

  fillForm('aiBrainForm', {
    assistant_name: data.settings?.assistant_name,
    assistant_tone: data.settings?.assistant_tone,
    assistant_prompt: data.settings?.assistant_prompt,
    assistant_reply_policy: data.settings?.assistant_reply_policy,
    assistant_car_knowledge_behavior: data.settings?.assistant_car_knowledge_behavior,
    company_name: data.company?.company_name || data.settings?.company_name,
    contact_number: data.company?.contact_number || data.settings?.company_contact_number,
    business_description: data.company?.business_description || data.settings?.company_field,
    general_manager: data.company?.general_manager || data.settings?.management_general_manager,
    company_responsible: data.company?.company_responsible || data.settings?.management_company_manager,
    center_manager_current: data.company?.center_manager_current || data.company?.center_manager || data.settings?.management_center_manager,
    center_manager_notes: data.company?.center_manager_notes || data.settings?.management_center_manager_notes || '',
    company_location_title: data.company?.company_location_title || data.settings?.location_company_name,
    company_location_url: data.company?.company_location_url || data.settings?.location_company_map_url,
    center_location_title: data.company?.center_location_title || data.settings?.location_center_name,
    center_location_url: data.company?.center_location_url || data.settings?.location_center_map_url,
    assistant_enabled: data.settings?.assistant_enabled ? 'true' : 'false',
    rules_enabled: data.settings?.rules_enabled ? 'true' : 'false',
    assistant_reply_delay_seconds: data.settings?.assistant_reply_delay_seconds || 2,
    assistant_max_replies_per_hour: data.settings?.assistant_max_replies_per_hour || 80,
    assistant_auto_handoff_keywords: data.settings?.assistant_auto_handoff_keywords,
    welcome_reply: data.settings?.welcome_reply,
    fallback_reply: data.settings?.fallback_reply
  });

  updateProviderBadge(data.provider || {}, null);
  updateModeDescription(data.provider?.ai_mode || data.settings?.ai_mode || 'ai_first');

  knowledgeCache = data.knowledgeEntries || [];
  renderKnowledgeTable();
}

async function saveProviderForm(e) {
  e.preventDefault();
  const payload = serializeForm('aiBrainProviderForm');
  payload.enabled = payload.enabled === 'true';
  const { data } = await api('/api/provider', { method: 'PUT', body: JSON.stringify(payload) });

  await api('/api/ai-brain', {
    method: 'PUT',
    body: JSON.stringify({
      ai_mode: payload.aiMode || 'ai_first',
      context_messages_count: payload.context_messages_count || 30,
      enable_memory: payload.enable_memory === 'true',
      enable_voice_transcription: payload.enable_voice_transcription === 'true',
      enable_image_analysis: payload.enable_image_analysis === 'true',
      enable_typing_simulation: payload.enable_typing_simulation === 'true'
    })
  });

  showToast('تم حفظ إعدادات مزود الذكاء');
  updateProviderBadge(data, null);
  updateModeDescription(payload.aiMode || 'ai_first');
}

async function testProviderConnection() {
  const payload = serializeForm('aiBrainProviderForm');
  const apiKeyInput = document.querySelector('#aiBrainProviderForm [name="apiKey"]');
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

  try {
    const { data } = await api('/api/provider/test', {
      method: 'POST',
      body: JSON.stringify(requestPayload)
    });
    showToast('تم الاتصال بمزود الذكاء بنجاح');
    updateProviderBadge({ ...payload, api_key_masked: data?.api_key_masked }, true);
  } catch (error) {
    const formatted = formatProviderErrorForUi(error);
    showToast(formatted.compact, 'error');
    console.error('Provider test UI details:', formatted.full);
    updateProviderBadge({}, false, formatted.compact);
  }
}

async function saveAiBrain(e) {
  e.preventDefault();
  const payload = serializeForm('aiBrainForm');
  await api('/api/ai-brain', { method: 'PUT', body: JSON.stringify(payload) });
  showToast('تم حفظ بيانات عقل المساعد');
}

async function testAiReply() {
  const message = document.getElementById('aiTestInput').value;
  const { data } = await api('/api/ai-brain/test', {
    method: 'POST',
    body: JSON.stringify({ message })
  });

  const output = document.getElementById('aiTestOutput');
  const ruleName = data.matchedRule?.name || 'لا يوجد';
  const knowledge = (data.knowledgeUsed || []).length ? data.knowledgeUsed.join('، ') : 'لا يوجد';

  output.innerHTML = `
    <strong>Provider used:</strong> ${data.providerUsed}<br/>
    <strong>Matched rule:</strong> ${ruleName}<br/>
    <strong>Knowledge used:</strong> ${knowledge}<br/>
    <strong>Mode used:</strong> ${data.modeUsed}<br/>
    <strong>Final reply:</strong><br/>${(data.finalReply || '').replace(/\n/g, '<br/>')}
  `;
}

function bindAiBrainPage() {
  if (!isAiBrainPage()) return;

  document.getElementById('aiBrainProviderForm')?.addEventListener('submit', saveProviderForm);
  document.getElementById('aiProviderTestBtn')?.addEventListener('click', testProviderConnection);
  document.querySelector('#aiBrainProviderForm [name="aiMode"]')?.addEventListener('change', (e) => {
    updateModeDescription(e.target.value);
  });

  document.getElementById('aiBrainForm')?.addEventListener('submit', saveAiBrain);
  document.getElementById('showEffectiveSettingsBtn')?.addEventListener('click', loadEffectiveSettings);

  document.getElementById('addKnowledgeBtn')?.addEventListener('click', () => openKnowledgeModal());
  document.getElementById('closeKnowledgeModalBtn')?.addEventListener('click', closeKnowledgeModal);

  document.getElementById('knowledgeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('knowledgeId').value;
    const payload = {
      title: document.getElementById('knowledgeTitle').value,
      category: document.getElementById('knowledgeCategory').value,
      content: document.getElementById('knowledgeContent').value,
      enabled: document.getElementById('knowledgeEnabled').value === '1'
    };

    if (id) {
      await api(`/api/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('تم تعديل إدخال المعرفة');
    } else {
      await api('/api/knowledge', { method: 'POST', body: JSON.stringify(payload) });
      showToast('تمت إضافة إدخال المعرفة');
    }

    closeKnowledgeModal();
    await loadAiBrainData();
  });

  document.getElementById('aiTestBtn')?.addEventListener('click', testAiReply);

  loadAiBrainData().then(loadEffectiveSettings);
}

document.addEventListener('DOMContentLoaded', bindAiBrainPage);
