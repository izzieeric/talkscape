const PROMPT_LAYER_LABELS = {
  system: '系统级',
  feature: '功能级',
  sub_feature: '子功能级',
  business: '业务级',
  flow: '流程级',
  scenario: '场景级',
  sub_scenario: '关卡级',
  template: '模板级'
};

const PROMPT_EDITABLE_LAYER_CODES = ['business', 'scenario', 'sub_scenario'];

const PROMPT_FEATURE_META = {
  conversation: {
    value: 'conversation',
    label: '场景对话',
    filterLabel: '场景对话',
    workbenchDesc: '系统层由代码统一托管，只开放场景级和关卡级业务提示词给后台配置。',
    supportsScenario: true,
    defaultSubFeatureCode: 'roleplay',
    defaultFlowCode: 'reply',
    supportedLayers: ['system', 'feature', 'sub_feature', 'flow', 'scenario', 'sub_scenario'],
    subFeatures: [
      { value: 'roleplay', label: '角色扮演对话' }
    ],
    flows: [
      { value: 'reply', label: '对话回复' }
    ]
  },
  'word-card': {
    value: 'word-card',
    label: '单词卡解释',
    filterLabel: '单词卡解释',
    workbenchDesc: '系统层负责变量替换和输出结构，只开放业务级提示词描述单词卡解释行为。',
    supportsScenario: false,
    defaultSubFeatureCode: 'dictionary',
    defaultFlowCode: 'explain',
    supportedLayers: ['system', 'feature', 'sub_feature', 'business', 'flow'],
    subFeatures: [
      { value: 'dictionary', label: '字典解释' }
    ],
    flows: [
      { value: 'explain', label: '解释输出' }
    ]
  },
  'smart-hint': {
    value: 'smart-hint',
    label: '智能提示',
    filterLabel: '智能提示',
    workbenchDesc: '系统层负责语言、风格和结构注入，只开放业务级提示词描述智能提示行为。',
    supportsScenario: false,
    defaultSubFeatureCode: 'reply-hint',
    defaultFlowCode: 'generate',
    supportedLayers: ['system', 'feature', 'sub_feature', 'business', 'flow'],
    subFeatures: [
      { value: 'reply-hint', label: '回复提示' }
    ],
    flows: [
      { value: 'generate', label: '提示生成' }
    ]
  },
  'smart-explain': {
    value: 'smart-explain',
    label: '智能讲解',
    filterLabel: '智能讲解',
    workbenchDesc: '系统层负责语言与结构规则，只开放业务级提示词描述评审和讲解行为。',
    supportsScenario: false,
    defaultSubFeatureCode: 'reply-review',
    defaultFlowCode: 'review',
    supportedLayers: ['system', 'feature', 'sub_feature', 'business', 'flow'],
    subFeatures: [
      { value: 'reply-review', label: '回复评审' },
      { value: 'message-explain', label: '句子讲解' }
    ],
    flows: [
      { value: 'review', label: '评审输出' },
      { value: 'explain', label: '讲解输出' }
    ]
  },
  'voice-transcript': {
    value: 'voice-transcript',
    label: '语音转译',
    filterLabel: '语音转译',
    workbenchDesc: '系统层负责语言和输出约束，只开放业务级提示词描述转写行为与纠错边界。',
    supportsScenario: false,
    defaultSubFeatureCode: 'speech-recognition',
    defaultFlowCode: 'transcribe',
    supportedLayers: ['system', 'feature', 'sub_feature', 'business', 'flow'],
    subFeatures: [
      { value: 'speech-recognition', label: '语音识别' }
    ],
    flows: [
      { value: 'transcribe', label: '转写输出' }
    ]
  },
  legacy: {
    value: 'legacy',
    label: '历史模板',
    filterLabel: '历史模板',
    workbenchDesc: '',
    supportsScenario: false,
    defaultSubFeatureCode: '',
    defaultFlowCode: '',
    supportedLayers: ['template'],
    subFeatures: [],
    flows: []
  }
};

function listPromptFeatureMeta() {
  return Object.values(PROMPT_FEATURE_META);
}

function getPromptFeatureMeta(feature) {
  return PROMPT_FEATURE_META[feature] || null;
}

function getSupportedLayerOptions(feature, { includeAll = false } = {}) {
  const meta = getPromptFeatureMeta(feature);
  const layerCodes = meta?.supportedLayers || Object.keys(PROMPT_LAYER_LABELS);
  const items = layerCodes.map((code) => ({
    value: code,
    label: PROMPT_LAYER_LABELS[code] || code
  }));

  return includeAll
    ? [{ value: '', label: '全部层级' }, ...items]
    : items;
}

function isPromptLayerEditable(layerCode = '') {
  return PROMPT_EDITABLE_LAYER_CODES.includes(String(layerCode || ''));
}

module.exports = {
  PROMPT_EDITABLE_LAYER_CODES,
  PROMPT_LAYER_LABELS,
  PROMPT_FEATURE_META,
  getPromptFeatureMeta,
  isPromptLayerEditable,
  getSupportedLayerOptions,
  listPromptFeatureMeta
};
