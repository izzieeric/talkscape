const userService = require('../services/user.service');

exports.getMe = async (ctx) => {
  const data = await userService.getProfileSummary(ctx.state.user.id);
  ctx.body = { success: true, data };
};

exports.updateMe = async (ctx) => {
  const data = await userService.updateProfile(ctx.state.user.id, ctx.request.body || {});
  ctx.body = { success: true, data };
};

exports.getHistory = async (ctx) => {
  const limit = Number(ctx.query.limit || 20);
  const data = await userService.getHistory(ctx.state.user.id, limit);
  ctx.body = { success: true, data };
};
