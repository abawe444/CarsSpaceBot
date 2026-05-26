const fs = require('fs');
const { getSettings } = require('./settingsService');
const { getProviderSettingsWithSecret } = require('./aiProviderSettingsService');
const { sendOpenAICompatibleRequest } = require('./openaiCompatibleService');
const { addLog } = require('./logsService');

function toDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  return `data:image/jpeg;base64,${base64}`;
}

async function analyzeImageWithContext({ filePath, customerText = '', memorySummary = '' }) {
  const settings = getSettings();
  if (!settings.enable_image_analysis) {
    return { ok: false, reason: 'disabled' };
  }

  const provider = getProviderSettingsWithSecret();
  if (!provider.api_key || !provider.base_url || !provider.model) {
    return { ok: false, reason: 'provider_not_ready' };
  }

  try {
    const dataUrl = toDataUrl(filePath);
    const system = 'حلّل صورة مرسلة من عميل في سياق خدمة سيارات. أعط ملاحظة قصيرة مفيدة واطلب معلومة ناقصة واحدة فقط.';
    const userInstruction = `
سياق الرسائل:
${memorySummary || 'لا يوجد'}

نص العميل:
${customerText || 'لا يوجد نص'}

المطلوب:
- وصف مختصر لما يظهر بالصورة إن أمكن.
- اقتراح سؤال متابعة ذكي واحد.
- لا تخترع تفاصيل غير واضحة.
`.trim();

    const result = await sendOpenAICompatibleRequest({
      provider: provider.provider,
      apiKey: provider.api_key,
      baseUrl: provider.base_url,
      model: settings.vision_model || provider.model,
      systemPrompt: system,
      userMessage: userInstruction,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: userInstruction },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: Number(settings.ai_temperature || 0.4),
      maxOutputTokens: 500
    });

    if (!result.ok) {
      return { ok: false, reason: 'provider_error', error: result.error };
    }

    return { ok: true, text: result.text };
  } catch (error) {
    addLog('error', 'ai_provider', 'Image analysis exception', { error: error.message });
    return { ok: false, reason: 'exception', error: error.message };
  }
}

module.exports = {
  analyzeImageWithContext
};
