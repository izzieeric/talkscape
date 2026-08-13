const authService = require('../services/auth.service');

exports.register = async (ctx) => {
  const result = await authService.register(ctx.request.body || {});
  ctx.body = { success: true, data: result };
};

exports.login = async (ctx) => {
  const result = await authService.login(ctx.request.body || {});
  ctx.body = { success: true, data: result };
};

exports.me = async (ctx) => {
  const result = await authService.getAuthUser(ctx.state.user.id);
  ctx.body = { success: true, data: result };
};
