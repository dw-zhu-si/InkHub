# 第三方软件与研究来源声明

墨枢（InkHub）的初始代码基础来自 [DeepWrite](https://github.com/swjybky/deepwrite)，原项目及其贡献者的权利归相应权利人所有。墨枢与 DeepWrite 独立维护，不是其官方版本，也不代表上游认可或背书。

DeepWrite 以 Apache License 2.0 授权。本项目根目录中的 `LICENSE` 保留了该许可证全文。上游基准提交、独立维护关系和修改范围另见 `NOTICE`、`UPSTREAM.md` 与 `MODIFICATIONS.md`。

为降低初期迁移风险，源码内部仍保留部分 `@deepwrite/*` 工作区包名与 IPC 标识；这些标识仅用于技术兼容，不表示 DeepWrite 对墨枢的认可或背书。

## 小说创作方法研究来源

墨枢的 8 个“剧情设计 Skills”和新增专业智能体提示词为项目内独立编写的 instruction-only 适配；未复制、打包或执行下列仓库的脚本、Hook、插件、示例小说或其他可执行配置：

- `imerzzhu/ai-novel-writing-skills`，固定研究提交 `0986c4882137d7d350700f3d13617ebec9889dd1`，MIT License。
- `danjdewhurst/story-skills`，固定研究提交 `c482d48f4eb9b488f033a77a51f9fae55cc0d75f`，MIT License。
- `haowjy/creative-writing-skills`，固定研究提交 `fd7a3ad9cd7697a0645ff6ff4bd5e809cf7673a3`，Apache License 2.0。

上述来源只用于研究通用的故事规划、分卷、角色、场景、伏笔、世界观和修订工作流。墨枢适配不包含第三方连续表达、专属角色/情节、自动改稿脚本、外部网络调用或凭证配置。各来源的权利仍归原作者和贡献者所有。

## 封面生成方法参考

墨枢研究了 `adrianpunk/Punk-Skill` 的“从风格目录选择一种风格，再编译为封面生成提示”的高层方法，固定研究提交为 `50ea29b65b98788f9ed1df62818dbe530855bfb3`。审查时该仓库未提供许可证，因此墨枢不复制、不打包也不执行其提示词正文、脚本、参考图或样例输出。

项目内的“小说封面艺术指导”Skill、24 种封面风格描述、提示词编译器和本地排版实现均为墨枢独立编写；该来源只作为方法研究记录，不构成其内容已被安装或再分发。

## 已安装生产依赖

桌面端已安装 production 依赖及 Electron 运行时的许可证原文、版权声明和生成校验信息见 `THIRD_PARTY_LICENSES.txt`。该文件由 `node tools/generate-third-party-licenses.mjs` 生成，可使用 `--check` 做只读复验。
