const knex = require('../db/knex');
const config = require('../config');
const {
  getAiFunctionMeta,
  getAiProviderMeta,
  getModelOptions,
  getProviderOptionsByCapability,
  getVoiceOptions,
  listAiFunctionMeta
} = require('../ai/ai-function-meta');

let schemaReadyPromise = null;

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

async function ensureAdminModelConfigSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const hasTtsVoice = await knex.schema.hasColumn('admin_ai_model_configs', 'tts_voice');
      if (!hasTtsVoice) {
        await knex.schema.alterTable('admin_ai_model_configs', (table) => {
          table.string('tts_voice', 100).notNullable().defaultTo('alloy');
        });
      }

      const hasTtsModel = await knex.schema.hasColumn('admin_ai_model_configs', 'tts_model');
      if (!hasTtsModel) {
        await knex.schema.alterTable('admin_ai_model_configs', (table) => {
          table.string('tts_model', 100).notNullable().defaultTo('tts-1');
        });
      }
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}

function getDefaultFunctionConfig(functionCode) {
  const functionMeta = getAiFunctionMeta(functionCode);
  if (!functionMeta) return null;

  const aiConfig = config.ai || {};
  if (functionMeta.capability === 'voice') {
    const voiceConfig = aiConfig.voice || aiConfig || {};
    const provider = normalizeText(voiceConfig.provider, 'volcengine');
    const providerMeta = getAiProviderMeta(provider);
    const model = normalizeText(
      voiceConfig.sttModel,
      getModelOptions(functionCode, provider)[0]?.value || 'whisper-1'
    );

    return {
      functionCode,
      capability: functionMeta.capability,
      provider,
      model,
      ttsModel: normalizeText(
        voiceConfig.ttsModel,
        'tts-1'
      ),
      baseUrl: normalizeText(voiceConfig.baseUrl, providerMeta?.baseUrl || ''),
      ttsVoice: normalizeText(voiceConfig.ttsVoice, getVoiceOptions(provider)[0]?.value || 'alloy')
    };
  }

  const chatConfig = aiConfig.chat || aiConfig || {};
  const provider = normalizeText(chatConfig.provider, 'deepseek');
  const providerMeta = getAiProviderMeta(provider);
  const model = normalizeText(
    chatConfig.model || chatConfig.chatModel,
    getModelOptions(functionCode, provider)[0]?.value || 'deepseek-v4-flash'
  );

  return {
    functionCode,
    capability: functionMeta.capability,
    provider,
    model,
    baseUrl: normalizeText(chatConfig.baseUrl, providerMeta?.baseUrl || '')
  };
}

async function getStoredFunctionConfig(functionCode) {
  await ensureAdminModelConfigSchema();
  const row = await knex('admin_ai_model_configs')
    .where('function_code', functionCode)
    .first();

  if (!row) return null;

  const functionMeta = getAiFunctionMeta(functionCode);
  return {
    functionCode: row.function_code,
    capability: functionMeta?.capability || 'chat',
    provider: row.provider,
    model: row.model,
    ttsModel: normalizeText(row.tts_model),
    baseUrl: normalizeText(row.base_url),
    ttsVoice: normalizeText(row.tts_voice)
  };
}

async function resolveFunctionConfig(functionCode) {
  const defaults = getDefaultFunctionConfig(functionCode);
  if (!defaults) return null;

  const stored = await getStoredFunctionConfig(functionCode);
  if (!stored) return defaults;

  const resolved = {
    ...defaults,
    ...stored,
    provider: normalizeText(stored.provider, defaults.provider),
    model: normalizeText(stored.model, defaults.model),
    ttsModel: normalizeText(stored.ttsModel, defaults.ttsModel),
    baseUrl: normalizeText(stored.baseUrl, defaults.baseUrl),
    ttsVoice: normalizeText(stored.ttsVoice, defaults.ttsVoice)
  };

  if (defaults.capability === 'voice') {
    if (process.env.AI_VOICE_PROVIDER) resolved.provider = defaults.provider;
    if (process.env.AI_VOICE_BASE_URL) resolved.baseUrl = defaults.baseUrl;
    if (process.env.AI_STT_MODEL) resolved.model = defaults.model;
    if (process.env.AI_TTS_MODEL) resolved.ttsModel = defaults.ttsModel;
    if (process.env.TTS_VOICE) resolved.ttsVoice = defaults.ttsVoice;
  }

  return resolved;
}

async function saveFunctionConfig(functionCode, input = {}) {
  await ensureAdminModelConfigSchema();
  const defaults = getDefaultFunctionConfig(functionCode);
  if (!defaults) {
    const error = new Error(`Unknown AI function: ${functionCode}`);
    error.status = 400;
    throw error;
  }

  const provider = normalizeText(input.provider, defaults.provider);
  const providerMeta = getAiProviderMeta(provider);
  if (!providerMeta) {
    const error = new Error(`Unsupported AI provider: ${provider}`);
    error.status = 400;
    throw error;
  }

  const modelOptions = getModelOptions(functionCode, provider);
  const model = normalizeText(input.model, defaults.model || modelOptions[0]?.value || '');
  if (!model) {
    const error = new Error(`Model is required for ${functionCode}`);
    error.status = 400;
    throw error;
  }

  const baseUrl = normalizeText(input.baseUrl, defaults.baseUrl || providerMeta.baseUrl || '');
  const ttsModel = defaults.capability === 'voice'
    ? normalizeText(input.ttsModel, defaults.ttsModel || 'tts-1')
    : '';
  const voiceOptions = defaults.capability === 'voice' ? getVoiceOptions(provider) : [];
  const ttsVoice = defaults.capability === 'voice'
    ? normalizeText(input.ttsVoice, defaults.ttsVoice || voiceOptions[0]?.value || 'alloy')
    : '';

  if (defaults.capability === 'voice' && voiceOptions.length && !voiceOptions.some((item) => item.value === ttsVoice)) {
    const error = new Error(`Unsupported TTS voice: ${ttsVoice}`);
    error.status = 400;
    throw error;
  }

  await knex('admin_ai_model_configs')
    .insert({
      function_code: functionCode,
      provider,
      model,
      tts_model: defaults.capability === 'voice' ? ttsModel : defaults.ttsModel || 'tts-1',
      base_url: baseUrl,
      tts_voice: defaults.capability === 'voice' ? ttsVoice : defaults.ttsVoice || 'alloy',
      updated_at: knex.fn.now()
    })
    .onConflict('function_code')
    .merge({
      provider,
      model,
      tts_model: defaults.capability === 'voice' ? ttsModel : defaults.ttsModel || 'tts-1',
      base_url: baseUrl,
      tts_voice: defaults.capability === 'voice' ? ttsVoice : defaults.ttsVoice || 'alloy',
      updated_at: knex.fn.now()
    });

  return resolveFunctionConfig(functionCode);
}

async function saveFunctionConfigs(items = []) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const results = [];

  for (const item of normalizedItems) {
    const functionCode = normalizeText(item.functionCode || item.value || item.code);
    if (!functionCode) continue;
    results.push(await saveFunctionConfig(functionCode, item));
  }

  return results;
}

async function listFunctionConfigsForAdmin() {
  return Promise.all(
    listAiFunctionMeta().map(async (item) => {
      const current = await resolveFunctionConfig(item.value);
      const providerOptions = getProviderOptionsByCapability(item.capability);
      const providerLabel = getAiProviderMeta(current.provider)?.label || current.provider;

      return {
        ...item,
        current: {
          ...current,
          providerLabel
        },
        providerOptions,
        voiceOptions: item.capability === 'voice' ? getVoiceOptions(current.provider) : [],
        modelOptionsByProvider: providerOptions.reduce((acc, providerItem) => {
          acc[providerItem.value] = getModelOptions(item.value, providerItem.value);
          return acc;
        }, {}),
        voiceOptionsByProvider: providerOptions.reduce((acc, providerItem) => {
          acc[providerItem.value] = getVoiceOptions(providerItem.value);
          return acc;
        }, {})
      };
    })
  );
}

module.exports = {
  getDefaultFunctionConfig,
  getStoredFunctionConfig,
  listFunctionConfigsForAdmin,
  resolveFunctionConfig,
  saveFunctionConfig,
  saveFunctionConfigs
};
