import { compileContext, type ContextCompilerInput } from '@/shared/contextCompiler'
import { diffChapterBlocks, diffChapterContent } from '@/shared/narrativeWorkbench/blocks'
import type { ComputeWorkerClient, ComputeWorkerRunOptions } from '@/main/workers/computeWorkerClient'
import type { ChapterDiffPayload, ComputeOperation, WorkerPayloadByOperation, WorkerResultByOperation } from '@/main/workers/protocol'

/** Explicit CPU port for existing business tests; real thread behavior has separate compiled-Worker integration tests. */
export const inlineComputeClient: Pick<ComputeWorkerClient, 'run'> = {
  run: async <Operation extends ComputeOperation>(operation: Operation,
    payload: WorkerPayloadByOperation[Operation], options: ComputeWorkerRunOptions = {}) => {
    if (options.signal?.aborted) {
      const error = new Error('cancelled'); error.name = 'AbortError'; throw error
    }
    if (operation === 'compile-context') return compileContext(payload as ContextCompilerInput) as WorkerResultByOperation[Operation]
    const diff = payload as ChapterDiffPayload
    return (diff.mode === 'content'
      ? diffChapterContent(diff.chapter_id, diff.before_content, diff.after_content)
      : diffChapterBlocks(diff.before, diff.after)) as WorkerResultByOperation[Operation]
  },
}
