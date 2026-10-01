# 性能基准（主线程基线）

生成时间：2026-10-01T10:23:36.312Z；Node v22.23.1；win32/x64；预热 2 次，测量 5 次。

| 任务 | 规模 | wall p50/p95 ms | CPU p50/p95 ms | RSS 增量 p50/p95 MB | event-loop delay p50/p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| diffChapterContent | 1000-paragraphs | 14.74 / 18.99 | 16.00 / 31.00 | 1.71 / 5.96 | 14.80 / 19.07 |
| diffChapterContent | 5000-paragraphs | 134.75 / 145.09 | 141.00 / 171.00 | 1.07 / 5.39 | 134.79 / 145.18 |
| diffChapterContent | 10000-paragraphs | 581.26 / 795.70 | 562.00 / 812.00 | 7.36 / 11.86 | 581.30 / 795.75 |
| compileContext | 100-items | 11.69 / 12.08 | 16.00 / 16.00 | 0.00 / 0.00 | 11.79 / 12.11 |
| compileContext | 500-items | 22.01 / 22.95 | 31.00 / 93.00 | 0.00 / 0.70 | 22.12 / 23.10 |
| compileContext | 1000-items | 33.22 / 36.52 | 32.00 / 109.00 | 0.04 / 3.73 | 33.25 / 36.68 |

说明：这是同一 Node 主线程同步实现的可复现实验，不代表 Electron renderer 的 UI 响应性；worker 迁移前后必须用相同 fixture 与指标重复测量。
Worker Threads 对照结果见 [optimized.md](./optimized.md)。当前数据支持迁移大章节 diff：主线程 5000 段落及以上的 event-loop delay 随计算时间增长，而 Worker 对照约保持在 15-17 ms。compileContext 的 Worker wall time 高于同步基线，因此保留主线程实现，避免复制和启动成本抵消收益。
