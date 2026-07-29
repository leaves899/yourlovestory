import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, ProjectSessionAgent } from '../../agent/agent'
import type {
  ChapterPolishOptions,
  NarrativeOperationCheckpoint,
  NarrativeTextGenerationRequest,
  NarrativeTextGenerationResult,
  NarrativeTextGenerator,
  ParagraphRevisionOptions,
  NarrativeWorkbenchService,
} from '../../shared/narrativeWorkbench'
import {
  CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
  parseStrictPolishCheckpoint,
  polishCheckpointToJson,
  type StrictPolishCheckpoint,
} from '../../shared/taskRecovery'
import type { JsonObject, JsonValue } from '../database'
import {
  NonRecoverableTaskError,
  type TaskRunner,
  type TaskRunnerContext,
  type TaskRunnerResult,
} from './taskManager'

export interface ChapterPolishTaskRunnerOptions {
  service: NarrativeWorkbenchService
  agentFactory: AgentFactory
}

interface ChapterPolishRequest {
  project_id: string
  chapter_id: string
  mode: 'chapter' | 'paragraph'
  block_id?: string
  instruction: string
  source_revision_id: string | null
  auto_apply: boolean
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function readRequest(context: TaskRunnerContext): ChapterPolishRequest {
  const input = context.input.input
  if (!input || !isRecord(input)) throw new Error('chapter polish request is required')
  const mode = input.mode ?? 'chapter'
  if (mode !== 'chapter' && mode !== 'paragraph') throw new Error('mode must be chapter or paragraph')
  const blockId = input.block_id
  if (mode === 'paragraph' && (typeof blockId !== 'string' || blockId.trim() === '')) {
    throw new Error('block_id is required for paragraph revision')
  }
  const sourceRevisionId = input.source_revision_id
  if (sourceRevisionId !== undefined && sourceRevisionId !== null && typeof sourceRevisionId !== 'string') {
    throw new Error('source_revision_id must be a string or null')
  }
  const autoApply = input.auto_apply
  if (autoApply !== undefined && typeof autoApply !== 'boolean') {
    throw new Error('auto_apply must be a boolean')
  }
  return {
    project_id: requiredString(input.project_id, 'project_id'),
    chapter_id: requiredString(input.chapter_id, 'chapter_id'),
    mode,
    ...(typeof blockId === 'string' ? { block_id: blockId } : {}),
    instruction: typeof input.instruction === 'string' ? input.instruction : '',
    source_revision_id: typeof sourceRevisionId === 'string' ? sourceRevisionId : null,
    auto_apply: autoApply ?? false,
  }
}

function checkpointFromJson(value: JsonObject | null): NarrativeOperationCheckpoint | null {
  const parsed = parseStrictPolishCheckpoint(value)
  if (!parsed) return null
  return {
    schema_version: parsed.schema_version,
    operation: parsed.operation,
    source_content: parsed.source_content,
    generated_content: parsed.generated_content,
    revision_id: parsed.revision_id,
    status: parsed.status,
    error: parsed.error,
    applied: parsed.applied,
    ...(parsed.updated_at ? { updated_at: parsed.updated_at } : {}),
  }
}

function checkpointToJson(checkpoint: NarrativeOperationCheckpoint | StrictPolishCheckpoint): JsonObject {
  return polishCheckpointToJson({
    schema_version: checkpoint.schema_version,
    operation: checkpoint.operation,
    source_content: checkpoint.source_content,
    generated_content: checkpoint.generated_content,
    revision_id: checkpoint.revision_id,
    status: checkpoint.status,
    error: checkpoint.error,
    applied: checkpoint.applied === true,
    ...(checkpoint.updated_at ? { updated_at: checkpoint.updated_at } : {}),
  })
}

class AgentNarrativeTextGenerator implements NarrativeTextGenerator {
  public constructor(private readonly agent: ProjectSessionAgent) {}

  public async generate(request: NarrativeTextGenerationRequest): Promise<NarrativeTextGenerationResult> {
    let streamed = ''
    const result = await this.agent.prompt(request.prompt, {
      signal: request.signal,
      onEvent: (event: AgentEvent) => {
        if (event.type !== 'message_update' || event.assistantMessageEvent.type !== 'text_delta') return
        streamed += event.assistantMessageEvent.delta
        request.on_chunk?.(event.assistantMessageEvent.delta)
      },
    })
    if (streamed.length === 0 && result.text.length > 0) request.on_chunk?.(result.text)
    return { text: result.text || streamed }
  }
}

function resultToJson(
  status: 'completed' | 'fallback' | 'cancelled',
  result: ChapterRevisionOperationResultLike,
  applied: boolean,
): JsonObject {
  return {
    status,
    revision_id: result.revision?.id ?? null,
    report_id: result.report?.id ?? null,
    applied,
    error: result.error,
    diff: {
      unchanged_count: result.diff.unchanged_count,
      added_count: result.diff.added_count,
      removed_count: result.diff.removed_count,
      modified_count: result.diff.modified_count,
    },
  }
}

interface ChapterRevisionOperationResultLike {
  status: 'completed' | 'fallback' | 'cancelled'
  content?: string
  revision: { id: string } | null
  report: { id: string } | null
  diff: {
    unchanged_count: number
    added_count: number
    removed_count: number
    modified_count: number
  }
  error: string | null
}

function emptyDiff() {
  return {
    unchanged_count: 0,
    added_count: 0,
    removed_count: 0,
    modified_count: 0,
  }
}

/**
 * Idempotent finish when a final revision already exists for this task, even if the
 * completed checkpoint was lost. Never creates an agent or calls the model.
 */
function finishFromExistingRevision(
  context: TaskRunnerContext,
  request: ChapterPolishRequest,
  service: NarrativeWorkbenchService,
): TaskRunnerResult | null {
  const existing = service.getRevisionByTaskId(context.task.id)
  if (!existing) return null

  // Entity must still belong to the target project/chapter for this task.
  try {
    service.getRevision(request.project_id, existing.id)
  } catch {
    throw new NonRecoverableTaskError('已落库修订与任务目标项目不一致，任务不可恢复。')
  }
  if (existing.chapter_id !== request.chapter_id) {
    throw new NonRecoverableTaskError('已落库修订与任务目标章节不一致，任务不可恢复。')
  }

  context.setExecutionPhase('persisting_result')
  const savedCheckpoint = checkpointFromJson(context.task.checkpoint)
  const committed = context.runOwnedSideEffect(() => {
    const report = service.ensureReportForTask(
      request.project_id,
      request.chapter_id,
      context.task.id,
      existing.id,
      request.mode === 'paragraph' ? 'paragraph-revision' : 'chapter-polish',
    )
    let applied = savedCheckpoint?.applied === true
      && savedCheckpoint.revision_id === existing.id
    if (request.auto_apply && !applied) {
      service.applyRevision(request.project_id, existing.id)
      applied = true
    }
    return { report, applied }
  })

  context.saveCheckpoint(checkpointToJson({
    schema_version: CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
    operation: request.mode === 'paragraph' ? 'paragraph_revision' : 'chapter_polish',
    source_content: savedCheckpoint?.source_content ?? '',
    generated_content: existing.content,
    revision_id: existing.id,
    status: 'completed',
    error: null,
    applied: committed.applied,
  }))
  context.setStage('review', 1)
  context.setExecutionPhase('finalizing')
  return {
    status: 'completed',
    result: {
      status: 'completed',
      revision_id: existing.id,
      report_id: committed.report?.id ?? null,
      applied: committed.applied,
      error: null,
      diff: emptyDiff(),
    },
  }
}

export function createChapterPolishTaskRunner(
  options: ChapterPolishTaskRunnerOptions,
): TaskRunner {
  return {
    execute: async (context): Promise<TaskRunnerResult> => {
      const request = readRequest(context)

      // Final entity first: never create agent / call model when revision is already durable.
      const finished = finishFromExistingRevision(context, request, options.service)
      if (finished) return finished

      // Shared strict validator with classifier.
      if (context.task.checkpoint) {
        const strict = parseStrictPolishCheckpoint(context.task.checkpoint)
        if (!strict) {
          throw new Error('章节润色检查点语义损坏或字段不合法，已拒绝恢复并禁止调用模型。')
        }
      }
      const savedCheckpoint = checkpointFromJson(context.task.checkpoint)

      let agent: ProjectSessionAgent | undefined
      try {
        if (savedCheckpoint?.status === 'completed' && savedCheckpoint.revision_id) {
          throw new NonRecoverableTaskError(
            '完成检查点引用的修订未按当前 task_id 持久化，无法验证归属，任务不可恢复。',
          )
        }

        context.setExecutionPhase('preparing')
        context.assertStillOwnsExecution()
        agent = await options.agentFactory.create({
          projectId: request.project_id,
          sessionId: context.input.sessionId,
          llm: context.input.llm,
          systemPrompt: 'You polish approved chapter text while preserving facts and plot.',
        })
        const sharedOptions = {
          signal: context.signal,
          existing_text: savedCheckpoint?.generated_content || undefined,
          on_chunk: (operation: NarrativeTextGenerationRequest['operation'], chunk: string) => {
            if (context.input.llm.streamingEnabled !== false) context.emitChunk(chunk, operation)
          },
          on_checkpoint: (checkpoint: NarrativeOperationCheckpoint) => {
            context.assertStillOwnsExecution()
            context.saveCheckpoint(checkpointToJson({
              ...checkpoint,
              schema_version: CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
            }))
          },
          commit: <T>(operation: () => T): T =>
            context.runOwnedSideEffect(operation),
          task_id: context.task.id,
        }
        context.setStage(request.mode === 'paragraph' ? 'paragraph-revision' : 'polish', 0.1)
        context.setExecutionPhase('awaiting_model')
        const generator = new AgentNarrativeTextGenerator(agent)
        context.setExecutionPhase('model_in_flight')
        const result = request.mode === 'paragraph'
          ? await options.service.reviseParagraph(
              request.project_id,
              request.chapter_id,
              request.block_id!,
              request.instruction,
              generator,
              sharedOptions as ParagraphRevisionOptions,
            )
          : await options.service.polishChapter(
              request.project_id,
              request.chapter_id,
              generator,
              {
                ...sharedOptions,
                source_revision_id: request.source_revision_id,
                instruction: request.instruction,
                task_id: context.task.id,
              } as ChapterPolishOptions,
            )
        if (result.status === 'cancelled') {
          return { status: 'cancelled', result: resultToJson('cancelled', result, false) }
        }
        context.setExecutionPhase('persisting_result')
        let applied = false
        if (request.auto_apply && result.revision && result.status === 'completed') {
          const alreadyApplied = savedCheckpoint?.applied === true
            && savedCheckpoint.revision_id === result.revision.id
          if (!alreadyApplied) {
            context.runOwnedSideEffect(() =>
              options.service.applyRevision(request.project_id, result.revision!.id),
            )
            applied = true
            if (result.revision) {
              context.saveCheckpoint(checkpointToJson({
                schema_version: CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
                operation: request.mode === 'paragraph' ? 'paragraph_revision' : 'chapter_polish',
                source_content: savedCheckpoint?.source_content ?? '',
                generated_content: result.content ?? '',
                revision_id: result.revision.id,
                status: 'completed',
                error: null,
                applied: true,
              }))
            }
          } else {
            applied = true
          }
        }
        context.setStage('review', 1)
        context.setExecutionPhase('finalizing')
        return {
          status: 'completed',
          result: resultToJson(result.status, result, applied),
        }
      } finally {
        agent?.dispose()
      }
    },
  }
}
