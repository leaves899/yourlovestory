import type {
  BackupError,
  BackupPolicyStore,
  BackupService,
  DatabaseStatus,
  RestoreExecutionResult,
  UpdateBackupPolicyResult,
} from '../backup'
import {
  backupError,
  parseBackupPolicyUpdateInput,
  toBackupError,
} from '../backup'
import { EMPTY_PRUNE_RESULT } from '../../shared/backup/types'
import {
  assertTrustedIpcSender,
  isRecord,
  readString,
  type IpcRegistry,
} from './shared'

interface BackupIpcDependencies {
  backupService?: BackupService
  policyStore?: BackupPolicyStore
  getStatus: () => DatabaseStatus
  restoreBackup?: (id: string) => Promise<RestoreExecutionResult>
}

function requireService(service?: BackupService): BackupService {
  if (!service) throw backupError('DATABASE_UNAVAILABLE')
  return service
}

function requirePolicyStore(store?: BackupPolicyStore): BackupPolicyStore {
  if (!store) throw backupError('BACKUP_POLICY_IO_ERROR')
  return store
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

function parsePolicyUpdate(value: unknown) {
  return parseBackupPolicyUpdateInput(value)
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

  ipc.register('backup:create', async () => {
    const service = requireService(dependencies.backupService)
    const store = requirePolicyStore(dependencies.policyStore)
    const record = await service.createBackup({ reason: 'manual' })
    // Apply the current persisted retention policy in this process so users
    // cannot unbounded-grow backups without restarting or re-saving policy.
    const policy = store.load().policy
    await service.pruneBackups(policy)
    return { success: true as const, data: record }
  }, { parse: parseNoInput, authorize, formatError })

  ipc.register('backup:verify', async (_, input) => ({
    success: true,
    data: await requireService(dependencies.backupService).verifyBackup(input.id),
  }), { parse: parseBackupId, authorize, formatError })

  ipc.register('backup:restore', async (_, input) => {
    if (!dependencies.restoreBackup) throw new Error('Database restore is not available')
    return { success: true, data: await dependencies.restoreBackup(input.id) }
  }, { parse: parseRestore, authorize, formatError })

  ipc.register('backup:get-status', async () => {
    const status = dependencies.getStatus()
    return {
      success: true,
      data: {
        ...status,
        lastBackupAt: (await dependencies.backupService?.listBackups())?.[0]?.createdAt
          ?? status.lastBackupAt,
      },
    }
  }, { parse: parseNoInput, authorize, formatError })

  ipc.register('backup:get-policy', async () => {
    const loaded = requirePolicyStore(dependencies.policyStore).load()
    return {
      success: true as const,
      data: {
        policy: loaded.policy,
        source: loaded.source,
        fallbackReason: loaded.fallbackReason ?? null,
      },
    }
  }, { parse: parseNoInput, authorize, formatError })

  ipc.register('backup:update-policy', async (_, input) => {
    const store = requirePolicyStore(dependencies.policyStore)
    const service = requireService(dependencies.backupService)
    // Persist first. Prune failures after a successful write must not be
    // reported as "policy invalid / save failed".
    const policy = await store.save(input)
    try {
      const prune = await service.pruneBackups(policy)
      const result: UpdateBackupPolicyResult = {
        policy,
        prune,
        prunePartialFailure: prune.failed.length > 0,
        pruneCompleted: true,
      }
      return { success: true as const, data: result }
    } catch {
      // Policy is already on disk. Return a typed success with a stable, path-free
      // empty prune summary (do not invent backup IDs from underlying errors).
      const result: UpdateBackupPolicyResult = {
        policy,
        prune: { ...EMPTY_PRUNE_RESULT, failed: [], deleted: [], retained: [] },
        prunePartialFailure: false,
        pruneCompleted: false,
      }
      return { success: true as const, data: result }
    }
  }, {
    parse: parsePolicyUpdate,
    authorize,
    formatError: (error) => ({
      success: false as const,
      error: toBackupError(error, 'BACKUP_POLICY_INVALID'),
    }),
  })
}
