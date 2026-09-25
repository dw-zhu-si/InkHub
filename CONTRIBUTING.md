# 参与墨枢开发

感谢你关注墨枢（InkHub）。提交代码前，请先确认改动与本项目的本地优先、用户数据安全和独立品牌边界一致。

## 本地环境

- Node.js 版本以 [`.node-version`](.node-version) 为准。
- 包管理器版本以根目录 `package.json` 的 `packageManager` 为准。
- 安装依赖：`corepack enable && pnpm install --frozen-lockfile`。

## 开发与验证

```bash
pnpm dev
pnpm verify
```

`pnpm verify` 会依次执行运行时检查、类型检查、Renderer 边界检查、复杂度检查、测试、关键覆盖率检查和生产构建。提交 Pull Request 前应在本机完整通过。

## 提交原则

- 不提交 API Key、令牌、证书、密码、真实服务地址、用户小说或本机绝对路径。
- 不把 ModelHub 的 Agent/MCP Token 当成应用网关凭据；模型配置必须由用户在本地明确完成。
- 保留 Apache License 2.0、上游归属、修改说明和第三方许可证文件。
- 内部 `@deepwrite/*` 包名、`window.deepwrite` 与旧格式标识属于兼容层；除非有完整迁移方案，不要只为改名而破坏数据兼容。
- 用户可见的新功能应使用“墨枢”或“InkHub”品牌，不新增上游品牌入口或未经授权的网络通道。

## Pull Request

请说明问题、实现方式、验证证据、兼容性影响和必要的回滚方法。涉及数据格式、安全、网络、模型计费或发布流程的改动，应单独列出风险和人工验证范围。
