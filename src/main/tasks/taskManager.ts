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
  DEFAULT_LEASE_RENEW_MS,
  DEFAULT_MAX_RECOVERY_ATTEMPTS,
  DEFAULT_QUIESCE_TIMEOUT_MS,
  DEFAULT_TASK_TIMEOUT_MS,
  readRequestField,
  RECOVERY_METADATA_VERSION,
  STARTUP_RECOVERY_CONCURRENCY,
  TASK_CORRUPTION_REASON,
  TIMEOUT_RECOVERY_REASON,
  type ExecutionPhase,
  type RecoverableTaskView,
  type RecoveryAttemptOutcome,
  type RecoveryDecision,
  type RecoveryScanResult,
  type RuntimeSessionRecord,
} from '../../shared/taskRecovery'
import type {
  CreateTaskInput,
  JsonObject,
  JsonValue,
  LeaseFence,
  Task,
  TaskStore,
  UpdateTaskInput,
} from '../database'
import { TaskLeaseLostError } from '../database'
import type { RecoveryAttemptRepository } from '../database/repositories/recoveryAttemptRepository'
import type { RuntimeSessionRepository } from '../database/repositories/runtimeSessionRepository'
import type { TaskEventSink } from './events'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'
import {
  assertNoSensitiveTaskInput,
  assertSafePersistedString,
  assertSafePersistedBaseUrl,
  assertSafeTaskStartSecrets,
  assertSupportedPersistedProvider,
  assertSupportedPersistedTaskType,
} from './sensitiveInput'
import type { QuiesceResult } from '../database/shutdown'

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
  /** Throws when the current owner no longer holds the execution lease. */
  assertStillOwnsExecution(): void
  /**
   * Executes synchronous durable side effects in the same SQLite transaction
   * as the lease ownership check.
   */
  runOwnedSideEffect<T>(operation: () => T): T
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

export class NonRecoverableTaskError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'NonRecoverableTaskError'
  }
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
  recoveryAttempts?: RecoveryAttemptRepository
  appInstanceId?: string
  leaseMs?: number
  leaseRenewMs?: number
  taskTimeoutMs?: number
  startupConcurrency?: number
  ownerId?: string
  quiesceTimeoutMs?: number
  /** Injectable timer hooks for deterministic timeout tests. */
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
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
 * Persist only recovery-needed, non-secret fields.
 * Memory-only prompt/request details are not durable by default.
 */
function minimizePersistedRequest(
  taskType: string,
  request: JsonObject | undefined,
): JsonObject {
  if (!request) return {}
  if (taskType === 'chapter-generation') {
    const out: JsonObject = {}
    if (typeof request.project_id === 'string') out.project_id = request.project_id
    if (typeof request.chapter_outline_id === 'string') {
      out.chapter_outline_id = request.chapter_outline_id
    }
    if (typeof request.chapter_id === 'string') out.chapter_id = request.chapter_id
    if (typeof request.auto_confirm === 'boolean') out.auto_confirm = request.auto_confirm
    return out
  }
  if (taskType === 'chapter-polish') {
    const out: JsonObject = {}
    if (typeof request.project_id === 'string') out.project_id = request.project_id
    if (typeof request.chapter_id === 'string') out.chapter_id = request.chapter_id
    if (request.mode === 'chapter' || request.mode === 'paragraph') out.mode = request.mode
    if (typeof request.block_id === 'string') out.block_id = request.block_id
    if (typeof request.instruction === 'string') out.instruction = request.instruction
    if (typeof request.source_revision_id === 'string') {
      out.source_revision_id = request.source_revision_id
    }
    if (typeof request.auto_apply === 'boolean') out.auto_apply = request.auto_apply
    return out
  }
  // Generic / unsupported recovery types: persist nothing from request.
  return {}
}

function toPersistedInput(input: StartTaskInput): JsonObject {
  assertSafeTaskStartSecrets({
    prompt: input.prompt,
    input: input.input,
    llm: input.llm,
  })
  assertSafePersistedBaseUrl(input.llm.baseUrl)
  const provider = input.llm.provider ?? 'openai-compatible'
  assertSupportedPersistedTaskType(input.taskType)
  assertSupportedPersistedProvider(provider)
  assertSafePersistedString(input.sessionId, 'sessionId', 256)
  assertSafePersistedString(input.llm.model, 'llm.model', 512)
  const llm: JsonObject = {
    provider,
    baseUrl: input.llm.baseUrl,
    model: input.llm.model,
    ...(input.llm.contextBudget === undefined ? {} : { contextBudget: input.llm.contextBudget }),
    ...(input.llm.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.llm.maxOutputTokens }),
    ...(input.llm.temperature === undefined ? {} : { temperature: input.llm.temperature }),
    ...(input.llm.streamingEnabled === undefined ? {} : { streamingEnabled: input.llm.streamingEnabled }),
    ...(input.llm.maxRetries === undefined ? {} : { maxRetries: input.llm.maxRetries }),
  }
  const persisted: JsonObject = {
    // Prompt is not required for crash recovery and must not carry secrets.
    prompt: '',
    sessionId: input.sessionId,
    taskType: input.taskType,
    llm,
    request: minimizePersistedRequest(input.taskType, input.input),
  }
  assertNoSensitiveTaskInput(persisted, 'task.input')
  return persisted
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
  assertNoSensitiveTaskInput(task.input, 'task.input')
  const llmValue = task.input.llm
  if (!isRecord(llmValue)) throw new Error(`Invalid persisted task llm: ${task.id}`)
  const request = task.input.request
  if (!isRecord(request)) throw new Error(`Invalid persisted task request: ${task.id}`)
  assertNoSensitiveTaskInput(request, 'request')
  const sessionId = requiredString(task.input.sessionId, 'sessionId')
  const taskType = requiredString(task.input.taskType, 'taskType')
  const provider = typeof llmValue.provider === 'string' ? llmValue.provider : 'openai-compatible'
  const model = requiredString(llmValue.model, 'llm.model')
  assertSupportedPersistedTaskType(taskType)
  assertSupportedPersistedProvider(provider)
  assertSafePersistedString(sessionId, 'sessionId', 256)
  assertSafePersistedString(model, 'llm.model', 512)
  return {
    projectId: task.project_id,
    sessionId,
    taskType,
    prompt: typeof task.input.prompt === 'string' ? task.input.prompt : '',
    llm: {
      provider,
      baseUrl: normalizeLlmBaseUrl(requiredString(llmValue.baseUrl, 'llm.baseUrl')),
      model,
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

function msUntil(deadlineIso: string, nowIso: string): number {
  return Math.max(0, new Date(deadlineIso).getTime() - new Date(nowIso).getTime())
}

export class TaskManager {
  private readonly controllers = new Map<string, AbortController>()
  private readonly completions = new Map<string, Promise<Task>>()
  private readonly timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly leaseTimers = new Map<string, ReturnType<typeof setInterval>>()
  private readonly attemptIds = new Map<string, string>()
  private readonly leaseTokens = new Map<string, string>()
  private readonly timeoutFlags = new Set<string>()
  private readonly lostLeaseFlags = new Set<string>()
  private readonly now: () => string
  private readonly createAbortController: () => AbortController
  private readonly ownerId: string
  private readonly appInstanceId: string
  private readonly leaseMs: number
  private readonly leaseRenewMs: number
  private readonly taskTimeoutMs: number
  private readonly startupConcurrency: number
  private readonly quiesceTimeoutMs: number
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout
  private readonly setIntervalFn: typeof setInterval
  private readonly clearIntervalFn: typeof clearInterval
  private quitting = false
  private runtimeSession: RuntimeSessionRecord | null = null
  private recoveryGateOpen = true

  public constructor(private readonly options: TaskManagerOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
    this.createAbortController = options.createAbortController ?? (() => new AbortController())
    this.ownerId = options.ownerId ?? randomUUID()
    this.appInstanceId = options.appInstanceId ?? randomUUID()
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
    this.leaseRenewMs = options.leaseRenewMs ?? DEFAULT_LEASE_RENEW_MS
    this.taskTimeoutMs = options.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS
    this.startupConcurrency = options.startupConcurrency ?? STARTUP_RECOVERY_CONCURRENCY
    this.quiesceTimeoutMs = options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
    this.setIntervalFn = options.setIntervalFn ?? setInterval
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval
  }

  public beginRuntimeSession(): RuntimeSessionRecord | null {
    if (!this.options.runtimeSessions) return null
    this.runtimeSession = this.options.runtimeSessions.reconcileCrashedAndStart({
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

  public hasActiveWork(): boolean {
    return this.completions.size > 0 || this.controllers.size > 0
  }

  /**
   * Credential rotation / invalidation path: abort in-flight agents without
   * permanently disabling TaskManager. New tasks remain startable afterwards.
   */
  public invalidateActiveRuntimes(): void {
    for (const controller of this.controllers.values()) {
      controller.abort()
    }
  }

  public start(input: StartTaskInput): TaskHandle {
    this.assertCanStartTasks()
    assertSafePersistedString(input.projectId, 'projectId', 256)
    assertSafePersistedString(input.sessionId, 'sessionId', 256)
    if (input.chapterId) assertSafePersistedString(input.chapterId, 'chapterId', 256)
    if (input.parentTaskId) assertSafePersistedString(input.parentTaskId, 'parentTaskId', 256)
    assertSupportedPersistedTaskType(input.taskType)
    assertSafeTaskStartSecrets({
      prompt: input.prompt,
      input: input.input,
      llm: input.llm,
    })
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
    const idempotencyKey = buildIdempotencyKey(
      validatedInput.taskType,
      validatedInput.projectId,
      logicalTarget,
    )
    assertSafePersistedString(idempotencyKey, 'idempotencyKey', 1024)
    const createInput: CreateTaskInput = {
      id: provisionalId,
      project_id: validatedInput.projectId,
      chapter_id: validatedInput.chapterId,
      parent_task_id: validatedInput.parentTaskId,
      task_type: validatedInput.taskType,
      input: toPersistedInput(validatedInput),
      idempotency_key: idempotencyKey,
      recovery_root_task_id: rootId,
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      max_recovery_attempts: DEFAULT_MAX_RECOVERY_ATTEMPTS,
      timeout_at: addMs(timestamp, this.taskTimeoutMs),
      runtime_session_id: this.runtimeSession?.id ?? null,
      execution_phase: 'queued',
      checkpoint_schema_version: this.defaultCheckpointSchema(validatedInput.taskType),
    }
    const task = this.options.store.create(createInput)
    // Own a DB lease for the full execution so long runs cannot be claimed elsewhere.
    const leaseToken = randomUUID()
    const leased = this.options.store.update(task.id, {
      status: 'running',
      lease_owner: this.ownerId,
      lease_token: leaseToken,
      lease_expires_at: addMs(timestamp, this.leaseMs),
      runtime_session_id: this.runtimeSession?.id ?? task.runtime_session_id,
    })
    return this.startExisting(leased ?? task, validatedInput, leaseToken)
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
    const nowIso = this.now()
    return this.listByProject(projectId)
      .filter((task) => this.isRecoveryUiCandidate(task, nowIso))
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

  /** Recovery UI excludes local completions and every unexpired claimed lease. */
  private isRecoveryUiCandidate(task: Task, nowIso: string): boolean {
    if (
      task.status !== 'pending'
      && task.status !== 'running'
      && task.status !== 'failed'
      && task.status !== 'cancelled'
    ) {
      return false
    }
    if (this.completions.has(task.id)) return false
    if (
      task.lease_token
      && task.lease_expires_at
      && task.lease_expires_at > nowIso
    ) {
      return false
    }
    return true
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
      kind: 'auto',
      allowedClassifications: ['resumable', 'restartable'],
      incrementAttempt: true,
      timeoutAt: addMs(this.now(), this.taskTimeoutMs),
    })
  }

  /**
   * Explicit user-confirmed manual retry.
   * State transition + lease claim happen in one conditional transaction.
   * Shares the same attempt ceiling as automatic recovery.
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
    if (decision.classification === 'non-recoverable') {
      throw new Error(decision.reason || '该任务不可恢复。')
    }

    return this.claimAndStart(taskId, {
      kind: 'manual',
      allowedClassifications: ['resumable', 'restartable', 'manual-retry-required'],
      incrementAttempt: true,
      manualConfirmed: true,
      timeoutAt: addMs(this.now(), this.taskTimeoutMs),
    })
  }

  public async scanAndRecoverOnStartup(): Promise<RecoveryScanResult> {
    const result: RecoveryScanResult = {
      scanned: 0,
      claimed: 0,
      skipped: 0,
      autoStarted: 0,
      failed: 0,
      terminated: 0,
      decisions: [],
    }
    if (!this.recoveryGateOpen || this.quitting) {
      return result
    }

    this.options.store.expireLeases(this.now())
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

      if (
        decision.classification === 'non-recoverable'
        && refreshed.status !== 'completed'
        && !(
          refreshed.status === 'failed'
          && refreshed.recovery_classification === 'non-recoverable'
          && refreshed.finished_at
        )
      ) {
        const terminal = this.options.store.markTerminalNonRecoverable(
          refreshed.id,
          decision.reason,
          this.now(),
        )
        if (terminal) result.terminated += 1
      }
    }

    const autoCandidates = this.options.store
      .listRecoveryCandidates()
      .filter((task) => {
        const decision = this.classifyInternal(task)
        return decision.autoAllowed
      })

    const cursor = { index: 0 }
    const workers = Array.from(
      { length: Math.max(1, this.startupConcurrency) },
      () => this.runStartupRecoveryWorker(autoCandidates, cursor, result),
    )
    await Promise.all(workers)
    return result
  }

  private async runStartupRecoveryWorker(
    autoCandidates: readonly Task[],
    cursor: { index: number },
    result: RecoveryScanResult,
  ): Promise<void> {
    while (cursor.index < autoCandidates.length) {
      const current = autoCandidates[cursor.index]
      cursor.index += 1
      if (!current) break
      try {
        const handle = this.claimAndStart(current.id, {
          kind: 'auto',
          allowedClassifications: ['resumable', 'restartable'],
          incrementAttempt: true,
          timeoutAt: addMs(this.now(), this.taskTimeoutMs),
        })
        if (!handle) {
          result.skipped += 1
          continue
        }
        result.claimed += 1
        result.autoStarted += 1
        if (await this.recoveryFailed(handle)) result.failed += 1
      } catch {
        result.skipped += 1
      }
    }
  }

  private async recoveryFailed(handle: TaskHandle): Promise<boolean> {
    try {
      const finished = await handle.completion
      return finished.status === 'failed'
    } catch {
      return true
    }
  }

  public beginGracefulShutdown(): void {
    this.quitting = true
    this.recoveryGateOpen = false
    const timestamp = this.now()
    for (const controller of this.controllers.values()) controller.abort()
    this.options.store.markGracefulShutdown(timestamp, this.runtimeSession?.id ?? null)
  }

  /**
   * Restore task admission after a coordinated shutdown stopped before DB close.
   * Existing aborted executions remain lease-fenced and must settle independently.
   */
  public resumeAfterAbortedShutdown(): void {
    if (this.runtimeSession?.ended_at && this.options.runtimeSessions) {
      this.beginRuntimeSession()
      return
    }
    this.quitting = false
    this.recoveryGateOpen = true
  }

  /**
   * Coordinated quiesce: forbid new work, abort, wait for active completions.
   * Returns drained=true only when every completion settled. Callers must not
   * close/replace the DB when drained=false.
   */
  public async quiesceForShutdown(timeoutMs = this.quiesceTimeoutMs): Promise<QuiesceResult> {
    if (!this.quitting) {
      this.beginGracefulShutdown()
    } else {
      for (const controller of this.controllers.values()) controller.abort()
    }
    const pending = [...this.completions.values()]
    if (pending.length === 0) {
      this.clearAllTimers()
      this.endRuntimeSessionGracefully()
      return { drained: true }
    }
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    try {
      const raceResult = await Promise.race([
        Promise.allSettled(pending).then(() => 'drained' as const),
        new Promise<'timeout'>((resolve) => {
          timeoutHandle = this.setTimeoutFn(() => resolve('timeout'), timeoutMs)
        }),
      ])
      if (raceResult === 'drained') {
        this.clearAllTimers()
        this.endRuntimeSessionGracefully()
        return { drained: true }
      }
      // Timeout: leave task timers alone for any still-running work; do not close DB.
      return { drained: false }
    } finally {
      if (timeoutHandle !== undefined) {
        this.clearTimeoutFn(timeoutHandle)
      }
    }
  }

  public async wait(taskId: string): Promise<Task | null> {
    const completion = this.completions.get(taskId)
    return completion ? completion : this.options.store.getById(taskId)
  }

  /**
   * Application / database teardown. Prefer quiesceForShutdown() when awaiting is possible.
   */
  public dispose(): void {
    if (!this.quitting) {
      this.beginGracefulShutdown()
    }
    for (const controller of this.controllers.values()) controller.abort()
    if (!this.hasActiveWork()) this.endRuntimeSessionGracefully()
    this.clearAllTimers()
  }

  private endRuntimeSessionGracefully(): void {
    if (!this.runtimeSession || !this.options.runtimeSessions) return
    this.runtimeSession = this.options.runtimeSessions.end(
      this.runtimeSession.id,
      'graceful',
      this.now(),
    ) ?? this.runtimeSession
  }

  private hasDurableFinalEntity(task: Task): boolean {
    const lookups = this.options.recoveryLookups
    if (!lookups) return false
    if (task.task_type === 'chapter-generation') {
      return lookups.hasChapterVersionForTask(task.id)
    }
    if (task.task_type === 'chapter-polish') {
      return lookups.hasChapterRevisionForTask(task.id)
    }
    return false
  }

  private claimAndStart(
    taskId: string,
    options: {
      kind: 'auto' | 'manual'
      allowedClassifications: ReadonlyArray<'resumable' | 'restartable' | 'manual-retry-required'>
      incrementAttempt: boolean
      manualConfirmed?: boolean
      timeoutAt?: string | null
    },
  ): TaskHandle | null {
    const active = this.completions.get(taskId)
    if (active) return { taskId, completion: active }

    const existing = this.options.store.getById(taskId)
    if (!existing) return null
    const finalEntity = this.hasDurableFinalEntity(existing)

    const nowIso = this.now()
    const leaseToken = randomUUID()
    const refreshedTimeout = options.timeoutAt ?? addMs(nowIso, this.taskTimeoutMs)
    const claim = this.options.store.claimForRecovery({
      taskId,
      owner: this.ownerId,
      leaseToken,
      leaseExpiresAt: addMs(nowIso, this.leaseMs),
      nowIso,
      kind: options.kind,
      allowedClassifications: options.allowedClassifications,
      // Zero-model final-entity finish does not consume the attempt budget.
      incrementAttempt: finalEntity ? false : options.incrementAttempt,
      ignoreAttemptLimit: finalEntity,
      runtimeSessionId: this.runtimeSession?.id ?? null,
      manualConfirmed: options.manualConfirmed === true,
      timeoutAt: refreshedTimeout,
    })
    if (!claim.claimed || !claim.task) return null
    if (claim.attemptId) {
      this.attemptIds.set(taskId, claim.attemptId)
    }

    let input: StartTaskInput
    try {
      const persisted = inputFromTask(claim.task)
      // A durable final entity lets the runner perform a zero-model idempotent
      // finish. Do not make that safe path depend on credential resolution.
      const resolvedLlm = finalEntity
        ? persisted.llm
        : this.resolveCurrentCredential(claim.task.project_id, persisted.llm)
      input = {
        ...persisted,
        llm: {
          ...resolvedLlm,
          baseUrl: normalizeLlmBaseUrl(resolvedLlm.baseUrl),
        },
      }
    } catch (error) {
      const message = errorMessage(error)
      this.mutateOwned(taskId, leaseToken, {
        status: 'failed',
        stage: 'failed',
        error_message: message,
        last_recovery_error: message,
        recovery_classification: 'manual-retry-required',
        recovery_reason: '无法从当前项目配置解析凭据或任务输入。',
        recovery_action: 'manual-confirm',
        finished_at: this.now(),
        execution_phase: 'failed',
      })
      this.finishAttempt(taskId, 'failed', message)
      this.options.store.releaseLease(taskId, leaseToken, this.now())
      return null
    }

    this.mutateOwned(taskId, leaseToken, {
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
    if (leaseToken) {
      this.leaseTokens.set(task.id, leaseToken)
    }
    this.options.events.publish({ type: 'task:start', task })
    this.armTimeout(task.id, task.timeout_at, controller)
    if (leaseToken) {
      this.armLeaseRenewal(task.id, leaseToken, controller)
    }
    const attemptId = this.attemptIds.get(task.id)
    if (attemptId && this.options.recoveryAttempts) {
      this.options.recoveryAttempts.markStarted(attemptId, this.now())
    }

    const completion = this.execute(task.id, input, controller, leaseToken).finally(() => {
      this.controllers.delete(task.id)
      this.completions.delete(task.id)
      this.leaseTokens.delete(task.id)
      this.clearTaskTimers(task.id)
    })
    this.completions.set(task.id, completion)
    return { taskId: task.id, completion }
  }

  private fenceFor(taskId: string, leaseToken?: string): LeaseFence | null {
    const token = leaseToken ?? this.leaseTokens.get(taskId)
    if (!token) return null
    return { owner: this.ownerId, leaseToken: token, nowIso: this.now() }
  }

  /**
   * Execution-period mutations must be fenced by lease ownership.
   * Returns null when the lease was lost (caller must not overwrite the new owner).
   */
  private mutateOwned(
    taskId: string,
    leaseToken: string | undefined,
    input: UpdateTaskInput,
  ): Task {
    const fence = this.fenceFor(taskId, leaseToken)
    if (!fence) {
      // Pre-lease administrative path (should be rare during execution).
      const updated = this.options.store.update(taskId, input)
      if (!updated) throw new Error(`Task not found during execution: ${taskId}`)
      return updated
    }
    const updated = this.options.store.updateOwned(taskId, fence, input)
    if (!updated) {
      this.lostLeaseFlags.add(taskId)
      this.controllers.get(taskId)?.abort()
      throw new TaskLeaseLostError()
    }
    return updated
  }

  private runOwnedSideEffect<T>(
    taskId: string,
    leaseToken: string | undefined,
    operation: () => T,
  ): T {
    const fence = this.fenceFor(taskId, leaseToken)
    if (!fence) throw new TaskLeaseLostError()
    try {
      return this.options.store.runOwnedTransaction(taskId, fence, this.now(), operation)
    } catch (error) {
      if (error instanceof TaskLeaseLostError) {
        this.lostLeaseFlags.add(taskId)
        this.controllers.get(taskId)?.abort()
      }
      throw error
    }
  }

  private assertOwnsExecution(taskId: string, leaseToken?: string): void {
    const fence = this.fenceFor(taskId, leaseToken)
    if (!fence) return
    const current = this.options.store.getById(taskId)
    if (
      !current
      || current.lease_owner !== fence.owner
      || current.lease_token !== fence.leaseToken
    ) {
      this.lostLeaseFlags.add(taskId)
      this.controllers.get(taskId)?.abort()
      throw new Error('任务租约已丢失，已中止非幂等副作用。')
    }
  }

  private async execute(
    taskId: string,
    input: StartTaskInput,
    controller: AbortController,
    leaseToken?: string,
  ): Promise<Task> {
    const runner = this.options.runners?.[input.taskType]
    try {
      if (runner) return await this.executeRunner(taskId, input, controller, runner, leaseToken)

      this.updateStage(taskId, 'starting', 0, leaseToken)
      this.setExecutionPhase(taskId, 'preparing', leaseToken)
      this.mutateOwned(taskId, leaseToken, { status: 'running', started_at: this.now() })

      let agent: Awaited<ReturnType<AgentFactory['create']>> | undefined
      try {
        this.setExecutionPhase(taskId, 'awaiting_model', leaseToken)
        this.assertOwnsExecution(taskId, leaseToken)
        agent = await this.options.agentFactory.create({
          projectId: input.projectId,
          sessionId: input.sessionId,
          llm: input.llm,
          systemPrompt: input.systemPrompt,
        })
        this.setExecutionPhase(taskId, 'model_in_flight', leaseToken)
        const result = await agent.prompt(input.prompt, {
          signal: controller.signal,
          onEvent: (event) => this.handleAgentEvent(taskId, event, input.llm.streamingEnabled !== false, leaseToken),
        })

        if (this.timeoutFlags.has(taskId)) {
          return this.finishTimedOut(taskId, leaseToken)
        }
        if (this.lostLeaseFlags.has(taskId)) {
          return this.finishLostLease(taskId)
        }
        if (controller.signal.aborted || result.finishReason === 'aborted') {
          return this.finishCancelled(taskId, result, leaseToken)
        }
        this.setExecutionPhase(taskId, 'persisting_result', leaseToken)
        const completed = this.mutateOwned(taskId, leaseToken, {
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
        if (!completed) return this.finishLostLease(taskId)
        this.finishAttempt(taskId, 'completed')
        this.options.events.publish({
          type: 'task:end',
          taskId,
          status: 'completed',
          result: completed.result ?? undefined,
          stats: result,
        })
        return completed
      } catch (error) {
        if (this.timeoutFlags.has(taskId)) return this.finishTimedOut(taskId, leaseToken)
        if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
        if (controller.signal.aborted) return this.finishCancelled(taskId, undefined, leaseToken)
        if (error instanceof NonRecoverableTaskError) {
          return this.finishNonRecoverable(taskId, errorMessage(error), leaseToken)
        }
        return this.finishFailed(taskId, errorMessage(error), leaseToken)
      } finally {
        agent?.dispose()
      }
    } catch (error) {
      if (this.timeoutFlags.has(taskId)) return this.finishTimedOut(taskId, leaseToken)
      if (this.lostLeaseFlags.has(taskId) || error instanceof TaskLeaseLostError) {
        return this.finishLostLease(taskId)
      }
      if (controller.signal.aborted) return this.finishCancelled(taskId, undefined, leaseToken)
      if (error instanceof NonRecoverableTaskError) {
        return this.finishNonRecoverable(taskId, errorMessage(error), leaseToken)
      }
      return this.finishFailed(taskId, errorMessage(error), leaseToken)
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
    leaseToken?: string,
  ): Promise<Task> {
    this.updateStage(taskId, 'starting', 0, leaseToken)
    this.setExecutionPhase(taskId, 'preparing', leaseToken)
    this.mutateOwned(taskId, leaseToken, { status: 'running', started_at: this.now() })
    const current = this.options.store.getById(taskId)
    if (!current) throw new Error(`Task not found before execution: ${taskId}`)
    const context: TaskRunnerContext = {
      task: current,
      input,
      signal: controller.signal,
      assertStillOwnsExecution: () => this.assertOwnsExecution(taskId, leaseToken),
      runOwnedSideEffect: (operation) =>
        this.runOwnedSideEffect(taskId, leaseToken, operation),
      setStage: (stage, progress) => this.updateStage(taskId, stage, progress, leaseToken),
      setExecutionPhase: (phase) => this.setExecutionPhase(taskId, phase, leaseToken),
      emitChunk: (chunk, stage) => this.options.events.publish({ type: 'task:chunk', taskId, chunk, stage }),
      saveCheckpoint: (checkpoint) => {
        const schemaVersion = typeof checkpoint.schema_version === 'number'
          ? checkpoint.schema_version
          : null
        const saved = this.mutateOwned(taskId, leaseToken, {
          checkpoint,
          checkpoint_schema_version: schemaVersion ?? current.checkpoint_schema_version,
        })
        if (!saved) throw new Error('任务租约已丢失，检查点写入已拒绝。')
        this.options.events.publish({ type: 'task:checkpoint', taskId, checkpoint })
      },
      publishReview: (versionId, required, status) =>
        this.options.events.publish({ type: 'task:review', taskId, versionId, required, status }),
    }
    try {
      const result = await runner.execute(context)
      if (this.timeoutFlags.has(taskId)) return this.finishTimedOut(taskId, leaseToken)
      if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
      if (controller.signal.aborted || result.status === 'cancelled') {
        return this.finishCancelledWithResult(taskId, result.result, undefined, leaseToken)
      }
      this.setExecutionPhase(taskId, 'finalizing', leaseToken)
      const completed = this.mutateOwned(taskId, leaseToken, {
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
      if (!completed) return this.finishLostLease(taskId)
      this.finishAttempt(taskId, 'completed')
      this.options.events.publish({
        type: 'task:end',
        taskId,
        status: 'completed',
        result: completed.result ?? undefined,
      })
      return completed
    } catch (error) {
      if (this.timeoutFlags.has(taskId)) return this.finishTimedOut(taskId, leaseToken)
      if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
      if (controller.signal.aborted) return this.finishCancelledWithResult(taskId, undefined, undefined, leaseToken)
      if (error instanceof NonRecoverableTaskError) {
        return this.finishNonRecoverable(taskId, errorMessage(error), leaseToken)
      }
      return this.finishFailed(taskId, errorMessage(error), leaseToken)
    }
  }

  private finishCancelled(taskId: string, result?: AgentRunResult, leaseToken?: string): Task {
    return this.finishCancelledWithResult(taskId, result ? toResult(result) : undefined, result, leaseToken)
  }

  private finishCancelledWithResult(
    taskId: string,
    result?: JsonObject,
    stats?: AgentRunResult,
    leaseToken?: string,
  ): Task {
    if (this.timeoutFlags.has(taskId)) return this.finishTimedOut(taskId, leaseToken)
    if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
    const cancelled = this.mutateOwned(taskId, leaseToken, {
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
    if (!cancelled) return this.finishLostLease(taskId)
    this.finishAttempt(taskId, 'cancelled')
    this.options.events.publish({
      type: 'task:end',
      taskId,
      status: 'cancelled',
      result: cancelled.result ?? undefined,
      stats,
    })
    return cancelled
  }

  private finishTimedOut(taskId: string, leaseToken?: string): Task {
    const message = TIMEOUT_RECOVERY_REASON
    const failed = this.mutateOwned(taskId, leaseToken, {
      status: 'failed',
      stage: 'timeout',
      progress: 1,
      error_message: message,
      last_recovery_error: message,
      finished_at: this.now(),
      execution_phase: 'failed',
      recovery_classification: 'manual-retry-required',
      recovery_reason: message,
      recovery_action: 'manual-confirm',
      cancel_requested: false,
    })
    if (!failed) return this.finishLostLease(taskId)
    this.finishAttempt(taskId, 'timeout', message)
    this.options.events.publish({ type: 'task:error', taskId, error: message })
    this.options.events.publish({ type: 'task:end', taskId, status: 'failed' })
    return failed
  }

  /**
   * Lost-lease path: only finish this owner's recovery_attempt.
   * Never mutate the task row (new owner may already hold it).
   */
  private finishLostLease(taskId: string): Task {
    const message = '任务租约已丢失，执行已安全中止，避免并发副作用。'
    this.finishAttempt(taskId, 'lost_lease', message)
    const current = this.options.store.getById(taskId)
    if (!current) throw new Error(`Task not found after lost lease: ${taskId}`)
    // Do not invent a terminal status for the new owner; only signal local attempt end.
    if (
      current.status === 'completed'
      || current.status === 'failed'
      || current.status === 'cancelled'
    ) {
      this.options.events.publish({ type: 'task:end', taskId, status: current.status })
    }
    return current
  }

  private finishFailed(taskId: string, message: string, leaseToken?: string): Task {
    if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
    const failed = this.mutateOwned(taskId, leaseToken, {
      status: 'failed',
      stage: 'failed',
      error_message: message,
      finished_at: this.now(),
      execution_phase: 'failed',
      last_recovery_error: message,
    })
    if (!failed) return this.finishLostLease(taskId)
    this.persistClassification(failed)
    this.finishAttempt(taskId, 'failed', message)
    this.options.events.publish({ type: 'task:error', taskId, error: message })
    this.options.events.publish({ type: 'task:end', taskId, status: 'failed' })
    return failed
  }

  private finishNonRecoverable(
    taskId: string,
    message: string,
    leaseToken?: string,
  ): Task {
    if (this.lostLeaseFlags.has(taskId)) return this.finishLostLease(taskId)
    const failed = this.mutateOwned(taskId, leaseToken, {
      status: 'failed',
      stage: 'failed',
      error_message: message,
      finished_at: this.now(),
      execution_phase: 'failed',
      recovery_classification: 'non-recoverable',
      recovery_reason: message,
      recovery_action: 'none',
      last_recovery_error: message,
    })
    this.finishAttempt(taskId, 'failed', message)
    this.options.events.publish({ type: 'task:error', taskId, error: message })
    this.options.events.publish({ type: 'task:end', taskId, status: 'failed' })
    return failed
  }

  private finishAttempt(
    taskId: string,
    outcome: RecoveryAttemptOutcome,
    error: string | null = null,
  ): void {
    const attemptId = this.attemptIds.get(taskId)
    if (!attemptId || !this.options.recoveryAttempts) return
    this.options.recoveryAttempts.finish(attemptId, outcome, this.now(), error)
    this.attemptIds.delete(taskId)
  }

  private armTimeout(
    taskId: string,
    timeoutAt: string | null,
    controller: AbortController,
  ): void {
    if (!timeoutAt) return
    const delay = msUntil(timeoutAt, this.now())
    const timer = this.setTimeoutFn(() => {
      this.timeoutFlags.add(taskId)
      controller.abort()
    }, delay)
    this.unrefTimer(timer)
    this.timeoutTimers.set(taskId, timer)
  }

  private armLeaseRenewal(
    taskId: string,
    leaseToken: string,
    controller: AbortController,
  ): void {
    const timer = this.setIntervalFn(() => {
      const renewed = this.options.store.renewLease({
        taskId,
        owner: this.ownerId,
        leaseToken,
        leaseExpiresAt: addMs(this.now(), this.leaseMs),
        nowIso: this.now(),
      })
      if (!renewed) {
        this.lostLeaseFlags.add(taskId)
        controller.abort()
      }
    }, this.leaseRenewMs)
    this.unrefTimer(timer)
    this.leaseTimers.set(taskId, timer)
  }

  private unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>): void {
    const maybe = timer as { unref?: () => void }
    if (typeof maybe.unref === 'function') maybe.unref()
  }

  private clearTaskTimers(taskId: string): void {
    const timeout = this.timeoutTimers.get(taskId)
    if (timeout !== undefined) {
      this.clearTimeoutFn(timeout)
      this.timeoutTimers.delete(taskId)
    }
    const lease = this.leaseTimers.get(taskId)
    if (lease !== undefined) {
      this.clearIntervalFn(lease)
      this.leaseTimers.delete(taskId)
    }
    this.timeoutFlags.delete(taskId)
    this.lostLeaseFlags.delete(taskId)
  }

  private clearAllTimers(): void {
    for (const taskId of [...this.timeoutTimers.keys()]) {
      this.clearTaskTimers(taskId)
    }
    for (const taskId of [...this.leaseTimers.keys()]) {
      this.clearTaskTimers(taskId)
    }
  }

  private handleAgentEvent(
    taskId: string,
    event: AgentEvent,
    streamingEnabled: boolean,
    leaseToken?: string,
  ): void {
    if (event.type === 'agent_start') {
      this.updateStage(taskId, 'agent', 0, leaseToken)
      return
    }
    if (event.type === 'tool_execution_start') {
      this.updateStage(taskId, `tool:${event.toolName}`, 0, leaseToken)
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

  private updateStage(taskId: string, stage: string, progress: number, leaseToken?: string): void {
    const updated = this.mutateOwned(taskId, leaseToken, { stage, progress })
    if (!updated) return
    this.options.events.publish({ type: 'task:stage', taskId, stage, progress })
  }

  private setExecutionPhase(taskId: string, phase: ExecutionPhase, leaseToken?: string): void {
    this.mutateOwned(taskId, leaseToken, { execution_phase: phase })
  }

  private resolveCurrentCredential(projectId: string, input: LlmConfigInput): LlmConfigInput {
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
    if (
      task.status === 'failed'
      && task.recovery_classification === 'non-recoverable'
      && task.recovery_action === 'none'
      && task.finished_at !== null
    ) {
      return {
        classification: 'non-recoverable',
        reason: task.recovery_reason ?? TASK_CORRUPTION_REASON,
        action: 'none',
        autoAllowed: false,
        manualRetryAllowed: false,
      }
    }
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
