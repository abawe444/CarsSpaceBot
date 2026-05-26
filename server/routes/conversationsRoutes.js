const express = require('express');
const { sendMessage } = require('../baileys/whatsappClient');
const {
  getConversations,
  getMessages,
  saveMessage,
  updateContactMessage,
  setHandoff,
  resetUnread
} = require('../services/conversationService');
const { addLog } = require('../services/logsService');
const { updateMemoryAfterAssistantReply } = require('../services/conversationMemoryService');

const router = express.Router();

router.get('/conversations', (req, res) => {
  const list = getConversations(req.query.search || '');
  res.json({ success: true, data: list });
});

router.get('/conversations/:jid/messages', (req, res) => {
  const jid = req.params.jid;
  const items = getMessages(jid, 500);
  resetUnread(jid);
  res.json({ success: true, data: items });
});

router.post('/conversations/:jid/reply', async (req, res) => {
  const jid = req.params.jid;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'text is required' });

  try {
    await sendMessage(jid, text);
    saveMessage({
      contact_jid: jid,
      direction: 'outgoing',
      message_type: 'text',
      body: text,
      from_bot: false
    });
    updateContactMessage(jid, text, false);
    updateMemoryAfterAssistantReply(jid, text);
    addLog('info', 'admin', 'Manual reply sent', { jid });
    res.json({ success: true });
  } catch (error) {
    addLog('error', 'admin', 'Failed manual reply', { jid, error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/conversations/:jid/handoff', (req, res) => {
  const jid = req.params.jid;
  const enabled = Boolean(req.body?.enabled);
  const row = setHandoff(jid, enabled);
  addLog('info', 'admin', 'Handoff updated', { jid, enabled });
  res.json({ success: true, data: row });
});

module.exports = router;
