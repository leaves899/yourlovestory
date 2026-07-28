import type {
  BackupError,
  BackupService,
  DatabaseStatus,
  RestoreExecutionResult,
} from '../backup'
import { backupError, toBackupError } from '../backup'
import {
  assertTrustedIpcSender,
  isRecord,
  readString,
  type IpcRegistry,
} from './shared'

interface BackupIpcDependencies {
  backupService?: BackupService
  getStatus: () => DatabaseStatus
  restoreBackup?: (id: string) => Promise<RestoreExecutionResult>
}

function requireService(service?: BackupService): BackupService {
  if (!service) throw backupError('DATABASE_UNAVAILABLE')
  return service
}

function parseNoInput(value: unknown): undefined {
  if (value !== undefined) throw new Error('This operation does not accept input')
  return undefined
}

function parseBackupId(value: unknown): { id: string } {
  if (!isRecord(value)) throw new Error('Backup input is required')
  if (Object.keys(value).some((key) => key !== 'id')) {
    throw new Error('Backup input contains unsupported fields')
  }
  return { id: readString(value.id, 'id') }
}

function parseRestore(value: unknown): { id: string; confirm: true } {
  if (!isRecord(value)) throw new Error('Restore input is required')
  if (Object.keys(value).some((key) => key !== 'id' && key !== 'confirm')) {
    throw new Error('Restore input contains unsupported fields')
  }
  if (value.confirm !== true) throw new Error('Explicit restore confirmation is required')
  return { id: readString(value.id, 'id'), confirm: true }
}

const formatError = (error: unknown): { success: false; error: BackupError } => ({
  success: false,
  error: toBackupError(error, 'BACKUP_INVALID'),
})

export function registerBackupIPC(
  ipc: IpcRegistry,
  dependencies: BackupIpcDependencies,
): void {
  const authorize = assertTrustedIpcSender

  ipc.register('backup:list', async () => ({
    success: true,
    data: await requireService(dependencies.backupService).listBackups(),
  }), { parse: parseNoInput, authorize, formatError })

  ipc.register('backup:create', async () => ({
    success: true,
    data: await requireService(dependencies.backupService).createBackup({ reason: 'manual' }),
  }), { parse: parseNoInput, authorize, formatError })

  ipc.register('backup:verify', async (_, input) => ({
    success: true,
    data: await requireService(dependencies.backupService).verifyBackup(input.id),
  }), { parse: parseBackupId, authorize, formatError })

  ipc.register('backup:restore', async (_, input) => {
    if (!dependencies.restoreBackup) throw new Error('Database restore is not available')
    return { success: true, data: await dependencies.restoreBackup(input.id) }
  }, { parse: parseRestore, authorize, formatError })

  ipc.register('backup:get-status', async () => ({
    success: true,
    data: {
      ...dependencies.getStatus(),
      lastBackupAt: (await dependencies.backupService?.listBackups())?.[0]?.createdAt
        ?? dependencies.getStatus().lastBackupAt,
    },
  }), { parse: parseNoInput, authorize, formatError })
}
