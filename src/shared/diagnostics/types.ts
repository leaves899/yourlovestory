import type { BackupReason, BackupRetentionPolicy, DatabaseStatus } from '../backup/types'

export const DIAGNOSTIC_FORMAT = 'yourcrush-diagnostics' as const
export const DIAGNOSTIC_FORMAT_VERSION = 1 as const
export const DIAGNOSTIC_FILE_EXTENSION = '.yourcrush-diagnostics.json'
export const DIAGNOSTIC_MAX_BYTES = 1 * 1024 * 1024

export const DIAGNOSTIC_EXCLUSIONS = [
  'project-body-and-chapters',
  'characters-and-relationships-private-records',
  'fragments-and-source-materials',
  'chat-sessions-and-messages',
  'task-input-result-checkpoint-error',
  'settings-json-raw',
  'environment-variables',
  'command-line-arguments',
  'userData-home-cwd-absolute-paths',
  'backup-ids-and-filenames',
  'database-files-wal-shm-backup-files',
  'security-directory-and-credential-payloads',
  'credential-ids-api-keys-tokens-secrets',
  'application-log-files',
] as const

export type DiagnosticErrorCode =
  | 'DIAGNOSTIC_EXPORT_FAILED'
  | 'DIAGNOSTIC_EXPORT_TOO_LARGE'
  | 'LOCAL_IO_ERROR'

export interface DiagnosticError {
  code: DiagnosticErrorCode
  message: string
}

export interface DiagnosticDatabaseSnapshot {
  state: DatabaseStatus['state']
  integrity: DatabaseStatus['integrity']
  schemaVersion: number | null
  message: string | null
}

export interface DiagnosticBackupStats {
  totalCount: number
  byReason: Record<BackupReason, number>
  latestBackupAt: string | null
  totalBytes: number
  schemaVersions: number[]
}

/**
 * Versioned allowlist diagnostic package. Field order is stabilized at
 * serialization time; do not rely on object key insertion order alone.
 */
export interface DiagnosticPackageV1 {
  format: typeof DIAGNOSTIC_FORMAT
  formatVersion: typeof DIAGNOSTIC_FORMAT_VERSION
  generatedAt: string
  appVersion: string
  platform: string
  arch: string
  electronVersion: string | null
  nodeVersion: string
  database: DiagnosticDatabaseSnapshot
  backupPolicy: BackupRetentionPolicy
  backupStats: DiagnosticBackupStats
  exclusions: readonly string[]
}

export type DiagnosticExportResult =
  | { canceled: true }
  | {
      canceled: false
      fileName: string
      size: number
      sha256: string
    }
