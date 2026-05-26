function unwrapMessageContent(content) {
  let message = content || {};
  let depth = 0;
  while (message && depth < 6) {
    if (message.ephemeralMessage?.message) {
      message = message.ephemeralMessage.message;
      depth += 1;
      continue;
    }
    if (message.viewOnceMessage?.message) {
      message = message.viewOnceMessage.message;
      depth += 1;
      continue;
    }
    if (message.viewOnceMessageV2?.message) {
      message = message.viewOnceMessageV2.message;
      depth += 1;
      continue;
    }
    if (message.viewOnceMessageV2Extension?.message) {
      message = message.viewOnceMessageV2Extension.message;
      depth += 1;
      continue;
    }
    if (message.editedMessage?.message) {
      message = message.editedMessage.message;
      depth += 1;
      continue;
    }
    if (message.documentWithCaptionMessage?.message) {
      message = message.documentWithCaptionMessage.message;
      depth += 1;
      continue;
    }
    break;
  }
  return message || {};
}

function extractText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  if (message.documentMessage?.caption) return message.documentMessage.caption;
  if (message.audioMessage?.caption) return message.audioMessage.caption;
  if (message.buttonsResponseMessage?.selectedButtonId) return message.buttonsResponseMessage.selectedButtonId;
  if (message.listResponseMessage?.title) return message.listResponseMessage.title;
  if (message.listResponseMessage?.description) return message.listResponseMessage.description;
  if (message.listResponseMessage?.singleSelectReply?.title) return message.listResponseMessage.singleSelectReply.title;
  if (message.listResponseMessage?.singleSelectReply?.description) return message.listResponseMessage.singleSelectReply.description;
  if (message.listResponseMessage?.singleSelectReply?.selectedRowId) return message.listResponseMessage.singleSelectReply.selectedRowId;
  if (message.templateButtonReplyMessage?.selectedId) return message.templateButtonReplyMessage.selectedId;
  if (message.templateButtonReplyMessage?.selectedDisplayText) return message.templateButtonReplyMessage.selectedDisplayText;
  if (message.buttonsResponseMessage?.selectedDisplayText) return message.buttonsResponseMessage.selectedDisplayText;
  if (message.interactiveResponseMessage?.body?.text) return message.interactiveResponseMessage.body.text;
  return '';
}

function detectMessageType(message) {
  if (!message) return 'text';
  if (message.imageMessage) return 'image';
  if (message.audioMessage) return 'voice';
  if (message.documentMessage) return 'document';
  return 'text';
}

function parseIncomingMessage(baileysMessage) {
  const key = baileysMessage?.key || {};
  const content = unwrapMessageContent(baileysMessage?.message || {});
  const jid = key.remoteJid || '';
  const extended = content.extendedTextMessage || {};
  const contextInfo = extended.contextInfo || {};
  const imageCtx = content.imageMessage?.contextInfo || {};
  const videoCtx = content.videoMessage?.contextInfo || {};
  const docCtx = content.documentMessage?.contextInfo || {};
  const btnCtx = content.buttonsResponseMessage?.contextInfo || {};
  const listCtx = content.listResponseMessage?.contextInfo || {};
  const tmplCtx = content.templateButtonReplyMessage?.contextInfo || {};
  const mergedContext = contextInfo || imageCtx || videoCtx || docCtx || btnCtx || listCtx || tmplCtx;
  const participant = key.participant || baileysMessage?.participant || '';
  const isGroup = jid.endsWith('@g.us');
  const mentionedJid = mergedContext.mentionedJid || [];
  const participantPn = baileysMessage?.participant_pn || mergedContext.participantPn || mergedContext.participant_pn || '';
  const participantLid = baileysMessage?.participant_lid || mergedContext.participantLid || mergedContext.participant_lid || '';
  const senderJid = isGroup ? (participant || '') : jid;

  return {
    jid,
    fromMe: Boolean(key.fromMe),
    messageId: key.id || '',
    participant: participant || jid,
    senderJid: senderJid || jid,
    isGroup,
    mentionedJid,
    participantPn,
    participantLid,
    messageType: detectMessageType(content),
    text: extractText(content),
    pushName: baileysMessage?.pushName || '',
    phone: jid.split('@')[0] || '',
    raw: baileysMessage
  };
}

module.exports = {
  parseIncomingMessage
};
