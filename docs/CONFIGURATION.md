# 配置指南

yourcrush 将应用设置保存到 Electron 的 `userData` 目录。API Key、模型地址和模型名称通过应用内设置页面管理，不从仓库中的环境文件读取。

## 亲密内容开关

亲密内容默认关闭。每个角色使用以下文件控制开关：

```text
crushes/<slug>/.intimate_config
```

启用：

```text
intimate=true
```

关闭：

```text
intimate=false
```

应用通过 `src/shared/persistence/intimateToggle.ts` 读取和写入该文件。只有显式启用且角色存在 `INTIMATE_KNOWLEDGE.md` 时，Agent 才会加载亲密知识。

## 角色文件

角色数据位于 `userData/crushes/<slug>/`。新角色由 `crushes/TEMPLATE/` 创建，模板文件是应用兼容数据的一部分，不是独立的 Claude Code Skill。

`meta.json` 使用以下字段：

```json
{
  "name": "角色名称",
  "nickname": "角色昵称",
  "slug": "url-slug",
  "gender": "male|female|unknown",
  "description": "角色描述",
  "intimate_enabled": false,
  "version": "v1",
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

常用文件：

| 文件 | 用途 |
| --- | --- |
| `meta.json` | 角色元数据 |
| `persona.md` | 性格与说话方式 |
| `memory.md` | 关系记忆 |
| `CONTEXT.md` | 压缩后的角色上下文 |
| `WEEKDAY.md` | 星期速查信息 |
| `INTIMATE_KNOWLEDGE.md` | 可选的亲密知识 |
| `.intimate_config` | 亲密内容开关 |
| `fragments/<date>.json` | 碎片日记 |
| `memories/chats/` | 日常叙事文件 |

## 应用设置

应用设置由 `src/shared/persistence/settingsStore.ts` 管理，并迁移到 Electron `userData` 目录。仓库根目录的 `settings.json` 仅用于兼容旧版本迁移，不能提交到 Git。

通用 `settings.json` 采用整体覆盖写入，并包含凭据引用兼容逻辑。**数据库备份保留策略不写在该文件中**，而是由主进程专用策略文件管理（见下文）。

## 数据安全

### 数据库自动备份与恢复

应用在数据库可用时会：

- 以 WAL 一致快照创建本地 SQLite 备份（含独立 `quick_check` 与 SHA-256）
- 按约 24 小时间隔创建 scheduled 备份
- 在 schema migration 前创建内部隔离快照，失败时可回滚
- 启动时做完整性检查；损坏时进入数据库恢复中心
- 允许用户在设置页或恢复中心按备份 ID 校验与恢复（恢复需显式确认，renderer 不传路径）

备份文件位于主进程控制的 `userData/backups/database/`。普通用户可见备份在创建前会拒绝仍含明文凭据的数据库状态。

### 备份保留策略

用户可在「设置 → 数据安全」阅读和修改：

| 字段 | 含义 | 默认 | 允许范围 |
| --- | --- | --- | --- |
| `maxBackups` | 最多保留的备份份数 | 10 | 1–100 |
| `maxAgeDays` | 手动/定时备份最长保留天数 | 30 | 1–3650 |

策略持久化在主进程文件：

```text
userData/backups/backup-policy.json
```

格式示例：

```json
{
  "version": 1,
  "maxBackups": 10,
  "maxAgeDays": 30
}
```

约束：

- 仅主进程读写；不通过 renderer 任意 settings payload 覆盖
- 缺失或损坏时回退默认 10 份 / 30 天，不阻塞启动
- 写入使用同目录临时文件与安全替换；失败保留上一份有效策略
- 更新成功后立即按新策略执行清理；部分清理失败会如实反馈
- 最近的 pre-migration / pre-restore 备份在容量内优先保留
- **不支持**云备份、增量备份、加密备份或自定义备份目录

### 项目安全导出与导入

设置页与工作台支持项目级安全归档（`.yourcrush-project.json`）：

- 通过原生保存/打开对话框选择路径，renderer 不提交任意路径
- 导出使用 allowlist 字段，并在写出前经过 `sanitizeForExport()`
- 导入为两阶段：预览后显式确认提交
- 默认排除凭据、本机绝对路径与运行时历史等敏感内容

详见 `docs/security/llm-credential-storage.md`。

### 脱敏诊断包

设置页数据安全 Tab 与数据库恢复中心均可导出脱敏诊断包（`.yourcrush-diagnostics.json`）：

- 仅含格式版本、生成时间、应用/Electron/Node 版本、平台架构、数据库状态摘要、当前备份策略、备份聚合统计与 exclusions 列表
- **默认排除**：项目正文/章节、角色与关系私密记录、Fragment/SourceMaterial、聊天、任务 input/result/checkpoint、settings 原文、环境变量、命令行、userData/home/cwd 等绝对路径、备份 ID/文件名、数据库与备份文件内容、`userData/security/`、凭据与 credential ID
- 写出前经过 allowlist 与 `sanitizeForExport()` 双重边界
- 有 1 MiB 大小上限；超限不写出部分文件
- 返回 renderer 的结果仅含 `canceled`、安全 basename、size、sha256
- 在数据库恢复模式下仍可导出

当前 **没有** 远端上传诊断、自动发送遥测或完整应用日志收集。

### 尚未覆盖的范围

Issue #19 的崩溃恢复（未完成任务状态迁移与自动 resume）仍由后续 Phase 处理，**当前未实现**。请勿将现有自动备份、项目导入导出或诊断包理解为“数据安全议题已全部完成”。

## Configuration Summary

yourcrush stores application settings in Electron's `userData` directory. Configure the provider, model, base URL and API key through the in-app settings page.

Intimate content is disabled by default and is enabled only with:

```text
crushes/<slug>/.intimate_config
intimate=true
```

The application provides local SQLite backup/restore, project-level secure export/import, an editable backup retention policy, and sanitized diagnostic export. It does **not** provide cloud/incremental/encrypted backups, custom backup directories, remote diagnostic upload, or crash-task recovery yet.

The application reads and writes intimate config through `src/shared/persistence/intimateToggle.ts`. Do not commit `settings.json`, SQLite databases, logs or personal character data.
