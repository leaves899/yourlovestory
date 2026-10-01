# 长上下文编译 Worker 对照

生成时间：2026-10-01T11:35:20.348Z；Node v22.23.1；win32/x64；预热 2 次，测量 5 次。

同一合成 fixture 先核对编译结果或预算拒绝的完整等价性，再运行同步和真实 Worker 路径。Worker 测量包含启动、structured clone 与终止。

| 输入 | 路径 | 结果 | wall p50/p95 ms | CPU p50/p95 ms | RSS差值 p50/p95 MB | 5ms采样峰值RSS增量 p50/p95 MB | 主线程 loop delay p50/p95 ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| summary-1MiB-allowed | synchronous | success | 75.44 / 78.60 | 78.00 / 79.00 | 4.93 / 4.95 | 未采样 | 75.54 / 78.71 |
| summary-1MiB-allowed | worker_threads | success | 137.22 / 139.14 | 156.00 / 172.00 | 1.66 / 2.23 | 36.05 / 36.36 | 15.92 / 16.04 |
| summary-1MiB-budget-rejection | synchronous | budget_exceeded | 42.06 / 42.21 | 46.00 / 48.00 | 3.28 / 6.57 | 未采样 | 42.16 / 42.28 |
| summary-1MiB-budget-rejection | worker_threads | budget_exceeded | 103.35 / 108.60 | 124.00 / 140.00 | 0.09 / 0.44 | 32.88 / 33.13 | 15.61 / 16.16 |
| outline-1000-materials-10KiB | synchronous | success | 474.96 / 479.17 | 485.00 / 500.00 | 0.26 / 2.43 | 未采样 | 475.04 / 479.50 |
| outline-1000-materials-10KiB | worker_threads | success | 505.87 / 570.83 | 609.00 / 657.00 | 0.58 / 1.01 | 59.11 / 60.12 | 16.14 / 16.24 |

RSS差值为进程即时差值。Worker另以5ms间隔采样进程RSS峰值，采样可能漏过更短的峰值；同步路径不能用同一主线程定时器测峰值，未给出peak。CPU含Worker计算。Node event-loop delay不能代替真实Electron renderer的帧延迟。生产入口与来源重新核验的整链测量见compiler-path-response报告。
