const fs = require('fs');
const path = require('path');
const { loadEnvFiles } = require('./load-env');

loadEnvFiles();

const env = process.env.NODE_ENV || 'development';
const defaultConfigPath = path.join(__dirname, 'default.json');
const envConfigPath = path.join(__dirname, `${env}.json`);

function readConfig(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };

  for (const key of Object.keys(override || {})) {
    const baseValue = result[key];
    const overrideValue = override[key];

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

function replaceEnvVariables(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{(\w+)\}/g, (_, envKey) => process.env[envKey] || '');
  }

  if (Array.isArray(value)) {
    return value.map(replaceEnvVariables);
  }

  if (isPlainObject(value)) {
    const next = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      next[key] = replaceEnvVariables(nestedValue);
    }

    return next;
  }

  return value;
}

function getNumberEnv(name) {
  if (!process.env[name]) return undefined;

  const value = Number(process.env[name]);
  return Number.isNaN(value) ? undefined : value;
}

function getBooleanEnv(name) {
  if (!Object.prototype.hasOwnProperty.call(process.env, name)) return undefined;

  const normalized = String(process.env[name] || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function normalizeAiConfig(aiConfig = {}) {
  const legacyProvider = aiConfig.provider || 'deepseek';
  const legacyApiKey = aiConfig.apiKey || '';
  const legacyBaseUrl = aiConfig.baseUrl || '';
  const legacyChatModel = aiConfig.chatModel || aiConfig.model || 'deepseek-v4-flash';
  const legacyTtsModel = aiConfig.ttsModel || 'tts-1';
  const legacySttModel = aiConfig.sttModel || 'whisper-1';
  const legacyTtsVoice = aiConfig.ttsVoice || 'alloy';

  const chat = {
    provider: aiConfig.chat?.provider || legacyProvider,
    apiKey: aiConfig.chat?.apiKey || legacyApiKey,
    baseUrl: aiConfig.chat?.baseUrl || legacyBaseUrl,
    model: aiConfig.chat?.model || legacyChatModel
  };

  const voice = {
    provider: aiConfig.voice?.provider || legacyProvider,
    apiKey: aiConfig.voice?.apiKey || legacyApiKey,
    baseUrl: aiConfig.voice?.baseUrl || legacyBaseUrl,
    ttsModel: aiConfig.voice?.ttsModel || legacyTtsModel,
    sttModel: aiConfig.voice?.sttModel || legacySttModel,
    ttsVoice: aiConfig.voice?.ttsVoice || legacyTtsVoice
  };

  return {
    ...aiConfig,
    provider: chat.provider,
    apiKey: chat.apiKey,
    baseUrl: chat.baseUrl,
    chatModel: chat.model,
    ttsModel: voice.ttsModel,
    sttModel: voice.sttModel,
    ttsVoice: voice.ttsVoice,
    chat,
    voice
  };
}

function getProviderDefaultBaseUrl(provider = '') {
  const baseUrlMap = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3'
  };
  return baseUrlMap[String(provider || '').trim()] || '';
}

function applyEnvOverrides(currentConfig) {
  const nextConfig = { ...currentConfig };

  nextConfig.server = { ...currentConfig.server };
  nextConfig.conversation = { ...(currentConfig.conversation || {}) };
  nextConfig.auth = { ...(currentConfig.auth || {}) };
  nextConfig.ai = normalizeAiConfig(currentConfig.ai);

  const envPort = getNumberEnv('PORT');
  if (envPort !== undefined) nextConfig.server.port = envPort;
  if (process.env.HOST) nextConfig.server.host = process.env.HOST;
  const envConversationMaxTurns = getNumberEnv('CONVERSATION_MAX_TURNS');
  if (envConversationMaxTurns !== undefined) nextConfig.conversation.maxTurns = envConversationMaxTurns;
  const envAllowRegister = getBooleanEnv('AUTH_ALLOW_REGISTER');
  if (envAllowRegister !== undefined) nextConfig.auth.allowRegister = envAllowRegister;

  const providerKeyMap = {
    openai: 'OPENAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    volcengine: 'ARK_API_KEY'
  };

  if (process.env.AI_PROVIDER) nextConfig.ai.chat.provider = process.env.AI_PROVIDER;
  if (process.env.AI_BASE_URL) nextConfig.ai.chat.baseUrl = process.env.AI_BASE_URL;
  if (process.env.AI_CHAT_MODEL) nextConfig.ai.chat.model = process.env.AI_CHAT_MODEL;
  if (process.env.AI_API_KEY) nextConfig.ai.chat.apiKey = process.env.AI_API_KEY;

  if (process.env.AI_CHAT_PROVIDER) nextConfig.ai.chat.provider = process.env.AI_CHAT_PROVIDER;
  if (process.env.AI_CHAT_BASE_URL) nextConfig.ai.chat.baseUrl = process.env.AI_CHAT_BASE_URL;
  if (process.env.AI_CHAT_API_KEY) nextConfig.ai.chat.apiKey = process.env.AI_CHAT_API_KEY;
  if (process.env.AI_CHAT_MODEL) nextConfig.ai.chat.model = process.env.AI_CHAT_MODEL;
  if (process.env.AI_CHAT_PROVIDER && !process.env.AI_CHAT_BASE_URL && !process.env.AI_BASE_URL) {
    nextConfig.ai.chat.baseUrl = getProviderDefaultBaseUrl(nextConfig.ai.chat.provider)
      || nextConfig.ai.chat.baseUrl;
  }

  if (process.env.AI_VOICE_PROVIDER) nextConfig.ai.voice.provider = process.env.AI_VOICE_PROVIDER;
  if (process.env.AI_VOICE_BASE_URL) nextConfig.ai.voice.baseUrl = process.env.AI_VOICE_BASE_URL;
  if (process.env.AI_VOICE_API_KEY) nextConfig.ai.voice.apiKey = process.env.AI_VOICE_API_KEY;
  if (process.env.AI_TTS_MODEL) nextConfig.ai.voice.ttsModel = process.env.AI_TTS_MODEL;
  if (process.env.AI_STT_MODEL) nextConfig.ai.voice.sttModel = process.env.AI_STT_MODEL;
  if (process.env.TTS_VOICE) nextConfig.ai.voice.ttsVoice = process.env.TTS_VOICE;
  if (process.env.AI_VOICE_PROVIDER && !process.env.AI_VOICE_BASE_URL) {
    nextConfig.ai.voice.baseUrl = getProviderDefaultBaseUrl(nextConfig.ai.voice.provider)
      || nextConfig.ai.voice.baseUrl;
  }

  const chatProviderApiKeyEnv = providerKeyMap[nextConfig.ai.chat.provider];
  const chatProviderApiKey = nextConfig.ai.chat.apiKey
    || (chatProviderApiKeyEnv ? process.env[chatProviderApiKeyEnv] : undefined);
  if (chatProviderApiKey) nextConfig.ai.chat.apiKey = chatProviderApiKey;

  const voiceProviderApiKeyEnv = nextConfig.ai.voice.provider === 'volcengine'
    ? 'VOLCENGINE_SPEECH_API_KEY'
    : providerKeyMap[nextConfig.ai.voice.provider];
  const voiceProviderApiKey = nextConfig.ai.voice.apiKey
    || (voiceProviderApiKeyEnv ? process.env[voiceProviderApiKeyEnv] : undefined);
  if (voiceProviderApiKey) nextConfig.ai.voice.apiKey = voiceProviderApiKey;

  nextConfig.ai = normalizeAiConfig(nextConfig.ai);

  return nextConfig;
}

const defaultConfig = readConfig(defaultConfigPath);
const envConfig = fs.existsSync(envConfigPath) ? readConfig(envConfigPath) : {};

const mergedConfig = deepMerge(defaultConfig, envConfig);
const config = applyEnvOverrides(replaceEnvVariables(mergedConfig));

module.exports = config;
