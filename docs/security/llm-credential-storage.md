# LLM 凭据存储边界

LLM API Key 仅由 Electron 主进程通过 `safeStorage` 加解密。普通设置和 SQLite
只保存凭据引用；renderer、任务输入、会话状态和日志不得接收解密后的值。

任何新增的项目导出、备份或诊断包实现都必须满足以下边界：

- 排除 `userData/security/` 及 `llm-credentials.json`，不得打包密文 payload。
- 设置、数据库快照、日志和异常对象在写出前必须经过 `sanitizeForExport()`。
- 不导出无业务必要的 credential ID；不得提供恢复或读取完整凭据的 IPC。
- 删除或替换凭据后必须失效已有 Agent runtime，下一次请求由主进程重新解析。

当前代码库没有项目归档、数据库备份或诊断包生成器。后续新增这些能力时，
应将上述规则作为安全验收条件，而不是假设上游配置已经不含敏感字段。
