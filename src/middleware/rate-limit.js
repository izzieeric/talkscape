const rateLimitConfig = require('../config/rate-limit-config');
const { getRateLimitStore } = require('../services/rate-limit-store');
const { logger } = require('./logger');

function resolveRule(rule = {}) {
  return {
    ...rateLimitConfig.defaults,
    ...rule
  };
}

function createUserRateLimit(rule = {}) {
  const resolvedRule = resolveRule(rule);

  return async function userRateLimit(ctx, next) {
    if (!rateLimitConfig.enabled || !resolvedRule.enabled) {
      await next();
      return;
    }

    const userId = ctx.state.user?.id;
    if (!userId) {
      await next();
      return;
    }

    const store = getRateLimitStore();
    const scope = String(resolvedRule.key || `${ctx.method}:${ctx.path}`);
    const result = store.consume({
      scope,
      userId,
      windowMs: resolvedRule.windowMs,
      max: resolvedRule.max
    });

    ctx.set('X-RateLimit-Limit', String(resolvedRule.max || 0));
    ctx.set('X-RateLimit-Remaining', String(result.remaining || 0));
    ctx.set('X-RateLimit-Reset', String(result.resetAt || Date.now()));

    if (!result.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((result.retryAfterMs || 0) / 1000));
      ctx.set('Retry-After', String(retryAfterSeconds));
      ctx.status = Number(resolvedRule.statusCode || 429);
      ctx.body = {
        success: false,
        error: resolvedRule.error || 'RATE_LIMITED',
        message: resolvedRule.message || '请求过于频繁，请稍后再试',
        data: {
          scope,
          limit: Number(resolvedRule.max || 0),
          windowMs: Number(resolvedRule.windowMs || 0),
          retryAfterMs: Number(result.retryAfterMs || 0)
        }
      };

      logger.warn(`[RATE_LIMIT][${ctx.state.requestId || '000000'}] ${ctx.method} ${ctx.path} blocked`, {
        userId,
        scope,
        limit: Number(resolvedRule.max || 0),
        windowMs: Number(resolvedRule.windowMs || 0),
        retryAfterMs: Number(result.retryAfterMs || 0)
      });
      return;
    }

    await next();
  };
}

const globalUserRateLimit = createUserRateLimit(rateLimitConfig.global || {});

module.exports = {
  createUserRateLimit,
  globalUserRateLimit
};
