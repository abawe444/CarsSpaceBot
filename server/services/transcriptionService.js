const fs = require('fs');
const path = require('path');
const { getSettings } = require('./settingsService');
const { getProviderSettingsWithSecret } = require('./aiProviderSettingsService');
const { addLog } = require('./logsService');

async function transcribeVoiceFile(filePath) {
  const settings = getSettings();
  if (!settings.enable_voice_transcription) {
    return { ok: false, reason: 'disabled' };
  }

  const provider = getProviderSettingsWithSecret();
  const baseUrl = String(provider.base_url || '').replace(/\/+$/, '');
  const apiKey = provider.api_key || '';

  if (!apiKey) {
    return { ok: false, reason: 'no_api_key' };
  }

  if (!/api\.openai\.com/i.test(baseUrl)) {
    return { ok: false, reason: 'provider_not_supported_yet' };
  }

  const endpoint = `${baseUrl}/audio/transcriptions`;

  try {
    const buffer = fs.readFileSync(path.resolve(filePath));
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    const form = new FormData();
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('file', blob, path.basename(filePath));

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      addLog('error', 'ai_provider', 'Voice transcription failed', {
        status: response.status,
        message: json?.error?.message || json?.message || 'transcription_failed'
      });
      return {
        ok: false,
        reason: 'transcription_failed',
        error: json?.error?.message || json?.message || `HTTP ${response.status}`
      };
    }

    const text = String(json?.text || '').trim();
    if (!text) {
      return { ok: false, reason: 'empty_transcript' };
    }

    return { ok: true, text };
  } catch (error) {
    addLog('error', 'ai_provider', 'Voice transcription exception', { error: error.message });
    return { ok: false, reason: 'exception', error: error.message };
  }
}

module.exports = {
  transcribeVoiceFile
};
