import type {
  BackupRecord,
  BackupRetentionPolicy,
  DatabaseStatus,
} from '../backup/types'
import { sanitizeForExport } from '../security/sanitizeSensitiveData'
import { diagnosticError } from './errors'
import { sha256, stableStringify } from './stableJson'
import {
  DIAGNOSTIC_EXCLUSIONS,
  DIAGNOSTIC_FORMAT,
  DIAGNOSTIC_FORMAT_VERSION,
  DIAGNOSTIC_MAX_BYTES,
  type DiagnosticBackupStats,
  type DiagnosticPackageV1,
} from './types'

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

/**
 * Fixed, non-sensitive diagnostic messages derived only from restricted
 * DatabaseStatus.state / integrity values. Never pass through upstream free text.
 */
export function mapDiagnosticDatabaseMessage(
  state: DatabaseStatus['state'],
  integrity: DatabaseStatus['integrity'],
): string | null {
  if (state === 'ready' && integrity === 'ok') {
    return null
  }

  switch (state) {
    case 'credential-migration-required':
      return '需要完成凭据迁移。'
    case 'restoring':
      return '数据库正在恢复。'
    case 'recovery-required':
      return '数据库需要恢复。'
    case 'migration-rolled-back':
      return '数据库迁移已回滚。'
    case 'ready':
      if (integrity === 'failed') return '数据库完整性检查失败。'
      if (integrity === 'unknown') return '数据库完整性状态未知。'
      return null
    default: {
      const _exhaustive: never = state
      void _exhaustive
      return '数据库状态异常。'
    }
  }
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

/**
 * Build a versioned allowlist diagnostic package. Uses fixed state/integrity
 * message mapping (never free text), then sanitizeForExport as a final defense.
 */
export function buildDiagnosticPackage(
  input: BuildDiagnosticPackageInput,
): BuiltDiagnosticPackage {
  const mappedMessage = mapDiagnosticDatabaseMessage(
    input.databaseStatus.state,
    input.databaseStatus.integrity,
  )

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
      message: mappedMessage,
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
