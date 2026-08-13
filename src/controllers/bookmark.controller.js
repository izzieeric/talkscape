const bookmarkService = require('../services/bookmark.service');

exports.getAll = async (ctx) => {
  const includePracticed = ['1', 'true', 'yes'].includes(String(ctx.query.includePracticed || '').toLowerCase());
  const wordbookEligible = ['1', 'true', 'yes'].includes(String(ctx.query.wordbookEligible || '').toLowerCase());
  const bookmarks = wordbookEligible
    ? await bookmarkService.getWordbookBookmarks(ctx.state.user.id)
    : await bookmarkService.getAllBookmarks(ctx.state.user.id, { includePracticed });
  ctx.body = { success: true, data: bookmarks };
};

exports.add = async (ctx) => {
  const bookmark = await bookmarkService.addBookmark({
    ...(ctx.request.body || {}),
    userId: ctx.state.user.id
  });
  ctx.body = { success: true, data: bookmark };
};

exports.remove = async (ctx) => {
  await bookmarkService.removeBookmark(ctx.params.word, ctx.state.user.id);
  ctx.body = { success: true };
};

exports.markPracticed = async (ctx) => {
  const bookmark = await bookmarkService.markPracticed(ctx.params.word, ctx.state.user.id);
  ctx.body = { success: true, data: bookmark };
};

exports.recordWordbookSuccesses = async (ctx) => {
  const result = await bookmarkService.recordWordbookSuccesses(ctx.request.body?.words || [], ctx.state.user.id);
  ctx.body = { success: true, data: result };
};

exports.reactivate = async (ctx) => {
  const bookmark = await bookmarkService.reactivateBookmark(ctx.params.word, ctx.state.user.id);
  ctx.body = { success: true, data: bookmark };
};

exports.check = async (ctx) => {
  const exists = await bookmarkService.checkBookmark(ctx.params.word, ctx.state.user.id);
  ctx.body = { success: true, data: { exists } };
};
