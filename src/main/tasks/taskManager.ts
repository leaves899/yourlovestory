import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, AgentRunResult } from '../../agent/agent'
import type { LlmConfigInput } from '../../agent/llm'
import type {
  CreateTaskInput,
  JsonObject,
  Task,
  TaskStore,
} from '../database'
import type { TaskEventSink } from './events'

export interface StartTaskInput {
  projectId: string
  sessionId: string
  taskType: string
  prompt: string
  llm: LlmConfigInput
  chapterId?: string | null
  parentTaskId?: string | null
  input?: JsonObject
  systemPrompt?: string
}

export interface TaskHandle {
  taskId: string
  completion: Promise<Task>
}

export interface TaskManagerOptions {
  store: TaskStore
  agentFactory: AgentFactory
  events: TaskEventSink
  now?: () => string
  createAbortController?: () => AbortController
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toResult(result: AgentRunResult): JsonObject {
  return {
    text: result.text,
    finishReason: result.finishReason,
    usage: {
      input: result.usage.input,
      output: result.usage.output,
      cacheRead: result.usage.cacheRead,
      cacheWrite: result.usage.cacheWrite,
      totalTokens: result.usage.totalTokens,
      cost: {
        input: result.usage.cost.input,
        output: result.usage.cost.output,
        cacheRead: result.usage.cost.cacheRead,
        cacheWrite: result.usage.cost.cacheWrite,
        total: result.usage.cost.total,
      },
    },
    ...(result.responseModel ? { responseModel: result.responseModel } : {}),
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  }
}

function toPersistedInput(input: StartTaskInput): JsonObject {
  const llm: JsonObject = {
    provider: input.llm.provider ?? 'openai-compatible',
    baseUrl: input.llm.baseUrl,
    model: input.llm.model,
    ...(input.llm.contextBudget === undefined ? {} : { contextBudget: input.llm.contextBudget }),
    ...(input.llm.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.llm.maxOutputTokens }),
    ...(input.llm.temperature === undefined ? {} : { temperature: input.llm.temperature }),
    ...(input.llm.streamingEnabled === undefined ? {} : { streamingEnabled: input.llm.streamingEnabled }),
    ...(input.llm.maxRetries === undefined ? {} : { maxRetries: input.llm.maxRetries }),
  }
  return {
    prompt: input.prompt,
    sessionId: input.sessionId,
    taskType: input.taskType,
    llm,
    request: input.input ?? {},
  }
}

export class TaskManager {
  private readonly controllers = new Map<string, AbortController>()
  private readonly completions = new Map<string, Promise<Task>>()
  private readonly now: () => string
  private readonly createAbortController: () => AbortController

  public constructor(private readonly options: TaskManagerOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.createAbortController = options.createAbortController ?? (() => new AbortController())
  }

  public start(input: StartTaskInput): TaskHandle {
    const createInput: CreateTaskInput = {
      project_id: input.projectId,
      chapter_id: input.chapterId,
      parent_task_id: input.parentTaskId,
      task_type: input.taskType,
      input: toPersistedInput(input),
    }
    const task = this.options.store.create(createInput)
    const controller = this.createAbortController()
    this.controllers.set(task.id, controller)
    this.options.events.publish({ type: 'task:start', task })

    const completion = this.execute(task.id, input, controller).finally(() => {
      this.controllers.delete(task.id)
      this.completions.delete(task.id)
    })
    this.completions.set(task.id, completion)
    return { taskId: task.id, completion }
  }

  public cancel(taskId: string): boolean {
    const requested = this.options.store.requestCancellation(taskId)
    if (!requested) return false
    this.controllers.get(taskId)?.abort()
    return true
  }

  public get(taskId: string): Task | null {
    return this.options.store.getById(taskId)
  }

  public listByProject(projectId: string): Task[] {
    return this.options.store.listByProject(projectId)
  }

  public async wait(taskId: string): Promise<Task | null> {
    const completion = this.completions.get(taskId)
    return completion ? completion : this.options.store.getById(taskId)
  }

  public dispose(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private async execute(
    taskId: string,
    input: StartTaskInput,
    controller: AbortController,
  ): Promise<Task> {
    const startedAt = this.now()
    this.updateStage(taskId, 'starting', 0)
    this.options.store.update(taskId, { status: 'running', started_at: startedAt })

    let agent: Awaited<ReturnType<AgentFactory['create']>> | undefined
    try {
      agent = await this.options.agentFactory.create({
        projectId: input.projectId,
        sessionId: input.sessionId,
        llm: input.llm,
        systemPrompt: input.systemPrompt,
      })
      const result = await agent.prompt(input.prompt, {
        signal: controller.signal,
        onEvent: (event) => this.handleAgentEvent(taskId, event),
      })

      if (controller.signal.aborted || result.finishReason === 'aborted') {
        return this.finishCancelled(taskId, result)
      }
      const completed = this.options.store.update(taskId, {
        status: 'completed',
        stage: 'completed',
        progress: 1,
        result: toResult(result),
        finished_at: this.now(),
      })
      if (!completed) throw new Error(`Task not found after completion: ${taskId}`)
      this.options.events.publish({
        type: 'task:end',
        taskId,
        status: 'completed',
        result: completed.result ?? undefined,
        stats: result,
      })
      return completed
    } catch (error) {
      if (controller.signal.aborted) {
        return this.finishCancelled(taskId)
      }
      const message = errorMessage(error)
      const failed = this.options.store.update(taskId, {
        status: 'failed',
        stage: 'failed',
        error_message: message,
        finished_at: this.now(),
      })
      if (!failed) throw new Error(`Task not found after failure: ${taskId}`)
      this.options.events.publish({ type: 'task:error', taskId, error: message })
      this.options.events.publish({ type: 'task:end', taskId, status: 'failed' })
      return failed
    } finally {
      agent?.dispose()
    }
  }

  private finishCancelled(taskId: string, result?: AgentRunResult): Task {
    const cancelled = this.options.store.update(taskId, {
      status: 'cancelled',
      stage: 'cancelled',
      progress: 1,
      result: result ? toResult(result) : null,
      cancel_requested: true,
      finished_at: this.now(),
    })
    if (!cancelled) throw new Error(`Task not found after cancellation: ${taskId}`)
    this.options.events.publish({
      type: 'task:end',
      taskId,
      status: 'cancelled',
      result: cancelled.result ?? undefined,
      stats: result,
    })
    return cancelled
  }

  private handleAgentEvent(taskId: string, event: AgentEvent): void {
    if (event.type === 'agent_start') {
      this.updateStage(taskId, 'agent', 0)
      return
    }
    if (event.type === 'tool_execution_start') {
      this.updateStage(taskId, `tool:${event.toolName}`, 0)
      return
    }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      this.options.events.publish({ type: 'task:chunk', taskId, chunk: event.assistantMessageEvent.delta })
    }
  }

  private updateStage(taskId: string, stage: string, progress: number): void {
    this.options.store.update(taskId, { stage, progress })
    this.options.events.publish({ type: 'task:stage', taskId, stage, progress })
  }
}
