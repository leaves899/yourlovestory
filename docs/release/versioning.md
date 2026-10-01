# 版本策略

## 唯一版本源

应用版本的唯一真实来源是 `package.json.version`。`package-lock.json` 由 npm 同步，
Electron 运行时通过 `app.getVersion()` 读取打包元数据，CI、Git tag 和发布工作流均
验证或读取该值。不要在 renderer、构建配置或普通文档中另存一份当前版本。

仓库名 `yourlovestory` 与 npm 包名、`productName`、`appId`、数据库文件名中的
`yourcrush` 是历史现状。它们涉及安装升级和用户数据兼容，不能在版本发布工作中
直接重命名；品牌迁移应另行设计数据与安装迁移方案。

## 仓库中的版本含义

| 来源 | 含义 | 是否应用 SemVer |
| --- | --- | --- |
| `package.json.version` | 应用版本、打包版本和运行时 `app.getVersion()` | 是，唯一来源 |
| `package-lock.json` 顶层与根 package | npm 锁文件元数据，由 npm 同步 | 是，必须等于唯一来源 |
| `v*` Git tag / GitHub Release | 可分发版本标识 | 是，必须为 `v<package version>` |
| `src/main/database/migrations/` 的 1–9 | SQLite schema migration 序号 | 否 |
| 领域对象的 `version` 数字 | 乐观并发控制或章节修订序号 | 否 |
| Skill、标签库和 Fragment 输出中的版本 | 对应数据格式或内容定义版本 | 否 |
| Electron、React、Pi Agent 等依赖版本 | 第三方依赖约束 | 否 |
| 文档中的示例版本 | 规则示例或历史记录 | 否，不代表当前版本 |

更新页通过类型化 IPC 调用主进程，并由 Electron `app.getVersion()` 显示版本；renderer
没有硬编码应用版本。数据库 migration 序号继续独立递增。

## SemVer 与成熟度

版本使用 `MAJOR.MINOR.PATCH[-PRERELEASE]`：

- Alpha（`X.Y.Z-alpha.N`）：功能和数据模型仍可能变化；允许已知非阻塞缺陷，
  只面向愿意备份数据并反馈问题的测试者。
- Beta（`X.Y.Z-beta.N`）：主要功能范围冻结，核心流程通过测试；允许兼容性修复，
  不应再引入大范围行为变化。
- RC（`X.Y.Z-rc.N`）：Stable 候选；发布内容冻结，所有必需质量门禁、签名和
  notarization 状态已明确，只接受发布阻塞修复。
- Stable（`X.Y.Z`）：面向一般用户；必须通过完整 CI、三平台打包和 Issue #25
  定义的 packaged Electron smoke tests，以及真实签名和 macOS notarization 验证。
  仓库 workflow 当前只允许 draft prerelease，公开 Stable 需要另行授权。

预发布序号从 1 递增。`PATCH` 用于向后兼容的修复和安全更新，`MINOR` 用于向后兼容
的新能力，`MAJOR` 用于破坏性 API、数据或用户工作流变化。`0.y.z` 阶段的破坏性变化
可提升 minor，但仍必须写明迁移影响。

当前版本选择 `0.2.0-alpha.1`：唯一历史标签为 `v0.1.0-alpha.1`，此后已增加长篇
工作台等显著功能，因此此前从错误的 `1.0.0` 回到保守 Alpha 版本线。现在真实 packaged
smoke 已在 Windows、Linux 和 macOS CI 中通过并接入发布门禁；真实代码签名和 Apple
notarization 仍缺外部凭据，继续保持 prerelease，不能据此声明 Stable。

## Tag 与 Release

- Git tag 必须为 `v<package.json.version>`，例如 `v0.2.0-alpha.1`。
- GitHub Release 标题与 tag 相同。
- 含预发布标识的版本必须设置 GitHub prerelease；Stable 不设置 prerelease。
- GitHub Release 必须先创建为 draft，经人工核对后再发布；创建 tag 不代表发布完成。
- 只允许从受保护的主分支提交或经审核、已通过完整 CI 的明确提交进行发布。
- 不从 pull request 事件或任意 fork 代码授予 Release 写权限。

## 数据库与兼容性

应用 SemVer 与 SQLite migration/schema 版本是不同概念。数据库 migration 保持独立、
单调演进，不得为了与应用版本一致而改号。每次涉及 schema 的发布必须说明 migration
是否可逆，并尽可能保持前向兼容。

升级前应退出应用并备份整个 Electron `userData` 目录。Issue #19 已实现数据库自动
备份、migration 前快照、migration 失败回滚和受控恢复。schema 迁移失败的内部回滚
用于保护升级前状态，并不代表支持任意应用版本降级；旧应用可能无法读取新 schema。
发布说明仍须写明兼容边界，保留完整 userData 备份，以覆盖数据库外的角色与配置文件。

## 安全支持

Alpha 阶段只支持 `package.json` 指定的当前预发布版本，下一预发布版本发布后旧版停止
支持。安全修复应发布为新的 patch 或预发布迭代；不承诺当前无法兑现的 LTS 周期。
私密报告渠道和实时支持范围以根目录 `SECURITY.md` 为准。
