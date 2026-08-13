const { v4: uuidv4 } = require('uuid');

class ConversationSession {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.scenarioId = data.scenario_id;
    this.userId = data.user_id || 'default';
    this.status = data.status || 'active';
    this.currentTurn = data.current_turn || 0;
    this.maxTurns = data.max_turns || 10;
    this.startedAt = data.started_at;
    this.completedAt = data.completed_at;
    this.summary = data.summary ? JSON.parse(data.summary) : null;
  }

  static fromDbRow(row) {
    return new ConversationSession(row);
  }
}

class ConversationMessage {
  constructor(data) {
    this.id = data.id;
    this.sessionId = data.session_id;
    this.turnNumber = data.turn_number;
    this.role = data.role;
    this.english = data.english;
    this.chinese = data.chinese;
    this.voiceUrl = data.voice_url;
    this.voiceDuration = data.voice_duration;
    this.rawAiResponse = data.raw_ai_response ? JSON.parse(data.raw_ai_response) : null;
    this.userInputType = data.user_input_type || 'typed';
    this.isCorrect = data.is_correct;
    this.aiFeedback = data.ai_feedback;
    this.userHint = data.user_hint ? JSON.parse(data.user_hint) : null;
    this.userHintCn = data.user_hint_cn;
    this.createdAt = data.created_at;
  }

  static fromDbRow(row) {
    return new ConversationMessage(row);
  }
}

module.exports = {
  ConversationSession,
  ConversationMessage
};
