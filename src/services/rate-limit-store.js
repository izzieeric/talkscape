const fs = require('fs');
const path = require('path');
const rateLimitConfig = require('../config/rate-limit-config');
const { getDataRootDir, getRuntimeDataDir, sanitizeSegment } = require('../utils/voice-storage');

class FileRateLimitStore {
  constructor(options = {}) {
    this.options = {
      fileName: 'rate-limit-cache.json',
      dirName: 'rate-limit',
      usersDirName: 'users',
      fileExtension: '.json',
      flushIntervalMs: 800,
      gcIntervalMs: 30000,
      retentionMs: 5 * 60 * 1000,
      ...options
    };
    this.baseDir = path.join(
      getRuntimeDataDir(),
      this.options.dirName,
      this.options.usersDirName
    );
    this.legacyFilePath = path.join(getDataRootDir(), 'system', 'cache', this.options.fileName);
    this.userStates = new Map();
    this.flushTimers = new Map();
    this.gcTimer = null;
    this.ensureBaseDir();
    this.startGc();
  }

  ensureBaseDir() {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  getUserFilePath(userId) {
    const fileName = `${sanitizeSegment(userId, 'anonymous')}${this.options.fileExtension}`;
    return path.join(this.baseDir, fileName);
  }

  normalizeEntries(source) {
    if (!source || typeof source !== 'object') return {};

    return Object.entries(source).reduce((acc, [key, value]) => {
      if (!Array.isArray(value)) return acc;
      const hits = value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0)
        .sort((a, b) => a - b);

      if (hits.length) {
        acc[key] = hits;
      }
      return acc;
    }, {});
  }

  loadLegacyEntriesForUser(userId) {
    if (!fs.existsSync(this.legacyFilePath)) {
      return {};
    }

    try {
      const raw = fs.readFileSync(this.legacyFilePath, 'utf8');
      if (!raw.trim()) return {};
      const parsed = JSON.parse(raw);
      const source = parsed && typeof parsed === 'object' ? parsed.entries : null;
      if (!source || typeof source !== 'object') return {};

      return Object.entries(source).reduce((acc, [bucketKey, value]) => {
        const suffix = `::${userId}`;
        if (!bucketKey.endsWith(suffix)) {
          return acc;
        }

        const scope = bucketKey.slice(0, bucketKey.length - suffix.length);
        const entries = this.normalizeEntries({ [scope]: value });
        if (entries[scope]?.length) {
          acc[scope] = entries[scope];
        }
        return acc;
      }, {});
    } catch (_error) {
      return {};
    }
  }

  loadUserState(userId) {
    if (this.userStates.has(userId)) {
      return this.userStates.get(userId);
    }

    const filePath = this.getUserFilePath(userId);
    let entries = {};

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          entries = this.normalizeEntries(parsed?.entries);
        }
      } catch (_error) {
        entries = {};
      }
    } else {
      entries = this.loadLegacyEntriesForUser(userId);
    }

    const state = {
      userId,
      filePath,
      entries,
      dirty: false
    };

    this.userStates.set(userId, state);
    return state;
  }

  startGc() {
    if (this.gcTimer) return;
    const interval = Number(this.options.gcIntervalMs || 30000);
    this.gcTimer = setInterval(() => {
      this.gc();
    }, interval);
    if (typeof this.gcTimer.unref === 'function') {
      this.gcTimer.unref();
    }
  }

  gc(now = Date.now()) {
    const cutoff = now - Number(this.options.retentionMs || 5 * 60 * 1000);

    for (const [userId, state] of this.userStates.entries()) {
      let changed = false;

      for (const [scope, hits] of Object.entries(state.entries)) {
        const nextHits = Array.isArray(hits) ? hits.filter((item) => item >= cutoff) : [];
        if (!nextHits.length) {
          delete state.entries[scope];
          changed = true;
          continue;
        }
        if (nextHits.length !== hits.length) {
          state.entries[scope] = nextHits;
          changed = true;
        }
      }

      if (!Object.keys(state.entries).length && !state.dirty && fs.existsSync(state.filePath)) {
        state.dirty = true;
        changed = true;
      }

      if (changed) {
        this.scheduleFlush(userId);
      }
    }
  }

  scheduleFlush(userId) {
    if (this.flushTimers.has(userId)) return;
    const waitMs = Number(this.options.flushIntervalMs || 800);
    const flushTimer = setTimeout(() => {
      this.flushTimers.delete(userId);
      this.flushUserToDisk(userId);
    }, waitMs);
    this.flushTimers.set(userId, flushTimer);

    if (typeof flushTimer.unref === 'function') {
      flushTimer.unref();
    }
  }

  flushUserToDisk(userId) {
    const state = this.userStates.get(userId);
    if (!state) return;

    this.ensureBaseDir();
    const entryCount = Object.keys(state.entries).length;

    if (!entryCount) {
      if (fs.existsSync(state.filePath)) {
        fs.unlinkSync(state.filePath);
      }
      state.dirty = false;
      return;
    }

    const payload = {
      updatedAt: new Date().toISOString(),
      userId,
      entries: state.entries
    };
    fs.writeFileSync(state.filePath, JSON.stringify(payload, null, 2), 'utf8');
    state.dirty = false;
  }

  consume({ scope, userId, windowMs, max, now = Date.now() } = {}) {
    const resolvedWindowMs = Number(windowMs || 0);
    const resolvedMax = Number(max || 0);
    if (!scope || !userId || resolvedWindowMs <= 0 || resolvedMax <= 0) {
      return {
        allowed: true,
        remaining: resolvedMax,
        retryAfterMs: 0,
        resetAt: now
      };
    }

    const state = this.loadUserState(userId);
    const windowStart = now - resolvedWindowMs;
    const existingHits = state.entries[scope] || [];
    const validHits = existingHits.filter((item) => Number.isFinite(item) && item > windowStart);

    if (validHits.length >= resolvedMax) {
      const retryAfterMs = Math.max(0, resolvedWindowMs - (now - validHits[0]));
      state.entries[scope] = validHits;
      state.dirty = true;
      this.scheduleFlush(userId);
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs,
        resetAt: validHits[0] + resolvedWindowMs
      };
    }

    validHits.push(now);
    state.entries[scope] = validHits;
    state.dirty = true;
    this.scheduleFlush(userId);
    return {
      allowed: true,
      remaining: Math.max(0, resolvedMax - validHits.length),
      retryAfterMs: 0,
      resetAt: now + resolvedWindowMs
    };
  }
}

let sharedStore = null;

function getRateLimitStore() {
  if (!sharedStore) {
    sharedStore = new FileRateLimitStore(rateLimitConfig.storage || {});
  }
  return sharedStore;
}

module.exports = {
  FileRateLimitStore,
  getRateLimitStore
};
