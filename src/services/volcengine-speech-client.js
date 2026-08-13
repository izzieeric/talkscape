const crypto = require('crypto');
const fs = require('fs');

const DEFAULT_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse';
const DEFAULT_ASR_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
const DEFAULT_TTS_RESOURCE_ID = 'seed-tts-2.0';
const DEFAULT_ASR_RESOURCE_ID = 'volc.bigasr.auc_turbo';

function normalizeText(value) {
  return String(value || '').trim();
}

function requireConfig(value, envName) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw new Error(`Volcengine speech config missing: ${envName}`);
  }
  return normalized;
}

function createHttpError(response, payload) {
  const message = payload?.message || payload?.msg || payload?.error || response.statusText;
  const error = new Error(`Volcengine speech request failed (${response.status}): ${message}`);
  error.status = response.status;
  error.response = payload;
  return error;
}

async function parseResponse(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (_error) {
    payload = { message: raw || 'Invalid JSON response' };
  }
  if (!response.ok) throw createHttpError(response, payload);
  return payload;
}

function normalizeLanguage(language) {
  const normalized = normalizeText(language).toLowerCase();
  if (normalized.startsWith('ja')) return 'ja-JP';
  if (normalized.startsWith('zh')) return 'zh-CN';
  return 'en-US';
}

class VolcengineSpeechClient {
  constructor(options = {}) {
    this.apiKey = requireConfig(options.apiKey || process.env.VOLCENGINE_SPEECH_API_KEY, 'VOLCENGINE_SPEECH_API_KEY');
    this.ttsEndpoint = normalizeText(options.ttsEndpoint || process.env.VOLCENGINE_TTS_ENDPOINT) || DEFAULT_TTS_ENDPOINT;
    this.asrEndpoint = normalizeText(options.asrEndpoint || process.env.VOLCENGINE_ASR_ENDPOINT) || DEFAULT_ASR_ENDPOINT;
    this.ttsResourceId = normalizeText(options.ttsResourceId || process.env.VOLCENGINE_TTS_RESOURCE_ID)
      || DEFAULT_TTS_RESOURCE_ID;
    this.asrResourceId = normalizeText(options.asrResourceId || process.env.VOLCENGINE_ASR_RESOURCE_ID)
      || DEFAULT_ASR_RESOURCE_ID;
  }

  async textToSpeech(text, options = {}) {
    const requestId = crypto.randomUUID();
    const voiceType = normalizeText(options.voice) || 'zh_female_vv_uranus_bigtts';
    const response = await fetch(this.ttsEndpoint, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'X-Api-Resource-Id': this.ttsResourceId,
        'X-Api-Request-Id': requestId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user: { uid: normalizeText(options.userId) || 'talkscape' },
        req_params: {
          text: normalizeText(text),
          speaker: voiceType,
          audio_params: {
            format: 'mp3',
            sample_rate: 24000,
            speech_rate: Math.round(((Number(options.speed) || 1) - 1) * 100)
          }
        }
      })
    });
    if (!response.ok) await parseResponse(response);
    const raw = await response.text();
    const audioChunks = raw.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((item) => item.audio || item.data || '')
      .filter(Boolean)
      .map((audio) => Buffer.from(audio, 'base64'));
    if (!audioChunks.length) throw new Error('Volcengine TTS returned empty audio data');
    const audioBuffer = Buffer.concat(audioChunks);
    const outputPath = normalizeText(options.outputPath);
    const outputUrl = normalizeText(options.outputUrl);
    if (!outputPath || !outputUrl) {
      throw new Error('outputPath and outputUrl are required for textToSpeech');
    }
    await fs.promises.mkdir(require('path').dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, audioBuffer);
    return outputUrl;
  }

  async speechToText(audioPath, language = 'en', options = {}) {
    const requestId = crypto.randomUUID();
    const audioData = await fs.promises.readFile(audioPath);
    const extension = normalizeText(options.format)
      || String(audioPath).split('.').pop().toLowerCase()
      || 'webm';
    const response = await fetch(this.asrEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        'X-Api-Resource-Id': this.asrResourceId,
        'X-Api-Request-Id': requestId,
        'X-Api-Sequence': '-1'
      },
      body: JSON.stringify({
        user: { uid: normalizeText(options.userId) || 'talkscape' },
        audio: {
          format: extension,
          data: audioData.toString('base64')
        },
        request: {
          model_name: 'bigmodel',
          language: normalizeLanguage(language),
          enable_itn: true,
          enable_punc: true,
          enable_ddc: true
        }
      })
    });
    const payload = await parseResponse(response);
    const code = response.headers.get('x-api-status-code');
    if (code && code !== '20000000') {
      const message = response.headers.get('x-api-message') || payload?.message || 'recognition failed';
      throw new Error(`Volcengine ASR failed (${code}): ${message}`);
    }
    const text = payload?.result?.text || payload?.text || payload?.result?.[0]?.text || '';
    if (!normalizeText(text)) throw new Error('Volcengine ASR returned empty transcription');
    return text;
  }
}

module.exports = VolcengineSpeechClient;
