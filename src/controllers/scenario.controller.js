const scenarioService = require('../services/scenario.service');

exports.getAll = async (ctx) => {
  const scenarios = await scenarioService.getAllScenarios();
  ctx.body = { success: true, data: scenarios };
};

exports.getById = async (ctx) => {
  const scenario = await scenarioService.getScenarioById(ctx.params.id);
  ctx.body = { success: true, data: scenario };
};

exports.getConfig = async (ctx) => {
  const config = await scenarioService.getScenarioConfig(ctx.params.id);
  ctx.body = { success: true, data: config };
};

exports.getPromptConfig = async (ctx) => {
  const data = await scenarioService.getScenarioPromptBundle(ctx.params.id, ctx.query?.subTaskId || '');
  ctx.body = { success: true, data };
};

exports.savePromptConfig = async (ctx) => {
  const data = await scenarioService.saveScenarioPromptConfig(ctx.params.id, {
    subTaskId: ctx.request.body?.subTaskId || '',
    promptId: ctx.request.body?.promptId || '',
    promptIds: Array.isArray(ctx.request.body?.promptIds) ? ctx.request.body?.promptIds : []
  });
  ctx.body = { success: true, data };
};

exports.getMine = async (ctx) => {
  const scenarios = await scenarioService.getUserScenarios(ctx.state.user.id);
  ctx.body = { success: true, data: scenarios };
};

exports.getProgress = async (ctx) => {
  const progress = await scenarioService.getUserScenarioProgress(ctx.state.user.id);
  ctx.body = { success: true, data: progress };
};

exports.addMine = async (ctx) => {
  const scenario = await scenarioService.addUserScenario(ctx.state.user.id, ctx.request.body?.scenarioId);
  ctx.body = { success: true, data: scenario };
};

exports.removeMine = async (ctx) => {
  const result = await scenarioService.removeUserScenario(ctx.state.user.id, ctx.params.scenarioId);
  ctx.body = { success: true, data: result };
};
