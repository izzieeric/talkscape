/**
 * TalkScape 全流程集成测试
 *
 * 覆盖：场景、对话、单词、收藏、设置、语音 所有 API 路由
 * AI 客户端已 mock，无需真实 API Key
 */

// Mock AI 客户端（必须在所有 require 之前）
jest.mock('../src/services/ai-client');

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

let authToken = '';
const withAuth = (req) => req.set('Authorization', `Bearer ${authToken}`);

// 初始化数据库（使用内存模式）
beforeAll(async () => {
  db.init();
  const username = `api${String(Date.now()).slice(-8)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ username, password: '123456', displayName: 'API Test' });
  authToken = res.body.data.token;
});

afterAll(() => {
  // 关闭数据库连接
  const database = db.getDb();
  if (database) database.close();
});

// ======================================================
// 1. 健康检查
// ======================================================
describe('Health Check', () => {
  test('GET /health 返回 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ======================================================
// 2. 场景 API
// ======================================================
describe('Scenarios API', () => {
  test('GET /api/scenarios 返回场景列表', async () => {
    const res = await request(app).get('/api/scenarios');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    // 验证字段
    const first = res.body.data[0];
    expect(first.id).toBeDefined();
    expect(first.title).toBeDefined();
    expect(first.sceneType || first.scene_type).toBeDefined();
    expect(first.difficulty).toBeDefined();
    expect(first.icon).toBeDefined();
  });

  test('GET /api/scenarios/:id 返回单个场景', async () => {
    const res = await request(app).get('/api/scenarios/restaurant');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('restaurant');
    expect(Array.isArray(res.body.data.subTasks)).toBe(true);
    expect(res.body.data.subTasks.length).toBeGreaterThan(0);
    expect(res.body.data.sceneType).toBe('level');
  });

  test('GET /api/scenarios/:id 不存在返回 200 + null', async () => {
    const res = await request(app).get('/api/scenarios/not-exist');
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  test('GET /api/scenarios/:id/config 返回配置', async () => {
    const res = await request(app).get('/api/scenarios/restaurant/config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data).toBe('object');
  });

  test('GET/PUT /api/scenarios/:id/prompt-config 支持读取和保存场景提示词', async () => {
    const readRes = await request(app)
      .get('/api/scenarios/restaurant/prompt-config');
    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);
    expect(typeof readRes.body.data.compiledPrompt).toBe('string');
    expect(readRes.body.data.compiledPrompt.length).toBeGreaterThan(0);
    expect(Array.isArray(readRes.body.data.layers)).toBe(true);
    expect(Array.isArray(readRes.body.data.scenarioSlots)).toBe(true);

    const promptId = readRes.body.data.scenarioSlots[0]?.options?.[0]?.id;
    expect(promptId).toBeTruthy();

    const saveRes = await withAuth(request(app)
      .put('/api/scenarios/restaurant/prompt-config'))
      .send({
        promptId
      });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.success).toBe(true);
    expect(saveRes.body.data.scenarioSlots[0].currentPromptId).toBe(promptId);

    const readAfterSaveRes = await request(app)
      .get('/api/scenarios/restaurant/prompt-config');
    expect(readAfterSaveRes.body.data.scenarioSlots[0].currentPromptId).toBe(promptId);
  });

  test('GET /api/scenarios/mine 返回当前用户已保存场景', async () => {
    const addRes = await withAuth(request(app)
      .post('/api/scenarios/mine'))
      .send({ scenarioId: 'restaurant' });
    expect(addRes.status).toBe(200);
    expect(addRes.body.success).toBe(true);
    expect(addRes.body.data.id).toBe('restaurant');

    const listRes = await withAuth(request(app)
      .get('/api/scenarios/mine'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(listRes.body.data.some((item) => item.id === 'restaurant')).toBe(true);
    expect(listRes.body.data.find((item) => item.id === 'restaurant').subTasks.length).toBeGreaterThan(0);
  });

  test('DELETE /api/scenarios/mine/:scenarioId 可移除已保存场景', async () => {
    const res = await withAuth(request(app)
      .delete('/api/scenarios/mine/restaurant'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const listRes = await withAuth(request(app)
      .get('/api/scenarios/mine'));
    expect(listRes.body.data.some((item) => item.id === 'restaurant')).toBe(false);
  });

  test('GET /api/scenarios/progress 返回当前用户已完成场景', async () => {
    const createRes = await withAuth(request(app)
      .post('/api/conversations/sessions'))
      .send({ scenarioId: 'restaurant' });
    const sessionId = createRes.body.data.id;

    await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/messages`))
      .send({ role: 'user', english: 'Hello', chinese: '你好' });
    await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/send`))
      .send({ message: 'Hello again' });
    await withAuth(request(app)
      .put(`/api/conversations/sessions/${sessionId}/complete`));

    const progressRes = await withAuth(request(app)
      .get('/api/scenarios/progress'));
    expect(progressRes.status).toBe(200);
    expect(progressRes.body.success).toBe(true);
    expect(progressRes.body.data.completedScenarioIds).toContain('restaurant');
    expect(progressRes.body.data.completedScenarioMap.restaurant.completed).toBe(true);
  });
});

// ======================================================
// 3. 对话流程 (核心)
// ======================================================
describe('Conversation Flow', () => {
  let sessionId;

  test('POST /api/conversations/sessions 创建会话', async () => {
    const scenarioRes = await request(app).get('/api/scenarios/restaurant');
    const subTaskId = scenarioRes.body.data.subTasks[0].id;
    const res = await request(app)
      .post('/api/conversations/sessions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ scenarioId: 'restaurant', subTaskId, userId: 'test-user' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    sessionId = res.body.data.id;
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.scenarioId).toBe('restaurant');
    expect(res.body.data.subTaskId).toBe(subTaskId);
    expect(typeof res.body.data.userId).toBe('string');
    expect(res.body.data.userId.length).toBeGreaterThan(0);
    expect(res.body.data.status).toBe('active');
    expect(res.body.data.maxTurns).toBeGreaterThan(0);
  });

  test('POST /api/conversations/sessions/:id/opening 在空会话中生成 AI 开场白', async () => {
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/opening`))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.opener).toBe(true);
    expect(typeof res.body.data.english).toBe('string');
    expect(res.body.data.english.length).toBeGreaterThan(0);
    expect(res.body.data.currentTurn).toBe(0);
  });

  test('POST /api/conversations/sessions/:id/send 发送消息并获取 AI 回复', async () => {
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/send`))
      .send({ message: 'Hello, I would like to order.' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.messageId).toBeDefined();
    expect(data.english).toBeDefined();
    expect(data.chinese).toBeDefined();
    expect(typeof data.english).toBe('string');
    expect(data.english.length).toBeGreaterThan(0);
    expect(data.voiceUrl).toContain('/data/users/');
    expect(data.currentTurn).toBe(1);
    expect(data.isComplete).toBe(false);
  });

  test('GET /api/conversations/sessions/latest 可返回当前场景最近会话', async () => {
    const scenarioRes = await request(app).get('/api/scenarios/restaurant');
    const subTaskId = scenarioRes.body.data.subTasks[0].id;
    const res = await withAuth(request(app)
      .get('/api/conversations/sessions/latest')
      .query({ scenarioId: 'restaurant', subTaskId }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(sessionId);
  });

  test('GET /api/conversations/sessions/:id/messages 获取消息列表', async () => {
    const res = await withAuth(request(app)
      .get(`/api/conversations/sessions/${sessionId}/messages`));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2); // 开场 AI + AI 回复（用户消息不单独存储）

    const aiMsg = res.body.data[1];
    expect(aiMsg.id).toBeDefined();
    expect(aiMsg.role).toBe('ai');
    expect(aiMsg.english).toBeDefined();
    expect(aiMsg.english.length).toBeGreaterThan(0);
    expect(aiMsg.voice_url).toContain('/data/users/');
  });

  test('POST /api/conversations/sessions/:id/messages/:messageId/voice 可为历史消息返回语音', async () => {
    const messagesRes = await withAuth(request(app)
      .get(`/api/conversations/sessions/${sessionId}/messages`));

    const aiMsg = messagesRes.body.data[0];
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/messages/${aiMsg.id}/voice`))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.messageId).toBe(aiMsg.id);
    expect(res.body.data.voiceUrl).toContain('/data/users/');
  });

  test('发送空消息返回 400', async () => {
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/send`))
      .send({ message: '' });
    expect(res.status).toBe(400);
  });

  test('发送到不存在的会话返回未找到或未授权状态', async () => {
    const res = await withAuth(request(app)
      .post('/api/conversations/sessions/not-exist-id/send'))
      .send({ message: 'test' });
    expect([401, 404]).toContain(res.status);
  });

  test('PUT /api/conversations/sessions/:id/complete 完成会话', async () => {
    const res = await withAuth(request(app)
      .put(`/api/conversations/sessions/${sessionId}/complete`));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
  });

  test('已完成会话继续发送时返回完成提示', async () => {
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/send`))
      .send({ message: 'Can I continue?' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isComplete).toBe(true);
    expect(res.body.data.completedNotice).toBe(true);
  });

  test('GET /api/conversations/sessions/:id/result 获取结果', async () => {
    const res = await withAuth(request(app)
      .get(`/api/conversations/sessions/${sessionId}/result`));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.session).toBeDefined();
    expect(res.body.data.stats).toBeDefined();
    expect(res.body.data.stats.totalMessages).toBe(2);
    expect(res.body.data.session.status).toBe('completed');
  });

  test('POST /api/conversations/sessions/:id/restart 软删除旧会话并开启新会话', async () => {
    const oldSessionId = sessionId;
    const scenarioRes = await request(app).get('/api/scenarios/restaurant');
    const subTaskId = scenarioRes.body.data.subTasks[0].id;
    const res = await withAuth(request(app)
      .post(`/api/conversations/sessions/${sessionId}/restart`)
      .send({ scenarioId: 'restaurant', subTaskId }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.id).not.toBe(oldSessionId);

    sessionId = res.body.data.id;

    const latestRes = await withAuth(request(app)
      .get('/api/conversations/sessions/latest')
      .query({ scenarioId: 'restaurant', subTaskId }));
    expect(latestRes.body.data.id).toBe(sessionId);

    const messagesRes = await withAuth(request(app)
      .get(`/api/conversations/sessions/${sessionId}/messages`));
    expect(messagesRes.status).toBe(200);
    expect(messagesRes.body.data.length).toBe(0);
  });
});

// ======================================================
// 4. 单词 API
// ======================================================
describe('Word API', () => {
  test('GET /api/words/detail 返回单词解释', async () => {
    const res = await request(app)
      .get('/api/words/detail')
      .query({ word: 'reservation', context: 'Do you have a reservation?' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.phonetic).toBe('/ˌrezərˈveɪʃn/');
    expect(res.body.data.definitionCn).toContain('预订');
  });

  test('GET /api/words/detail 当前母语会被限制为中文', async () => {
    await withAuth(request(app)
      .put('/api/settings'))
      .send({ nativeLanguage: 'en' });

    try {
      const uniqueWord = `api-native-${Date.now()}`;
      const res = await withAuth(request(app)
        .get('/api/words/detail')
        .query({ word: uniqueWord, context: `${uniqueWord} example sentence.` }));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.language).toBe('en');
      expect(res.body.data.nativeLanguage).toBe('zh-CN');
    } finally {
      await withAuth(request(app)
        .put('/api/settings'))
        .send({ learningLanguage: 'en', nativeLanguage: 'zh-CN', showTranslation: true, voiceSpeed: 1.0 });
    }
  });

  test('GET /api/words/detail 不传 word 返回 500', async () => {
    const res = await request(app)
      .get('/api/words/detail')
      .query({ context: 'test' });
    expect(res.status).toBe(500);
  });

  test('POST /api/words/click 记录点击', async () => {
    const res = await withAuth(request(app)
      .post('/api/words/click'))
      .send({ word: 'reservation', sessionId: 'test', scenarioId: 'restaurant' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ======================================================
// 5. 收藏 API
// ======================================================
describe('Bookmark API', () => {
  beforeAll(() => {
    // 清理之前的测试残留，确保测试独立
    const db = require('../src/db');
    const database = db.getDb();
    database.prepare('DELETE FROM word_bookmarks').run();
  });

  test('GET /api/bookmarks 初始为空', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  test('POST /api/bookmarks 添加收藏', async () => {
    const res = await withAuth(request(app)
      .post('/api/bookmarks'))
      .send({
        word: 'reservation',
        phonetic: '/ˌrezərˈveɪʃn/',
        definitionCn: 'n. 预订',
        sourceScenarioId: 'restaurant'
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.word).toBe('reservation');
  });

  test('POST /api/bookmarks 重复添加不报错', async () => {
    const res = await withAuth(request(app)
      .post('/api/bookmarks'))
      .send({ word: 'reservation', phonetic: '/.../', definitionCn: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/bookmarks 包含已添加的单词', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks'));
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].word).toBe('reservation');
  });

  test('PUT /api/bookmarks/:word/practiced 将收藏移入已练习', async () => {
    const res = await withAuth(request(app).put('/api/bookmarks/reservation/practiced')).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('practiced');
  });

  test('GET /api/bookmarks 默认不返回已练习单词', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks'));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('GET /api/bookmarks?includePracticed=1 可返回已练习单词', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks').query({ includePracticed: 1 }));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].word).toBe('reservation');
    expect(res.body.data[0].status).toBe('practiced');
  });

  test('PUT /api/bookmarks/:word/active 可将已练习单词重新加入练习', async () => {
    const res = await withAuth(request(app).put('/api/bookmarks/reservation/active')).send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('active');
  });

  test('GET /api/bookmarks/check/:word 检查收藏', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks/check/reservation'));
    expect(res.status).toBe(200);
    expect(res.body.data.exists).toBe(true);
  });

  test('GET /api/bookmarks/check/:word 未收藏返回 false', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks/check/notexist'));
    expect(res.status).toBe(200);
    expect(res.body.data.exists).toBe(false);
  });

  test('DELETE /api/bookmarks/:word 删除收藏', async () => {
    const res = await withAuth(request(app).delete('/api/bookmarks/reservation'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('GET /api/bookmarks 删除后为空', async () => {
    const res = await withAuth(request(app).get('/api/bookmarks'));
    expect(res.body.data.length).toBe(0);
  });
});

// ======================================================
// 6. 设置 API
// ======================================================
describe('Settings API', () => {
  test('GET /api/settings 返回默认设置', async () => {
    const res = await withAuth(request(app).get('/api/settings'));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.learningLanguage).toBe('en');
    expect(res.body.data.nativeLanguage).toBe('zh-CN');
    expect(res.body.data.showTranslation).toBe(true);
    expect(res.body.data.showHintExamples).toBe(true);
    expect(res.body.data.wordbookAutoRemoveCount).toBe(1);
  });

  test('PUT /api/settings 更新设置', async () => {
    const res = await withAuth(request(app)
      .put('/api/settings'))
      .send({ learningLanguage: 'ja', nativeLanguage: 'en', showTranslation: false, voiceSpeed: 1.5 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.learningLanguage).toBe('en');
    expect(res.body.data.nativeLanguage).toBe('zh-CN');
    expect(res.body.data.showTranslation).toBe(false);
    expect(res.body.data.voiceSpeed).toBe(1.5);
  });

  test('GET /api/settings 持久化验证', async () => {
    const res = await withAuth(request(app)
      .get('/api/settings'));
    expect(res.body.data.learningLanguage).toBe('en');
    expect(res.body.data.nativeLanguage).toBe('zh-CN');
    expect(res.body.data.showTranslation).toBe(false);
    expect(res.body.data.voiceSpeed).toBe(1.5);
  });
});

// ======================================================
// 7. 语音 API
// ======================================================
describe('Voice API', () => {
  test('POST /api/voice/tts 返回语音 URL', async () => {
    const res = await withAuth(request(app)
      .post('/api/voice/tts'))
      .send({ text: 'Hello, this is a test.' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.cacheKey).toBeDefined();
    expect(res.body.data.url).toContain('/data/users/');
    expect(res.body.data.url).toMatch(/\.mp3$/);
  });

  test('POST /api/voice/tts 不传 text 返回 400', async () => {
    const res = await withAuth(request(app)
      .post('/api/voice/tts'))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error).toContain('Text is required');
  });

  test('POST /api/voice/stt 不传文件返回 400', async () => {
    const res = await withAuth(request(app)
      .post('/api/voice/stt'));
    expect(res.status).toBe(400);
  });
});
