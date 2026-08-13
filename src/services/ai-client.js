/**
 * 统一 AI 客户端
 *
 * 聊天 / 词卡 与 语音能力支持分平台配置：
 * - chat: 对话、词卡等文本能力
 * - voice: TTS / STT 语音能力
 */
const OpenAI = require('openai');
const fs = require('fs');
const config = require('../config');
const promptBuilder = require('../utils/prompt-builder');
const aiFunctionConfigService = require('./ai-function-config.service');
const VolcengineSpeechClient = require('./volcengine-speech-client');
const { getLanguageMeta, normalizeLanguageCode } = require('../utils/language-utils');
const {
  logThirdPartyError,
  logThirdPartyRequest,
  logThirdPartyResponse
} = require('../middleware/logger');

let instance = null;

const PROVIDER_API_KEY_ENV_MAP = {
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  volcengine: 'ARK_API_KEY'
};

function normalizeText(value) {
  return String(value || '').trim();
}

function createRequestId() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function resolveProviderApiKey(provider, capability = 'chat') {
  const envName = PROVIDER_API_KEY_ENV_MAP[provider];
  if (envName && process.env[envName]) return process.env[envName];

  const aiConfig = config.ai || {};
  if (capability === 'voice') {
    const voiceConfig = aiConfig.voice || aiConfig || {};
    if (voiceConfig.provider === provider && voiceConfig.apiKey) {
      return voiceConfig.apiKey;
    }
  }

  const chatConfig = aiConfig.chat || aiConfig || {};
  if (chatConfig.provider === provider && chatConfig.apiKey) {
    return chatConfig.apiKey;
  }

  return process.env.AI_API_KEY || '';
}

class AIClient {
  constructor(aiConfig, capability = 'chat') {
    const { apiKey, baseUrl } = aiConfig;
    if (!apiKey) {
      const envName = PROVIDER_API_KEY_ENV_MAP[aiConfig.provider] || 'AI_API_KEY';
      throw new Error(`AI API Key not configured for ${capability} provider "${aiConfig.provider}". Set ${envName} in .env`);
    }

    this.capability = capability;
    this.provider = aiConfig.provider;
    this.model = aiConfig.model || aiConfig.chatModel || 'deepseek-v4-flash';
    this.ttsModel = aiConfig.ttsModel || 'tts-1';
    this.ttsVoice = aiConfig.ttsVoice || 'alloy';
    this.sttModel = aiConfig.sttModel || 'whisper-1';

    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl || undefined
    });
    this.baseUrl = baseUrl || '';
  }

  async invokeWithLog(action, meta = {}) {
    const startedAt = Date.now();
    const requestId = meta.requestId || createRequestId();
    logThirdPartyRequest({
      requestId,
      provider: this.provider,
      capability: this.capability,
      model: meta.model || this.model || this.sttModel || this.ttsModel,
      functionCode: meta.functionCode || '',
      method: meta.method || '',
      baseUrl: this.baseUrl,
      payload: meta.payload
    });

    try {
      const result = await action();
      logThirdPartyResponse({
        requestId,
        provider: this.provider,
        capability: this.capability,
        model: meta.model || this.model || this.sttModel || this.ttsModel,
        functionCode: meta.functionCode || '',
        method: meta.method || '',
        durationMs: Date.now() - startedAt,
        payload: meta.responsePayload
          ? meta.responsePayload(result)
          : undefined
      });
      return result;
    } catch (error) {
      logThirdPartyError({
        requestId,
        provider: this.provider,
        capability: this.capability,
        model: meta.model || this.model || this.sttModel || this.ttsModel,
        functionCode: meta.functionCode || '',
        method: meta.method || '',
        durationMs: Date.now() - startedAt,
        message: error.message,
        code: error.code || error.type || '',
        status: error.status || error.statusCode || error.response?.status || ''
      });
      throw error;
    }
  }

  // ==================== Chat ====================

  async chat(messages, options = {}) {
    const response = await this.invokeWithLog(() => this.client.chat.completions.create({
      model: this.model,
      messages,
      ...options
    }), {
      functionCode: options.functionCode || '',
      method: 'chat.completions.create',
      model: this.model,
      payload: {
        messages,
        messageCount: Array.isArray(messages) ? messages.length : 0,
        responseFormat: options.response_format || null,
        temperature: options.temperature
      },
      responsePayload: (result) => ({
        choiceCount: Array.isArray(result?.choices) ? result.choices.length : 0,
        result: result?.choices?.[0]?.message || null
      })
    });
    return response.choices[0].message;
  }

  extractJsonObject(content) {
    const raw = String(content || '').trim();
    if (!raw) {
      throw new Error('AI returned empty content');
    }

    const normalized = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      return JSON.parse(normalized);
    } catch (error) {
      const start = normalized.indexOf('{');
      const end = normalized.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(normalized.slice(start, end + 1));
      }
      throw error;
    }
  }

  async generateWordExplanation(word, context, options = {}) {
    const prompt = await promptBuilder.buildWordExplanationPrompt(word, context, options);
    const learningLanguage = getLanguageMeta(options.learningLanguage, 'en');
    const nativeLanguage = getLanguageMeta(options.nativeLanguage, 'zh-CN');
    const retryPrompts = [
      {
        messages: [{ role: 'user', content: prompt }],
        options: {
          temperature: 0.2,
          response_format: { type: 'json_object' }
        }
      },
      {
        messages: [{
          role: 'user',
          content: `${prompt}\n\nImportant:\n- Output compact JSON only.\n- Do not leave the response empty.\n- At minimum, fill definitionCn with a concise ${nativeLanguage.englishName} explanation.`
        }],
        options: {
          temperature: 0.1
        }
      },
      {
        messages: [{
          role: 'user',
          content: [
            `Target word: ${word}`,
            `Context: ${context || ''}`,
            'Return one valid JSON object only.',
            'Required keys: term, language, nativeLanguage, phonetic, partOfSpeech, definitionCn, definitionEn, exampleSentences, usageNotes, synonyms, wordRoot.',
            'Rules:',
            `- language must be "${learningLanguage.code}".`,
            `- nativeLanguage must be "${nativeLanguage.code}".`,
            `- definitionCn must be a concise ${nativeLanguage.englishName} explanation.`,
            '- definitionEn should be an empty string.',
            `- usageNotes should be in ${nativeLanguage.englishName}.`,
            `- exampleSentences[].english must stay in ${learningLanguage.englishName}.`,
            `- exampleSentences[].chinese must stay in ${nativeLanguage.englishName}.`,
            `- If uncertain, still provide the most likely learner-friendly ${nativeLanguage.englishName} meaning.`
          ].join('\n')
        }],
        options: {
          temperature: 0.1
        }
      }
    ];

    let lastError = null;
    for (const attempt of retryPrompts) {
      try {
        const response = await this.chat(attempt.messages, {
          ...attempt.options,
          functionCode: options.functionCode || 'word-card'
        });
        return this.extractJsonObject(response.content);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('Failed to generate word explanation');
  }

  // ==================== TTS ====================

  async textToSpeech(text, options = {}) {
    const voice = options.voice || this.ttsVoice;
    const speed = options.speed || 1.0;
    const outputPath = String(options.outputPath || '').trim();
    const outputUrl = String(options.outputUrl || '').trim();

    if (!outputPath || !outputUrl) {
      throw new Error('outputPath and outputUrl are required for textToSpeech');
    }

    const mp3 = await this.invokeWithLog(() => this.client.audio.speech.create({
      model: this.ttsModel,
      voice,
      input: text,
      speed
    }), {
      functionCode: options.functionCode || 'voice-tts',
      method: 'audio.speech.create',
      model: this.ttsModel,
      payload: {
        input: text,
        inputLength: String(text || '').length,
        voice,
        speed
      },
      responsePayload: () => ({
        outputUrl
      })
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, buffer);

    return outputUrl;
  }

  // ==================== STT ====================

  async speechToText(audioPath, language = 'en', options = {}) {
    const transcription = await this.invokeWithLog(() => this.client.audio.transcriptions.create({
      model: this.sttModel,
      file: fs.createReadStream(audioPath),
      language: normalizeLanguageCode(language, 'en'),
      prompt: normalizeText(options.prompt) || undefined
    }), {
      functionCode: options.functionCode || 'voice-transcript',
      method: 'audio.transcriptions.create',
      model: this.sttModel,
      payload: {
        audioPath,
        language: normalizeLanguageCode(language, 'en'),
        hasPrompt: Boolean(normalizeText(options.prompt)),
        prompt: normalizeText(options.prompt) || ''
      },
      responsePayload: (result) => ({
        textLength: String(result?.text || '').length,
        text: result?.text || ''
      })
    });
    return transcription.text;
  }
}

// ====== 单例工厂 ======

function getCapabilityConfig(capability = 'chat') {
  const aiConfig = config.ai || {};
  if (capability === 'voice') return aiConfig.voice || aiConfig;
  return aiConfig.chat || aiConfig;
}

async function getVoiceCapabilityRuntimeConfig() {
  const aiConfig = getCapabilityConfig('voice');
  if (!aiConfig) {
    throw new Error('AI voice config not found');
  }

  const resolved = await aiFunctionConfigService.resolveFunctionConfig('voice-transcript');
  const provider = resolved?.provider || aiConfig.provider;

  return {
    provider,
    apiKey: resolveProviderApiKey(provider, 'voice'),
    baseUrl: resolved?.baseUrl || aiConfig.baseUrl,
    ttsModel: resolved?.ttsModel || aiConfig.ttsModel,
    ttsVoice: resolved?.ttsVoice || aiConfig.ttsVoice,
    sttModel: resolved?.model || aiConfig.sttModel
  };
}

function createVolcengineSpeechClient() {
  return new VolcengineSpeechClient();
}

async function getFunctionRuntimeConfig(functionCode) {
  const resolved = await aiFunctionConfigService.resolveFunctionConfig(functionCode);
  if (!resolved) {
    throw new Error(`AI function config not found for ${functionCode}`);
  }

  return {
    capability: resolved.capability,
    provider: resolved.provider,
    apiKey: resolveProviderApiKey(resolved.provider, resolved.capability),
    baseUrl: resolved.baseUrl,
    model: resolved.capability === 'voice' ? undefined : resolved.model,
    sttModel: resolved.capability === 'voice' ? resolved.model : undefined
  };
}

async function createFunctionClient(functionCode) {
  const runtimeConfig = await getFunctionRuntimeConfig(functionCode);
  return new AIClient(runtimeConfig, runtimeConfig.capability);
}

function getCachedClient(cacheKey, factory) {
  if (!instance) instance = {};
  if (!instance[cacheKey]) instance[cacheKey] = factory();
  return instance[cacheKey];
}

function getClient(capability = 'chat') {
  if (capability === 'voice') {
    return getCachedClient('voice-tts', async () => {
      const runtimeConfig = await getVoiceCapabilityRuntimeConfig();
      return runtimeConfig.provider === 'volcengine'
        ? createVolcengineSpeechClient()
        : new AIClient(runtimeConfig, 'voice');
    });
  }
  return getCachedClient('conversation', () => createFunctionClient('conversation'));
}

function getFunctionClient(functionCode) {
  return getCachedClient(functionCode, async () => {
    const runtimeConfig = await getFunctionRuntimeConfig(functionCode);
    if (runtimeConfig.capability === 'voice' && runtimeConfig.provider === 'volcengine') {
      return createVolcengineSpeechClient();
    }
    return new AIClient(runtimeConfig, runtimeConfig.capability);
  });
}

// 允许运行时热替换（切换 provider 时调用）
function resetClient(cacheKey) {
  if (!cacheKey) {
    instance = null;
    return;
  }

  if (instance) {
    delete instance[cacheKey];
  }
}

module.exports = {
  AIClient,
  getClient,
  getFunctionClient,
  resetClient,

  // Convenience methods
  chat: async (messages, options = {}) => {
    const functionCode = options.functionCode || 'conversation';
    const nextOptions = { ...options };
    delete nextOptions.functionCode;
    return (await getFunctionClient(functionCode)).chat(messages, nextOptions);
  },
  textToSpeech: async (...args) => (await getClient('voice')).textToSpeech(...args),
  speechToText: async (audioPath, language, options = {}) => {
    const functionCode = options.functionCode || 'voice-transcript';
    const nextOptions = { ...options };
    delete nextOptions.functionCode;
    return (await getFunctionClient(functionCode)).speechToText(audioPath, language, nextOptions);
  },
  generateWordExplanation: async (word, context, options = {}) => {
    const functionCode = options.functionCode || 'word-card';
    const nextOptions = { ...options };
    delete nextOptions.functionCode;
    return (await getFunctionClient(functionCode)).generateWordExplanation(word, context, nextOptions);
  }
};
