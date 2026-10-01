# #24 补充任务性能基线

生成时间：2026-10-01T11:01:11.596Z；Node v22.23.1；win32/x64；CPU AMD Ryzen 9 7945HX with Radeon Graphics；预热 2 次、测量 5 次。

真实调用当前编译后的分段、消息预算裁剪、上下文编译和已有块 diff 实现。使用固定生成规则的合成数据；报告不包含正文、消息内容、模型提示词或凭据。

| 任务 | 规模 | 结果 | wall p50/p95 ms | CPU p50/p95 ms | RSS 差值 p50/p95 MB | Node event-loop delay p50/p95 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| splitNarrativeParagraphs | 1000-paragraphs-crlf-whitespace | success | 0.35 / 0.86 | 0.00 / 0.00 | 0.18 / 0.36 | 1.18 / 14.35 |
| splitNarrativeParagraphs | 10000-paragraphs-crlf-whitespace | success | 3.97 / 6.15 | 0.00 / 0.00 | 0.71 / 3.27 | 4.10 / 6.31 |
| splitNarrativeParagraphs | 100000-paragraphs-crlf-whitespace | success | 52.39 / 69.07 | 78.00 / 125.00 | 5.07 / 26.75 | 52.49 / 69.29 |
| splitNarrativeParagraphs | 1-MiB-single-paragraph | success | 0.29 / 0.76 | 0.00 / 0.00 | 0.00 / 0.00 | 0.93 / 13.31 |
| splitNarrativeParagraphs | 10-MiB-single-paragraph | success | 2.68 / 4.26 | 0.00 / 16.00 | 0.00 / 0.00 | 2.74 / 4.33 |
| trimMessagesToBudget | 100-messages-1-KiB-limited | success | 0.32 / 0.44 | 0.00 / 0.00 | 0.00 / 0.00 | 12.22 / 14.94 |
| trimMessagesToBudget | 100-messages-1-KiB-retain-all | success | 0.31 / 0.42 | 0.00 / 0.00 | 0.00 / 0.00 | 13.24 / 15.11 |
| trimMessagesToBudget | 100-messages-10-KiB-limited | success | 0.63 / 0.65 | 0.00 / 0.00 | 0.00 / 0.02 | 0.81 / 16.00 |
| trimMessagesToBudget | 100-messages-10-KiB-retain-all | success | 2.10 / 2.56 | 0.00 / 15.00 | 0.00 / 0.02 | 2.13 / 2.90 |
| trimMessagesToBudget | 1000-messages-1-KiB-limited | success | 0.68 / 0.73 | 0.00 / 16.00 | 0.00 / 0.00 | 0.73 / 0.93 |
| trimMessagesToBudget | 1000-messages-1-KiB-retain-all | success | 2.06 / 2.53 | 0.00 / 0.00 | 0.00 / 0.00 | 2.15 / 2.56 |
| trimMessagesToBudget | 1000-messages-10-KiB-limited | success | 0.69 / 0.89 | 0.00 / 0.00 | 0.00 / 0.02 | 0.77 / 0.96 |
| trimMessagesToBudget | 1000-messages-10-KiB-retain-all | success | 26.17 / 27.00 | 31.00 / 32.00 | 0.02 / 0.07 | 26.33 / 27.22 |
| trimMessagesToBudget | 10000-messages-1-KiB-limited | success | 0.71 / 1.67 | 0.00 / 0.00 | 0.00 / 0.00 | 0.88 / 6.43 |
| trimMessagesToBudget | 10000-messages-1-KiB-retain-all | success | 37.75 / 40.33 | 32.00 / 47.00 | 0.00 / 0.00 | 38.16 / 40.45 |
| trimMessagesToBudget | 10000-messages-10-KiB-limited | success | 0.73 / 1.10 | 0.00 / 0.00 | 0.00 / 0.02 | 1.06 / 8.30 |
| trimMessagesToBudget | 10000-messages-10-KiB-retain-all | success | 312.91 / 342.43 | 313.00 / 344.00 | 0.19 / 0.19 | 313.01 / 342.67 |
| compileContext | summary-64-KiB-body-allowed | success | 7.45 / 9.95 | 15.00 / 31.00 | 0.00 / 0.04 | 7.62 / 10.12 |
| compileContext | summary-1024-KiB-body-allowed | success | 120.40 / 129.05 | 125.00 / 156.00 | 3.28 / 4.93 | 120.80 / 129.16 |
| compileContext | summary-1024-KiB-body-required-over-budget | budget_exceeded | 68.85 / 83.06 | 63.00 / 156.00 | 3.28 / 6.57 | 68.98 / 83.56 |
| compileContext | outline-100-materials-1-KiB | success | 11.02 / 11.53 | 15.00 / 16.00 | 0.00 / 0.06 | 11.20 / 11.83 |
| compileContext | outline-100-materials-10-KiB | success | 95.77 / 99.60 | 94.00 / 125.00 | 0.00 / 0.95 | 95.88 / 99.72 |
| compileContext | outline-1000-materials-1-KiB | success | 58.11 / 63.07 | 47.00 / 63.00 | 0.15 / 0.50 | 58.26 / 63.17 |
| compileContext | outline-1000-materials-10-KiB | success | 480.56 / 500.79 | 484.00 / 500.00 | 0.21 / 0.84 | 480.68 / 500.96 |
| diffChapterBlocks | 1000-existing-blocks | success | 1.45 / 3.13 | 0.00 / 31.00 | 0.03 / 0.60 | 1.50 / 3.18 |
| diffChapterBlocks | 10000-existing-blocks | success | 17.76 / 20.96 | 16.00 / 31.00 | 1.16 / 1.16 | 18.46 / 21.21 |

所有 AgentMessage fixture 使用合法 user 消息（role、content、timestamp），每条内容大小按 UTF-8 字节精确生成。limited 使用 64000 预算；retain-all 使用默认估算器计算全量预算。
长正文 summary 的 allowed 预算为正文真实估算值加 8192；1 MiB 正文另测 64000 预算下必选项超限，budget_exceeded 是真实 fail-closed 结果，其数值诊断见 JSON。outline 素材仍经过实际相关度、容量上限和预算规则。

限制：fixture 构造、模块启动和 SQLite I/O 不计入计时。RSS 是每次同步计算前后进程驻留内存差值，包含 GC 和分配器影响，负值表示进程 RSS 下降；它不是峰值或独立案例内存占用。5 次测量的 p95 等于最大样本，CPU 在 Windows 上具有计时粒度。Node event-loop delay 不能用来声明 Electron renderer UI 已满足响应性验收。

关系图谱：WorkbenchNarrativePage 的 entityNames useMemo 和 GraphPanel relations.map 是真实 renderer 入口。当前只呈现关系列表，没有发现图布局或路径计算；其 React/DOM 提交耗时与交互延迟需通过实际 renderer fixture 测量，不能使用本脚本的数据替代。
批量摘要、全项目叙事一致性扫描、搜索索引构建没有独立现有入口。单章 summary/fact_check 的模型 I/O 不作为本地 CPU 基准；前置 Compiler 和 Agent budget 已单独测量。

完整样本、输出条数/预算状态、指标定义及被测 dist 模块 SHA-256 见 [inventory-baseline.json](./inventory-baseline.json)。本报告只建立同步基线，不宣称 Worker 优化收益。
