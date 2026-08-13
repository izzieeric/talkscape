const settingsService = require('../services/settings.service');

exports.get = async (ctx) => {
  const settings = await settingsService.getSettings(ctx.state.user.id);
  ctx.body = { success: true, data: settings };
};

exports.update = async (ctx) => {
  const settings = await settingsService.updateSettings(ctx.state.user.id, ctx.request.body);
  ctx.body = { success: true, data: settings };
};
