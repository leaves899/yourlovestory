import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, AgentRunResult } from '../../agent/agent'
import type { LlmConfigInput } from '../../agent/llm'
import { normalizeLlmBaseUrl } from '../../agent/llm/config'
import type { ChapterGenerationStage } from '../../shared/chapterGeneration'
import type {
  CreateTaskInput,
  JsonObject,
  JsonValue,
  Task,
  TaskStore,
} from '../database'
import type { TaskEventSink } from './events'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'

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

export interface StartChapterGenerationInput {
  projectId: string
  sessionId: string
  chapterOutlineId: string
  chapterId?: string | null
  autoConfirm?: boolean
  llm: LlmConfigInput
}

export interface StartChapterPolishInput {
  projectId: string
  sessionId: string
  chapterId: string
  mode?: 'chapter' | 'paragraph'
  blockId?: string
  instruction?: string
  sourceRevisionId?: string | null
  autoApply?: boolean
  llm: LlmConfigInput
}

export interface TaskHandle {
  taskId: string
  completion: Promise<Task>
}

export interface TaskRunnerContext {
  readonly task: Task
  readonly input: StartTaskInput
  readonly signal: AbortSignal
  setStage(stage: string, progress: number): void
  emitChunk(chunk: string, stage?: string): void
  saveCheckpoint(checkpoint: JsonObject): void
  publishReview(versionId: string, required: boolean, status: 'review' | 'approved'): void
}

export interface TaskRunnerResult {
  status?: 'completed' | 'cancelled'
  result?: JsonObject
}

export interface TaskRunner {
  execute(context: TaskRunnerContext): Promise<TaskRunnerResult>
}

export interface TaskManagerOptions {
  store: TaskStore
  agentFactory: AgentFactory
  events: TaskEventSink
  runners?: Readonly<Record<string, TaskRunner>>
  now?: () => string
  createAbortController?: () => AbortController
  resolveLlmConfig?: (projectId: string, input: LlmConfigInput) => LlmConfigInput
}

function errorMessage(error: unknown): string {
  return sanitizeErrorMessage(error)
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
    ...(result.errorMessage ? { errorMessage: sanitizeErrorMessage(result.errorMessage) } : {}),
  }
}

function toPersistedInput(input: StartTaskInput): JsonObject {
  const llm: JsonObject = {
    provider: input.llm.provider ?? 'openai-compatible',
    baseUrl: input.llm.baseUrl,
    model: input.llm.model,
    ...(input.llm.credentialId === undefined ? {} : { credentialId: input.llm.credentialId }),
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

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: JsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid persisted task ${field}`)
  return value
}

function optionalNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function optionalBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function inputFromTask(task: Task): StartTaskInput {
  const llmValue = task.input.llm
  if (!isRecord(llmValue)) throw new Error(`Invalid persisted task llm: ${task.id}`)
  const request = task.input.request
  if (!isRecord(request)) throw new Error(`Invalid persisted task request: ${task.id}`)
  return {
    projectId: task.project_id,
    sessionId: requiredString(task.input.sessionId, 'sessionId'),
    taskType: requiredString(task.input.taskType, 'taskType'),
    prompt: typeof task.input.prompt === 'string' ? task.input.prompt : '',
    llm: {
      provider: typeof llmValue.provider === 'string' ? llmValue.provider : undefined,
      baseUrl: normalizeLlmBaseUrl(requiredString(llmValue.baseUrl, 'llm.baseUrl')),
      model: requiredString(llmValue.model, 'llm.model'),
      credentialId: typeof llmValue.credentialId === 'string' ? llmValue.credentialId : undefined,
      contextBudget: optionalNumber(llmValue.contextBudget),
      maxOutputTokens: optionalNumber(llmValue.maxOutputTokens),
      temperature: optionalNumber(llmValue.temperature),
      streamingEnabled: optionalBoolean(llmValue.streamingEnabled),
      maxRetries: optionalNumber(llmValue.maxRetries),
    },
    chapterId: task.chapter_id,
    input: request,
  }
}

function chapterRequest(input: StartChapterGenerationInput): JsonObject {
  return {
    project_id: input.projectId,
    chapter_outline_id: input.chapterOutlineId,
    ...(input.chapterId ? { chapter_id: input.chapterId } : {}),
    ...(input.autoConfirm === undefined ? {} : { auto_confirm: input.autoConfirm }),
  }
}

function chapterPolishRequest(input: StartChapterPolishInput): JsonObject {
  return {
    project_id: input.projectId,
    chapter_id: input.chapterId,
    mode: input.mode ?? 'chapter',
    ...(input.blockId ? { block_id: input.blockId } : {}),
    ...(input.instruction ? { instruction: input.instruction } : {}),
    ...(input.sourceRevisionId ? { source_revision_id: input.sourceRevisionId } : {}),
    ...(input.autoApply === undefined ? {} : { auto_apply: input.autoApply }),
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
    const resolvedLlm = this.options.resolveLlmConfig?.(input.projectId, input.llm) ?? input.llm
    const validatedInput: StartTaskInput = {
      ...input,
      llm: {
        ...resolvedLlm,
        baseUrl: normalizeLlmBaseUrl(resolvedLlm.baseUrl),
      },
    }
    const createInput: CreateTaskInput = {
      project_id: validatedInput.projectId,
      chapter_id: validatedInput.chapterId,
      parent_task_id: validatedInput.parentTaskId,
      task_type: validatedInput.taskType,
      input: toPersistedInput(validatedInput),
    }
    const task = this.options.store.create(createInput)
    return this.startExisting(task, validatedInput)
  }

  public startChapterGeneration(input: StartChapterGenerationInput): TaskHandle {
    return this.start({
      projectId: input.projectId,
      sessionId: input.sessionId,
      taskType: 'chapter-generation',
      prompt: '',
      llm: input.llm,
      chapterId: input.chapterId,
      input: chapterRequest(input),
    })
  }

  public startChapterPolish(input: StartChapterPolishInput): TaskHandle {
    return this.start({
      projectId: input.projectId,
      sessionId: input.sessionId,
      taskType: 'chapter-polish',
      prompt: '',
      llm: input.llm,
      chapterId: input.chapterId,
      input: chapterPolishRequest(input),
    })
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

  public listRecoverable(projectId: string): Task[] {
    return this.listByProject(projectId).filter(
      (task) =>
        (task.task_type === 'chapter-generation' || task.task_type === 'chapter-polish') &&
        (task.status === 'pending' ||
          task.status === 'running' ||
          task.status === 'cancelled' ||
          task.status === 'failed'),
    )
  }

  public resume(taskId: string): TaskHandle | null {
    const task = this.options.store.getById(taskId)
    if (!task || task.status === 'completed') return null
    const active = this.completions.get(taskId)
    if (active) return { taskId, completion: active }
    const persistedInput = inputFromTask(task)
    const resolvedLlm = this.options.resolveLlmConfig?.(task.project_id, persistedInput.llm) ?? persistedInput.llm
    const input: StartTaskInput = {
      ...persistedInput,
      llm: {
        ...resolvedLlm,
        baseUrl: normalizeLlmBaseUrl(resolvedLlm.baseUrl),
      },
    }
    const pending = this.options.store.update(taskId, {
      status: 'pending',
      stage: 'resuming',
      error_message: null,
      cancel_requested: false,
      finished_at: null,
    })
    if (!pending) return null
    return this.startExisting(pending, input)
  }

  public async wait(taskId: string): Promise<Task | null> {
    const completion = this.completions.get(taskId)
    return completion ? completion : this.options.store.getById(taskId)
  }

  public dispose(): void {
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private startExisting(task: Task, input: StartTaskInput): TaskHandle {
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

  private async execute(
    taskId: string,
    input: StartTaskInput,
    controller: AbortController,
  ): Promise<Task> {
    const runner = this.options.runners?.[input.taskType]
    if (runner) return this.executeRunner(taskId, input, controller, runner)

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
        onEvent: (event) => this.handleAgentEvent(taskId, event, input.llm.streamingEnabled !== false),
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
      if (controller.signal.aborted) return this.finishCancelled(taskId)
      return this.finishFailed(taskId, errorMessage(error))
    } finally {
      agent?.dispose()
    }
  }

  private async executeRunner(
    taskId: string,
    input: StartTaskInput,
    controller: AbortController,
    runner: TaskRunner,
  ): Promise<Task> {
    this.updateStage(taskId, 'starting', 0)
    this.options.store.update(taskId, { status: 'running', started_at: this.now() })
    const current = this.options.store.getById(taskId)
    if (!current) throw new Error(`Task not found before execution: ${taskId}`)
    const context: TaskRunnerContext = {
      task: current,
      input,
      signal: controller.signal,
      setStage: (stage, progress) => this.updateStage(taskId, stage, progress),
      emitChunk: (chunk, stage) => this.options.events.publish({ type: 'task:chunk', taskId, chunk, stage }),
      saveCheckpoint: (checkpoint) => {
        const saved = this.options.store.update(taskId, { checkpoint })
        if (!saved) throw new Error(`Task not found while saving checkpoint: ${taskId}`)
        this.options.events.publish({ type: 'task:checkpoint', taskId, checkpoint })
      },
      publishReview: (versionId, required, status) =>
        this.options.events.publish({ type: 'task:review', taskId, versionId, required, status }),
    }
    try {
      const result = await runner.execute(context)
      if (controller.signal.aborted || result.status === 'cancelled') {
        return this.finishCancelledWithResult(taskId, result.result)
      }
      const completed = this.options.store.update(taskId, {
        status: 'completed',
        stage: 'completed',
        progress: 1,
        result: result.result ?? {},
        finished_at: this.now(),
      })
      if (!completed) throw new Error(`Task not found after runner completion: ${taskId}`)
      this.options.events.publish({
        type: 'task:end',
        taskId,
        status: 'completed',
        result: completed.result ?? undefined,
      })
      return completed
    } catch (error) {
      if (controller.signal.aborted) return this.finishCancelledWithResult(taskId)
      return this.finishFailed(taskId, errorMessage(error))
    }
  }

  private finishCancelled(taskId: string, result?: AgentRunResult): Task {
    return this.finishCancelledWithResult(taskId, result ? toResult(result) : undefined, result)
  }

  private finishCancelledWithResult(
    taskId: string,
    result?: JsonObject,
    stats?: AgentRunResult,
  ): Task {
    const cancelled = this.options.store.update(taskId, {
      status: 'cancelled',
      stage: 'cancelled',
      progress: 1,
      result: result ?? null,
      cancel_requested: true,
      finished_at: this.now(),
    })
    if (!cancelled) throw new Error(`Task not found after cancellation: ${taskId}`)
    this.options.events.publish({
      type: 'task:end',
      taskId,
      status: 'cancelled',
      result: cancelled.result ?? undefined,
      stats,
    })
    return cancelled
  }

  private finishFailed(taskId: string, message: string): Task {
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
  }

  private handleAgentEvent(taskId: string, event: AgentEvent, streamingEnabled: boolean): void {
    if (event.type === 'agent_start') {
      this.updateStage(taskId, 'agent', 0)
      return
    }
    if (event.type === 'tool_execution_start') {
      this.updateStage(taskId, `tool:${event.toolName}`, 0)
      return
    }
    if (
      streamingEnabled &&
      event.type === 'message_update' &&
      event.assistantMessageEvent.type === 'text_delta'
    ) {
      this.options.events.publish({ type: 'task:chunk', taskId, chunk: event.assistantMessageEvent.delta })
    }
  }

  private updateStage(taskId: string, stage: string, progress: number): void {
    this.options.store.update(taskId, { stage, progress })
    this.options.events.publish({ type: 'task:stage', taskId, stage, progress })
  }
}

export type { ChapterGenerationStage }
