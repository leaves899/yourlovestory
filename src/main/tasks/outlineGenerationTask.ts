import type { AgentFactory, ProjectSessionAgent } from '../../agent/agent'
import { normalizeLlmConfig } from '../../agent/llm'
import { ContextBudgetExceededError } from '../../shared/contextCompiler'
import {
  OUTLINE_GENERATION_SYSTEM_PROMPT,
  OutlineGenerationBoundaryError,
  parseOutlineCheckpoint,
  parseOutlineProposal,
  type OutlineCheckpoint,
  type OutlineGenerationRequest,
  type OutlineGenerationService,
} from '../../shared/outlineGeneration'
import type { JsonValue } from '../../shared/novelProject'
import { NonRecoverableTaskError, type TaskRunner, type TaskRunnerContext } from './taskManager'

function readRequest(context: TaskRunnerContext): OutlineGenerationRequest {
  const input = context.input.input
  if (!input || typeof input.project_id !== 'string' || input.project_id !== context.task.project_id
    || input.project_id !== context.input.projectId || typeof input.outline_id !== 'string'
    || !input.outline_id.trim() || (input.debug !== undefined && typeof input.debug !== 'boolean')) {
    throw new NonRecoverableTaskError('大纲任务目标或输入不合法，请新建任务。')
  }
  const llm = normalizeLlmConfig(context.input.llm)
  return {
    projectId: input.project_id,
    outlineId: input.outline_id,
    debug: input.debug === true,
    modelParams: {
      model: llm.model, temperature: llm.temperature ?? null,
      max_output_tokens: llm.maxOutputTokens, context_budget: llm.contextBudget,
    },
  }
}

function readProposal(text: string): NonNullable<OutlineCheckpoint['proposal']> {
  // A malformed response is never partially applied or echoed in an error.
  let parsed: JsonValue
  try { parsed = JSON.parse(text) as JsonValue } catch {
    throw new NonRecoverableTaskError('模型未返回有效的大纲 JSON，未写入大纲。')
  }
  const proposal = parseOutlineProposal(parsed)
  if (!proposal) throw new NonRecoverableTaskError('模型大纲字段不完整或不合法，未写入大纲。')
  return proposal
}

export function createOutlineGenerationTaskRunner(options: {
  service: OutlineGenerationService
  agentFactory: AgentFactory
}): TaskRunner {
  return {
    execute: async (context) => {
      let agent: ProjectSessionAgent | undefined
      const request = readRequest(context)
      try {
        if (context.signal.aborted) return { status: 'cancelled' }
        context.assertStillOwnsExecution()
        const saved = context.task.checkpoint ? parseOutlineCheckpoint(context.task.checkpoint) : null
        if (context.task.checkpoint && !saved) {
          throw new NonRecoverableTaskError('大纲检查点或 compiler metadata 损坏，已拒绝恢复。')
        }
        context.setExecutionPhase('preparing')
        let prepared: ReturnType<OutlineGenerationService['prepare']>
        try {
          prepared = options.service.prepare(request, saved, context.task.id)
        } catch (error) {
          if (error instanceof ContextBudgetExceededError) {
            context.saveCheckpoint(options.service.failedBudgetCheckpoint(request, error))
            throw new NonRecoverableTaskError('大纲上下文超过 Token 预算，请调整预算后新建任务。')
          }
          throw error
        }
        let checkpoint = prepared.checkpoint
        context.saveCheckpoint(checkpoint)
        context.setStage('outline', 0.2)
        if (prepared.prompt !== null) {
          context.assertStillOwnsExecution()
          agent = await options.agentFactory.create({
            projectId: request.projectId, sessionId: context.input.sessionId,
            llm: context.input.llm, systemPrompt: OUTLINE_GENERATION_SYSTEM_PROMPT,
            tools: [],
          })
          context.assertStillOwnsExecution()
          if (context.signal.aborted) return { status: 'cancelled' }
          checkpoint = { ...checkpoint, stage: 'model' }
          context.saveCheckpoint(checkpoint)
          context.setExecutionPhase('model_in_flight')
          if (context.signal.aborted) return { status: 'cancelled' }
          const generated = await agent.prompt(prepared.prompt, {
            signal: context.signal,
            onEvent: (event) => {
              if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
                context.emitChunk(event.assistantMessageEvent.delta, 'outline')
              }
            },
          })
          context.assertStillOwnsExecution()
          if (context.signal.aborted || generated.finishReason === 'aborted') return { status: 'cancelled' }
          if (generated.finishReason === 'error') throw new Error('大纲模型调用失败，未写入大纲。')
          checkpoint = { ...checkpoint, stage: 'ready', proposal: readProposal(generated.text) }
          context.saveCheckpoint(checkpoint)
        }
        context.assertStillOwnsExecution()
        if (context.signal.aborted) return { status: 'cancelled' }
        context.setExecutionPhase('persisting_result')
        if (checkpoint.stage !== 'applied') {
          checkpoint = context.runOwnedSideEffect(() => {
            if (context.signal.aborted) throw new Error('大纲任务已中止，未写入大纲。')
            const updated = options.service.apply(request, checkpoint, context.task.id)
            const applied: OutlineCheckpoint = { ...checkpoint, stage: 'applied', applied_version: updated.version }
            context.saveCheckpoint(applied)
            return applied
          })
        }
        context.setStage('outline', 1)
        return { result: {
          outline_id: request.outlineId, outline_version: checkpoint.applied_version ?? null,
          stage_compiles: checkpoint.stage_compiles,
          review_required: true,
        } }
      } catch (error) {
        if (error instanceof OutlineGenerationBoundaryError) throw new NonRecoverableTaskError(error.message)
        throw error
      } finally {
        agent?.dispose()
      }
    },
  }
}
