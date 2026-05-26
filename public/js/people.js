function isPeoplePage() {
  return document.body.dataset.page === 'people';
}

const PeopleState = {
  roles: [],
  permissionKeys: [],
  permissionLabels: {},
  people: [],
  editingPerson: null
};

function openPersonModal(person = null) {
  PeopleState.editingPerson = person;
  document.getElementById('personModalTitle').textContent = person ? 'تعديل الشخص' : 'إضافة شخص';
  document.getElementById('personId').value = person?.id || '';
  document.getElementById('personFullName').value = person?.full_name || '';
  document.getElementById('personPreferredName').value = person?.preferred_name || '';
  document.getElementById('personTitle').value = person?.title || '';
  document.getElementById('personRole').value = person?.role_key || 'custom';
  document.getElementById('personPhone').value = person?.phone || '';
  document.getElementById('personPrivateEnabled').value = person?.private_reply_enabled ? '1' : '0';
  document.getElementById('personGroupEnabled').value = person?.group_reply_enabled ? '1' : '0';
  document.getElementById('personVip').value = person?.is_vip ? '1' : '0';
  document.getElementById('personGreetingStyle').value = person?.greeting_style || 'مهني';
  document.getElementById('personNotes').value = person?.notes || '';

  const policy = person?.interaction_policy || {};
  document.getElementById('policyPrivateTone').value = policy.private_tone || 'مهني ولبق';
  document.getElementById('policyGroupTone').value = policy.group_tone || 'مهني مختصر';
  document.getElementById('policyCustomGreeting').value = policy.custom_greeting || '';
  document.getElementById('policyCustomInstruction').value = policy.custom_system_instruction || '';
  document.getElementById('policyDetailLevel').value = policy.report_detail_level || 'متوسط';
  document.getElementById('policyFullNumbers').value = policy.show_full_customer_numbers ? '1' : '0';
  document.getElementById('policySensitive').value = policy.allow_sensitive_reports ? '1' : '0';
  document.getElementById('policyFinancial').value = policy.allow_financial_reports ? '1' : '0';
  document.getElementById('policyTechnical').value = policy.allow_technical_reports ? '1' : '0';
  document.getElementById('policyCustomerLookup').value = policy.allow_customer_lookup ? '1' : '0';
  document.getElementById('policyConversationLookup').value = policy.allow_conversation_lookup ? '1' : '0';
  document.getElementById('policyBotControl').value = policy.allow_bot_control ? '1' : '0';

  const perms = person?.permissions || {};
  document.querySelectorAll('#personPermissionsWrap input[type="checkbox"]').forEach((el) => {
    el.checked = Boolean(perms[el.getAttribute('data-perm-key')]);
  });

  document.getElementById('personModal').classList.remove('hidden');
}

function closePersonModal() {
  document.getElementById('personModal').classList.add('hidden');
}

function buildPermissionGrid() {
  const wrap = document.getElementById('personPermissionsWrap');
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="settings-grid">
      ${PeopleState.permissionKeys.map((key) => `
        <label>
          ${PeopleState.permissionLabels[key] || key}
          <select data-perm-key="${key}">
            <option value="0">OFF</option>
            <option value="1">ON</option>
          </select>
        </label>
      `).join('')}
    </div>
  `;
}

function collectPermissions() {
  const map = {};
  document.querySelectorAll('#personPermissionsWrap select[data-perm-key]').forEach((el) => {
    map[el.getAttribute('data-perm-key')] = el.value === '1';
  });
  return map;
}

async function loadRoles() {
  const { data } = await api('/api/roles');
  PeopleState.roles = data.roles || [];
  PeopleState.permissionKeys = data.permissionKeys || [];
  PeopleState.permissionLabels = data.permissionLabels || {};

  const roleSelect = document.getElementById('personRole');
  const filterRole = document.getElementById('peopleRoleFilter');
  if (roleSelect) {
    roleSelect.innerHTML = PeopleState.roles.map((r) => `<option value="${r.role_key}">${r.role_label}</option>`).join('');
  }
  if (filterRole) {
    filterRole.innerHTML = '<option value="">كل الأدوار</option>' + PeopleState.roles.map((r) => `<option value="${r.role_key}">${r.role_label}</option>`).join('');
  }

  buildPermissionGrid();
}

async function loadPeople() {
  const search = document.getElementById('peopleSearch')?.value || '';
  const role = document.getElementById('peopleRoleFilter')?.value || '';
  const enabled = document.getElementById('peopleStatusFilter')?.value || '';
  const vip = document.getElementById('peopleVipFilter')?.value || '';

  const { data } = await api(`/api/people?search=${encodeURIComponent(search)}&role=${encodeURIComponent(role)}&enabled=${encodeURIComponent(enabled)}&vip=${encodeURIComponent(vip)}`);
  PeopleState.people = data;

  const wrap = document.getElementById('peopleTableWrap');
  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد بيانات حتى الآن</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>الاسم</th><th>المسمى</th><th>الدور</th><th>الرقم</th><th>الصلاحيات</th><th>الحالة</th><th>آخر تفاعل</th><th>إجراءات</th></tr></thead>
      <tbody>
        ${data.map((p) => `
          <tr>
            <td>${p.full_name || '-'} ${p.is_vip ? '<span class="status-pill warning">VIP</span>' : ''}</td>
            <td>${p.title || '-'}</td>
            <td><span class="status-pill ${p.role_key === 'general_manager' ? 'success' : 'warning'}">${p.role_label || p.role_key}</span></td>
            <td class="mono">${p.phone || p.normalized_phone || '-'}</td>
            <td>${p.permissions_count || 0}</td>
            <td><span class="status-pill ${p.enabled ? 'success' : 'danger'}">${p.enabled ? 'مفعل' : 'غير مفعل'}</span></td>
            <td>${p.last_interaction || '-'}</td>
            <td>
              <button class="btn ghost" data-edit-person="${p.id}">تعديل</button>
              <button class="btn danger" data-delete-person="${p.id}">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit-person]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-edit-person'));
      const { data: person } = await api(`/api/people/${id}`);
      openPersonModal(person);
      Object.entries(person.permissions || {}).forEach(([key, val]) => {
        const el = document.querySelector(`#personPermissionsWrap select[data-perm-key="${key}"]`);
        if (el) el.value = val ? '1' : '0';
      });
    });
  });

  wrap.querySelectorAll('[data-delete-person]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('هل تريد حذف هذا الشخص؟')) return;
      const id = Number(btn.getAttribute('data-delete-person'));
      await api(`/api/people/${id}`, { method: 'DELETE' });
      showToast('تم حذف الشخص');
      await loadPeople();
      await loadAudit();
    });
  });
}

async function savePerson(e) {
  e.preventDefault();
  const id = document.getElementById('personId').value;
  const payload = {
    full_name: document.getElementById('personFullName').value,
    preferred_name: document.getElementById('personPreferredName').value,
    title: document.getElementById('personTitle').value,
    role_key: document.getElementById('personRole').value,
    phone: document.getElementById('personPhone').value,
    private_reply_enabled: document.getElementById('personPrivateEnabled').value === '1',
    group_reply_enabled: document.getElementById('personGroupEnabled').value === '1',
    is_vip: document.getElementById('personVip').value === '1',
    greeting_style: document.getElementById('personGreetingStyle').value,
    notes: document.getElementById('personNotes').value,
    permissions: collectPermissions(),
    interaction_policy: {
      private_tone: document.getElementById('policyPrivateTone').value,
      group_tone: document.getElementById('policyGroupTone').value,
      custom_greeting: document.getElementById('policyCustomGreeting').value,
      custom_system_instruction: document.getElementById('policyCustomInstruction').value,
      report_detail_level: document.getElementById('policyDetailLevel').value,
      show_full_customer_numbers: document.getElementById('policyFullNumbers').value === '1',
      allow_sensitive_reports: document.getElementById('policySensitive').value === '1',
      allow_financial_reports: document.getElementById('policyFinancial').value === '1',
      allow_technical_reports: document.getElementById('policyTechnical').value === '1',
      allow_customer_lookup: document.getElementById('policyCustomerLookup').value === '1',
      allow_conversation_lookup: document.getElementById('policyConversationLookup').value === '1',
      allow_bot_control: document.getElementById('policyBotControl').value === '1'
    }
  };

  if (id) {
    await api(`/api/people/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  } else {
    await api('/api/people', { method: 'POST', body: JSON.stringify(payload) });
  }

  showToast('تم حفظ بيانات الشخص');
  closePersonModal();
  await loadPeople();
  await loadAudit();
}

async function runIdentityTest() {
  const input = document.getElementById('identityTestInput').value;
  const { data } = await api('/api/people/test-identity', {
    method: 'POST',
    body: JSON.stringify({ input })
  });

  const output = document.getElementById('identityTestOutput');
  if (!data.matched) {
    output.innerHTML = 'هذا الشخص غير موجود في القائمة';
    return;
  }

  output.innerHTML = `
    <strong>هذا الشخص معروف للمساعد</strong><br/>
    الاسم: ${data.person.full_name || '-'}<br/>
    الدور: ${data.person.role_label || data.person.role_key}<br/>
    الرقم الموحّد: ${data.normalized_phone}<br/>
    أسلوب التحية: ${data.person.interaction_policy?.custom_greeting || 'افتراضي حسب الدور'}
  `;
}

async function loadAudit() {
  const { data } = await api('/api/people/audit?limit=30');
  const wrap = document.getElementById('peopleAuditWrap');
  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد سجلات حتى الآن</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>الوقت</th><th>الشخص</th><th>الإجراء</th><th>الفاعل</th></tr></thead>
      <tbody>
        ${data.map((r) => `<tr><td>${r.created_at}</td><td>${r.full_name || '-'}</td><td>${r.action}</td><td>${r.actor_jid || '-'}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

function bindPeoplePage() {
  if (!isPeoplePage()) return;

  document.getElementById('addPersonBtn')?.addEventListener('click', () => openPersonModal(null));
  document.getElementById('closePersonModalBtn')?.addEventListener('click', closePersonModal);
  document.getElementById('personForm')?.addEventListener('submit', savePerson);

  document.getElementById('refreshPeopleBtn')?.addEventListener('click', loadPeople);
  document.getElementById('peopleSearch')?.addEventListener('input', loadPeople);
  document.getElementById('peopleRoleFilter')?.addEventListener('change', loadPeople);
  document.getElementById('peopleStatusFilter')?.addEventListener('change', loadPeople);
  document.getElementById('peopleVipFilter')?.addEventListener('change', loadPeople);

  document.getElementById('identityTestBtn')?.addEventListener('click', runIdentityTest);

  loadRoles().then(async () => {
    await loadPeople();
    await loadAudit();
  });
}

document.addEventListener('DOMContentLoaded', bindPeoplePage);
