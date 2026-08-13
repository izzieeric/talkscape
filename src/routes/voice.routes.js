const Router = require('@koa/router');
const multer = require('@koa/multer');
const path = require('path');
const ttsService = require('../services/tts.service');
const settingsService = require('../services/settings.service');
const promptBuilder = require('../utils/prompt-builder');
const { buildUserVoiceTarget, getStaticDataDir } = require('../utils/voice-storage');
const { requireAuth } = require('../middleware/auth');
const { withHttpBasePath } = require('../config/http-paths');

const router = new Router({ prefix: withHttpBasePath('/api/voice') });

function getSpeechRecognitionLanguage(learningLanguage = 'en') {
  return String(learningLanguage || '').toLowerCase() === 'ja' ? 'ja' : 'en';
}

function normalizeAudioExtension(file = {}) {
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  if (originalExt) return originalExt;

  const mimeType = String(file.mimetype || '').toLowerCase();
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return '.mp3';
  if (mimeType.includes('wav')) return '.wav';
  if (mimeType.includes('webm')) return '.webm';
  if (mimeType.includes('ogg')) return '.ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return '.m4a';
  return '.webm';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const target = buildUserVoiceTarget({
        userId: req?.user?.id || req?.state?.user?.id || 'anonymous',
        extension: '.webm'
      });
      cb(null, path.dirname(target.absolutePath));
    },
    filename: (req, file, cb) => {
      const target = buildUserVoiceTarget({
        userId: req?.user?.id || req?.state?.user?.id || 'anonymous',
        extension: normalizeAudioExtension(file)
      });
      cb(null, path.basename(target.absolutePath));
    }
  })
});

router.use(requireAuth);
router.use(async (ctx, next) => {
  ctx.req.user = ctx.state.user;
  await next();
});

// POST /api/voice/tts - 文本转语音
router.post('/tts', async (ctx) => {
  const { text, voice, speed } = ctx.request.body || {};
  if (!text) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'Text is required' };
    return;
  }
  const userSettings = await settingsService.getSettings(ctx.state.user.id);
  const result = await ttsService.ensureTextToSpeech(text, {
    voice,
    speed: speed === undefined ? userSettings.voiceSpeed : speed,
    scope: 'user',
    userId: ctx.state.user.id
  });
  ctx.body = { success: true, data: result };
});

// POST /api/voice/stt - 语音转文本
router.post('/stt', upload.single('audio'), async (ctx) => {
  if (!ctx.file) {
    ctx.status = 400;
    ctx.body = { success: false, message: 'Audio file is required' };
    return;
  }
  const userSettings = await settingsService.getSettings(ctx.state.user.id);
  const prompt = await promptBuilder.buildVoiceTranscriptPrompt({
    learningLanguage: userSettings.learningLanguage || 'en',
    learningDifficulty: userSettings.learningDifficulty || 'A1',
    nativeLanguage: userSettings.nativeLanguage || 'zh-CN'
  });
  const text = await ttsService.speechToText(
    ctx.file.path,
    getSpeechRecognitionLanguage(userSettings.learningLanguage),
    {
      functionCode: 'voice-transcript',
      prompt
    }
  );
  const relativePath = path.relative(getStaticDataDir(), ctx.file.path).replace(/\\/g, '/');
  const audioUrl = withHttpBasePath(`/data/${relativePath}`);
  ctx.body = { success: true, data: { text, audioUrl } };
});

module.exports = router;
