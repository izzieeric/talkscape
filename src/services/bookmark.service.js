const knex = require('../db/knex');

function normalizeBookmarkStatus(status) {
  if (status === 'practiced') return 'practiced';
  if (status === 'deleted') return 'deleted';
  return 'active';
}

function normalizeWordbookAutoRemoveCount(value, fallback = 1) {
  return Math.max(1, Number(value) || fallback);
}

function isSameCalendarDay(dateValue, referenceDate = new Date()) {
  if (!dateValue) return false;
  const targetDate = new Date(dateValue);
  if (Number.isNaN(targetDate.getTime())) return false;
  return targetDate.getFullYear() === referenceDate.getFullYear()
    && targetDate.getMonth() === referenceDate.getMonth()
    && targetDate.getDate() === referenceDate.getDate();
}

function shouldSkipWordbookForToday(bookmark = {}, autoRemoveCount = 1, referenceDate = new Date()) {
  const threshold = normalizeWordbookAutoRemoveCount(autoRemoveCount, 1);
  if (threshold <= 1) return false;
  if (normalizeBookmarkStatus(bookmark.status) !== 'active') return false;

  const reviewCount = Math.max(0, Number(bookmark.review_count) || 0);
  if (reviewCount <= 0 || reviewCount >= threshold) return false;

  return isSameCalendarDay(bookmark.last_reviewed_at, referenceDate);
}

exports.getAllBookmarks = async (userId = 'default', options = {}) => {
  const includePracticed = options.includePracticed === true;
  const wordbookEligible = options.wordbookEligible === true;
  const wordbookAutoRemoveCount = normalizeWordbookAutoRemoveCount(options.wordbookAutoRemoveCount, 1);
  const referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
  let bookmarks = [];

  if (includePracticed) {
    bookmarks = await knex('word_bookmarks')
      .where('user_id', userId)
      .andWhereNot('status', 'deleted')
      .orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
      .orderByRaw('COALESCE(practiced_at, created_at) DESC');
  } else {
    bookmarks = await knex('word_bookmarks')
      .where({ user_id: userId, status: 'active' })
      .orderBy('created_at', 'desc');
  }

  if (!wordbookEligible) {
    return bookmarks;
  }

  return bookmarks.filter((bookmark) => !shouldSkipWordbookForToday(bookmark, wordbookAutoRemoveCount, referenceDate));
};

exports.getWordbookBookmarks = async (userId = 'default', options = {}) => {
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const wordbookAutoRemoveCount = normalizeWordbookAutoRemoveCount(
    options.wordbookAutoRemoveCount,
    userSettings.wordbookAutoRemoveCount
  );

  return exports.getAllBookmarks(userId, {
    ...options,
    includePracticed: false,
    wordbookEligible: true,
    wordbookAutoRemoveCount
  });
};

exports.addBookmark = async ({ word, phonetic, partOfSpeech, definitionCn, definitionEn, exampleSentence, wordRoot, sourceScenarioId, sourceSentence, userId = 'default', tags = [] }) => {
    
  const data = { word: word.toLowerCase(), phonetic, part_of_speech: JSON.stringify(partOfSpeech || []), definition_cn: definitionCn, definition_en: definitionEn, example_sentence: JSON.stringify(exampleSentence || []), word_root: wordRoot, source_scenario_id: sourceScenarioId, source_sentence: sourceSentence, user_id: userId, tags: JSON.stringify(tags || []), status: 'active', practiced_at: null, updated_at: knex.fn.now() };
  await knex('word_bookmarks').insert(data).onConflict(['user_id', 'word']).merge({...data, deleted_at: null});

  return { word: word.toLowerCase(), userId };
};

exports.markPracticed = async (word, userId = 'default') => {
  await knex('word_bookmarks')
    .where('word', word.toLowerCase())
    .andWhere('user_id', userId)
    .andWhereNot('status', 'deleted')
    .update({ status: 'practiced', practiced_at: knex.fn.now(), deleted_at: null, updated_at: knex.fn.now() });

  return await exports.getBookmark(word, userId);
};

exports.reactivateBookmark = async (word, userId = 'default') => {
  await knex('word_bookmarks')
    .where('word', word.toLowerCase())
    .andWhere('user_id', userId)
    .update({ status: 'active', practiced_at: null, deleted_at: null, updated_at: knex.fn.now() });

  return await exports.getBookmark(word, userId);
};

exports.removeBookmark = async (word, userId = 'default') => {
  await knex('word_bookmarks')
    .where('word', word.toLowerCase())
    .andWhere('user_id', userId)
    .andWhereNot('status', 'deleted')
    .update({ status: 'deleted', deleted_at: knex.fn.now(), updated_at: knex.fn.now() });
};

exports.getBookmark = async (word, userId = 'default') => {
  return await knex('word_bookmarks')
    .where('word', word.toLowerCase())
    .andWhere('user_id', userId)
    .andWhereNot('status', 'deleted')
    .first() || null;
};

exports.checkBookmark = async (word, userId = 'default') => {
  return !!(await exports.getBookmark(word, userId));
};

exports.recordWordbookSuccesses = async (words = [], userId = 'default', options = {}) => {
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const wordbookAutoRemoveCount = normalizeWordbookAutoRemoveCount(
    options.wordbookAutoRemoveCount,
    userSettings.wordbookAutoRemoveCount
  );
  const normalizedWords = Array.from(new Set(
    (Array.isArray(words) ? words : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  ));

  if (!normalizedWords.length) {
    return {
      wordbookAutoRemoveCount,
      updatedWords: [],
      removedWords: []
    };
  }

  return knex.transaction(async (trx) => {
    const rows = await trx('word_bookmarks')
      .where('user_id', userId)
      .whereIn('word', normalizedWords)
      .andWhere('status', 'active');

    const rowMap = rows.reduce((acc, row) => {
      acc[row.word] = row;
      return acc;
    }, {});

    const updatedWords = [];
    const removedWords = [];

    for (const word of normalizedWords) {
      const row = rowMap[word];
      if (!row) continue;

      const nextReviewCount = Math.max(0, Number(row.review_count) || 0) + 1;
      const shouldPractice = nextReviewCount >= wordbookAutoRemoveCount;
      const nextPayload = {
        review_count: nextReviewCount,
        last_reviewed_at: trx.fn.now(),
        updated_at: trx.fn.now()
      };

      if (shouldPractice) {
        nextPayload.status = 'practiced';
        nextPayload.practiced_at = trx.fn.now();
        nextPayload.deleted_at = null;
      }

      await trx('word_bookmarks')
        .where('id', row.id)
        .update(nextPayload);

      const nextItem = {
        word,
        reviewCount: nextReviewCount,
        practiced: shouldPractice
      };
      updatedWords.push(nextItem);
      if (shouldPractice) {
        removedWords.push(word);
      }
    }

    return {
      wordbookAutoRemoveCount,
      updatedWords,
      removedWords
    };
  });
};

exports.normalizeBookmarkStatus = normalizeBookmarkStatus;
