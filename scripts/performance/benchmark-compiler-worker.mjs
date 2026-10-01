import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run after build:main. Fixtures and outputs stay synthetic; no database or Electron is loaded.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dist = path.join(root, 'dist/main')
const { compileContext, estimateTextTokens, ContextBudgetExceededError } = await import(
  pathToFileURL(path.join(dist, 'shared/contextCompiler/index.js')).href)
const { ComputeWorkerClient } = await import(pathToFileURL(path.join(dist, 'main/workers/computeWorkerClient.js')).href)
const client = new ComputeWorkerClient()
const warmups = 2
const runs = 5

function syntheticText(bytes, suffix = '') {
  const pattern = '雾港航线 trust signal synthetic record. '
  const patternBytes = Buffer.byteLength(pattern)
  const suffixBytes = Buffer.byteLength(suffix)
  const repetitions = Math.floor((bytes - suffixBytes) / patternBytes)
  const result = pattern.repeat(repetitions) + 'x'.repeat(bytes - repetitions * patternBytes - suffixBytes) + suffix
  assert.equal(Buffer.byteLength(result), bytes)
  return result
}

function base(total = 64000) {
  return { task_kind: 'outline',
    project: { id: 'worker-benchmark', name: '雾港航线', genre: '科幻', tone: '冷静', target_words: 100000 },
    budget: { total, max_output_tokens: 4096, system_reserved_tokens: 200 },
    model_params: { model: 'synthetic-benchmark', temperature: 0.7, max_output_tokens: 4096, context_budget: total },
    debug: false }
}

async function execute(operation, input) {
  try { return { status: 'success', value: await operation(input) } } catch (error) {
    if (!(error instanceof ContextBudgetExceededError)) throw error
    return { status: 'budget_exceeded', required_tokens: error.requiredTokens,
      available_tokens: error.availableTokens, item_ids: error.itemIds, trace: error.failureTrace }
  }
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  return { p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], samples }
}

async function measure(operation, fixture, sampleWorkerMemory) {
  for (let index = 0; index < warmups; index += 1) await execute(operation, fixture)
  const wall = [], cpu = [], rss = [], loop = [], peakRss = [], peakDelta = []
  let outcome
  for (let index = 0; index < runs; index += 1) {
    const delay = monitorEventLoopDelay({ resolution: 1 })
    delay.enable()
    const loopStarted = performance.now()
    let timerFiredAt = loopStarted
    const timer = new Promise((resolve) => setTimeout(() => { timerFiredAt = performance.now(); resolve() }, 0))
    const cpuBefore = process.cpuUsage(), rssBefore = process.memoryUsage().rss
    let sampledPeak = rssBefore
    const sampler = sampleWorkerMemory ? setInterval(() => {
      sampledPeak = Math.max(sampledPeak, process.memoryUsage().rss)
    }, 5) : undefined
    const started = performance.now()
    let result
    try { result = await execute(operation, fixture) } finally { if (sampler) clearInterval(sampler) }
    wall.push(performance.now() - started)
    const consumed = process.cpuUsage(cpuBefore)
    cpu.push((consumed.user + consumed.system) / 1000)
    const rssAfter = process.memoryUsage().rss
    rss.push((rssAfter - rssBefore) / 1024 / 1024)
    if (sampleWorkerMemory) {
      sampledPeak = Math.max(sampledPeak, rssAfter)
      peakRss.push(sampledPeak / 1024 / 1024)
      peakDelta.push((sampledPeak - rssBefore) / 1024 / 1024)
    }
    await timer
    await new Promise((resolve) => setImmediate(resolve))
    loop.push(Math.max(delay.max / 1e6, timerFiredAt - loopStarted))
    delay.disable()
    outcome = result.status === 'success'
      ? { status: result.status, selected_items: result.value.selected.length, discarded_items: result.value.discarded.length,
        selected_tokens: result.value.budget.selected_tokens, available_tokens: result.value.budget.available_for_prompt }
      : { status: result.status, required_tokens: result.required_tokens, available_tokens: result.available_tokens }
  }
  return { outcome, metrics: { wall_ms: stats(wall), cpu_process_ms: stats(cpu), rss_delta_mb: stats(rss),
    sampled_peak_process_rss_mb: sampleWorkerMemory ? stats(peakRss) : null,
    sampled_peak_rss_delta_mb: sampleWorkerMemory ? stats(peakDelta) : null, event_loop_delay_ms: stats(loop) } }
}

const body = syntheticText(1024 * 1024)
const materials = Array.from({ length: 1000 }, (_, index) => ({ id: `material-${index}`, title: `素材${index}`,
  material_type: '设定', content: syntheticText(10 * 1024, String(index)), explicitly_selected: index < 4 }))
const fixtures = [
  { name: 'summary-1MiB-allowed', dimensions: { body_utf8_bytes: Buffer.byteLength(body) },
    input: { ...base(estimateTextTokens(body) + 8192), task_kind: 'summary', stage: { body } } },
  { name: 'summary-1MiB-budget-rejection', dimensions: { body_utf8_bytes: Buffer.byteLength(body) },
    input: { ...base(), task_kind: 'summary', stage: { body } } },
  { name: 'outline-1000-materials-10KiB', dimensions: { materials: 1000, input_content_utf8_bytes: 1000 * 10 * 1024,
      explicitly_selected_materials: 4 }, input: { ...base(), source_materials: materials } },
]
const results = []
for (const fixture of fixtures) {
  const synchronous = await execute(compileContext, fixture.input)
  const worker = await execute((input) => client.run('compile-context', input), fixture.input)
  assert.deepEqual(worker, synchronous, `Compiler Worker output changed for ${fixture.name}`)
  for (const [implementation, operation] of [['synchronous', compileContext], ['worker_threads', (input) => client.run('compile-context', input)]]) {
    const measured = await measure(operation, fixture.input, implementation === 'worker_threads')
    results.push({ fixture: fixture.name, dimensions: fixture.dimensions, implementation, equivalent: true, ...measured })
    console.log(`${fixture.name} ${implementation}: wall p50 ${measured.metrics.wall_ms.p50.toFixed(2)} ms, loop p95 ${measured.metrics.event_loop_delay_ms.p95.toFixed(2)} ms`)
  }
}
const hashes = await Promise.all(['shared/contextCompiler/compile.js', 'main/workers/computeWorker.js', 'main/workers/computeWorkerClient.js']
  .map(async (file) => ({ file: `dist/main/${file}`, sha256: createHash('sha256').update(await readFile(path.join(dist, file))).digest('hex') })))
const report = { schema_version: 1, generated_at: new Date().toISOString(), node: process.version, platform: process.platform,
  arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', warmups, runs,
  measurement_scope: 'Actual compiler and actual Worker Threads; Worker startup, structured clone and termination included. Fixture construction and main module loading excluded. No SQLite/Electron/renderer/model I/O.',
  memory_method: 'Signed process RSS immediately after minus before each operation. Worker runs also sample process RSS every 5 ms, reported as sampled peak absolute RSS and delta. Synchronous runs cannot be sampled by main timers and report no peak. No forced GC; baseline can contain retained allocations from earlier cases; sampled peak is not a guaranteed true maximum.',
  cpu_method: 'process.cpuUsage across all process threads; includes Worker CPU.',
  event_loop_method: 'Maximum of monitorEventLoopDelay and zero-delay timer lag scheduled before each operation. Node scheduling jitter included; not renderer UI latency.',
  percentile_method: 'sorted samples at floor(n*p), capped to n-1; p95 is maximum with five samples',
  implementation_hashes: hashes, results }
const output = path.join(root, 'docs/performance')
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'compiler-worker-comparison.json'), `${JSON.stringify(report, null, 2)}\n`)
const lines = ['# 长上下文编译 Worker 对照', '',
  `生成时间：${report.generated_at}；Node ${report.node}；${report.platform}/${report.arch}；预热 ${warmups} 次，测量 ${runs} 次。`, '',
  '同一合成 fixture 先核对编译结果或预算拒绝的完整等价性，再运行同步和真实 Worker 路径。Worker 测量包含启动、structured clone 与终止。', '',
  '| 输入 | 路径 | 结果 | wall p50/p95 ms | CPU p50/p95 ms | RSS差值 p50/p95 MB | 5ms采样峰值RSS增量 p50/p95 MB | 主线程 loop delay p50/p95 ms |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |']
for (const result of results) {
  const format = (metric) => `${metric.p50.toFixed(2)} / ${metric.p95.toFixed(2)}`
  const m = result.metrics
  lines.push(`| ${result.fixture} | ${result.implementation} | ${result.outcome.status} | ${format(m.wall_ms)} | ${format(m.cpu_process_ms)} | ${format(m.rss_delta_mb)} | ${m.sampled_peak_rss_delta_mb ? format(m.sampled_peak_rss_delta_mb) : '未采样'} | ${format(m.event_loop_delay_ms)} |`)
}
lines.push('', 'RSS差值为进程即时差值。Worker另以5ms间隔采样进程RSS峰值，采样可能漏过更短的峰值；同步路径不能用同一主线程定时器测峰值，未给出peak。CPU含Worker计算。Node event-loop delay不能代替真实Electron renderer的帧延迟。生产入口与来源重新核验的整链测量见compiler-path-response报告。', '')
await writeFile(path.join(output, 'compiler-worker-comparison.md'), lines.join('\n'))
