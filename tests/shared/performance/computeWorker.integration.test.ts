import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { compilePerformanceWorker } from '../../helpers/performanceWorkerFixture'
import { ComputeWorkerClient, type ComputeWorkerClientOptions } from '@/main/workers/computeWorkerClient'
import { diffChapterContent } from '@/shared/narrativeWorkbench/blocks'
import { compileContext, ContextBudgetExceededError, type ContextCompilerInput } from '@/shared/contextCompiler'
import { trimMessagesToBudget } from '@/agent/llm/context'

let outputRoot: string
let workerPath: string
let disposeWorker: () => void

beforeAll(() => {
  const fixture = compilePerformanceWorker()
  outputRoot = fixture.root
  workerPath = fixture.workerPath
  disposeWorker = fixture.dispose
}, 30000)

afterAll(() => disposeWorker?.())

function payload(paragraphs = 10000) {
  const before = Array.from({ length: paragraphs }, (_, i) => `段落 ${i} 合成性能数据`).join('\n\n')
  const after = before.split('\n\n').map((line, i) => i % 10 === 0 ? `${line}修订` : line).join('\n\n')
  return { mode: 'content' as const, chapter_id: 'synthetic', before_content: before, after_content: after }
}

function workerFile(name: string, source: string): string {
  const filename = path.join(outputRoot, name)
  fs.writeFileSync(filename, source, 'utf8')
  return filename
}

test('real compiled Worker preserves large diff and compiler output and emits intermediate progress', async () => {
  const client = new ComputeWorkerClient({ workerPath })
  const input = payload()
  const progress: number[] = []
  const result = await client.run('chapter-diff', input, { onProgress: (value) => progress.push(value) })
  expect(result).toEqual(diffChapterContent(input.chapter_id, input.before_content, input.after_content))
  expect(progress.some((value) => value > 0 && value < 1)).toBe(true)
  const compiler: ContextCompilerInput = { task_kind: 'summary',
    project: { id: 'project', name: '测试项目', genre: '', tone: '', target_words: null },
    stage: { body: '真实 Worker 合成正文' }, budget: { total: 2000, max_output_tokens: 200 } }
  await expect(client.run('compile-context', compiler)).resolves.toEqual(compileContext(compiler))
  const insufficient = { ...compiler, budget: { total: 1, max_output_tokens: 0 } }
  const budgetError = await client.run('compile-context', insufficient).catch((error: unknown) => error)
  expect(budgetError).toBeInstanceOf(ContextBudgetExceededError)
  let synchronousError: ContextBudgetExceededError | undefined
  try { compileContext(insufficient) } catch (error) { synchronousError = error as ContextBudgetExceededError }
  expect(JSON.stringify((budgetError as ContextBudgetExceededError).failureTrace)).toBe(JSON.stringify(synchronousError?.failureTrace))
  expect((budgetError as ContextBudgetExceededError).requiredTokens).toBe(synchronousError?.requiredTokens)
}, 30000)

test('real Worker trims large user-message context equivalently without changing bounded selection', async () => {
  const client = new ComputeWorkerClient({ workerPath })
  const messages = Array.from({ length: 10 }, (_, index) => ({
    role: 'user' as const, content: `消息 ${index} ${'x'.repeat(512 * 1024)}`, timestamp: index,
  }))
  const budget = 100_000
  await expect(client.run('trim-messages', { messages, budget }))
    .resolves.toEqual(trimMessagesToBudget(messages, budget))
})

test('large real Worker stays off main event loop, is cancelled during computation, then accepts another operation', async () => {
  const client = new ComputeWorkerClient({ workerPath, maxWorkers: 1 })
  const controller = new AbortController()
  let ticks = 0
  const timer = setInterval(() => { ticks += 1 }, 5)
  let cancelledAt = 0
  const pending = client.run('chapter-diff', payload(20000), {
    signal: controller.signal,
    onProgress: (value) => {
      if (value >= 0.2 && !controller.signal.aborted) {
        cancelledAt = performance.now()
        controller.abort()
      }
    },
  })
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  clearInterval(timer)
  expect(performance.now() - cancelledAt).toBeLessThan(1000)
  expect(ticks).toBeGreaterThan(2)
  await expect(client.run('chapter-diff', payload(10))).resolves.toMatchObject({ modified_count: 1 })
}, 30000)

test('real Worker crash is isolated, zero exit without result settles, and replacement works', async () => {
  const crashPath = workerFile('crash.cjs', "require('node:worker_threads').parentPort.on('message',()=>{throw new Error('synthetic crash')})")
  let calls = 0
  const client = new ComputeWorkerClient({ maxWorkers: 1, workerFactory: () =>
    new Worker(calls++ === 0 ? crashPath : workerPath) as unknown as ReturnType<NonNullable<ComputeWorkerClientOptions['workerFactory']>> })
  await expect(client.run('chapter-diff', payload(2))).rejects.toThrow('synthetic crash')
  await expect(client.run('chapter-diff', payload(2))).resolves.toMatchObject({ modified_count: 1 })
  const exitPath = workerFile('exit.cjs', "require('node:worker_threads').parentPort.on('message',()=>process.exit(0))")
  await expect(new ComputeWorkerClient({ workerPath: exitPath }).run('chapter-diff', payload(2)))
    .rejects.toThrow('exited before returning a result (code 0)')
})

test('real infinite Worker times out and capacity is bounded', async () => {
  const busyPath = workerFile('busy.cjs', "require('node:worker_threads').parentPort.on('message',()=>{while(true){}})")
  const client = new ComputeWorkerClient({ workerPath: busyPath, maxWorkers: 1 })
  const pending = client.run('chapter-diff', payload(2), { timeoutMs: 80 })
  await expect(client.run('chapter-diff', payload(2))).rejects.toThrow('capacity exceeded')
  await expect(pending).rejects.toThrow('timed out after 80 ms')
})

test('throwing progress observer cannot escape main thread', async () => {
  await expect(new ComputeWorkerClient({ workerPath }).run('chapter-diff', payload(10), {
    onProgress: () => { throw new Error('synthetic observer failure') },
  })).resolves.toMatchObject({ modified_count: 1 })
})
