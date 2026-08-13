const backendLogConfig = {
  // 日志级别：debug / info / warn / error
  level: 'info',

  // 客户端请求日志
  clientApi: {
    request: {
      // 是否打印客户端请求入口日志
      enabled: true,
      // 是否打印请求体
      includeBody: false,
      // 是否打印请求头（敏感字段会脱敏）
      includeHeaders: false
    },
    response: {
      // 是否打印客户端响应出口日志
      enabled: true,
      // 是否打印响应体
      includeBody: false
    }
  },

  // 第三方接口日志，例如 OpenAI / TTS / STT 等
  thirdParty: {
    // 是否打印第三方请求日志
    requestEnabled: true,
    // 是否打印第三方响应日志
    responseEnabled: true,
    // 是否打印第三方错误日志
    errorEnabled: true,
    // 是否附带 payload 摘要/完整数据
    includePayload: false,
    // 是否打印更详细的数据内容
    detailed: false,
    // 超长内容是否分段打印
    segmented: false,
    // 分段打印时每段最大字符数
    segmentSize: 4000
  },

  // 提示词组装流日志
  promptFlow: {
    // 是否打印提示词组装流程
    enabled: false,
    // 是否打印变量表
    includeVariables: false,
    // 是否打印最终完整 prompt
    includeFinalPrompt: false,
    // 是否对超长内容分段打印
    segmented: true,
    // 分段打印时每段最大字符数
    segmentSize: 4000
  }
};

module.exports = backendLogConfig;
