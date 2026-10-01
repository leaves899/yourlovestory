import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, ProjectSessionAgent } from '../../agent/agent'
import { normalizeLlmConfig } from '../../agent/llm'
import type {
  ChapterGenerationModelParams,
  ChapterGenerationRequest,
  ChapterGenerationService,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from '../../shared/chapterGeneration'
import {
  CHAPTER_GENERATION_SYSTEM_PROMPT,
  checkpointFromJson,
  checkpointToJson,
  compileTraceToJson,
} from '../../shared/chapterGeneration'
import {
  ChapterGenerationBoundaryError,
  ChapterVersionStatusTransitionError,
  EntityNotFoundError,
} from '../../shared/novelProject'
import {
  CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
  parseStrictGenerationCheckpoint,
} from '../../shared/taskRecovery'
import type { JsonObject, JsonValue } from '../database'
import {
  NonRecoverableTaskError,
  type TaskRunner,
  type TaskRunnerContext,
  type TaskRunnerResult,
} from './taskManager'

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
  const debug = input.debug
  if (debug !== undefined && typeof debug !== 'boolean') {
    throw new Error('debug must be a boolean')
  }
  const llm = normalizeLlmConfig(context.input.llm)
  const model_params: ChapterGenerationModelParams = {
    model: llm.model,
    temperature: llm.temperature ?? null,
    max_output_tokens: llm.maxOutputTokens,
    context_budget: llm.contextBudget,
  }
  return {
    project_id: readRequiredString(input.project_id, 'project_id'),
    chapter_outline_id: readRequiredString(input.chapter_outline_id, 'chapter_outline_id'),
    ...(chapterId ? { chapter_id: chapterId } : {}),
    ...(autoConfirm === undefined ? {} : { auto_confirm: autoConfirm }),
    ...(debug === undefined ? {} : { debug }),
    task_id: context.task.id,
    model_params,
    system_prompt: CHAPTER_GENERATION_SYSTEM_PROMPT,
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

function stageCompilesToResultJson(
  checkpoint: ReturnType<typeof checkpointFromJson>,
): JsonObject {
  const compiles = checkpoint.stage_compiles ?? {}
  const out: JsonObject = {}
  for (const stage of ['body', 'summary', 'fact_check'] as const) {
    const item = compiles[stage]
    if (!item) continue
    out[stage] = {
      prompt_version: item.prompt_version,
      model_params: {
        model: item.model_params.model,
        temperature: item.model_params.temperature,
        max_output_tokens: item.model_params.max_output_tokens,
        context_budget: item.model_params.context_budget,
      },
      trace: compileTraceToJson(item.trace),
    }
  }
  return out
}

function resultToJson(
  chapterId: string,
  status: TaskRunnerResult['status'],
  versionId: string | null,
  autoConfirmed: boolean,
  reviewRequired: boolean,
  factCheckPassed: boolean,
  checkpoint: ReturnType<typeof checkpointFromJson>,
): JsonObject {
  const stageCompiles = stageCompilesToResultJson(checkpoint)
  return {
    chapter_id: chapterId,
    status: status ?? 'completed',
    version_id: versionId,
    auto_confirmed: autoConfirmed,
    review_required: reviewRequired,
    fact_check_passed: factCheckPassed,
    stage_compiles: stageCompiles,
    prompt_version:
      checkpoint.stage_compiles?.fact_check?.prompt_version ??
      checkpoint.stage_compiles?.summary?.prompt_version ??
      checkpoint.stage_compiles?.body?.prompt_version ??
      null,
    model_params: checkpoint.stage_compiles?.body?.model_params
      ? {
          model: checkpoint.stage_compiles.body.model_params.model,
          temperature: checkpoint.stage_compiles.body.model_params.temperature,
          max_output_tokens: checkpoint.stage_compiles.body.model_params.max_output_tokens,
          context_budget: checkpoint.stage_compiles.body.model_params.context_budget,
        }
      : null,
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

  const strictCheckpoint = context.task.checkpoint
    ? parseStrictGenerationCheckpoint(context.task.checkpoint)
    : null
  if (context.task.checkpoint && !strictCheckpoint) {
    throw new NonRecoverableTaskError('章节生成检查点语义损坏或字段不合法，已拒绝恢复并禁止自动确认。')
  }

  let finalized: ReturnType<ChapterGenerationService['finalizePersistedVersion']>
  try {
    finalized = context.runOwnedSideEffect(() =>
      service.finalizePersistedVersion(request, existing.id, strictCheckpoint?.source_content ?? null, strictCheckpoint?.source_chapter_version),
    )
  } catch (error) {
    if (
      error instanceof ChapterGenerationBoundaryError
      || error instanceof ChapterVersionStatusTransitionError
      || error instanceof EntityNotFoundError
    ) {
      throw new NonRecoverableTaskError('已落库章节版本与任务目标不一致，任务不可恢复。')
    }
    throw error
  }
  const finalVersion = finalized.version
  const savedCheckpoint = checkpointFromJson(context.task.checkpoint)

  context.setExecutionPhase('persisting_result')
  context.saveCheckpoint(checkpointToJson({
    ...savedCheckpoint,
    schema_version: CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
    stage: 'review',
    body: finalVersion.content,
    summary: finalVersion.summary,
    fact_check_text: '',
    fact_check: finalVersion.fact_check,
    version_id: finalVersion.id,
    ...(strictCheckpoint?.source_content !== undefined
      ? { source_content: strictCheckpoint.source_content }
      : {}),
  }))
  context.setStage('review', 1)
  context.setExecutionPhase('finalizing')
  context.publishReview(
    finalVersion.id,
    finalVersion.status === 'review',
    finalVersion.status === 'approved' ? 'approved' : 'review',
  )
  return {
    status: 'completed',
    result: resultToJson(
      finalized.chapter.id,
      'completed',
      finalVersion.id,
      finalized.autoConfirmed,
      finalVersion.status === 'review',
      finalVersion.fact_check.passed,
      savedCheckpoint,
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
        const generator: TextGenerator = {
          generate: async (textRequest) => {
            context.assertStillOwnsExecution()
            if (!agent) {
              agent = await options.agentFactory.create({
                projectId: request.project_id,
                sessionId: context.input.sessionId,
                llm: context.input.llm,
                systemPrompt: request.system_prompt ?? CHAPTER_GENERATION_SYSTEM_PROMPT,
              })
            }
            context.assertStillOwnsExecution()
            if (context.signal.aborted) {
              const error = new Error('章节任务已取消，未调用模型。')
              error.name = 'AbortError'
              throw error
            }
            context.setExecutionPhase('awaiting_model')
            return new AgentTextGenerator(agent, () => context.setExecutionPhase('model_in_flight')).generate(textRequest)
          },
        }
        const result = await options.service.generate(
          request,
          generator,
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
            result.checkpoint,
          ),
        }
      } catch (error) {
        if (error instanceof ChapterGenerationBoundaryError || error instanceof EntityNotFoundError) {
          throw new NonRecoverableTaskError(error.message)
        }
        throw error
      } finally {
        agent?.dispose()
      }
    },
  }
}
