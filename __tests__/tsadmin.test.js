jest.mock('../src/services/ai-client');

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');
const adminService = require('../src/services/admin.service');
const tsadminService = require('../src/admin/services/tsadmin.service');
const aiFunctionConfigService = require('../src/services/ai-function-config.service');

describe('tsadmin 管理端', () => {
  let agent;
  let adminUsername;

  beforeAll(async () => {
    db.init();
    agent = request.agent(app);
    adminUsername = `admin${String(Date.now()).slice(-8)}`;
    await adminService.createAdmin({
      username: adminUsername,
      password: '123456',
      adminName: 'Admin Test',
      roleCode: 'super_admin',
      permissions: ['*']
    });

    const username = `user${String(Date.now()).slice(-8)}`;
    await agent
      .post('/api/auth/register')
      .send({ username, password: '123456', displayName: 'Admin Test' });
  });

  afterAll(() => {
    const database = db.getDb();
    if (database) database.close();
  });

  test('GET /tsadmin/login 返回登录页', async () => {
    const res = await agent.get('/tsadmin/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('tsadmin');
    expect(res.text).toContain('登录后台');
  });

  test('POST /tsadmin/login 登录成功并可访问后台首页', async () => {
    const loginRes = await agent
      .post('/tsadmin/login')
      .type('form')
      .send({ username: adminUsername, password: '123456', redirect: '/tsadmin' });

    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe('/tsadmin');
    expect((loginRes.headers['set-cookie'] || []).join(';')).toContain('tsadmin_token=');

    const homeRes = await agent.get('/tsadmin');
    expect(homeRes.status).toBe(200);
    expect(homeRes.text).toContain('后台首页');
    expect(homeRes.text).toContain('最近会话');
  });

  test('普通用户账号不能登录后台', async () => {
    const visitor = request.agent(app);
    const userRow = db.getDb().prepare('SELECT username FROM users ORDER BY created_at DESC LIMIT 1').get();

    const loginRes = await visitor
      .post('/tsadmin/login')
      .type('form')
      .send({ username: userRow.username, password: '123456', redirect: '/tsadmin' });

    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toContain('/tsadmin/login?error=1');
  });

  test('GET /tsadmin/prompts 可查看提示词管理页', async () => {
    const res = await agent.get('/tsadmin/prompts?scenarioId=restaurant');
    expect(res.status).toBe(200);
    expect(res.text).toContain('提示词管理');
    expect(res.text).toContain('提示词工作台');
    expect(res.text).toContain('当前生效链路');
    expect(res.text).toContain('候选提示词');
    expect(res.text).toContain('打开提示词库');
    expect(res.text).toContain('最终编译链路');
    expect(res.text).not.toContain('旧版迁移关系');
    expect(res.text).toContain('餐饮美食 /');
  });

  test('GET /tsadmin/prompt-library 可查看独立提示词库页面', async () => {
    const res = await agent.get('/tsadmin/prompt-library');
    expect(res.status).toBe(200);
    expect(res.text).toContain('提示词库');
    expect(res.text).toContain('提示词列表');
    expect(res.text).toContain('新建提示词');
    expect(res.text).toContain('返回提示词工作台');
    expect(res.text).toContain('操作');
    expect(res.text).toContain('编辑');
  });

  test('GET /tsadmin/model-configs 可查看模型配置页面', async () => {
    const res = await agent.get('/tsadmin/model-configs');
    expect(res.status).toBe(200);
    expect(res.text).toContain('模型配置');
    expect(res.text).toContain('API 平台');
    expect(res.text).toContain('单词卡');
    expect(res.text).toContain('语音转译');
    expect(res.text).toContain('批量保存全部变更');
    expect(res.text).not.toContain('同步到同能力功能');
    expect(res.text).not.toContain('恢复当前卡片');
  });

  test('GET /tsadmin/prompt-library?libraryPromptId=... 以弹窗方式编辑提示词', async () => {
    const prompt = db.getDb().prepare(`
      SELECT id
      FROM admin_ai_prompts
      WHERE feature = 'conversation'
      ORDER BY created_at ASC
      LIMIT 1
    `).get();

    const res = await agent.get(`/tsadmin/prompt-library?libraryPromptId=${encodeURIComponent(prompt.id)}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('编辑提示词');
    expect(res.text).toContain('关闭');
  });

  test('提示词工作台数据包含当前槽位信息', () => {
    const data = tsadminService.getPromptManagementData({
      feature: 'conversation',
      scenarioId: 'restaurant'
    });

    expect(data.selectedFeature).toBe('conversation');
    expect(data.selectedScenarioId).toBe('restaurant');
    expect(Array.isArray(data.slots)).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);
    expect(data.selectedSlot).toBeTruthy();
    expect(Array.isArray(data.selectionSummary)).toBe(true);
    expect(data.selectionSummary.some((item) => item.label === '当前层级')).toBe(true);
    expect(data.currentLayers.some((item) => String(item.promptCode || '').startsWith('generated.'))).toBe(false);
  });

  test('POST /tsadmin/prompts 可保存当前层级绑定且不会触发 next 重复调用', async () => {
    const data = tsadminService.getPromptManagementData({
      feature: 'conversation',
      scenarioId: 'restaurant'
    });
    const currentSlot = data.selectedSlot;
    const targetPrompt = data.candidatePrompts.find((item) => !item.isCurrent) || data.candidatePrompts[0];

    const res = await agent
      .post('/tsadmin/prompts')
      .type('form')
      .send({
        targetType: currentSlot.ownerType === 'system' ? 'system' : 'scenario',
        workbenchFeature: data.selectedFeature,
        feature: currentSlot.feature || '',
        slotKey: currentSlot.slotKey,
        layerCode: currentSlot.layerCode,
        subFeatureCode: currentSlot.subFeatureCode,
        flowCode: currentSlot.flowCode,
        scenarioId: data.selectedScenarioId,
        subTaskId: data.selectedSubTaskId,
        promptId: targetPrompt.id
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/tsadmin/prompts?');
    expect(res.headers.location).toContain('saved=1');
  });

  test('提示词库数据包含筛选列表和编辑表单配置', () => {
    const data = tsadminService.getPromptLibraryManagementData({
      libraryFeature: 'conversation'
    });

    expect(Array.isArray(data.promptLibrary)).toBe(true);
    expect(data.promptLibrary.length).toBeGreaterThan(0);
    expect(data.promptLibraryLayerOptions.some((item) => item.value === 'system')).toBe(true);
    expect(data.promptLibraryLayerOptions.some((item) => item.value === 'scenario')).toBe(true);
    expect(data.promptFormOptions.featureOptions.some((item) => item.value === 'conversation')).toBe(true);
    expect(data.promptFormOptions.featureOptions.some((item) => item.value === 'smart-hint')).toBe(true);
    expect(data.promptFormOptions.featureOptions.some((item) => item.value === 'smart-explain')).toBe(true);
    expect(data.promptFormOptions.featureOptions.some((item) => item.value === 'voice-transcript')).toBe(true);
    expect(data.promptLibrary.some((item) => item.layerCode === 'system')).toBe(true);
    expect(data.promptFormOptions.layerOptionsByFeature['word-card'].some((item) => item.value === 'flow')).toBe(true);
    expect(data.promptFormOptions.layerOptionsByFeature['word-card'].some((item) => item.value === 'scenario')).toBe(false);
    expect(data.promptFormOptions.layerOptionsByFeature['smart-hint'].some((item) => item.value === 'scenario')).toBe(false);
    expect(data.promptFormOptions.layerOptionsByFeature['smart-explain'].some((item) => item.value === 'sub_scenario')).toBe(false);
  });

  test('智能提示和智能讲解工作台不依赖场景与关卡选择', () => {
    const hintData = tsadminService.getPromptManagementData({
      feature: 'smart-hint',
      scenarioId: 'restaurant'
    });
    const explainData = tsadminService.getPromptManagementData({
      feature: 'smart-explain',
      scenarioId: 'restaurant'
    });

    expect(hintData.selectedWorkbench.supportsScenario).toBe(false);
    expect(hintData.selectedScenario).toBeNull();
    expect(explainData.selectedWorkbench.supportsScenario).toBe(false);
    expect(explainData.selectedScenario).toBeNull();
    expect(hintData.slots.every((item) => item.ownerType === 'system')).toBe(true);
    expect(explainData.slots.every((item) => item.ownerType === 'system')).toBe(true);
  });

  test('后台模型配置数据包含按功能拆分的当前配置', () => {
    const data = tsadminService.getModelConfigManagementData();
    expect(Array.isArray(data.functionConfigs)).toBe(true);
    expect(data.functionConfigs.some((item) => item.value === 'conversation')).toBe(true);
    expect(data.functionConfigs.some((item) => item.value === 'smart-hint')).toBe(true);
    expect(data.functionConfigs.some((item) => item.value === 'voice-transcript')).toBe(true);
  });

  test('POST /tsadmin/prompts/library 支持新增和删除提示词', async () => {
    const createRes = await agent
      .post('/tsadmin/prompts/library')
      .type('form')
      .send({
        feature: 'conversation',
        scenarioId: 'restaurant',
        slotKey: '',
        libraryFeature: 'conversation',
        libraryLayerCode: 'flow',
        libraryKeyword: '',
        title: '测试提示词',
        description: '用于管理端 CRUD 测试',
        layerCode: 'flow',
        promptFeature: 'conversation',
        promptSubFeatureCode: 'roleplay',
        promptFlowCode: 'reply',
        promptTargetId: '',
        content: 'Test flow prompt content',
        isActive: '1'
      });

    expect(createRes.status).toBe(302);
    expect(createRes.headers.location).toContain('/tsadmin/prompt-library?');
    expect(createRes.headers.location).toContain('saved=1');

    const created = db.getDb().prepare('SELECT id, prompt_code, category_key, source_ref FROM admin_ai_prompts WHERE title = ? ORDER BY created_at DESC LIMIT 1').get('测试提示词');
    expect(created).toBeTruthy();
    expect(created.prompt_code).toContain('conversation');
    expect(created.category_key).toBe('flow.conversation.roleplay');
    expect(created.source_ref).toBe('admin/manual');

    const deleteRes = await agent
      .post('/tsadmin/prompts/library/delete')
      .type('form')
      .send({
        promptId: created.id,
        feature: 'conversation',
        scenarioId: 'restaurant'
      });

    expect(deleteRes.status).toBe(302);
    const deleted = db.getDb().prepare('SELECT id, is_active FROM admin_ai_prompts WHERE id = ?').get(created.id);
    expect(deleted).toBeDefined();
    expect(Number(deleted.is_active)).toBe(0);
  });

  test('POST /tsadmin/model-configs 支持保存按功能的模型配置', async () => {
    const saveRes = await agent
      .post('/tsadmin/model-configs')
      .type('form')
      .send({
        functionCode: 'smart-hint',
        provider: 'openai',
        model: 'gpt-4o-mini'
      });

    expect(saveRes.status).toBe(302);
    expect(saveRes.headers.location).toContain('/tsadmin/model-configs?');
    expect(saveRes.headers.location).toContain('saved=1');

    const saved = aiFunctionConfigService.resolveFunctionConfig('smart-hint');
    expect(saved.provider).toBe('openai');
    expect(saved.model).toBe('gpt-4o-mini');
  });

  test('POST /tsadmin/model-configs 支持批量保存多个功能配置', async () => {
    const saveRes = await agent
      .post('/tsadmin/model-configs')
      .type('form')
      .send({
        payloadJson: JSON.stringify([
          {
            functionCode: 'conversation',
            provider: 'deepseek',
            model: 'deepseek-chat'
          },
          {
            functionCode: 'smart-explain',
            provider: 'openai',
            model: 'gpt-4.1-mini'
          }
        ])
      });

    expect(saveRes.status).toBe(302);
    expect(saveRes.headers.location).toContain('/tsadmin/model-configs?');
    expect(saveRes.headers.location).toContain('saved=1');
    expect(saveRes.headers.location).toContain('savedCount=2');

    const savedConversation = aiFunctionConfigService.resolveFunctionConfig('conversation');
    const savedExplain = aiFunctionConfigService.resolveFunctionConfig('smart-explain');
    expect(savedConversation.provider).toBe('deepseek');
    expect(savedConversation.model).toBe('deepseek-chat');
    expect(savedExplain.provider).toBe('openai');
    expect(savedExplain.model).toBe('gpt-4.1-mini');
  });
});
