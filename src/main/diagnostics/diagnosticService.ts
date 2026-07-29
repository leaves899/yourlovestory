import type { BackupRecord, BackupRetentionPolicy, DatabaseStatus } from '../../shared/backup/types'
import {
  DIAGNOSTIC_EXCLUSIONS,
  DIAGNOSTIC_FORMAT,
  DIAGNOSTIC_FORMAT_VERSION,
  DIAGNOSTIC_MAX_BYTES,
  type DiagnosticBackupStats,
  type DiagnosticPackageV1,
} from '../../shared/diagnostics'
import { diagnosticError } from '../../shared/diagnostics/errors'
import { sha256, stableStringify } from '../../shared/diagnostics/stableJson'
import { sanitizeForExport, sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'

export interface BuildDiagnosticPackageInput {
  appVersion: string
  platform: string
  arch: string
  electronVersion: string | null
  nodeVersion: string
  generatedAt: string
  databaseStatus: DatabaseStatus
  backupPolicy: BackupRetentionPolicy
  backups: readonly BackupRecord[]
}

export interface BuiltDiagnosticPackage {
  package: DiagnosticPackageV1
  json: string
  sha256: string
  size: number
}

function emptyByReason(): DiagnosticBackupStats['byReason'] {
  return {
    scheduled: 0,
    manual: 0,
    'pre-migration': 0,
    'pre-restore': 0,
  }
}

/**
 * Aggregate backup metadata only. Never include backup ids, filenames, or
 * per-record hashes in the diagnostic package.
 */
export function aggregateBackupStats(
  backups: readonly BackupRecord[],
): DiagnosticBackupStats {
  const byReason = emptyByReason()
  const schemaVersionSet = new Set<number>()
  let totalBytes = 0
  let latestBackupAt: string | null = null

  for (const backup of backups) {
    byReason[backup.reason] += 1
    totalBytes += backup.size
    schemaVersionSet.add(backup.schemaVersion)
    if (!latestBackupAt || backup.createdAt > latestBackupAt) {
      latestBackupAt = backup.createdAt
    }
  }

  return {
    totalCount: backups.length,
    byReason,
    latestBackupAt,
    totalBytes,
    schemaVersions: [...schemaVersionSet].sort((left, right) => left - right),
  }
}

export function buildDiagnosticPackage(
  input: BuildDiagnosticPackageInput,
): BuiltDiagnosticPackage {
  const safeMessage = input.databaseStatus.message === null
    ? null
    : sanitizeErrorMessage(input.databaseStatus.message, '数据库状态异常')

  const raw: DiagnosticPackageV1 = {
    format: DIAGNOSTIC_FORMAT,
    formatVersion: DIAGNOSTIC_FORMAT_VERSION,
    generatedAt: input.generatedAt,
    appVersion: input.appVersion,
    platform: input.platform,
    arch: input.arch,
    electronVersion: input.electronVersion,
    nodeVersion: input.nodeVersion,
    database: {
      state: input.databaseStatus.state,
      integrity: input.databaseStatus.integrity,
      schemaVersion: input.databaseStatus.schemaVersion,
      message: safeMessage,
    },
    backupPolicy: {
      maxBackups: input.backupPolicy.maxBackups,
      maxAgeDays: input.backupPolicy.maxAgeDays,
    },
    backupStats: aggregateBackupStats(input.backups),
    exclusions: [...DIAGNOSTIC_EXCLUSIONS],
  }

  const sanitized = sanitizeForExport(raw) as DiagnosticPackageV1
  const json = `${stableStringify(sanitized)}\n`
  const size = Buffer.byteLength(json, 'utf8')
  if (size > DIAGNOSTIC_MAX_BYTES) {
    throw diagnosticError('DIAGNOSTIC_EXPORT_TOO_LARGE')
  }

  return {
    package: sanitized,
    json,
    sha256: sha256(json),
    size,
  }
}
