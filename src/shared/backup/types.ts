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

export interface UpdateBackupPolicyResult {
  policy: BackupRetentionPolicy
  prune: PruneResult
  prunePartialFailure: boolean
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
