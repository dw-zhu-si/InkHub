# 上游来源与独立维护说明

## 来源

墨枢（InkHub）的初始代码基础来自：

- 上游项目：[DeepWrite](https://github.com/swjybky/deepwrite)
- 上游许可证：Apache License 2.0
- 本次独立开发所基于的上游提交：[`4442acf860b6dae71dd6fc85eb86422a7f7117ec`](https://github.com/swjybky/deepwrite/commit/4442acf860b6dae71dd6fc85eb86422a7f7117ec)

上游项目在该基准中未附带单独的 `NOTICE` 文件；本仓库保留 Apache License 2.0 全文，并通过本文件、根目录 `NOTICE` 和 `MODIFICATIONS.md` 说明来源与修改。

## 独立维护关系

墨枢是独立维护的项目，不是 DeepWrite 的官方版本、发行渠道或下属品牌。墨枢的功能、发布、支持、安全决定和后续修改由墨枢项目自行负责；本仓库不暗示 DeepWrite、其维护者或贡献者对墨枢提供认可、担保、支持或背书。

本项目仅在说明代码来源和履行许可证要求所需的范围内使用上游名称与链接。上游项目及贡献者对其代码的权利仍归相应权利人所有。

## 兼容标识

源码中的部分 `@deepwrite/*` 工作区包名、`deepwrite.json` 文件名、IPC 标识和本地存储键暂时保留，用于读取历史数据、保持进程间协议稳定并降低迁移风险。它们是内部兼容标识，不是用户可见品牌声明，也不代表上游参与墨枢维护。

更改或移除这些标识需要配套的数据迁移、回滚和兼容测试，因此不应只为品牌替换进行机械重命名。

## 核对方式

要进行逐文件来源核对，可分别检出上述 DeepWrite 基准提交与目标 InkHub 版本，再使用 `git diff --no-index` 或等价工具比较两个源代码目录。主要修改范围见 [MODIFICATIONS.md](MODIFICATIONS.md)。
