import { parentPort } from 'node:worker_threads'
import { compileContext } from '../../shared/contextCompiler'
import { diffChapterBlocks, diffChapterContent } from '../../shared/narrativeWorkbench/blocks'
import {
  isWorkerRequest,
  type ChapterDiffPayload,
  type WorkerEvent,
  type WorkerRequest,
} from './protocol'

if (!parentPort) throw new Error('Compute worker requires parentPort')

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function runChapterDiff(payload: ChapterDiffPayload) {
  return payload.mode === 'content'
    ? diffChapterContent(payload.chapter_id, payload.before_content, payload.after_content)
    : diffChapterBlocks(payload.before, payload.after)
}

function run(request: WorkerRequest): unknown {
  if (request.operation === 'chapter-diff') return runChapterDiff(request.payload)
  return compileContext(request.payload)
}

function send(event: WorkerEvent): void {
  parentPort?.postMessage(event)
}

parentPort.on('message', (value: unknown) => {
  if (!isWorkerRequest(value)) {
    send({ type: 'error', id: '', message: 'Invalid compute worker request' })
    return
  }
  try {
    send({ type: 'progress', id: value.id, progress: 0 })
    const result = run(value)
    send({ type: 'progress', id: value.id, progress: 1 })
    send({ type: 'result', id: value.id, result })
  } catch (error: unknown) {
    send({ type: 'error', id: value.id, message: errorMessage(error) })
  }
})
