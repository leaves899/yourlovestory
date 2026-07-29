# 任务崩溃恢复与安全 Resume（Issue #19 Phase D）

## 目标

在应用异常退出、进程崩溃、操作系统重启或 Electron 主进程被终止后，正确识别未完成任务，并**只在可证明安全的条件下**恢复。

严禁把“重新执行所有未完成任务”当作自动恢复策略。

## 四类稳定恢复分类

| 分类 | 含义 | 自动恢复 | 人工入口 |
|------|------|----------|----------|
| `resumable` | 已有 versioned checkpoint + 幂等收尾契约 | 是 | 可 |
| `restartable` | 可证明模型调用尚未开始 / 无外部副作用 | 是（从头，稳定幂等键） | 可 |
| `manual-retry-required` | 模型请求中或结果未知，可能计费/副作用不确定 | **否** | 需明确确认 |
| `non-recoverable` | checkpoint 损坏、版本不支持、目标已删等 | 否 | 否 |

## 执行器 / 流程矩阵

| 流程 | 是否 TaskManager 任务 | 自动恢复 | 说明 |
|------|----------------------|----------|------|
| 章节生成 `chapter-generation` | 是 | 条件允许 | 有 schema versioned checkpoint；`chapter_versions.task_id` 唯一索引防重复版本 |
| 章节润色 `chapter-polish` | 是 | 条件允许 | checkpoint schema version；`chapter_revisions.task_id` / `postprocess_reports.task_id` 唯一；auto_apply 幂等 |
| Generic assistant | 是（无业务 checkpoint） | 否 | prompt 不持久化，旧任务不可重放；请重新发送请求 |
| 大纲生成 | 无持久化 runner | 否 | 未实现为可恢复任务 |
| 章节摘要 | 章节生成内部阶段 | 随章节生成 | 不独立恢复 |
| 事实核查 | 章节生成内部阶段 | 随章节生成 | 不独立恢复 |
| 叙事记忆提取 | 直接 service/IPC | 否 | 非 TaskManager 任务 |
| 伏笔建议 | 直接 service/IPC | 否 | 非 TaskManager 任务 |

## 外部模型请求的不确定窗口

时间线（简化）：

1. `queued` / `preparing`：尚未发起模型请求 → 通常 `restartable`
2. 持久化“准备调用模型”之后到收到并确认持久化模型结果之前：`awaiting_model` / `model_in_flight` → **默认 `manual-retry-required`**
3. `persisting_result`：结果写入中断 → `manual-retry-required`（除非目标实体已按 task_id 落库可幂等收尾）
4. 结果已写入（version/revision 存在）但 task 状态未更新 → `resumable`（只收尾，不重放模型）

**数据库事务不能覆盖外部模型请求。** 不得声称 SQLite 事务可消除重复计费风险。

按 `task_id` 找到最终 version/revision 后，恢复器仍会校验项目、章节和任务归属。
章节版本会补齐 chapter 的 `review` / `completed` 状态、摘要、字数和允许的自动确认；
但仅限该 version 仍是最新版本，且已批准版本仍为 current。归属冲突、旧版本或已拒绝
实体会稳定终止为 `non-recoverable`，不会覆盖后来采用/编辑的章节，也不会再次进入恢复循环。
即使 approved version 仍为 current，只要章节正文或采用状态已与它不一致，也拒绝自动回写。
task-bound revision 同样必须仍是最新且 current，才允许执行既有 `auto_apply` 授权。

## 数据模型要点（migration 9）

`tasks` 新增（摘要）：

- `execution_phase`：执行/恢复阶段
- `idempotency_key`：稳定逻辑幂等键（活跃任务唯一索引）
- `checkpoint_schema_version`
- `recovery_classification` / `recovery_reason` / `recovery_action`
- `recovery_attempt_count` / `max_recovery_attempts` / `last_recovery_attempt_at` / `last_recovery_error`
- `recovery_root_task_id`：原始任务与恢复尝试关联
- `lease_owner` / `lease_token` / `lease_expires_at`：DB 级原子 claim
- `timeout_at`
- `shutdown_kind`：`graceful` | `crash`
- `runtime_session_id` / `recovery_metadata_version`

未知的未来 `execution_phase` 会 fail closed 为 `non-recoverable`，但保留格式有效的
input/checkpoint/result JSON 作为诊断与降级兼容证据；只有不可解析的损坏 JSON 才会被清理。

另有 `runtime_sessions` 表记录启动会话。启动时，旧 session 标记 crash、旧 lease
释放、open attempt 关闭和新 session 创建在同一 SQLite 事务完成；任一步失败都会整体回滚。
优雅退出只有在任务 drain 完成后才写 `end_reason=graceful`，超时则保持 session open，
由下次启动按 crash 原子协调。

幂等副作用：

- `chapter_versions.task_id` 唯一（migration 5 已有）
- `chapter_revisions.task_id` 唯一（migration 9）
- `postprocess_reports.task_id` 唯一（migration 9）

原子 claim 使用条件 `UPDATE ... WHERE ...`，以 SQLite `changes` 判定唯一赢家。不要仅用进程内 Map。

## 启动门禁

仅当：

1. 数据库 lifecycle 为 `ready`
2. credential migration 完成（应用业务 ready）
3. `TaskManager` 已创建

才执行 `beginRuntimeSession()` + `scanAndRecoverOnStartup()`。

以下状态**不**扫描业务恢复：

- 数据库 recovery / restoring
- credential migration pending/required
- 应用正在退出（`will-quit` 后禁止新启动/自动恢复/人工重试）

## 优雅关闭

`will-quit` / restore 关闭路径：

1. `beginGracefulShutdown()`：标记进行中任务 `shutdown_kind=graceful`、释放 lease
2. abort 进行中控制器
3. 等待任务 drain；完成后结束 runtime session，再 close DB

drain 超时时不得提前结束 runtime session，也不得关闭仍可能被异步写入的数据库。
应用退出仅在 `drained=true` 且数据库已确认关闭后继续；restore 的 drain 超时会撤销
`restoring` 状态、重新开放 TaskManager、保留当前数据库并返回稳定错误，不 relaunch、
不退出进程。超时前已中止的旧执行仍受 lease fence 约束，不会在恢复开放后落库。
若任务已经 drain、但数据库关闭失败，TaskManager 会创建新的 runtime session 并恢复接纳；
进程不会退出，当前数据库句柄仍作为权威状态。

优雅停止的任务不得在下次启动被误判为“崩溃后的安全自动 resume”，除非结果已按 task_id 持久化（可幂等收尾）。

## 凭据

- 任务 input **不得**持久化 API Key 或 credential secret
- 不得依赖旧记录中的 resolved `credentialId`
- 每次恢复通过**当前项目配置**重新解析凭据

## 人工重试

- Renderer 展示分类、原因、建议动作、attempt 信息
- 仅 `auto_allowed` 显示自动恢复/安全重启按钮
- `manual_retry_allowed` 显示“确认重试”，必须 `window.confirm`（或等价明确意图）且 IPC `confirmed: true`
- 不得盲目 `resume()` 所有失败任务

## 已知限制

- Generic assistant 无业务 checkpoint 且 prompt 不持久化，自动与人工重放都 fail closed
- 大纲生成、记忆提取、伏笔建议不在 TaskManager 恢复范围内
- 模型中断窗口无法由数据库单独证明“未计费”，一律人工确认
- 旧任务（`recovery_metadata_version < 1`）默认 fail closed 到人工
