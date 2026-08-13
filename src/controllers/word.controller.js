const wordService = require('../services/word.service');
const settingsService = require('../services/settings.service');

exports.getDetail = async (ctx) => {
  const { word, context, scenarioId, subScenarioId } = ctx.query;
  const userId = ctx.state.user?.id || 'default';
  const userSettings = await settingsService.getSettings(userId);
  const detail = await wordService.getWordDetail(word, context, {
    learningLanguage: userSettings.learningLanguage || 'en',
    learningDifficulty: userSettings.learningDifficulty || 'A1',
    nativeLanguage: userSettings.nativeLanguage || 'zh-CN',
    scenarioId: scenarioId || '',
    subScenarioId: subScenarioId || ''
  });
  ctx.body = { success: true, data: detail };
};

exports.logClick = async (ctx) => {
  await wordService.logWordClick({
    ...(ctx.request.body || {}),
    userId: ctx.state.user.id
  });
  ctx.body = { success: true };
};
