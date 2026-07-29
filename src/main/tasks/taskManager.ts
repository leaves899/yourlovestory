import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AgentFactory, AgentRunResult } from '../../agent/agent'
import type { LlmConfigInput } from '../../agent/llm'
import { normalizeLlmBaseUrl } from '../../agent/llm/config'
import type { ChapterGenerationStage } from '../../shared/chapterGeneration'
import {
  buildIdempotencyKey,
  classifyTaskRecovery,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_RECOVERY_ATTEMPTS,
  DEFAULT_TASK_TIMEOUT_MS,
  readRequestField,
  RECOVERY_METADATA_VERSION,
  STARTUP_RECOVERY_CONCURRENCY,
  type ExecutionPhase,
  type RecoverableTaskView,
  type RecoveryDecision,
  type RecoveryScanResult,
  type RuntimeSessionRecord,
} from '../../shared/taskRecovery'
import type {
  CreateTaskInput,
  JsonObject,
  JsonValue,
  Task,
  TaskStore,
} from '../database'
import type { RuntimeSessionRepository } from '../database/repositories/runtimeSessionRepository'
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
  setExecutionPhase(phase: ExecutionPhase): void
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

export interface TaskRecoveryLookups {
  projectExists(projectId: string): boolean
  targetExists(task: Task): boolean
  hasChapterVersionForTask(taskId: string): boolean
  hasChapterRevisionForTask(taskId: string): boolean
  credentialAvailable(projectId: string): boolean
}

export interface TaskManagerOptions {
  store: TaskStore
  agentFactory: AgentFactory
  events: TaskEventSink
  runners?: Readonly<Record<string, TaskRunner>>
  now?: () => string
  createAbortController?: () => AbortController
  resolveLlmConfig?: (projectId: string, input: LlmConfigInput) => LlmConfigInput
  validateChapterGeneration?: (input: StartChapterGenerationInput) => void
  recoveryLookups?: TaskRecoveryLookups
  runtimeSessions?: RuntimeSessionRepository
  appInstanceId?: string
  leaseMs?: number
  taskTimeoutMs?: number
  startupConcurrency?: number
  ownerId?: string
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

/**
 * Persist only non-secret LLM endpoint metadata.
 * Never store API keys, credential secrets, or resolved credentialId.
 */
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

function resultChapterId(result: JsonObject | undefined): string | undefined {
  return typeof result?.chapter_id === 'string' && result.chapter_id.trim()
    ? result.chapter_id
    : undefined
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
      // Ignore any legacy credentialId in persisted input.
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

function addMs(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString()
}

export class TaskManager {
  private readonly controllers = new Map<string, AbortController>()
  private readonly completions = new Map<string, Promise<Task>>()
  private readonly now: () => string
  private readonly createAbortController: () => AbortController
  private readonly ownerId: string
  private readonly appInstanceId: string
  private readonly leaseMs: number
  private readonly taskTimeoutMs: number
  private readonly startupConcurrency: number
  private quitting = false
  private runtimeSession: RuntimeSessionRecord | null = null
  private recoveryGateOpen = true

  public constructor(private readonly options: TaskManagerOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.createAbortController = options.createAbortController ?? (() => new AbortController())
    this.ownerId = options.ownerId ?? randomUUID()
    this.appInstanceId = options.appInstanceId ?? randomUUID()
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
    this.startupConcurrency = options.startupConcurrency ?? STARTUP_RECOVERY_CONCURRENCY
  }

  public beginRuntimeSession(): RuntimeSessionRecord | null {
    if (!this.options.runtimeSessions) return null
    // Previous open sessions without graceful end are treated as crashes.
    this.options.runtimeSessions.markOpenSessionsAsCrashed(this.now())
    this.runtimeSession = this.options.runtimeSessions.start({
      owner: this.ownerId,
      appInstanceId: this.appInstanceId,
      startedAt: this.now(),
    })
    this.recoveryGateOpen = true
    this.quitting = false
    return this.runtimeSession
  }

  public setRecoveryGateOpen(open: boolean): void {
    this.recoveryGateOpen = open
  }

  public isQuitting(): boolean {
    return this.quitting
  }

  public start(input: StartTaskInput): TaskHandle {
    this.assertCanStartTasks()
    const resolvedLlm = this.resolveCurrentCredential(input.projectId, input.llm)
    const validatedInput: StartTaskInput = {
      ...input,
      llm: {
        ...resolvedLlm,
        baseUrl: normalizeLlmBaseUrl(resolvedLlm.baseUrl),
      },
    }
    const timestamp = this.now()
    const provisionalId = randomUUID()
    const rootId = provisionalId
    const logicalTarget = this.logicalTargetFor(validatedInput)
    const createInput: CreateTaskInput = {
      id: provisionalId,
      project_id: validatedInput.projectId,
      chapter_id: validatedInput.chapterId,
      parent_task_id: validatedInput.parentTaskId,
      task_type: validatedInput.taskType,
      input: toPersistedInput(validatedInput),
      idempotency_key: buildIdempotencyKey(
        validatedInput.taskType,
        validatedInput.projectId,
        logicalTarget,
        rootId,
      ),
      recovery_root_task_id: rootId,
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      max_recovery_attempts: DEFAULT_MAX_RECOVERY_ATTEMPTS,
      timeout_at: addMs(timestamp, this.taskTimeoutMs),
      runtime_session_id: this.runtimeSession?.id ?? null,
      execution_phase: 'queued',
      checkpoint_schema_version: this.defaultCheckpointSchema(validatedInput.taskType),
    }
    const task = this.options.store.create(createInput)
    return this.startExisting(task, validatedInput)
  }

  public startChapterGeneration(input: StartChapterGenerationInput): TaskHandle {
    this.assertCanStartTasks()
    const conflicting = this.options.store.listByProject(input.projectId).find((task) =>
      task.task_type === 'chapter-generation' &&
      (task.status === 'pending' || task.status === 'running'),
    )
    if (conflicting) {
      throw new Error(`Chapter generation task is already running: ${conflicting.id}`)
    }
    this.options.validateChapterGeneration?.(input)
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
    this.assertCanStartTasks()
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
    this.options.store.update(taskId, {
      recovery_classification: 'manual-retry-required',
      recovery_reason: '任务已取消，禁止自动恢复；如需继续请人工确认后重试。',
      recovery_action: 'manual-confirm',
      execution_phase: 'cancelled',
    })
    return true
  }

  public get(taskId: string): Task | null {
    return this.options.store.getById(taskId)
  }

  public listByProject(projectId: string): Task[] {
    return this.options.store.listByProject(projectId)
  }

  public classify(task: Task): RecoveryDecision {
    return this.classifyInternal(task)
  }

  public listRecoverable(projectId: string): RecoverableTaskView[] {
    return this.listByProject(projectId)
      .filter(
        (task) =>
          task.status === 'pending'
          || task.status === 'running'
          || task.status === 'failed'
          || task.status === 'cancelled',
      )
      .map((task) => this.toRecoverableView(task))
      .filter((view) =>
        view.recovery_classification !== null
        && view.recovery_classification !== 'non-recoverable'
        || view.status === 'failed'
        || view.status === 'cancelled'
        || view.status === 'pending'
        || view.status === 'running',
      )
      .filter((view) =>
        view.task_type === 'chapter-generation'
        || view.task_type === 'chapter-polish'
        || view.manual_retry_allowed
        || view.auto_allowed
        || view.recovery_classification === 'manual-retry-required'
        || view.recovery_classification === 'non-recoverable',
      )
  }

  /**
   * Safe resume entry for auto-allowed classifications only.
   * Manual-retry-required tasks must use manualRetry({ confirmed: true }).
   */
  public resume(taskId: string): TaskHandle | null {
    this.assertCanStartTasks()
    const task = this.options.store.getById(taskId)
    if (!task || task.status === 'completed') return null
    const active = this.completions.get(taskId)
    if (active) return { taskId, completion: active }

    const decision = this.persistClassification(task)
    if (!decision.autoAllowed && !decision.manualRetryAllowed) return null
    if (!decision.autoAllowed) {
      throw new Error(
        decision.reason || '该任务需要人工确认后才能重试，请使用明确的人工重试入口。',
      )
    }
    return this.claimAndStart(taskId, {
      allowedClassifications: ['resumable', 'restartable'],
      incrementAttempt: true,
    })
  }

  /**
   * Explicit user-confirmed manual retry. Requires confirmed: true.
   */
  public manualRetry(taskId: string, confirmed: true): TaskHandle | null {
    if (confirmed !== true) {
      throw new Error('manual retry requires explicit confirmation')
    }
    this.assertCanStartTasks()
    const task = this.options.store.getById(taskId)
    if (!task || task.status === 'completed') return null
    const active = this.completions.get(taskId)
    if (active) return { taskId, completion: active }

    const decision = this.persistClassification(task)
    if (!decision.manualRetryAllowed) {
      throw new Error(decision.reason || '该任务不可重试。')
    }

    // Allow claim even for manual-retry-required after user confirmation.
    this.options.store.update(taskId, {
      recovery_classification: decision.classification === 'non-recoverable'
        ? 'non-recoverable'
        : 'restartable',
      recovery_reason: decision.reason,
      recovery_action: 'manual-retry',
      shutdown_kind: null,
      error_message: null,
      cancel_requested: false,
      finished_at: null,
      status: task.status === 'failed' || task.status === 'cancelled' ? 'pending' : task.status,
      execution_phase: 'queued',
    })

    if (decision.classification === 'non-recoverable') {
      throw new Error(decision.reason || '该任务不可恢复。')
    }

    return this.claimAndStart(taskId, {
      allowedClassifications: ['resumable', 'restartable', 'manual-retry-required'],
      incrementAttempt: true,
      bypassAttemptLimit: true,
    })
  }

  public async scanAndRecoverOnStartup(): Promise<RecoveryScanResult> {
    const result: RecoveryScanResult = {
      scanned: 0,
      claimed: 0,
      skipped: 0,
      autoStarted: 0,
      failed: 0,
      decisions: [],
    }
    if (!this.recoveryGateOpen || this.quitting) {
      return result
    }

    this.options.store.expireLeases(this.now())
    // Mark incomplete tasks from previous sessions as crash unless graceful.
    const candidates = this.options.store.listRecoveryCandidates()
    result.scanned = candidates.length

    for (const task of candidates) {
      if (task.shutdown_kind !== 'graceful' && task.status === 'running') {
        this.options.store.update(task.id, { shutdown_kind: 'crash' })
      }
      const refreshed = this.options.store.getById(task.id) ?? task
      const decision = this.persistClassification(refreshed)
      result.decisions.push({
        taskId: refreshed.id,
        classification: decision.classification,
        reason: decision.reason,
        action: decision.action,
      })
    }

    const autoCandidates = this.options.store
      .listRecoveryCandidates()
      .filter((task) => {
        const decision = this.classifyInternal(task)
        return decision.autoAllowed
      })

    let index = 0
    const workers = Array.from(
      { length: Math.max(1, this.startupConcurrency) },
      async () => {
        while (index < autoCandidates.length) {
          const current = autoCandidates[index]
          index += 1
          if (!current) break
          try {
            const handle = this.claimAndStart(current.id, {
              allowedClassifications: ['resumable', 'restartable'],
              incrementAttempt: true,
            })
            if (handle) {
              result.claimed += 1
              result.autoStarted += 1
              void handle.completion.catch(() => {
                result.failed += 1
              })
            } else {
              result.skipped += 1
            }
          } catch {
            result.skipped += 1
          }
        }
      },
    )
    await Promise.all(workers)
    return result
  }

  public beginGracefulShutdown(): void {
    this.quitting = true
    this.recoveryGateOpen = false
    const timestamp = this.now()
    for (const controller of this.controllers.values()) controller.abort()
    this.options.store.markGracefulShutdown(timestamp, this.runtimeSession?.id ?? null)
    if (this.runtimeSession && this.options.runtimeSessions) {
      this.options.runtimeSessions.end(this.runtimeSession.id, 'graceful', timestamp)
    }
  }

  public async wait(taskId: string): Promise<Task | null> {
    const completion = this.completions.get(taskId)
    return completion ? completion : this.options.store.getById(taskId)
  }

  public dispose(): void {
    if (!this.quitting) {
      this.beginGracefulShutdown()
    }
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
  }

  private claimAndStart(
    taskId: string,
    options: {
      allowedClassifications: ReadonlyArray<'resumable' | 'restartable' | 'manual-retry-required'>
      incrementAttempt: boolean
      bypassAttemptLimit?: boolean
    },
  ): TaskHandle | null {
    const active = this.completions.get(taskId)
    if (active) return { taskId, completion: active }

    const nowIso = this.now()
    const leaseToken = randomUUID()
    const claim = this.options.store.claimForRecovery({
      taskId,
      owner: this.ownerId,
      leaseToken,
      leaseExpiresAt: addMs(nowIso, this.leaseMs),
      nowIso,
      allowedClassifications: options.allowedClassifications,
      incrementAttempt: options.incrementAttempt,
      bypassAttemptLimit: options.bypassAttemptLimit === true,
      runtimeSessionId: this.runtimeSession?.id ?? null,
    })
    if (!claim.claimed || !claim.task) return null

    let input: StartTaskInput
    try {
      const persisted = inputFromTask(claim.task)
      const resolvedLlm = this.resolveCurrentCredential(claim.task.project_id, persisted.llm)
      input = {
        ...persisted,
        llm: {
          ...resolvedLlm,
          baseUrl: normalizeLlmBaseUrl(resolvedLlm.baseUrl),
        },
      }
    } catch (error) {
      this.options.store.update(taskId, {
        status: 'failed',
        stage: 'failed',
        error_message: errorMessage(error),
        last_recovery_error: errorMessage(error),
        recovery_classification: 'manual-retry-required',
        recovery_reason: '无法从当前项目配置解析凭据或任务输入。',
        recovery_action: 'manual-confirm',
        finished_at: this.now(),
      })
      this.options.store.releaseLease(taskId, leaseToken, this.now())
      return null
    }

    this.options.store.update(taskId, {
      status: 'running',
      stage: 'resuming',
      error_message: null,
      cancel_requested: false,
      finished_at: null,
      execution_phase: 'preparing',
    })
    const refreshed = this.options.store.getById(taskId)
    if (!refreshed) return null
    return this.startExisting(refreshed, input, leaseToken)
  }

  private startExisting(
    task: Task,
    input: StartTaskInput,
    leaseToken?: string,
  ): TaskHandle {
    const controller = this.createAbortController()
    this.controllers.set(task.id, controller)
    this.options.events.publish({ type: 'task:start', task })

    const completion = this.execute(task.id, input, controller, leaseToken).finally(() => {
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
    leaseToken?: string,
  ): Promise<Task> {
    const runner = this.options.runners?.[input.taskType]
    try {
      if (runner) return await this.executeRunner(taskId, input, controller, runner)

      this.updateStage(taskId, 'starting', 0)
      this.setExecutionPhase(taskId, 'preparing')
      this.options.store.update(taskId, { status: 'running', started_at: this.now() })

      let agent: Awaited<ReturnType<AgentFactory['create']>> | undefined
      try {
        this.setExecutionPhase(taskId, 'awaiting_model')
        agent = await this.options.agentFactory.create({
          projectId: input.projectId,
          sessionId: input.sessionId,
          llm: input.llm,
          systemPrompt: input.systemPrompt,
        })
        this.setExecutionPhase(taskId, 'model_in_flight')
        const result = await agent.prompt(input.prompt, {
          signal: controller.signal,
          onEvent: (event) => this.handleAgentEvent(taskId, event, input.llm.streamingEnabled !== false),
        })

        if (controller.signal.aborted || result.finishReason === 'aborted') {
          return this.finishCancelled(taskId, result)
        }
        this.setExecutionPhase(taskId, 'persisting_result')
        const completed = this.options.store.update(taskId, {
          status: 'completed',
          stage: 'completed',
          progress: 1,
          result: toResult(result),
          finished_at: this.now(),
          execution_phase: 'completed',
          recovery_classification: null,
          recovery_reason: null,
          recovery_action: 'none',
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
    } finally {
      if (leaseToken) {
        this.options.store.releaseLease(taskId, leaseToken, this.now())
      }
    }
  }

  private async executeRunner(
    taskId: string,
    input: StartTaskInput,
    controller: AbortController,
    runner: TaskRunner,
  ): Promise<Task> {
    this.updateStage(taskId, 'starting', 0)
    this.setExecutionPhase(taskId, 'preparing')
    this.options.store.update(taskId, { status: 'running', started_at: this.now() })
    const current = this.options.store.getById(taskId)
    if (!current) throw new Error(`Task not found before execution: ${taskId}`)
    const context: TaskRunnerContext = {
      task: current,
      input,
      signal: controller.signal,
      setStage: (stage, progress) => this.updateStage(taskId, stage, progress),
      setExecutionPhase: (phase) => this.setExecutionPhase(taskId, phase),
      emitChunk: (chunk, stage) => this.options.events.publish({ type: 'task:chunk', taskId, chunk, stage }),
      saveCheckpoint: (checkpoint) => {
        const schemaVersion = typeof checkpoint.schema_version === 'number'
          ? checkpoint.schema_version
          : null
        const saved = this.options.store.update(taskId, {
          checkpoint,
          checkpoint_schema_version: schemaVersion ?? current.checkpoint_schema_version,
        })
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
      this.setExecutionPhase(taskId, 'finalizing')
      const completed = this.options.store.update(taskId, {
        chapter_id: resultChapterId(result.result),
        status: 'completed',
        stage: 'completed',
        progress: 1,
        result: result.result ?? {},
        finished_at: this.now(),
        execution_phase: 'completed',
        recovery_classification: null,
        recovery_reason: null,
        recovery_action: 'none',
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
      execution_phase: 'cancelled',
      recovery_classification: 'manual-retry-required',
      recovery_reason: '任务已取消，禁止自动恢复；如需继续请人工确认后重试。',
      recovery_action: 'manual-confirm',
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
      execution_phase: 'failed',
      last_recovery_error: message,
    })
    if (!failed) throw new Error(`Task not found after failure: ${taskId}`)
    this.persistClassification(failed)
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

  private setExecutionPhase(taskId: string, phase: ExecutionPhase): void {
    this.options.store.update(taskId, { execution_phase: phase })
  }

  private resolveCurrentCredential(projectId: string, input: LlmConfigInput): LlmConfigInput {
    // Always re-resolve via current project config; never trust stored credentialId.
    const withoutCredential: LlmConfigInput = {
      ...input,
      credentialId: undefined,
    }
    return this.options.resolveLlmConfig?.(projectId, withoutCredential) ?? withoutCredential
  }

  private assertCanStartTasks(): void {
    if (this.quitting) {
      throw new Error('应用正在退出，禁止启动或恢复任务。')
    }
    if (!this.recoveryGateOpen) {
      throw new Error('恢复门禁未打开，禁止启动或恢复业务任务。')
    }
  }

  private defaultCheckpointSchema(taskType: string): number | null {
    if (taskType === 'chapter-generation') return 1
    if (taskType === 'chapter-polish') return 1
    return null
  }

  private logicalTargetFor(input: StartTaskInput): string {
    if (input.taskType === 'chapter-generation') {
      const outlineId = input.input && typeof input.input.chapter_outline_id === 'string'
        ? input.input.chapter_outline_id
        : 'unknown-outline'
      return outlineId
    }
    if (input.taskType === 'chapter-polish') {
      const chapterId = input.input && typeof input.input.chapter_id === 'string'
        ? input.input.chapter_id
        : input.chapterId ?? 'unknown-chapter'
      return chapterId
    }
    return input.sessionId
  }

  private classifyInternal(task: Task): RecoveryDecision {
    const lookups = this.options.recoveryLookups
    const projectExists = lookups?.projectExists(task.project_id) ?? true
    const targetExists = lookups?.targetExists(task) ?? true
    const hasChapterVersionForTask = lookups?.hasChapterVersionForTask(task.id) ?? false
    const hasChapterRevisionForTask = lookups?.hasChapterRevisionForTask(task.id) ?? false
    let credentialAvailable = true
    if (lookups) {
      try {
        credentialAvailable = lookups.credentialAvailable(task.project_id)
      } catch {
        credentialAvailable = false
      }
    }
    return classifyTaskRecovery({
      id: task.id,
      project_id: task.project_id,
      chapter_id: task.chapter_id,
      task_type: task.task_type,
      status: task.status,
      stage: task.stage,
      progress: task.progress,
      input: task.input,
      checkpoint: task.checkpoint,
      result: task.result,
      error_message: task.error_message,
      cancel_requested: task.cancel_requested,
      execution_phase: task.execution_phase,
      recovery_attempt_count: task.recovery_attempt_count,
      max_recovery_attempts: task.max_recovery_attempts,
      recovery_metadata_version: task.recovery_metadata_version,
      checkpoint_schema_version: task.checkpoint_schema_version,
      shutdown_kind: task.shutdown_kind,
      timeout_at: task.timeout_at,
      nowIso: this.now(),
      projectExists,
      targetExists,
      hasChapterVersionForTask,
      hasChapterRevisionForTask,
      credentialAvailable,
      recoveryGateOpen: this.recoveryGateOpen && !this.quitting,
    })
  }

  private persistClassification(task: Task): RecoveryDecision {
    const decision = this.classifyInternal(task)
    this.options.store.update(task.id, {
      recovery_classification: decision.classification,
      recovery_reason: decision.reason,
      recovery_action: decision.action,
    })
    return decision
  }

  private toRecoverableView(task: Task): RecoverableTaskView {
    const decision = this.classifyInternal(task)
    return {
      id: task.id,
      project_id: task.project_id,
      chapter_id: task.chapter_id,
      parent_task_id: task.parent_task_id,
      recovery_root_task_id: task.recovery_root_task_id,
      task_type: task.task_type,
      status: task.status,
      stage: task.stage,
      progress: task.progress,
      execution_phase: task.execution_phase,
      recovery_classification: decision.classification,
      recovery_reason: decision.reason,
      recovery_action: decision.action,
      recovery_attempt_count: task.recovery_attempt_count,
      max_recovery_attempts: task.max_recovery_attempts,
      last_recovery_attempt_at: task.last_recovery_attempt_at,
      last_recovery_error: task.last_recovery_error,
      idempotency_key: task.idempotency_key,
      checkpoint_schema_version: task.checkpoint_schema_version,
      lease_owner: task.lease_owner,
      lease_expires_at: task.lease_expires_at,
      timeout_at: task.timeout_at,
      shutdown_kind: task.shutdown_kind,
      cancel_requested: task.cancel_requested,
      error_message: task.error_message,
      started_at: task.started_at,
      finished_at: task.finished_at,
      created_at: task.created_at,
      updated_at: task.updated_at,
      auto_allowed: decision.autoAllowed,
      manual_retry_allowed: decision.manualRetryAllowed,
    }
  }
}

export type { ChapterGenerationStage }
export { readRequestField }
