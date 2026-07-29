# LLM 凭据存储边界

LLM API Key 仅由 Electron 主进程通过 `safeStorage` 加解密。普通设置和 SQLite
只保存凭据引用；renderer、任务输入、会话状态和日志不得接收解密后的值。

任何项目导出、数据库备份或诊断包实现都必须满足以下边界：

- 排除 `userData/security/` 及 `llm-credentials.json`，不得打包密文 payload。
- 设置、数据库快照、日志和异常对象在写出前必须经过 `sanitizeForExport()`。
- 不导出无业务必要的 credential ID；不得提供恢复或读取完整凭据的 IPC。
- 删除或替换凭据后必须失效已有 Agent runtime，下一次请求由主进程重新解析。

## 当前已实现的能力

### 数据库备份

- 主进程创建 WAL 一致的本地 SQLite 快照，附带 `quick_check` 与 SHA-256。
- 用户可见备份在创建前检查明文凭据安全；存在未迁移明文凭据时拒绝备份。
- 备份仅通过备份 ID 恢复，renderer 不传路径；恢复需要 `confirm: true`。
- 备份保留策略由主进程文件 `userData/backups/backup-policy.json` 持久化，
  默认最多 10 份、最长 30 天，字段经严格校验。策略不放在可整体覆盖的
  `settings.json` 中。
- **不提供**云备份、增量备份、加密备份或自定义备份目录。

### 项目安全归档

- 项目导出/导入通过原生对话框选择文件，renderer 不提交任意路径。
- 导出内容使用 allowlist，并在序列化前调用 `sanitizeForExport()`。
- 导入采用预览 + 显式确认的两阶段流程。
- 默认排除凭据、本机路径和运行时历史等敏感字段。

### 脱敏诊断包

- 用户可从设置页或数据库恢复中心导出 `.yourcrush-diagnostics.json`。
- 仅包含应用/平台版本、数据库状态摘要、备份策略与备份聚合统计等 allowlist 字段。
- **默认不包含**：项目正文、角色/关系私密记录、聊天、任务 input/result/checkpoint、
  settings 原文、security 目录、凭据/credential ID、本机绝对路径、备份 ID/文件名、
  数据库或备份文件原始内容。
- 诊断导出在数据库不可用时仍允许使用；返回值不含绝对路径。
- **不提供**远端上传、自动发送或遥测。

## 尚未实现

- 未完成任务的崩溃恢复、任务状态 migration 与自动 resume（Issue #19 后续 Phase）。
- 云同步、加密备份密钥管理、自定义备份目录。

新增相关能力时，仍须把本节规则作为安全验收条件，而不是假设上游配置已经不含敏感字段。
