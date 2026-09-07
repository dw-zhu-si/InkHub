# 墨枢 · InkHub

本地优先的 AI 小说创作、阅读与作品管理桌面应用。

此仓库仅用于分发经验证的安装包、版本说明、支持与隐私材料和许可证，不包含开发源码或原项目 Git 历史。

## 下载

[查看正式 Release](https://github.com/dw-zhu-si/InkHub/releases)

0.3.1 正式资产适用于 Apple Silicon Mac（arm64）。Windows 与 Intel Mac 未纳入本版公开资产。

下载后请使用同一 Release 中的 `SHA256SUMS.txt` 校验文件摘要。macOS 安装包使用 Developer ID 签名并经过 Apple 公证；不要通过关闭系统安全保护运行来源不明或校验不一致的文件。

## 核心工作流

导入本地小说目录 → 按卷逐章阅读与全文检索 → 规则/AI 质检 → AI 生成修复稿 → 作者审阅 → 单独确认写回。

墨枢支持直接配置常用模型厂家和自定义兼容 API，也支持并推荐使用本机 [ModelHub](https://github.com/dw-zhu-si/ModelHub) 统一管理密钥、模型路由与用量。ModelHub 不是使用墨枢的前置条件。模型连接测试与生成调用可能由对应供应商计费，输出需要人工审阅。

## 隐私与安全

小说、索引、对话和创作配置默认保存在本机。只有用户配置模型并主动执行 AI 操作时，所选正文、提示词或附件才会发送到用户选择的模型服务。详细说明见 [PRIVACY.md](PRIVACY.md)。

请勿把模型密钥、Apple 凭证、小说全文、数据库、个人目录或未经脱敏的日志提交到公开 Issue。

## 许可与支持

InkHub 基于 Apache-2.0 授权的 [DeepWrite](https://github.com/swjybky/deepwrite) 修改，采用独立品牌，不代表上游认可或背书。许可证与第三方声明见每个 Release 的随附文件。

- [支持与反馈](SUPPORT.md)
- [隐私说明](PRIVACY.md)
- [提交问题](https://github.com/dw-zhu-si/InkHub/issues)
