# Changelog

本文件记录面向用户和维护者的重要变化。版本号遵循 SemVer；内部重构和每一个提交
不会被机械复制到这里。

## [Unreleased]

### Added

- 增加持久化任务检查点、崩溃恢复分类、原子 lease 和恢复尝试记录。
- 增加章节正文、摘要、事实核查的统一上下文编译、来源面板和显式 Token 预算错误。
- 增加共享 Context Compiler 的独立卷大纲生成任务、来源面板、进度、取消和分类恢复。
- 增加 Windows、Linux、macOS 真实 packaged Electron smoke，验证原生 SQLite 和重启持久化，并设为 CI 与发布门禁。
- 增加可复现的主线程与 Worker 性能基准、CPU/内存和 event-loop 对照数据。

### Changed

- 恢复沿用已完成阶段的来源追踪；来源、参数或章节版本改变时要求新建生成任务。
- 章节修订与生成版本的差异计算进入 Worker Threads，提供进度、取消、超时与分页结果。
- 章节生成和独立卷大纲的上下文编译进入 Worker，等待后重新核对来源与版本，采用结果时保留原子写入边界。
- 打包产物文件名包含版本、平台与架构，发布诊断文件与分发产物分开上传。

### Fixed

- 使用稳定业务目标阻止重复活跃任务，防止旧生成结果或修订覆盖用户更新。
- 卷大纲草稿与采用检查点原子提交，恢复严格核验来源和版本，避免重复写入和覆盖用户编辑。
- 无模型的检查点收尾不依赖模型凭据；恢复收尾保留上下文 metadata 和 Debug 授权。
- 打包命令显式关闭自动上传，避免 master CI 意外尝试发布 Release。

### Security

- 增加受保护环境中的签名与 notarization 门禁、脱敏状态报告、三平台最终产物与校验和核验；缺少凭据时安全失败。

### Deprecated

### Removed

## [0.2.0-alpha.1]

### Added

- 增加长篇创作工作台及项目、素材、大纲、章节生成、审核和叙事记忆能力。
- 增加类型化 IPC、SQLite 仓储和 Pi Agent 工具共用的领域服务。
- 建立版本一致性检查、发布策略、draft release 流程和 SHA-256 校验和工具。

### Changed

- 将长篇创作工作台作为产品主线，同时保留旧 Crush、Day 和 Fragment 兼容入口。
- 将 `package.json.version` 确立为应用版本的唯一来源。

### Fixed

- 加强章节生成、事实检查确认和首次章节工作流边界。

### Security

- 加强模型端点校验、凭据安全存储和 Agent 写操作确认边界。

[Unreleased]: https://github.com/leaves899/yourlovestory/compare/v0.2.0-alpha.1...HEAD
[0.2.0-alpha.1]: https://github.com/leaves899/yourlovestory/compare/v0.1.0-alpha.1...v0.2.0-alpha.1
