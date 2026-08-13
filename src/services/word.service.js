const aiService = require('./ai.service');
const knex = require('../db/knex');
const { normalizeLanguageCode } = require('../utils/language-utils');

const DEFAULT_LANGUAGE = 'en';
const DEFAULT_NATIVE_LANGUAGE = 'zh-CN';
const DEFAULT_PROVIDER = 'ai-structured';

function normalizeWord(word) {
  return String(word || '').trim().toLowerCase();
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function getCachedWordEntry(word) {
  return knex('word_dictionary_entries')
    .where('word', word)
    .first();
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeStringArray(value, maxItems = 6) {
  if (typeof value === 'string') {
    const single = normalizeText(value);
    return single ? [single].slice(0, maxItems) : [];
  }

  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value
        .map((item) => normalizeText(item))
        .filter(Boolean)
    )
  ].slice(0, maxItems);
}

function normalizeNativeLanguage(value, fallback = DEFAULT_NATIVE_LANGUAGE) {
  return normalizeLanguageCode(value, fallback);
}

function normalizeLearningLanguage(value, fallback = DEFAULT_LANGUAGE) {
  return normalizeLanguageCode(value, fallback);
}

function normalizePhonetic(value) {
  const phonetic = normalizeText(value);
  if (!phonetic || phonetic === '/.../') return '';
  return phonetic;
}

function normalizeExampleSentences(value, fallbackContext = '') {
  if (!Array.isArray(value)) value = [];

  const examples = value
    .map((item) => ({
      english: normalizeText(item?.english || item?.sentence || item?.en),
      chinese: normalizeText(item?.chinese || item?.translation || item?.cn)
    }))
    .filter((item) => item.english);

  if (examples.length) return examples.slice(0, 3);

  if (fallbackContext) {
    return [{
      english: fallbackContext,
      chinese: ''
    }];
  }

  return [];
}

function hasMeaningfulWordDetail(explanation = {}) {
  const definitionCn = normalizeText(explanation.definitionCn || explanation.definition_cn);
  const definitionEn = normalizeText(explanation.definitionEn || explanation.definition_en);
  const examples = normalizeExampleSentences(explanation.exampleSentences || explanation.example_sentences);
  const usageNotes = normalizeStringArray(explanation.usageNotes || explanation.usage_notes, 4);
  const synonyms = normalizeStringArray(explanation.synonyms, 6);

  return Boolean(definitionCn || definitionEn || examples.length || usageNotes.length || synonyms.length);
}

function sanitizeWordDetail(word, explanation = {}, options = {}) {
  const context = normalizeText(options.context);
  const definitionCn = normalizeText(explanation.definitionCn || explanation.definition_cn);
  const definitionEn = normalizeText(explanation.definitionEn || explanation.definition_en);
  const learningLanguage = normalizeLearningLanguage(
    explanation.language || explanation.learningLanguage || explanation.learning_language || options.learningLanguage,
    DEFAULT_LANGUAGE
  );

  return {
    word,
    language: learningLanguage,
    nativeLanguage: normalizeNativeLanguage(
      explanation.nativeLanguage || explanation.native_language || options.nativeLanguage,
      DEFAULT_NATIVE_LANGUAGE
    ),
    provider: normalizeText(explanation.provider || options.provider, DEFAULT_PROVIDER),
    phonetic: normalizePhonetic(explanation.phonetic),
    partOfSpeech: normalizeStringArray(explanation.partOfSpeech || explanation.part_of_speech, 4),
    definitionCn: definitionCn || '暂无释义',
    definitionEn,
    exampleSentences: normalizeExampleSentences(explanation.exampleSentences || explanation.example_sentences, context),
    usageNotes: normalizeStringArray(explanation.usageNotes || explanation.usage_notes, 4),
    synonyms: normalizeStringArray(explanation.synonyms, 6),
    wordRoot: normalizeText(explanation.wordRoot || explanation.word_root),
    rawPayload: explanation.rawPayload || explanation.raw_payload || explanation
  };
}

function isUsableSanitizedDetail(detail) {
  return Boolean(
    (detail.definitionCn && detail.definitionCn !== '暂无释义')
    || detail.definitionEn
    || detail.exampleSentences.length
    || detail.usageNotes.length
    || detail.synonyms.length
  );
}

function buildFallbackWordDetail(word, context, options = {}, error = null) {
  return sanitizeWordDetail(word, {
    provider: 'ai-fallback',
    definitionCn: '词卡暂未生成完整内容，请稍后再试',
    definitionEn: '',
    exampleSentences: context ? [{ english: context, chinese: '' }] : [],
    usageNotes: [
      '当前展示的是兜底词卡，可稍后再次点击获取更完整解释。'
    ],
    rawPayload: {
      error: error?.message || '',
      fallback: true
    }
  }, {
    ...options,
    context
  });
}

async function saveWordEntry(detail, provider) {
  const data = {
    word: detail.word,
    provider: detail.provider || provider || DEFAULT_PROVIDER,
    language: detail.language || DEFAULT_LANGUAGE,
    native_language: detail.nativeLanguage || DEFAULT_NATIVE_LANGUAGE,
    phonetic: detail.phonetic || '',
    part_of_speech: JSON.stringify(detail.partOfSpeech || []),
    definition_cn: detail.definitionCn || '',
    definition_en: detail.definitionEn || '',
    example_sentences: JSON.stringify(detail.exampleSentences || []),
    usage_notes: JSON.stringify(detail.usageNotes || []),
    synonyms: JSON.stringify(detail.synonyms || []),
    word_root: detail.wordRoot || '',
    raw_payload: detail.rawPayload ? JSON.stringify(detail.rawPayload) : null,
    updated_at: knex.fn.now()
  };

  await knex('word_dictionary_entries')
    .insert(data)
    .onConflict('word')
    .merge(data);
}

function mapWordEntry(row) {
  const rawPayload = parseJsonField(row.raw_payload, {});
  const rowPartOfSpeech = parseJsonField(row.part_of_speech, []);
  const rowExampleSentences = parseJsonField(row.example_sentences, []);
  const rowUsageNotes = parseJsonField(row.usage_notes, []);
  const rowSynonyms = parseJsonField(row.synonyms, []);

  return sanitizeWordDetail(normalizeWord(row.word), {
    ...rawPayload,
    provider: row.provider || rawPayload.provider || DEFAULT_PROVIDER,
    language: row.language || rawPayload.language || DEFAULT_LANGUAGE,
    nativeLanguage: row.native_language || rawPayload.nativeLanguage || DEFAULT_NATIVE_LANGUAGE,
    phonetic: row.phonetic || rawPayload.phonetic || '',
    partOfSpeech: rowPartOfSpeech.length ? rowPartOfSpeech : (rawPayload.partOfSpeech || rawPayload.part_of_speech || []),
    definitionCn: row.definition_cn || rawPayload.definitionCn || rawPayload.definition_cn || '',
    definitionEn: row.definition_en || rawPayload.definitionEn || rawPayload.definition_en || '',
    exampleSentences: rowExampleSentences.length ? rowExampleSentences : (rawPayload.exampleSentences || rawPayload.example_sentences || []),
    usageNotes: rowUsageNotes.length ? rowUsageNotes : (rawPayload.usageNotes || rawPayload.usage_notes || []),
    synonyms: rowSynonyms.length ? rowSynonyms : (rawPayload.synonyms || []),
    wordRoot: row.word_root || rawPayload.wordRoot || rawPayload.word_root || '',
    rawPayload
  }, {
    nativeLanguage: row.native_language || rawPayload.nativeLanguage || DEFAULT_NATIVE_LANGUAGE
  });
}

async function generateWordDetailWithAi(word, context, options = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const explanation = await aiService.generateWordExplanation(word, context, options);
      if (!hasMeaningfulWordDetail(explanation)) {
        throw new Error('AI word detail missing core fields');
      }

      const detail = sanitizeWordDetail(word, explanation, {
        ...options,
        context,
        provider: DEFAULT_PROVIDER
      });

      if (isUsableSanitizedDetail(detail)) {
        return {
          detail,
          cacheable: true
        };
      }

      throw new Error('AI word detail sanitized to empty result');
    } catch (error) {
      lastError = error;
    }
  }

  return {
    detail: buildFallbackWordDetail(word, context, options, lastError),
    cacheable: false
  };
}

exports.getWordDetail = async (word, context, options = {}) => {
  const normalizedWord = normalizeWord(word);
  const normalizedContext = normalizeText(context);
  if (!normalizedWord) {
    throw new Error('Word is required');
  }

  // Always check the local dictionary first. Even in conversation scenes with
  // context, the user expects an existing database entry to be reused before
  // spending an AI request again.
  const cached = await getCachedWordEntry(normalizedWord);
  if (cached) {
    return mapWordEntry(cached);
  }

  const result = await generateWordDetailWithAi(normalizedWord, normalizedContext, {
    nativeLanguage: options.nativeLanguage || DEFAULT_NATIVE_LANGUAGE,
    learningLanguage: options.learningLanguage || DEFAULT_LANGUAGE,
    scenarioId: options.scenarioId || '',
    subScenarioId: options.subScenarioId || ''
  });

  if (result.cacheable) {
    await saveWordEntry(result.detail, DEFAULT_PROVIDER);
  }

  return {
    word: normalizedWord,
    ...result.detail
  };
};

exports.logWordClick = async ({ word, userId = 'default', sessionId, scenarioId, context }) => {
  await knex('word_click_logs').insert({
    word: normalizeWord(word),
    user_id: userId,
    session_id: sessionId,
    scenario_id: scenarioId,
    context
  });
};
