import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run after the normal main TypeScript build; this script loads no Electron or SQLite module.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const distRoot = path.join(root, 'dist/main')
const modules = {
  paragraphs: 'shared/narrativeWorkbench/analysis.js',
  blocks: 'shared/narrativeWorkbench/blocks.js',
  messages: 'agent/llm/context.js',
  compiler: 'shared/contextCompiler/index.js',
}
const { splitNarrativeParagraphs } = await import(pathToFileURL(path.join(distRoot, modules.paragraphs)).href)
const { assignStableBlockIds, diffChapterBlocks } = await import(pathToFileURL(path.join(distRoot, modules.blocks)).href)
const { trimMessagesToBudget, estimateMessageTokens } = await import(pathToFileURL(path.join(distRoot, modules.messages)).href)
const { compileContext, estimateTextTokens } = await import(pathToFileURL(path.join(distRoot, modules.compiler)).href)

if (!process.version.startsWith('v22.')) throw new Error('This baseline requires Node 22')
const warmups = 2
const runs = 5
const outputDir = path.join(root, 'docs/performance')
const moduleHashes = await Promise.all(Object.values(modules).map(async (file) => ({
  file: `dist/main/${file}`,
  sha256: createHash('sha256').update(await readFile(path.join(distRoot, file))).digest('hex'),
})))

function stats(samples) {
  const sorted = [...samples].sort((left, right) => left - right)
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]
  return { p50: percentile(0.5), p95: percentile(0.95), min: sorted[0], max: sorted.at(-1), samples }
}

function summarizeResult(value) {
  if (Array.isArray(value)) return { status: 'success', output_items: value.length }
  if (value && typeof value === 'object' && 'budget' in value) {
    return {
      status: 'success', selected_items: value.selected.length, discarded_items: value.discarded.length,
      prompt_chars: value.prompt.length, selected_tokens: value.budget.selected_tokens,
      available_tokens: value.budget.available_for_prompt,
    }
  }
  if (value && typeof value === 'object' && 'changes' in value) {
    return { status: 'success', output_items: value.changes.length, modified_count: value.modified_count }
  }
  throw new Error('Unexpected benchmark result shape')
}

function runMeasuredOperation(operation, fixture) {
  try {
    return summarizeResult(operation(fixture))
  } catch (error) {
    if (error?.name !== 'ContextBudgetExceededError') throw error
    // Store numeric diagnostics only: prompts, candidate contents and error text stay private.
    return { status: 'budget_exceeded', error_name: error.name,
      required_tokens: error.requiredTokens, available_tokens: error.availableTokens }
  }
}

async function measure(operation, fixture) {
  for (let index = 0; index < warmups; index += 1) runMeasuredOperation(operation, fixture)
  const wall = [], cpu = [], rss = [], loop = []
  let result
  for (let index = 0; index < runs; index += 1) {
    const delay = monitorEventLoopDelay({ resolution: 1 })
    delay.enable()
    const loopStarted = performance.now()
    let timerFiredAt = loopStarted
    const timer = new Promise((resolve) => setTimeout(() => {
      timerFiredAt = performance.now()
      resolve()
    }, 0))
    const cpuBefore = process.cpuUsage()
    const rssBefore = process.memoryUsage().rss
    const started = performance.now()
    const currentResult = runMeasuredOperation(operation, fixture)
    const elapsed = performance.now() - started
    const cpuAfter = process.cpuUsage(cpuBefore)
    const rssAfter = process.memoryUsage().rss
    await timer
    await new Promise((resolve) => setImmediate(resolve))
    const eventLoopDelay = Math.max(delay.max / 1e6, timerFiredAt - loopStarted)
    delay.disable()
    if (result && JSON.stringify(result) !== JSON.stringify(currentResult)) {
      throw new Error('Benchmark output changed between measured runs')
    }
    result = currentResult
    wall.push(elapsed)
    cpu.push((cpuAfter.user + cpuAfter.system) / 1000)
    rss.push((rssAfter - rssBefore) / 1024 / 1024)
    loop.push(eventLoopDelay)
  }
  return { outcome: result, metrics: { wall_ms: stats(wall), cpu_ms: stats(cpu),
    rss_delta_mb: stats(rss), event_loop_delay_ms: stats(loop) } }
}

function syntheticText(bytes, suffix = '') {
  const pattern = '雾港航线 trust signal synthetic record. '
  const patternBytes = Buffer.byteLength(pattern, 'utf8')
  const suffixBytes = Buffer.byteLength(suffix, 'utf8')
  const repetitions = Math.floor((bytes - suffixBytes) / patternBytes)
  return pattern.repeat(repetitions) + 'x'.repeat(bytes - repetitions * patternBytes - suffixBytes) + suffix
}

function compilerBase(total = 64000) {
  return {
    task_kind: 'outline',
    project: { id: 'inventory-project', name: '雾港航线', genre: '科幻', tone: '冷静',
      target_words: 100000, description: 'trust signal synthetic record' },
    chapter_outline: { id: 'inventory-outline', chapter_number: 1, title: '雾港航线', summary: 'trust signal',
      purpose: 'synthetic record', opening: '航线', conflict: 'signal', key_events: ['trust'], ending: '航线', ending_hook: '' },
    budget: { total, max_output_tokens: 4096, system_reserved_tokens: 200 },
    model_params: { model: 'inventory-benchmark', temperature: 0.7, max_output_tokens: 4096, context_budget: total },
    debug: false,
  }
}

const results = []
async function add(task, size, dimensions, operation, fixture) {
  const measured = await measure(operation, fixture)
  results.push({ task, size, dimensions, ...measured })
  console.log(`${task} ${size}: ${measured.outcome.status}, wall p50 ${measured.metrics.wall_ms.p50.toFixed(2)} ms`)
}

for (const paragraphs of [1000, 10000, 100000]) {
  const content = Array.from({ length: paragraphs }, (_, index) =>
    `  雾港航线 synthetic paragraph ${index}  `).join('\r\n\r\n \r\n')
  await add('splitNarrativeParagraphs', `${paragraphs}-paragraphs-crlf-whitespace`,
    { paragraphs, input_chars: content.length, input_utf8_bytes: Buffer.byteLength(content), line_endings: 'CRLF', whitespace: true },
    splitNarrativeParagraphs, content)
}
for (const bytes of [1024 * 1024, 10 * 1024 * 1024]) {
  const content = syntheticText(bytes)
  await add('splitNarrativeParagraphs', `${bytes / 1024 / 1024}-MiB-single-paragraph`,
    { paragraphs: 1, input_chars: content.length, input_utf8_bytes: bytes }, splitNarrativeParagraphs, content)
}

for (const count of [100, 1000, 10000]) {
  for (const bytes of [1024, 10 * 1024]) {
    const messages = Array.from({ length: count }, (_, index) => ({
      role: 'user', content: syntheticText(bytes, String(index)), timestamp: index + 1,
    }))
    const fullBudget = messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0)
    for (const [policy, budget] of [['limited', 64000], ['retain-all', fullBudget]]) {
      await add('trimMessagesToBudget', `${count}-messages-${bytes / 1024}-KiB-${policy}`,
        { messages: count, content_utf8_bytes_each: bytes, content_utf8_bytes_total: count * bytes, budget_policy: policy, budget },
        (input) => trimMessagesToBudget(input.messages, input.budget), { messages, budget })
    }
  }
}

for (const bytes of [64 * 1024, 1024 * 1024]) {
  const body = syntheticText(bytes)
  const allowedBudget = estimateTextTokens(body) + 8192
  const budgets = bytes === 1024 * 1024 ? [['allowed', allowedBudget], ['required-over-budget', 64000]] : [['allowed', allowedBudget]]
  for (const [policy, budget] of budgets) {
    const fixture = { ...compilerBase(budget), task_kind: 'summary', stage: { body } }
    await add('compileContext', `summary-${bytes / 1024}-KiB-body-${policy}`,
      { task_kind: 'summary', body_utf8_bytes: bytes, body_chars: body.length, budget_policy: policy, budget },
      compileContext, fixture)
  }
}
for (const count of [100, 1000]) {
  for (const bytes of [1024, 10 * 1024]) {
    const fixture = { ...compilerBase(), source_materials: Array.from({ length: count }, (_, index) => ({
      id: `material-${index}`, title: `素材 ${index}`, material_type: '设定',
      content: syntheticText(bytes, String(index)), explicitly_selected: index < 4,
    })) }
    await add('compileContext', `outline-${count}-materials-${bytes / 1024}-KiB`,
      { task_kind: 'outline', materials: count, material_utf8_bytes_each: bytes,
        material_utf8_bytes_total: count * bytes, budget: fixture.budget.total }, compileContext, fixture)
  }
}

for (const count of [1000, 10000]) {
  const content = Array.from({ length: count }, (_, index) => `雾港航线 paragraph ${index}`).join('\n\n')
  const before = assignStableBlockIds('inventory-chapter', content)
  const after = before.map((block, index) => index % 10 === 0 ? { ...block, text: `${block.text} revised` } : { ...block })
  await add('diffChapterBlocks', `${count}-existing-blocks`, { blocks_each: count, modified_fraction: 0.1 },
    ({ before: oldBlocks, after: newBlocks }) => diffChapterBlocks(oldBlocks, newBlocks), { before, after })
}

const report = {
  schema_version: 1, generated_at: new Date().toISOString(), node: process.version,
  platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model?.trim() ?? 'unknown',
  warmups, runs, percentile_method: 'sorted sample at floor(n*p), capped at n-1; p95 is the maximum for n=5',
  implementation_hashes: moduleHashes,
  measurement_scope: 'Synchronous implementations in a standalone Node main thread. Fixture construction and module startup are excluded.',
  memory_method: 'RSS immediately after minus before each synchronous operation, signed MB; not peak RSS, not isolated per case; no forced GC.',
  event_loop_method: 'Maximum of monitorEventLoopDelay(1 ms).max and elapsed time until a zero-delay timer scheduled before the operation fires; not renderer UI latency.',
  unmeasured: [
    { task: 'GraphPanel', reason: 'Actual renderer relations.map and entityNames useMemo exist. React rendering/DOM responsiveness require a real renderer; Node cannot replace this measurement.' },
    { task: 'batch-summary', reason: 'No independent batch-summary entry; existing single-chapter summary is model I/O. Its CPU preprocessing is covered by compiler and message-budget measurements.' },
    { task: 'project-consistency-scan', reason: 'No independent full-project narrative scanner; existing single-chapter fact_check is model I/O.' },
    { task: 'search-index-build', reason: 'No search-index builder or full-text search entry found in current source.' },
  ], results,
}
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, 'inventory-baseline.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const lines = [
  '# #24 补充任务性能基线', '',
  `生成时间：${report.generated_at}；Node ${report.node}；${report.platform}/${report.arch}；CPU ${report.cpu}；预热 ${warmups} 次、测量 ${runs} 次。`, '',
  '真实调用当前编译后的分段、消息预算裁剪、上下文编译和已有块 diff 实现。使用固定生成规则的合成数据；报告不包含正文、消息内容、模型提示词或凭据。', '',
  '| 任务 | 规模 | 结果 | wall p50/p95 ms | CPU p50/p95 ms | RSS 差值 p50/p95 MB | Node event-loop delay p50/p95 ms |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: |',
]
for (const item of results) {
  const format = (metric) => `${metric.p50.toFixed(2)} / ${metric.p95.toFixed(2)}`
  const m = item.metrics
  lines.push(`| ${item.task} | ${item.size} | ${item.outcome.status} | ${format(m.wall_ms)} | ${format(m.cpu_ms)} | ${format(m.rss_delta_mb)} | ${format(m.event_loop_delay_ms)} |`)
}
lines.push('',
  '所有 AgentMessage fixture 使用合法 user 消息（role、content、timestamp），每条内容大小按 UTF-8 字节精确生成。limited 使用 64000 预算；retain-all 使用默认估算器计算全量预算。',
  '长正文 summary 的 allowed 预算为正文真实估算值加 8192；1 MiB 正文另测 64000 预算下必选项超限，budget_exceeded 是真实 fail-closed 结果，其数值诊断见 JSON。outline 素材仍经过实际相关度、容量上限和预算规则。', '',
  '限制：fixture 构造、模块启动和 SQLite I/O 不计入计时。RSS 是每次同步计算前后进程驻留内存差值，包含 GC 和分配器影响，负值表示进程 RSS 下降；它不是峰值或独立案例内存占用。5 次测量的 p95 等于最大样本，CPU 在 Windows 上具有计时粒度。Node event-loop delay 不能用来声明 Electron renderer UI 已满足响应性验收。', '',
  '关系图谱：WorkbenchNarrativePage 的 entityNames useMemo 和 GraphPanel relations.map 是真实 renderer 入口。当前只呈现关系列表，没有发现图布局或路径计算；其 React/DOM 提交耗时与交互延迟需通过实际 renderer fixture 测量，不能使用本脚本的数据替代。',
  '批量摘要、全项目叙事一致性扫描、搜索索引构建没有独立现有入口。单章 summary/fact_check 的模型 I/O 不作为本地 CPU 基准；前置 Compiler 和 Agent budget 已单独测量。', '',
  '完整样本、输出条数/预算状态、指标定义及被测 dist 模块 SHA-256 见 [inventory-baseline.json](./inventory-baseline.json)。本报告只建立同步基线，不宣称 Worker 优化收益。')
await writeFile(path.join(outputDir, 'inventory-baseline.md'), `${lines.join('\n')}\n`, 'utf8')
console.log(`Saved ${results.length} measured cases to docs/performance/inventory-baseline.{json,md}`)
