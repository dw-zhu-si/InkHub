# 墨枢（InkHub）

[English](README.en.md)

墨枢是独立维护的、本地优先的 AI 小说创作与作品管理桌面应用。它把小说目录、全书索引、逐章阅读、质量检查、可审阅的 AI 修复、专业 Agent / Skill，以及封面和插图工作流放在同一个工作台中。

墨枢不是 DeepWrite 的官方版本，也不代表上游认可或背书。项目初始代码使用了 Apache License 2.0 授权的 [DeepWrite](https://github.com/swjybky/deepwrite)，此后进行了独立开发与大量修改；完整来源和修改说明见[上游说明](UPSTREAM.md)与[修改说明](MODIFICATIONS.md)。

## 主要能力

- **本地小说库**：添加一个或多个小说目录，只保存路径引用，不自动搬移、改名或删除原文件。
- **全书导入与阅读**：为 Markdown、TXT、DOCX、PDF、EPUB 建立应用私有索引，按卷分组逐章阅读，并提供卷内编号、上下章、阅读进度和全文搜索。
- **质检与修复闭环**：检查空章、异常短章、跨章重复等问题；AI 修复稿必须先由作者逐章接受、拒绝或编辑，再经确认写回 Markdown / TXT 原稿。
- **写作智能体与技能**：提供面向结构、连续性、人物知识边界、文风、场景、伏笔和复审等任务的 Agent 与 Skill 组合。
- **视觉工作流**：按目标平台尺寸生成小说封面底图并在本地排版书名、作者名；短篇小说可按内容规划插图。
- **多模型接入**：支持 ModelHub，以及 OpenAI、Anthropic、Google Gemini、DeepSeek、通义千问、豆包、智谱、Kimi、MiniMax、OpenRouter、Ollama、LM Studio 等直连或兼容 API。
- **本地搜索与任务恢复**：使用 SQLite FTS5/BM25 搜索正文；长任务分批保存检查点，可取消并在失败或重启后恢复。

## ModelHub 与厂家直连

ModelHub 是推荐但非必需的统一模型管理入口，可用于密钥管理、路由、用量统计和故障切换。墨枢也允许用户直接配置厂家 API 或自定义兼容 API。

- 不要把 ModelHub Agent / MCP Token 当作项目网关令牌。
- 不要把密钥写进 API URL、源码或可提交的环境文件。
- 连接测试和模型调用可能产生真实费用，只应由用户主动触发。
- 密钥由桌面端安全存储处理，不暴露给 Renderer 页面。

## 本地数据边界

- 小说文件属于用户内容，不会因为标题、关键词或正文而被当作可执行指令。
- 本机 Skill 采用“路径 + SHA-256”引用；内容变化后需要重新核验。
- 对来源小说的自动发现、索引和预览默认只读；任何写回都需要明确操作和冲突校验。
- 上游更新、远程免费模型目录、技能市场、云备份和软件用量上报默认禁用或隔离，除非另行完成配置、授权与审计。

## 从源码运行

需要 Node.js 24+ 和 pnpm 11+：

```bash
git clone https://github.com/dw-zhu-si/InkHub.git
cd InkHub
pnpm install --frozen-lockfile
pnpm dev
```

完整校验与生产构建：

```bash
pnpm verify
```

测试安装包需在目标平台构建：

```bash
# Windows x64
pnpm pack:test:win

# macOS Apple Silicon
pnpm pack:test:mac:arm64

# macOS Intel
pnpm pack:test:mac:x64
```

构建产物进入 `apps/desktop/release/`。macOS 测试包使用 ad-hoc 签名且不等同于 Developer ID 签名与公证；Windows 产物应在 Windows 真机上完成安装和运行验收。

## 项目结构

```text
apps/desktop/                 Electron 桌面端
packages/contracts/           IPC 与业务契约
packages/pi-runtime-adapter/  Agent Runtime 适配层
packages/shared/              共享工具
tools/                        构建、校验与发布脚本
```

源码中的部分 `@deepwrite/*` 工作区包名、`deepwrite.json` 文件名、IPC 标识和存储键是为了兼容历史数据及降低迁移风险而保留的内部标识，不表示品牌从属，也不表示上游参与维护墨枢。

## 参与项目

提交问题或代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全漏洞不要公开披露，请按 [SECURITY.md](SECURITY.md) 中的私下报告流程处理。

## 许可证与归属

本仓库按 [Apache License 2.0](LICENSE) 发布。使用、修改或再分发前，请同时阅读：

- [NOTICE](NOTICE)：随发行版提供的归属提示
- [UPSTREAM.md](UPSTREAM.md)：上游来源、基准提交和独立维护关系
- [MODIFICATIONS.md](MODIFICATIONS.md)：相对上游的主要修改范围
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：第三方与研究来源边界
- [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)：已安装生产依赖的许可证汇总

`InkHub`、`墨枢`及上游项目名称可能分别涉及其权利人的商标或名称权益；Apache License 2.0 不授予超出合理来源说明所需的商标许可。
