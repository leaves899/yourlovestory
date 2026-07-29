export type BackupReason = 'scheduled' | 'manual' | 'pre-migration' | 'pre-restore'

export interface BackupRecord {
  id: string
  filename: string
  createdAt: string
  reason: BackupReason
  appVersion: string
  schemaVersion: number
  size: number
  sha256: string
}

export interface CreateBackupOptions {
  reason: BackupReason
}

export interface BackupVerificationResult {
  id: string
  valid: boolean
  checkedAt: string
  error?: string
  errorCode?: BackupErrorCode
}

export interface RestorePreparationResult {
  id: string
  ready: boolean
  verification: BackupVerificationResult
}

export interface BackupRetentionPolicy {
  maxBackups: number
  maxAgeDays: number
}

/** Bounds for user-editable backup retention policy. */
export const BACKUP_POLICY_BOUNDS = {
  maxBackups: { min: 1, max: 100 },
  maxAgeDays: { min: 1, max: 3650 },
} as const

export const DEFAULT_BACKUP_RETENTION_POLICY: BackupRetentionPolicy = {
  maxBackups: 10,
  maxAgeDays: 30,
}

export const BACKUP_POLICY_FILE_VERSION = 1 as const

export interface BackupPolicyFileV1 {
  version: typeof BACKUP_POLICY_FILE_VERSION
  maxBackups: number
  maxAgeDays: number
}

export type BackupPolicyLoadSource = 'file' | 'default'

export type BackupPolicyFallbackReason = 'missing' | 'invalid' | 'io-error'

export interface BackupPolicyLoadResult {
  policy: BackupRetentionPolicy
  source: BackupPolicyLoadSource
  fallbackReason?: BackupPolicyFallbackReason
}

/**
 * Result of updating the persisted backup retention policy.
 *
 * `pruneCompleted` is false when the policy was saved but the prune step threw
 * entirely (distinct from per-item prune failures in `prune.failed`).
 * Callers must not treat a successful policy save as a failed save when prune
 * fails after persistence.
 */
export interface UpdateBackupPolicyResult {
  policy: BackupRetentionPolicy
  prune: PruneResult
  /** True when prune finished but some individual deletions failed. */
  prunePartialFailure: boolean
  /**
   * False when prune threw after the policy was already saved.
   * Never invents backup IDs; `prune.failed` stays empty in that case.
   */
  pruneCompleted: boolean
}

/** Empty prune summary used when cleanup throws after a successful policy save. */
export const EMPTY_PRUNE_RESULT: PruneResult = {
  deleted: [],
  failed: [],
  retained: [],
  policyExceeded: false,
}


export interface PruneFailure {
  id: string
  error: string
}

export interface PruneResult {
  deleted: string[]
  failed: PruneFailure[]
  retained: string[]
  policyExceeded: boolean
}

/**
 * Structured outcome for "backup created + retention cleanup".
 *
 * The backup is always on disk when this result is produced. Cleanup problems
 * must never be reported as backup-creation failure.
 */
export type BackupCreationOutcome =
  | 'backup-created'
  | 'backup-created-policy-cleanup-partial'
  | 'backup-created-policy-cleanup-failed'

export type BackupCleanupWarningCode =
  | 'BACKUP_CLEANUP_PARTIAL'
  | 'BACKUP_CLEANUP_FAILED'

/** Fixed, path-free Chinese messages for cleanup warnings. */
export const BACKUP_CLEANUP_WARNING_MESSAGES: Record<BackupCleanupWarningCode, string> = {
  BACKUP_CLEANUP_PARTIAL: '新备份已创建，但部分旧备份未清理',
  BACKUP_CLEANUP_FAILED: '新备份已创建，但旧备份清理失败或未完成',
}

export interface BackupCreationWarning {
  code: BackupCleanupWarningCode
  message: string
}

/** Non-sensitive prune counters safe for logs and IPC. */
export interface BackupCleanupSummary {
  deletedCount: number
  failedCount: number
  retainedCount: number
}

export interface BackupCreationResult {
  backup: BackupRecord
  outcome: BackupCreationOutcome
  /** False only when prune threw entirely after the backup was created. */
  cleanupCompleted: boolean
  /** True when prune finished but some individual deletions failed. */
  cleanupPartialFailure: boolean
  warning: BackupCreationWarning | null
  /**
   * Full prune summary when cleanup completed; empty when prune threw
   * (never invents backup IDs from underlying errors).
   */
  prune: PruneResult
  cleanupSummary: BackupCleanupSummary
}

export interface BackupCreationUserFeedback {
  title: string
  description: string | null
  status: 'success' | 'warning'
}

export function summarizePruneResult(prune: PruneResult): BackupCleanupSummary {
  return {
    deletedCount: prune.deleted.length,
    failedCount: prune.failed.length,
    retainedCount: prune.retained.length,
  }
}

/**
 * Build a serializable backup-creation result from a successful backup and a
 * prune attempt. Pass `'threw'` when prune rejected entirely.
 */
export function finalizeBackupCreation(
  backup: BackupRecord,
  pruneOutcome: PruneResult | 'threw',
): BackupCreationResult {
  if (pruneOutcome === 'threw') {
    return {
      backup,
      outcome: 'backup-created-policy-cleanup-failed',
      cleanupCompleted: false,
      cleanupPartialFailure: false,
      warning: {
        code: 'BACKUP_CLEANUP_FAILED',
        message: BACKUP_CLEANUP_WARNING_MESSAGES.BACKUP_CLEANUP_FAILED,
      },
      prune: {
        deleted: [],
        failed: [],
        retained: [],
        policyExceeded: false,
      },
      cleanupSummary: {
        deletedCount: 0,
        failedCount: 0,
        retainedCount: 0,
      },
    }
  }

  const cleanupSummary = summarizePruneResult(pruneOutcome)
  if (pruneOutcome.failed.length > 0) {
    return {
      backup,
      outcome: 'backup-created-policy-cleanup-partial',
      cleanupCompleted: true,
      cleanupPartialFailure: true,
      warning: {
        code: 'BACKUP_CLEANUP_PARTIAL',
        message: BACKUP_CLEANUP_WARNING_MESSAGES.BACKUP_CLEANUP_PARTIAL,
      },
      prune: pruneOutcome,
      cleanupSummary,
    }
  }

  return {
    backup,
    outcome: 'backup-created',
    cleanupCompleted: true,
    cleanupPartialFailure: false,
    warning: null,
    prune: pruneOutcome,
    cleanupSummary,
  }
}

/** Stable UI feedback for a successful backup creation (including cleanup warnings). */
export function describeBackupCreationFeedback(
  result: BackupCreationResult,
): BackupCreationUserFeedback {
  if (result.outcome === 'backup-created-policy-cleanup-failed') {
    return {
      title: '数据库备份已创建',
      description: result.warning?.message
        ?? BACKUP_CLEANUP_WARNING_MESSAGES.BACKUP_CLEANUP_FAILED,
      status: 'warning',
    }
  }
  if (result.outcome === 'backup-created-policy-cleanup-partial') {
    return {
      title: '数据库备份已创建',
      description: result.warning?.message
        ?? BACKUP_CLEANUP_WARNING_MESSAGES.BACKUP_CLEANUP_PARTIAL,
      status: 'warning',
    }
  }
  return {
    title: '数据库备份已创建',
    description: null,
    status: 'success',
  }
}

/**
 * Sanitized log detail for cleanup warnings. Returns null when no warning.
 * Never includes paths, usernames, backup IDs, filenames, or raw errors.
 */
export function backupCleanupLogDetail(
  result: Pick<BackupCreationResult, 'outcome' | 'cleanupSummary' | 'warning'>,
): {
  code: BackupCleanupWarningCode
  deletedCount: number
  failedCount: number
  retainedCount: number
} | null {
  if (result.outcome === 'backup-created' || !result.warning) return null
  return {
    code: result.warning.code,
    deletedCount: result.cleanupSummary.deletedCount,
    failedCount: result.cleanupSummary.failedCount,
    retainedCount: result.cleanupSummary.retainedCount,
  }
}

/**
 * Sanitized log detail for a standalone prune (startup path without new backup).
 */
export function standalonePruneLogDetail(
  pruneOutcome: PruneResult | 'threw',
): {
  code: BackupCleanupWarningCode
  deletedCount: number
  failedCount: number
  retainedCount: number
} | null {
  if (pruneOutcome === 'threw') {
    return {
      code: 'BACKUP_CLEANUP_FAILED',
      deletedCount: 0,
      failedCount: 0,
      retainedCount: 0,
    }
  }
  if (pruneOutcome.failed.length === 0) return null
  const summary = summarizePruneResult(pruneOutcome)
  return {
    code: 'BACKUP_CLEANUP_PARTIAL',
    deletedCount: summary.deletedCount,
    failedCount: summary.failedCount,
    retainedCount: summary.retainedCount,
  }
}

/**
 * Run create then prune, mapping cleanup failures to structured success.
 * Create failures still reject so callers report true backup failure.
 */
export async function createBackupThenApplyRetention(
  create: () => Promise<BackupRecord>,
  prune: () => Promise<PruneResult>,
): Promise<BackupCreationResult> {
  const backup = await create()
  try {
    return finalizeBackupCreation(backup, await prune())
  } catch {
    return finalizeBackupCreation(backup, 'threw')
  }
}

export type DatabaseBackupEligibility =
  | 'safe'
  | 'contains-legacy-plaintext-credentials'
  | 'credential-migration-pending'
  | 'database-unavailable'

export interface DatabaseStatus {
  state:
    | 'ready'
    | 'credential-migration-required'
    | 'restoring'
    | 'recovery-required'
    | 'migration-rolled-back'
  integrity: 'ok' | 'failed' | 'unknown'
  schemaVersion: number | null
  message: string | null
  lastBackupAt: string | null
  backupAllowed: boolean
  backupEligibility: DatabaseBackupEligibility
  backupBlockedReason: string | null
}

export const DATABASE_STATUS_CHANGED_CHANNEL = 'backup:status-changed'

export type BackupErrorCode =
  | 'BACKUP_NOT_FOUND'
  | 'BACKUP_INVALID'
  | 'BACKUP_CHECKSUM_MISMATCH'
  | 'BACKUP_NOT_ALLOWED'
  | 'BACKUP_POLICY_INVALID'
  | 'BACKUP_POLICY_IO_ERROR'
  | 'DATABASE_UNAVAILABLE'
  | 'DATABASE_RECOVERY_REQUIRED'
  | 'RESTORE_FAILED'
  | 'RESTORE_ROLLBACK_FAILED'
  | 'LOCAL_IO_ERROR'

export interface BackupError {
  code: BackupErrorCode
  message: string
}

export interface RestoreExecutionResult {
  outcome:
    | 'restored'
    | 'restore-failed-rolled-back'
    | 'restore-failed-recovery-required'
  backupId: string
  preRestoreBackupId: string | null
  relaunching: boolean
}
