const adminService = require('../../services/admin.service');
const { verifyToken } = require('../../utils/auth');
const { HTTP_BASE_PATH, TSADMIN_BASE_PATH } = require('../../config/http-paths');

const ADMIN_COOKIE_NAME = 'tsadmin_token';

function getAdminToken(ctx) {
  return ctx.cookies.get(ADMIN_COOKIE_NAME) || '';
}

async function attachAdminUser(ctx, next) {
  ctx.state.adminUser = null;
  ctx.state.admin = null;

  try {
    const token = getAdminToken(ctx);
    if (token) {
      const payload = verifyToken(token);
      if (payload.scope === 'tsadmin') {
        const context = await adminService.getAdminAuthContext(payload.sub);
        const tokenVersion = Number(payload.tokenVersion || 1);
        if (context && context.admin.tokenVersion === tokenVersion) {
          ctx.state.adminUser = context.admin;
          ctx.state.admin = context.admin;
        }
      }
    }
  } catch (_error) {
    ctx.state.adminUser = null;
    ctx.state.admin = null;
  }

  await next();
}

async function requireAdminPageAuth(ctx, next) {
  if (ctx.state.adminUser && ctx.state.admin) {
    await next();
    return;
  }

  const redirect = encodeURIComponent(ctx.originalUrl || TSADMIN_BASE_PATH);
  ctx.redirect(`${TSADMIN_BASE_PATH}/login?redirect=${redirect}`);
}

function setAdminCookie(ctx, token) {
  ctx.cookies.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: HTTP_BASE_PATH
  });
}

function clearAdminCookie(ctx) {
  ctx.cookies.set(ADMIN_COOKIE_NAME, null, {
    httpOnly: true,
    sameSite: 'lax',
    path: HTTP_BASE_PATH
  });
}

module.exports = {
  ADMIN_COOKIE_NAME,
  attachAdminUser,
  clearAdminCookie,
  getAdminToken,
  requireAdminPageAuth,
  setAdminCookie
};
