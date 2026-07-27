# Changelog

本文件记录面向用户和维护者的重要变化。版本号遵循 SemVer；内部重构和每一个提交
不会被机械复制到这里。

## [Unreleased]

### Added

### Changed

### Fixed

### Security

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
