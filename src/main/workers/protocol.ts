import type { ContextCompilerInput, CompiledContext } from '../../shared/contextCompiler'
import type { ChapterBlock, ChapterDiff } from '../../shared/narrativeWorkbench'

export type ComputeOperation = 'chapter-diff' | 'compile-context'

export type ChapterDiffPayload =
  | {
      mode: 'content'
      chapter_id: string
      before_content: string
      after_content: string
    }
  | {
      mode: 'blocks'
      before: readonly ChapterBlock[]
      after: readonly ChapterBlock[]
    }

export interface WorkerPayloadByOperation {
  'chapter-diff': ChapterDiffPayload
  'compile-context': ContextCompilerInput
}

export interface WorkerResultByOperation {
  'chapter-diff': ChapterDiff
  'compile-context': CompiledContext
}

export type WorkerRequest = {
  [Operation in ComputeOperation]: {
    type: 'run'
    id: string
    operation: Operation
    payload: WorkerPayloadByOperation[Operation]
  }
}[ComputeOperation]

export type WorkerEvent =
  | { type: 'progress'; id: string; progress: number }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id: string; message: string }

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.type === 'run'
    && typeof candidate.id === 'string'
    && (candidate.operation === 'chapter-diff' || candidate.operation === 'compile-context')
}
