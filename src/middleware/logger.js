const winston = require('winston');
const logConfig = require('../config/log-config');

function redactHeaders(headers = {}) {
  return Object.entries(headers || {}).reduce((acc, [key, value]) => {
    const lowerKey = String(key || '').toLowerCase();
    if (['authorization', 'cookie', 'set-cookie', 'x-api-key'].includes(lowerKey)) {
      acc[key] = '[redacted]';
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

function summarizeValue(value, options = {}) {
  const { maxStringLength = 300, maxArrayItems = 10, depth = 0, maxDepth = 2 } = options;
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}...(${value.length})` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= maxDepth) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayItems).map((item) => summarizeValue(item, { ...options, depth: depth + 1 }));
  }

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    const lowerKey = String(key || '').toLowerCase();
    if (['password', 'token', 'authorization', 'cookie', 'apikey', 'api_key'].includes(lowerKey)) {
      acc[key] = '[redacted]';
      return acc;
    }
    acc[key] = summarizeValue(nestedValue, { ...options, depth: depth + 1 });
    return acc;
  }, {});
}

function cloneForLog(value, options = {}) {
  const { depth = 0, maxDepth = 12 } = options;
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return value;
  if (depth >= maxDepth) return '[max-depth]';
  if (Array.isArray(value)) {
    return value.map((item) => cloneForLog(item, { ...options, depth: depth + 1 }));
  }

  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    const lowerKey = String(key || '').toLowerCase();
    if (['password', 'token', 'authorization', 'cookie', 'apikey', 'api_key'].includes(lowerKey)) {
      acc[key] = '[redacted]';
      return acc;
    }
    acc[key] = cloneForLog(nestedValue, { ...options, depth: depth + 1 });
    return acc;
  }, {});
}

const consoleFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const serializedMeta = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${message}${serializedMeta}`;
});

const logger = winston.createLogger({
  level: logConfig.level,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.colorize({ all: true }),
        consoleFormat
      )
    })
  ]
});

function createRequestId() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function normalizeRequestId(value) {
  const normalized = String(value || '').trim();
  return /^\d{6}$/.test(normalized) ? normalized : createRequestId();
}

function logLine(level, line, meta) {
  if (meta && Object.keys(meta).length) {
    logger[level](line, meta);
    return;
  }
  logger[level](line);
}

function shouldIncludeThirdPartyDetails() {
  return Boolean(logConfig.thirdParty.includePayload || logConfig.thirdParty.detailed);
}

function getThirdPartySegmentSize() {
  const size = Number(logConfig.thirdParty?.segmentSize || 4000);
  return Number.isFinite(size) && size > 0 ? size : 4000;
}

function getPromptFlowSegmentSize() {
  const size = Number(logConfig.promptFlow?.segmentSize || 4000);
  return Number.isFinite(size) && size > 0 ? size : 4000;
}

function serializeLogValue(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(cloneForLog(value), null, 2);
}

function emitDetailedLog(level, linePrefix, value) {
  if (value === undefined) return;
  const serialized = serializeLogValue(value);
  if (!serialized) return;

  if (!logConfig.thirdParty?.segmented) {
    logger[level](`${linePrefix}\n${serialized}`);
    return;
  }

  const segmentSize = getThirdPartySegmentSize();
  const total = Math.max(1, Math.ceil(serialized.length / segmentSize));
  for (let index = 0; index < total; index += 1) {
    const start = index * segmentSize;
    const chunk = serialized.slice(start, start + segmentSize);
    logger[level](`${linePrefix} [part ${index + 1}/${total}]\n${chunk}`);
  }
}

function emitSegmentedText(level, linePrefix, text, options = {}) {
  const serialized = typeof text === 'string' ? text : serializeLogValue(text);
  if (!serialized) return;

  if (!options.segmented) {
    logger[level](`${linePrefix}\n${serialized}`);
    return;
  }

  const segmentSize = Number(options.segmentSize || 4000);
  const total = Math.max(1, Math.ceil(serialized.length / segmentSize));
  for (let index = 0; index < total; index += 1) {
    const start = index * segmentSize;
    const chunk = serialized.slice(start, start + segmentSize);
    logger[level](`${linePrefix} [part ${index + 1}/${total}]\n${chunk}`);
  }
}

function formatPromptFlowHeader(meta = {}) {
  const parts = [
    meta.feature ? `feature=${meta.feature}` : '',
    meta.subFeatureCode ? `subFeature=${meta.subFeatureCode}` : '',
    meta.flowCode ? `flow=${meta.flowCode}` : '',
    meta.scenarioId ? `scenario=${meta.scenarioId}` : '',
    meta.subScenarioId ? `subScenario=${meta.subScenarioId}` : ''
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(' | ')}` : '';
}

function logPromptAssembly(meta = {}) {
  if (!logConfig.promptFlow?.enabled) return;

  const requestId = normalizeRequestId(meta.requestId);
  const headerSuffix = formatPromptFlowHeader(meta);
  const layers = Array.isArray(meta.layers) ? meta.layers : [];
  logger.info(`[PROMPT:FLOW][${requestId}] start${headerSuffix}`);

  if (logConfig.promptFlow?.includeVariables && meta.variables) {
    emitSegmentedText(
      'info',
      `[PROMPT:FLOW:VARIABLES][${requestId}]`,
      JSON.stringify(cloneForLog(meta.variables), null, 2),
      {
        segmented: Boolean(logConfig.promptFlow?.segmented),
        segmentSize: getPromptFlowSegmentSize()
      }
    );
  }

  if (!layers.length) {
    logger.info(`[PROMPT:FLOW][${requestId}] no active layers matched`);
  }

  layers.forEach((layer, index) => {
    const summary = [
      `#${index + 1}`,
      layer.layerCode || '',
      layer.promptCode || '',
      layer.promptTitle || ''
    ].filter(Boolean).join(' | ');

    const detailLines = [
      `layer: ${layer.layerCode || ''}`,
      `title: ${layer.promptTitle || ''}`,
      `promptCode: ${layer.promptCode || ''}`,
      `source: ${layer.source || ''}`,
      `sourceKey: ${layer.sourceKey || ''}`,
      `feature: ${layer.feature || ''}`,
      `subFeature: ${layer.subFeatureCode || ''}`,
      `flow: ${layer.flowCode || ''}`,
      `target: ${layer.targetId || ''}`,
      '',
      String(layer.content || '')
    ].join('\n');

    emitSegmentedText(
      'info',
      `[PROMPT:FLOW:LAYER][${requestId}] ${summary}`,
      detailLines,
      {
        segmented: Boolean(logConfig.promptFlow?.segmented),
        segmentSize: getPromptFlowSegmentSize()
      }
    );
  });

  if (logConfig.promptFlow?.includeFinalPrompt && meta.content) {
    emitSegmentedText(
      'info',
      `[PROMPT:FLOW:FINAL][${requestId}] complete`,
      String(meta.content || ''),
      {
        segmented: Boolean(logConfig.promptFlow?.segmented),
        segmentSize: getPromptFlowSegmentSize()
      }
    );
  }
}

function logThirdPartyRequest(meta = {}) {
  if (!logConfig.thirdParty.requestEnabled) return;
  const requestId = normalizeRequestId(meta.requestId);
  const line = `[3P:REQ][${requestId}] ${meta.method || ''} ${meta.provider || 'unknown'} ${meta.functionCode || meta.capability || ''}`.trim();
  const payload = {
    requestId,
    provider: meta.provider || '',
    capability: meta.capability || '',
    functionCode: meta.functionCode || '',
    method: meta.method || '',
    baseUrl: meta.baseUrl || '',
    model: meta.model || ''
  };
  logLine('info', line, payload);
  if (shouldIncludeThirdPartyDetails() && meta.payload !== undefined) {
    emitDetailedLog('info', `[3P:REQ:DATA][${requestId}]`, meta.payload);
  }
}

function logThirdPartyResponse(meta = {}) {
  if (!logConfig.thirdParty.responseEnabled) return;
  const requestId = normalizeRequestId(meta.requestId);
  const line = `[3P:RES][${requestId}] ${meta.method || ''} ${meta.provider || 'unknown'} ${meta.functionCode || meta.capability || ''} ${meta.durationMs || 0}ms`.trim();
  const payload = {
    requestId,
    provider: meta.provider || '',
    capability: meta.capability || '',
    functionCode: meta.functionCode || '',
    method: meta.method || '',
    model: meta.model || '',
    durationMs: meta.durationMs || 0,
    status: meta.status || 'ok'
  };
  logLine('info', line, payload);
  if (shouldIncludeThirdPartyDetails() && meta.payload !== undefined) {
    emitDetailedLog('info', `[3P:RES:DATA][${requestId}]`, meta.payload);
  }
}

function logThirdPartyError(meta = {}) {
  if (!logConfig.thirdParty.errorEnabled) return;
  const requestId = normalizeRequestId(meta.requestId);
  logger.error(`[3P:ERR][${requestId}] ${meta.method || ''} ${meta.provider || 'unknown'} ${meta.functionCode || meta.capability || ''} ${meta.durationMs || 0}ms`.trim(), {
    requestId,
    provider: meta.provider || '',
    capability: meta.capability || '',
    functionCode: meta.functionCode || '',
    method: meta.method || '',
    model: meta.model || '',
    durationMs: meta.durationMs || 0,
    message: meta.message || 'Unknown third-party error',
    code: meta.code || '',
    status: meta.status || ''
  });
}

const requestLogger = async (ctx, next) => {
  const start = Date.now();
  const requestId = normalizeRequestId(ctx.get('x-request-id'));
  ctx.state.requestId = requestId;
  ctx.set('x-request-id', requestId);

  if (logConfig.clientApi?.request?.enabled) {
    const requestMeta = {
      requestId,
      ip: ctx.ip,
      userId: ctx.state.user?.id || null
    };
    if (logConfig.clientApi?.request?.includeHeaders) {
      requestMeta.headers = redactHeaders(ctx.headers || {});
    }
    const requestData = {};
    if (logConfig.clientApi?.request?.includeBody) {
      if (ctx.query && Object.keys(ctx.query).length) {
        requestData.query = summarizeValue(ctx.query || {});
      }
      if (ctx.request?.body) {
        requestData.body = summarizeValue(ctx.request.body);
      }
    }
    logLine(
      'info',
      `[CLIENT:REQ][${requestId}] ${ctx.method} ${ctx.path}`,
      Object.keys(requestData).length ? { ...requestMeta, ...requestData } : requestMeta
    );
  }

  try {
    await next();
  } finally {
    if (logConfig.clientApi?.response?.enabled) {
      const responseMeta = {
        requestId,
        status: ctx.status,
        durationMs: Date.now() - start,
        userId: ctx.state.user?.id || null
      };
      if (logConfig.clientApi?.response?.includeBody && ctx.body !== undefined) {
        responseMeta.body = summarizeValue(ctx.body);
      }
      logLine(
        'info',
        `[CLIENT:RES][${requestId}] ${ctx.method} ${ctx.path} ${ctx.status} ${responseMeta.durationMs}ms`,
        responseMeta
      );
    }
  }
};

module.exports = requestLogger;
module.exports.logger = logger;
module.exports.logThirdPartyRequest = logThirdPartyRequest;
module.exports.logThirdPartyResponse = logThirdPartyResponse;
module.exports.logThirdPartyError = logThirdPartyError;
module.exports.logPromptAssembly = logPromptAssembly;
module.exports.summarizeValue = summarizeValue;
