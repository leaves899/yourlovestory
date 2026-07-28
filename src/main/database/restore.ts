import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import type { DatabaseBackupService, RestoreExecutionResult } from '../backup'
import { backupError } from '../backup'
import { replaceDatabaseFromStagedFile } from './lifecycle'

export interface ExecuteDatabaseRestoreOptions {
  backupService: DatabaseBackupService
  backupId: string
  closeDatabase: () => void
  relaunch: () => void
  exit: () => void
  markRecoveryRequired?: () => void
  databaseAvailable?: boolean
  replaceDatabase?: (databasePath: string, stagedPath: string) => void
  verifyDatabase?: (filename: string) => void
}

function verifyRestoredDatabase(filename: string): void {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const quickCheck = database.pragma('quick_check') as Array<{ quick_check: string }>
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
      throw backupError('BACKUP_INVALID')
    }
  } finally {
    database.close()
  }
}

function relaunchAndExit(options: ExecuteDatabaseRestoreOptions): void {
  try {
    options.relaunch()
  } catch {
    throw backupError('RESTORE_FAILED')
  }
  options.exit()
}

function removeStagedDatabase(filename: string): void {
  fs.rmSync(filename, { force: true })
  fs.rmSync(`${filename}-wal`, { force: true })
  fs.rmSync(`${filename}-shm`, { force: true })
}

export async function executeDatabaseRestore(
  options: ExecuteDatabaseRestoreOptions,
): Promise<RestoreExecutionResult> {
  const prepared = await options.backupService.restoreBackup(options.backupId)
  if (!prepared.ready) {
    throw backupError(prepared.verification.errorCode ?? 'BACKUP_INVALID')
  }

  const databaseAvailable = options.databaseAvailable ?? true
  const preRestoreBackupId = databaseAvailable
    ? (await options.backupService.createBackup({ reason: 'pre-restore' })).id
    : null
  if (!databaseAvailable) {
    try {
      options.backupService.preserveCurrentDatabase('pre-restore-unusable')
    } catch {
      // A missing unusable database does not prevent restoring a verified backup.
    }
  }
  const staged = await options.backupService.stageRestore(options.backupId)
  const replaceDatabase = options.replaceDatabase ?? replaceDatabaseFromStagedFile
  const verifyDatabase = options.verifyDatabase ?? verifyRestoredDatabase
  options.closeDatabase()

  try {
    replaceDatabase(options.backupService.getDatabasePath(), staged)
    verifyDatabase(options.backupService.getDatabasePath())
  } catch {
    removeStagedDatabase(staged)
    try {
      options.backupService.preserveCurrentDatabase('restore-failed-target')
    } catch {
      // Keep the verified user backups as the primary recovery source.
    }
    if (databaseAvailable && preRestoreBackupId) {
      let rollbackSucceeded = false
      try {
        const rollback = await options.backupService.stageRestore(preRestoreBackupId)
        try {
          replaceDatabase(options.backupService.getDatabasePath(), rollback)
          verifyDatabase(options.backupService.getDatabasePath())
          rollbackSucceeded = true
        } finally {
          removeStagedDatabase(rollback)
        }
      } catch {
        options.markRecoveryRequired?.()
      }
      relaunchAndExit(options)
      return {
        outcome: rollbackSucceeded
          ? 'restore-failed-rolled-back'
          : 'restore-failed-recovery-required',
        backupId: options.backupId,
        preRestoreBackupId,
        relaunching: true,
      }
    }
    options.markRecoveryRequired?.()
    relaunchAndExit(options)
    return {
      outcome: 'restore-failed-recovery-required',
      backupId: options.backupId,
      preRestoreBackupId,
      relaunching: true,
    }
  }
  removeStagedDatabase(staged)
  relaunchAndExit(options)
  return {
    outcome: 'restored',
    backupId: options.backupId,
    preRestoreBackupId,
    relaunching: true,
  }
}
