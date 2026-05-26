let selectedJid = null;
let contactsCache = [];

function isConversationsPage() {
  return document.body.dataset.page === 'conversations';
}

function typeLabel(type) {
  if (type === 'image') return 'صورة';
  if (type === 'voice') return 'صوت';
  if (type === 'document') return 'ملف';
  return 'نص';
}

async function fetchConversations() {
  const q = document.getElementById('conversationSearch')?.value || '';
  const { data } = await api(`/api/conversations?search=${encodeURIComponent(q)}`);
  contactsCache = data;
  const wrap = document.getElementById('conversationItems');

  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد بيانات حتى الآن</div>';
    return;
  }

  wrap.innerHTML = data.map((c) => `
    <article class="conv-item ${selectedJid === c.jid ? 'active' : ''}" data-jid="${c.jid}">
      <div class="conv-title">
        <h4>${c.display_name || c.phone || c.jid}</h4>
        <span class="badge ${c.human_handoff ? 'handoff' : 'auto'}">${c.human_handoff ? 'تدخل بشري' : 'تلقائي'}</span>
      </div>
      <div class="conv-preview">النية: ${c.current_intent || '-'}</div>
      <div class="conv-preview">${c.last_message || 'لا توجد رسائل بعد'}</div>
      ${c.unread_count ? `<span class="badge unread">${c.unread_count}</span>` : ''}
    </article>
  `).join('');

  wrap.querySelectorAll('.conv-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectedJid = item.getAttribute('data-jid');
      renderSelected();
      fetchMessages();
      fetchConversations();
    });
  });
}

function renderSelected() {
  const empty = document.getElementById('chatEmpty');
  const panel = document.getElementById('chatPanel');
  if (!selectedJid) {
    empty.style.display = 'block';
    panel.style.display = 'none';
    return;
  }

  const contact = contactsCache.find((c) => c.jid === selectedJid);
  empty.style.display = 'none';
  panel.style.display = 'block';
  document.getElementById('chatContactName').textContent = contact?.display_name || contact?.phone || selectedJid;
  document.getElementById('chatContactJid').textContent = selectedJid;
  let missing = '-';
  try {
    const arr = JSON.parse(contact?.missing_fields_json || '[]');
    missing = arr.length ? arr.join(', ') : 'لا يوجد';
  } catch {
    missing = '-';
  }
  const meta = document.getElementById('chatMemoryMeta');
  if (meta) {
    meta.textContent = `النية: ${contact?.current_intent || '-'} | البيانات الناقصة: ${missing} | النبرة: ${contact?.emotional_tone || '-'}`;
  }
  document.getElementById('handoffToggleBtn').style.display = contact?.human_handoff ? 'none' : 'inline-flex';
  document.getElementById('handoffBackBtn').style.display = contact?.human_handoff ? 'inline-flex' : 'none';
}

async function fetchMessages() {
  if (!selectedJid) return;
  const { data } = await api(`/api/conversations/${encodeURIComponent(selectedJid)}/messages`);
  const wrap = document.getElementById('chatMessages');

  if (!data.length) {
    wrap.innerHTML = '<div class="empty">لا توجد رسائل حتى الآن</div>';
    return;
  }

  wrap.innerHTML = data.map((m) => `
    <div class="bubble ${m.direction === 'incoming' ? 'incoming' : 'outgoing'}">
      <div class="type-tag">${typeLabel(m.message_type)}</div>
      <div>${(m.body || '[بدون نص]').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      <small>${m.created_at}</small>
    </div>
  `).join('');

  wrap.scrollTop = wrap.scrollHeight;
}

async function sendManualReply() {
  if (!selectedJid) return showToast('اختر محادثة أولًا', 'warning');
  const input = document.getElementById('manualReplyInput');
  const text = input.value.trim();
  if (!text) return;
  await api(`/api/conversations/${encodeURIComponent(selectedJid)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text })
  });
  input.value = '';
  showToast('تم إرسال الرد اليدوي');
  await fetchMessages();
  await fetchConversations();
}

async function setHandoff(enabled) {
  if (!selectedJid) return;
  await api(`/api/conversations/${encodeURIComponent(selectedJid)}/handoff`, {
    method: 'POST',
    body: JSON.stringify({ enabled })
  });
  showToast(enabled ? 'تم تفعيل التدخل البشري' : 'تمت إعادة المحادثة للمساعد الآلي');
  await fetchConversations();
  renderSelected();
}

window.reloadConversations = async function () {
  if (!isConversationsPage()) return;
  await fetchConversations();
  if (selectedJid) await fetchMessages();
};

function bindConversations() {
  if (!isConversationsPage()) return;

  document.getElementById('conversationSearch')?.addEventListener('input', fetchConversations);
  document.getElementById('sendManualReplyBtn')?.addEventListener('click', sendManualReply);
  document.getElementById('manualReplyInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendManualReply();
  });
  document.getElementById('handoffToggleBtn')?.addEventListener('click', () => setHandoff(true));
  document.getElementById('handoffBackBtn')?.addEventListener('click', () => setHandoff(false));

  fetchConversations();
}

document.addEventListener('DOMContentLoaded', bindConversations);
