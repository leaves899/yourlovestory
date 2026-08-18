/**
 * Stable recovery classification protocol for crash-safe task resume.
 * Do not invent additional top-level categories without an ADR.
 */
export type RecoveryClassification =
  | 'resumable'
  | 'restartable'
  | 'manual-retry-required'
  | 'non-recoverable'

export type RecoveryAction =
  | 'auto-resume'
  | 'auto-restart'
  | 'manual-retry'
  | 'manual-confirm'
  | 'none'

export type ExecutionPhase =
  | 'queued'
  | 'preparing'
  | 'awaiting_model'
  | 'model_in_flight'
  | 'persisting_result'
  | 'finalizing'
  | 'completed'
  | 'cancelled'
  | 'failed'

export type ShutdownKind = 'graceful' | 'crash'

export type TaskRuntimeStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type RecoveryAttemptKind = 'auto' | 'manual'

export type RecoveryAttemptOutcome =
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'lost_lease'
  | 'aborted'
  | 'interrupted'
  | 'crashed'

/** Fixed reason when a crashed runtime session forces open attempts closed. */
export const CRASHED_ATTEMPT_REASON =
  '运行时会话异常中断，恢复尝试已稳定结束，未写入业务结果。'

/** Current checkpoint schema version for chapter-generation. */
export const CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION = 1

/** Current checkpoint schema version for chapter-polish. */
export const CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION = 1

/** Version of recovery metadata written by Phase D task creation. */
export const RECOVERY_METADATA_VERSION = 1

export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3
export const DEFAULT_LEASE_MS = 5 * 60 * 1000
/** Renew leases well before expiry so long tasks keep ownership. */
export const DEFAULT_LEASE_RENEW_MS = 60 * 1000
export const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000
export const STARTUP_RECOVERY_CONCURRENCY = 2
export const DEFAULT_QUIESCE_TIMEOUT_MS = 30_000

/** Fixed, non-sensitive reason written when task rows cannot be parsed safely. */
export const TASK_CORRUPTION_REASON =
  '任务恢复元数据或检查点已损坏，已稳定终止为不可恢复，请新建任务继续。'

export const UNKNOWN_PHASE_REASON =
  '任务执行阶段未知或来自未来版本，已稳定终止为不可恢复。'

export const TIMEOUT_RECOVERY_REASON =
  '任务已超过执行期限并已中止，禁止自动恢复；如需继续请人工确认后重试。'

export interface RecoveryDecision {
  classification: RecoveryClassification
  reason: string
  action: RecoveryAction
  /** Whether automatic startup recovery may claim and execute. */
  autoAllowed: boolean
  /** Whether a user may explicitly request a retry after confirmation. */
  manualRetryAllowed: boolean
}

export interface RecoverableTaskView {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  recovery_root_task_id: string | null
  task_type: string
  status: TaskRuntimeStatus
  stage: string
  progress: number
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
  lease_owner: string | null
  lease_expires_at: string | null
  timeout_at: string | null
  shutdown_kind: ShutdownKind | null
  cancel_requested: boolean
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  auto_allowed: boolean
  manual_retry_allowed: boolean
}

export interface ManualRetryRequest {
  taskId: string
  /** Explicit user intent confirmation token. Must be true. */
  confirmed: true
}

export interface RecoveryScanResult {
  scanned: number
  claimed: number
  skipped: number
  autoStarted: number
  failed: number
  terminated: number
  decisions: Array<{
    taskId: string
    classification: RecoveryClassification
    reason: string
    action: RecoveryAction
  }>
}

export interface RuntimeSessionRecord {
  id: string
  owner: string
  app_instance_id: string
  started_at: string
  ended_at: string | null
  end_reason: 'graceful' | 'forced' | null
}

export interface RecoveryAttemptRecord {
  id: string
  task_id: string
  recovery_root_task_id: string
  attempt_number: number
  kind: RecoveryAttemptKind
  owner: string
  runtime_session_id: string | null
  lease_token: string | null
  claimed_at: string
  started_at: string | null
  finished_at: string | null
  outcome: RecoveryAttemptOutcome | null
  error_message: string | null
}
