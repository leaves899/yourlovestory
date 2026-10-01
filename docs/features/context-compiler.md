# Context Compiler 与任务恢复

Issue #22 的实现位于 `src/shared/contextCompiler/`。卷大纲、章节正文、摘要和
事实核查统一经过 `compileContext`。卷大纲领域映射复用 `contextAssembly`，
独立 runner 位于 `src/main/tasks/outlineGenerationTask.ts`，不会另建 Prompt 拼接器。

## 输入、选择和预算

输入来自项目配置、章节和卷目标、角色、关系、世界观、显式素材、已采用前文章节、
已批准叙事记忆和未关闭伏笔。候选按策略、相关度、优先级和稳定排序选择；trace 记录
选中及舍弃来源、原因、估算预算、模型参数、Prompt 版本和策略版本。

预算预留 system prompt 与模型输出。必选项放不下时明确抛出
`ContextBudgetExceededError`，保存失败 trace，禁止调用模型。Token 使用确定性启发式
估算，不是模型服务商的精确 tokenizer；不能把估算上限宣称为服务商 Token 精确保证。

## 检查点与恢复

`stage_compiles` 保存在检查点和任务结果。Debug 默认关闭；明确开启后才保留
`final_prompt`，且该授权随任务输入保存。来源快照属于本机业务检查点证据，可能包含
项目文本；不得公开上传数据库，脱敏诊断包继续只导出字段白名单。

恢复前核对来源快照、模型参数、章节版本和原正文。来源不变时保留已完成阶段 trace，
继续阶段可确定性选择；来源发生变化时禁止混合旧结果和新来源，要求新建任务。
已有最终版本的恢复只做幂等收尾，保留原始 metadata，不重新编译或调用模型。
损坏 metadata 稳定终止，缺失新 compiler 来源证据时也不静默降级。

旧 master 的无 compiler 检查点继续受既有 schema 和恢复分类保护，不能补造历史 trace。
这些任务缺少新来源快照和章节版本证据，因此不具备新检查点同等的上下文复现保证。

## 范围

没有新增 embedding、RAG、router 或长期记忆服务。Generic assistant、章节润色、
直接记忆提取和伏笔建议的上下文运行时不在这次接入范围内，不能宣称所有模型调用
都已统一。

## 独立卷大纲生成

工作台卷章大纲页对当前活动项目的草稿卷大纲提交 `outline-generation` 任务。
模型参数取自当前项目配置和显式表单；任务输入只持久化目标 ID、非秘密模型参数和
Debug 授权。选中素材、前文、已批准记忆和未关闭伏笔遵循现有 outline compiler 策略。
预算不足时保留失败 trace，显示错误并禁止模型调用。

检查点 schema 为 1，阶段为 `prepared`、`model`、`ready`、`applied`。
模型请求开始前持久化 `model`；该不确定窗口只允许人工确认重试。
`ready` 中的严格 JSON 提案与 compiler trace 已持久化，恢复可不调用模型。
大纲草稿写入和带 `applied_version` 的 `applied` 检查点共用 lease 保护的 SQLite
事务，避免写入成功而检查点丢失。`applied` 恢复验证任务标识、结果字段和精确版本，
只收尾，不再次更新大纲。

恢复和采用前都验证来源快照、项目/配置/卷/大纲版本、Prompt 版本、模型参数、Debug
授权及确定性重编译 trace。用户更新、确认或锁定大纲，或上下文前提改变时终止旧任务，
保留当前用户内容。损坏或不支持的 metadata fail closed。生成不会自动确认或锁定。
页面在有未保存编辑时禁用生成和恢复，任务完成刷新也会保留当前本地草稿。
