# 英语口语练习 App — 完整设计文档

> 技术栈：Uni-app + Node.js + SQLite + AI  
> 目标：AI 生成你的英语口语设计，帮助用户完成设计，点击单词即可查询详情。
> 核心设计原则：**可配置是第一位** —— 场景、提示词、语音、界面文案，全都要能配置。

---

## 目录

1. [项目架构概览](#1-项目架构概览)
2. [前端架构（Uni-app）](#2-前端架构uni-app)
3. [后端架构（Node.js）](#3-后端架构nodejs)
4. [数据库设计（SQLite）](#4-数据库设计sqlite)
5. [AI 集成设计](#5-ai-集成设计)
6. [核心功能详细设计](#6-核心功能详细设计)
7. [语音系统设计](#7-语音系统设计)
8. [单词详情 & 收藏系统](#8-单词详情--收藏系统)
9. [API 接口设计](#9-api-接口设计)
10. [配置文件体系](#10-配置文件体系)
11. [项目目录结构](#11-项目目录结构)
12. [实施建议](#12-实施建议)

---

## 1. 项目架构概览

```
┌─────────────────────────────────┐
│      客户端 (Uni-app)            │
│  iOS / Android / H5 / 小程序     │
│                                 │
│  场景选择 → AI对话 → 口语练习    │
│          ↕                      │
│      单词详情弹窗 ← 点击任意单词  │
│          ↕                      │
│      收藏本 / 复习               │
└──────────────┬──────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────┐
│      服务端 (Node.js)            │
│                                 │
│  Express/Koa + 路由 + 中间件     │
│                                 │
│  ┌──────────┐ ┌──────────────┐  │
│  │ AI 服务层 │ │ TTS 服务层   │  │
│  │ (可替换)  │ │ (可替换)     │  │
│  └──────────┘ └──────────────┘  │
│  ┌──────────┐ ┌──────────────┐  │
│  │ 场景引擎  │ │ 单词服务     │  │
│  └──────────┘ └──────────────┘  │
│  ┌──────────────────────────┐   │
│  │    SQLite 数据库          │   │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
```

### 核心数据流

```
用户选择场景
    ↓
发送 { 场景ID + 对话历史 } → Node.js
    ↓
Node.js 读取场景配置（包括 AI 提示词）
    ↓
构造 Prompt → 调用 AI API → 获取回复
    ↓
解析 AI 回复 → 提取 { english, chinese, userHint, voiceUrl }
    ↓
保存到 SQLite → 返回给前端
    ↓
前端渲染：英文 + 中文 + 语音播放
    ↓
用户点击单词 → 调取单词详情 API
    ↓
用户作答 → 提交 → AI 继续下一轮...
```

---

## 2. 前端架构（Uni-app）

### 2.1 技术选型

| 项目 | 选型 | 说明 |
|------|------|------|
| 框架 | Uni-app | 一套代码多端运行 |
| UI 框架 | uView 2.0 | 组件丰富，兼容性好 |
| 状态管理 | Pinia（Vue3 模式） | 轻量、TS 友好 |
| 路由 | uni-router / 原生 pages | 页面栈管理 |
| 网络请求 | uni-request + 封装拦截器 | 统一错误处理 |
| 语音 TTS | uni 内置 + 百度/讯飞 SDK | 多端兼容 |
| 语音识别 | Web Speech API / 讯飞 | 用户口语输入 |
| 本地存储 | uni-storage + SQLite 扩展 | 离线缓存 |

### 2.2 页面结构

```
pages/
├── index/                    # 首页 - 场景列表
│   └── index.vue
├── scenario/                 # 场景对话主页面
│   ├── conversation.vue      # 对话界面（核心）
│   └── result.vue            # 场景完成总结
├── word/                     # 单词相关
│   ├── word-detail.vue       # 单词详情页（或弹窗）
│   └── bookmark.vue          # 收藏本 / 单词列表
├── profile/                  # 个人中心
│   ├── index.vue             # 个人主页
│   ├── history.vue           # 练习历史
│   └── settings.vue          # 设置（语音语速、AI 模型等）
└── components/               # 公共组件
    ├── scenario-card.vue     # 场景卡片
    ├── message-bubble.vue    # 对话气泡（AI/用户）
    ├── word-popup.vue        # 单词详情弹窗（核心组件）
    ├── voice-btn.vue         # 语音播放按钮
    ├── voice-input.vue       # 语音输入组件
    ├── user-hint.vue         # 用户提示(该你说什么)
    └── loading-ai.vue        # AI 思考中动画
```

### 2.3 状态管理（Pinia Store）

```typescript
// stores/scenario.ts — 场景状态
{
  scenarios: Scenario[]        // 场景列表
  currentScenario: Scenario    // 当前场景
  scenarioConfig: ScenarioConfig // 当前场景配置
}

// stores/conversation.ts — 对话状态
{
  sessionId: string            // 当前会话 ID
  messages: Message[]          // 对话消息列表
  currentTurn: number          // 当前轮次
  isAiThinking: boolean        // AI 是否正在生成
  isUserTurn: boolean          // 是否轮到用户发言
  userHint: UserHint | null    // 用户提示信息
  isCompleted: boolean         // 场景是否完成
}

// stores/word.ts — 单词状态
{
  currentWord: WordDetail | null   // 当前查看的单词
  wordPopupVisible: boolean        // 弹窗显隐
  bookmarkedWords: BookmarkedWord[] // 收藏的单词
  wordHistory: WordClickRecord[]   // 点击历史
}

// stores/settings.ts — 设置状态
{
  voiceSpeed: number           // 语音速度 0.5-2.0
  ttsProvider: string          // TTS 服务商
  aiProvider: string           // AI 服务商
  aiModel: string              // AI 模型名
  autoPlayVoice: boolean       // 自动播放语音
  showTranslation: boolean     // 是否显示中文翻译
}
```

### 2.4 对话页面核心交互

```
┌────────────────────────────────┐
│    ← 返回    餐厅点餐    ⚙️    │  ← 顶部导航
├────────────────────────────────┤
│                                │
│  ┌──────────────────────────┐  │
│  │ 🤖 Waiter:               │  │  ← AI 对话气泡
│  │ Welcome to our...        │  │
│  │ 欢迎来到我们餐厅...      │  │
│  │ 🔊 [播放]               │  │
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │
│  │ 💡 轮到你了 ↓            │  │  ← 用户提示区域
│  │ 试试说：                 │  │
│  │ "Table for two, please." │  │
│  │ 🎯 两位，谢谢。          │  │
│  │ 🔊 [播放示范]           │  │
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │
│  │ 🎤 [按住说话] 或 键盘输入 │  │  ← 底部输入区
│  └──────────────────────────┘  │
│                                │
│  ┌──────────────────────────┐  │
│  │ 🙋 I'd like...           │  │  ← 用户消息气泡
│  │ 我想要...                │  │
│  └──────────────────────────┘  │
│                                │
└────────────────────────────────┘
```

关键交互逻辑：
1. 首次进入 → AI 自动开始对话（开场白）
2. AI 消息显示英文+中文+播放按钮
3. 轮到用户时 → 显示 `userHint`（建议说的英文 + 翻译 + 示范语音）
4. 用户可以：照着读 / 自己发挥 / 自由回答
5. AI 根据用户的回答继续对话，或友好纠正
6. 点击任何 **英文单词** → 弹出单词详情弹窗
7. 场景可随时暂停/退出

### 2.5 单词详情弹窗（WordPopup）

```
┌─────────────────────────────────────┐
│  📖 单词详情              ☆ 收藏     │
├─────────────────────────────────────┤
│                                     │
│     welcome                          │
│     /ˈwelkəm/                        │
│     🔊 英音  🔊 美音                 │
│                                     │
│  释义                               │
│  v. 欢迎（迎接）                    │
│  n. 欢迎（问候语）                  │
│  adj. 受欢迎的                      │
│                                     │
│  例句                               │
│  • Welcome to our restaurant!       │
│    欢迎来到我们餐厅！               │
│  • You are welcome.                 │
│    不客气 / 欢迎你。               │
│                                     │
│  词根词缀                           │
│  well-（好）+ come（来）→ 好而来 → 欢迎 │
├─────────────────────────────────────┤
│  上下文："Welcome to our restaurant"│
│  来源场景：餐厅点餐                  │
└─────────────────────────────────────┘
```

弹窗实现方案：
- 使用 Uni-app 的 `popup` 或 `modal` 组件
- 内容动态加载（调 API 获取单词详情）
- 可拖拽、可关闭
- 点击外部自动关闭
- 支持收藏/取消收藏

---

## 3. 后端架构（Node.js）

### 3.1 技术选型

| 项目 | 选型 | 说明 |
|------|------|------|
| 框架 | Express.js | 轻量、生态好 |
| 数据库 | better-sqlite3 | 同步、性能好、无需配置 |
| AI SDK | openai（兼容所有 API） | 统一接口 |
| TTS | edge-tts（本地） / 百度 / Azure | 可插拔 |
| 缓存 | node-cache | 内存缓存 |
| 日志 | winston | 分级日志 |
| 配置 | node-config / json | 环境区分 |
| 定时任务 | node-cron | 可选 |
| WebSocket | ws / socket.io | 可选实时流式 |

### 3.2 模块分层

```
src/
├── server.js               # 入口，启动服务
├── app.js                  # Express 实例，中间件注册
│
├── config/                 # 配置目录
│   ├── index.js            # 配置读取入口
│   ├── default.json        # 默认配置
│   ├── development.json    # 开发环境
│   ├── production.json     # 生产环境
│   └── scenarios/          # ⭐ 场景配置文件（核心）
│       ├── restaurant.json
│       ├── airport.json
│       ├── job-interview.json
│       └── ...
│
├── routes/                 # 路由层（薄）
│   ├── scenario.routes.js
│   ├── conversation.routes.js
│   ├── word.routes.js
│   ├── bookmark.routes.js
│   └── settings.routes.js
│
├── controllers/            # 控制器（处理请求参数，返回结果）
│   ├── scenario.controller.js
│   ├── conversation.controller.js
│   ├── word.controller.js
│   └── bookmark.controller.js
│
├── services/               # ⭐ 业务逻辑层（核心）
│   ├── scenario.service.js    # 场景加载/配置管理
│   ├── conversation.service.js # ⭐ 对话引擎
│   ├── ai.service.js          # ⭐ AI 服务（可替换）
│   ├── tts.service.js         # ⭐ TTS 服务（可替换）
│   ├── word.service.js        # 单词查询/词典
│   └── bookmark.service.js    # 收藏管理
│
├── models/                 # 数据模型
│   ├── scenario.model.js
│   ├── conversation.model.js
│   ├── word.model.js
│   └── bookmark.model.js
│
├── middleware/              # 中间件
│   ├── error-handler.js
│   ├── validator.js
│   └── logger.js
│
├── prompts/                # ⭐ AI 提示词模板
│   ├── conversation.md      # 对话主提示词模板
│   ├── system-prompt.md     # 系统角色设定模板
│   └── word-explanation.md  # 单词解释提示词
│
├── db/                     # 数据库
│   ├── init.js              # 建表/迁移
│   └── index.js             # 连接管理
│
├── utils/                  # 工具函数
│   ├── prompt-builder.js    # 提示词构建器
│   ├── text-parser.js       # AI 回复解析器
│   └── helpers.js
│
└── data/                   # 数据目录
    ├── database.sqlite      # SQLite 数据库文件
    ├── voice/               # 语音文件缓存
    └── logs/                # 日志文件
```

### 3.3 依赖注入与服务替换

```javascript
// services/ai.service.js — AI 服务抽象层
class AIService {
  constructor(provider, config) {
    this.provider = provider; // 'openai' | 'claude' | 'deepseek' | 'local'
    this.config = config;
    this.client = this._initClient();
  }

  async chat(messages, options = {}) {
    // 统一的 chat 接口
    switch (this.provider) {
      case 'openai': return this._chatOpenAI(messages, options);
      case 'deepseek': return this._chatDeepSeek(messages, options);
      case 'local': return this._chatLocal(messages, options);
      // 扩展新 provider 只需加一个 case
    }
  }

  async generateWordExplanation(word, context) {
    // 专为单词解释优化的调用
  }
}

// 配置文件切换
// config/default.json
{
  "ai": {
    "provider": "deepseek",
    "deepseek": {
      "apiKey": "sk-xxx",
      "model": "deepseek-chat",
      "baseUrl": "https://api.deepseek.com"
    },
    "openai": {
      "apiKey": "sk-xxx",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com"
    }
  },
  "tts": {
    "provider": "edge-tts",
    "edge-tts": {
      "voice": "en-US-JennyNeural",
      "speed": 1.0
    },
    "baidu": {
      "appId": "",
      "apiKey": ""
    }
  }
}
```

---

## 4. 数据库设计（SQLite）

### 4.1 完整表结构

```sql
-- ============================================
-- 1. 场景配置表（静态配置，可视为数据也可以视为配置）
-- ============================================
CREATE TABLE IF NOT EXISTS scenarios (
  id              TEXT PRIMARY KEY,          -- 'restaurant', 'airport' 等 ID
  title           TEXT NOT NULL,             -- '餐厅点餐'
  title_en        TEXT NOT NULL,             -- 'Restaurant Ordering'
  description     TEXT,                      -- 场景简介
  description_en  TEXT,                      -- 英文简介
  difficulty      TEXT DEFAULT 'beginner',   -- 'beginner'|'intermediate'|'advanced'
  icon            TEXT DEFAULT '💬',         -- 图标 emoji
  tags            TEXT DEFAULT '[]',         -- JSON 数组 ['daily','food']
  sort_order      INTEGER DEFAULT 0,         -- 排序权重
  max_turns       INTEGER DEFAULT 10,        -- 最大对话轮次
  is_active       INTEGER DEFAULT 1,         -- 是否启用
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. 场景核心配置（AI 提示词等关键配置）
-- ============================================
CREATE TABLE IF NOT EXISTS scenario_configs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id     TEXT NOT NULL REFERENCES scenarios(id),
  config_key      TEXT NOT NULL,             -- 'ai_prompt' | 'system_prompt' | 'greeting' | 'completion_message' | 'difficulty_rules'
  config_value    TEXT NOT NULL,             -- 配置值（JSON 或文本）
  UNIQUE(scenario_id, config_key)
);

-- ============================================
-- 3. 对话会话表
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id              TEXT PRIMARY KEY,          -- UUID
  scenario_id     TEXT NOT NULL REFERENCES scenarios(id),
  user_id         TEXT DEFAULT 'default',    -- 用户标识
  status          TEXT DEFAULT 'active',     -- 'active' | 'completed' | 'abandoned'
  current_turn    INTEGER DEFAULT 0,         -- 当前轮次
  max_turns       INTEGER DEFAULT 10,        -- 最大轮次
  started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at    DATETIME,
  summary         TEXT                       -- 会话总结（JSON）
);

-- ============================================
-- 4. 对话消息表（每一条消息）
-- ============================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL REFERENCES conversation_sessions(id),
  turn_number     INTEGER NOT NULL,          -- 轮次编号（从1开始）
  role            TEXT NOT NULL,             -- 'ai' | 'user'
  english         TEXT NOT NULL,             -- 英文内容
  chinese         TEXT NOT NULL,             -- 中文翻译
  voice_url       TEXT,                      -- 语音文件 URL 或路径
  voice_duration  REAL,                      -- 语音时长（秒）
  raw_ai_response TEXT,                      -- AI 原始回复（JSON，调试用）
  -- 如果是 user 消息
  user_input_type TEXT DEFAULT 'typed',      -- 'typed' | 'voice' | 'hint_followed'
  is_correct      INTEGER,                   -- 是否语法/语义正确（AI 评估）
  ai_feedback     TEXT,                      -- AI 对用户回答的反馈
  -- 如果是 AI 消息，且轮到用户
  user_hint       TEXT,                      -- 建议用户说的英文（JSON）
  user_hint_cn    TEXT,                      -- 建议的中文翻译
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 5. 单词收藏表
-- ============================================
CREATE TABLE IF NOT EXISTS word_bookmarks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  word            TEXT NOT NULL,             -- 单词（小写）
  phonetic        TEXT,                      -- 音标 /ˈwelkəm/
  part_of_speech  TEXT DEFAULT '[]',         -- 词性 JSON ['v.','n.','adj.']
  definition_cn   TEXT,                      -- 中文释义
  definition_en   TEXT,                      -- 英文释义
  example_sentence TEXT,                     -- 例句 JSON
  word_root       TEXT,                      -- 词根词缀
  -- 来源信息
  source_scenario_id TEXT,                   -- 来自哪个场景
  source_sentence TEXT,                      -- 来自哪个句子
  -- 用户数据
  user_id         TEXT DEFAULT 'default',
  tags            TEXT DEFAULT '[]',         -- 用户标签 JSON
  review_count    INTEGER DEFAULT 0,         -- 复习次数
  last_reviewed_at DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, word)
);

-- ============================================
-- 6. 单词点击历史（学习行为分析）
-- ============================================
CREATE TABLE IF NOT EXISTS word_click_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  word            TEXT NOT NULL,
  user_id         TEXT DEFAULT 'default',
  session_id      TEXT,
  scenario_id     TEXT,
  context_sentence TEXT,                     -- 点击时的上下文句子
  clicked_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 7. 用户设置表
-- ============================================
CREATE TABLE IF NOT EXISTS user_settings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT DEFAULT 'default' UNIQUE,
  settings_json   TEXT NOT NULL DEFAULT '{}', -- 设置 JSON
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX IF NOT EXISTS idx_messages_session ON conversation_messages(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_messages_created ON conversation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON word_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_word ON word_bookmarks(word);
CREATE INDEX IF NOT EXISTS idx_click_logs_word ON word_click_logs(word);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON conversation_sessions(user_id, started_at DESC);
```

### 4.2 数据模型示例代码

```javascript
// models/conversation.model.js
class ConversationModel {
  constructor(db) {
    this.db = db;
  }

  createSession(scenarioId, userId = 'default') {
    const id = uuidv4();
    const stmt = this.db.prepare(
      `INSERT INTO conversation_sessions (id, scenario_id, user_id) VALUES (?, ?, ?)`
    );
    stmt.run(id, scenarioId, userId);
    return id;
  }

  addMessage(sessionId, data) {
    const { turnNumber, role, english, chinese, voiceUrl, userHint, userHintCn } = data;
    const stmt = this.db.prepare(
      `INSERT INTO conversation_messages 
       (session_id, turn_number, role, english, chinese, voice_url, user_hint, user_hint_cn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    return stmt.run(sessionId, turnNumber, role, english, chinese, voiceUrl,
      userHint ? JSON.stringify(userHint) : null, userHintCn);
  }

  getSessionMessages(sessionId) {
    return this.db.prepare(
      `SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY turn_number ASC`
    ).all(sessionId);
  }
}
```

---

## 5. AI 集成设计

### 5.1 AI 对话工作流

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   前端        │     │   Node.js 后端   │     │   AI API     │
├──────────────┤     ├─────────────────┤     ├──────────────┤
│ 进入场景      │────→│ 1.读取场景配置   │     │              │
│              │     │ 2.创建/恢复会话  │     │              │
│              │     │ 3.构造 System    │────→│              │
│              │     │    Prompt        │     │              │
│              │     │ 4.发送历史对话    │────→│              │
│              │     │ 5.获取 AI 回复   │←────│ 生成对话+    │
│              │     │                  │     │ 翻译+提示    │
│              │     │ 6.解析结构化数据 │     │              │
│              │     │ 7.生成 TTS 语音  │     │              │
│              │     │ 8.保存到数据库   │     │              │
│←──── 返回数据 │────│                  │     │              │
│ 渲染对话      │     │                  │     │              │
│ 播放语音      │     │                  │     │              │
│ 轮到用户      │     │                  │     │              │
│              │     │                  │     │              │
│ 用户提交回答  │────→│ 9.保存用户回答   │────→│              │
│              │     │ 10.AI 评估+下一轮│←────│              │
│←──── 继续...  │←────│                  │     │              │
└──────────────┘     └─────────────────┘     └──────────────┘
```

### 5.2 核心 Prompt 模板

**System Prompt 模板**（角色设定）：

```
你是一个英语口语陪练助手。当前场景是：「{scenarioTitle}」。
你的角色是：{scenarioRole}

## 对话规则
1. 全程使用英语对话，你的语言水平对应难度：{difficulty}
2. 每轮你说话后，需要给出中文翻译
3. 当轮到用户发言时，请给用户一个建议回答（用英文），并给出中文翻译
4. 用户水平可能有限，请友好耐心，必要时可以提示或纠正
5. 如果用户语法有误，请友好地指出正确说法
6. 每句话控制在 2-3 句以内，简洁自然
7. 当对话达到 {maxTurns} 轮次时，自然结束对话

## 场景提示
{scenarioPrompt}
```

**每次请求的 Prompt 格式**：

```
## 对话历史
{历史消息列表，按时间排列}

## 当前状态
- 当前轮次：第 {turnNumber} 轮
- 上一轮说话者：{lastSpeaker}
- 用户上一轮的回答：{lastUserResponse}（如果有）
- 如果用户回答有问题，请指出：{lastUserFeedback}（如果有）

## 请生成下一轮对话
请严格按照以下 JSON 格式返回（不要包裹 markdown 代码块，纯 JSON）：

{
  "role": "ai" 或 "user_done",
  // 如果是 ai 说话：
  "english": "你的英文对话内容",
  "chinese": "中文翻译",
  "user_hint": {
    "english": "建议用户说的英文",
    "chinese": "建议的中文意思",
    "options": ["可选的表达方式1", "可选2"]
  },
  "user_feedback": "对用户上一轮回答的评价（如果有的话，可以为空）",
  "is_completed": false
}

如果对话应该结束，设置 "is_completed": true，并总结对话。
```

### 5.3 AI 回复解析器

```javascript
// utils/text-parser.js
class AIParser {
  /**
   * 解析 AI 的回复文本，提取结构化数据
   * AI 可能返回纯 JSON，也可能在 markdown 代码块里
   */
  parseResponse(rawText) {
    // 1. 尝试直接解析 JSON
    try {
      return JSON.parse(rawText);
    } catch (e) {
      // 2. 尝试从 markdown ```json ... ``` 中提取
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      // 3. 尝试从 {} 中提取
      const braceMatch = rawText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        return JSON.parse(braceMatch[0]);
      }
    }
    throw new Error('无法解析 AI 回复');
  }
}
```

### 5.4 对话引擎核心逻辑

```javascript
// services/conversation.service.js
class ConversationService {
  constructor(aiService, ttsService, scenarioService, db) {
    this.ai = aiService;
    this.tts = ttsService;
    this.scenarios = scenarioService;
    this.db = db;
  }

  /**
   * 开始一个新的对话轮次
   */
  async nextTurn(sessionId, userResponse = null) {
    // 1. 获取会话和场景信息
    const session = this.db.getSession(sessionId);
    const scenario = this.scenarios.get(session.scenario_id);
    const messages = this.db.getSessionMessages(sessionId);

    // 2. 如果有用户回答，保存并评估
    if (userResponse) {
      await this._saveUserResponse(session, messages.length + 1, userResponse);
    }

    // 3. 构造 AI 请求的 messages
    const promptMessages = this._buildPromptMessages(scenario, messages);

    // 4. 调用 AI
    const aiReply = await this.ai.chat(promptMessages, {
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    // 5. 解析 AI 回复
    const parsed = new AIParser().parseResponse(aiReply);

    // 6. 生成 TTS 语音
    let voiceUrl = null;
    if (parsed.english) {
      voiceUrl = await this.tts.generate(parsed.english, {
        speed: scenario.config.ttsSpeed || 1.0
      });
    }

    // 7. 保存 AI 消息到数据库
    const turnNumber = messages.length + 1;
    this.db.addMessage(sessionId, {
      turnNumber,
      role: 'ai',
      english: parsed.english,
      chinese: parsed.chinese,
      voiceUrl,
      userHint: parsed.user_hint,
      userHintCn: parsed.user_hint?.chinese || ''
    });

    // 8. 更新会话状态
    if (parsed.is_completed || turnNumber >= session.max_turns) {
      this.db.completeSession(sessionId);
    } else {
      this.db.updateTurn(sessionId, turnNumber);
    }

    // 9. 返回给前端
    return {
      turnNumber,
      role: 'ai',
      english: parsed.english,
      chinese: parsed.chinese,
      voiceUrl,
      voiceDuration: null, // 前端可自行计算
      userHint: parsed.user_hint || null,
      userFeedback: parsed.user_feedback || null,
      isCompleted: parsed.is_completed || false,
      isUserTurn: true // 接下来轮到用户
    };
  }
}
```

---

## 6. 场景配置体系（最核心的可配置设计）

### 6.1 场景配置文件结构

场景配置全部放在 `src/config/scenarios/` 目录下，每个场景一个 JSON 文件：

```json
{
  "id": "restaurant",
  "title": "餐厅点餐",
  "titleEn": "Restaurant Ordering",
  "description": "模拟在餐厅用英语点餐的全流程",
  "descriptionEn": "Simulate the complete restaurant ordering experience in English",
  "difficulty": "beginner",
  "icon": "🍽️",
  "tags": ["daily", "food", "travel"],
  "sortOrder": 1,
  "maxTurns": 12,

  "aiPrompt": {
    "role": {
      "name": "Waiter",
      "nameCn": "服务员",
      "description": "你是一家高档西餐厅的友善服务员",
      "descriptionCn": "友善的专业服务员"
    },
    "user": {
      "name": "Customer",
      "nameCn": "顾客"
    },
    "systemInstruction": "你是餐厅服务员，正在接待一位顾客用餐。用自然的英语引导顾客完成整个点餐流程：问候 → 询问人数 → 安排座位 → 递菜单 → 推荐今日特色 → 点前菜 → 点主菜 → 点饮品 → 确认订单 → 用餐中询问 → 结账。对顾客要有耐心，如果对方英语不太好，可以放慢语速或用更简单的表达。",
    "greeting": "Welcome to La Maison! A table for how many?",
    "greetingCn": "欢迎光临 La Maison！几位用餐？",
    "completionMessage": "Thank you for dining with us. Have a wonderful evening!",
    "completionMessageCn": "感谢您来用餐，祝您度过愉快的夜晚！",
    "ttsSettings": {
      "voice": "en-US-JennyNeural",
      "speed": 1.0
    },
    "difficultyRules": {
      "beginner": {
        "vocabularyLevel": "basic",
        "sentenceLength": "short",
        "maxNewWordsPerTurn": 3,
        "allowChineseHint": true
      },
      "intermediate": {
        "vocabularyLevel": "intermediate",
        "sentenceLength": "medium",
        "maxNewWordsPerTurn": 5,
        "allowChineseHint": true
      },
      "advanced": {
        "vocabularyLevel": "advanced",
        "sentenceLength": "natural",
        "maxNewWordsPerTurn": 8,
        "allowChineseHint": false
      }
    }
  },

  "scenarioConfig": {
    "coverImage": "/static/scenes/restaurant.jpg",
    "backgroundMusic": "/static/bgm/restaurant.mp3",
    "requiredVocabulary": [
      "menu", "order", "appetizer", "main course", "dessert",
      "drink", "waiter", "bill", "tip", "reservation"
    ],
    "learningObjectives": [
      "能用英语点餐",
      "能询问菜品信息",
      "能处理结账场景"
    ],
    "aiModel": "gpt-4o-mini",
    "temperature": 0.8,
    "showTranslation": true
  }
}
```

### 6.2 场景配置热加载

```javascript
// services/scenario.service.js
class ScenarioService {
  constructor(configDir) {
    this.configDir = configDir;
    this.cache = new Map();
    this._loadAll();
  }

  _loadAll() {
    const files = fs.readdirSync(this.configDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const config = JSON.parse(fs.readFileSync(path.join(this.configDir, file), 'utf-8'));
      this.cache.set(config.id, config);
    }
    console.log(`✅ 已加载 ${this.cache.size} 个场景`);
  }

  // 支持热重载（新增场景文件无需重启）
  reload(id) {
    const file = path.join(this.configDir, `${id}.json`);
    if (fs.existsSync(file)) {
      this.cache.set(id, JSON.parse(fs.readFileSync(file, 'utf-8')));
      return true;
    }
    return false;
  }

  get(id) {
    return this.cache.get(id);
  }

  getAll(filters = {}) {
    let list = Array.from(this.cache.values());
    if (filters.difficulty) list = list.filter(s => s.difficulty === filters.difficulty);
    if (filters.tag) list = list.filter(s => s.tags.includes(filters.tag));
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // 新增场景文件的快捷方法
  create(config) {
    const filePath = path.join(this.configDir, `${config.id}.json`);
    if (fs.existsSync(filePath)) throw new Error(`场景 ${config.id} 已存在`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    this.cache.set(config.id, config);
    return config;
  }
}
```

### 6.3 新增场景的完整流程

```
1. 在 src/config/scenarios/ 下新建 abc.json
   └── 填写场景 AI 提示词 + 配置
2. 重启服务（或调用 reload API）
3. 前端自动读取新场景列表
4. 用户即可选择新场景开始练习
```

> ✅ **扩展场景无需改代码，只需添加 JSON 配置文件**

---

## 7. 语音系统设计

### 7.1 TTS 语音生成

```javascript
// services/tts.service.js
class TTSService {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * 生成语音文件，返回 URL
   */
  async generate(text, options = {}) {
    const cacheKey = this._cacheKey(text, options);
    const cached = this._getFromCache(cacheKey);
    if (cached) return cached;

    let audioBuffer;
    switch (this.provider) {
      case 'edge-tts':
        audioBuffer = await this._edgeTTS(text, options);
        break;
      case 'baidu':
        audioBuffer = await this._baiduTTS(text, options);
        break;
      case 'azure':
        audioBuffer = await this._azureTTS(text, options);
        break;
    }

    const filePath = await this._saveFile(cacheKey, audioBuffer);
    return `/voice/${cacheKey}.mp3`;
  }

  async _edgeTTS(text, options) {
    // 使用 edge-tts 命令行或库
    // 优势：免费、音质好、不需要 API Key
    const voice = options.voice || this.config['edge-tts'].voice || 'en-US-JennyNeural';
    const speed = options.speed || this.config['edge-tts'].speed || 1.0;
    // exec(`edge-tts --voice ${voice} --text "${text}" --write-media output.mp3`);
    // 返回 Buffer
  }
}
```

### 7.2 前端语音处理

```javascript
// utils/voice.js — 前端语音工具

export const VoiceUtils = {
  /**
   * 播放 TTS 语音
   */
  playVoice(voiceUrl) {
    // #ifdef APP-PLUS
    // 使用 uni 原生播放器
    const audio = uni.createInnerAudioContext();
    audio.src = voiceUrl;
    audio.play();
    // #endif

    // #ifdef H5
    const audio = new Audio(voiceUrl);
    audio.play();
    // #endif
  },

  /**
   * 语音识别（用户口语输入）
   */
  startVoiceRecognition(options = {}) {
    return new Promise((resolve, reject) => {
      // #ifdef APP-PLUS
      // 使用讯飞/百度 SDK 插件
      const recognizer = plus.speech.startRecognize({
        lang: 'en-US',
        engine: 'iFly',
        ...options
      }, (result) => resolve(result), (err) => reject(err));
      // #endif

      // #ifdef H5
      if (!window.webkitSpeechRecognition) {
        reject(new Error('浏览器不支持语音识别'));
        return;
      }
      const recognition = new webkitSpeechRecognition();
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        resolve(event.results[0][0].transcript);
      };
      recognition.onerror = (err) => reject(err);
      recognition.start();
      // #endif
    });
  }
};
```

### 7.3 语音数据流

```
AI 生成英文文本
    ↓
Node.js TTS 服务生成 MP3
    ↓
按资源归属写入 data/users/{userId}/voice/{yyyy}/{mm}/{dd}/{file}.mp3
    ↓
返回 URL 给前端
    ↓
前端使用 audio 组件播放
    ↓
（可选）语音识别校验用户发音
```

补充说明：
- 用户会话语音、上传录音统一存储到 `data/users/{userId}/voice/{yyyy}/{mm}/{dd}/`
- 系统级单词音频统一存储到 `data/system/word/{word}.mp3`

---

## 8. 单词详情 & 收藏系统

### 8.1 单词详情获取流程

```
用户点击英文单词 "welcome"
    ↓
前端检测点击 → 提取单词文本
    ↓
发送请求: GET /api/word/detail?word=welcome&context=Welcome to our restaurant
    ↓
Node.js:
  1. 检查本地词典缓存
  2. 如果没有 → 调用 AI 生成单词详情
  3. 保存到本地词典库
  4. 记录点击日志
    ↓
返回单词详情 JSON
    ↓
前端弹出 WordPopup 组件渲染
```

### 8.2 单词详情 API 响应格式

```json
{
  "word": "welcome",
  "phonetic": "/ˈwelkəm/",
  "phoneticUs": "/ˈwelkəm/",
  "phoneticUk": "/ˈwelkəm/",
  "partOfSpeech": ["v.", "n.", "adj.", "excl."],
  "definitions": [
    {"pos": "v.", "cn": "欢迎", "en": "to greet someone warmly"},
    {"pos": "n.", "cn": "欢迎，迎接", "en": "a greeting or reception"},
    {"pos": "adj.", "cn": "受欢迎的", "en": "received gladly"}
  ],
  "examples": [
    {
      "en": "Welcome to our restaurant!",
      "cn": "欢迎来到我们餐厅！"
    },
    {
      "en": "You are always welcome here.",
      "cn": "我们永远欢迎你。"
    }
  ],
  "wordRoot": "well-（好）+ come（来）",
  "relatedWords": ["welcoming", "unwelcome", "welcome mat"],
  "collocations": ["welcome to", "welcome back", "make welcome"],
  "isBookmarked": false,
  "sourceContext": "Welcome to our restaurant!",
  "sourceScenario": "restaurant"
}
```

### 8.3 前端单词点击检测（核心功能）

```vue
<!-- components/word-popup.vue 核心思路 -->
<template>
  <view>
    <!-- 对话内容区域，每个英文单词可点击 -->
    <view class="message-text" @click="onTextClick">
      {{ message.english }}
    </view>

    <!-- 单词详情弹窗 -->
    <u-popup :show="visible" mode="center" @close="close">
      <word-detail :word="wordData" @bookmark="toggleBookmark" />
    </u-popup>
  </view>
</template>

<script>
export default {
  methods: {
    // 点击文本检测单词
    onTextClick(event) {
      // 获取选中的文本
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText && /^[a-zA-Z]+$/.test(selectedText)) {
        // 提取干净单词（小写）
        const word = selectedText.toLowerCase().replace(/[^a-z]/g, '');
        if (word.length > 0) {
          this.showWordDetail(word);
        }
      } else {
        // 无选中文本时，检测点击位置是否在单词上（H5/App）
        this.detectWordAtClick(event);
      }
    },

    // H5 实现：通过点击坐标获取单词
    detectWordAtClick(event) {
      // #ifdef H5
      const range = document.caretRangeFromPoint(event.clientX, event.clientY);
      if (range && range.startContainer) {
        const textNode = range.startContainer;
        const offset = range.startOffset;
        const text = textNode.textContent || '';

        // 从 offset 向左右扩展获取完整的单词
        let start = offset;
        let end = offset;
        while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) start--;
        while (end < text.length && /[a-zA-Z]/.test(text[end])) end++;

        if (start < end) {
          const word = text.substring(start, end).toLowerCase();
          this.showWordDetail(word);
        }
      }
      // #endif

      // #ifdef APP-PLUS
      // App 端通过 plus.webview 的 JS 桥接实现
      // #endif
    },

    showWordDetail(word) {
      this.$store.word.fetchWordDetail(word, this.contextSentence);
      this.$store.word.wordPopupVisible = true;
    }
  }
}
</script>
```

### 8.4 收藏本 & 复习功能

```javascript
// 收藏单词用例
async toggleBookmark(word) {
  if (this.isBookmarked) {
    await api.post('/api/bookmark/remove', { word: word.word });
  } else {
    await api.post('/api/bookmark/add', {
      word: word.word,
      phonetic: word.phonetic,
      definition_cn: word.definitions[0]?.cn,
      example: word.examples[0]?.en,
      source_scenario_id: this.currentScenarioId,
      source_sentence: this.contextSentence
    });
  }
}

// 收藏列表页
// pages/word/bookmark.vue
// 功能：按场景筛选、按时间排序、搜索、复习模式
// 复习模式：显示单词 → 回想中文 → 点击显示答案 → 标记"记住了/不确定/忘了"
```

---

## 9. API 接口设计

### 9.1 接口清单

| 模块 | 方法 | 路径 | 说明 |
|------|------|------|------|
| **场景** | GET | `/api/scenarios` | 获取场景列表 |
| | GET | `/api/scenarios/:id` | 获取场景详情+配置 |
| | POST | `/api/scenarios/reload` | 热重载场景配置（管理员） |
| | POST | `/api/scenarios` | 新增场景 |
| **对话** | POST | `/api/conversation/start` | 开始新对话会话 |
| | POST | `/api/conversation/next` | 获取下一轮对话（AI 回复） |
| | POST | `/api/conversation/respond` | 提交用户回答 |
| | GET | `/api/conversation/:sessionId/history` | 获取某次会话的完整记录 |
| | POST | `/api/conversation/:sessionId/exit` | 退出/结束会话 |
| **单词** | GET | `/api/word/detail` | 获取单词详情（query: word, context） |
| | POST | `/api/word/click-log` | 记录单词点击 |
| | GET | `/api/word/hot-words` | 热门查询单词 |
| **收藏** | GET | `/api/bookmark/list` | 收藏列表（query: page, scenarioId, search） |
| | POST | `/api/bookmark/add` | 添加收藏 |
| | POST | `/api/bookmark/remove` | 取消收藏 |
| | POST | `/api/bookmark/:id/review` | 更新复习状态 |
| **设置** | GET | `/api/settings` | 获取用户设置 |
| | PUT | `/api/settings` | 更新用户设置 |

### 9.2 核心接口详细定义

```javascript
// POST /api/conversation/start
// 请求
{
  "scenarioId": "restaurant",
  "userId": "default"        // 可选
}
// 响应
{
  "success": true,
  "data": {
    "sessionId": "uuid-xxx",
    "scenario": { /* 场景信息 */ },
    "message": {
      "turnNumber": 1,
      "role": "ai",
      "english": "Welcome to our restaurant! How many people are dining today?",
      "chinese": "欢迎来到我们餐厅！今天几位用餐？",
      "voiceUrl": "/voice/xxx.mp3",
      "userHint": null,
      "isUserTurn": true,
      "isCompleted": false
    }
  }
}

// POST /api/conversation/respond
// 请求
{
  "sessionId": "uuid-xxx",
  "userResponse": "Table for two, please.",
  "inputType": "typed"       // 'typed' | 'voice' | 'hint_followed'
}
// 响应
{
  "success": true,
  "data": {
    "userMessage": {
      "turnNumber": 1,
      "role": "user",
      "english": "Table for two, please.",
      "chinese": "",
      "voiceUrl": null,
      "isCorrect": true,
      "feedback": "Good! 'Table for two, please.' is perfect."
    },
    "nextAiMessage": {
      "turnNumber": 2,
      "role": "ai",
      "english": "Right this way, please. Here's your menu.",
      "chinese": "这边请。这是您的菜单。",
      "voiceUrl": "/voice/yyy.mp3",
      "userHint": {
        "english": "Could you recommend today's special?",
        "chinese": "能推荐一下今日特色吗？",
        "options": [
          "Could you recommend today's special?",
          "What's today's special?",
          "Do you have any recommendations?"
        ]
      },
      "isUserTurn": true,
      "isCompleted": false
    }
  }
}

// GET /api/word/detail?word=welcome&context=Welcome+to+our+restaurant
// 响应
{
  "success": true,
  "data": {
    "word": "welcome",
    "phonetic": "/ˈwelkəm/",
    "definitions": [...],
    "examples": [...],
    "isBookmarked": false,
    "sourceContext": "Welcome to our restaurant!",
    "sourceScenario": "restaurant"
  }
}
```

---

## 10. 完整项目目录结构

```
english-speak-app/
├── client/                          # Uni-app 前端
│   ├── pages/
│   │   ├── index/index.vue          # 首页-场景列表
│   │   ├── scenario/
│   │   │   ├── conversation.vue     # 对话页
│   │   │   └── result.vue           # 完成页
│   │   ├── word/
│   │   │   ├── word-detail.vue      # 单词详情
│   │   │   └── bookmark.vue         # 收藏本
│   │   └── profile/
│   │       ├── index.vue
│   │       ├── history.vue
│   │       └── settings.vue
│   ├── components/
│   │   ├── scenario-card.vue
│   │   ├── message-bubble.vue
│   │   ├── word-popup.vue           # ⭐ 单词详情弹窗
│   │   ├── voice-btn.vue
│   │   ├── voice-input.vue
│   │   ├── user-hint.vue
│   │   └── loading-ai.vue
│   ├── stores/                      # Pinia
│   │   ├── scenario.store.js
│   │   ├── conversation.store.js
│   │   ├── word.store.js
│   │   └── settings.store.js
│   ├── api/
│   │   ├── request.js               # axios/uni-request 封装
│   │   ├── scenario.api.js
│   │   ├── conversation.api.js
│   │   ├── word.api.js
│   │   └── bookmark.api.js
│   ├── utils/
│   │   ├── voice.js                 # 语音工具
│   │   ├── word-detect.js           # 单词点击检测
│   │   └── helpers.js
│   ├── static/
│   │   ├── scenarios/               # 场景图片
│   │   └── icons/
│   ├── App.vue
│   ├── main.js
│   ├── uni.scss
│   └── pages.json
│
├── server/                          # Node.js 后端
│   ├── src/
│   │   ├── server.js
│   │   ├── app.js
│   │   ├── config/
│   │   │   ├── index.js
│   │   │   ├── default.json
│   │   │   ├── development.json
│   │   │   ├── production.json
│   │   │   └── scenarios/           # ⭐ 场景配置目录
│   │   │       ├── restaurant.json
│   │   │       ├── airport.json
│   │   │       ├── job-interview.json
│   │   │       ├── hotel.json
│   │   │       ├── shopping.json
│   │   │       ├── hospital.json
│   │   │       └── travel.json
│   │   ├── routes/
│   │   │   ├── scenario.routes.js
│   │   │   ├── conversation.routes.js
│   │   │   ├── word.routes.js
│   │   │   ├── bookmark.routes.js
│   │   │   └── settings.routes.js
│   │   ├── controllers/
│   │   │   ├── scenario.controller.js
│   │   │   ├── conversation.controller.js
│   │   │   ├── word.controller.js
│   │   │   ├── bookmark.controller.js
│   │   │   └── settings.controller.js
│   │   ├── services/
│   │   │   ├── scenario.service.js   # 场景引擎
│   │   │   ├── conversation.service.js # ⭐ 对话引擎
│   │   │   ├── ai.service.js         # AI 抽象层
│   │   │   ├── tts.service.js        # TTS 抽象层
│   │   │   ├── word.service.js       # 单词服务
│   │   │   └── bookmark.service.js   # 收藏服务
│   │   ├── models/
│   │   │   ├── scenario.model.js
│   │   │   ├── conversation.model.js
│   │   │   ├── word.model.js
│   │   │   └── bookmark.model.js
│   │   ├── middleware/
│   │   │   ├── error-handler.js
│   │   │   ├── validator.js
│   │   │   └── logger.js
│   │   ├── prompts/
│   │   │   ├── conversation.md
│   │   │   └── word-explanation.md
│   │   ├── db/
│   │   │   ├── init.js
│   │   │   └── index.js
│   │   └── utils/
│   │       ├── prompt-builder.js
│   │       ├── text-parser.js
│   │       └── helpers.js
│   ├── data/
│   │   ├── database.sqlite
│   │   ├── voice/                   # TTS 缓存
│   │   └── logs/
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## 11. 实施路线图

按 AI 工具能够逐步实现的顺序排列：

### Phase 1：基础骨架（1 天）
- [ ] Node.js 项目初始化（Express + SQLite）
- [ ] 数据库建表、初始化迁移脚本
- [ ] 场景配置 JSON 示例（写 2-3 个场景）
- [ ] ScenarioService 配置加载
- [ ] 基础 API 路由 + 控制器
- [ ] Uni-app 项目初始化 + 首页场景列表

### Phase 2：核心对话流程（2 天）
- [ ] AI 服务层（对接 DeepSeek/OpenAI）
- [ ] Prompt 构建器 + 对话引擎
- [ ] 对话会话管理（CRUD）
- [ ] TTS 服务（edge-tts 免费方案）
- [ ] 对话页面 UI + 消息气泡
- [ ] 完整对话流程联调（AI → 显示 → 用户回答 → AI 下一轮）

### Phase 3：交互增强（1 天）
- [ ] 用户提示区域（UserHint 组件）
- [ ] 语音播放按钮 + 自动播放
- [ ] 语音输入（口语识别）
- [ ] AI 对用户回答的反馈展示

### Phase 4：单词系统（1 天）
- [ ] 单词点击检测逻辑
- [ ] AI 单词详情生成
- [ ] WordPopup 弹窗组件
- [ ] 收藏/取消收藏
- [ ] 收藏本页面

### Phase 5：打磨完善（1 天）
- [ ] 场景完成页 + 总结
- [ ] 设置页面
- [ ] 练习历史
- [ ] 热重载场景配置的管理接口
- [ ] 错误处理 + 加载状态
- [ ] 离线缓存策略

---

## 12. 关键技术建议

### edge-tts：零成本语音方案
```bash
# 无需 API Key，完全免费
pip install edge-tts
edge-tts --voice en-US-JennyNeural --text "Hello world" --write-media hello.mp3
```
Node.js 侧直接 `exec` 调用，或用 `npm:edge-tts` 封装。支持 100+ 种英语发音。

### AI 模型推荐
- **首选：DeepSeek-V3**（性价比极高，适合中文用户，JSON 输出稳定）
- 备选：GPT-4o-mini（更贵但更稳）
- 本地部署可选：Qwen2.5 / GLM-4（CPU 也能跑）

### 高性价比部署方案
```
服务器: 阿里云轻量 2C4G ¥30/月
数据库: SQLite 无额外开销
AI: DeepSeek API 约 ¥1/百万 tokens
TTS: edge-tts 完全免费
语音识别: Web Speech API (H5) / 免费额度 SDK (App)
```

### 数据模型扩展性
当前设计支持：
- ✅ 无限制的场景数量（加一个 JSON 文件即可）
- ✅ 多种 AI 服务商切换
- ✅ 多种 TTS 服务商切换
- ✅ 多用户（只需扩展 user_id 关联）
- ✅ 未来可接入 WebSocket 实现 AI 流式输出
- ✅ 未来可加 Redis 做缓存层
- ✅ 未来可加排行榜/学习统计

---

## 13. 场景调优：AI 对话的 3 个关键点

面向 AI 工具（如 Cursor/Copilot）的特别提示：

### 关键点 1：JSON 输出格式稳定
Prompt 里要明确要求 AI 返回纯 JSON，且字段名固定：
- 在 System Prompt 末尾加上 `You MUST respond in JSON format with keys: english, chinese, user_hint, is_completed`
- 在 API 调用时设置 `response_format: { type: 'json_object' }`（OpenAI 兼容接口大部分支持）

### 关键点 2：对话长度控制
- 单个场景建议 8-12 轮对话
- 用 `max_turns` + AI 自行判断 `is_completed` 双重保险
- 如果 AI 跑偏，用 System Prompt 里的场景提示词拉回来

### 关键点 3：用户自由发挥的处理
用户可能不按提示的句子说，需要 AI 能理解并继续：
```
在 Prompt 中强调：
- 用户可能说其他内容，请根据场景自然回应
- 如果用户说的句子有语法错误，请友好纠正
- 始终维持场景角色，不要偏离主题
```

---

## 14. 核心界面原型描述

### 首页 — 场景列表
```
┌──────────────────────────────────┐
│  🔤 英语口语练习                   │
├──────────────────────────────────┤
│  🔍 搜索场景...                    │
│                                   │
│  全部  初级  中级  高级           │ ← 分类筛选
│                                   │
│  ┌──────────────────────┐         │
│  │ 🍽️  餐厅点餐         │ 初级   │
│  │ 模拟在餐厅的全流程    │         │
│  ├──────────────────────┤         │
│  │ ✈️  机场出行          │ 中级   │
│  │ 值机、登机、转机      │         │
│  ├──────────────────────┤         │
│  │ 💼  求职面试          │ 高级   │
│  │ 英语面试全真模拟      │         │
│  ├──────────────────────┤         │
│  │ 🏨  酒店入住          │ 初级   │
│  │ 预定、入住、退房      │         │
│  └──────────────────────┘         │
│                                   │
│  📚 收藏单词 (12)  📊 学习统计    │
└──────────────────────────────────┘
```

### 对话页 — 核心操作界面
```
┌──────────────────────────────────┐
│  ← 餐厅点餐              🔊 设置  │
├──────────────────────────────────┤
│                                   │
│  ┌────────────────────────────┐   │
│  │ 🤵 Waiter                  │   │
│  │                            │   │
│  │ Welcome to our restaurant! │   │
│  │ How many people are dining │   │
│  │ today?                     │   │
│  │                            │   │
│  │ 欢迎来到我们餐厅！        │   │
│  │ 今天几位用餐？            │   │
│  │                            │   │
│  │ 🔉 [播放]  🔊 [慢速]     │   │
│  └────────────────────────────┘   │
│                                   │
│  ┌────────────────────────────┐   │
│  │ 💡 轮到你了！              │   │
│  │                            │   │
│  │  试试说：                  │   │
│  │  "Table for two, please."  │   │
│  │   两位，谢谢。             │   │
│  │                            │   │
│  │  🔊 [听示范]  😊 [其他表达]│   │
│  └────────────────────────────┘   │
│                                   │
│  ┌─── 底部输入区 ─────────────┐   │
│  │ 🎤 按住说话    ⌨️ 键盘输入  │   │
│  └────────────────────────────┘   │
└──────────────────────────────────┘
```

---

## 15. 总结：关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 场景=配置而非代码 | JSON 文件 | 新增场景不改代码，AI 工具友好 |
| AI 回复结构 | JSON 格式 | 后端直接解析，前端直接渲染 |
| 对话引擎 | 后端驱动 | 控制 prompt 构造，数据一致性 |
| 单词词典 | AI 按需生成 + 缓存 | 无需预装词典，覆盖所有词 |
| 语音方案 | edge-tts | 免费、高音质、无需 API Key |
| 场景热更新 | 文件监控 + 缓存刷新 | 开发时改 JSON 即时生效 |
| 单词点击检测 | DOM Range API | 精确捕捉到点击的单词，无需额外标记 |
| 用户提示 | AI 生成 user_hint | 不固定死内容，AI 根据场景动态生成 | 
