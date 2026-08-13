# TalkScape

TalkScape 是一个开源的 AI 英语口语练习应用，通过餐饮、旅行、住宿、购物、求职等真实场景，帮助学习者把英语真正说出来。

> 项目目前处于早期开发阶段，接口和数据库结构仍可能发生变化，建议先用于学习、测试和二次开发。

## 功能

- 场景化 AI 口语对话与分级任务
- 文本输入、语音识别和语音合成
- 智能提示、表达示例、纠错与讲解
- 单词查询、收藏和词本闯关
- 英语、日语学习语言支持
- 用户注册、登录和个性化设置
- 场景、提示词及 AI 模型管理后台
- uni-app 多端客户端，可构建 H5、App 和微信小程序

## 技术栈

- 客户端：uni-app、Vue 3、Pinia、Vite
- 服务端：Node.js、Koa 2、Knex
- 数据库：MySQL 8+
- AI：OpenAI 兼容接口、DeepSeek、火山引擎语音服务
- 管理后台：EJS

## 项目结构

```text
talkscape-client/   uni-app 客户端
src/                Koa 服务端与管理后台
src/db/migrations/  数据库迁移
src/data/            公开场景基础数据
database/           可导入的初始化 SQL
scripts/            数据维护和生成脚本
__tests__/           自动化测试
```

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- MySQL 8 或兼容版本
- npm

### 1. 获取代码并安装服务端依赖

```bash
git clone https://github.com/izzieeric/talkscape.git
cd talkscape
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少配置：

- `JWT_SECRET`
- MySQL 连接信息
- 需要使用的 AI 服务 API Key

不要提交 `.env` 或任何真实密钥。

### 3. 初始化数据库

先创建 `.env` 中配置的数据库，然后执行：

```bash
npm run db:migrate
mysql -u talkscape -p talkscape < database/init-data.sql
```

初始化 SQL 只包含公开场景和内置提示词，不包含用户、管理员、会话、缓存或生成语音。详细说明见 [database/README.md](database/README.md)。

### 4. 启动服务端

```bash
npm run dev
```

默认健康检查地址：

```text
http://localhost:3000/talkscape/health
```

### 5. 启动客户端

```bash
cd talkscape-client
npm install
npm run dev:h5
```

客户端接口地址通过 `VITE_API_BASE_URL` 配置，默认使用：

```text
http://localhost:3000/talkscape
```

## 基础数据维护

场景目录保存在 `src/data/scenario-catalog.json`。修改场景或内置提示词后，重新生成公开 SQL：

```bash
npm run db:init-data
```

生成文件是幂等的，可以重复导入。

## 第三方服务

TalkScape 本身不提供模型额度。运行完整功能可能需要自行申请第三方服务凭据并承担费用。请在使用前阅读相应服务商的条款、隐私政策和内容规则。

## 项目状态

当前版本适合：

- 学习 AI 应用和全栈开发
- 本地体验和功能验证
- 在理解代码与安全配置后进行二次开发

暂不建议未经安全评估直接部署为面向公众的生产服务。

## 参与贡献

欢迎提交 Bug、功能建议和代码改进。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

- Bug 与功能建议：[GitHub Issues](https://github.com/izzieeric/talkscape/issues)
- 作者主页：[@izzieeric](https://github.com/izzieeric)
- 安全漏洞：请按照 [SECURITY.md](SECURITY.md) 私下报告，不要公开披露

## 免责声明

AI 输出可能不准确、不完整或不适合作为专业语言教学依据。本项目不替代专业教师、正式课程或语言能力认证。自部署实例的数据处理和合规责任由实例运营者承担。完整说明见 [DISCLAIMER.md](DISCLAIMER.md)。

## License

许可证尚在确定中。在正式添加开源许可证前，代码默认仍受版权保护，请勿擅自复制、分发或商业使用。
