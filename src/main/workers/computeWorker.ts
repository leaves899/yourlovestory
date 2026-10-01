import { parentPort } from 'node:worker_threads'
import { compileContext, ContextBudgetExceededError } from '../../shared/contextCompiler'
import { trimMessagesToBudget } from '../../agent/llm/context'
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

function runChapterDiff(payload: ChapterDiffPayload, onProgress: (progress: number) => void) {
  return payload.mode === 'content'
    ? diffChapterContent(payload.chapter_id, payload.before_content, payload.after_content, onProgress)
    : diffChapterBlocks(payload.before, payload.after, onProgress)
}

function run(request: WorkerRequest): unknown {
  if (request.operation === 'chapter-diff') {
    return runChapterDiff(request.payload, (progress) => send({ type: 'progress', id: request.id, progress }))
  }
  if (request.operation === 'trim-messages') return trimMessagesToBudget(request.payload.messages, request.payload.budget)
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
    send({ type: 'error', id: value.id, message: errorMessage(error),
      ...(error instanceof ContextBudgetExceededError ? { budget: {
        requiredTokens: error.requiredTokens, availableTokens: error.availableTokens,
        requiredItemIds: error.requiredItemIds, failureTrace: error.failureTrace,
      } } : {}) })
  }
})
