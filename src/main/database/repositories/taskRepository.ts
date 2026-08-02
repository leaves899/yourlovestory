import { randomUUID } from 'node:crypto'
import {
  parseJsonObject,
  stringifyJsonObject,
  type JsonObject,
} from '../json'
import type { SqliteDatabase } from '../types'
import {
  DEFAULT_MAX_RECOVERY_ATTEMPTS,
  RECOVERY_METADATA_VERSION,
  TASK_CORRUPTION_REASON,
  UNKNOWN_PHASE_REASON,
  type ExecutionPhase,
  type RecoveryAction,
  type RecoveryAttemptKind,
  type RecoveryClassification,
  type ShutdownKind,
} from '../../../shared/taskRecovery'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type { JsonObject, JsonPrimitive, JsonValue } from '../json'

export interface Task {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: TaskStatus
  stage: string
  progress: number
  input: JsonObject
  checkpoint: JsonObject | null
  result: JsonObject | null
  error_message: string | null
  cancel_requested: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  execution_phase: ExecutionPhase
  recovery_classification: RecoveryClassification | null
  recovery_reason: string | null
  recovery_action: RecoveryAction | null
  recovery_attempt_count: number
  max_recovery_attempts: number
  last_recovery_attempt_at: string | null
  last_recovery_error: string | null
  idempotency_key: string | null
  checkpoint_schema_version: number | null
  recovery_root_task_id: string | null
  lease_owner: string | null
  lease_token: string | null
  lease_expires_at: string | null
  timeout_at: string | null
  shutdown_kind: ShutdownKind | null
  runtime_session_id: string | null
  recovery_metadata_version: number
}

export interface CreateTaskInput {
  id?: string
  project_id: string
  chapter_id?: string | null
  parent_task_id?: string | null
  task_type: string
  input?: JsonObject
  idempotency_key?: string | null
  recovery_root_task_id?: string | null
  checkpoint_schema_version?: number | null
  max_recovery_attempts?: number
  timeout_at?: string | null
  runtime_session_id?: string | null
  recovery_metadata_version?: number
  execution_phase?: ExecutionPhase
}

export interface UpdateTaskInput {
  chapter_id?: string | null
  status?: TaskStatus
  stage?: string
  progress?: number
  checkpoint?: JsonObject | null
  result?: JsonObject | null
  error_message?: string | null
  cancel_requested?: boolean
  started_at?: string | null
  finished_at?: string | null
  execution_phase?: ExecutionPhase
  recovery_classification?: RecoveryClassification | null
  recovery_reason?: string | null
  recovery_action?: RecoveryAction | null
  recovery_attempt_count?: number
  max_recovery_attempts?: number
  last_recovery_attempt_at?: string | null
  last_recovery_error?: string | null
  idempotency_key?: string | null
  checkpoint_schema_version?: number | null
  recovery_root_task_id?: string | null
  lease_owner?: string | null
  lease_token?: string | null
  lease_expires_at?: string | null
  timeout_at?: string | null
  shutdown_kind?: ShutdownKind | null
  runtime_session_id?: string | null
  recovery_metadata_version?: number
}

export interface ClaimTaskInput {
  taskId: string
  owner: string
  leaseToken: string
  leaseExpiresAt: string
  nowIso: string
  kind: RecoveryAttemptKind
  /** For automatic recovery only allow these classifications. */
  allowedClassifications?: readonly RecoveryClassification[]
  /** Increment recovery attempt counter on successful claim. */
  incrementAttempt?: boolean
  runtimeSessionId?: string | null
  /** Optional new timeout deadline applied atomically on claim. */
  timeoutAt?: string | null
  /** When true, clear cancel and move failed/cancelled into running/queued atomically. */
  manualConfirmed?: boolean
  /**
   * Zero-model final-entity finish may claim even at the attempt ceiling.
   * Must not be used for model-replay paths.
   */
  ignoreAttemptLimit?: boolean
}

export interface ClaimTaskResult {
  claimed: boolean
  task: Task | null
  attemptId: string | null
}

export interface RenewLeaseInput {
  taskId: string
  owner: string
  leaseToken: string
  leaseExpiresAt: string
  nowIso: string
}

export interface LeaseFence {
  owner: string
  leaseToken: string
  /** Optional caller clock for deterministic workers/tests; production defaults to wall clock. */
  nowIso?: string
}

export class TaskLeaseLostError extends Error {
  public constructor() {
    super('Task execution lease is no longer owned by this worker')
    this.name = 'TaskLeaseLostError'
  }
}

export interface TaskStore {
  create(input: CreateTaskInput): Task
  getById(id: string): Task | null
  listByProject(projectId: string): Task[]
  listRecoveryCandidates(): Task[]
  update(id: string, input: UpdateTaskInput): Task | null
  /**
   * Conditional task mutation: succeeds only when the caller still holds
   * lease_owner + lease_token. Prevents a lost owner from overwriting a new owner.
   */
  updateOwned(
    id: string,
    fence: LeaseFence,
    input: UpdateTaskInput,
  ): Task | null
  /**
   * Runs synchronous business writes in the same SQLite write transaction as
   * the lease check. This is the fencing boundary for durable side effects.
   */
  runOwnedTransaction<T>(
    id: string,
    fence: LeaseFence,
    nowIso: string,
    operation: () => T,
  ): T
  requestCancellation(id: string): boolean
  claimForRecovery(input: ClaimTaskInput): ClaimTaskResult
  renewLease(input: RenewLeaseInput): boolean
  releaseLease(taskId: string, leaseToken: string, nowIso: string): boolean
  releaseLeasesForRuntimeSessions(sessionIds: readonly string[], nowIso: string): number
  markGracefulShutdown(nowIso: string, runtimeSessionId: string | null): number
  expireLeases(nowIso: string): number
  markTerminalNonRecoverable(
    taskId: string,
    reason: string,
    nowIso: string,
  ): Task | null
}

interface TaskRow {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: string
  stage: string
  progress: number
  input_json: string
  result_json: string | null
  error_message: string | null
  checkpoint_json: string | null
  cancel_requested: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  execution_phase: string
  recovery_classification: string | null
  recovery_reason: string | null
  recovery_action: string | null
  recovery_attempt_count: number
  max_recovery_attempts: number
  last_recovery_attempt_at: string | null
  last_recovery_error: string | null
  idempotency_key: string | null
  checkpoint_schema_version: number | null
  recovery_root_task_id: string | null
  lease_owner: string | null
  lease_token: string | null
  lease_expires_at: string | null
  timeout_at: string | null
  shutdown_kind: string | null
  runtime_session_id: string | null
  recovery_metadata_version: number
}

const statuses: readonly TaskStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]

const executionPhases: readonly ExecutionPhase[] = [
  'queued',
  'preparing',
  'awaiting_model',
  'model_in_flight',
  'persisting_result',
  'finalizing',
  'completed',
  'cancelled',
  'failed',
]

const classifications: readonly RecoveryClassification[] = [
  'resumable',
  'restartable',
  'manual-retry-required',
  'non-recoverable',
]

const actions: readonly RecoveryAction[] = [
  'auto-resume',
  'auto-restart',
  'manual-retry',
  'manual-confirm',
  'none',
]

class UnsupportedExecutionPhaseError extends Error {
  public constructor() {
    super(UNKNOWN_PHASE_REASON)
    this.name = 'UnsupportedExecutionPhaseError'
  }
}

function parseExecutionPhase(value: string): ExecutionPhase {
  if (executionPhases.includes(value as ExecutionPhase)) return value as ExecutionPhase
  throw new UnsupportedExecutionPhaseError()
}

function parseClassification(value: string | null): RecoveryClassification | null {
  if (value === null) return null
  if (classifications.includes(value as RecoveryClassification)) {
    return value as RecoveryClassification
  }
  return null
}

function parseAction(value: string | null): RecoveryAction | null {
  if (value === null) return null
  if (actions.includes(value as RecoveryAction)) return value as RecoveryAction
  return null
}

function parseShutdownKind(value: string | null): ShutdownKind | null {
  if (value === 'graceful' || value === 'crash') return value
  return null
}

function toTask(row: TaskRow): Task {
  if (!statuses.includes(row.status as TaskStatus)) {
    throw new Error(`Unknown task status: ${row.status}`)
  }
  const input = parseJsonObject(row.input_json, 'input')
  if (!input) throw new Error('Task input cannot be null')
  let checkpoint: JsonObject | null = null
  if (row.checkpoint_json !== null) {
    checkpoint = parseJsonObject(row.checkpoint_json, 'checkpoint')
  }
  let result: JsonObject | null = null
  if (row.result_json !== null) {
    result = parseJsonObject(row.result_json, 'result')
  }
  return {
    id: row.id,
    project_id: row.project_id,
    chapter_id: row.chapter_id,
    parent_task_id: row.parent_task_id,
    task_type: row.task_type,
    status: row.status as TaskStatus,
    stage: row.stage,
    progress: row.progress,
    input,
    checkpoint,
    result,
    error_message: row.error_message,
    cancel_requested: row.cancel_requested === 1,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    execution_phase: parseExecutionPhase(row.execution_phase ?? 'queued'),
    recovery_classification: parseClassification(row.recovery_classification),
    recovery_reason: row.recovery_reason,
    recovery_action: parseAction(row.recovery_action),
    recovery_attempt_count: row.recovery_attempt_count ?? 0,
    max_recovery_attempts: row.max_recovery_attempts ?? DEFAULT_MAX_RECOVERY_ATTEMPTS,
    last_recovery_attempt_at: row.last_recovery_attempt_at,
    last_recovery_error: row.last_recovery_error,
    idempotency_key: row.idempotency_key,
    checkpoint_schema_version: row.checkpoint_schema_version,
    recovery_root_task_id: row.recovery_root_task_id,
    lease_owner: row.lease_owner,
    lease_token: row.lease_token,
    lease_expires_at: row.lease_expires_at,
    timeout_at: row.timeout_at,
    shutdown_kind: parseShutdownKind(row.shutdown_kind),
    runtime_session_id: row.runtime_session_id,
    recovery_metadata_version: row.recovery_metadata_version ?? 0,
  }
}

function now(): string {
  return new Date().toISOString()
}

export class TaskRepository implements TaskStore {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateTaskInput): Task {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    const metadataVersion = input.recovery_metadata_version ?? RECOVERY_METADATA_VERSION
    this.database
      .prepare(
        `INSERT INTO tasks (
          id, project_id, chapter_id, parent_task_id, task_type, status, stage, progress,
          input_json, checkpoint_json, created_at, updated_at,
          execution_phase, recovery_attempt_count, max_recovery_attempts,
          idempotency_key, checkpoint_schema_version, recovery_root_task_id,
          timeout_at, runtime_session_id, recovery_metadata_version
        ) VALUES (
          ?, ?, ?, ?, ?, 'pending', '', 0,
          ?, NULL, ?, ?,
          ?, 0, ?,
          ?, ?, ?,
          ?, ?, ?
        )`,
      )
      .run(
        id,
        input.project_id,
        input.chapter_id ?? null,
        input.parent_task_id ?? null,
        input.task_type,
        stringifyJsonObject(input.input ?? {}),
        timestamp,
        timestamp,
        input.execution_phase ?? 'queued',
        input.max_recovery_attempts ?? DEFAULT_MAX_RECOVERY_ATTEMPTS,
        input.idempotency_key ?? null,
        input.checkpoint_schema_version ?? null,
        input.recovery_root_task_id ?? id,
        input.timeout_at ?? null,
        input.runtime_session_id ?? null,
        metadataVersion,
      )
    const task = this.getById(id)
    if (!task) throw new Error('Task was not created')
    return task
  }

  public getById(id: string): Task | null {
    const row = this.database.prepare<TaskRow>('SELECT * FROM tasks WHERE id = ?').get(id)
    if (!row) return null
    try {
      return toTask(row)
    } catch (error) {
      return this.normalizeUnreadableRow(row, error, now())
    }
  }

  public listByProject(projectId: string): Task[] {
    const rows = this.database
      .prepare<TaskRow>('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at, id')
      .all(projectId)
    return this.mapRowsIsolatingCorrupt(rows)
  }

  public listRecoveryCandidates(): Task[] {
    const rows = this.database
      .prepare<TaskRow>(
        `SELECT * FROM tasks
         WHERE status IN ('pending', 'running', 'failed')
           AND cancel_requested = 0
           AND NOT (
             recovery_classification = 'non-recoverable'
             AND status = 'failed'
             AND finished_at IS NOT NULL
           )
         ORDER BY created_at, id`,
      )
      .all()
    return this.mapRowsIsolatingCorrupt(rows)
  }

  public update(id: string, input: UpdateTaskInput): Task | null {
    return this.applyUpdate(id, input, null)
  }

  public updateOwned(
    id: string,
    fence: LeaseFence,
    input: UpdateTaskInput,
  ): Task | null {
    return this.applyUpdate(id, input, fence)
  }

  public runOwnedTransaction<T>(
    id: string,
    fence: LeaseFence,
    nowIso: string,
    operation: () => T,
  ): T {
    const execute = (): T => {
      const owned = this.database
        .prepare<{ owned: number }>(
          `SELECT 1 AS owned
           FROM tasks
           WHERE id = ?
             AND lease_owner = ?
             AND lease_token = ?
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at > ?`,
        )
        .get(id, fence.owner, fence.leaseToken, nowIso)
      if (!owned) throw new TaskLeaseLostError()
      return operation()
    }

    if (this.database.inTransaction) return execute()

    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = execute()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      if (this.database.inTransaction) this.database.exec('ROLLBACK')
      throw error
    }
  }

  private applyUpdate(
    id: string,
    input: UpdateTaskInput,
    fence: LeaseFence | null,
  ): Task | null {
    const nowIso = fence?.nowIso ?? now()
    const current = this.getById(id)
    if (!current) return null
    if (fence) {
      if (current.lease_owner !== fence.owner || current.lease_token !== fence.leaseToken) {
        return null
      }
    }
    const next = {
      chapter_id: input.chapter_id === undefined ? current.chapter_id : input.chapter_id,
      status: input.status ?? current.status,
      stage: input.stage ?? current.stage,
      progress: input.progress ?? current.progress,
      checkpoint: input.checkpoint === undefined ? current.checkpoint : input.checkpoint,
      result: input.result === undefined ? current.result : input.result,
      error_message: input.error_message === undefined ? current.error_message : input.error_message,
      cancel_requested: input.cancel_requested ?? current.cancel_requested,
      started_at: input.started_at === undefined ? current.started_at : input.started_at,
      finished_at: input.finished_at === undefined ? current.finished_at : input.finished_at,
      execution_phase: input.execution_phase ?? current.execution_phase,
      recovery_classification:
        input.recovery_classification === undefined
          ? current.recovery_classification
          : input.recovery_classification,
      recovery_reason:
        input.recovery_reason === undefined ? current.recovery_reason : input.recovery_reason,
      recovery_action:
        input.recovery_action === undefined ? current.recovery_action : input.recovery_action,
      recovery_attempt_count: input.recovery_attempt_count ?? current.recovery_attempt_count,
      max_recovery_attempts: input.max_recovery_attempts ?? current.max_recovery_attempts,
      last_recovery_attempt_at:
        input.last_recovery_attempt_at === undefined
          ? current.last_recovery_attempt_at
          : input.last_recovery_attempt_at,
      last_recovery_error:
        input.last_recovery_error === undefined
          ? current.last_recovery_error
          : input.last_recovery_error,
      idempotency_key:
        input.idempotency_key === undefined ? current.idempotency_key : input.idempotency_key,
      checkpoint_schema_version:
        input.checkpoint_schema_version === undefined
          ? current.checkpoint_schema_version
          : input.checkpoint_schema_version,
      recovery_root_task_id:
        input.recovery_root_task_id === undefined
          ? current.recovery_root_task_id
          : input.recovery_root_task_id,
      lease_owner: input.lease_owner === undefined ? current.lease_owner : input.lease_owner,
      lease_token: input.lease_token === undefined ? current.lease_token : input.lease_token,
      lease_expires_at:
        input.lease_expires_at === undefined ? current.lease_expires_at : input.lease_expires_at,
      timeout_at: input.timeout_at === undefined ? current.timeout_at : input.timeout_at,
      shutdown_kind:
        input.shutdown_kind === undefined ? current.shutdown_kind : input.shutdown_kind,
      runtime_session_id:
        input.runtime_session_id === undefined
          ? current.runtime_session_id
          : input.runtime_session_id,
      recovery_metadata_version:
        input.recovery_metadata_version ?? current.recovery_metadata_version,
    }
    const fenceClause = fence
      ? ' AND lease_owner = ? AND lease_token = ? AND lease_expires_at IS NOT NULL AND lease_expires_at > ?'
      : ''
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET chapter_id = ?, status = ?, stage = ?, progress = ?, checkpoint_json = ?, result_json = ?,
             error_message = ?, cancel_requested = ?, started_at = ?, finished_at = ?, updated_at = ?,
             execution_phase = ?, recovery_classification = ?, recovery_reason = ?, recovery_action = ?,
             recovery_attempt_count = ?, max_recovery_attempts = ?, last_recovery_attempt_at = ?,
             last_recovery_error = ?, idempotency_key = ?, checkpoint_schema_version = ?,
             recovery_root_task_id = ?, lease_owner = ?, lease_token = ?, lease_expires_at = ?,
             timeout_at = ?, shutdown_kind = ?, runtime_session_id = ?, recovery_metadata_version = ?
         WHERE id = ?${fenceClause}`,
      )
      .run(
        next.chapter_id,
        next.status,
        next.stage,
        next.progress,
        next.checkpoint === null ? null : stringifyJsonObject(next.checkpoint),
        next.result === null ? null : stringifyJsonObject(next.result),
        next.error_message,
        next.cancel_requested ? 1 : 0,
        next.started_at,
        next.finished_at,
        nowIso,
        next.execution_phase,
        next.recovery_classification,
        next.recovery_reason,
        next.recovery_action,
        next.recovery_attempt_count,
        next.max_recovery_attempts,
        next.last_recovery_attempt_at,
        next.last_recovery_error,
        next.idempotency_key,
        next.checkpoint_schema_version,
        next.recovery_root_task_id,
        next.lease_owner,
        next.lease_token,
        next.lease_expires_at,
        next.timeout_at,
        next.shutdown_kind,
        next.runtime_session_id,
        next.recovery_metadata_version,
        id,
        ...(fence ? [fence.owner, fence.leaseToken, nowIso] : []),
      )
    if (result.changes === 0) return null
    return this.getById(id)
  }

  public requestCancellation(id: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET cancel_requested = 1, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'running')`,
      )
      .run(now(), id)
    return result.changes > 0
  }

  /**
   * Atomic claim using conditional UPDATE; attempt history is written in the same transaction.
   * Failed claims leave the task row and attempt history unchanged (no orphan attempts).
   */
  public claimForRecovery(input: ClaimTaskInput): ClaimTaskResult {
    const allowed = input.allowedClassifications
    const classificationClause = allowed && allowed.length > 0
      ? `AND recovery_classification IN (${allowed.map(() => '?').join(', ')})`
      : ''
    const incrementAttempt = input.incrementAttempt !== false && !input.ignoreAttemptLimit
    // Auto and manual claims share the same persisted attempt ceiling.
    // Final-entity zero-model finish may ignore the ceiling without incrementing.
    const attemptClause = input.ignoreAttemptLimit
      ? ''
      : 'AND recovery_attempt_count < max_recovery_attempts'
    const manualPrep = input.manualConfirmed
      ? `
          cancel_requested = 0,
          finished_at = NULL,
          error_message = NULL,
          shutdown_kind = NULL,
          recovery_classification = CASE
            WHEN recovery_classification = 'manual-retry-required' THEN 'restartable'
            WHEN recovery_classification IS NULL THEN 'restartable'
            ELSE recovery_classification
          END,
          recovery_action = 'manual-retry',
          execution_phase = 'queued',
          timeout_at = COALESCE(?, timeout_at),
        `
      : `
          timeout_at = COALESCE(?, timeout_at),
        `

    const attemptId = randomUUID()
    const claimAndRecord = this.database.transaction(() => {
      const sql = `
        UPDATE tasks
        SET lease_owner = ?,
            lease_token = ?,
            lease_expires_at = ?,
            status = 'running',
            last_recovery_attempt_at = ?,
            recovery_attempt_count = recovery_attempt_count + ${incrementAttempt ? 1 : 0},
            runtime_session_id = COALESCE(?, runtime_session_id),
            shutdown_kind = NULL,
            ${manualPrep}
            updated_at = ?
        WHERE id = ?
          AND cancel_requested = ${input.manualConfirmed ? 'cancel_requested' : '0'}
          AND status IN ('pending', 'running', 'failed', 'cancelled')
          ${attemptClause}
          AND (lease_owner IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)
          ${classificationClause}
      `
      const params: Array<string | null> = [
        input.owner,
        input.leaseToken,
        input.leaseExpiresAt,
        input.nowIso,
        input.runtimeSessionId ?? null,
        input.timeoutAt ?? null,
        input.nowIso,
        input.taskId,
        input.nowIso,
      ]
      if (allowed && allowed.length > 0) {
        for (const item of allowed) params.push(item)
      }
      const result = this.database.prepare(sql).run(...params)
      if (result.changes === 0) {
        return { claimed: false as const, task: this.getById(input.taskId), attemptId: null }
      }
      const task = this.getById(input.taskId)
      if (!task) {
        return { claimed: false as const, task: null, attemptId: null }
      }
      this.database
        .prepare(
          `INSERT INTO recovery_attempts (
            id, task_id, recovery_root_task_id, attempt_number, kind, owner,
            runtime_session_id, lease_token, claimed_at, started_at, finished_at, outcome, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
        )
        .run(
          attemptId,
          task.id,
          task.recovery_root_task_id ?? task.id,
          task.recovery_attempt_count,
          input.kind,
          input.owner,
          input.runtimeSessionId ?? task.runtime_session_id,
          input.leaseToken,
          input.nowIso,
        )
      return { claimed: true as const, task, attemptId }
    })

    return claimAndRecord()
  }

  public renewLease(input: RenewLeaseInput): boolean {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET lease_expires_at = ?, updated_at = ?
         WHERE id = ?
           AND lease_owner = ?
           AND lease_token = ?
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at > ?`,
      )
      .run(
        input.leaseExpiresAt,
        input.nowIso,
        input.taskId,
        input.owner,
        input.leaseToken,
        input.nowIso,
      )
    return result.changes > 0
  }

  public releaseLease(taskId: string, leaseToken: string, nowIso: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE id = ? AND lease_token = ?`,
      )
      .run(nowIso, taskId, leaseToken)
    return result.changes > 0
  }

  public releaseLeasesForRuntimeSessions(
    sessionIds: readonly string[],
    nowIso: string,
  ): number {
    if (sessionIds.length === 0) return 0
    const placeholders = sessionIds.map(() => '?').join(', ')
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE runtime_session_id IN (${placeholders})
           AND lease_token IS NOT NULL`,
      )
      .run(nowIso, ...sessionIds)
    return result.changes
  }

  public markGracefulShutdown(nowIso: string, runtimeSessionId: string | null): number {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET shutdown_kind = 'graceful',
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             execution_phase = CASE
               WHEN status IN ('pending', 'running') THEN 'queued'
               ELSE execution_phase
             END,
             updated_at = ?
         WHERE status IN ('pending', 'running')
           AND (? IS NULL OR runtime_session_id = ? OR runtime_session_id IS NULL)`,
      )
      .run(nowIso, runtimeSessionId, runtimeSessionId)
    return result.changes
  }

  public expireLeases(nowIso: string): number {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = ?
         WHERE lease_expires_at IS NOT NULL AND lease_expires_at <= ?`,
      )
      .run(nowIso, nowIso)
    return result.changes
  }

  public markTerminalNonRecoverable(
    taskId: string,
    reason: string,
    nowIso: string,
  ): Task | null {
    this.database
      .prepare(
        `UPDATE tasks
         SET status = 'failed',
             stage = 'failed',
             execution_phase = 'failed',
             recovery_classification = 'non-recoverable',
             recovery_reason = ?,
             recovery_action = 'none',
             last_recovery_error = ?,
             error_message = COALESCE(error_message, ?),
             finished_at = COALESCE(finished_at, ?),
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = ?
         WHERE id = ?
           AND status IN ('pending', 'running', 'failed')`,
      )
      .run(reason, reason, reason, nowIso, nowIso, taskId)
    return this.getById(taskId)
  }

  private mapRowsIsolatingCorrupt(rows: TaskRow[]): Task[] {
    const result: Task[] = []
    const timestamp = now()
    for (const row of rows) {
      try {
        result.push(toTask(row))
      } catch (error) {
        const normalized = this.normalizeUnreadableRow(row, error, timestamp)
        if (normalized) result.push(normalized)
      }
    }
    return result
  }

  private normalizeUnreadableRow(
    row: TaskRow,
    error: unknown,
    nowIso: string,
  ): Task | null {
    if (error instanceof UnsupportedExecutionPhaseError) {
      this.markTaskUnsupportedPhase(row.id, nowIso)
      const phaseNormalized = this.database
        .prepare<TaskRow>('SELECT * FROM tasks WHERE id = ?')
        .get(row.id)
      if (!phaseNormalized) return null
      try {
        return toTask(phaseNormalized)
      } catch {
        // A row may contain both an unsupported phase and corrupt JSON.
        this.markTaskCorrupt(row, TASK_CORRUPTION_REASON, nowIso)
      }
    } else {
      this.markTaskCorrupt(row, TASK_CORRUPTION_REASON, nowIso)
    }
    const fixed = this.database
      .prepare<TaskRow>('SELECT * FROM tasks WHERE id = ?')
      .get(row.id)
    return fixed ? toTask(fixed) : null
  }

  /** Fail closed for a forward phase while preserving valid JSON evidence for audit/export. */
  private markTaskUnsupportedPhase(taskId: string, nowIso: string): void {
    this.database
      .prepare(
        `UPDATE tasks
         SET status = 'failed',
             stage = 'failed',
             execution_phase = 'failed',
             recovery_classification = 'non-recoverable',
             recovery_reason = ?,
             recovery_action = 'none',
             last_recovery_error = ?,
             error_message = ?,
             finished_at = COALESCE(finished_at, ?),
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             cancel_requested = 0,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        UNKNOWN_PHASE_REASON,
        UNKNOWN_PHASE_REASON,
        UNKNOWN_PHASE_REASON,
        nowIso,
        nowIso,
        taskId,
      )
  }

  /**
   * Fail-closed terminal write for unreadable rows. Clears bad checkpoint bytes without
   * re-parsing them, and never embeds raw payload content into the reason.
   */
  private markTaskCorrupt(row: TaskRow, reason: string, nowIso: string): void {
    const inputJson = this.isValidJsonObject(row.input_json) ? row.input_json : '{}'
    const checkpointJson = this.preserveJsonObject(row.checkpoint_json)
    const resultJson = this.preserveJsonObject(row.result_json)
    this.database
      .prepare(
        `UPDATE tasks
         SET status = 'failed',
             stage = 'failed',
             execution_phase = 'failed',
             recovery_classification = 'non-recoverable',
             recovery_reason = ?,
             recovery_action = 'none',
             last_recovery_error = ?,
             error_message = ?,
             input_json = ?,
             checkpoint_json = ?,
             result_json = ?,
             finished_at = COALESCE(finished_at, ?),
             lease_owner = NULL,
             lease_token = NULL,
             lease_expires_at = NULL,
             cancel_requested = 0,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        reason,
        reason,
        reason,
        inputJson,
        checkpointJson,
        resultJson,
        nowIso,
        nowIso,
        row.id,
      )
  }

  private isValidJsonObject(value: string): boolean {
    try {
      parseJsonObject(value, 'task')
      return true
    } catch {
      return false
    }
  }

  private preserveJsonObject(value: string | null): string | null {
    if (value === null || this.isValidJsonObject(value)) return value
    return null
  }
}
