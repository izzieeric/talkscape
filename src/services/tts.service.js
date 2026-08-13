/**
 * TTS/STT 语音服务
 * 底层调用统一 AI 客户端 (ai-client.js)，可无缝切换 AI 平台。
 */
const crypto = require('crypto');
const fs = require('fs');
const aiClient = require('./ai-client');
const aiFunctionConfigService = require('./ai-function-config.service');
const config = require('../config');
const knex = require('../db/knex');
const { resolveDataFilePathFromUrl, resolveStorageTarget } = require('../utils/voice-storage');

const inFlightVoiceTasks = new Map();

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeVoiceSpeed(value, fallback = 1.0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(4, Math.max(0.25, numericValue));
}

async function normalizeOptions(options = {}) {
  const voiceConfig = config.ai?.voice || config.ai || {};
  const runtimeVoiceConfig = await aiFunctionConfigService.resolveFunctionConfig('voice-transcript');
  const provider = runtimeVoiceConfig?.provider || voiceConfig.provider || 'unknown';
  const requestedVoice = options.voice || runtimeVoiceConfig?.ttsVoice || voiceConfig.ttsVoice || 'alloy';
  const legacyOpenAiVoices = new Set(['alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer']);
  const voice = provider === 'volcengine' && legacyOpenAiVoices.has(requestedVoice)
    ? 'zh_female_vv_uranus_bigtts'
    : requestedVoice;
  return {
    voice,
    speed: normalizeVoiceSpeed(options.speed, 1.0),
    provider,
    model: options.model || runtimeVoiceConfig?.ttsModel || voiceConfig.ttsModel || 'tts-1'
  };
}

function buildCacheKey(text, options = {}) {
  const normalizedText = normalizeText(text);
  const normalizedOptions = {
    voice: String(options.voice || 'alloy'),
    speed: normalizeVoiceSpeed(options.speed, 1.0),
    provider: String(options.provider || 'unknown'),
    model: String(options.model || 'tts-1')
  };
  const payload = JSON.stringify({
    text: normalizedText,
    voice: normalizedOptions.voice,
    speed: normalizedOptions.speed,
    provider: normalizedOptions.provider,
    model: normalizedOptions.model,
    scope: String(options.scope || 'user'),
    userId: String(options.userId || ''),
    category: String(options.category || ''),
    word: String(options.word || '')
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}

function resolveVoiceFilePath(url) {
  return resolveDataFilePathFromUrl(url);
}

function isVoiceFileAvailable(url) {
  const filePath = resolveVoiceFilePath(url);
  return Boolean(filePath) && fs.existsSync(filePath);
}

async function getVoiceAssetByKey(cacheKey) {
    return await knex('voice_assets').where('cache_key', cacheKey).first();
}

async function getVoiceAssetByUrl(url) {
  if (!url) return null;
  return knex('voice_assets')
    .where('url', url)
    .orderBy('id', 'desc')
    .first();
}

async function touchVoiceAsset(cacheKey) {
    await knex('voice_assets').where('cache_key', cacheKey).update({last_accessed_at: knex.fn.now(), updated_at: knex.fn.now()});
}

async function saveVoiceAsset(record) {
    const data = {cache_key: record.cacheKey, text: record.text, voice: record.voice, speed: record.speed, provider: record.provider, model: record.model, status: record.status, url: record.url, error_message: record.errorMessage, last_accessed_at: knex.fn.now(), updated_at: knex.fn.now()};
  await knex('voice_assets').insert(data).onConflict('cache_key').merge(data);
}

async function generateAndCacheVoice(text, options = {}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) throw new Error('Text is required');

  const normalizedOptions = await normalizeOptions(options);
  const cacheKey = buildCacheKey(normalizedText, normalizedOptions);
  const existing = await getVoiceAssetByKey(cacheKey);

  if (existing?.status === 'ready' && isVoiceFileAvailable(existing.url)) {
    await touchVoiceAsset(cacheKey);
    return {
      cacheKey,
      url: existing.url,
      status: 'ready',
      fromCache: true
    };
  }

  if (inFlightVoiceTasks.has(cacheKey)) {
    return inFlightVoiceTasks.get(cacheKey);
  }

  const task = (async () => {
    const storageTarget = resolveStorageTarget({
      scope: options.scope || 'user',
      userId: options.userId || '',
      category: options.category || '',
      word: options.word || '',
      extension: '.mp3'
    });

    await saveVoiceAsset({
      cacheKey,
      text: normalizedText,
      voice: normalizedOptions.voice,
      speed: normalizedOptions.speed,
      provider: normalizedOptions.provider,
      model: normalizedOptions.model,
      status: 'pending',
      url: existing?.url || null,
      errorMessage: null
    });

    try {
      const url = await aiClient.textToSpeech(normalizedText, {
        voice: normalizedOptions.voice,
        speed: normalizedOptions.speed,
        userId: options.userId,
        outputPath: storageTarget.absolutePath,
        outputUrl: storageTarget.url
      });

      await saveVoiceAsset({
        cacheKey,
        text: normalizedText,
        voice: normalizedOptions.voice,
        speed: normalizedOptions.speed,
        provider: normalizedOptions.provider,
        model: normalizedOptions.model,
        status: 'ready',
        url,
        errorMessage: null
      });

      return {
        cacheKey,
        url,
        status: 'ready',
        fromCache: false
      };
    } catch (error) {
      await saveVoiceAsset({
        cacheKey,
        text: normalizedText,
        voice: normalizedOptions.voice,
        speed: normalizedOptions.speed,
        provider: normalizedOptions.provider,
        model: normalizedOptions.model,
        status: 'failed',
        url: null,
        errorMessage: error.message
      });
      throw error;
    } finally {
      inFlightVoiceTasks.delete(cacheKey);
    }
  })();

  inFlightVoiceTasks.set(cacheKey, task);
  return task;
}

async function textToSpeech(text, options = {}) {
  const result = await generateAndCacheVoice(text, options);
  return result.url;
}

async function ensureTextToSpeech(text, options = {}) {
  return generateAndCacheVoice(text, options);
}

async function speechToText(audioPath, language, options = {}) {
  return aiClient.speechToText(audioPath, language, options);
}

module.exports = {
  buildCacheKey,
  ensureTextToSpeech,
  getVoiceAssetByKey,
  getVoiceAssetByUrl,
  isVoiceFileAvailable,
  normalizeVoiceSpeed,
  normalizeText,
  textToSpeech,
  speechToText
};
