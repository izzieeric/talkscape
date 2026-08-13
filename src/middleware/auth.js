const userService = require('../services/user.service');
const { verifyToken } = require('../utils/auth');

function getTokenFromHeader(ctx) {
  const header = ctx.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

async function getAuthorizedUser(ctx) {
  const token = getTokenFromHeader(ctx);
  if (!token) return null;

  const payload = verifyToken(token);
  if (payload.scope && payload.scope !== 'user') {
    return null;
  }

  const user = await userService.getUserById(payload.sub);
  if (!user) {
    return null;
  }

  return userService.sanitizeUser(user);
}

async function requireAuth(ctx, next) {
  if (ctx.state.user) {
    await next();
    return;
  }

  let user = null;
  try {
    user = await getAuthorizedUser(ctx);
  } catch (_error) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'Unauthorized' };
    return;
  }

  if (!user) {
    ctx.status = 401;
    ctx.body = { success: false, error: 'Unauthorized' };
    return;
  }

  ctx.state.user = user;
  await next();
}

async function attachUser(ctx, next) {
  try {
    ctx.state.user = await getAuthorizedUser(ctx);
  } catch (_error) {
    ctx.state.user = null;
  }
  await next();
}

module.exports = {
  requireAuth,
  attachUser
};
