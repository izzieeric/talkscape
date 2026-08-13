const knex = require('../db/knex');
const config = require('../config');
const aiService = require('./ai.service');
const bookmarkService = require('./bookmark.service');
const scenarioService = require('./scenario.service');
const ttsService = require('./tts.service');
const { v4: uuidv4 } = require('uuid');
const promptBuilder = require('../utils/prompt-builder');
const { getLanguageMeta, normalizeLanguageCode } = require('../utils/language-utils');

const DEFAULT_MAX_TURNS = Math.max(1, Number(config.conversation?.maxTurns) || 50);
const WORDBOOK_SCENARIO_ID = 'wordbook-review';
const WORDBOOK_PROMPT_LIMIT = 12;
const THEME_FREE_MODE_SUBTASK_ID = '__theme_free_mode__';
let conversationSchemaReadyPromise = null;

function getLearningLanguageMeta(language) {
  return getLanguageMeta(language, 'en');
}

function getNativeLanguageMeta(language) {
  return getLanguageMeta(language, 'zh-CN');
}

async function ensureConversationSessionSchema() {
  if (!conversationSchemaReadyPromise) {
    conversationSchemaReadyPromise = (async () => {
      const hasCompletionOutcome = await knex.schema.hasColumn('conversation_sessions', 'completion_outcome');
      if (!hasCompletionOutcome) {
        await knex.schema.alterTable('conversation_sessions', (table) => {
          table.string('completion_outcome', 32).notNullable().defaultTo('success');
        });
      }
    })().catch((error) => {
      conversationSchemaReadyPromise = null;
      throw error;
    });
  }

  return conversationSchemaReadyPromise;
}

function buildCompletionTexts(learningLanguage = 'en', outcome = 'success') {
  const target = normalizeLanguageCode(learningLanguage, 'en');
  const isSuccess = outcome !== 'failed';
  if (target === 'ja') {
    return isSuccess
      ? {
          targetText: 'おめでとうございます。この練習セッションはすでに完了しています。いつでもこのシナリオを再開して、もう一度練習できます。',
          nativeText: '恭喜你，当前这轮练习已经完成了。你可以随时重新开始这个场景继续练习。'
        }
      : {
          targetText: '残念ですが、今回の練習はここで終了です。次はもう少し具体的に答えて、場面の目標に合わせて返してみましょう。',
          nativeText: '很遗憾，这一轮练习到这里结束了。这次还没有完全达成当前关卡目标，建议下次更具体地回应，并更贴合当前场景任务。'
        };
  }

  return isSuccess
    ? {
        targetText: 'Congratulations, you have already completed this practice session. You can restart the scenario whenever you want to practice again.',
        nativeText: '恭喜你，当前这轮练习已经完成了。你可以随时重新开始这个场景继续练习。'
      }
    : {
        targetText: 'Unfortunately, this practice round ends here. Next time, respond more directly to the scene goal and make your answer more complete.',
        nativeText: '很遗憾，这一轮练习到这里结束了。这次还没有完全达成当前关卡目标，建议下次更直接地回应场景目标，并把回答说得更完整一些。'
      };
}

function buildFallbackAiReply(learningLanguage = 'en') {
  const target = normalizeLanguageCode(learningLanguage, 'en');
  if (target === 'ja') {
    return {
      english: 'いいですね。もう少し詳しく聞かせてください。',
      chinese: '不错。可以再详细说一点吗？',
      userHintIdea: '先回应对方刚刚的问题，再补充一个和当前场景相关的小信息。',
      userHintIdeaCn: '先回应对方刚刚的问题，再补充一个和当前场景相关的小信息。',
      userHintExample: 'もう少し詳しく説明してもいいですか。',
      userHintExampleCn: '我可以再详细说明一点吗？'
    };
  }

  return {
    english: 'That sounds good. Could you tell me a little more?',
    chinese: '不错。可以再多说一点吗？',
    userHintIdea: '先回应对方刚刚的问题，再补充一个和当前场景相关的小信息。',
    userHintIdeaCn: '先回应对方刚刚的问题，再补充一个和当前场景相关的小信息。',
    userHintExample: 'I can tell you a little more about it.',
    userHintExampleCn: '我可以再多说一点。'
  };
}

function normalizeCompletionOutcome(value, fallback = 'success') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'failed' || normalized === 'success') {
    return normalized;
  }
  return fallback;
}

function buildLevelCompletionDialog({ outcome = 'success', scenarioTitle = '', subTaskTitle = '' } = {}) {
  if (outcome === 'failed') {
    return {
      title: '本轮挑战结束',
      message: `很遗憾，${scenarioTitle || '当前关卡'}本轮未完成。${subTaskTitle ? `当前目标是“${subTaskTitle}”，` : ''}建议根据场景目标更完整、更贴切地回应，重新开始后再试一次。`
    };
  }

  return {
    title: '恭喜完成挑战',
    message: `${scenarioTitle || '当前关卡'} 已成功完成挑战，场景列表会显示“已完成”标识。`
  };
}

function buildConversationTranscript(messages = []) {
  return messages
    .map((item, index) => {
      const roleLabel = item.role === 'user' ? 'Learner' : 'AI';
      const content = String(item.english || '').trim();
      return `${index + 1}. ${roleLabel}: ${content}`;
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeFinalTurnDecisionPayload(parsed = {}, learningLanguage = 'en', options = {}) {
  const outcome = normalizeCompletionOutcome(
    parsed.outcome || parsed.completionOutcome || (parsed.completed === false ? 'failed' : 'success'),
    'success'
  );
  const fallbackTexts = buildCompletionTexts(learningLanguage, outcome);
  const fallbackDialog = buildLevelCompletionDialog({
    outcome,
    scenarioTitle: options.scenarioTitle,
    subTaskTitle: options.subTaskTitle
  });

  return {
    completionOutcome: outcome,
    english: normalizePlainText(parsed.english || parsed.reply || parsed.message, fallbackTexts.targetText),
    chinese: normalizePlainText(parsed.chinese || parsed.translation || parsed.messageCn || parsed.replyCn, fallbackTexts.nativeText),
    dialogTitle: normalizePlainText(parsed.dialogTitle || parsed.dialog_title, fallbackDialog.title),
    dialogMessage: normalizePlainText(parsed.dialogMessage || parsed.dialog_message || parsed.summaryCn || parsed.summary_cn, fallbackDialog.message)
  };
}

function normalizePlainText(value, fallback = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function stringifyMaybeJson(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function isThemeFreeModeSubTaskId(subTaskId) {
  return String(subTaskId || '') === THEME_FREE_MODE_SUBTASK_ID;
}

function isInfiniteScenarioContext(scenarioId, subTaskId = null) {
  return scenarioId === WORDBOOK_SCENARIO_ID || isThemeFreeModeSubTaskId(subTaskId);
}

function shouldAlwaysStartFresh(scenarioId) {
  return scenarioId === WORDBOOK_SCENARIO_ID;
}

function getPromptHistoryWindowSize(session) {
  return Math.max(2, Number(session?.max_turns || DEFAULT_MAX_TURNS) * 2);
}

function shouldCountAsAiTurn(message = {}) {
  return message.role === 'ai' && message.user_input_type !== 'opening';
}

function normalizeAiHintPayload(parsed = {}) {
  const userHintIdea = parsed.userHintIdea || parsed.userHintIdeaCn || parsed.user_hint_idea || parsed.user_hint_idea_cn || '';
  const userHintIdeaCn = parsed.userHintIdeaCn || parsed.userHintIdea || parsed.user_hint_idea_cn || parsed.user_hint_idea || '';
  let userHintExample = parsed.userHintExample || parsed.user_hint_example || parsed.userHint || parsed.user_hint || '';
  let userHintExampleCn = parsed.userHintExampleCn || parsed.user_hint_example_cn || parsed.userHintCn || parsed.user_hint_cn || '';

  // 移除严格剔除例句的逻辑，避免用户觉得偶尔没例句是个 bug
  // 尽量相信大模型生成的例句

  return {
    userHintIdea,
    userHintIdeaCn,
    userHintExample,
    userHintExampleCn,
    // 兼容旧字段，对外继续保留
    userHint: userHintExample,
    userHintCn: userHintExampleCn
  };
}

function buildCompletionReply(session, learningLanguage = 'en') {
  const themeFreeModeAvailable = !isThemeFreeModeSubTaskId(session?.sub_task_id) && !isInfiniteScenarioContext(session?.scenario_id, session?.sub_task_id);
  const completionOutcome = normalizeCompletionOutcome(session?.completion_outcome, 'success');
  const completionTexts = buildCompletionTexts(learningLanguage, completionOutcome);
  const dialogMeta = buildLevelCompletionDialog({
    outcome: completionOutcome
  });
  return {
    messageId: null,
    english: completionTexts.targetText,
    chinese: completionTexts.nativeText,
    voiceUrl: null,
    userHintIdea: '',
    userHintIdeaCn: '',
    userHintExample: '',
    userHintExampleCn: '',
    userHint: '',
    userHintCn: '',
    currentTurn: session.current_turn,
    maxTurns: session.max_turns,
    isComplete: true,
    completionOutcome,
    completionDialogTitle: dialogMeta.title,
    completionDialogMessage: dialogMeta.message,
    completedNotice: true,
    themeFreeModeAvailable,
    themeFreeModeSubTaskId: themeFreeModeAvailable ? THEME_FREE_MODE_SUBTASK_ID : ''
  };
}

function buildOpeningInstruction(scenario, subTask = null, options = {}) {
  const isWordbookScenario = scenario?.id === WORDBOOK_SCENARIO_ID;
  const isThemeFreeMode = Boolean(options.isThemeFreeMode);
  const title = scenario?.title || scenario?.title_en || 'this scenario';
  return [
    isWordbookScenario
      ? 'Start a realistic in-scene conversation now.'
      : isThemeFreeMode
        ? `Continue in the ${title} theme, but switch to open-ended free conversation mode now.`
      : `Start the ${title} conversation now.`,
    isThemeFreeMode ? 'The learner has already cleared the structured step. Keep the same theme, roleplay setting, and tone, but let the conversation continue freely.' : '',
    subTask?.title ? `The active level step is: ${subTask.title}.` : '',
    subTask?.description ? `Focus on this step goal: ${subTask.description}.` : '',
    'Send the first message as the AI without waiting for the learner.',
    'Keep it short, natural, and easy to answer.',
    isWordbookScenario
      ? 'Stay fully in character and never mention hidden words, bookmarks, training, challenge mode, or system settings.'
      : 'Do not mention hidden rules, thresholds, bookmarks, or system settings unless the scenario truly requires it.'
  ].filter(Boolean).join(' ');
}

function buildConversationStylePrompt(conversationStyle = 'normal') {
  if (conversationStyle === 'professional') {
    return 'Adopt a formal, professional, and polite tone. You MUST use authentic, real-world business phrasing and professional etiquette (e.g., "Would you mind...", "I would appreciate it if..."). Avoid overly robotic or textbook-like responses; instead, sound like a real, experienced professional in a corporate or formal setting. (商务正式风格)';
  }
  if (conversationStyle === 'casual') {
    return 'Adopt a casual, everyday spoken tone. You MUST use authentic, real-world conversational phrasing, natural fillers (e.g., "Well", "You know", "I mean"), and common contractions (e.g., "gonna", "wanna") just like native speakers do in real life. Avoid stiff or textbook-like responses. (日常口语风格)';
  }
  if (conversationStyle === 'internet') {
    return 'Adopt a trendy, Gen-Z, internet slang, and highly relaxed tone. You MUST use authentic, real-world online and texting phrasing, modern slang (e.g., "fr", "ngl", "lit", "lowkey"), and very casual sentence structures. Sound like a real person texting or chatting on social media. (潮流网聊风格)';
  }
  return 'Standard, natural conversational tone based on the scenario context. No specific stylistic modifications required. (正常标准风格)';
}

function buildSceneLanguageStyleGuide({
  learningLanguage = 'en',
  nativeLanguage = 'zh-CN',
  learningDifficulty = 'A1',
  stylePrompt = ''
} = {}) {
  const learningMeta = getLearningLanguageMeta(learningLanguage);
  const nativeMeta = getNativeLanguageMeta(nativeLanguage);
  return [
    `The learner is studying ${learningMeta.englishName}.`,
    `The learner self-selected ${String(learningDifficulty || 'A1').toUpperCase()} as the current proficiency target. Keep task demand, suggested replies, and correction expectations aligned with that level.`,
    `Use ${nativeMeta.englishName} for learner-facing explanations, hints, and translations unless a field explicitly requires the target language.`,
    `Style guidance: ${stylePrompt || buildConversationStylePrompt('normal')}`
  ].join('\n');
}

async function getScenarioContext(scenarioId, subTaskId = '') {
  const scenario = await scenarioService.getScenarioById(scenarioId);
  if (!scenario) {
    return {
      scenario: null,
      subTask: null,
      isThemeFreeMode: false,
      resolvedSubTaskId: null
    };
  }

  const requestedSubTaskId = String(subTaskId || '').trim();
  if (isThemeFreeModeSubTaskId(requestedSubTaskId)) {
    return {
      scenario,
      subTask: null,
      isThemeFreeMode: true,
      resolvedSubTaskId: THEME_FREE_MODE_SUBTASK_ID
    };
  }

  const subTasks = Array.isArray(scenario.subTasks) ? scenario.subTasks : [];
  const defaultSubTaskId = scenario.defaultSubTaskId || subTasks[0]?.id || null;
  const resolvedSubTask = requestedSubTaskId
    ? (subTasks.find((item) => item.id === requestedSubTaskId) || null)
    : (defaultSubTaskId ? (subTasks.find((item) => item.id === defaultSubTaskId) || null) : null);
  const fallbackSubTask = !resolvedSubTask && defaultSubTaskId
    ? (subTasks.find((item) => item.id === defaultSubTaskId) || null)
    : null;
  const finalSubTask = resolvedSubTask || fallbackSubTask || null;

  return {
    scenario,
    subTask: finalSubTask,
    isThemeFreeMode: false,
    resolvedSubTaskId: finalSubTask?.id || null
  };
}

async function normalizeSessionScenarioState(session) {
  if (!session) return session;

  const {
    scenario,
    resolvedSubTaskId,
    isThemeFreeMode
  } = await getScenarioContext(session.scenario_id, session.sub_task_id || '');

  if (!scenario) {
    return session;
  }

  const currentSubTaskId = session.sub_task_id || null;
  const nextSubTaskId = isThemeFreeMode ? THEME_FREE_MODE_SUBTASK_ID : (resolvedSubTaskId || null);
  if ((currentSubTaskId || '') !== (nextSubTaskId || '')) {
    await knex('conversation_sessions')
      .where({ id: session.id, del: 0 })
      .update({
        sub_task_id: nextSubTaskId
      });

    return {
      ...session,
      sub_task_id: nextSubTaskId
    };
  }

  return session;
}

function buildScenarioRuntimePrompt({ scenario, subTask, isThemeFreeMode = false }) {
  const sceneType = scenario?.scene_type || scenario?.sceneType || 'level';
  const blocks = [];

  if (sceneType === 'level') {
    blocks.push('This is a level-based practice scenario.');
    if (scenario?.categoryTitle || scenario?.category_title) {
      blocks.push(`Category: ${scenario.categoryTitle || scenario.category_title}.`);
    }
    blocks.push(`Active scene: ${scenario?.title_en || scenario?.title || 'Current scene'}.`);
    if (isThemeFreeMode) {
      blocks.push('The learner has already completed the structured level step and is now in theme-based infinite free mode.');
      blocks.push('Keep the same scene setting, but drop rigid step constraints and let the conversation continue naturally.');
      blocks.push('Stay inside this theme and encourage richer free expression, opinions, follow-up questions, and scenario-consistent improvisation.');
      return blocks.join('\n');
    }
    if (subTask?.title) {
      blocks.push(`Current step: ${subTask.title}.`);
    }
    if (subTask?.description) {
      blocks.push(`Step goal: ${subTask.description}.`);
    }
    blocks.push('Keep the conversation focused on the current step until the learner completes it naturally.');
    blocks.push('Do not skip ahead to a later step unless the current step is clearly resolved in the dialogue.');
    blocks.push('Ask practical, realistic follow-up questions that belong to this exact step.');
    return blocks.join('\n');
  }

  if (sceneType === 'free') {
    blocks.push('This is a free conversation scenario.');
    blocks.push(`Use the scene theme "${scenario?.title_en || scenario?.title || 'Free Talk'}" as a loose roleplay anchor.`);
    if (scenario?.description) {
      blocks.push(`Scene brief: ${scenario.description}`);
    }
    blocks.push('There is no fixed level step. Keep the exchange open, natural, and easy to continue.');
    blocks.push('Prefer broad, everyday follow-up questions over rigid scripted flows.');
    return blocks.join('\n');
  }

  blocks.push('This is a featured scenario with special practice rules.');
  if (scenario?.description) {
    blocks.push(`Scene brief: ${scenario.description}`);
  }
  blocks.push('Follow the featured scenario mechanics while keeping the dialogue believable.');
  return blocks.join('\n');
}

function buildCommonScenarioPromptVariables({
  scenario,
  subTask,
  isThemeFreeMode = false,
  stylePrompt = '',
  learningLanguage = 'en',
  learningDifficulty = 'A1',
  nativeLanguage = 'zh-CN',
  extraVariables = {}
} = {}) {
  return {
    CONVERSATION_STYLE: stylePrompt,
    SCENE_LANGUAGE_STYLE_GUIDE: buildSceneLanguageStyleGuide({
      learningLanguage,
      learningDifficulty,
      nativeLanguage,
      stylePrompt
    }),
    LEARNING_DIFFICULTY: String(learningDifficulty || 'A1').toUpperCase(),
    SCENE_RUNTIME_PROMPT: buildScenarioRuntimePrompt({ scenario, subTask, isThemeFreeMode }),
    SCENE_TYPE: scenario?.scene_type || scenario?.sceneType || 'level',
    CATEGORY_TITLE: scenario?.categoryTitle || scenario?.category_title || '',
    SUBTASK_TITLE: subTask?.title || '',
    SUBTASK_DESCRIPTION: subTask?.description || '',
    IS_THEME_FREE_MODE: isThemeFreeMode ? 'true' : 'false',
    ...extraVariables
  };
}

function normalizeIssueList(items = [], maxItems = 4) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      type: normalizePlainText(item?.type || item?.category, 'expression'),
      title: normalizePlainText(item?.title, '可优化点'),
      detail: normalizePlainText(item?.detail || item?.problem),
      suggestion: normalizePlainText(item?.suggestion || item?.fix),
      betterExample: normalizePlainText(item?.betterExample || item?.better_example || item?.example)
    }))
    .filter((item) => item.detail || item.suggestion || item.betterExample)
    .slice(0, maxItems);
}

function normalizeUserFeedbackPayload(parsed = {}) {
  const issues = normalizeIssueList(parsed.issues, 3);
  const hasIssues = Boolean(parsed.hasIssues || issues.length);
  return {
    hasIssues,
    summaryCn: normalizePlainText(parsed.summaryCn || parsed.summary || parsed.headline, hasIssues ? '这句话可以再优化一下。' : ''),
    encouragementCn: normalizePlainText(parsed.encouragementCn || parsed.encouragement),
    contextVerdictCn: normalizePlainText(parsed.contextVerdictCn || parsed.context_verdict_cn),
    logicVerdictCn: normalizePlainText(parsed.logicVerdictCn || parsed.logic_verdict_cn),
    issues
  };
}

async function isSmartExplainEnabled(userId) {
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  return Boolean(userSettings.smartExplainEnabled);
}

function normalizeAiExplanationPayload(parsed = {}) {
  const phrases = Array.isArray(parsed.phrases)
    ? parsed.phrases
      .map((item) => ({
        phrase: normalizePlainText(item?.phrase || item?.text),
        meaningCn: normalizePlainText(item?.meaningCn || item?.meaning || item?.cn),
        noteCn: normalizePlainText(item?.noteCn || item?.note || item?.detail)
      }))
      .filter((item) => item.phrase || item.meaningCn || item.noteCn)
      .slice(0, 4)
    : [];
  const difficultPoints = normalizeIssueList(parsed.difficultPoints || parsed.difficult_points, 4);
  return {
    summaryCn: normalizePlainText(parsed.summaryCn || parsed.summary, '这句话是在表达一个基本意思。'),
    basicMeaningCn: normalizePlainText(
      parsed.basicMeaningCn
      || parsed.basic_meaning_cn
      || parsed.naturalMeaningCn
      || parsed.natural_meaning_cn
      || parsed.meaningCn
    ),
    expressionFocusCn: normalizePlainText(
      parsed.expressionFocusCn
      || parsed.expression_focus_cn
      || parsed.toneCn
      || parsed.tone_cn
      || parsed.grammarFocusCn
      || parsed.grammar_focus_cn
      || parsed.grammarTipCn
    ),
    phrases,
    difficultPoints
  };
}

function normalizeConversationReplyPayload(parsed = {}, learningLanguage = 'en') {
  const fallback = buildFallbackAiReply(learningLanguage);
  return {
    english: normalizePlainText(parsed.english || parsed.reply || parsed.message, fallback.english),
    chinese: normalizePlainText(parsed.chinese || parsed.translation || parsed.replyCn || parsed.messageCn, fallback.chinese)
  };
}

function buildWordSurfaceHints(word = '') {
  const lowerWord = String(word || '').trim().toLowerCase();
  if (!lowerWord) return [lowerWord];

  const forms = new Set([lowerWord]);
  if (lowerWord.endsWith('ies') && lowerWord.length > 3) {
    forms.add(`${lowerWord.slice(0, -3)}y`);
  }
  if (/(ses|xes|zes|ches|shes|oes)$/.test(lowerWord) && lowerWord.length > 2) {
    forms.add(lowerWord.slice(0, -2));
  }
  if (lowerWord.endsWith('s') && !lowerWord.endsWith('ss') && lowerWord.length > 1) {
    forms.add(lowerWord.slice(0, -1));
  }
  if (!lowerWord.endsWith('s')) {
    forms.add(`${lowerWord}s`);
    if (/[bcdfghjklmnpqrstvwxyz]y$/.test(lowerWord)) {
      forms.add(`${lowerWord.slice(0, -1)}ies`);
    }
    if (/(s|x|z|ch|sh|o)$/.test(lowerWord)) {
      forms.add(`${lowerWord}es`);
    }
  }

  return Array.from(forms).filter(Boolean);
}

async function buildWordbookPromptVariables(userId) {
  const bookmarks = (await bookmarkService.getWordbookBookmarks(userId)).slice(0, WORDBOOK_PROMPT_LIMIT);

  if (!bookmarks.length) {
    return {
      BOOKMARK_WORD_COUNT: '0',
      BOOKMARK_WORDS_LIST: 'No hidden lexical targets are available.',
      BOOKMARK_GUIDE: [
        'There are currently no hidden lexical targets available.',
        'Still continue with a believable roleplay scene and do not reveal the reason.',
        'Use one simple in-character opener or follow-up question to keep the scene moving.'
      ].join('\n')
    };
  }

  const wordLines = bookmarks.map((item, index) => {
    const definition = String(item.definition_cn || item.definition_en || '').trim();
    const baseWord = String(item.word || '').trim();
    const forms = buildWordSurfaceHints(baseWord).filter((entry) => entry !== baseWord.toLowerCase());
    const formHint = forms.length ? ` | acceptable natural variants: ${forms.join(', ')}` : '';
    return `${index + 1}. ${baseWord}${definition ? ` - ${definition}` : ''}${formHint}`;
  }).join('\n');

  return {
    BOOKMARK_WORD_COUNT: String(bookmarks.length),
    BOOKMARK_WORDS_LIST: wordLines,
    BOOKMARK_GUIDE: [
      `There are ${bookmarks.length} hidden lexical targets available for the AI to work with.`,
      'Do not reveal that these target words exist.',
      'Build a believable environment and speak as a real character inside it.',
      'Create situations where one or two target words would naturally fit in the learner reply.',
      'Prefer guiding the learner toward the saved surface form first, but accept very close natural inflections such as common singular/plural variants.',
      '**CRITICAL**: You MUST ALWAYS provide `userHintIdea` and `userHintExample` in your JSON response. Never leave them empty.',
      'Make userHintIdea and userHintExample a tightly matched pair for the same next-turn action.',
      'If the idea tells the learner to mention a specific target meaning or word, the example must demonstrate that same move instead of switching to a different response strategy.',
      'Never let the idea and example point in different directions.',
      'If a target word was not used, do not force it immediately or break scene logic.',
      'Let the conversation progress naturally, then open another believable chance later through a follow-up question, clarification, consequence, or new situational detail.',
      'Every turn must stay logically connected to what was just said so the roleplay still feels real.',
      'Do not force every word into one turn, and never sound like a teacher or coach.',
      'If one target word was already used naturally, acknowledge the content in character and move the scene toward another suitable target later.'
    ].join('\n')
  };
}

async function generateSmartHintPayload({
  session,
  scenario = null,
  subTask = null,
  isThemeFreeMode = false,
  latestAiReply,
  latestUserMessage = null,
  promptVariables = {},
  userId,
  extraWish = ''
}) {
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const learningLanguage = userSettings.learningLanguage || 'en';
  const learningDifficulty = userSettings.learningDifficulty || 'A1';
  const nativeLanguage = userSettings.nativeLanguage || 'zh-CN';
  const conversationStyle = userSettings.conversationStyle || 'normal';
  let resolvedScenario = scenario;
  let resolvedSubTask = subTask;
  let resolvedThemeFreeMode = Boolean(isThemeFreeMode);

  if (!resolvedScenario && session?.scenario_id) {
    const scenarioContext = await getScenarioContext(session.scenario_id, session.sub_task_id || '');
    resolvedScenario = scenarioContext.scenario;
    resolvedSubTask = scenarioContext.subTask;
    resolvedThemeFreeMode = scenarioContext.isThemeFreeMode;
  }

  const stylePrompt = buildConversationStylePrompt(conversationStyle);
  const mergedVariables = {
    ...promptVariables,
    ...buildCommonScenarioPromptVariables({
      scenario: resolvedScenario,
      subTask: resolvedSubTask,
      isThemeFreeMode: resolvedThemeFreeMode,
      stylePrompt,
      learningLanguage,
      learningDifficulty,
      nativeLanguage
    }),
    LATEST_AI_MESSAGE: latestAiReply?.english || '',
    LATEST_USER_MESSAGE: latestUserMessage?.english || '',
    EXTRA_WISH: extraWish || ''
  };

  const systemPrompt = await promptBuilder.buildSmartHintPrompt({
    scenarioId: session?.scenario_id || '',
    subScenarioId: session?.sub_task_id || '',
    learningDifficulty,
    nativeLanguage,
    learningLanguage,
    variables: mergedVariables
  });

  const aiReply = await aiService.chatByFunction('smart-hint', [
    { role: 'system', content: systemPrompt }
  ], {
    response_format: { type: 'json_object' }
  });

  let parsed;
  try {
    parsed = JSON.parse(aiReply.content);
  } catch {
    parsed = {};
  }

  return normalizeAiHintPayload(parsed, {
    scenarioId: ''
  });
}

async function activateInfiniteScenarioSession(session) {
  if (!session || !isInfiniteScenarioContext(session.scenario_id, session.sub_task_id) || session.status !== 'completed') {
    return session;
  }

    await knex('conversation_sessions').update({ status: 'active', completed_at: null }).where({ id: session.id, del: 0 });

  return {
    ...session,
    status: 'active',
    completed_at: null
  };
}

exports.createSession = async ({ scenarioId, subTaskId = null, userId = 'default', maxTurns = null }) => {
  const { scenario, isThemeFreeMode, resolvedSubTaskId } = await getScenarioContext(scenarioId, subTaskId);

  if (!scenario) {
    const error = new Error('Scenario not found');
    error.status = 404;
    throw error;
  }

  const resolvedMaxTurns = Math.max(
    1,
    Number(maxTurns) || (isThemeFreeMode ? DEFAULT_MAX_TURNS : Number(scenario.max_turns) || Number(scenario.maxTurns)) || DEFAULT_MAX_TURNS
  );
  const id = uuidv4();
  const initialSubTaskId = isThemeFreeMode ? THEME_FREE_MODE_SUBTASK_ID : (resolvedSubTaskId || null);
  await knex('conversation_sessions').insert({ id, scenario_id: scenarioId, sub_task_id: initialSubTaskId, user_id: userId, max_turns: resolvedMaxTurns, del: 0 });
  return { id, scenarioId, subTaskId: initialSubTaskId, userId, status: 'active', currentTurn: 0, maxTurns: resolvedMaxTurns, del: 0 };
};

async function getOwnedSession(sessionId, userId) {
  await ensureConversationSessionSchema();
  const query = knex('conversation_sessions').where({ id: sessionId, del: 0 });
  if (userId) query.andWhere({ user_id: userId });
  const session = await query.first();

  if (!session) return session;
  const scenarioNormalizedSession = await normalizeSessionScenarioState(session);
  const normalizedSession = await activateInfiniteScenarioSession(scenarioNormalizedSession);

  const aiReplyCountRow = await knex('conversation_messages').where({ session_id: sessionId, role: 'ai', del: 0 }).andWhereNot('user_input_type', 'opening').count('* as count').first();
  const aiReplyCount = Number(aiReplyCountRow?.count || 0);

  if (normalizedSession.current_turn !== aiReplyCount) {
    await knex('conversation_sessions').update({ current_turn: aiReplyCount }).where({ id: sessionId, del: 0 });
    return {
      ...normalizedSession,
      current_turn: aiReplyCount
    };
  }

  return normalizedSession;
}

async function assertOwnedSession(sessionId, userId) {
  const session = await getOwnedSession(sessionId, userId);
  if (!session) {
    const error = new Error('Session not found');
    error.status = 404;
    throw error;
  }
  return session;
}

exports.getSession = async (sessionId, userId) => await getOwnedSession(sessionId, userId);

exports.getLatestSessionByScenario = async (scenarioId, userId) => {
  if (shouldAlwaysStartFresh(scenarioId)) {
    return null;
  }

  const session = await knex('conversation_sessions')
    .where({ scenario_id: scenarioId, user_id: userId, del: 0 })
    .orderByRaw("CASE WHEN status = 'active' THEN 0 ELSE 1 END")
    .orderByRaw("COALESCE(completed_at, started_at) DESC")
    .first();

  if (!session) return null;
  const normalizedSession = await normalizeSessionScenarioState(session);
  return await activateInfiniteScenarioSession(normalizedSession);
};

exports.getMessages = async (sessionId, userId) => {
    await assertOwnedSession(sessionId, userId);
  return await knex('conversation_messages').where({ session_id: sessionId, del: 0 }).orderBy('turn_number', 'asc');
};

async function updateMessageVoice(messageId, voiceUrl) {
    await knex('conversation_messages').update({ voice_url: voiceUrl }).where({ id: messageId });
}

async function updateMessageHints(messageId, hintPayload = {}) {
    await knex('conversation_messages').update({
    user_hint: hintPayload.userHint || hintPayload.userHintExample || null,
    user_hint_cn: hintPayload.userHintCn || hintPayload.userHintExampleCn || null,
    user_hint_idea: hintPayload.userHintIdea || null,
    user_hint_idea_cn: hintPayload.userHintIdeaCn || null,
    user_hint_example: hintPayload.userHintExample || hintPayload.userHint || null,
    user_hint_example_cn: hintPayload.userHintExampleCn || hintPayload.userHintCn || null
  }).where({ id: messageId });
}

async function updateMessageReview(messageId, { isCorrect = null, aiFeedback = null, aiExplanation = null } = {}) {
    const updateData = {};
  if (isCorrect !== null) updateData.is_correct = isCorrect;
  if (aiFeedback !== null) updateData.ai_feedback = stringifyMaybeJson(aiFeedback);
  if (aiExplanation !== null) updateData.ai_explanation = stringifyMaybeJson(aiExplanation);
  if (Object.keys(updateData).length > 0) {
    await knex('conversation_messages').update(updateData).where({ id: messageId });
  }
}

function runDetachedTask(taskLabel, taskRunner) {
  Promise.resolve()
    .then(taskRunner)
    .catch((error) => {
      console.warn(`${taskLabel} async task failed:`, error.message);
    });
}

async function generateHintPayloadWithFallback(hintOptions = {}, wordbookTargets = [], learningLanguage = 'en') {
  try {
    return await generateSmartHintPayload(hintOptions);
  } catch (error) {
    console.warn('Smart hint generation failed:', error.message);
    return normalizeAiHintPayload(buildFallbackAiReply(learningLanguage), {
      scenarioId: hintOptions?.session?.scenario_id,
      targetWords: wordbookTargets.map((item) => String(item.word || '').trim().toLowerCase()).filter(Boolean)
    });
  }
}

exports.addMessage = async (sessionId, {
  role,
  english,
  chinese,
  voiceUrl,
  voiceDuration,
  userHint,
  userHintCn,
  userHintIdea,
  userHintIdeaCn,
  userHintExample,
  userHintExampleCn,
  userInputType = 'typed',
  aiFeedback,
  aiExplanation
}, userId) => {
    const session = await assertOwnedSession(sessionId, userId);
  if (session.status === 'completed' && !isInfiniteScenarioContext(session.scenario_id, session.sub_task_id)) {
    throw new Error('Session already completed');
  }

  const lastMessage = await knex('conversation_messages').where({ session_id: sessionId, del: 0 }).max('turn_number as maxTurnNumber').first();
  const turnNumber = Number(lastMessage?.maxTurnNumber || 0) + 1;
  const [insertedId] = await knex('conversation_messages').insert({
    session_id: sessionId, turn_number: turnNumber, role, english, chinese,
    voice_url: voiceUrl || null, voice_duration: Number(voiceDuration || 0) || null,
    user_hint: userHint || userHintExample || null, user_hint_cn: userHintCn || userHintExampleCn || null,
    user_hint_idea: userHintIdea || null, user_hint_idea_cn: userHintIdeaCn || null,
    user_hint_example: userHintExample || userHint || null, user_hint_example_cn: userHintExampleCn || userHintCn || null,
    user_input_type: userInputType, ai_feedback: stringifyMaybeJson(aiFeedback), ai_explanation: stringifyMaybeJson(aiExplanation), del: 0
  });
  const insertedMessage = { id: insertedId };
  if (shouldCountAsAiTurn({ role, user_input_type: userInputType })) {
    await knex('conversation_sessions').where({ id: sessionId, del: 0 }).increment('current_turn', 1);
  }
  return { turnNumber, messageId: insertedMessage?.id };
};

async function buildAiMessagePayload({
  session,
  promptMessages,
  userInput,
  userId,
  userInputType = 'typed',
  includeHintsSync = true
}) {
  const { scenario, subTask, isThemeFreeMode } = await getScenarioContext(session.scenario_id, session.sub_task_id || '');
  const wordbookTargets = session.scenario_id === WORDBOOK_SCENARIO_ID
    ? (await bookmarkService.getAllBookmarks(userId)).slice(0, WORDBOOK_PROMPT_LIMIT)
    : [];
  const promptVariables = session.scenario_id === WORDBOOK_SCENARIO_ID
    ? await buildWordbookPromptVariables(userId)
    : {};

  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const conversationStyle = userSettings.conversationStyle || 'normal';
  const learningLanguage = userSettings.learningLanguage || 'en';
  const learningDifficulty = userSettings.learningDifficulty || 'A1';
  const nativeLanguage = userSettings.nativeLanguage || 'zh-CN';
  const voiceSpeed = ttsService.normalizeVoiceSpeed(userSettings.voiceSpeed, 1.0);

  const stylePrompt = buildConversationStylePrompt(conversationStyle);
  Object.assign(promptVariables, buildCommonScenarioPromptVariables({
    scenario,
    subTask,
    isThemeFreeMode,
    stylePrompt,
    learningLanguage,
    learningDifficulty,
    nativeLanguage
  }));

  const systemPrompt = await promptBuilder.buildSystemPrompt(session.scenario_id, {
    feature: 'conversation',
    scenarioTitle: scenario?.title_en || scenario?.title || '',
    difficulty: scenario?.difficulty || 'beginner',
    learningDifficulty,
    subScenarioId: session.sub_task_id || '',
    nativeLanguage,
    learningLanguage,
    variables: promptVariables
  });

  const aiMessages = [
    { role: 'system', content: systemPrompt }
  ];

  for (const msg of promptMessages) {
    if (msg.role === 'user') {
      aiMessages.push({ role: 'user', content: msg.english });
    } else if (msg.role === 'ai') {
      aiMessages.push({ role: 'assistant', content: JSON.stringify({ english: msg.english, chinese: msg.chinese }) });
    }
  }

  const normalizedUserInput = normalizePlainText(userInput);
  const lastPromptMessage = promptMessages[promptMessages.length - 1] || null;
  const hasLatestUserInputInHistory = lastPromptMessage?.role === 'user'
    && normalizePlainText(lastPromptMessage.english) === normalizedUserInput;

  if (normalizedUserInput && !hasLatestUserInputInHistory) {
    aiMessages.push({ role: 'user', content: userInput });
  }

  const aiReply = await aiService.chatByFunction('conversation', aiMessages, {
    response_format: { type: 'json_object' }
  });

  let parsed;
  try {
    parsed = JSON.parse(aiReply.content);
  } catch {
    parsed = { english: aiReply.content };
  }
  const normalizedReply = normalizeConversationReplyPayload(parsed, learningLanguage);
  const latestUserMessage = [...promptMessages].reverse().find((item) => item.role === 'user');
  const hintOptions = {
    session,
    scenario,
    subTask,
    isThemeFreeMode,
    latestAiReply: normalizedReply,
    latestUserMessage,
    promptVariables,
    userId
  };
  let hintPayload = normalizeAiHintPayload({});
  let asyncHintPromise = null;
  if (includeHintsSync) {
    hintPayload = await generateHintPayloadWithFallback(hintOptions, wordbookTargets, learningLanguage);
  } else {
    asyncHintPromise = generateHintPayloadWithFallback(hintOptions, wordbookTargets, learningLanguage);
  }

  let voiceUrl = null;
  try {
    const voiceResult = await ttsService.ensureTextToSpeech(normalizedReply.english, {
      speed: voiceSpeed,
      scope: 'user',
      userId
    });
    voiceUrl = voiceResult.url;
  } catch (e) {
    console.warn('TTS generation failed:', e.message);
  }

  const messageResult = await exports.addMessage(session.id, {
    role: 'ai',
    english: normalizedReply.english,
    chinese: normalizedReply.chinese,
    voiceUrl,
    userInputType,
    ...hintPayload
  }, userId);

  if (!includeHintsSync && asyncHintPromise && messageResult.messageId) {
    runDetachedTask('Smart hint update', async () => {
      const asyncHintPayload = await asyncHintPromise;
      await updateMessageHints(messageResult.messageId, asyncHintPayload);
    });
  }

  return {
    messageId: messageResult.messageId,
    english: normalizedReply.english,
    chinese: normalizedReply.chinese,
    voiceUrl,
    ...hintPayload
  };
}

function scheduleUserReplyReview({ session, previousAiMessage, userMessage, userId }) {
  if (!userMessage?.id) {
    return;
  }

  runDetachedTask('User reply review', async () => {
    const userReviewResult = await analyzeUserReply({
      session,
      previousAiMessage,
      userMessage,
      userId
    });
    await updateMessageReview(userMessage.id, {
      isCorrect: userReviewResult.isCorrect,
      aiFeedback: userReviewResult.feedback
    });
  });
}

async function analyzeUserReply({ session, previousAiMessage, userMessage, userId }) {
  if (!userMessage?.english) {
    return { isCorrect: 1, feedback: null };
  }
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const learningLanguage = userSettings.learningLanguage || 'en';
  const learningDifficulty = userSettings.learningDifficulty || 'A1';
  const targetLanguage = getLearningLanguageMeta(learningLanguage);
  const nativeLanguage = getNativeLanguageMeta(userSettings.nativeLanguage || 'zh-CN');
  const promptVariables = session.scenario_id === WORDBOOK_SCENARIO_ID
    ? await buildWordbookPromptVariables(userId)
    : {};
  Object.assign(promptVariables, {
    PREVIOUS_AI_MESSAGE: previousAiMessage?.english || '',
    LEARNER_REPLY: userMessage.english || ''
  });
  const systemPrompt = await promptBuilder.buildSmartExplainPrompt({
    subFeatureCode: 'reply-review',
    flowCode: 'review',
    learningDifficulty,
    nativeLanguage: userSettings.nativeLanguage || 'zh-CN',
    learningLanguage,
    variables: promptVariables
  });

  const reviewInstruction = [
    'You are reviewing the learner reply in this exact roleplay situation.',
    'Only flag issues if they are meaningful: logic mismatch, context mismatch, obvious wording errors, wrong word choice, or grammar issues that make the sentence unnatural/confusing.',
    'Do not nitpick harmless style differences.',
    'Return compact JSON only with keys: hasIssues, summaryCn, encouragementCn, contextVerdictCn, logicVerdictCn, issues.',
    'issues must be an array. Each item should contain: type, title, detail, suggestion, betterExample.',
    `The learner is studying ${targetLanguage.englishName}.`,
    `All review text must be in ${nativeLanguage.englishName}, but betterExample should be in natural ${targetLanguage.englishName}.`,
    'If there are no meaningful issues, keep issues empty and hasIssues false.',
    'If there are issues, summaryCn should be specific instead of generic, and at least one of contextVerdictCn or logicVerdictCn should explain what went wrong.',
    previousAiMessage?.english ? `Previous AI message: ${previousAiMessage.english}` : 'Previous AI message: none',
    `Learner reply: ${userMessage.english}`
  ].join('\n');

  const reviewReply = await aiService.chatByFunction('smart-explain', [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: reviewInstruction }
  ], {
    response_format: { type: 'json_object' }
  });

  let parsed;
  try {
    parsed = JSON.parse(reviewReply.content);
  } catch {
    parsed = {};
  }

  const feedback = normalizeUserFeedbackPayload(parsed);
  return {
    isCorrect: feedback.hasIssues ? 0 : 1,
    feedback: feedback.hasIssues ? feedback : null
  };
}

async function generateAiMessageExplanation({ message, learningLanguage = 'en', learningDifficulty = 'A1', nativeLanguage = 'zh-CN' }) {
  const targetLanguage = getLearningLanguageMeta(learningLanguage);
  const nativeLanguageMeta = getNativeLanguageMeta(nativeLanguage);
  const systemPrompt = await promptBuilder.buildSmartExplainPrompt({
    subFeatureCode: 'message-explain',
    flowCode: 'explain',
    learningDifficulty,
    nativeLanguage,
    learningLanguage,
    variables: {
      AI_MESSAGE: message.english || '',
      AI_MESSAGE_TRANSLATION: message.chinese || ''
    }
  });

  const reply = await aiService.chatByFunction('smart-explain', [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Explain this ${targetLanguage.englishName} sentence for a ${nativeLanguageMeta.englishName} learner.` }
  ], {
    response_format: { type: 'json_object' }
  });

  let parsed;
  try {
    parsed = JSON.parse(reply.content);
  } catch {
    parsed = {};
  }

  return normalizeAiExplanationPayload(parsed);
}

async function buildFinalLevelTurnPayload({
  session,
  messages = [],
  latestUserMessage = null,
  previousAiMessage = null,
  userId,
  learningLanguage = 'en',
  learningDifficulty = 'A1',
  nativeLanguage = 'zh-CN'
}) {
  const { scenario, subTask } = await getScenarioContext(session.scenario_id, session.sub_task_id || '');
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const voiceSpeed = ttsService.normalizeVoiceSpeed(userSettings.voiceSpeed, 1.0);
  const targetLanguage = getLearningLanguageMeta(learningLanguage);
  const nativeLanguageMeta = getNativeLanguageMeta(nativeLanguage);
  const transcript = buildConversationTranscript(messages);
  const dialogFallback = buildLevelCompletionDialog({
    outcome: 'success',
    scenarioTitle: scenario?.title || scenario?.title_en || '',
    subTaskTitle: subTask?.title || ''
  });

  const judgeInstruction = [
    'You are deciding whether the learner has completed the current level-based roleplay goal.',
    'This is the final available AI reply in the session. Do not ask another follow-up question and do not leave the conversation open.',
    'Judge mainly from whether the learner meaningfully completed the current step goal inside the dialogue, not from perfect grammar.',
    'If the learner already achieved the current step goal, set outcome to "success".',
    'If the learner did not achieve the current step goal yet, set outcome to "failed".',
    `Write the final learner-facing reply in natural ${targetLanguage.englishName} inside the "english" field.`,
    `Write the explanation for the learner in ${nativeLanguageMeta.englishName} inside the "chinese" field.`,
    `Write dialogTitle and dialogMessage in ${nativeLanguageMeta.englishName}.`,
    'If outcome is success, the final reply should congratulate the learner and close the scene naturally.',
    'If outcome is failed, the final reply should clearly say the round ends here, sound regretful but encouraging, and include 1-2 concrete improvement suggestions.',
    'Do not invite another reply in this same session.',
    'Return compact JSON only with keys: outcome, english, chinese, dialogTitle, dialogMessage.',
    `The learner self-selected ${String(learningDifficulty || 'A1').toUpperCase()} as the current proficiency target.`,
    `Scenario title: ${scenario?.title_en || scenario?.title || 'Current level scene'}`,
    subTask?.title ? `Current step: ${subTask.title}` : 'Current step: none',
    subTask?.description ? `Step goal detail: ${subTask.description}` : 'Step goal detail: none',
    previousAiMessage?.english ? `Previous AI message: ${previousAiMessage.english}` : 'Previous AI message: none',
    latestUserMessage?.english ? `Latest learner reply: ${latestUserMessage.english}` : 'Latest learner reply: none',
    transcript ? `Full dialogue transcript:\n${transcript}` : 'Full dialogue transcript: none'
  ].join('\n');

  const finalReply = await aiService.chatByFunction('conversation', [
    { role: 'system', content: judgeInstruction }
  ], {
    response_format: { type: 'json_object' }
  });

  let parsed;
  try {
    parsed = JSON.parse(finalReply.content);
  } catch {
    parsed = {};
  }

  const normalizedPayload = normalizeFinalTurnDecisionPayload(parsed, learningLanguage, {
    scenarioTitle: scenario?.title || scenario?.title_en || '',
    subTaskTitle: subTask?.title || '',
    fallbackDialog: dialogFallback
  });

  let voiceUrl = null;
  try {
    const voiceResult = await ttsService.ensureTextToSpeech(normalizedPayload.english, {
      speed: voiceSpeed,
      scope: 'user',
      userId
    });
    voiceUrl = voiceResult.url;
  } catch (error) {
    console.warn('Final turn TTS generation failed:', error.message);
  }

  const messageResult = await exports.addMessage(session.id, {
    role: 'ai',
    english: normalizedPayload.english,
    chinese: normalizedPayload.chinese,
    voiceUrl,
    userHintIdea: '',
    userHintIdeaCn: '',
    userHintExample: '',
    userHintExampleCn: ''
  }, userId);

  return {
    messageId: messageResult.messageId,
    english: normalizedPayload.english,
    chinese: normalizedPayload.chinese,
    voiceUrl,
    userHintIdea: '',
    userHintIdeaCn: '',
    userHintExample: '',
    userHintExampleCn: '',
    completionOutcome: normalizedPayload.completionOutcome,
    completionDialogTitle: normalizedPayload.dialogTitle,
    completionDialogMessage: normalizedPayload.dialogMessage
  };
}

exports.regenerateHintExample = async (sessionId, { extraWish = '' } = {}, userId) => {
  const session = await assertOwnedSession(sessionId, userId);
  const messages = await exports.getMessages(sessionId, userId);
  const lastAiMessage = [...messages].reverse().find((item) => item.role === 'ai');
  if (!lastAiMessage) {
    const error = new Error('AI message not found');
    error.status = 404;
    throw error;
  }

  const currentHintExample = String(lastAiMessage.user_hint_example || lastAiMessage.user_hint || '').trim();
  const currentHintIdea = String(lastAiMessage.user_hint_idea || '').trim();
  const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user');

  const promptVariables = session.scenario_id === WORDBOOK_SCENARIO_ID
    ? await buildWordbookPromptVariables(userId)
    : {};
  Object.assign(promptVariables, {
    CURRENT_HINT_IDEA: currentHintIdea,
    CURRENT_HINT_EXAMPLE: currentHintExample
  });
  const hintPayload = await generateSmartHintPayload({
    session,
    latestAiReply: {
      english: lastAiMessage.english || '',
      chinese: lastAiMessage.chinese || ''
    },
    latestUserMessage,
    promptVariables,
    userId,
    extraWish
  });

  await updateMessageHints(lastAiMessage.id, hintPayload);

  return {
    messageId: lastAiMessage.id,
    ...hintPayload
  };
};

exports.ensureMessageVoice = async (sessionId, messageId, options = {}, userId) => {
  await assertOwnedSession(sessionId, userId);

  const message = await knex('conversation_messages').where({ id: messageId, session_id: sessionId, del: 0 }).first();

  if (!message) throw new Error('Message not found');
  if (!message.english) throw new Error('Message text is empty');
  if (message.role !== 'ai') throw new Error('Voice is only available for AI messages');

  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const resolvedSpeed = ttsService.normalizeVoiceSpeed(
    options.speed === undefined ? userSettings.voiceSpeed : options.speed,
    1.0
  );

  if (message.voice_url && ttsService.isVoiceFileAvailable(message.voice_url)) {
    const currentVoiceAsset = await ttsService.getVoiceAssetByUrl(message.voice_url);
    if (!currentVoiceAsset || Number(currentVoiceAsset.speed) === resolvedSpeed) {
      return {
        messageId: message.id,
        voiceUrl: message.voice_url,
        status: 'ready',
        fromCache: true
      };
    }
  }

  const voiceResult = await ttsService.ensureTextToSpeech(message.english, {
    ...options,
    speed: resolvedSpeed,
    scope: 'user',
    userId
  });
  await updateMessageVoice(message.id, voiceResult.url);

  return {
    messageId: message.id,
    voiceUrl: voiceResult.url,
    status: voiceResult.status,
    fromCache: voiceResult.fromCache
  };
};

exports.generateAiResponse = async (sessionId, userInput, userId) => {
  const session = await assertOwnedSession(sessionId, userId);
  const isInfiniteScenario = isInfiniteScenarioContext(session.scenario_id, session.sub_task_id);
  const smartExplainEnabled = await isSmartExplainEnabled(userId);
  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const learningLanguage = userSettings.learningLanguage || 'en';
  const learningDifficulty = userSettings.learningDifficulty || 'A1';
  const nativeLanguage = userSettings.nativeLanguage || 'zh-CN';
  if (session.status === 'completed' && !isInfiniteScenario) {
    return buildCompletionReply(session, learningLanguage);
  }
  if (!isInfiniteScenario && session.current_turn >= session.max_turns) {
    const completed = await exports.completeSession(sessionId, userId);
    return buildCompletionReply({
      ...session,
      status: completed.status,
      current_turn: session.current_turn,
      max_turns: session.max_turns
    }, learningLanguage);
  }

  const messages = await exports.getMessages(sessionId, userId);
  const latestUserMessage = [...messages].reverse().find((item) => item.role === 'user');
  const previousAiMessage = [...messages].reverse().find((item) => item.role === 'ai');
  const promptMessages = isInfiniteScenario
    ? messages.slice(-getPromptHistoryWindowSize(session))
    : messages;
  const { scenario, isThemeFreeMode } = await getScenarioContext(session.scenario_id, session.sub_task_id || '');
  const isLevelScenario = String(scenario?.scene_type || scenario?.sceneType || 'level') === 'level';
  const isFinalLevelReply = !isInfiniteScenario
    && !isThemeFreeMode
    && isLevelScenario
    && (Number(session.current_turn || 0) + 1 >= Number(session.max_turns || 0));
  if (latestUserMessage && smartExplainEnabled) {
    scheduleUserReplyReview({
      session,
      previousAiMessage,
      userMessage: latestUserMessage,
      userId
    });
  }
  if (isFinalLevelReply) {
    const finalPayload = await buildFinalLevelTurnPayload({
      session,
      messages,
      latestUserMessage,
      previousAiMessage,
      userId,
      learningLanguage,
      learningDifficulty,
      nativeLanguage
    });
    const completed = await exports.completeSession(sessionId, userId, {
      completionOutcome: finalPayload.completionOutcome
    });
    const updatedSession = await exports.getSession(sessionId, userId);

    return {
      ...finalPayload,
      userFeedbackMessageId: latestUserMessage?.id || null,
      userFeedback: null,
      asyncReviewPending: Boolean(latestUserMessage && smartExplainEnabled),
      asyncHintPending: false,
      currentTurn: updatedSession.current_turn,
      maxTurns: updatedSession.max_turns,
      isComplete: true,
      completedNotice: true,
      status: completed.status
    };
  }

  const aiPayload = await buildAiMessagePayload({
    session,
    promptMessages,
    userInput,
    userId,
    includeHintsSync: false
  });

  // Check if session is complete
  const updatedSession = await exports.getSession(sessionId, userId);
  const isNowComplete = !isInfiniteScenario && updatedSession.current_turn >= updatedSession.max_turns;
  if (isNowComplete) {
    await exports.completeSession(sessionId, userId);
  }

  return {
    ...aiPayload,
    userFeedbackMessageId: latestUserMessage?.id || null,
    userFeedback: null,
    asyncReviewPending: Boolean(latestUserMessage && smartExplainEnabled),
    asyncHintPending: true,
    currentTurn: updatedSession.current_turn,
    maxTurns: updatedSession.max_turns,
    isComplete: isNowComplete,
    completionOutcome: isNowComplete ? normalizeCompletionOutcome(updatedSession.completion_outcome, 'success') : '',
    completedNotice: false
  };
};

exports.getMessageExplanation = async (sessionId, messageId, userId) => {
  await assertOwnedSession(sessionId, userId);
  if (!(await isSmartExplainEnabled(userId))) {
    const error = new Error('Smart explanation is disabled');
    error.status = 403;
    throw error;
  }

  const message = await knex('conversation_messages')
    .where({ id: messageId, session_id: sessionId, del: 0 })
    .first();

  if (!message) throw new Error('Message not found');
  if (message.role !== 'ai') throw new Error('Only AI messages support explanation');

  if (message.ai_explanation) {
    try {
      return {
        messageId: message.id,
        fromCache: true,
        explanation: JSON.parse(message.ai_explanation)
      };
    } catch {}
  }

  const settingsService = require('./settings.service');
  const userSettings = await settingsService.getSettings(userId);
  const explanation = await generateAiMessageExplanation({
    message,
    learningLanguage: userSettings.learningLanguage || 'en',
    learningDifficulty: userSettings.learningDifficulty || 'A1',
    nativeLanguage: userSettings.nativeLanguage || 'zh-CN'
  });
  await updateMessageReview(message.id, { aiExplanation: explanation });

  return {
    messageId: message.id,
    fromCache: false,
    explanation
  };
};

exports.ensureOpeningMessage = async (sessionId, userId) => {
  const session = await assertOwnedSession(sessionId, userId);
  const messages = await exports.getMessages(sessionId, userId);
  if (messages.length > 0) {
    return null;
  }

  const { scenario, subTask, isThemeFreeMode } = await getScenarioContext(session.scenario_id, session.sub_task_id || '');
  const openerPayload = await buildAiMessagePayload({
    session,
    promptMessages: [],
    userInput: buildOpeningInstruction(scenario, subTask, { isThemeFreeMode }),
    userId,
    userInputType: 'opening'
  });
  const updatedSession = await exports.getSession(sessionId, userId);

  return {
    ...openerPayload,
    currentTurn: updatedSession.current_turn,
    maxTurns: updatedSession.max_turns,
    isComplete: false,
    completedNotice: false,
    opener: true
  };
};

exports.completeSession = async (sessionId, userId, options = {}) => {
  await ensureConversationSessionSchema();
  const session = userId
    ? await assertOwnedSession(sessionId, userId)
    : await getOwnedSession(sessionId);

  if (!session && !userId) {
    return { id: sessionId, status: 'completed' };
  }

  const completionOutcome = normalizeCompletionOutcome(options.completionOutcome, session?.completion_outcome || 'success');
  await knex('conversation_sessions')
    .update({ status: 'completed', completed_at: knex.fn.now(), completion_outcome: completionOutcome })
    .where({ id: sessionId, del: 0 });

  return { id: sessionId, status: 'completed', completionOutcome };
};

exports.rollbackToMessage = async (sessionId, messageId, userId) => {
  await ensureConversationSessionSchema();
  const session = await assertOwnedSession(sessionId, userId);
  const targetMessage = await knex('conversation_messages')
    .where({ id: messageId, session_id: sessionId, del: 0 })
    .first();

  if (!targetMessage) {
    const error = new Error('Message not found');
    error.status = 404;
    throw error;
  }

  if (targetMessage.role !== 'ai') {
    const error = new Error('Rollback target must be an AI message');
    error.status = 400;
    throw error;
  }

  const deletedMessageCount = await knex.transaction(async (trx) => {
    const deletedCount = await trx('conversation_messages')
      .where({ session_id: sessionId, del: 0 })
      .andWhere('turn_number', '>', Number(targetMessage.turn_number || 0))
      .update({ del: 1, deleted_at: knex.fn.now() });

    const remainingAiCountRow = await trx('conversation_messages')
      .where({ session_id: sessionId, role: 'ai', del: 0 })
      .andWhere('turn_number', '<=', Number(targetMessage.turn_number || 0))
      .andWhereNot('user_input_type', 'opening')
      .count('* as count')
      .first();

    const remainingAiCount = Number(remainingAiCountRow?.count || 0);
    await trx('conversation_sessions')
      .where({ id: sessionId, user_id: userId, del: 0 })
      .update({
        status: 'active',
        current_turn: remainingAiCount,
        completed_at: null,
        completion_outcome: 'success'
      });

    return Number(deletedCount || 0);
  });

  return {
    id: session.id,
    status: 'active',
    currentTurn: await knex('conversation_messages')
      .where({ session_id: sessionId, role: 'ai', del: 0 })
      .andWhereNot('user_input_type', 'opening')
      .count('* as count')
      .first()
      .then((row) => Number(row?.count || 0)),
    maxTurns: session.max_turns,
    rollbackToMessageId: targetMessage.id,
    deletedMessageCount
  };
};

exports.softDeleteSession = async (sessionId, userId) => {
  const session = await assertOwnedSession(sessionId, userId);

  await knex('conversation_messages')
    .update({ del: 1, deleted_at: knex.fn.now() })
    .where({ session_id: sessionId, del: 0 });

  await knex('conversation_sessions')
    .update({ del: 1, deleted_at: knex.fn.now(), status: 'deleted' })
    .where({ id: sessionId, user_id: userId, del: 0 });

  return {
    id: sessionId,
    scenarioId: session.scenario_id,
    status: 'deleted'
  };
};

exports.restartSession = async ({ sessionId, scenarioId, subTaskId = null, userId }) => {
  let nextScenarioId = scenarioId;
  let nextSubTaskId = subTaskId;
  let nextMaxTurns = DEFAULT_MAX_TURNS;

  if (sessionId) {
    const session = await assertOwnedSession(sessionId, userId);
    nextScenarioId = session.scenario_id;
    nextSubTaskId = subTaskId || session.sub_task_id || null;
    nextMaxTurns = session.max_turns;
    await exports.softDeleteSession(sessionId, userId);
  }

  if (!nextScenarioId) {
    const error = new Error('Scenario is required');
    error.status = 400;
    throw error;
  }

  return await exports.createSession({
    scenarioId: nextScenarioId,
    subTaskId: nextSubTaskId,
    userId,
    maxTurns: nextMaxTurns
  });
};

exports.getSessionResult = async (sessionId, userId) => {
  const session = await assertOwnedSession(sessionId, userId);
  const messages = await exports.getMessages(sessionId, userId);
  const aiMessages = messages.filter((m) => m.role === 'ai');
  const userMessages = messages.filter((m) => m.role === 'user');
  const words = await knex('word_bookmarks')
    .distinct('word', 'phonetic', 'definition_cn')
    .where({ source_scenario_id: session.scenario_id })
    .andWhereNot('status', 'deleted');

  return {
    session,
    stats: {
      totalMessages: messages.length,
      userMessages: userMessages.length,
      aiMessages: aiMessages.length,
      wordsLearned: words.length
    },
    words
  };
};
