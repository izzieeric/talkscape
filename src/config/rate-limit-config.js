module.exports = {
  enabled: true,
  storage: {
    type: 'file',
    fileName: 'rate-limit-cache.json',
    flushIntervalMs: 800,
    gcIntervalMs: 30000,
    retentionMs: 5 * 60 * 1000
  },
  defaults: {
    statusCode: 429,
    error: 'RATE_LIMITED',
    message: '请求过于频繁，请稍后再试'
  },
  global: {
    enabled: true,
    key: 'global-client-api',
    windowMs: 1000,
    max: 10,
    message: '请求过于频繁，请稍后再试'
  },
  routes: {
    conversationSend: {
      enabled: true,
      key: 'conversation-send',
      windowMs: 1000,
      max: 1,
      message: '发送对话过于频繁，请稍后再试'
    },
    messageExplanation: {
      enabled: true,
      key: 'message-explanation',
      windowMs: 1000,
      max: 1,
      message: '智能讲解请求过于频繁，请稍后再试'
    }
  }
};
