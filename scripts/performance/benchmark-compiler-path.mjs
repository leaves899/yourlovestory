import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(path.join(root, 'package.json'))
const { initializeDatabase, getDatabasePath } = require('./dist/main/main/database/index.js')
const { WorkbenchService } = require('./dist/main/main/workbench/workbenchService.js')
const { OutlineGenerationService } = require('./dist/main/shared/outlineGeneration/service.js')
if (!process.version.startsWith('v22.')) throw new Error('This baseline requires Node 22 and its matching native SQLite module')
const warmups = 2
const runs = 5

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return { p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    min: sorted[0], max: sorted.at(-1), samples: values }
}

function syntheticText(bytes, suffix) {
  const pattern = '雾港航线 trust signal synthetic record. '
  const remaining = bytes - Buffer.byteLength(suffix)
  const repetitions = Math.floor(remaining / Buffer.byteLength(pattern))
  return pattern.repeat(repetitions) + 'x'.repeat(remaining - repetitions * Buffer.byteLength(pattern)) + suffix
}

function createFixture(count, bytes) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-compiler-path-'))
  let database
  const dispose = () => {
    database?.close()
    // Delete only the exact newly created directory, after checking its absolute parent and prefix.
    const absolute = path.resolve(userData)
    if (path.dirname(absolute) !== path.resolve(os.tmpdir())
      || !path.basename(absolute).startsWith('yourcrush-compiler-path-')) throw new Error('Unsafe benchmark cleanup path')
    fs.rmSync(absolute, { recursive: true, force: true })
  }
  try {
    database = initializeDatabase(userData)
    const mainDatabase = database.prepare('PRAGMA database_list').all().find((entry) => entry.name === 'main')
    if (!mainDatabase || path.resolve(mainDatabase.file) !== path.resolve(getDatabasePath(userData))) {
      throw new Error('Benchmark database identity mismatch')
    }
    const workbench = new WorkbenchService(database, { projectRoot: userData })
    const project = workbench.createProject({ id: 'compiler-path-project', slug: 'synthetic-path', name: '雾港航线', description: 'trust signal' })
    const volume = workbench.createVolume({ project_id: project.id, volume_number: 1, title: '雾港航线', synopsis: 'trust signal' })
    const materialIds = database.transaction(() => Array.from({ length: count }, (_, index) =>
      workbench.createSourceMaterial({ id: `material-${index}`, project_id: project.id, title: `素材${index}`,
        material_type: '设定', content: syntheticText(bytes, String(index)) }).id))()
    let outlineCount = 0
    const makeRequest = () => {
      const targetVolume = outlineCount === 0 ? volume : workbench.createVolume({ project_id: project.id,
        volume_number: outlineCount + 1, title: '雾港航线', synopsis: 'trust signal' })
      const outline = workbench.createVolumeOutline({ id: `outline-${outlineCount++}`, project_id: project.id,
        volume_id: targetVolume.id, summary: '雾港航线', theme: 'trust', main_conflict: 'signal', ending: '航线',
        source_material_ids: materialIds })
      return { projectId: project.id, outlineId: outline.id, debug: false,
        modelParams: { model: 'synthetic', temperature: 0.7, max_output_tokens: 4096, context_budget: 64000 } }
    }
    const sync = new OutlineGenerationService({ project: workbench, chapters: workbench.chapters,
      memories: workbench.narrativeMemories, foreshadows: workbench.foreshadows })
    return { database, workbench, sync, asyncService: workbench.outlineGeneration,
      request: makeRequest(), makeRequest, dispose, identity: {
        // Do not persist the machine username or absolute temporary path.
        filename: '<temporary-user-data>/data/yourcrush.sqlite',
        path_sha256: createHash('sha256').update(path.resolve(mainDatabase.file)).digest('hex'),
        sqlite_version: database.prepare('SELECT sqlite_version() AS version').get().version,
      } }
  } catch (error) {
    dispose()
    throw error
  }
}

async function measure(operation, setup = () => undefined) {
  for (let index = 0; index < warmups; index += 1) await operation(setup())
  const wall = [], cpu = [], rss = [], loop = []
  for (let index = 0; index < runs; index += 1) {
    const input = setup()
    const histogram = monitorEventLoopDelay({ resolution: 1 })
    histogram.enable()
    let lag = 0
    let nextTick = performance.now() + 1
    const interval = setInterval(() => {
      const now = performance.now()
      lag = Math.max(lag, now - nextTick)
      nextTick = now + 1
    }, 1)
    const beforeCpu = process.cpuUsage()
    const beforeRss = process.memoryUsage().rss
    const started = performance.now()
    try {
      await operation(input)
      const elapsed = performance.now() - started
      const used = process.cpuUsage(beforeCpu)
      const afterRss = process.memoryUsage().rss
      await new Promise((resolve) => setTimeout(resolve, 1))
      wall.push(elapsed)
      cpu.push((used.user + used.system) / 1000)
      rss.push((afterRss - beforeRss) / 1048576)
      loop.push(Math.max(lag, histogram.max / 1e6))
    } finally {
      clearInterval(interval)
      histogram.disable()
    }
  }
  return { wall_ms: stats(wall), cpu_process_ms: stats(cpu), rss_delta_mb: stats(rss), event_loop_delay_ms: stats(loop) }
}

const proposal = { summary: '航线 proposal', theme: 'trust', main_conflict: 'signal', key_turning_points: ['航线'], ending: 'signal' }
const results = []
const identities = []
for (const bytes of [1024, 10240]) {
  const f = createFixture(1000, bytes)
  try {
    identities.push(f.identity)
    const prepared = await f.asyncService.prepareAsync(f.request, null)
    const source = JSON.parse(prepared.checkpoint.source_snapshot)
    const materials = source.input.source_materials
    if (materials.length !== 1000 || materials.some((item) => Buffer.byteLength(item.content) !== bytes)
      || materials.some((item) => item.explicitly_selected !== true)) throw new Error('Selected-material fixture missing or has incorrect byte size')
    const trace = prepared.checkpoint.stage_compiles.outline.trace
    if (trace.selected.length + trace.discarded.length < 1000) throw new Error('Compiler did not account for all selected materials')
    const ready = { ...prepared.checkpoint, stage: 'ready', proposal }
    const operations = [
      { entry: 'prepare-sync-real-sqlite', operation: () => f.sync.prepare(f.request, null) },
      { entry: 'prepareAsync-worker-real-sqlite', operation: () => f.asyncService.prepareAsync(f.request, null) },
      { entry: 'validateApplyAsync-worker-real-sqlite', operation: () => f.asyncService.validateApplyAsync(f.request, ready, 'benchmark-task') },
      { entry: 'prepareAsync+validateApplyAsync+transactional-apply-real-sqlite', setup: f.makeRequest,
        operation: async (request) => {
          const compiled = await f.asyncService.prepareAsync(request, null)
          const checkpoint = { ...compiled.checkpoint, stage: 'ready', proposal }
          const proof = await f.asyncService.validateApplyAsync(request, checkpoint, 'benchmark-task')
          // Match the real outline task runner's yield before its owned transaction.
          await new Promise((resolve) => setImmediate(resolve))
          const applied = f.database.transaction(() => f.asyncService.apply(request, checkpoint, 'benchmark-task', proof))()
          const persisted = f.workbench.getVolumeOutline(request.projectId, request.outlineId)
          if (persisted.version !== applied.version || persisted.summary !== proposal.summary) throw new Error('Real SQLite apply did not persist')
        } },
    ]
    for (const item of operations) {
      const metrics = await measure(item.operation, item.setup)
      results.push({ task: item.entry, materials: 1000, selected_materials: materials.length,
        material_utf8_bytes_each: bytes, material_utf8_bytes_total: materials.reduce((sum, material) => sum + Buffer.byteLength(material.content), 0),
        source_snapshot_chars: ready.source_snapshot.length, candidate_items: trace.selected.length + trace.discarded.length, metrics })
      console.log(JSON.stringify({ task: item.entry, bytes, wall_p50: metrics.wall_ms.p50, wall_p95: metrics.wall_ms.p95,
        loop_p50: metrics.event_loop_delay_ms.p50, loop_p95: metrics.event_loop_delay_ms.p95 }))
    }
  } finally {
    f.dispose()
  }
}
const files = ['dist/main/shared/outlineGeneration/service.js', 'dist/main/main/workbench/workbenchService.js',
  'dist/main/main/workers/computeWorker.js', 'dist/main/main/workers/computeWorkerClient.js']
const report = {
  schema_version: 2, generated_at: new Date().toISOString(), node: process.version, node_module_abi: process.versions.modules,
  platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model.trim(), warmups, runs,
  reproduction: 'Compile tsconfig.main.json using Node 22, then node scripts/performance/benchmark-compiler-path.mjs; requires a matching better-sqlite3 native module. The script never rebuilds native modules.',
  measurement_scope: 'Real compiled OutlineGenerationService, WorkbenchService repositories, temporary SQLite files and production-injected Worker Threads. Source SQL reads, snapshot construction, fingerprint comparisons and structured clone included; no Electron renderer or model I/O.',
  fixture: '1000 explicitly selected synthetic materials, exactly 1 KiB/10 KiB UTF-8 each; source_snapshot material count, each content byte size, selection flags and compiler candidate accounting asserted. Data/target construction excluded from timing; combined path includes real transaction apply and an independent repository read.',
  database_identities: identities, temporary_databases_removed: true,
  cpu_method: 'process.cpuUsage includes worker-thread CPU', memory_method: 'signed process RSS after minus before; not peak RSS',
  event_loop_method: '1 ms interval lag and monitorEventLoopDelay.max across complete await paths including post-await fence and real SQL. Node scheduling jitter included; not renderer UI latency.',
  implementation_hashes: files.map((file) => ({ file, sha256: createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex') })), results,
}
fs.writeFileSync(path.join(root, 'docs/performance/compiler-path-response.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log('Saved docs/performance/compiler-path-response.json; both private temporary SQLite directories removed')
