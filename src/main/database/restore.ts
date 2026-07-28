import Database from 'better-sqlite3'
import type { DatabaseBackupService, RestoreExecutionResult } from '../backup'
import { replaceDatabaseFromStagedFile } from './lifecycle'

export interface ExecuteDatabaseRestoreOptions {
  backupService: DatabaseBackupService
  backupId: string
  closeDatabase: () => void
  relaunch: () => void
  databaseAvailable?: boolean
}

function verifyRestoredDatabase(filename: string): void {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const quickCheck = database.pragma('quick_check') as Array<{ quick_check: string }>
    if (quickCheck.length !== 1 || quickCheck[0]?.quick_check !== 'ok') {
      throw new Error('Restored database integrity check failed')
    }
  } finally {
    database.close()
  }
}

export async function executeDatabaseRestore(
  options: ExecuteDatabaseRestoreOptions,
): Promise<RestoreExecutionResult> {
  const prepared = await options.backupService.restoreBackup(options.backupId)
  if (!prepared.ready) {
    throw new Error(prepared.verification.error ?? 'Backup verification failed')
  }

  const databaseAvailable = options.databaseAvailable ?? true
  const preRestoreBackupId = databaseAvailable
    ? (await options.backupService.createBackup({ reason: 'pre-restore' })).id
    : options.backupService.preserveCurrentDatabase('pre-restore-unusable')
  const staged = await options.backupService.stageRestore(options.backupId)
  options.closeDatabase()

  try {
    replaceDatabaseFromStagedFile(options.backupService.getDatabasePath(), staged)
    verifyRestoredDatabase(options.backupService.getDatabasePath())
  } catch (error: unknown) {
    if (databaseAvailable) {
      const rollback = await options.backupService.stageRestore(preRestoreBackupId)
      replaceDatabaseFromStagedFile(options.backupService.getDatabasePath(), rollback)
    }
    throw error
  }

  options.relaunch()
  return {
    restored: true,
    backupId: options.backupId,
    preRestoreBackupId,
    relaunching: true,
  }
}
