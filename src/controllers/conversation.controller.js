const conversationService = require('../services/conversation.service');

exports.createSession = async (ctx) => {
  const session = await conversationService.createSession({
    ...(ctx.request.body || {}),
    userId: ctx.state.user.id
  });
  ctx.body = { success: true, data: session };
};

exports.getLatestSession = async (ctx) => {
  const { scenarioId } = ctx.query;
  if (!scenarioId) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'scenarioId is required' };
    return;
  }

  const session = await conversationService.getLatestSessionByScenario(scenarioId, ctx.state.user.id);
  ctx.body = { success: true, data: session || null };
};

exports.getSession = async (ctx) => {
  const session = await conversationService.getSession(ctx.params.id, ctx.state.user.id);
  if (!session) {
    ctx.status = 404;
    ctx.body = { success: false, message: 'Session not found' };
    return;
  }
  ctx.body = { success: true, data: session };
};

exports.addMessage = async (ctx) => {
  const result = await conversationService.addMessage(ctx.params.id, ctx.request.body || {}, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.getMessages = async (ctx) => {
  const messages = await conversationService.getMessages(ctx.params.id, ctx.state.user.id);
  ctx.body = { success: true, data: messages };
};

exports.ensureOpeningMessage = async (ctx) => {
  const result = await conversationService.ensureOpeningMessage(ctx.params.id, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.ensureMessageVoice = async (ctx) => {
  const result = await conversationService.ensureMessageVoice(
    ctx.params.id,
    ctx.params.messageId,
    ctx.request.body || {},
    ctx.state.user.id
  );
  ctx.body = { success: true, data: result };
};

exports.regenerateHintExample = async (ctx) => {
  const result = await conversationService.regenerateHintExample(ctx.params.id, ctx.request.body || {}, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.getMessageExplanation = async (ctx) => {
  const result = await conversationService.getMessageExplanation(ctx.params.id, ctx.params.messageId, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.rollbackToMessage = async (ctx) => {
  const result = await conversationService.rollbackToMessage(ctx.params.id, ctx.params.messageId, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.sendMessage = async (ctx) => {
  const { message } = ctx.request.body || {};
  if (!message) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'Message is required' };
    return;
  }
  const result = await conversationService.generateAiResponse(ctx.params.id, message, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.completeSession = async (ctx) => {
  const result = await conversationService.completeSession(ctx.params.id, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.restartSession = async (ctx) => {
  const result = await conversationService.restartSession({
    sessionId: ctx.params.id || null,
    scenarioId: ctx.request.body?.scenarioId || ctx.query?.scenarioId || null,
    subTaskId: ctx.request.body?.subTaskId || ctx.query?.subTaskId || null,
    userId: ctx.state.user.id
  });
  ctx.body = { success: true, data: result };
};

exports.getResult = async (ctx) => {
  const result = await conversationService.getSessionResult(ctx.params.id, ctx.state.user.id);
  ctx.body = { success: true, data: result };
};
