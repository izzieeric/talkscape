const LANGUAGE_META = {
  en: {
    code: 'en',
    englishName: 'English',
    localName: '英语'
  },
  ja: {
    code: 'ja',
    englishName: 'Japanese',
    localName: '日语'
  },
  'zh-CN': {
    code: 'zh-CN',
    englishName: 'Simplified Chinese',
    localName: '简体中文'
  },
  'zh-TW': {
    code: 'zh-TW',
    englishName: 'Traditional Chinese',
    localName: '繁体中文'
  }
};

const SUPPORTED_LEARNING_LANGUAGES = ['en'];
const SUPPORTED_NATIVE_LANGUAGES = ['zh-CN'];
const SUPPORTED_LEARNING_DIFFICULTIES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function normalizeLanguageCode(value, fallback = 'en') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh_hans') {
    return 'zh-CN';
  }
  if (lower === 'zh-tw' || lower === 'zh_hant') {
    return 'zh-TW';
  }
  if (lower === 'en-us' || lower === 'en-gb') {
    return 'en';
  }
  if (lower === 'ja-jp') {
    return 'ja';
  }

  return raw;
}

function getLanguageMeta(value, fallback = 'en') {
  const code = normalizeLanguageCode(value, fallback);
  const known = LANGUAGE_META[code];
  if (known) return known;

  return {
    code,
    englishName: code,
    localName: code
  };
}

function normalizeSupportedLanguage(value, supportedLanguages, fallback) {
  const normalized = normalizeLanguageCode(value, fallback);
  return supportedLanguages.includes(normalized) ? normalized : fallback;
}

function normalizeLearningLanguageSetting(value, fallback = 'en') {
  return normalizeSupportedLanguage(value, SUPPORTED_LEARNING_LANGUAGES, fallback);
}

function normalizeNativeLanguageSetting(value, fallback = 'zh-CN') {
  return normalizeSupportedLanguage(value, SUPPORTED_NATIVE_LANGUAGES, fallback);
}

function normalizeLearningDifficultySetting(value, fallback = 'A1') {
  const normalized = String(value || '').trim().toUpperCase();
  return SUPPORTED_LEARNING_DIFFICULTIES.includes(normalized) ? normalized : fallback;
}

module.exports = {
  getLanguageMeta,
  normalizeLanguageCode,
  normalizeLearningDifficultySetting,
  normalizeLearningLanguageSetting,
  normalizeNativeLanguageSetting,
  SUPPORTED_LEARNING_DIFFICULTIES,
  SUPPORTED_LEARNING_LANGUAGES,
  SUPPORTED_NATIVE_LANGUAGES
};
