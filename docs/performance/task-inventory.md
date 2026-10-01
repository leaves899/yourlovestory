# #24 重任务盘点

本盘点基于当前源码入口和可执行基准，区分已测量实现与仓库中尚不存在的任务。没有可调用实现的任务不伪造性能数字，也不为了满足清单机械创建 Worker。

| 任务 | 当前入口 | 基准 | 处理结论 |
| --- | --- | --- | --- |
| 大章节 diff | `src/shared/narrativeWorkbench/blocks.ts` 的 `diffChapterContent` / `diffChapterBlocks` | `baseline.json`、`optimized.json` | 已接入 `chapter:diff:revisions` IPC 的 Worker Threads 路径；主线程保留 SQLite 和边界校验。 |
| 上下文编译 | `src/shared/contextCompiler/compile.ts` 的 `compileContext` | `baseline.json`、`optimized.json`、`compiler-worker-comparison.md` | 章节/大纲生产路径已通过统一 Worker 协议执行，并有纯函数等价性、budget trace 和取消测试；单次短输入 Worker wall time 较高，但长上下文可把主线程 event-loop 阻塞降至约 16 ms。真实 SQLite 来源读取、checkpoint fence 和事务边界仍在主进程。 |
| 关系图谱计算 | 未发现独立计算入口 | 无法建立真实 fixture | 暂不迁移，待出现真实 CPU 入口后重新基准。 |
| 长文本切块 | 未发现独立计算入口 | 无法建立真实 fixture | 暂不迁移，待出现真实 CPU 入口后重新基准。 |
| 上下文压缩 | `src/agent/llm/context.ts` 的 `trimMessagesToBudget` / `createContextBudgetTransformer` | `inventory-baseline.md`、`context-worker-comparison.md`、`llm.test.ts`、Agent factory tests | 默认 64k 或小输入保留主线程 bounded path；context budget >256k 且消息正文总量 >4MiB 且不超过 32MiB 时通过 Agent factory 注入的统一 Worker 执行 `trimMessagesToBudget`。估算避免复制长 user string，Worker 等价性和取消由专门测试覆盖；10000×10KiB（约100MiB）实际 Worker structured clone 触发 128MiB heap OOM，故更大输入保留主线程且不做同步 fallback。 |
| 批量摘要 | 未发现批量摘要实现 | 无法建立真实 fixture | 暂不迁移，避免把模型调用误报为本地 CPU 任务。 |
| 全项目一致性扫描 | 未发现扫描实现 | 无法建立真实 fixture | 暂不迁移，待定义真实扫描边界和数据契约。 |
| 搜索索引构建 | 未发现索引实现 | 无法建立真实 fixture | 暂不迁移，待出现索引数据结构和构建入口后重新基准。 |

`baseline.md` 使用同步主线程实现；`optimized.md` 使用同一 fixture，每次测量创建并终止独立 Worker。两份报告都记录 wall、CPU、RSS 增量和 event-loop delay，结果不代表生产硬件或 renderer UI 的完整体验。
