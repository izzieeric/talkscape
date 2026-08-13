# Contributing

感谢你愿意参与 TalkScape。

## 提交问题

提交 Issue 前请先搜索是否已有相同问题，并尽量提供：

- 运行目标：H5、App、微信小程序或服务端
- Node.js、操作系统和数据库版本
- 清晰的复现步骤
- 期望行为与实际行为
- 去除隐私信息后的日志或截图

请勿在 Issue 中提交 API Key、访问令牌、数据库备份、用户数据或其他敏感信息。

## 提交代码

1. Fork 仓库并从 `main` 创建功能分支。
2. 保持改动范围清晰，避免混入无关格式化。
3. 新功能应补充必要测试和文档。
4. 确保没有提交 `.env`、运行数据、生成语音或密钥。
5. 提交 Pull Request，说明动机、实现和验证方式。

提交信息建议遵循 Conventional Commits，例如：

```text
feat: add a new speaking scenario
fix: prevent duplicate conversation messages
docs: improve local setup guide
```

提交贡献即表示你有权提供相关内容，并同意该贡献在项目最终采用的许可证下发布。
