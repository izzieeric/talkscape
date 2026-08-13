class WordBookmark {
  constructor(data) {
    this.id = data.id;
    this.word = data.word;
    this.phonetic = data.phonetic;
    this.partOfSpeech = JSON.parse(data.part_of_speech || '[]');
    this.definitionCn = data.definition_cn;
    this.definitionEn = data.definition_en;
    this.exampleSentence = JSON.parse(data.example_sentence || '[]');
    this.wordRoot = data.word_root;
    this.sourceScenarioId = data.source_scenario_id;
    this.sourceSentence = data.source_sentence;
    this.userId = data.user_id || 'default';
    this.tags = JSON.parse(data.tags || '[]');
    this.reviewCount = data.review_count || 0;
    this.lastReviewedAt = data.last_reviewed_at;
    this.createdAt = data.created_at;
    this.updatedAt = data.updated_at;
  }

  static fromDbRow(row) {
    return new WordBookmark(row);
  }
}

class WordClickLog {
  constructor(data) {
    this.id = data.id;
    this.word = data.word;
    this.userId = data.user_id || 'default';
    this.sessionId = data.session_id;
    this.scenarioId = data.scenario_id;
    this.context = data.context;
    this.createdAt = data.created_at;
  }

  static fromDbRow(row) {
    return new WordClickLog(row);
  }
}

module.exports = {
  WordBookmark,
  WordClickLog
};
