const { logger, summarizeValue } = require('./logger');

async function errorHandler(ctx, next) {
  try {
    await next();
  } catch (err) {
    logger.error('Error:', {
      requestId: ctx.state.requestId || null,
      message: err.message,
      stack: err.stack,
      path: ctx.path,
      method: ctx.method,
      userId: ctx.state.user?.id || null,
      body: summarizeValue(ctx.request?.body || {})
    });

    ctx.status = err.status || 500;
    ctx.body = {
      success: false,
      error: err.message || 'Internal server error'
    };
  }
}

module.exports = errorHandler;
