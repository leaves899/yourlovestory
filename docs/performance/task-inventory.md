# #24 重任务盘点

本盘点基于当前源码入口和可执行基准，区分已测量实现与仓库中尚不存在的任务。没有可调用实现的任务不伪造性能数字，也不为了满足清单机械创建 Worker。

| 任务 | 当前入口 | 基准 | 处理结论 |
| --- | --- | --- | --- |
| 大章节 diff | `src/shared/narrativeWorkbench/blocks.ts` 的 `diffChapterContent` / `diffChapterBlocks` | `baseline.json`、`optimized.json` | 已接入 `chapter:diff:revisions` IPC 的 Worker Threads 路径；主线程保留 SQLite 和边界校验。 |
| 上下文编译 | `src/shared/contextCompiler/compile.ts` 的 `compileContext` | `baseline.json`、`optimized.json` | 已纳入统一协议和等价性测试；复制与 Worker 启动成本使 wall time 高于同步基线，当前保留主线程调用。 |
| 关系图谱计算 | 未发现独立计算入口 | 无法建立真实 fixture | 暂不迁移，待出现真实 CPU 入口后重新基准。 |
| 长文本切块 | 未发现独立计算入口 | 无法建立真实 fixture | 暂不迁移，待出现真实 CPU 入口后重新基准。 |
| 上下文压缩 | 未发现独立计算入口 | 无法建立真实 fixture | 暂不迁移，待出现真实 CPU 入口后重新基准。 |
| 批量摘要 | 未发现批量摘要实现 | 无法建立真实 fixture | 暂不迁移，避免把模型调用误报为本地 CPU 任务。 |
| 全项目一致性扫描 | 未发现扫描实现 | 无法建立真实 fixture | 暂不迁移，待定义真实扫描边界和数据契约。 |
| 搜索索引构建 | 未发现索引实现 | 无法建立真实 fixture | 暂不迁移，待出现索引数据结构和构建入口后重新基准。 |

`baseline.md` 使用同步主线程实现；`optimized.md` 使用同一 fixture，每次测量创建并终止独立 Worker。两份报告都记录 wall、CPU、RSS 增量和 event-loop delay，结果不代表生产硬件或 renderer UI 的完整体验。
