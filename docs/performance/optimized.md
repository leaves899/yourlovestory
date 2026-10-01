# 性能基准（Worker Threads）

生成时间：2026-10-01T10:37:15.924Z；Node v22.23.1；win32/x64；预热 2 次，测量 5 次。

| 任务 | 规模 | wall p50/p95 ms | CPU p50/p95 ms | RSS 增量 p50/p95 MB | event-loop delay p50/p95 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| diffChapterContent | 1000-paragraphs | 62.02 / 64.00 | 78.00 / 109.00 | 1.17 / 2.53 | 15.43 / 15.45 |
| diffChapterContent | 5000-paragraphs | 314.96 / 326.19 | 406.00 / 453.00 | 3.52 / 8.92 | 16.41 / 16.52 |
| diffChapterContent | 10000-paragraphs | 1027.36 / 1117.59 | 1110.00 / 1329.00 | 0.00 / 3.04 | 16.56 / 16.61 |
| compileContext | 100-items | 70.36 / 73.79 | 109.00 / 110.00 | 0.77 / 2.95 | 15.25 / 16.01 |
| compileContext | 500-items | 91.93 / 104.06 | 124.00 / 126.00 | 0.00 / 3.00 | 15.45 / 16.02 |
| compileContext | 1000-items | 125.97 / 130.50 | 204.00 / 234.00 | 0.00 / 0.82 | 16.10 / 16.56 |

说明：使用与主线程基准相同的 fixture；每次测量创建并终止独立 Worker，RSS 是进程级增量，未把 Worker 与 Electron renderer UI 响应性混为一谈。
