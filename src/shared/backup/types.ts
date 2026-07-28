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
}

export interface DatabaseStatus {
  state: 'ready' | 'recovery-required' | 'migration-rolled-back'
  integrity: 'ok' | 'failed' | 'unknown'
  schemaVersion: number | null
  message: string | null
  lastBackupAt: string | null
}

export interface RestoreExecutionResult {
  restored: boolean
  backupId: string
  preRestoreBackupId: string
  relaunching: boolean
}
