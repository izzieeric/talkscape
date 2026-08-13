/**
 * AI 服务 — 聊天 & 单词解释
 * 底层调用统一 AI 客户端 (ai-client.js)，可无缝切换 AI 平台。
 */
const aiClient = require('./ai-client');

async function chat(messages, options = {}) {
  return aiClient.chat(messages, options);
}

async function chatByFunction(functionCode, messages, options = {}) {
  return aiClient.chat(messages, {
    ...options,
    functionCode
  });
}

async function generateWordExplanation(word, context, options = {}) {
  return aiClient.generateWordExplanation(word, context, {
    ...options,
    functionCode: options.functionCode || 'word-card'
  });
}

module.exports = {
  chat,
  chatByFunction,
  generateWordExplanation
};
