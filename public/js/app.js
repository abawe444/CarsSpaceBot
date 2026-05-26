window.AppState = {
  status: null
};

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
    const error = new Error(data.message || data.error || 'Request failed');
    error.status = response.status;
    error.statusText = response.statusText;
    error.data = data;
    error.details = data?.data || null;
    throw error;
  }
  return data;
}

window.api = api;
window.showToast = showToast;

function setGlobalStatus(status) {
  window.AppState.status = status;
  const badge = document.getElementById('globalStatusBadge');
  if (!badge) return;

  const map = {
    connected: { text: 'متصل وجاهز للرد', cls: 'success' },
    qr: { text: 'بانتظار مسح QR', cls: 'warning' },
    reconnecting: { text: 'إعادة الاتصال...', cls: 'warning' },
    disconnected: { text: 'غير متصل بواتساب', cls: 'danger' }
  };

  const item = map[status?.status] || map.disconnected;
  badge.textContent = item.text;
  badge.className = `status-pill ${item.cls}`;
}

window.setGlobalStatus = setGlobalStatus;

function setProviderStatusBadge(providerData) {
  const badge = document.getElementById('globalProviderBadge');
  if (!badge) return;

  if (!providerData) {
    badge.textContent = 'مزود الذكاء غير مختبر';
    badge.className = 'status-pill warning';
    return;
  }

  if (providerData.provider === 'rules_only') {
    badge.textContent = 'المساعد الآلي يعمل';
    badge.className = 'status-pill success';
    return;
  }

  if (providerData.has_api_key || providerData.api_key_masked) {
    badge.textContent = `مزود: ${providerData.provider}`;
    badge.className = 'status-pill success';
  } else {
    badge.textContent = 'مزود الذكاء غير مختبر';
    badge.className = 'status-pill warning';
  }
}

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'auto') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    return;
  }
  html.setAttribute('data-theme', theme);
}

async function initTheme() {
  try {
    const { data } = await api('/api/settings');
    applyTheme(data.theme || 'auto');
  } catch {
    applyTheme('light');
  }
}

function bindThemeButton() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
  });
}

async function loadDashboard() {
  const page = document.body.dataset.page;
  if (page !== 'dashboard') return;

  const cardsWrap = document.getElementById('dashboardCards');
  const recentWrap = document.getElementById('recentMessages');
  const { data } = await api('/api/dashboard');

  setGlobalStatus(data.status);

  const cards = [
    ['حالة واتساب', data.status.status === 'connected' ? 'متصل' : 'غير متصل'],
    ['عدد المحادثات اليوم', data.cards.conversationsToday],
    ['عدد الرسائل الواردة', data.cards.incomingToday],
    ['عدد الردود التلقائية', data.cards.autoRepliesToday],
    ['المحادثات المتوقفة للتدخل البشري', data.cards.handoffCount],
    ['آخر نشاط', data.cards.lastActivity || '-'],
    ['الأشخاص المصرحون', `${data.cards.authorizedPeopleActive || 0} / ${data.cards.authorizedPeopleTotal || 0}`],
    ['VIP', data.cards.vipPeopleCount || 0],
    ['صلاحية تقارير المجموعات', data.cards.groupAccessEnabledCount || 0],
    ['آخر متحدث معروف', data.cards.lastRecognizedSpeaker || 'لا يوجد']
  ];

  cardsWrap.innerHTML = cards
    .map(([title, value]) => `<article class="card"><h4>${title}</h4><p>${value}</p></article>`)
    .join('');

  if (!data.recentMessages.length) {
    recentWrap.innerHTML = '<div class="empty">لا توجد بيانات حتى الآن</div>';
  } else {
    recentWrap.innerHTML = data.recentMessages
      .map((m) => `<div class="msg-item"><strong>${m.contact_jid}</strong><p>${m.body || '[بدون نص]'}</p><small>${m.direction} - ${m.created_at}</small></div>`)
      .join('');
  }
}

function bindConnectionButtons() {
  const restartBtn = document.getElementById('restartConnectionBtn');
  if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
      try {
        await api('/api/connection/restart', { method: 'POST' });
        showToast('تم إرسال أمر إعادة الاتصال');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  const regen = document.getElementById('regenQrBtn');
  const reconnect = document.getElementById('reconnectBtn');
  [regen, reconnect].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await api('/api/connection/restart', { method: 'POST' });
        showToast('جارٍ إعادة توليد الاتصال');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  });

  const resetBtn = document.getElementById('resetSessionBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('هل أنت متأكد من حذف الجلسة الحالية؟')) return;
      try {
        await api('/api/session/reset', { method: 'POST' });
        showToast('تم حذف الجلسة وبدء جلسة جديدة');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }
}

function updateConnectionPage(status) {
  const qrContainer = document.getElementById('qrContainer');
  const statusText = document.getElementById('connectionStatusText');
  if (!qrContainer || !statusText) return;

  const map = {
    disconnected: 'غير متصل',
    qr: 'بانتظار مسح QR',
    connected: 'متصل',
    reconnecting: 'إعادة الاتصال'
  };
  statusText.textContent = map[status.status] || 'غير متصل';

  if (status.qr) {
    qrContainer.innerHTML = `<img src="${status.qr}" alt="QR" />`;
  } else if (status.status === 'connected') {
    qrContainer.innerHTML = '<div class="empty">تم الربط بنجاح ✅</div>';
  } else {
    qrContainer.innerHTML = '<div class="empty">بانتظار توليد رمز QR...</div>';
  }
}

window.updateConnectionPage = updateConnectionPage;

async function loadLogs() {
  if (document.body.dataset.page !== 'logs') return;
  const search = document.getElementById('logsSearch')?.value || '';
  const level = document.getElementById('logsLevel')?.value || '';
  const { data } = await api(`/api/logs?search=${encodeURIComponent(search)}&level=${encodeURIComponent(level)}`);

  const wrap = document.getElementById('logsTableWrap');
  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد بيانات حتى الآن</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>الوقت</th><th>المستوى</th><th>المصدر</th><th>الرسالة</th></tr></thead>
      <tbody>
        ${data.map((row) => `<tr><td>${row.created_at}</td><td>${row.level}</td><td>${row.source}</td><td>${row.message}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

function bindLogsActions() {
  if (document.body.dataset.page !== 'logs') return;
  document.getElementById('logsFilterBtn')?.addEventListener('click', loadLogs);

  document.getElementById('clearLogsBtn')?.addEventListener('click', async () => {
    if (!confirm('هل تريد مسح جميع السجلات؟')) return;
    await api('/api/logs', { method: 'DELETE' });
    showToast('تم مسح السجلات');
    loadLogs();
  });

  document.getElementById('exportLogsBtn')?.addEventListener('click', async () => {
    const { data } = await api('/api/logs');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

async function loadAnalytics() {
  if (document.body.dataset.page !== 'analytics') return;
  const { data } = await api('/api/analytics');
  const cardsWrap = document.getElementById('analyticsCards');

  cardsWrap.innerHTML = [
    ['Messages today', data.messagesToday],
    ['Bot replies today', data.repliesToday],
    ['Human handoff count', data.handoffCount]
  ].map(([t, v]) => `<article class="card"><h4>${t}</h4><p>${v}</p></article>`).join('');

  const max = Math.max(...data.hourly.map((h) => h.count), 1);
  document.getElementById('hourlyChart').innerHTML = data.hourly
    .map((h) => `<div class="bar" style="height:${(h.count / max) * 180 + 20}px"><span>${h.hour}:00 (${h.count})</span></div>`)
    .join('') || '<div class="empty">لا توجد بيانات حتى الآن</div>';

  document.getElementById('rulesStats').innerHTML = data.mostMatchedRules
    .map((r) => `<div class="list-item"><span>${r.name || 'بدون قاعدة'}</span><strong>${r.count}</strong></div>`)
    .join('') || '<div class="empty">لا توجد بيانات حتى الآن</div>';

  document.getElementById('contactsStats').innerHTML = data.topContacts
    .map((c) => `<div class="list-item"><span>${c.contact_jid}</span><strong>${c.count}</strong></div>`)
    .join('') || '<div class="empty">لا توجد بيانات حتى الآن</div>';

  const intentStats = document.getElementById('intentStats');
  if (intentStats) {
    intentStats.innerHTML = (data.topIntents || [])
      .map((r) => `<div class="list-item"><span>${r.intent}</span><strong>${r.count}</strong></div>`)
      .join('') || '<div class="empty">لا توجد بيانات حتى الآن</div>';
  }

  const mediaStats = document.getElementById('mediaStats');
  if (mediaStats) {
    mediaStats.innerHTML = `
      <div class="list-item"><span>رسائل صوتية</span><strong>${data.mediaStats?.voice || 0}</strong></div>
      <div class="list-item"><span>رسائل صور</span><strong>${data.mediaStats?.image || 0}</strong></div>
      <div class="list-item"><span>فشل المعالجة</span><strong>${data.mediaStats?.failed || 0}</strong></div>
      <div class="list-item"><span>تقارير مجموعات</span><strong>${data.groupReportsCount || 0}</strong></div>
    `;
  }
}

async function loadAdminGroupsPage() {
  if (document.body.dataset.page !== 'admin-groups') return;
  const wrap = document.getElementById('adminGroupsWrap');
  const logsWrap = document.getElementById('adminReportsLogWrap');
  if (!wrap || !logsWrap) return;

  const { data } = await api('/api/admin-groups');
  let skipRows = [];
  try {
    const skipResp = await api('/api/debug/group-last-skips?limit=120');
    skipRows = skipResp.data || [];
  } catch {
    skipRows = [];
  }
  const detectedMap = new Map((data.detected || []).map((g) => [g.groupJid, g]));
  const groupJids = new Set([
    ...(data.detected || []).map((g) => g.groupJid),
    ...(data.groups || []).map((g) => g.group_jid)
  ]);

  const merged = [...groupJids].map((groupJid) => {
    const g = detectedMap.get(groupJid) || { groupJid, subject: '', participants: [] };
    const saved = (data.groups || []).find((x) => x.group_jid === g.groupJid);
    const savedUnknown = saved?.unknown_participants || [];
    const syntheticUnknown = savedUnknown.map((u) => ({
      id: u.participant_jid,
      known_person: null
    }));
    const participants = (g.participants && g.participants.length) ? g.participants : syntheticUnknown;
    return {
      group_jid: g.groupJid,
      group_name: saved?.group_name || g.subject || 'مجموعة بدون اسم',
      enabled: saved ? Boolean(saved.enabled) : false,
      report_enabled: saved ? Boolean(saved.report_enabled) : true,
      reply_only_when_mentioned: saved ? Boolean(saved.reply_only_when_mentioned) : true,
      allow_daily_summary: saved ? Boolean(saved.allow_daily_summary) : false,
      daily_report_time: saved?.daily_report_time || '21:00',
      last_message_at: saved?.last_message_at || '',
      last_message_preview: saved?.last_message_preview || '',
      participants,
      knownParticipantsCount: g.knownParticipantsCount || 0,
      unknownParticipantsCount: g.unknownParticipantsCount || savedUnknown.length || 0,
      lastSkipReason: (skipRows.find((s) => s.groupJid === g.groupJid)?.reason) || '-'
    };
  });

  if (!merged.length) {
    wrap.innerHTML = '<div class="empty">لا توجد مجموعات مكتشفة حاليًا. تأكد أن الرقم مضاف في مجموعة.</div>';
  } else {
    wrap.innerHTML = `
      <table>
        <thead><tr><th>اسم المجموعة</th><th>JID</th><th>معروفون/غير معروفين</th><th>آخر رسالة</th><th>آخر سبب عدم رد</th><th>تمكين</th><th>التقارير</th><th>رد عند المنشن</th><th>تقرير يومي</th><th>الوقت</th><th>تشخيص</th><th>حفظ</th></tr></thead>
        <tbody>
          ${merged.map((g, idx) => `
            <tr data-row="${idx}">
              <td><input data-key="group_name" value="${(g.group_name || '').replace(/"/g, '&quot;')}" /></td>
              <td class="mono">${g.group_jid}</td>
              <td>
                <span class="status-pill success">${g.knownParticipantsCount}</span>
                /
                <span class="status-pill warning">${g.unknownParticipantsCount}</span>
                <details>
                  <summary>المشاركون</summary>
                  ${(g.participants || []).map((p) => `
                    <div class="list-item">
                      <span>${p.id}</span>
                      <span>${p.known_person ? `${p.known_person.full_name} (${p.known_person.role_label})` : 'غير معروف'}</span>
                      ${p.known_person ? '' : `<button class="btn ghost" data-quick-add-person="${p.id}">إضافة</button>`}
                    </div>
                  `).join('')}
                </details>
              </td>
              <td>${g.last_message_at || '-'}<br/><small>${(g.last_message_preview || '-').slice(0, 70)}</small></td>
              <td><span class="status-pill warning">${g.lastSkipReason || '-'}</span></td>
              <td><input data-key="enabled" type="checkbox" ${g.enabled ? 'checked' : ''} /></td>
              <td><input data-key="report_enabled" type="checkbox" ${g.report_enabled ? 'checked' : ''} /></td>
              <td><input data-key="reply_only_when_mentioned" type="checkbox" ${g.reply_only_when_mentioned ? 'checked' : ''} /></td>
              <td><input data-key="allow_daily_summary" type="checkbox" ${g.allow_daily_summary ? 'checked' : ''} /></td>
              <td><input data-key="daily_report_time" value="${g.daily_report_time || '21:00'}" /></td>
              <td><button class="btn ghost" data-diagnose-admin-group="${idx}">تشخيص المجموعة</button></td>
              <td><button class="btn" data-save-admin-group="${idx}">حفظ</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll('[data-save-admin-group]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-save-admin-group'));
        const rowEl = wrap.querySelector(`tr[data-row="${idx}"]`);
        const base = merged[idx];
        const payload = {
          group_jid: base.group_jid,
          group_name: rowEl.querySelector('[data-key="group_name"]').value,
          enabled: rowEl.querySelector('[data-key="enabled"]').checked,
          report_enabled: rowEl.querySelector('[data-key="report_enabled"]').checked,
          reply_only_when_mentioned: rowEl.querySelector('[data-key="reply_only_when_mentioned"]').checked,
          allow_daily_summary: rowEl.querySelector('[data-key="allow_daily_summary"]').checked,
          daily_report_time: rowEl.querySelector('[data-key="daily_report_time"]').value || '21:00'
        };
        await api('/api/admin-groups', { method: 'POST', body: JSON.stringify(payload) });
        showToast('تم حفظ إعدادات المجموعة');
      });
    });

    wrap.querySelectorAll('[data-quick-add-person]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const jid = btn.getAttribute('data-quick-add-person');
        const phone = (jid || '').split('@')[0];
        try {
          await api('/api/people', {
            method: 'POST',
            body: JSON.stringify({
              full_name: `مشارك مجموعة ${phone}`,
              preferred_name: phone,
              title: 'مستخدم إدارة',
              role_key: 'viewer',
              phone,
              enabled: true,
              group_reply_enabled: true,
              private_reply_enabled: false
            })
          });
          showToast('تمت إضافة المشارك إلى الأشخاص');
          await loadAdminGroupsPage();
        } catch (error) {
          showToast(error.message, 'error');
        }
      });
    });

    wrap.querySelectorAll('[data-diagnose-admin-group]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-diagnose-admin-group'));
        const g = merged[idx];
        try {
          const who = await api('/api/debug/simulate-group-message', {
            method: 'POST',
            body: JSON.stringify({
              remoteJid: g.group_jid,
              participantJid: '271352091164856@lid',
              text: 'من أنا؟'
            })
          });
          const report = await api('/api/debug/simulate-group-message', {
            method: 'POST',
            body: JSON.stringify({
              remoteJid: g.group_jid,
              participantJid: '271352091164856@lid',
              text: 'تقرير اليوم'
            })
          });

          const w = who.data || {};
          const r = report.data || {};
          showToast('تم تنفيذ التشخيص');
          alert(
            `تشخيص المجموعة:\n` +
            `JID: ${g.group_jid}\n` +
            `enabled: ${g.enabled ? 'ON' : 'OFF'}\n` +
            `owner recognized: ${w.identity?.isOwner ? 'yes' : 'no'}\n` +
            `who_am_i shouldReply: ${w.shouldReply}\n` +
            `who_am_i skipReason: ${w.skipReason || '-'}\n` +
            `report shouldReply: ${r.shouldReply}\n` +
            `report command: ${r.commandDetected || '-'}\n` +
            `report skipReason: ${r.skipReason || '-'}`
          );
        } catch (error) {
          showToast(`فشل التشخيص: ${error.message}`, 'error');
        }
      });
    });
  }

  const logs = await api('/api/admin-reports/logs?limit=100');
  const rows = logs.data || [];
  if (!rows.length) {
    logsWrap.innerHTML = '<div class="empty">لا توجد سجلات تقارير حتى الآن</div>';
  } else {
    logsWrap.innerHTML = `
      <table>
        <thead><tr><th>الوقت</th><th>المجموعة</th><th>الطلب</th><th>النوع</th><th>الإجابة</th></tr></thead>
        <tbody>
          ${rows.map((r) => `<tr><td>${r.created_at}</td><td>${r.group_jid}</td><td>${r.question || '-'}</td><td>${r.report_type || '-'}</td><td>${(r.answer || '').slice(0, 200)}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }
}

window.refreshDashboard = loadDashboard;
window.refreshLogs = loadLogs;
window.refreshAnalytics = loadAnalytics;
window.refreshAdminGroupsPage = loadAdminGroupsPage;

async function initPage() {
  bindThemeButton();
  bindConnectionButtons();
  bindLogsActions();
  await initTheme();
  try {
    const { data } = await api('/api/status');
    setGlobalStatus(data);
    updateConnectionPage(data);
  } catch {
    // ignore
  }
  try {
    const { data } = await api('/api/provider');
    setProviderStatusBadge(data);
  } catch {
    setProviderStatusBadge(null);
  }
  await Promise.allSettled([loadDashboard(), loadLogs(), loadAnalytics()]);
  await Promise.allSettled([loadAdminGroupsPage()]);

  document.getElementById('refreshAdminGroupsBtn')?.addEventListener('click', loadAdminGroupsPage);
}

document.addEventListener('DOMContentLoaded', initPage);
