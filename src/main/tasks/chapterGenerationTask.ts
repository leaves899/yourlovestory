import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, ProjectSessionAgent } from '../../agent/agent'
import type {
  ChapterGenerationRequest,
  ChapterGenerationService,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from '../../shared/chapterGeneration'
import {
  checkpointFromJson,
  checkpointToJson,
} from '../../shared/chapterGeneration'
import {
  CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
  parseStrictGenerationCheckpoint,
} from '../../shared/taskRecovery'
import type { JsonObject, JsonValue } from '../database'
import type { TaskRunner, TaskRunnerContext, TaskRunnerResult } from './taskManager'

export interface ChapterGenerationTaskRunnerOptions {
  service: ChapterGenerationService
  agentFactory: AgentFactory
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRequiredString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function readRequest(context: TaskRunnerContext): ChapterGenerationRequest {
  const input = context.input.input
  if (!input || !isRecord(input)) throw new Error('chapter generation request is required')
  const autoConfirm = input.auto_confirm
  if (autoConfirm !== undefined && typeof autoConfirm !== 'boolean') {
    throw new Error('auto_confirm must be a boolean')
  }
  const chapterId = input.chapter_id
  if (chapterId !== undefined && typeof chapterId !== 'string') {
    throw new Error('chapter_id must be a string')
  }
  return {
    project_id: readRequiredString(input.project_id, 'project_id'),
    chapter_outline_id: readRequiredString(input.chapter_outline_id, 'chapter_outline_id'),
    ...(chapterId ? { chapter_id: chapterId } : {}),
    ...(autoConfirm === undefined ? {} : { auto_confirm: autoConfirm }),
    task_id: context.task.id,
  }
}

class AgentTextGenerator implements TextGenerator {
  public constructor(
    private readonly agent: ProjectSessionAgent,
    private readonly onModelStart?: () => void,
  ) {}

  public async generate(request: TextGenerationRequest): Promise<TextGenerationResult> {
    this.onModelStart?.()
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
    return { text: result.text }
  }
}

function resultToJson(
  chapterId: string,
  status: TaskRunnerResult['status'],
  versionId: string | null,
  autoConfirmed: boolean,
  reviewRequired: boolean,
  factCheckPassed: boolean,
): JsonObject {
  return {
    chapter_id: chapterId,
    status: status ?? 'completed',
    version_id: versionId,
    auto_confirmed: autoConfirmed,
    review_required: reviewRequired,
    fact_check_passed: factCheckPassed,
  }
}

/**
 * Idempotent finish when a chapter version already exists for this task_id.
 * Never creates an agent or calls the model.
 */
function finishFromExistingVersion(
  context: TaskRunnerContext,
  request: ChapterGenerationRequest,
  service: ChapterGenerationService,
): TaskRunnerResult | null {
  const existing = service.getVersionByTaskId(context.task.id)
  if (!existing) return null

  try {
    service.getVersion(request.project_id, existing.id)
  } catch {
    throw new Error('已落库章节版本与任务目标项目不一致，任务不可恢复。')
  }
  if (request.chapter_id && existing.chapter_id !== request.chapter_id) {
    throw new Error('已落库章节版本与任务目标章节不一致，任务不可恢复。')
  }

  context.assertStillOwnsExecution()
  context.setExecutionPhase('persisting_result')
  context.saveCheckpoint(checkpointToJson({
    schema_version: CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
    stage: 'review',
    body: existing.content,
    summary: existing.summary,
    fact_check_text: '',
    fact_check: existing.fact_check,
    version_id: existing.id,
  }))
  context.setStage('review', 1)
  context.setExecutionPhase('finalizing')
  context.publishReview(
    existing.id,
    existing.status === 'review',
    existing.status === 'approved' ? 'approved' : 'review',
  )
  return {
    status: 'completed',
    result: resultToJson(
      existing.chapter_id,
      'completed',
      existing.id,
      existing.status === 'approved',
      existing.status === 'review',
      existing.fact_check.passed,
    ),
  }
}

export function createChapterGenerationTaskRunner(
  options: ChapterGenerationTaskRunnerOptions,
): TaskRunner {
  return {
    execute: async (context) => {
      const request = readRequest(context)

      // Final entity first: never create agent when version is already durable.
      const finished = finishFromExistingVersion(context, request, options.service)
      if (finished) return finished

      // Shared strict validator with classifier: corrupt checkpoint is terminal.
      if (context.task.checkpoint) {
        const strict = parseStrictGenerationCheckpoint(context.task.checkpoint)
        if (!strict) {
          throw new Error('章节生成检查点语义损坏或字段不合法，已拒绝恢复并禁止调用模型。')
        }
      }

      let agent: ProjectSessionAgent | undefined
      try {
        context.setExecutionPhase('preparing')
        context.assertStillOwnsExecution()
        agent = await options.agentFactory.create({
          projectId: request.project_id,
          sessionId: context.input.sessionId,
          llm: context.input.llm,
          systemPrompt: '你负责依据已确认的长篇大纲生成章节，不执行大纲修改，不生成叙事记忆。',
        })
        context.setExecutionPhase('awaiting_model')
        const result = await options.service.generate(
          request,
          new AgentTextGenerator(agent, () => context.setExecutionPhase('model_in_flight')),
          {
            signal: context.signal,
            commit: (operation) => context.runOwnedSideEffect(operation),
            checkpoint: (() => {
              const strict = context.task.checkpoint
                ? parseStrictGenerationCheckpoint(context.task.checkpoint)
                : null
              if (context.task.checkpoint && !strict) {
                throw new Error('章节生成检查点语义损坏或字段不合法，已拒绝恢复并禁止调用模型。')
              }
              const checkpoint = checkpointFromJson(strict ? context.task.checkpoint : null)
              return {
                ...checkpoint,
                schema_version: CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
              }
            })(),
            callbacks: {
              on_stage: (stage, progress) => {
                context.setStage(stage, progress)
                if (stage === 'saving') context.setExecutionPhase('persisting_result')
                if (stage === 'review') context.setExecutionPhase('finalizing')
              },
              on_chunk: (stage, chunk) => {
                if (context.input.llm.streamingEnabled !== false) context.emitChunk(chunk, stage)
              },
              on_checkpoint: (checkpoint) => {
                context.assertStillOwnsExecution()
                context.saveCheckpoint(checkpointToJson({
                  ...checkpoint,
                  schema_version: CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
                }))
              },
              on_review: (version, required) =>
                context.publishReview(version.id, required, version.status === 'approved' ? 'approved' : 'review'),
            },
          },
        )
        const versionId = result.version?.id ?? result.checkpoint.version_id
        const factCheckPassed = result.version?.fact_check.passed ?? result.checkpoint.fact_check?.passed ?? false
        context.setExecutionPhase('finalizing')
        return {
          status: result.status,
          result: resultToJson(
            result.chapter.id,
            result.status,
            versionId,
            result.auto_confirmed,
            result.status === 'completed' && !result.auto_confirmed,
            factCheckPassed,
          ),
        }
      } finally {
        agent?.dispose()
      }
    },
  }
}
