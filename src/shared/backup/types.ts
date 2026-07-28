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
