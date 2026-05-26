function normalizeBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';

  const noSlash = raw.replace(/\/+$/, '');
  if (noSlash.endsWith('/chat/completions')) return noSlash;
  return `${noSlash}/chat/completions`;
}

async function sendOpenAICompatibleRequest({
  provider,
  apiKey,
  baseUrl,
  model,
  systemPrompt,
  userMessage,
  messages = null,
  temperature = 0.3,
  maxOutputTokens = 250,
  timeoutMs = 30000
}) {
  const endpoint = normalizeBaseUrl(baseUrl);
  if (!endpoint) {
    return {
      ok: false,
      provider,
      model,
      error: 'Base URL غير صالح',
      responseData: null,
      responseStatus: null,
      responseStatusText: null
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const finalMessages = Array.isArray(messages) && messages.length
    ? messages
    : [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ];

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    };
    if (/openrouter\.ai/i.test(endpoint)) {
      headers['HTTP-Referer'] = 'http://localhost:3000';
      headers['X-Title'] = 'SARH WhatsApp AI Agent';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: finalMessages,
        temperature: Number(temperature),
        max_tokens: Number(maxOutputTokens)
      }),
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errMessage = json?.error?.message || json?.message || `HTTP ${response.status}`;
      return {
        ok: false,
        provider,
        model,
        error: errMessage,
        responseData: json,
        responseStatus: response.status,
        responseStatusText: response.statusText
      };
    }

    const text = json?.choices?.[0]?.message?.content || '';
    if (!text) {
      return {
        ok: false,
        provider,
        model,
        error: 'لم يتم استلام نص رد من المزود',
        responseData: json,
        responseStatus: response.status,
        responseStatusText: response.statusText
      };
    }

    return {
      ok: true,
      provider,
      model,
      text: String(text).trim()
    };
  } catch (error) {
    return {
      ok: false,
      provider,
      model,
      error: error.name === 'AbortError' ? 'انتهت مهلة الطلب' : error.message,
      responseData: null,
      responseStatus: null,
      responseStatusText: null
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  sendOpenAICompatibleRequest,
  normalizeBaseUrl
};
