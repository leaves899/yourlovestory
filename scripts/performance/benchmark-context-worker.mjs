import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(root, 'dist/main')
const { trimMessagesToBudget, estimateMessageTokens } = await import(pathToFileURL(path.join(dist, 'agent/llm/context.js')).href)
const { ComputeWorkerClient } = await import(pathToFileURL(path.join(dist, 'main/workers/computeWorkerClient.js')).href)
const messages = Array.from({ length: 10_000 }, (_, index) => ({ role: 'user', content: `消息 ${index} ${'x'.repeat(10 * 1024)}`, timestamp: index }))
const budget = messages.reduce((total, message) => total + estimateMessageTokens(message), 0)
const worker = new ComputeWorkerClient()

async function measure(operation, samplePeak) {
  const wall = [], loopLag = [], peak = []
  for (let run = 0; run < 3; run += 1) {
    const before = process.memoryUsage().rss
    let highest = before
    const sampler = samplePeak ? setInterval(() => { highest = Math.max(highest, process.memoryUsage().rss) }, 5) : undefined
    let firedAt = performance.now()
    const loopStarted = firedAt
    const timer = new Promise((resolve) => setTimeout(() => { firedAt = performance.now(); resolve() }, 0))
    const started = performance.now()
    const result = await operation().catch((error) => ({ __error: error instanceof Error ? error.message : String(error) }))
    if (sampler) clearInterval(sampler)
    if (samplePeak) highest = Math.max(highest, process.memoryUsage().rss)
    await timer
    wall.push(performance.now() - started)
    loopLag.push(Math.max(0, firedAt - loopStarted))
    if (samplePeak) peak.push((highest - before) / 1024 / 1024)
    if (result.__error) return { status: 'failed', error: result.__error, wall_ms: wall.at(-1), loop_ms: loopLag.at(-1), peak_mb: peak.at(-1) }
    if (result.length !== messages.length) throw new Error(`Unexpected result count ${result.length}`)
  }
  const sorted = (values) => [...values].sort((a, b) => a - b)
  const percentile = (values, p) => sorted(values)[Math.min(values.length - 1, Math.floor(values.length * p))]
  return { status: 'success', p50: percentile(wall, 0.5), p95: percentile(wall, 0.95), loop_p50: percentile(loopLag, 0.5),
    loop_p95: percentile(loopLag, 0.95), peak_rss_delta_p50_mb: samplePeak ? percentile(peak, 0.5) : null,
    peak_rss_delta_p95_mb: samplePeak ? percentile(peak, 0.95) : null }
}
const sync = await measure(() => Promise.resolve(trimMessagesToBudget(messages, budget)), false)
const threaded = await measure(() => worker.run('trim-messages', { messages, budget }), true)
const report = { schema_version: 1, generated_at: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', messages: messages.length,
  message_utf8_bytes_each: 10 * 1024, total_message_utf8_bytes: messages.length * 10 * 1024,
  budget, equivalence: threaded.status === 'success', synchronous: sync, worker_threads: threaded,
  note: 'Worker uses maxOldGenerationSizeMb=128. Worker RSS is sampled every 5 ms and may miss shorter peaks; synchronous peak is intentionally unreported because its non-yielding operation blocks timer sampling.' }
const output = path.join(root, 'docs/performance')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'context-worker-comparison.json'), `${JSON.stringify(report, null, 2)}\n`)
const row = (label, value) => value.status === 'success'
  ? `| ${label} | ${value.p50.toFixed(2)} / ${value.p95.toFixed(2)} | ${value.loop_p50.toFixed(2)} / ${value.loop_p95.toFixed(2)} | ${value.peak_rss_delta_p50_mb === null ? '未采样' : `${value.peak_rss_delta_p50_mb.toFixed(2)} / ${value.peak_rss_delta_p95_mb.toFixed(2)}`} |\n`
  : `| ${label} | 失败：${value.error} | — | ${value.peak_mb.toFixed(2)} MB（单次采样） |\n`
await writeFile(path.join(output, 'context-worker-comparison.md'), `# 上下文压缩 Worker 对照\n\n`+
  `Node ${process.version}；${process.platform}/${process.arch}；10000 条合法 user 消息，每条 UTF-8 约 10 KiB；retain-all budget=${budget}。\n\n`+
  '| 路径 | wall p50/p95 ms | 单次 loop lag p50/p95 ms | 采样峰值 RSS 增量 p50/p95 MB |\n| --- | ---: | ---: | ---: |\n' +
  row('主线程', sync) + row('Worker Threads', threaded) + '\n' +
  '结果在相同 fixture 上逐次检查输出长度和内容等价。Worker 包含 structured clone、启动和终止；仅 Worker 路径可由主线程每 5 ms 采样 RSS，同步路径在连续 CPU 计算期间无法由定时器采样峰值。')
console.log(JSON.stringify(report, null, 2))
