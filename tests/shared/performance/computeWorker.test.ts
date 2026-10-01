import { EventEmitter } from 'node:events'
import { compileContext, type ContextCompilerInput } from '@/shared/contextCompiler'
import { diffChapterBlocks, diffChapterContent, type ChapterBlock } from '@/shared/narrativeWorkbench'
import {
  ComputeWorkerClient,
  type ComputeWorkerClientOptions,
} from '@/main/workers/computeWorkerClient'
import type { WorkerEvent, WorkerRequest } from '@/main/workers/protocol'

type FakeMode = 'success' | 'timeout' | 'crash'

class FakeWorker extends EventEmitter {
  public terminated = false

  public constructor(private readonly mode: FakeMode) {
    super()
  }

  public postMessage(request: WorkerRequest): void {
    if (this.mode === 'timeout') return
    if (this.mode === 'crash') {
      queueMicrotask(() => this.emit('error', new Error('simulated worker crash')))
      return
    }
    queueMicrotask(() => {
      this.emit('message', { type: 'progress', id: request.id, progress: 0 } satisfies WorkerEvent)
      const result = request.operation === 'chapter-diff'
        ? request.payload.mode === 'content'
          ? diffChapterContent(
            request.payload.chapter_id,
            request.payload.before_content,
            request.payload.after_content,
          )
          : diffChapterBlocks(request.payload.before, request.payload.after)
        : compileContext(request.payload)
      this.emit('message', { type: 'progress', id: request.id, progress: 1 } satisfies WorkerEvent)
      this.emit('message', { type: 'result', id: request.id, result } satisfies WorkerEvent)
    })
  }

  public terminate(): Promise<number> {
    this.terminated = true
    return Promise.resolve(0)
  }
}

function makeClient(mode: FakeMode, observed: FakeWorker[]): ComputeWorkerClient {
  const options: ComputeWorkerClientOptions = {
    workerFactory: () => {
      const worker = new FakeWorker(mode)
      observed.push(worker)
      return worker as unknown as ReturnType<NonNullable<ComputeWorkerClientOptions['workerFactory']>>
    },
  }
  return new ComputeWorkerClient(options)
}

const beforeBlocks: ChapterBlock[] = [
  { id: 'block-1', ordinal: 0, kind: 'paragraph', text: '第一段', fingerprint: 'a' },
  { id: 'block-2', ordinal: 1, kind: 'paragraph', text: '第二段', fingerprint: 'b' },
]
const afterBlocks: ChapterBlock[] = [
  { id: 'block-1', ordinal: 0, kind: 'paragraph', text: '第一段修订', fingerprint: 'c' },
  { id: 'block-2', ordinal: 1, kind: 'paragraph', text: '第二段', fingerprint: 'b' },
]

function compilerInput(): ContextCompilerInput {
  return {
    task_kind: 'summary',
    project: { id: 'project-1', name: '项目', genre: '科幻', tone: '冷峻', target_words: 10000 },
    stage: { body: '章节正文' },
    budget: { total: 2000, max_output_tokens: 200 },
    model_params: { model: 'test-model', temperature: 0.2 },
  }
}

describe('compute worker protocol', () => {
  it('returns chapter diff equivalent to the synchronous implementation and reports progress', async () => {
    const observed: FakeWorker[] = []
    const progress: number[] = []
    const client = makeClient('success', observed)
    const result = await client.run('chapter-diff', {
      mode: 'blocks',
      before: beforeBlocks,
      after: afterBlocks,
    }, { onProgress: (value) => progress.push(value) })

    expect(result).toEqual(diffChapterBlocks(beforeBlocks, afterBlocks))
    expect(progress).toEqual([0, 1])
    expect(observed[0]?.terminated).toBe(true)
  })

  it('returns compileContext equivalent to the synchronous implementation', async () => {
    const client = makeClient('success', [])
    const input = compilerInput()
    await expect(client.run('compile-context', input)).resolves.toEqual(compileContext(input))
  })

  it('terminates the worker and rejects with AbortError on cancellation', async () => {
    const observed: FakeWorker[] = []
    const controller = new AbortController()
    const client = makeClient('timeout', observed)
    const pending = client.run('chapter-diff', {
      mode: 'blocks',
      before: beforeBlocks,
      after: afterBlocks,
    }, { signal: controller.signal, timeoutMs: 1000 })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(observed[0]?.terminated).toBe(true)
  })

  it('contains worker crash as a rejected operation', async () => {
    const observed: FakeWorker[] = []
    const client = makeClient('crash', observed)
    await expect(client.run('chapter-diff', {
      mode: 'blocks',
      before: beforeBlocks,
      after: afterBlocks,
    })).rejects.toThrow('Compute worker failed: simulated worker crash')
    expect(observed[0]?.terminated).toBe(true)
  })

  it('rejects on timeout and terminates the worker', async () => {
    const observed: FakeWorker[] = []
    const client = makeClient('timeout', observed)
    await expect(client.run('chapter-diff', {
      mode: 'blocks',
      before: beforeBlocks,
      after: afterBlocks,
    }, { timeoutMs: 5 })).rejects.toThrow('timed out after 5 ms')
    expect(observed[0]?.terminated).toBe(true)
  })
})
