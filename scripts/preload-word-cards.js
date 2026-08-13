#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const wordService = require('../src/services/word.service');

const DEFAULT_FILE = path.join(__dirname, '..', '全部英语词汇_空格分隔.txt');
const DEFAULT_CONCURRENCY = 100;
const DEFAULT_NATIVE_LANGUAGE = 'zh-CN';

function printHelp() {
  console.log(`
用法:
  node scripts/preload-word-cards.js [options]

参数:
  --file <path>            词表文件路径，默认使用项目根目录下的"全部英语词汇_空格分隔.txt"
  --concurrency <number>   并发数，默认 100
  --limit <number>         仅处理前 N 个单词，便于试跑
  --native-language <lang> 母语代码，默认 zh-CN
  --help                   显示帮助

示例:
  node scripts/preload-word-cards.js
  node scripts/preload-word-cards.js --limit 20
  node scripts/preload-word-cards.js --concurrency 5 --file "./全部英语词汇_空格分隔.txt"
  `);
}

function parseArgs(argv) {
  const args = {
    file: DEFAULT_FILE,
    concurrency: DEFAULT_CONCURRENCY,
    limit: 0,
    nativeLanguage: DEFAULT_NATIVE_LANGUAGE,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    if (arg === '--file' && next) {
      args.file = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }

    if (arg === '--concurrency' && next) {
      args.concurrency = Math.max(1, Number.parseInt(next, 10) || DEFAULT_CONCURRENCY);
      i += 1;
      continue;
    }

    if (arg === '--limit' && next) {
      args.limit = Math.max(0, Number.parseInt(next, 10) || 0);
      i += 1;
      continue;
    }

    if (arg === '--native-language' && next) {
      args.nativeLanguage = String(next).trim() || DEFAULT_NATIVE_LANGUAGE;
      i += 1;
    }
  }

  return args;
}

function loadWordList(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`词表文件不存在: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const words = content
    .split(/\s+/)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(words)];
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function buildProgressLine(state) {
  const elapsedMs = Date.now() - state.startedAt;
  const averageMs = state.done > 0 ? elapsedMs / state.done : 0;
  const remaining = Math.max(0, state.total - state.done);
  const etaMs = averageMs * remaining;
  return [
    `[进度 ${state.done}/${state.total}]`,
    `成功 ${state.success}`,
    `缓存 ${state.cached}`,
    `新生成 ${state.generated}`,
    `失败 ${state.failed}`,
    `耗时 ${formatDuration(elapsedMs)}`,
    `预计剩余 ${formatDuration(etaMs)}`
  ].join(' | ');
}

function logProgress(state, word, status, extra = '') {
  const prefix = `${buildProgressLine(state)} | ${status} | ${word}`;
  console.log(extra ? `${prefix} | ${extra}` : prefix);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  db.init();
  const database = db.getDb();
  const getExistingStmt = database.prepare('SELECT 1 FROM word_dictionary_entries WHERE word = ?');

  const allWords = loadWordList(args.file);
  const words = args.limit > 0 ? allWords.slice(0, args.limit) : allWords;

  if (!words.length) {
    console.log('未读取到任何单词，任务结束。');
    return;
  }

  const state = {
    total: words.length,
    done: 0,
    success: 0,
    failed: 0,
    cached: 0,
    generated: 0,
    startedAt: Date.now()
  };

  const failures = [];
  let cursor = 0;
  let stopping = false;

  process.on('SIGINT', () => {
    if (stopping) return;
    stopping = true;
    console.log('\n收到中断信号，当前进行中的任务完成后将停止领取新任务...');
  });

  console.log(`开始预加载英语词卡，总数 ${state.total}，并发 ${args.concurrency}，文件: ${args.file}`);

  async function worker(workerIndex) {
    while (!stopping) {
      const currentIndex = cursor;
      cursor += 1;

      if (currentIndex >= words.length) {
        return;
      }

      const word = words[currentIndex];
      const existedBefore = Boolean(getExistingStmt.get(word));

      try {
        const result = await wordService.getWordDetail(word, '', {
          nativeLanguage: args.nativeLanguage
        });
        const existedAfter = Boolean(getExistingStmt.get(word));

        if (!existedBefore && !existedAfter) {
          throw new Error(`未写入数据库，当前 provider=${result?.provider || 'unknown'}`);
        }

        state.done += 1;
        state.success += 1;

        if (existedBefore) {
          state.cached += 1;
          logProgress(state, word, `worker-${workerIndex}`, '命中缓存');
        } else {
          state.generated += 1;
          logProgress(state, word, `worker-${workerIndex}`, '生成并入库');
        }
      } catch (error) {
        state.done += 1;
        state.failed += 1;
        failures.push({ word, error: error.message || String(error) });
        logProgress(state, word, `worker-${workerIndex}`, `失败: ${error.message || error}`);
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, (_, index) => worker(index + 1));
  await Promise.all(workers);

  const elapsedMs = Date.now() - state.startedAt;
  console.log('\n预加载完成');
  console.log(`总数: ${state.total}`);
  console.log(`成功: ${state.success}`);
  console.log(`缓存: ${state.cached}`);
  console.log(`新生成: ${state.generated}`);
  console.log(`失败: ${state.failed}`);
  console.log(`总耗时: ${formatDuration(elapsedMs)}`);

  if (failures.length) {
    const failedPath = path.join(__dirname, '..', 'data', 'wordcard-preload-failures.json');
    fs.mkdirSync(path.dirname(failedPath), { recursive: true });
    fs.writeFileSync(failedPath, `${JSON.stringify(failures, null, 2)}\n`, 'utf-8');
    console.log(`失败明细已写入: ${failedPath}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('预加载脚本执行失败:', error);
  process.exit(1);
});
