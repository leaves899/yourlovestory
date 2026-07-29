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
import { CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION } from '../../shared/taskRecovery'
import type { JsonObject, JsonValue } from '../database'
import type { TaskRunner, TaskRunnerContext, TaskRunnerResult } from './taskManager'

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
  if (!value) return null
  const operation = value.operation
  const status = value.status
  if (
    (operation !== 'paragraph_revision' && operation !== 'chapter_polish') ||
    (status !== 'running' && status !== 'completed' && status !== 'fallback' && status !== 'cancelled')
  ) {
    return null
  }
  const schemaVersion = typeof value.schema_version === 'number'
    ? value.schema_version
    : CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION
  return {
    schema_version: schemaVersion,
    operation,
    source_content: typeof value.source_content === 'string' ? value.source_content : '',
    generated_content: typeof value.generated_content === 'string' ? value.generated_content : '',
    revision_id: typeof value.revision_id === 'string' ? value.revision_id : null,
    status,
    error: typeof value.error === 'string' ? value.error : null,
    applied: value.applied === true,
    updated_at: typeof value.updated_at === 'string' ? value.updated_at : undefined,
  }
}

function checkpointToJson(checkpoint: NarrativeOperationCheckpoint): JsonObject {
  return {
    schema_version: checkpoint.schema_version,
    operation: checkpoint.operation,
    source_content: checkpoint.source_content,
    generated_content: checkpoint.generated_content,
    revision_id: checkpoint.revision_id,
    status: checkpoint.status,
    error: checkpoint.error,
    applied: checkpoint.applied === true,
    ...(checkpoint.updated_at ? { updated_at: checkpoint.updated_at } : {}),
  }
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

export function createChapterPolishTaskRunner(
  options: ChapterPolishTaskRunnerOptions,
): TaskRunner {
  return {
    execute: async (context): Promise<TaskRunnerResult> => {
      const request = readRequest(context)
      const savedCheckpoint = checkpointFromJson(context.task.checkpoint)
      let agent: ProjectSessionAgent | undefined
      try {
        // Safe resume path: revision already exists for this task.
        if (savedCheckpoint?.status === 'completed' && savedCheckpoint.revision_id) {
          let applied = savedCheckpoint.applied === true
          if (request.auto_apply && !applied) {
            context.setExecutionPhase('persisting_result')
            options.service.applyRevision(request.project_id, savedCheckpoint.revision_id)
            applied = true
            context.saveCheckpoint(checkpointToJson({ ...savedCheckpoint, applied: true }))
          }
          context.setStage('review', 1)
          context.setExecutionPhase('finalizing')
          return {
            status: 'completed',
            result: {
              status: 'completed',
              revision_id: savedCheckpoint.revision_id,
              report_id: null,
              applied,
              error: null,
              diff: {
                unchanged_count: 0,
                added_count: 0,
                removed_count: 0,
                modified_count: 0,
              },
            },
          }
        }

        context.setExecutionPhase('preparing')
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
          on_checkpoint: (checkpoint: NarrativeOperationCheckpoint) =>
            context.saveCheckpoint(checkpointToJson({
              ...checkpoint,
              schema_version: CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
            })),
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
            options.service.applyRevision(request.project_id, result.revision.id)
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
