const promptConfigService = require('../services/prompt-config.service');

function loadPrompt(filename) {
  return promptConfigService.getPromptAssetContent({
    feature: 'legacy',
    targetId: String(filename || '').replace(/\.md$/i, '')
  });
}

async function buildConversationPrompt(scenarioConfig) {
  let template = await loadPrompt('conversation.md');
  
  template = template.replace('{{SYSTEM_PROMPT}}', scenarioConfig.systemPrompt || '');
  template = template.replace('{{SCENARIO_TITLE}}', scenarioConfig.title || '');
  template = template.replace('{{DIFFICULTY}}', scenarioConfig.difficulty || 'beginner');
  
  return template;
}

async function buildSystemPrompt(scenarioId, options = {}) {
  const bundle = await promptConfigService.buildPrompt({
    feature: options.feature || 'conversation',
    subFeatureCode: options.subFeatureCode || 'roleplay',
    flowCode: options.flowCode || 'reply',
    scenarioId,
    subScenarioId: options.subScenarioId || '',
    scenarioTitle: options.scenarioTitle || '',
    difficulty: options.difficulty || 'beginner',
    learningDifficulty: options.learningDifficulty || 'A1',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    learningLanguage: options.learningLanguage || 'en',
    variables: options.variables || {}
  });
  return bundle.content;
}

async function buildWordExplanationPrompt(word, context, options = {}) {
  const bundle = await promptConfigService.buildPrompt({
    feature: 'word-card',
    subFeatureCode: options.subFeatureCode || 'dictionary',
    flowCode: options.flowCode || 'explain',
    scenarioId: options.scenarioId || '',
    subScenarioId: options.subScenarioId || '',
    targetWord: word,
    contextSentence: context || '',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    learningLanguage: options.learningLanguage || 'en',
    variables: options.variables || {}
  });
  return bundle.content;
}

async function buildSmartHintPrompt(options = {}) {
  const bundle = await promptConfigService.buildPrompt({
    feature: 'smart-hint',
    subFeatureCode: options.subFeatureCode || 'reply-hint',
    flowCode: options.flowCode || 'generate',
    scenarioId: options.scenarioId || '',
    subScenarioId: options.subScenarioId || '',
    learningDifficulty: options.learningDifficulty || 'A1',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    learningLanguage: options.learningLanguage || 'en',
    variables: options.variables || {}
  });
  return bundle.content;
}

async function buildSmartExplainPrompt(options = {}) {
  const bundle = await promptConfigService.buildPrompt({
    feature: 'smart-explain',
    subFeatureCode: options.subFeatureCode || 'reply-review',
    flowCode: options.flowCode || 'review',
    learningDifficulty: options.learningDifficulty || 'A1',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    learningLanguage: options.learningLanguage || 'en',
    variables: options.variables || {}
  });
  return bundle.content;
}

async function buildVoiceTranscriptPrompt(options = {}) {
  const bundle = await promptConfigService.buildPrompt({
    feature: 'voice-transcript',
    subFeatureCode: options.subFeatureCode || 'speech-recognition',
    flowCode: options.flowCode || 'transcribe',
    scenarioId: options.scenarioId || '',
    subScenarioId: options.subScenarioId || '',
    learningDifficulty: options.learningDifficulty || 'A1',
    nativeLanguage: options.nativeLanguage || 'zh-CN',
    learningLanguage: options.learningLanguage || 'en',
    variables: options.variables || {}
  });
  return bundle.content;
}

module.exports = {
  buildConversationPrompt,
  buildSystemPrompt,
  buildSmartExplainPrompt,
  buildSmartHintPrompt,
  buildVoiceTranscriptPrompt,
  buildWordExplanationPrompt
};
