let rulesCache = [];

function pageIsRules() {
  return document.body.dataset.page === 'rules';
}

function openRuleModal(rule = null) {
  const modal = document.getElementById('ruleModal');
  modal?.classList.remove('hidden');
  document.getElementById('ruleModalTitle').textContent = rule ? 'تعديل قاعدة' : 'إضافة قاعدة';
  document.getElementById('ruleId').value = rule?.id || '';
  document.getElementById('ruleName').value = rule?.name || '';
  document.getElementById('ruleEnabled').value = rule ? String(rule.enabled) : '1';
  document.getElementById('rulePriority').value = rule?.priority || 100;
  document.getElementById('ruleMatchType').value = rule?.match_type || 'contains';
  document.getElementById('ruleKeywords').value = rule?.keywords || '';
  document.getElementById('ruleReply').value = rule?.reply || '';
  document.getElementById('ruleDelay').value = rule?.delay_seconds || 0;
  document.getElementById('ruleHandoffOnMatch').value = rule?.handoff_on_match ? '1' : '0';
  document.getElementById('ruleForceRule').value = rule?.force_rule ? '1' : '0';
  document.getElementById('ruleCategory').value = rule?.category || 'عام';
}

function closeRuleModal() {
  document.getElementById('ruleModal')?.classList.add('hidden');
}

async function loadRules() {
  if (!pageIsRules()) return;
  const { data } = await api('/api/rules');
  rulesCache = data;

  const wrap = document.getElementById('rulesTableWrap');
  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد قواعد حتى الآن</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>الاسم</th><th>الحالة</th><th>الأولوية</th><th>المطابقة</th><th>الكلمات</th><th>التصنيف</th><th>تحويل بشري</th><th>قاعدة إجبارية</th><th>الإجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${data.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td>${r.enabled ? 'مفعلة' : 'معطلة'}</td>
            <td>${r.priority}</td>
            <td>${r.match_type}</td>
            <td>${r.keywords}</td>
            <td>${r.category}</td>
            <td>${r.handoff_on_match ? 'نعم' : 'لا'}</td>
            <td>${r.force_rule ? 'نعم' : 'لا'}</td>
            <td>
              <button class="btn ghost" data-edit-rule="${r.id}">تعديل</button>
              <button class="btn danger" data-delete-rule="${r.id}">حذف</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('[data-edit-rule]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.getAttribute('data-edit-rule'));
      const rule = rulesCache.find((r) => r.id === id);
      openRuleModal(rule);
    });
  });

  wrap.querySelectorAll('[data-delete-rule]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-delete-rule'));
      if (!confirm('هل تريد حذف القاعدة؟')) return;
      await api(`/api/rules/${id}`, { method: 'DELETE' });
      showToast('تم حذف القاعدة');
      loadRules();
    });
  });
}

function bindRulesPage() {
  if (!pageIsRules()) return;

  document.getElementById('addRuleBtn')?.addEventListener('click', () => openRuleModal());
  document.getElementById('closeRuleModalBtn')?.addEventListener('click', closeRuleModal);

  document.getElementById('ruleForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('ruleId').value;
    const payload = {
      name: document.getElementById('ruleName').value,
      enabled: document.getElementById('ruleEnabled').value === '1',
      priority: Number(document.getElementById('rulePriority').value || 100),
      match_type: document.getElementById('ruleMatchType').value,
      keywords: document.getElementById('ruleKeywords').value,
      reply: document.getElementById('ruleReply').value,
      delay_seconds: Number(document.getElementById('ruleDelay').value || 0),
      handoff_on_match: document.getElementById('ruleHandoffOnMatch').value === '1',
      force_rule: document.getElementById('ruleForceRule').value === '1',
      category: document.getElementById('ruleCategory').value
    };

    if (id) {
      await api(`/api/rules/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      showToast('تم تحديث القاعدة');
    } else {
      await api('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
      showToast('تمت إضافة القاعدة');
    }

    closeRuleModal();
    loadRules();
  });

  document.getElementById('testRuleBtn')?.addEventListener('click', async () => {
    const message = document.getElementById('ruleTestInput').value;
    const { data } = await api('/api/rules/test', { method: 'POST', body: JSON.stringify({ message }) });
    const output = document.getElementById('ruleTestOutput');
    output.innerHTML = data.matched
      ? `<strong>القاعدة المطابقة:</strong> ${data.matched.name}<br/><strong>تحويل بشري:</strong> ${data.matched.handoff_on_match ? 'نعم' : 'لا'}<br/><strong>قاعدة إجبارية:</strong> ${data.matched.force_rule ? 'نعم' : 'لا'}<br/><strong>الرد:</strong><br/>${data.reply.replace(/\n/g, '<br/>')}`
      : `<strong>لا توجد قاعدة مطابقة</strong><br/>${data.reply}`;
  });

  loadRules();
}

document.addEventListener('DOMContentLoaded', bindRulesPage);
