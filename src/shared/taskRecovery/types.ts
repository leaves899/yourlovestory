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

/** Current checkpoint schema version for chapter-generation. */
export const CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION = 1

/** Current checkpoint schema version for chapter-polish. */
export const CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION = 1

/** Version of recovery metadata written by Phase D task creation. */
export const RECOVERY_METADATA_VERSION = 1

export const DEFAULT_MAX_RECOVERY_ATTEMPTS = 3
export const DEFAULT_LEASE_MS = 5 * 60 * 1000
export const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000
export const STARTUP_RECOVERY_CONCURRENCY = 2

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
