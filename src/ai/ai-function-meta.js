const AI_PROVIDER_META = {
  deepseek: {
    value: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    chatModels: [
      { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { value: 'deepseek-chat', label: 'deepseek-chat' }
    ],
    sttModels: [],
    ttsVoices: []
  },
  volcengine: {
    value: 'volcengine',
    label: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatModels: [
      { value: 'doubao-seed-2-1-pro-260628', label: 'doubao-seed-2-1-pro-260628' },
      { value: 'doubao-seed-2-1-turbo-260628', label: 'doubao-seed-2-1-turbo-260628' },
      { value: 'doubao-seed-2-0-lite-260428', label: 'doubao-seed-2-0-lite-260428' },
      { value: 'doubao-seed-2-0-mini-260428', label: 'doubao-seed-2-0-mini-260428' },
      { value: 'doubao-seed-2-0-pro-260215', label: 'doubao-seed-2-0-pro-260215' }
    ],
    sttModels: [
      { value: 'bigmodel', label: '大模型录音文件识别极速版' }
    ],
    ttsVoices: [
      { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi 2.0（中英双语女声）' }
    ]
  },
  openai: {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    chatModels: [
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'gpt-4o', label: 'gpt-4o' }
    ],
    sttModels: [
      { value: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe' },
      { value: 'whisper-1', label: 'whisper-1' }
    ],
    ttsVoices: [
      { value: 'alloy', label: 'alloy' },
      { value: 'ash', label: 'ash' },
      { value: 'coral', label: 'coral' },
      { value: 'echo', label: 'echo' },
      { value: 'fable', label: 'fable' },
      { value: 'onyx', label: 'onyx' },
      { value: 'nova', label: 'nova' },
      { value: 'sage', label: 'sage' },
      { value: 'shimmer', label: 'shimmer' }
    ]
  }
};

const AI_FUNCTION_META = {
  conversation: {
    value: 'conversation',
    label: '对话',
    capability: 'chat',
    promptFeature: 'conversation'
  },
  'smart-hint': {
    value: 'smart-hint',
    label: '智能提示',
    capability: 'chat',
    promptFeature: 'smart-hint'
  },
  'smart-explain': {
    value: 'smart-explain',
    label: '智能讲解',
    capability: 'chat',
    promptFeature: 'smart-explain'
  },
  'word-card': {
    value: 'word-card',
    label: '单词卡',
    capability: 'chat',
    promptFeature: 'word-card'
  },
  'voice-transcript': {
    value: 'voice-transcript',
    label: '语音转译',
    capability: 'voice',
    promptFeature: 'voice-transcript'
  }
};

function getAiProviderMeta(provider) {
  return AI_PROVIDER_META[provider] || null;
}

function listAiProviders() {
  return Object.values(AI_PROVIDER_META);
}

function getAiFunctionMeta(functionCode) {
  return AI_FUNCTION_META[functionCode] || null;
}

function listAiFunctionMeta() {
  return Object.values(AI_FUNCTION_META);
}

function getProviderOptionsByCapability(capability = 'chat') {
  return listAiProviders()
    .filter((item) => (capability === 'voice' ? item.sttModels.length : item.chatModels.length))
    .map((item) => ({
      value: item.value,
      label: item.label,
      baseUrl: item.baseUrl
    }));
}

function getModelOptions(functionCode, provider) {
  const functionMeta = getAiFunctionMeta(functionCode);
  const providerMeta = getAiProviderMeta(provider);
  if (!functionMeta || !providerMeta) return [];
  return functionMeta.capability === 'voice' ? providerMeta.sttModels : providerMeta.chatModels;
}

function getVoiceOptions(provider) {
  const providerMeta = getAiProviderMeta(provider);
  if (!providerMeta) return [];
  return Array.isArray(providerMeta.ttsVoices) ? providerMeta.ttsVoices : [];
}

module.exports = {
  AI_FUNCTION_META,
  AI_PROVIDER_META,
  getAiFunctionMeta,
  getAiProviderMeta,
  getModelOptions,
  getProviderOptionsByCapability,
  getVoiceOptions,
  listAiFunctionMeta,
  listAiProviders
};
