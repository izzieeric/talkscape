import { getApiBaseUrl, LOGIN_PAGE, HOME_PAGE } from './env';
import { clearClientCache } from './app-cache';
import clientLogConfig from './log-config';

const BASE_URL = getApiBaseUrl();
let authRedirecting = false;

function createRequestId() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function summarizeValue(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > 300 ? `${value.slice(0, 300)}...(${value.length})` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= 2) return '[truncated]';
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => summarizeValue(item, depth + 1));
  }
  return Object.entries(value).reduce((acc, [key, nestedValue]) => {
    const lowerKey = String(key || '').toLowerCase();
    if (['authorization', 'token', 'password', 'cookie'].includes(lowerKey)) {
      acc[key] = '[redacted]';
      return acc;
    }
    acc[key] = summarizeValue(nestedValue, depth + 1);
    return acc;
  }, {});
}

function logLine(level, line, payload) {
  const timestamp = new Date().toISOString();
  const fullLine = `[TalkScape][${line}] ${timestamp}`;
  if (typeof console === 'undefined') return;
  if (level === 'error' && console.error) {
    if (payload !== undefined) {
      console.error(fullLine, payload);
      return;
    }
    console.error(fullLine);
    return;
  }
  if (console.info) {
    if (payload !== undefined) {
      console.info(fullLine, payload);
      return;
    }
    console.info(fullLine);
    return;
  }
  if (console.log) {
    if (payload !== undefined) {
      console.log(fullLine, payload);
      return;
    }
    console.log(fullLine);
  }
}

function logClientRequest(payload) {
  if (!clientLogConfig.request.enabled) return;
  let nextPayload;
  if (clientLogConfig.request.includePayload && payload.data !== undefined) {
    nextPayload = { data: summarizeValue(payload.data) };
  }
  logLine('info', `CLIENT:REQ][${payload.requestId}] ${payload.method} ${payload.url}`, nextPayload);
}

function logClientResponse(payload) {
  if (!clientLogConfig.response.enabled) return;
  let nextPayload;
  if (clientLogConfig.response.includePayload && payload.data !== undefined) {
    nextPayload = { data: summarizeValue(payload.data) };
  }
  logLine(
    'info',
    `CLIENT:RES][${payload.requestId}] ${payload.method} ${payload.url} ${payload.statusCode} ${payload.durationMs}ms`,
    nextPayload
  );
}

function logClientError(payload) {
  if (!clientLogConfig.error.enabled) return;
  logLine(
    'error',
    `CLIENT:ERR][${payload.requestId}] ${payload.method} ${payload.url} ${payload.statusCode || ''} ${payload.durationMs}ms`,
    { message: payload.message || 'Request failed' }
  );
}

function getAuthToken() {
  try {
    return uni.getStorageSync('auth_token') || '';
  } catch {
    return '';
  }
}

function clearAuthStorage() {
  clearClientCache();
}

function isAuthEndpoint(url = '') {
  return String(url).startsWith('/api/auth/');
}

function shouldLogoutOnUnauthorized(url = '', options = {}) {
  if (options.unauthorizedMode === 'ignore') {
    return false;
  }

  if (options.unauthorizedMode === 'logout') {
    return true;
  }

  return url === '/api/auth/me' || url === '/api/profile/me';
}

function isLoginPageActive() {
  try {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    return current?.route === 'pages/auth/login';
  } catch {
    return false;
  }
}

function redirectToLogin(options = {}) {
  if (authRedirecting || isLoginPageActive()) return;

  const redirect = options.redirect || HOME_PAGE;
  authRedirecting = true;
  if (options.clearAuth === true) {
    clearAuthStorage();
  }

  uni.navigateTo({
    url: `${LOGIN_PAGE}?redirect=${encodeURIComponent(redirect)}`,
    complete: () => {
      setTimeout(() => {
        authRedirecting = false;
      }, 300);
    }
  });
}

function createRequestError(res) {
  const error = new Error(res.data?.message || res.data?.error || 'Request failed');
  error.statusCode = res.statusCode;
  error.response = res.data;
  return error;
}

function request(options) {
  return new Promise((resolve, reject) => {
    const {
      unauthorizedMode,
      redirectOnUnauthorized,
      ...requestOptions
    } = options || {};
    const token = getAuthToken();
    const requestId = createRequestId();
    const startedAt = Date.now();
    const defaultOptions = {
      url: BASE_URL + requestOptions.url,
      method: requestOptions.method || 'GET',
      header: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...requestOptions.header
      },
      timeout: 30000
    };

    if (requestOptions.data) {
      defaultOptions.data = requestOptions.data;
    }

    logClientRequest({
      requestId,
      method: defaultOptions.method,
      url: defaultOptions.url,
      data: defaultOptions.data
    });

    uni.request({
      ...defaultOptions,
      success: (res) => {
        const durationMs = Date.now() - startedAt;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logClientResponse({
            requestId,
            method: defaultOptions.method,
            url: defaultOptions.url,
            statusCode: res.statusCode,
            durationMs,
            data: res.data
          });
          resolve(res.data);
        } else {
          const error = createRequestError(res);
          logClientError({
            requestId,
            method: defaultOptions.method,
            url: defaultOptions.url,
            statusCode: res.statusCode,
            durationMs,
            message: error.message
          });
          if (
            res.statusCode === 401
            && !isAuthEndpoint(requestOptions.url)
            && shouldLogoutOnUnauthorized(requestOptions.url, { unauthorizedMode })
          ) {
            redirectToLogin({
              clearAuth: true,
              redirect: redirectOnUnauthorized || HOME_PAGE
            });
          }
          reject(error);
        }
      },
      fail: (err) => {
        logClientError({
          requestId,
          method: defaultOptions.method,
          url: defaultOptions.url,
          durationMs: Date.now() - startedAt,
          message: err.errMsg || err.message
        });
        reject(err);
      }
    });
  });
}

export const api = {
  get: (url, params, options = {}) => request({ url, method: 'GET', data: params, ...options }),
  post: (url, data, options = {}) => request({ url, method: 'POST', data, ...options }),
  put: (url, data, options = {}) => request({ url, method: 'PUT', data, ...options }),
  delete: (url, options = {}) => request({ url, method: 'DELETE', ...options })
};

export const authApi = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  me: () => api.get('/api/auth/me', null, { unauthorizedMode: 'logout' })
};

export const profileApi = {
  getMe: () => api.get('/api/profile/me', null, { unauthorizedMode: 'logout' }),
  updateMe: (data) => api.put('/api/profile/me', data)
};

// 场景 API
export const scenarioApi = {
  getAll: () => api.get('/api/scenarios'),
  getById: (id) => api.get(`/api/scenarios/${id}`),
  getConfig: (id) => api.get(`/api/scenarios/${id}/config`),
  getPromptConfig: (id, subTaskId) => api.get(`/api/scenarios/${id}/prompt-config`, { subTaskId }),
  savePromptConfig: (id, data) => api.put(`/api/scenarios/${id}/prompt-config`, data),
  getMine: () => api.get('/api/scenarios/mine'),
  getProgress: () => api.get('/api/scenarios/progress'),
  addMine: (scenarioId) => api.post('/api/scenarios/mine', { scenarioId }),
  removeMine: (scenarioId) => api.delete(`/api/scenarios/mine/${scenarioId}`)
};

// 对话 API
export const conversationApi = {
  createSession: (data) => api.post('/api/conversations/sessions', data),
  getLatestSession: (scenarioId) => api.get('/api/conversations/sessions/latest', { scenarioId }),
  getSession: (id) => api.get(`/api/conversations/sessions/${id}`),
  addMessage: (sessionId, data) => api.post(`/api/conversations/sessions/${sessionId}/messages`, data),
  getMessages: (sessionId) => api.get(`/api/conversations/sessions/${sessionId}/messages`),
  rollbackToMessage: (sessionId, messageId) => api.post(`/api/conversations/sessions/${sessionId}/messages/${messageId}/rollback`, {}),
  ensureOpeningMessage: (sessionId) => api.post(`/api/conversations/sessions/${sessionId}/opening`, {}),
  ensureMessageVoice: (sessionId, messageId, options = {}) => api.post(`/api/conversations/sessions/${sessionId}/messages/${messageId}/voice`, options),
  getMessageExplanation: (sessionId, messageId) => api.get(`/api/conversations/sessions/${sessionId}/messages/${messageId}/explanation`),
  regenerateHintExample: (sessionId, data = {}) => api.post(`/api/conversations/sessions/${sessionId}/hint-example`, data),
  sendMessage: (sessionId, message) => api.post(`/api/conversations/sessions/${sessionId}/send`, { message }),
  completeSession: (id) => api.put(`/api/conversations/sessions/${id}/complete`),
  restartSession: (id, data = {}) => api.post(`/api/conversations/sessions/${id}/restart`, data),
  getResult: (id) => api.get(`/api/conversations/sessions/${id}/result`)
};

// 单词 API
export const wordApi = {
  getDetail: (word, context, options = {}) => api.get('/api/words/detail', {
    word,
    context,
    scenarioId: options.scenarioId || '',
    subScenarioId: options.subScenarioId || ''
  }),
  logClick: (data) => api.post('/api/words/click', data)
};

// 收藏 API
export const bookmarkApi = {
  getAll: (params) => api.get('/api/bookmarks', params),
  add: (data) => api.post('/api/bookmarks', data),
  recordWordbookSuccesses: (words) => api.post('/api/bookmarks/review-success', { words }),
  markPracticed: (word) => api.put(`/api/bookmarks/${word}/practiced`, {}),
  reactivate: (word) => api.put(`/api/bookmarks/${word}/active`, {}),
  remove: (word) => api.delete(`/api/bookmarks/${word}`),
  check: (word) => api.get(`/api/bookmarks/check/${word}`)
};

// 设置 API
export const settingsApi = {
  get: () => api.get('/api/settings'),
  update: (data) => api.put('/api/settings', data)
};

// 语音 API
export const voiceApi = {
  tts: (text, options = {}) => api.post('/api/voice/tts', { text, ...options }),
  stt: (audioFile) => {
    const isBlobLike = typeof Blob !== 'undefined' && audioFile instanceof Blob;
    const isFileLike = typeof File !== 'undefined' && audioFile instanceof File;
    if (isBlobLike || isFileLike) {
      return new Promise(async (resolve, reject) => {
        const requestId = createRequestId();
        const startedAt = Date.now();
        try {
          const token = getAuthToken();
          const formData = new FormData();
          const detectedType = String(audioFile?.type || '').toLowerCase();
          const ext = detectedType.includes('mp4') || detectedType.includes('m4a')
            ? 'm4a'
            : detectedType.includes('ogg')
              ? 'ogg'
              : detectedType.includes('wav')
                ? 'wav'
                : detectedType.includes('mpeg') || detectedType.includes('mp3')
                  ? 'mp3'
                  : 'webm';
          const file = isFileLike
            ? audioFile
            : new File([audioFile], `recording-${Date.now()}.${ext}`, {
                type: audioFile.type || `audio/${ext}`
              });
          formData.append('audio', file);

          logClientRequest({
            requestId,
            method: 'POST',
            url: BASE_URL + '/api/voice/stt',
            data: {
              fileName: file.name,
              fileType: file.type
            }
          });

          const res = await fetch(BASE_URL + '/api/voice/stt', {
            method: 'POST',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'X-Request-Id': requestId
            },
            body: formData
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            logClientResponse({
              requestId,
              method: 'POST',
              url: BASE_URL + '/api/voice/stt',
              statusCode: res.status,
              durationMs: Date.now() - startedAt,
              data
            });
            resolve(data);
            return;
          }

          const error = new Error(data?.message || data?.error || 'Upload failed');
          error.statusCode = res.status;
          logClientError({
            requestId,
            method: 'POST',
            url: BASE_URL + '/api/voice/stt',
            statusCode: res.status,
            durationMs: Date.now() - startedAt,
            message: error.message
          });
          reject(error);
        } catch (err) {
          logClientError({
            requestId,
            method: 'POST',
            url: BASE_URL + '/api/voice/stt',
            durationMs: Date.now() - startedAt,
            message: err.message
          });
          reject(err);
        }
      });
    }

    return new Promise((resolve, reject) => {
      const token = getAuthToken();
      const requestId = createRequestId();
      const startedAt = Date.now();
      logClientRequest({
        requestId,
        method: 'POST',
        url: BASE_URL + '/api/voice/stt',
        data: { filePath: audioFile }
      });
      uni.uploadFile({
        url: BASE_URL + '/api/voice/stt',
        filePath: audioFile,
        name: 'audio',
        header: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'X-Request-Id': requestId
        },
        success: (res) => {
          const data = JSON.parse(res.data || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            logClientResponse({
              requestId,
              method: 'POST',
              url: BASE_URL + '/api/voice/stt',
              statusCode: res.statusCode,
              durationMs: Date.now() - startedAt,
              data
            });
            resolve(data);
            return;
          }

          const error = new Error(data?.message || data?.error || 'Upload failed');
          error.statusCode = res.statusCode;
          logClientError({
            requestId,
            method: 'POST',
            url: BASE_URL + '/api/voice/stt',
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            message: error.message
          });
          reject(error);
        },
        fail: (err) => {
          logClientError({
            requestId,
            method: 'POST',
            url: BASE_URL + '/api/voice/stt',
            durationMs: Date.now() - startedAt,
            message: err.errMsg || err.message
          });
          reject(err);
        }
      });
    });
  }
};

export default {
  api,
  authApi,
  profileApi,
  scenarioApi,
  conversationApi,
  wordApi,
  bookmarkApi,
  settingsApi,
  voiceApi
};
