const knex = require('../db/knex');
const {
  normalizeLearningDifficultySetting,
  normalizeLearningLanguageSetting,
  normalizeNativeLanguageSetting
} = require('../utils/language-utils');

const SETTINGS_KEYS = [
  'learningLanguage',
  'learningDifficulty',
  'nativeLanguage',
  'voiceSpeed',
  'ttsVoice',
  'autoPlayVoice',
  'voiceOnly',
  'showTranslation',
  'showHints',
  'showHintExamples',
  'wordbookAutoRemoveCount',
  'conversationStyle',
  'smartExplainEnabled'
];

const DEFAULT_SETTINGS = {
  learningLanguage: 'en',
  learningDifficulty: 'A1',
  nativeLanguage: 'zh-CN',
  voiceSpeed: 1.0,
  ttsVoice: 'alloy',
  autoPlayVoice: true,
  voiceOnly: false,
  showTranslation: true,
  showHints: true,
  showHintExamples: true,
  wordbookAutoRemoveCount: 1,
  conversationStyle: 'normal',
  smartExplainEnabled: false
};

function normalizeVoiceSpeedSetting(value, fallback = DEFAULT_SETTINGS.voiceSpeed) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  return Math.min(4, Math.max(0.25, numericValue));
}

function pickSupportedSettings(value = {}) {
  return SETTINGS_KEYS.reduce((acc, key) => {
    if (value[key] !== undefined) {
      acc[key] = value[key];
    }
    return acc;
  }, {});
}

function normalizeSettings(value = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...pickSupportedSettings(value) };
  return {
    ...merged,
    learningLanguage: normalizeLearningLanguageSetting(merged.learningLanguage, DEFAULT_SETTINGS.learningLanguage),
    learningDifficulty: normalizeLearningDifficultySetting(merged.learningDifficulty, DEFAULT_SETTINGS.learningDifficulty),
    nativeLanguage: normalizeNativeLanguageSetting(merged.nativeLanguage, DEFAULT_SETTINGS.nativeLanguage),
    voiceSpeed: normalizeVoiceSpeedSetting(merged.voiceSpeed, DEFAULT_SETTINGS.voiceSpeed),
    autoPlayVoice: merged.autoPlayVoice === undefined ? DEFAULT_SETTINGS.autoPlayVoice : Boolean(merged.autoPlayVoice),
    voiceOnly: merged.voiceOnly === undefined ? DEFAULT_SETTINGS.voiceOnly : Boolean(merged.voiceOnly),
    showTranslation: merged.showTranslation === undefined ? DEFAULT_SETTINGS.showTranslation : Boolean(merged.showTranslation),
    showHints: merged.showHints === undefined ? DEFAULT_SETTINGS.showHints : Boolean(merged.showHints),
    wordbookAutoRemoveCount: Math.max(1, Number(merged.wordbookAutoRemoveCount) || DEFAULT_SETTINGS.wordbookAutoRemoveCount),
    showHintExamples: merged.showHintExamples === undefined ? DEFAULT_SETTINGS.showHintExamples : Boolean(merged.showHintExamples),
    smartExplainEnabled: merged.smartExplainEnabled === undefined ? DEFAULT_SETTINGS.smartExplainEnabled : Boolean(merged.smartExplainEnabled)
  };
}

exports.getSettings = async (userId = 'default') => {
    const row = await knex('user_settings').where('user_id', userId).first();
  
  if (row && row.settings) {
    return normalizeSettings(JSON.parse(row.settings));
  }
  
  return normalizeSettings(DEFAULT_SETTINGS);
};

exports.updateSettings = async (userId = 'default', settings) => {
    const current = await exports.getSettings(userId);
  const merged = normalizeSettings({ ...current, ...(settings || {}) });
  
  await knex('user_settings').insert({user_id: userId, settings: JSON.stringify(merged)}).onConflict('user_id').merge({settings: JSON.stringify(merged)});

  return merged;
};
