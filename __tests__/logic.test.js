/**
 * TalkScape 业务逻辑验证测试
 *
 * 测试核心业务逻辑的正确性，不仅仅是 API 通断。
 * AI 客户端已 mock (__mocks__/ai-client.js)，无需真实 API Key。
 */
jest.mock('../src/services/ai-client');

const textParser = require('../src/utils/text-parser');
const promptBuilder = require('../src/utils/prompt-builder');
const scenarioService = require('../src/services/scenario.service');
const conversationService = require('../src/services/conversation.service');
const wordService = require('../src/services/word.service');
const settingsService = require('../src/services/settings.service');
const bookmarkService = require('../src/services/bookmark.service');
const promptConfigService = require('../src/services/prompt-config.service');
const aiClient = require('../src/services/ai-client');
const ttsService = require('../src/services/tts.service');
const config = require('../src/config');

const db = require('../src/db');
const DEFAULT_MAX_TURNS = Math.max(1, Number(config.conversation?.maxTurns) || 50);

beforeAll(() => { db.init(); });

// ======================================================
// 1. 文本解析器 — 纯函数，无需 DB
// ======================================================
describe('Text Parser — 文本解析逻辑', () => {
  describe('parseAiResponse()', () => {
    test('解析完整 JSON 回复', () => {
      const result = textParser.parseAiResponse(JSON.stringify({
        english: 'Hello! Welcome to our restaurant.',
        chinese: '你好！欢迎来到我们餐厅。',
        userHintIdea: '先说明你是否有预约。',
        userHintIdeaCn: '先说明你是否有预约。',
        userHintExample: 'Do you have a table for two?',
        userHintExampleCn: '你们有两人的桌子吗？'
      }));
      expect(result.english).toBe('Hello! Welcome to our restaurant.');
      expect(result.chinese).toBe('你好！欢迎来到我们餐厅。');
      expect(result.userHintIdea).toBe('先说明你是否有预约。');
      expect(result.userHintIdeaCn).toBe('先说明你是否有预约。');
      expect(result.userHintExample).toBe('Do you have a table for two?');
      expect(result.userHintExampleCn).toBe('你们有两人的桌子吗？');
      expect(result.userHint).toBe('Do you have a table for two?');
      expect(result.userHintCn).toBe('你们有两人的桌子吗？');
    });

    test('解析含缺失字段的 JSON', () => {
      const result = textParser.parseAiResponse(JSON.stringify({
        english: 'Hello!'
      }));
      expect(result.english).toBe('Hello!');
      expect(result.chinese).toBe('');    // 缺失字段返回空字符串
      expect(result.userHint).toBeNull(); // 缺失字段返回 null
      expect(result.userHintCn).toBeNull();
      expect(result.userHintIdea).toBeNull();
      expect(result.userHintExample).toBeNull();
    });

    test('解析无效 JSON（非 JSON 格式）降级为纯文本', () => {
      const result = textParser.parseAiResponse('Hello, this is a plain text response.');
      expect(result.english).toBe('Hello, this is a plain text response.');
      expect(result.chinese).toBe('');
      expect(result.userHint).toBeNull();
      expect(result.userHintCn).toBeNull();
      expect(result.userHintIdea).toBeNull();
      expect(result.userHintExample).toBeNull();
    });

    test('解析空字符串', () => {
      const result = textParser.parseAiResponse('');
      expect(result.english).toBe('');
      expect(result.chinese).toBe('');
      expect(result.userHint).toBeNull();
      expect(result.userHintCn).toBeNull();
      expect(result.userHintIdea).toBeNull();
      expect(result.userHintExample).toBeNull();
    });

    test('解析 JSON 字段值为 null，安全降级为空字符串或 null', () => {
      const result = textParser.parseAiResponse(JSON.stringify({
        english: null,
        chinese: null
      }));
      expect(result.english).toBe('');
      expect(result.chinese).toBe('');
      expect(result.userHint).toBeNull();
      expect(result.userHintCn).toBeNull();
      expect(result.userHintIdea).toBeNull();
      expect(result.userHintExample).toBeNull();
    });

    test('JSON 中 english 为数字类型，不会被降级（truthy 值通过）', () => {
      const result = textParser.parseAiResponse(JSON.stringify({
        english: 12345
      }));
      // 12345 是 truthy，163..english || '' 返回 12345
      expect(result.english).toBe(12345);
      expect(result.chinese).toBe('');
    });

    test('兼容旧 userHint 字段并映射为例句', () => {
      const result = textParser.parseAiResponse(JSON.stringify({
        english: 'Hello!',
        userHint: 'Try this sentence.',
        userHintCn: '试试这句话。'
      }));
      expect(result.userHintExample).toBe('Try this sentence.');
      expect(result.userHintExampleCn).toBe('试试这句话。');
      expect(result.userHint).toBe('Try this sentence.');
      expect(result.userHintCn).toBe('试试这句话。');
    });

    test('纯数字字符串是合法 JSON，parse 后无 english 字段返回空', () => {
      // '42' 是合法 JSON，JSON.parse('42') 返回数字 42
      // parsed.english 为 undefined → 回退为 ''
      const result = textParser.parseAiResponse('42');
      expect(result.english).toBe('');
    });
  });

  describe('extractWords()', () => {
    test('从英文文本中提取单词', () => {
      const words = textParser.extractWords('Hello, welcome to our restaurant!');
      expect(words).toEqual(['hello', 'welcome', 'to', 'our', 'restaurant']);
    });

    test('去重并转小写', () => {
      const words = textParser.extractWords('Hello hello HELLO');
      expect(words).toHaveLength(1);
      expect(words).toEqual(['hello']);
    });

    test('无英文字符返回空数组', () => {
      const words = textParser.extractWords('你好 餐厅 123！');
      expect(words).toEqual([]);
    });

    test('混合中英文', () => {
      const words = textParser.extractWords('Please 帮我 order a coffee 谢谢');
      expect(words).toEqual(['please', 'order', 'a', 'coffee']);
    });

    test('空字符串返回空数组', () => {
      const words = textParser.extractWords('');
      expect(words).toEqual([]);
    });

    test('连字符单词被拆分为单独单词', () => {
      const words = textParser.extractWords('well-known check-in');
      expect(words).toContain('well');
      expect(words).toContain('known');
      expect(words).toContain('check');
      expect(words).toContain('in');
    });

    test('单词带数字后缀，数字被过滤', () => {
      const words = textParser.extractWords('room123 floor4');
      expect(words).toEqual(['room', 'floor']);
    });
  });

  describe('cleanText()', () => {
    test('去除多余空格', () => {
      expect(textParser.cleanText('  Hello   world  ')).toBe('Hello world');
    });

    test('空字符串', () => {
      expect(textParser.cleanText('')).toBe('');
    });

    test('只包含空格的字符串', () => {
      expect(textParser.cleanText('   ')).toBe('');
    });

    test('包含换行符和制表符', () => {
      expect(textParser.cleanText('Hello\n\tWorld')).toBe('Hello World');
    });
  });
});

// ======================================================
// 2. Prompt 构建器 — 纯函数，只需文件系统
// ======================================================
describe('Prompt Builder — Prompt 构建逻辑', () => {
  describe('buildSystemPrompt()', () => {
    test('返回已知场景的角色设定', () => {
      const prompt = promptBuilder.buildSystemPrompt('restaurant');
      expect(prompt).toContain('TalkScape');
      expect(prompt).toContain('waiter');
      expect(prompt).toContain('restaurant');
    });

    test('返回机场场景的角色设定', () => {
      const prompt = promptBuilder.buildSystemPrompt('airport');
      expect(prompt).toContain('airline staff');
    });

    test('未知场景 ID 返回默认内容（system-prompt.md）', () => {
      const prompt = promptBuilder.buildSystemPrompt('shopping');
      expect(prompt).toBeDefined();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Mandatory rules');
      expect(prompt).toContain('English roleplay exercise');
    });

    test('传入日语学习语言时，系统提示词会切换为日语对话约束', () => {
      const prompt = promptBuilder.buildSystemPrompt('restaurant', {
        learningLanguage: 'ja',
        nativeLanguage: 'zh-CN'
      });

      expect(prompt).toContain('Japanese roleplay exercise');
      expect(prompt).toContain('"english" must contain the learner-facing target-language sentence');
    });
  });

  describe('数据库提示词种子', () => {
    test('初始化后会把默认提示词种入 admin_ai_prompts 和 admin_prompt_bindings', () => {
      const database = db.getDb();
      const prompts = database.prepare(`
        SELECT layer_code, feature, target_id, category_key, source_ref
        FROM admin_ai_prompts
        ORDER BY layer_code ASC, feature ASC, target_id ASC
      `).all();
      const bindings = database.prepare(`
        SELECT owner_type, owner_id, layer_code, feature, flow_code
        FROM admin_prompt_bindings
        ORDER BY owner_type ASC, owner_id ASC, layer_code ASC
      `).all();

      expect(prompts.length).toBeGreaterThan(0);
      expect(bindings.length).toBeGreaterThan(0);
      expect(prompts.some((item) => item.layer_code === 'system' && item.category_key === 'system.global')).toBe(true);
      expect(prompts.some((item) => item.layer_code === 'feature' && item.feature === 'conversation')).toBe(true);
      expect(prompts.some((item) => item.layer_code === 'scenario' && item.feature === 'conversation' && item.target_id === 'restaurant')).toBe(true);
      expect(prompts.some((item) => item.layer_code === 'template' && item.target_id === 'conversation')).toBe(true);
      expect(bindings.some((item) => item.owner_type === 'system' && item.layer_code === 'feature' && item.feature === 'conversation')).toBe(true);
      expect(bindings.some((item) => item.owner_type === 'scenario' && item.owner_id === 'restaurant' && item.layer_code === 'scenario')).toBe(true);
    });

    test('旧版提示词迁移关系可追溯到新提示词实体', () => {
      const prompts = promptConfigService.listPromptDefinitions({
        feature: 'conversation',
        includeInactive: false
      });
      const prompt = prompts.find((item) => item.id === 'prompt-conversation-reply-flow');

      expect(prompt).toBeTruthy();
      expect(prompt.legacySourceId).toBe('prompt-template-legacy-conversation');
      expect(prompt.legacySourceTitle).toContain('旧版对话模板');
      expect(prompt.legacySourceCode).toBe('template.legacy.conversation');
    });

    test('遗留模板优先从数据库读取，缺失时再回退文件', () => {
      const prompt = promptBuilder.buildConversationPrompt({
        systemPrompt: 'You are a waiter.',
        title: 'Restaurant Ordering',
        difficulty: 'beginner'
      });

      expect(prompt).toContain('AI 对话提示词模板');
      expect(prompt).toContain('You are a waiter.');
      expect(prompt).toContain('Restaurant Ordering');
    });

    test('提示词实体支持新增、编辑、删除', () => {
      const created = promptConfigService.createPromptDefinition({
        title: '测试单词解释流',
        description: '测试用提示词',
        layerCode: 'flow',
        feature: 'word-card',
        subFeatureCode: 'dictionary',
        flowCode: 'explain',
        content: 'Return test JSON content.',
        sortOrder: 888,
        isActive: true
      });

      expect(created.id).toBeDefined();
      expect(created.promptCode).toContain('word-card');
      expect(created.categoryKey).toBe('flow.word-card.dictionary');
      expect(created.sourceRef).toBe('admin/manual');

      const updated = promptConfigService.updatePromptDefinition(created.id, {
        title: '测试单词解释流-已更新',
        content: 'Return updated JSON content.'
      });

      expect(updated.title).toBe('测试单词解释流-已更新');
      expect(updated.content).toContain('updated');

      const removed = promptConfigService.deletePromptDefinition(created.id);
      expect(removed.id).toBe(created.id);
      expect(promptConfigService.getPromptById(created.id)).toBeNull();
    });

    test('场景和关卡默认提示词会作为可编辑绑定入库，且不再追加 generated 层', () => {
      const database = db.getDb();
      const firstSubtask = database.prepare(`
        SELECT id, scenario_id
        FROM scenario_subtasks
        WHERE scenario_id = ?
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 1
      `).get('restaurant');

      expect(firstSubtask).toBeTruthy();

      const subScenarioPrompt = database.prepare(`
        SELECT id, prompt_code, layer_code, target_id
        FROM admin_ai_prompts
        WHERE layer_code = 'sub_scenario'
          AND target_id = ?
        LIMIT 1
      `).get(firstSubtask.id);
      expect(subScenarioPrompt).toBeTruthy();
      expect(subScenarioPrompt.prompt_code).toContain(firstSubtask.id);

      const bundle = promptConfigService.getScenarioPromptBundle({
        scenarioId: 'restaurant',
        subScenarioId: firstSubtask.id,
        feature: 'conversation',
        subFeatureCode: 'roleplay',
        flowCode: 'reply'
      });

      expect(bundle.layers.some((item) => item.source === 'generated')).toBe(false);
      expect(bundle.layers.some((item) => item.layerCode === 'scenario' && item.source === 'scenario-binding')).toBe(true);
      expect(bundle.layers.some((item) => item.layerCode === 'sub_scenario' && item.source === 'sub-scenario-binding')).toBe(true);
    });
  });

  describe('buildConversationPrompt()', () => {
    const testConfig = {
      systemPrompt: 'You are a waiter.',
      title: 'Restaurant Ordering',
      difficulty: 'beginner'
    };

    test('模板替换正确', () => {
      const result = promptBuilder.buildConversationPrompt(testConfig);
      expect(result).toContain('You are a waiter.');
      expect(result).toContain('Restaurant Ordering');
      expect(result).toContain('beginner');
    });

    test('含输出格式要求', () => {
      const result = promptBuilder.buildConversationPrompt(testConfig);
      expect(result).toContain('"english"');
      expect(result).toContain('"chinese"');
      expect(result).toContain('"userHintIdea"');
      expect(result).toContain('"userHintExample"');
    });
  });

  describe('buildWordExplanationPrompt()', () => {
    test('包含单词和上下文', () => {
      const result = promptBuilder.buildWordExplanationPrompt('reservation', 'Do you have a reservation?');
      expect(result).toContain('reservation');
      expect(result).toContain('Do you have a reservation?');
    });

    test('无上下文也能生成', () => {
      const result = promptBuilder.buildWordExplanationPrompt('hello');
      expect(result).toContain('hello');
      expect(result).toContain('JSON');
    });

    test('单词含特殊字符，原样包含', () => {
      const result = promptBuilder.buildWordExplanationPrompt("don't", "I don't know");
      expect(result).toContain("don't");
      expect(result).toContain("I don't know");
    });

    test('词卡提示词走统一加载流并强调母语说明', () => {
      const result = promptBuilder.buildWordExplanationPrompt('menu', 'Can I see the menu?');
      expect(result).toContain('TalkScape');
      expect(result).toContain('definitionCn');
      expect(result).toContain('Use Simplified Chinese for definitionCn');
    });
  });

  describe('Prompt Config Layering()', () => {
    test('支持系统级、功能级、场景级提示词叠加', () => {
      const database = db.getDb();
      const suffix = Date.now().toString();
      const customSystemPromptId = `test-system-${suffix}`;
      const customFeaturePromptId = `test-feature-${suffix}`;
      const customScenarioPromptId = `test-scenario-${suffix}`;

      database.prepare(`
        INSERT INTO admin_ai_prompts (
          id, prompt_code, title, description, layer_code, feature, sub_feature_code,
          flow_code, target_id, category_key, source_ref, content, sort_order, is_builtin, is_active
        ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, '', ?, 999, 0, 1)
      `).run(
        customSystemPromptId,
        `test.system.${suffix}`,
        'Test System Prompt',
        'system',
        '',
        '',
        '',
        '',
        'test.system',
        'Global legal rule block'
      );
      database.prepare(`
        INSERT INTO admin_ai_prompts (
          id, prompt_code, title, description, layer_code, feature, sub_feature_code,
          flow_code, target_id, category_key, source_ref, content, sort_order, is_builtin, is_active
        ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, '', ?, 999, 0, 1)
      `).run(
        customFeaturePromptId,
        `test.feature.${suffix}`,
        'Test Feature Prompt',
        'feature',
        'conversation',
        '',
        '',
        '',
        'test.feature',
        'Conversation feature rule block'
      );
      database.prepare(`
        INSERT INTO admin_ai_prompts (
          id, prompt_code, title, description, layer_code, feature, sub_feature_code,
          flow_code, target_id, category_key, source_ref, content, sort_order, is_builtin, is_active
        ) VALUES (?, ?, ?, '', ?, ?, ?, ?, ?, ?, '', ?, 999, 0, 1)
      `).run(
        customScenarioPromptId,
        `test.scenario.${suffix}`,
        'Test Scenario Prompt',
        'scenario',
        'conversation',
        'roleplay',
        'reply',
        'restaurant',
        'test.scenario',
        'Restaurant scenario override block'
      );

      promptConfigService.replacePromptBindings({
        ownerType: promptConfigService.OWNER_TYPES.SYSTEM,
        ownerId: 'default',
        layerCode: promptConfigService.LAYER_CODES.SYSTEM,
        promptIds: customSystemPromptId
      });
      promptConfigService.replacePromptBindings({
        ownerType: promptConfigService.OWNER_TYPES.SYSTEM,
        ownerId: 'default',
        layerCode: promptConfigService.LAYER_CODES.FEATURE,
        feature: 'conversation',
        promptIds: customFeaturePromptId
      });
      promptConfigService.replacePromptBindings({
        ownerType: promptConfigService.OWNER_TYPES.SCENARIO,
        ownerId: 'restaurant',
        layerCode: promptConfigService.LAYER_CODES.SCENARIO,
        feature: 'conversation',
        subFeatureCode: 'roleplay',
        flowCode: 'reply',
        targetId: 'restaurant',
        promptIds: customScenarioPromptId
      });

      const prompt = promptBuilder.buildSystemPrompt('restaurant');
      expect(prompt).toContain('Global legal rule block');
      expect(prompt).toContain('Conversation feature rule block');
      expect(prompt).toContain('Restaurant scenario override block');
    });
  });
});

// ======================================================
// 3. 对话服务 — 业务核心
// ======================================================
describe('Conversation Service — 对话业务逻辑', () => {
  let session;

  test('createSession() 创建默认参数的会话', () => {
    session = conversationService.createSession({ scenarioId: 'restaurant' });
    const scenario = scenarioService.getScenarioById('restaurant');
    expect(session.id).toBeDefined();
    expect(session.scenarioId).toBe('restaurant');
    expect(session.status).toBe('active');
    expect(session.currentTurn).toBe(0);
    expect(session.maxTurns).toBe(Number(scenario.max_turns || scenario.maxTurns) || DEFAULT_MAX_TURNS);
  });

  test('createSession() 支持自定义 maxTurns', () => {
    const s = conversationService.createSession({ scenarioId: 'airport', maxTurns: 3 });
    expect(s.maxTurns).toBe(3);
    expect(s.currentTurn).toBe(0);
  });

  test('getSession() 返回会话对象', () => {
    const s = conversationService.getSession(session.id);
    expect(s).toBeDefined();
    expect(s.id).toBe(session.id);
  });

  test('getSession() 不存在的会话返回 undefined', () => {
    const s = conversationService.getSession('non-existent');
    expect(s).toBeUndefined();
  });

  test('addMessage() 增加 turn_number', async () => {
    const msg = await conversationService.addMessage(session.id, {
      role: 'user',
      english: 'Hello',
      chinese: '你好'
    });
    // addMessage 使用 await，但底层是同步的
    expect(msg.turnNumber).toBe(1);
    const updated = conversationService.getSession(session.id);
    expect(updated.current_turn).toBe(0);
  });

  test('addMessage() 增加第二条消息，turn 递增', async () => {
    const msg = await conversationService.addMessage(session.id, {
      role: 'ai',
      english: 'Welcome!',
      chinese: '欢迎！'
    });
    expect(msg.turnNumber).toBe(2);
    const updated = conversationService.getSession(session.id);
    expect(updated.current_turn).toBe(1);
  });

  test('getMessages() 按 turn_number 排序返回', () => {
    const messages = conversationService.getMessages(session.id);
    expect(messages.length).toBe(2);
    expect(messages[0].turn_number).toBe(1);
    expect(messages[0].role).toBe('user');
    expect(messages[1].turn_number).toBe(2);
    expect(messages[1].role).toBe('ai');
  });

  test('generateAiResponse() 返回包含必需字段的 AI 回复', async () => {
    const result = await conversationService.generateAiResponse(session.id, 'Can I see the menu?');
    expect(result.messageId).toBeDefined();
    expect(result.english).toBeDefined();
    expect(result.english.length).toBeGreaterThan(0);
    expect(result.chinese).toBeDefined();
    expect(result.currentTurn).toBe(2);
    expect(result.isComplete).toBe(false);
    expect(result.userHintIdea).toBeDefined();
    expect(result.userHintIdeaCn).toBeDefined();
    expect(result.userHintExample).toBeDefined();
    expect(result.userHintExampleCn).toBeDefined();
    expect(result.userHint).toBe(result.userHintExample);
    expect(result.userHintCn).toBe(result.userHintExampleCn);
  });

  test('generateAiResponse() 不存在的会话抛出错误', async () => {
    await expect(
      conversationService.generateAiResponse('non-existent', 'test')
    ).rejects.toThrow('Session not found');
  });

  test('completeSession() 将状态改为 completed', () => {
    const result = conversationService.completeSession(session.id);
    expect(result.status).toBe('completed');
    const updated = conversationService.getSession(session.id);
    expect(updated.status).toBe('completed');
  });

  test('getSessionResult() 返回完整的统计信息', () => {
    const result = conversationService.getSessionResult(session.id);
    expect(result.session).toBeDefined();
    expect(result.session.status).toBe('completed');
    expect(result.stats).toBeDefined();
    expect(result.stats.totalMessages).toBeGreaterThanOrEqual(3); // 2 条手动 + 1 条 AI
    expect(result.stats.userMessages).toBeGreaterThanOrEqual(1);
    expect(result.stats.aiMessages).toBeGreaterThanOrEqual(2);
    expect(typeof result.stats.wordsLearned).toBe('number');
  });

  test('getLatestSessionByScenario() 返回当前场景最近未删除会话', () => {
    const dedicated = conversationService.createSession({
      scenarioId: 'airport',
      userId: `latest-user-${Date.now()}`
    });
    const latest = conversationService.getLatestSessionByScenario('airport', dedicated.userId);
    expect(latest).toBeDefined();
    expect(latest.id).toBe(dedicated.id);
  });

  test('getUserScenarioProgress() 返回用户已完成场景集合', () => {
    const userId = `scenario-progress-${Date.now()}`;
    const completedSession = conversationService.createSession({ scenarioId: 'restaurant', userId, maxTurns: 1 });
    conversationService.addMessage(completedSession.id, { role: 'user', english: 'Done', chinese: '完成' });
    conversationService.completeSession(completedSession.id, userId);

    const progress = scenarioService.getUserScenarioProgress(userId);
    expect(progress.completedScenarioIds).toContain('restaurant');
    expect(progress.completedScenarioMap.restaurant.completed).toBe(true);
    expect(progress.completedScenarioMap.restaurant.completedAt).toBeTruthy();
  });

  test('词本闯关不会恢复最近会话，每次进入都应重新开始', () => {
    const dedicated = conversationService.createSession({
      scenarioId: 'wordbook-review',
      userId: `wordbook-fresh-${Date.now()}`
    });
    const latest = conversationService.getLatestSessionByScenario('wordbook-review', dedicated.userId);
    expect(dedicated).toBeDefined();
    expect(latest).toBeNull();
  });

  test('词本闯关不会再强制过滤回答例句，信任大模型输出', async () => {
    const originalChat = aiClient.chat;
    const bookmarkWord = `menus-${Date.now()}`;
    const userId = `wordbook-hint-${Date.now()}`;
    bookmarkService.addBookmark({ word: bookmarkWord, definitionCn: '菜单', userId });
    try {
      aiClient.chat = jest.fn().mockResolvedValue({
        content: JSON.stringify({
          english: 'Hello there.',
          chinese: '你好。',
          userHintIdea: '你可以自然提到菜单选择。',
          userHintIdeaCn: '你可以自然提到菜单选择。',
          userHintExample: 'I would like to sit by the window.',
          userHintExampleCn: '我想坐在窗边。'
        })
      });

      const session = conversationService.createSession({ scenarioId: 'wordbook-review', userId });
      const result = await conversationService.generateAiResponse(session.id, 'Hi there', userId);

      expect(result.userHintIdea).toContain('菜单');
      expect(result.userHintExample).toBe('I would like to sit by the window.');
      expect(result.userHintExampleCn).toBe('我想坐在窗边。');
    } finally {
      aiClient.chat = originalChat;
      bookmarkService.removeBookmark(bookmarkWord, userId);
    }
  });


  test('restartSession() 会软删除旧会话和消息，并创建新会话', async () => {
    const restarted = conversationService.restartSession({
      sessionId: session.id,
      userId: session.userId
    });

    expect(restarted.id).toBeDefined();
    expect(restarted.id).not.toBe(session.id);
    expect(restarted.scenarioId).toBe('restaurant');

    const database = require('../src/db').getDb();
    const oldSession = database.prepare('SELECT del, status FROM conversation_sessions WHERE id = ?').get(session.id);
    const oldMessages = database.prepare('SELECT COUNT(*) AS count FROM conversation_messages WHERE session_id = ? AND del = 1').get(session.id);

    expect(oldSession.del).toBe(1);
    expect(oldSession.status).toBe('deleted');
    expect(oldMessages.count).toBeGreaterThan(0);
  });

  test('ensureOpeningMessage() 在空会话中生成首条 AI 开场且不计入回合数', async () => {
    const openingSession = conversationService.createSession({ scenarioId: 'restaurant', maxTurns: 5 });
    const result = await conversationService.ensureOpeningMessage(openingSession.id);
    const messages = conversationService.getMessages(openingSession.id);
    const updated = conversationService.getSession(openingSession.id);

    expect(result).toBeDefined();
    expect(result.opener).toBe(true);
    expect(result.english).toBeDefined();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('ai');
    expect(messages[0].user_input_type).toBe('opening');
    expect(updated.current_turn).toBe(0);
  });
});

describe('Voice Cache — 语音缓存与补全', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ensureTextToSpeech() 对相同文本复用缓存，不重复调用 TTS', async () => {
    const spy = jest.spyOn(aiClient, 'textToSpeech');
    const uniqueText = `Hello there ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const first = await ttsService.ensureTextToSpeech(uniqueText, { voice: 'alloy' });
    const second = await ttsService.ensureTextToSpeech(`  ${uniqueText}  `, { voice: 'alloy' });

    expect(first.url).toBeDefined();
    expect(second.url).toBe(first.url);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('ensureMessageVoice() 可为历史 AI 消息补生成语音', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    const added = await conversationService.addMessage(s.id, {
      role: 'ai',
      english: 'Historical AI message',
      chinese: '历史消息',
      voiceUrl: null
    });

    const result = await conversationService.ensureMessageVoice(s.id, added.messageId);
    const messages = conversationService.getMessages(s.id);
    const aiMsg = messages.find((msg) => msg.id === added.messageId);

    expect(result.voiceUrl).toContain('/data/users/');
    expect(aiMsg.voice_url).toBe(result.voiceUrl);
  });

  test('ensureMessageVoice() 不允许为用户消息请求语音', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    const added = await conversationService.addMessage(s.id, {
      role: 'user',
      english: 'I would like a table for two.',
      chinese: '我想要一张两人桌。'
    });

    await expect(
      conversationService.ensureMessageVoice(s.id, added.messageId)
    ).rejects.toThrow('Voice is only available for AI messages');
  });
});

// ======================================================
// 3b. 会话状态保护 — 关键逻辑缺陷验证
// ======================================================
describe('Session State Protection — 会话状态保护', () => {
  let activeSession, completedSession;

  beforeAll(async () => {
    activeSession = conversationService.createSession({ scenarioId: 'restaurant', maxTurns: 5 });
    completedSession = conversationService.createSession({ scenarioId: 'airport', maxTurns: 1 });
    // 补充一条消息后触发 AI 回复完成会话
    conversationService.addMessage(completedSession.id, { role: 'user', english: 'Hi', chinese: '你好' });
    await conversationService.generateAiResponse(completedSession.id, 'Hello');
  });

  test('getSessionResult() 不存在的会话抛出错误', () => {
    expect(() => conversationService.getSessionResult('non-existent-session-xyz')).toThrow('Session not found');
  });

  test('已完成的会话不能添加新消息（应抛出错误）', async () => {
    await expect(
      conversationService.addMessage(completedSession.id, { role: 'user', english: 'Extra', chinese: '额外' })
    ).rejects.toThrow(/completed/);
  });

  test('已完成的会话继续发送时返回完成提示', async () => {
    const result = await conversationService.generateAiResponse(completedSession.id, 'Try again');
    expect(result.isComplete).toBe(true);
    expect(result.completedNotice).toBe(true);
    expect(result.english).toContain('Congratulations');
  });

  test('completeSession() 不存在的会话不报错（幂等）', () => {
    expect(() => conversationService.completeSession('non-existent-session')).not.toThrow();
  });

  test('completeSession() 已完成的会话不报错（幂等）', () => {
    expect(() => conversationService.completeSession(completedSession.id)).not.toThrow();
  });

  test('活跃会话可以正常添加消息', async () => {
    const msg = await conversationService.addMessage(activeSession.id, { role: 'user', english: 'Test', chinese: '测试' });
    expect(msg.turnNumber).toBe(1);
  });

  test('活跃会话可以生成 AI 回复', async () => {
    const result = await conversationService.generateAiResponse(activeSession.id, 'Are you ready?');
    expect(result.english).toBeDefined();
    expect(result.isComplete).toBe(false);
    expect(result.currentTurn).toBe(1);
  });
});

// ======================================================
// 4. 自动完成逻辑 — maxTurns 到达后返回完成提示
// ======================================================
describe('Auto Complete — 对话自动完成逻辑', () => {
  test('当 AI 回复达到 maxTurns 时标记 completed', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant', maxTurns: 1 });

    // 用户消息不计入 currentTurn，第一条 AI 回复达到上限后完成
    conversationService.addMessage(s.id, { role: 'user', english: 'Hi', chinese: '你好' });
    const result = await conversationService.generateAiResponse(s.id, 'Hello again');
    expect(result.isComplete).toBe(true);
    expect(result.completedNotice).toBe(false);
    expect(result.currentTurn).toBe(1);

    const updated = conversationService.getSession(s.id);
    expect(updated.status).toBe('completed');

    const messages = conversationService.getMessages(s.id);
    expect(messages.length).toBe(2);
  });

  test('maxTurns 边界值 — 只统计 AI 回复数', async () => {
    const s = conversationService.createSession({ scenarioId: 'airport', maxTurns: 2 });

    conversationService.addMessage(s.id, { role: 'user', english: 'A', chinese: 'a' });
    conversationService.addMessage(s.id, { role: 'ai', english: 'B', chinese: 'b' });
    conversationService.addMessage(s.id, { role: 'user', english: 'C', chinese: 'c' });

    // 此时 currentTurn = 1，因为只有一条 AI 回复
    const result = await conversationService.generateAiResponse(s.id, 'D');
    expect(result.isComplete).toBe(true);
    expect(result.currentTurn).toBe(2);

    const messages = conversationService.getMessages(s.id);
    expect(messages.length).toBe(4);
  });
});

describe('Wordbook Challenge — 无限循环上下文窗口', () => {
  test('词本闯关达到上限后仍可继续对话，并只向 AI 发送最近窗口消息', async () => {
    const chatSpy = jest.spyOn(aiClient, 'chat');
    const session = conversationService.createSession({ scenarioId: 'wordbook-review', maxTurns: 2 });

    await conversationService.addMessage(session.id, { role: 'user', english: 'old user 1', chinese: '旧用户1' });
    await conversationService.addMessage(session.id, { role: 'ai', english: 'old ai 1', chinese: '旧AI1' });
    await conversationService.addMessage(session.id, { role: 'user', english: 'old user 2', chinese: '旧用户2' });
    await conversationService.addMessage(session.id, { role: 'ai', english: 'old ai 2', chinese: '旧AI2' });
    await conversationService.addMessage(session.id, { role: 'user', english: 'recent user 3', chinese: '最近用户3' });
    await conversationService.addMessage(session.id, { role: 'ai', english: 'recent ai 3', chinese: '最近AI3' });

    const result = await conversationService.generateAiResponse(session.id, 'fresh user 4');
    const conversationCall = [...chatSpy.mock.calls].reverse().find((call) => call?.[1]?.functionCode === 'conversation');
    const sentMessages = conversationCall?.[0] || [];
    const sentContents = sentMessages.map((item) => item.content);
    const updatedSession = conversationService.getSession(session.id);

    expect(result.isComplete).toBe(false);
    expect(result.completedNotice).toBe(false);
    expect(updatedSession.status).toBe('active');
    expect(updatedSession.current_turn).toBe(4);
    expect(sentMessages).toHaveLength(6);
    expect(sentContents).not.toContain('old user 1');
    expect(sentContents).not.toContain(JSON.stringify({ english: 'old ai 1', chinese: '旧AI1' }));
    expect(sentContents).toContain('old user 2');
    expect(sentContents).toContain(JSON.stringify({ english: 'old ai 2', chinese: '旧AI2' }));
    expect(sentContents).toContain('recent user 3');
    expect(sentContents).toContain(JSON.stringify({ english: 'recent ai 3', chinese: '最近AI3' }));
    expect(sentContents).toContain('fresh user 4');

    chatSpy.mockRestore();
  });
});

describe('Theme Free Mode — 同主题无限自由模式', () => {
  test('关卡通关后切入主题自由模式时不会被 maxTurns 强制结束', async () => {
    const session = conversationService.createSession({
      scenarioId: 'restaurant',
      subTaskId: '__theme_free_mode__',
      maxTurns: 1,
      userId: `theme-free-${Date.now()}`
    });

    await conversationService.addMessage(session.id, {
      role: 'user',
      english: 'I already finished the ordering task.',
      chinese: '我已经完成点餐环节了。'
    }, session.userId);

    const first = await conversationService.generateAiResponse(session.id, 'Let us keep chatting in the restaurant theme.', session.userId);

    await conversationService.addMessage(session.id, {
      role: 'user',
      english: 'What dessert do you recommend?',
      chinese: '你推荐什么甜点？'
    }, session.userId);

    const second = await conversationService.generateAiResponse(session.id, 'I want something not too sweet.', session.userId);
    const updated = conversationService.getSession(session.id, session.userId);

    expect(first.isComplete).toBe(false);
    expect(second.isComplete).toBe(false);
    expect(updated.status).toBe('active');
    expect(updated.current_turn).toBeGreaterThan(1);
  });
});

// ======================================================
// 5. 单词服务
// ======================================================
describe('Word Service — 单词逻辑', () => {
  test('getWordDetail() 返回格式化的单词信息', async () => {
    const detail = await wordService.getWordDetail('reservation', 'Do you have a reservation?');
    expect(detail.word).toBe('reservation');
    expect(detail.phonetic).toBeDefined();
    expect(detail.definitionCn).toBeDefined();
    expect(detail.definitionEn).toBeDefined();
    expect(Array.isArray(detail.partOfSpeech)).toBe(true);
    expect(Array.isArray(detail.exampleSentences)).toBe(true);
    expect(Array.isArray(detail.usageNotes)).toBe(true);
    expect(Array.isArray(detail.synonyms)).toBe(true);
  });

  test('getWordDetail() 无上下文也能工作', async () => {
    const detail = await wordService.getWordDetail('reservation');
    expect(detail.word).toBe('reservation');
    expect(detail.definitionCn).toBeDefined();
  });

  test('getWordDetail() 会按学习语言生成对应词卡', async () => {
    const uniqueWord = `ja-word-${Date.now()}`;
    const detail = await wordService.getWordDetail(uniqueWord, `${uniqueWord} の例文です。`, {
      learningLanguage: 'ja',
      nativeLanguage: 'zh-CN'
    });

    expect(detail.word).toBe(uniqueWord);
    expect(detail.language).toBe('ja');
    expect(detail.nativeLanguage).toBe('zh-CN');
    expect(detail.exampleSentences[0].english).toContain('例文');
  });

  test('getWordDetail() 空单词抛出异常', async () => {
    await expect(wordService.getWordDetail('')).rejects.toThrow('Word is required');
    await expect(wordService.getWordDetail(null)).rejects.toThrow('Word is required');
    await expect(wordService.getWordDetail(undefined)).rejects.toThrow('Word is required');
  });

  test('getWordDetail() 转小写', async () => {
    const detail = await wordService.getWordDetail('RESERVATION');
    expect(detail.word).toBe('reservation');
  });

  test('getWordDetail() 会写入数据库缓存并优先复用', async () => {
    const first = await wordService.getWordDetail('menu', 'Can I see the menu?');
    expect(first.word).toBe('menu');

    const database = db.getDb();
    const cached = database.prepare('SELECT * FROM word_dictionary_entries WHERE word = ?').get('menu');
    expect(cached).toBeDefined();

    database.prepare(`
      UPDATE word_dictionary_entries
      SET definition_cn = ?
      WHERE word = ?
    `).run('缓存释义', 'menu');

    const second = await wordService.getWordDetail('menu');
    expect(second.definitionCn).toBe('缓存释义');
  });


  test('getWordDetail() 遇到首轮脏数据会重试并返回有效词卡', async () => {
    const spy = jest.spyOn(aiClient, 'generateWordExplanation');
    try {
      spy
        .mockImplementationOnce(async () => ({
          definitionCn: '',
          definitionEn: '',
          exampleSentences: [],
          usageNotes: [],
          synonyms: []
        }))
        .mockImplementationOnce(async (word) => ({
          term: word,
          language: 'en',
          nativeLanguage: 'zh-CN',
          phonetic: '/ˈwɜːrd/',
          partOfSpeech: ['noun'],
          definitionCn: '有效释义',
          definitionEn: 'a valid definition',
          exampleSentences: [{ english: 'This is a valid word.', chinese: '这是一个有效单词。' }],
          usageNotes: ['用于测试重试逻辑。'],
          synonyms: ['term'],
          wordRoot: ''
        }));

      const uniqueWord = `retry-word-${Date.now()}`;
      const detail = await wordService.getWordDetail(uniqueWord, 'This is a valid word.');

      expect(detail.word).toBe(uniqueWord);
      expect(detail.definitionCn).toBe('有效释义');
      expect(detail.definitionEn).toBe('a valid definition');
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  test('getWordDetail() 命中旧缓存时会再次清洗字段结构', async () => {
    const uniqueWord = `legacy-word-${Date.now()}`;
    const database = db.getDb();

    database.prepare(`
      INSERT INTO word_dictionary_entries (
        word,
        provider,
        language,
        native_language,
        phonetic,
        part_of_speech,
        definition_cn,
        definition_en,
        example_sentences,
        usage_notes,
        synonyms,
        word_root,
        raw_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uniqueWord,
      'ai-structured',
      'en',
      'zh-CN',
      '/.../',
      JSON.stringify(['noun', '', 'noun']),
      '',
      '',
      JSON.stringify([{ english: 'Legacy example sentence.', chinese: '' }]),
      JSON.stringify(['', 'Legacy usage note']),
      JSON.stringify(['legacy', 'legacy']),
      '',
      JSON.stringify({ definitionCn: '旧缓存释义' })
    );

    const detail = await wordService.getWordDetail(uniqueWord);
    expect(detail.phonetic).toBe('');
    expect(detail.definitionCn).toBe('旧缓存释义');
    expect(detail.partOfSpeech).toEqual(['noun']);
    expect(detail.usageNotes).toEqual(['Legacy usage note']);
    expect(detail.synonyms).toEqual(['legacy']);
    expect(detail.exampleSentences).toEqual([
      { english: 'Legacy example sentence.', chinese: '' }
    ]);
  });

  test('getWordDetail() 带上下文时也会优先读取数据库词卡', async () => {
    const uniqueWord = `context-cache-word-${Date.now()}`;
    const database = db.getDb();

    database.prepare(`
      INSERT INTO word_dictionary_entries (
        word,
        provider,
        language,
        native_language,
        phonetic,
        part_of_speech,
        definition_cn,
        definition_en,
        example_sentences,
        usage_notes,
        synonyms,
        word_root,
        raw_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uniqueWord,
      'ai-structured',
      'en',
      'zh-CN',
      '/cached/',
      JSON.stringify(['noun']),
      '数据库优先释义',
      'cached definition',
      JSON.stringify([{ english: 'Cached example sentence.', chinese: '缓存例句。' }]),
      JSON.stringify(['数据库中的词卡应优先返回。']),
      JSON.stringify(['cached']),
      '',
      JSON.stringify({})
    );

    const spy = jest.spyOn(aiClient, 'generateWordExplanation');
    try {
      const detail = await wordService.getWordDetail(uniqueWord, 'This context should not force AI.');
      expect(detail.definitionCn).toBe('数据库优先释义');
      expect(detail.exampleSentences).toEqual([
        { english: 'Cached example sentence.', chinese: '缓存例句。' }
      ]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test('logWordClick() 记录点击不报错', () => {
    expect(() => {
      wordService.logWordClick({ word: 'reservation', sessionId: 'test', scenarioId: 'restaurant' });
    }).not.toThrow();
  });
});

// ======================================================
// 6. 设置服务
// ======================================================
describe('Settings Service — 设置持久化', () => {
  // 每个测试用独立 userId，避免 SQLite 文件跨测试污染
  const uid = () => 'settings-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

  test('getSettings() 返回默认值', () => {
    const settings = settingsService.getSettings(uid());
    expect(settings.learningLanguage).toBe('en');
    expect(settings.nativeLanguage).toBe('zh-CN');
    expect(settings.voiceSpeed).toBe(1.0);
    expect(settings.showTranslation).toBe(true);
    expect(settings.showHints).toBe(true);
    expect(settings.showHintExamples).toBe(true);
    expect(settings.wordbookAutoRemoveCount).toBe(1);
    expect(settings.smartExplainEnabled).toBe(false);
    expect(settings.autoPlayVoice).toBe(true);
  });

  test('updateSettings() 部分更新，其余保持默认', () => {
    const id = uid();
    const updated = settingsService.updateSettings(id, { learningLanguage: 'ja', nativeLanguage: 'en', showTranslation: false, voiceSpeed: 1.5, smartExplainEnabled: true });
    expect(updated.learningLanguage).toBe('en');
    expect(updated.nativeLanguage).toBe('zh-CN');
    expect(updated.showTranslation).toBe(false);
    expect(updated.voiceSpeed).toBe(1.5);
    expect(updated.smartExplainEnabled).toBe(true);
    // 未更新的字段保持默认
    expect(updated.showHints).toBe(true);
    expect(updated.showHintExamples).toBe(true);
  });

  test('updateSettings() 会忽略旧版模型字段', () => {
    const id = uid();
    const updated = settingsService.updateSettings(id, {
      aiProvider: 'openai',
      aiModel: 'gpt-4o',
      ttsProvider: 'openai',
      showTranslation: false
    });
    expect(updated.showTranslation).toBe(false);
    expect(updated.aiProvider).toBeUndefined();
    expect(updated.aiModel).toBeUndefined();
    expect(updated.ttsProvider).toBeUndefined();
  });

  test('getSettings() 返回更新后的值', () => {
    const id = uid();
    settingsService.updateSettings(id, { learningLanguage: 'ja', nativeLanguage: 'en', showTranslation: false, voiceSpeed: 1.5 });
    const settings = settingsService.getSettings(id);
    expect(settings.learningLanguage).toBe('en');
    expect(settings.nativeLanguage).toBe('zh-CN');
    expect(settings.showTranslation).toBe(false);
    expect(settings.voiceSpeed).toBe(1.5);
  });
});

// ======================================================
// 7. 不同用户设置隔离
// ======================================================
describe('Settings Isolation — 多用户设置隔离', () => {
  test('用户 A 的设置不影响用户 B', () => {
    settingsService.updateSettings('user-a', { showTranslation: false });
    settingsService.updateSettings('user-b', { showTranslation: true });

    expect(settingsService.getSettings('user-a').showTranslation).toBe(false);
    expect(settingsService.getSettings('user-b').showTranslation).toBe(true);
  });
});

// ======================================================
// 8. 场景服务
// ======================================================
describe('Scenario Service — 场景逻辑', () => {
  test('getAllScenarios() 返回所有激活场景', () => {
    const scenarios = scenarioService.getAllScenarios();
    expect(Array.isArray(scenarios)).toBe(true);
    scenarios.forEach(s => {
      expect(s.id).toBeDefined();
      expect(s.title).toBeDefined();
      expect(s.title_en).toBeDefined();
      expect(s.difficulty).toBeDefined();
    });
  });

  test('场景包含难度等级', () => {
    const scenarios = scenarioService.getAllScenarios();
    const difficulties = scenarios.map(s => s.difficulty);
    expect(difficulties).toContain('beginner');
    expect(difficulties).toContain('intermediate');
    expect(difficulties).toContain('advanced');
  });

  test('场景 icon 不为空', () => {
    const scenarios = scenarioService.getAllScenarios();
    scenarios.forEach(s => {
      expect(s.icon).toBeTruthy();
    });
  });

  test('getScenarioById() 返回具体场景', () => {
    const scenario = scenarioService.getScenarioById('restaurant');
    expect(scenario).toBeDefined();
    expect(scenario.id).toBe('restaurant');
    expect(scenario.title).toContain('餐厅');
  });

  test('getScenarioConfig() 返回对象', () => {
    const config = scenarioService.getScenarioConfig('restaurant');
    expect(typeof config).toBe('object');
    // 如果没配过返回空对象
    expect(Object.keys(config)).toBeDefined();
  });

  test('saveScenarioConfig() 持久化配置', () => {
    scenarioService.saveScenarioConfig('restaurant', 'system_prompt', 'You are a waiter.');
    const config = scenarioService.getScenarioConfig('restaurant');
    expect(config.system_prompt).toBe('You are a waiter.');
  });
});

// ======================================================
// 9. 收藏服务
// ======================================================
describe('Bookmark Service — 收藏逻辑', () => {
  const testWord = 'logic-test-word';

  afterAll(() => {
    // 清理测试数据，避免影响 API 测试
    bookmarkService.removeBookmark(testWord);
    bookmarkService.removeBookmark('user-a-word', 'user-a-bookmark');
    bookmarkService.removeBookmark('user-b-word', 'user-b-bookmark');
    bookmarkService.removeBookmark('never-added-word-xyz');
  });

  test('addBookmark() 添加单词', () => {
    const bookmark = bookmarkService.addBookmark({ word: testWord, phonetic: '/test/', definitionCn: '测试' });
    expect(bookmark.word).toBe(testWord);
  });

  test('checkBookmark() 检查已存在', () => {
    const exists = bookmarkService.checkBookmark(testWord);
    expect(exists).toBe(true);
  });

  test('checkBookmark() 检查不存在的单词', () => {
    const exists = bookmarkService.checkBookmark('nonexistent-word-xyz');
    expect(exists).toBe(false);
  });

  test('removeBookmark() 删除收藏', () => {
    bookmarkService.removeBookmark(testWord);
    const exists = bookmarkService.checkBookmark(testWord);
    expect(exists).toBe(false);
  });

  test('markPracticed() 会将单词移入已练习并从默认收藏列表隐藏', () => {
    bookmarkService.addBookmark({ word: testWord, phonetic: '/test/', definitionCn: '测试' });
    const practiced = bookmarkService.markPracticed(testWord);
    const activeBookmarks = bookmarkService.getAllBookmarks();
    const allBookmarks = bookmarkService.getAllBookmarks('default', { includePracticed: true });

    expect(practiced.status).toBe('practiced');
    expect(activeBookmarks.some((item) => item.word === testWord)).toBe(false);
    expect(allBookmarks.some((item) => item.word === testWord && item.status === 'practiced')).toBe(true);
  });

  test('reactivateBookmark() 可将已练习单词重新加入练习', () => {
    const active = bookmarkService.reactivateBookmark(testWord);
    const activeBookmarks = bookmarkService.getAllBookmarks();

    expect(active.status).toBe('active');
    expect(activeBookmarks.some((item) => item.word === testWord && item.status === 'active')).toBe(true);
  });

  test('添加已存在的收藏不报错（INSERT OR REPLACE 幂等）', () => {
    expect(() => {
      bookmarkService.addBookmark({ word: testWord, phonetic: '/test/', definitionCn: '测试' });
      bookmarkService.addBookmark({ word: testWord, phonetic: '/test/', definitionCn: '测试' });
    }).not.toThrow();
  });

  test('删除不存在的收藏不报错', () => {
    expect(() => bookmarkService.removeBookmark('never-added-word-xyz')).not.toThrow();
  });

  test('getAllBookmarks() 返回数组', () => {
    const bookmarks = bookmarkService.getAllBookmarks();
    expect(Array.isArray(bookmarks)).toBe(true);
  });

  test('不同用户的收藏互相隔离', () => {
    bookmarkService.addBookmark({ word: 'user-a-word', userId: 'user-a-bookmark' });
    bookmarkService.addBookmark({ word: 'user-b-word', userId: 'user-b-bookmark' });

    expect(bookmarkService.checkBookmark('user-a-word', 'user-a-bookmark')).toBe(true);
    expect(bookmarkService.checkBookmark('user-b-word', 'user-b-bookmark')).toBe(true);
    // user-a 看不到 user-b 的收藏
    expect(bookmarkService.checkBookmark('user-b-word', 'user-a-bookmark')).toBe(false);
  });
});

// ======================================================
// 10. 对话消息完整性验证
// ======================================================
describe('Data Integrity — 数据完整性', () => {
  test('对话消息必填字段不为空', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    await conversationService.generateAiResponse(s.id, 'Test message');
    
    const messages = conversationService.getMessages(s.id);
    const aiMsg = messages.find(m => m.role === 'ai');
    expect(aiMsg).toBeDefined();
    expect(aiMsg.english).toBeDefined();
    expect(aiMsg.english.length).toBeGreaterThan(0);
    expect(aiMsg.chinese).toBeDefined();
    // turn_number 是正数
    expect(aiMsg.turn_number).toBeGreaterThan(0);
  });

  test('createSession() 生成的 UUID 格式正确', () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    // UUID v4 格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('消息 role 只能是 user 或 ai', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    await conversationService.addMessage(s.id, { role: 'user', english: 'Hello', chinese: '你好' });
    await conversationService.generateAiResponse(s.id, 'Hi');
    
    const messages = conversationService.getMessages(s.id);
    messages.forEach(m => {
      expect(['user', 'ai']).toContain(m.role);
    });
  });

  test('会话创建时间和完成时间不为空', () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant' });
    conversationService.addMessage(s.id, { role: 'user', english: 'Complete', chinese: '完成' });
    conversationService.completeSession(s.id);
    
    const session = conversationService.getSession(s.id);
    expect(session.started_at).toBeDefined();
    expect(session.completed_at).toBeDefined();
  });

  test('消息按 turn_number ASC 排序', async () => {
    const s = conversationService.createSession({ scenarioId: 'restaurant', maxTurns: 5 });
    await conversationService.addMessage(s.id, { role: 'user', english: 'First', chinese: '第一' });
    await conversationService.addMessage(s.id, { role: 'user', english: 'Second', chinese: '第二' });
    await conversationService.addMessage(s.id, { role: 'user', english: 'Third', chinese: '第三' });
    
    const messages = conversationService.getMessages(s.id);
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].turn_number).toBeGreaterThan(messages[i - 1].turn_number);
    }
  });
});
