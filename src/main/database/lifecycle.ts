import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'
import {
  DatabaseBackupService,
  DEFAULT_BACKUP_RETENTION_POLICY,
  type DatabaseStatus,
  type InternalMigrationSnapshot,
} from '../backup'
import { inspectPlaintextCredentialState } from '../backup/credentialSafety'
import { getDatabasePath, openDatabase } from './database'
import {
  getAppliedMigrations,
  getPendingMigrations,
  migrations,
  runMigrations,
  type Migration,
} from './migrations'
import type { SqliteDatabase } from './types'

export interface CredentialMigrationResult {
  pending: number
  failed: number
  issues?: readonly unknown[]
}

export interface DatabaseLifecycleOptions<T extends CredentialMigrationResult> {
  userDataPath: string
  appVersion: string
  migrateCredentials: (database: SqliteDatabase) => T
  candidateMigrations?: readonly Migration[]
  now?: () => Date
  vacuumDatabase?: (database: SqliteDatabase) => void
}

export interface DatabaseLifecycleSuccess<T extends CredentialMigrationResult> {
  success: true
  database: SqliteDatabase
  backupService: DatabaseBackupService
  status: DatabaseStatus
  credentialMigration: T
  migrationBackup: InternalMigrationSnapshot | null
}

export interface DatabaseLifecycleFailure {
  success: false
  database: null
  backupService: DatabaseBackupService
  status: DatabaseStatus
  migrationBackup: InternalMigrationSnapshot | null
}

export type DatabaseLifecycleResult<T extends CredentialMigrationResult> =
  | DatabaseLifecycleSuccess<T>
  | DatabaseLifecycleFailure

function inspectDatabase(database: SqliteDatabase): number {
  const result = database.pragma('quick_check') as Array<{ quick_check: string }>
  if (result.length !== 1 || result[0]?.quick_check !== 'ok') {
    throw new Error('Database integrity check failed')
  }
  const applied = getAppliedMigrations(database)
  return applied[applied.length - 1]?.version ?? 0
}

function cleanupSidecars(databasePath: string): void {
  fs.rmSync(`${databasePath}-wal`, { force: true })
  fs.rmSync(`${databasePath}-shm`, { force: true })
}

function preserveFailedDatabase(databasePath: string, userDataPath: string, now: Date): void {
  if (!fs.existsSync(databasePath)) return
  const directory = path.join(userDataPath, 'backups', 'database', 'failed')
  fs.mkdirSync(directory, { recursive: true })
  const stem = `migration-failed-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
  fs.copyFileSync(databasePath, path.join(directory, `${stem}.sqlite`))
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${databasePath}${suffix}`
    if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, path.join(directory, `${stem}.sqlite${suffix}`))
  }
}

export function replaceDatabaseFromStagedFile(databasePath: string, stagedPath: string): void {
  const displacedPath = `${databasePath}.displaced-${randomUUID()}.tmp`
  let installedStagedDatabase = false
  cleanupSidecars(databasePath)
  try {
    if (fs.existsSync(databasePath)) fs.renameSync(databasePath, displacedPath)
    fs.renameSync(stagedPath, databasePath)
    installedStagedDatabase = true
    fs.rmSync(displacedPath, { force: true })
  } catch (error: unknown) {
    if (fs.existsSync(displacedPath)) {
      if (installedStagedDatabase) fs.rmSync(databasePath, { force: true })
      if (!fs.existsSync(databasePath)) fs.renameSync(displacedPath, databasePath)
    }
    fs.rmSync(stagedPath, { force: true })
    fs.rmSync(`${stagedPath}-wal`, { force: true })
    fs.rmSync(`${stagedPath}-shm`, { force: true })
    throw error
  }
}

export async function initializeDatabaseLifecycle<T extends CredentialMigrationResult>(
  options: DatabaseLifecycleOptions<T>,
): Promise<DatabaseLifecycleResult<T>> {
  const databasePath = getDatabasePath(options.userDataPath)
  const existedBeforeOpen = fs.existsSync(databasePath)
  let database: SqliteDatabase | null = null
  const backupService = new DatabaseBackupService({
    userDataPath: options.userDataPath,
    databasePath,
    appVersion: options.appVersion,
    getDatabase: () => database,
    now: options.now,
  })
  const failure = (
    state: DatabaseStatus['state'],
    message: string,
    migrationBackup: InternalMigrationSnapshot | null = null,
    integrity: DatabaseStatus['integrity'] = 'unknown',
  ): DatabaseLifecycleFailure => ({
    success: false,
    database: null,
    backupService,
    migrationBackup,
    status: {
      state,
      integrity,
      schemaVersion: null,
      message: sanitizeErrorMessage(message, 'Database startup failed'),
      lastBackupAt: null,
      backupAllowed: false,
      backupEligibility: 'database-unavailable',
      backupBlockedReason: sanitizeErrorMessage(message, 'Database startup failed'),
    },
  })

  try {
    database = openDatabase(options.userDataPath)
    inspectDatabase(database)
  } catch (error: unknown) {
    try {
      database?.close()
    } catch {
      // Preserve the original open error.
    }
    database = null
    return failure(
      'recovery-required',
      sanitizeErrorMessage(error, 'Database could not be opened or verified'),
      null,
      'failed',
    )
  }

  const candidateMigrations = options.candidateMigrations ?? migrations
  let pending: Migration[]
  try {
    pending = getPendingMigrations(database, candidateMigrations)
  } catch (error: unknown) {
    database.close()
    database = null
    return failure(
      'recovery-required',
      sanitizeErrorMessage(error, 'Migration state is invalid'),
      null,
      'ok',
    )
  }
  const credentialCleanupPendingAtStartup = pending.some(
    (migration) => migration.version === 8,
  )

  let migrationBackup: InternalMigrationSnapshot | null = null
  if (pending.length > 0 && existedBeforeOpen) {
    try {
      migrationBackup = await backupService.createInternalMigrationSnapshot()
    } catch (error: unknown) {
      database.close()
      database = null
      return failure(
        'recovery-required',
        sanitizeErrorMessage(error, 'Pre-migration backup failed'),
        null,
        'ok',
      )
    }
  }

  try {
    const credentialBoundary = candidateMigrations.filter((migration) => migration.version < 8)
    runMigrations(database, credentialBoundary)
    const credentialMigration = options.migrateCredentials(database)
    if (credentialMigration.pending > 0) {
      const schemaVersion = inspectDatabase(database)
      if (migrationBackup) {
        backupService.finalizeInternalMigrationSnapshot(migrationBackup, 'success')
        migrationBackup = null
      }
      return {
        success: true,
        database,
        backupService,
        credentialMigration,
        migrationBackup: null,
        status: {
          state: 'credential-migration-required',
          integrity: 'ok',
          schemaVersion,
          message: '请先完成凭据迁移，之后才能使用项目数据和数据库备份。',
          lastBackupAt: (await backupService.listBackups())[0]?.createdAt ?? null,
          backupAllowed: false,
          backupEligibility: 'credential-migration-pending',
          backupBlockedReason: '数据库仍包含尚未迁移的凭据。',
        },
      }
    }
    runMigrations(database, candidateMigrations)
    if (!inspectPlaintextCredentialState(database).safeForUserBackup) {
      throw new Error('Credential cleanup did not reach a backup-safe state')
    }
    if (credentialCleanupPendingAtStartup) {
      // DROP COLUMN can leave deleted credential bytes in SQLite free pages.
      // Rebuild once, immediately after v8, before the first visible backup.
      const vacuumDatabase = options.vacuumDatabase
        ?? ((candidate: SqliteDatabase) => candidate.exec('VACUUM'))
      vacuumDatabase(database)
      if (!inspectPlaintextCredentialState(database).safeForUserBackup) {
        throw new Error('Credential cleanup became unsafe after database vacuum')
      }
    }
    const schemaVersion = inspectDatabase(database)
    if (migrationBackup) {
      backupService.finalizeInternalMigrationSnapshot(migrationBackup, 'success')
      migrationBackup = null
    }
    let lastBackupAt: string | null = null
    try {
      await backupService.createScheduledBackupIfDue()
      await backupService.pruneBackups(
        DEFAULT_BACKUP_RETENTION_POLICY,
        [],
      )
      lastBackupAt = (await backupService.listBackups())[0]?.createdAt ?? lastBackupAt
    } catch {
      // A non-migration startup backup must not prevent the application from opening.
    }
    return {
      success: true,
      database,
      backupService,
      credentialMigration,
      migrationBackup,
      status: {
        state: 'ready',
        integrity: 'ok',
        schemaVersion,
        message: null,
        lastBackupAt,
        backupAllowed: true,
        backupEligibility: 'safe',
        backupBlockedReason: null,
      },
    }
  } catch (error: unknown) {
    try {
      database.close()
    } catch {
      // Continue recovery using the verified pre-migration snapshot.
    }
    database = null
    try {
      preserveFailedDatabase(databasePath, options.userDataPath, options.now?.() ?? new Date())
    } catch {
      // Recovery from the verified snapshot remains the priority if quarantine copying fails.
    }
    try {
      if (migrationBackup) {
        const staged = await backupService.stageInternalMigrationRestore(migrationBackup)
        replaceDatabaseFromStagedFile(databasePath, staged)
        const restored = openDatabase(options.userDataPath)
        try {
          inspectDatabase(restored)
        } finally {
          restored.close()
        }
        backupService.finalizeInternalMigrationSnapshot(migrationBackup, 'failed')
        return failure(
          'migration-rolled-back',
          sanitizeErrorMessage(error, 'Migration failed and was rolled back'),
          migrationBackup,
          'ok',
        )
      }
    } catch (restoreError: unknown) {
      if (migrationBackup) {
        try {
          backupService.finalizeInternalMigrationSnapshot(migrationBackup, 'failed')
        } catch {
          // Preserve the restore failure as the primary recovery signal.
        }
      }
      return failure(
        'recovery-required',
        sanitizeErrorMessage(restoreError, 'Migration rollback failed'),
        migrationBackup,
      )
    }
    return failure(
      'recovery-required',
      sanitizeErrorMessage(error, 'Initial database migration failed'),
      migrationBackup,
    )
  }
}
