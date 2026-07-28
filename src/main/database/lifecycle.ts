import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'
import {
  DatabaseBackupService,
  DEFAULT_BACKUP_RETENTION_POLICY,
  type BackupRecord,
  type DatabaseStatus,
} from '../backup'
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
}

export interface DatabaseLifecycleSuccess<T extends CredentialMigrationResult> {
  success: true
  database: SqliteDatabase
  backupService: DatabaseBackupService
  status: DatabaseStatus
  credentialMigration: T
  migrationBackup: BackupRecord | null
}

export interface DatabaseLifecycleFailure {
  success: false
  database: null
  backupService: DatabaseBackupService
  status: DatabaseStatus
  migrationBackup: BackupRecord | null
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
  cleanupSidecars(databasePath)
  try {
    if (fs.existsSync(databasePath)) fs.renameSync(databasePath, displacedPath)
    fs.renameSync(stagedPath, databasePath)
    fs.rmSync(displacedPath, { force: true })
  } catch (error: unknown) {
    if (!fs.existsSync(databasePath) && fs.existsSync(displacedPath)) {
      fs.renameSync(displacedPath, databasePath)
    }
    fs.rmSync(stagedPath, { force: true })
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
    migrationBackup: BackupRecord | null = null,
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
      lastBackupAt: migrationBackup?.createdAt ?? null,
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

  let migrationBackup: BackupRecord | null = null
  if (pending.length > 0 && existedBeforeOpen) {
    try {
      migrationBackup = await backupService.createBackup({ reason: 'pre-migration' })
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
    if (credentialMigration.pending === 0) runMigrations(database, candidateMigrations)
    const schemaVersion = inspectDatabase(database)
    let lastBackupAt = migrationBackup?.createdAt ?? null
    try {
      await backupService.createScheduledBackupIfDue()
      await backupService.pruneBackups(
        DEFAULT_BACKUP_RETENTION_POLICY,
        migrationBackup ? [migrationBackup.id] : [],
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
        const staged = await backupService.stageRestore(migrationBackup.id)
        replaceDatabaseFromStagedFile(databasePath, staged)
        const restored = openDatabase(options.userDataPath)
        try {
          inspectDatabase(restored)
        } finally {
          restored.close()
        }
        return failure(
          'migration-rolled-back',
          sanitizeErrorMessage(error, 'Migration failed and was rolled back'),
          migrationBackup,
          'ok',
        )
      }
    } catch (restoreError: unknown) {
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
