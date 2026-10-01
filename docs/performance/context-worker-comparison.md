# 上下文压缩 Worker 对照

Node v22.23.1；win32/x64；10000 条合法 user 消息，每条 UTF-8 约 10 KiB；retain-all budget=25738990。

| 路径 | wall p50/p95 ms | 单次 loop lag p50/p95 ms | 采样峰值 RSS 增量 p50/p95 MB |
| --- | ---: | ---: | ---: |
| 主线程 | 238.24 / 238.83 | 238.24 / 238.91 | 未采样 |
| Worker Threads | 失败：Compute worker failed: Worker terminated due to reaching memory limit: JS heap out of memory | — | 345.47 MB（单次采样） |

小输入对照已在相同 fixture 上逐次检查输出长度和内容等价。本 100MiB retain-all fixture 的 Worker 在 128MiB heap 限制下因 structured clone 触发 OOM，没有产生可比较输出；因此该行只记录失败与资源边界，不宣称等价。Worker 包含 structured clone、启动和终止；仅 Worker 路径可由主线程每 5 ms 采样 RSS，同步路径在连续 CPU 计算期间无法由定时器采样峰值。
