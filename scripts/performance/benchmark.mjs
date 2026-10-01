import { mkdir, writeFile } from 'node:fs/promises'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const distRoot = path.join(root, 'dist/main/shared')
const { diffChapterContent } = await import(pathToFileURL(path.join(distRoot, 'narrativeWorkbench/blocks.js')).href)
const { compileContext } = await import(pathToFileURL(path.join(distRoot, 'contextCompiler/index.js')).href)

const warmups = 2
const runs = 5
const now = new Date().toISOString()
const outputDir = path.join(root, 'docs/performance')

function repeatParagraphs(count, prefix) {
  return Array.from({ length: count }, (_, i) => `${prefix} ${i}：雾港航线调查记录与角色关系变化。`)
    .join('\n\n')
}

function diffFixture(paragraphs) {
  const before = repeatParagraphs(paragraphs, '原始段落')
  const afterParts = before.split('\n\n')
  for (let i = 0; i < afterParts.length; i += 10) afterParts[i] = `${afterParts[i]} 已修订`
  return { before, after: afterParts.join('\n\n') }
}

function compilerFixture(items) {
  const entries = Array.from({ length: items }, (_, i) => i)
  return {
    task_kind: 'outline',
    project: { id: 'bench-project', name: '雾港航线', genre: '科幻', tone: '冷峻', target_words: 100000, description: '大型性能基准项目' },
    volume: { id: 'bench-volume', title: '第一卷', synopsis: '航线争夺', volume_number: 1 },
    volume_outline: { id: 'bench-outline', summary: '调查航线', theme: '信任', main_conflict: '控制权', key_turning_points: ['接头', '交火'], ending: '暂时脱险' },
    characters: entries.map((i) => ({ id: `character-${i}`, name: `角色${i}`, role: '调查者', notes: '冷静', profile_text: '雾港航线角色档案' })),
    relations: entries.map((i) => ({ id: `relation-${i}`, relation_type: '合作', description: '关系描述', source_label: `角色${i}`, target_label: `角色${(i + 1) % Math.max(1, items)}`, strength: i % 100 })),
    worldview_entries: entries.map((i) => ({ id: `worldview-${i}`, category: '地点', title: `地点${i}`, content: '雾港航线世界观条目' })),
    source_materials: entries.map((i) => ({ id: `material-${i}`, title: `素材${i}`, material_type: '设定', content: '雾港航线素材内容', explicitly_selected: i < 4 })),
    prior_chapters: entries.slice(0, Math.min(items, 100)).map((i) => ({ id: `chapter-${i}`, chapter_number: i + 1, title: `章节${i}`, synopsis: '章节摘要', content: '雾港航线章节正文', status: 'completed' })),
    narrative_memories: entries.slice(0, Math.min(items, 100)).map((i) => ({ id: `memory-${i}`, memory_type: 'fact', title: `记忆${i}`, content: '雾港航线事实', importance: 50, status: 'approved', evidence: ['证据'] })),
    foreshadows: entries.slice(0, Math.min(items, 100)).map((i) => ({ id: `foreshadow-${i}`, title: `伏笔${i}`, description: '雾港航线伏笔', status: 'active', importance: 50, evidence: ['证据'] })),
    budget: { total: 64000, max_output_tokens: 4096, system_reserved_tokens: 200 },
    model_params: { model: 'benchmark-model', temperature: 0.7, max_output_tokens: 4096, context_budget: 64000 },
    debug: false,
    extra_instruction: '输出卷大纲 JSON。',
  }
}

function sampleStats(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  return { p50_ms: percentile(0.5), p95_ms: percentile(0.95), min_ms: sorted[0], max_ms: sorted.at(-1) }
}

async function measure(operation, fixture) {
  for (let i = 0; i < warmups; i += 1) operation(fixture)
  const samples = []
  const cpuSamples = []
  const rssSamples = []
  const loopSamples = []
  for (let i = 0; i < runs; i += 1) {
    const delay = monitorEventLoopDelay({ resolution: 1 })
    delay.enable()
    const cpuBefore = process.cpuUsage()
    const rssBefore = process.memoryUsage().rss
    const loopStarted = performance.now()
    let timerFiredAt = loopStarted
    const timer = new Promise((resolve) => setTimeout(() => {
      timerFiredAt = performance.now()
      resolve()
    }, 0))
    const started = performance.now()
    operation(fixture)
    const elapsed = performance.now() - started
    await timer
    await new Promise((resolve) => setImmediate(resolve))
    const cpu = process.cpuUsage(cpuBefore)
    samples.push(elapsed)
    cpuSamples.push((cpu.user + cpu.system) / 1000)
    rssSamples.push(Math.max(0, process.memoryUsage().rss - rssBefore) / 1024 / 1024)
    loopSamples.push(Math.max(delay.max / 1e6, timerFiredAt - loopStarted))
    delay.disable()
  }
  return {
    wall: sampleStats(samples),
    cpu_ms: sampleStats(cpuSamples),
    rss_delta_mb: sampleStats(rssSamples),
    event_loop_delay_ms: sampleStats(loopSamples),
  }
}

const results = []
for (const paragraphs of [1000, 5000, 10000]) {
  const fixture = diffFixture(paragraphs)
  results.push({ task: 'diffChapterContent', size: `${paragraphs}-paragraphs`, input_units: paragraphs,
    before_chars: fixture.before.length, after_chars: fixture.after.length,
    metrics: await measure(({ before, after }) => diffChapterContent(`bench-${paragraphs}`, before, after), fixture) })
}
for (const items of [100, 500, 1000]) {
  const fixture = compilerFixture(items)
  results.push({ task: 'compileContext', size: `${items}-items`, input_units: items,
    metrics: await measure((input) => compileContext(input), fixture) })
}

const report = { schema_version: 1, generated_at: now, node: process.version, platform: process.platform,
  arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', warmups, runs, results }
await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, 'baseline.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const lines = [
  '# 性能基准（主线程基线）', '',
  `生成时间：${report.generated_at}；Node ${report.node}；${report.platform}/${report.arch}；预热 ${warmups} 次，测量 ${runs} 次。`, '',
  '| 任务 | 规模 | wall p50/p95 ms | CPU p50/p95 ms | RSS 增量 p50/p95 MB | event-loop delay p50/p95 ms |',
  '| --- | --- | ---: | ---: | ---: | ---: |',
]
for (const item of results) {
  const m = item.metrics
  lines.push(`| ${item.task} | ${item.size} | ${m.wall.p50_ms.toFixed(2)} / ${m.wall.p95_ms.toFixed(2)} | ${m.cpu_ms.p50_ms.toFixed(2)} / ${m.cpu_ms.p95_ms.toFixed(2)} | ${m.rss_delta_mb.p50_ms.toFixed(2)} / ${m.rss_delta_mb.p95_ms.toFixed(2)} | ${m.event_loop_delay_ms.p50_ms.toFixed(2)} / ${m.event_loop_delay_ms.p95_ms.toFixed(2)} |`)
}
lines.push('', '说明：这是同一 Node 主线程同步实现的可复现实验，不代表 Electron renderer 的 UI 响应性；worker 迁移前后必须用相同 fixture 与指标重复测量。',
  'Worker Threads 对照结果见 [optimized.md](./optimized.md)。当前数据支持迁移大章节 diff：主线程 5000 段落及以上的 event-loop delay 随计算时间增长，而 Worker 对照约保持在 15-17 ms。compileContext 的 Worker wall time 高于同步基线，因此保留主线程实现，避免复制和启动成本抵消收益。')
await writeFile(path.join(outputDir, 'baseline.md'), `${lines.join('\n')}\n`, 'utf8')
console.log(JSON.stringify(report, null, 2))
