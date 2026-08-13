const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { withHttpBasePath } = require('../config/http-paths');

const projectRoot = path.resolve(__dirname, '../..');
const dataRootDir = path.join(projectRoot, 'data');
const staticDataRootDir = path.join(dataRootDir, 'static');
const runtimeDataRootDir = path.join(dataRootDir, 'runtime');
let legacyStaticMigrated = false;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeSegment(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function getDataRootDir() {
  ensureDir(dataRootDir);
  return dataRootDir;
}

function moveDirectoryContents(sourceDir, targetDir, options = {}) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (typeof options.filter === 'function' && !options.filter(entry.name, sourceDir)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      moveDirectoryContents(sourcePath, targetPath, options);
      if (fs.existsSync(sourcePath) && fs.readdirSync(sourcePath).length === 0) {
        fs.rmdirSync(sourcePath);
      }
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.renameSync(sourcePath, targetPath);
    }
  }
}

function migrateLegacyStaticData() {
  if (legacyStaticMigrated) return;
  legacyStaticMigrated = true;

  const legacyUsersDir = path.join(getDataRootDir(), 'users');
  const legacySystemDir = path.join(getDataRootDir(), 'system');
  const legacyVoiceDir = path.join(getDataRootDir(), 'voice');
  const nextUsersDir = path.join(staticDataRootDir, 'users');
  const nextSystemDir = path.join(staticDataRootDir, 'system');
  const nextVoiceDir = path.join(staticDataRootDir, 'voice');

  moveDirectoryContents(legacyUsersDir, nextUsersDir);
  moveDirectoryContents(legacySystemDir, nextSystemDir, {
    filter: (entryName) => entryName !== 'cache'
  });
  moveDirectoryContents(legacyVoiceDir, nextVoiceDir);
}

function getStaticDataDir() {
  ensureDir(staticDataRootDir);
  migrateLegacyStaticData();
  return staticDataRootDir;
}

function getRuntimeDataDir() {
  ensureDir(runtimeDataRootDir);
  return runtimeDataRootDir;
}

function getUsersDataDir() {
  const dirPath = path.join(getStaticDataDir(), 'users');
  ensureDir(dirPath);
  return dirPath;
}

function getSystemDataDir() {
  const dirPath = path.join(getStaticDataDir(), 'system');
  ensureDir(dirPath);
  return dirPath;
}

function buildDataUrl(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized ? withHttpBasePath(`/data/${normalized}`) : withHttpBasePath('/data');
}

function getDateSegments(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { year, month, day };
}

function buildUserVoiceRelativeDir(userId, date = new Date()) {
  const { year, month, day } = getDateSegments(date);
  return path.join('users', sanitizeSegment(userId, 'anonymous'), 'voice', year, month, day);
}

function buildUserVoiceTarget({ userId, extension = '.webm', fileName = '', date = new Date() } = {}) {
  const resolvedExt = String(extension || '.webm').startsWith('.') ? String(extension || '.webm') : `.${extension}`;
  const relativeDir = buildUserVoiceRelativeDir(userId, date);
  const resolvedFileName = fileName || `${randomUUID()}${resolvedExt}`;
  const relativePath = path.join(relativeDir, resolvedFileName);
  const absolutePath = path.join(getStaticDataDir(), relativePath);
  ensureDir(path.dirname(absolutePath));
  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, '/'),
    url: buildDataUrl(relativePath),
    fileName: resolvedFileName
  };
}

function buildSystemWordAudioTarget({ word, extension = '.mp3' } = {}) {
  const resolvedExt = String(extension || '.mp3').startsWith('.') ? String(extension || '.mp3') : `.${extension}`;
  const baseName = sanitizeSegment(word, 'word');
  const relativePath = path.join('system', 'word', `${baseName}${resolvedExt}`);
  const absolutePath = path.join(getStaticDataDir(), relativePath);
  ensureDir(path.dirname(absolutePath));
  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, '/'),
    url: buildDataUrl(relativePath),
    fileName: `${baseName}${resolvedExt}`
  };
}

function buildSystemTtsTarget({ category = 'tts', extension = '.mp3', fileName = '' } = {}) {
  const resolvedExt = String(extension || '.mp3').startsWith('.') ? String(extension || '.mp3') : `.${extension}`;
  const resolvedCategory = sanitizeSegment(category, 'tts');
  const resolvedFileName = fileName || `${randomUUID()}${resolvedExt}`;
  const relativePath = path.join('system', resolvedCategory, resolvedFileName);
  const absolutePath = path.join(getStaticDataDir(), relativePath);
  ensureDir(path.dirname(absolutePath));
  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, '/'),
    url: buildDataUrl(relativePath),
    fileName: resolvedFileName
  };
}

function resolveStorageTarget(options = {}) {
  if (options.scope === 'system-word') {
    return buildSystemWordAudioTarget({
      word: options.word,
      extension: options.extension || '.mp3'
    });
  }

  if (options.scope === 'system') {
    return buildSystemTtsTarget({
      category: options.category || 'tts',
      extension: options.extension || '.mp3'
    });
  }

  return buildUserVoiceTarget({
    userId: options.userId || 'anonymous',
    extension: options.extension || '.mp3',
    date: options.date || new Date()
  });
}

function resolveDataFilePathFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const prefixedDataRoot = withHttpBasePath('/data/');
  const legacyDataRoot = '/data/';
  let relativePath = '';

  if (url.startsWith(prefixedDataRoot)) {
    relativePath = url.replace(prefixedDataRoot, '');
  } else if (url.startsWith(legacyDataRoot)) {
    relativePath = url.replace(legacyDataRoot, '');
  } else {
    return null;
  }

  const staticFilePath = path.join(getStaticDataDir(), relativePath);
  if (fs.existsSync(staticFilePath)) {
    return staticFilePath;
  }

  return path.join(getDataRootDir(), relativePath);
}

module.exports = {
  buildDataUrl,
  buildSystemTtsTarget,
  buildSystemWordAudioTarget,
  buildUserVoiceTarget,
  getDataRootDir,
  getRuntimeDataDir,
  getStaticDataDir,
  getSystemDataDir,
  getUsersDataDir,
  resolveDataFilePathFromUrl,
  resolveStorageTarget,
  sanitizeSegment
};
