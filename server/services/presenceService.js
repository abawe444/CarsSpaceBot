const { getSettings } = require('./settingsService');

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function estimateTypingDelay(text = '', complexity = 'medium') {
  const settings = getSettings();
  const min = Number(settings.min_typing_delay_ms || 1200);
  const max = Number(settings.max_typing_delay_ms || 8000);
  const speed = Number(settings.typing_speed_chars_per_second || 18);

  const byLength = Math.ceil((String(text || '').length / Math.max(speed, 1)) * 1000);
  const baseByComplexity =
    complexity === 'short' ? 1400 :
      complexity === 'complex' ? 5000 :
        complexity === 'voice' ? 5200 :
          complexity === 'image' ? 4600 : 2600;

  return clamp(Math.max(byLength, baseByComplexity), min, max);
}

function getComplexityByMessageType(messageType, replyText = '') {
  if (messageType === 'voice') return 'voice';
  if (messageType === 'image') return 'image';
  if (String(replyText || '').length < 90) return 'short';
  if (String(replyText || '').length > 280) return 'complex';
  return 'medium';
}

async function withTyping({
  whatsappClient,
  jid,
  messageType = 'text',
  previewReply = '',
  task
}) {
  const settings = getSettings();
  if (!settings.enable_typing_simulation) {
    return task();
  }

  const complexity = getComplexityByMessageType(messageType, previewReply);
  const delay = estimateTypingDelay(previewReply, complexity);

  try {
    await whatsappClient.sendTypingPresence(jid, 'composing');
    const result = await task();
    await new Promise((resolve) => setTimeout(resolve, delay));
    return result;
  } finally {
    await whatsappClient.sendTypingPresence(jid, 'paused');
  }
}

module.exports = {
  withTyping,
  estimateTypingDelay,
  getComplexityByMessageType
};
