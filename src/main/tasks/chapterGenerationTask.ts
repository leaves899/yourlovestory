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
  public constructor(private readonly agent: ProjectSessionAgent) {}

  public async generate(request: TextGenerationRequest): Promise<TextGenerationResult> {
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

export function createChapterGenerationTaskRunner(
  options: ChapterGenerationTaskRunnerOptions,
): TaskRunner {
  return {
    execute: async (context) => {
      const request = readRequest(context)
      let agent: ProjectSessionAgent | undefined
      try {
        agent = await options.agentFactory.create({
          projectId: request.project_id,
          sessionId: context.input.sessionId,
          llm: context.input.llm,
          systemPrompt: request.system_prompt ?? CHAPTER_GENERATION_SYSTEM_PROMPT,
        })
        const result = await options.service.generate(
          request,
          new AgentTextGenerator(agent),
          {
            signal: context.signal,
            checkpoint: checkpointFromJson(context.task.checkpoint),
            callbacks: {
              on_stage: (stage, progress) => context.setStage(stage, progress),
              on_chunk: (stage, chunk) => {
                if (context.input.llm.streamingEnabled !== false) context.emitChunk(chunk, stage)
              },
              on_checkpoint: (checkpoint) => context.saveCheckpoint(checkpointToJson(checkpoint)),
              on_review: (version, required) =>
                context.publishReview(version.id, required, version.status === 'approved' ? 'approved' : 'review'),
            },
          },
        )
        const versionId = result.version?.id ?? result.checkpoint.version_id
        const factCheckPassed = result.version?.fact_check.passed ?? result.checkpoint.fact_check?.passed ?? false
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
      } finally {
        agent?.dispose()
      }
    },
  }
}
