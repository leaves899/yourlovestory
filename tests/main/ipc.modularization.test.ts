import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

interface IpcHandler {
  (event: unknown, params?: unknown): unknown
}

const handlers = new Map<string, IpcHandler>()
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-ipc-modules-'))

const showSaveDialog = jest.fn()

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler): void => {
      if (handlers.has(channel)) {
        throw new Error(`IPC handler is already registered: ${channel}`)
      }
      handlers.set(channel, handler)
    },
  },
  app: {
    getPath: (): string => userDataPath,
    getAppPath: (): string => userDataPath,
    getName: (): string => 'yourcrush-test',
    getVersion: (): string => 'test-version',
    quit: (): void => undefined,
  },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showOpenDialog: jest.fn(),
  },
}))

import { setupIPC } from '@/main/ipc'
import { DatabaseRuntimeStatus } from '@/main/database'
import { BackupPolicyStore } from '@/main/backup'
import type { DiagnosticExportCoordinator } from '@/main/diagnostics'
import type { ChapterGenerationService } from '@/shared/chapterGeneration'
import type { TaskManager } from '@/main/tasks'
import type { LlmCredentialController } from '@/main/security/llmCredentialController'
import type { DatabaseStatus } from '@/shared/backup/types'
import type { ProjectPortabilityCoordinator } from '@/main/projectPortability'

const EXPECTED_CHANNELS = [
  'app:checkUpdate',
  'app:info',
  'app:quit',
  'backup:create',
  'backup:get-policy',
  'backup:get-status',
  'backup:list',
  'backup:restore',
  'backup:update-policy',
  'backup:verify',
  'chapter:blocks',
  'chapter:diff:revisions',
  'chapter:diff:versions',
  'chapter:revision:apply',
  'chapter:revision:get',
  'chapter:revisions',
  'chapterGeneration:start',
  'chapterGeneration:version:confirm',
  'chapterGeneration:version:get',
  'chapterGeneration:version:reject',
  'chapterGeneration:versions',
  'chapterPolish:start',
  'crush:create',
  'crush:delete',
  'crush:get',
  'crush:list',
  'crush:update',
  'day:delete',
  'day:generate',
  'day:get',
  'day:list',
  'day:update',
  'diagnostics:export',
  'foreshadow:events',
  'foreshadow:list',
  'foreshadow:suggest',
  'foreshadow:transition',
  'fragment:delete',
  'fragment:get',
  'fragment:integrate',
  'fragment:list',
  'fragment:record',
  'fragment:update',
  'llmCredential:delete',
  'llmCredential:deleteAll',
  'llmCredential:save',
  'llmCredential:status',
  'llmCredential:test',
  'narrativeMemory:approve',
  'narrativeMemory:extract',
  'narrativeMemory:list',
  'narrativeMemory:proposals',
  'narrativeMemory:reject',
  'projectPortability:cancelImport',
  'projectPortability:commitImport',
  'projectPortability:export',
  'projectPortability:inspectImport',
  'relationship:advancePhase',
  'relationship:detectSignals',
  'relationship:progress',
  'relationship:setPhase',
  'settings:get',
  'settings:update',
  'skill:list',
  'skill:toggle',
  'task:cancel',
  'task:get',
  'task:list',
  'task:recoverable',
  'task:resume',
  'task:run',
] as const

async function invoke<T>(channel: string, params?: unknown, event: unknown = {}): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`IPC handler is not registered: ${channel}`)
  return await handler(event, params) as T
}

describe('modular IPC registration', () => {
  beforeEach(() => {
    handlers.clear()
    showSaveDialog.mockReset()
  })

  afterAll(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  })

  it('registers the complete legacy channel contract exactly once', async () => {
    const audit = jest.fn()
    setupIPC({ audit })

    expect([...handlers.keys()].sort()).toEqual(EXPECTED_CHANNELS)
    await invoke('app:info')
    expect(audit.mock.calls.map(([event]) => event)).toEqual([
      { channel: 'app:info', outcome: 'started' },
      { channel: 'app:info', outcome: 'succeeded' },
    ])
  })

  it('preserves project and chapter identifier validation', async () => {
    const taskManager = {
      listByProject: jest.fn(),
    } as unknown as TaskManager
    const chapterGenerationService = {
      listVersions: jest.fn(),
    } as unknown as ChapterGenerationService
    setupIPC({ taskManager, chapterGenerationService })

    await expect(invoke('task:list', { projectId: '' })).rejects.toThrow(
      'projectId is required',
    )
    await expect(invoke('chapterGeneration:versions', {
      project_id: 'project-1',
      chapter_id: '',
    })).rejects.toThrow('chapter_id is required')
    expect(taskManager.listByProject).not.toHaveBeenCalled()
    expect(chapterGenerationService.listVersions).not.toHaveBeenCalled()
  })

  it('rejects invalid credential input and untrusted senders before controller access', async () => {
    const audit = jest.fn()
    const controller = {
      save: jest.fn(),
      status: jest.fn(),
    } as unknown as LlmCredentialController
    setupIPC({ credentialController: controller, audit })
    const trustedEvent = {
      senderFrame: { url: 'file:///app/index.html' },
    }

    const invalid = await invoke<{
      success: boolean
      error: { code: string }
    }>('llmCredential:save', {
      target: { scope: 'app' },
      secret: '',
    }, trustedEvent)
    expect(invalid).toMatchObject({
      success: false,
      error: { code: 'INVALID_INPUT' },
    })

    const untrusted = await invoke<{
      success: boolean
      error: { code: string }
    }>('llmCredential:status', { scope: 'app' }, {
      senderFrame: { url: 'https://untrusted.example/' },
    })
    expect(untrusted).toMatchObject({
      success: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(controller.save).not.toHaveBeenCalled()
    expect(controller.status).not.toHaveBeenCalled()
    expect(audit.mock.calls.map(([event]) => event)).toEqual([
      { channel: 'llmCredential:save', outcome: 'started' },
      { channel: 'llmCredential:save', outcome: 'failed' },
      { channel: 'llmCredential:status', outcome: 'started' },
      { channel: 'llmCredential:status', outcome: 'failed' },
    ])
  })

  it('filters credential fields and sanitizes sensitive controller failures', async () => {
    const secret = 'sk-test-secret-do-not-expose-123456'
    const controller = {
      status: jest.fn(() => {
        throw new Error(`Authorization: Bearer ${secret}`)
      }),
    } as unknown as LlmCredentialController
    setupIPC({ credentialController: controller })

    const updated = await invoke<{ success: boolean }>('settings:update', {
      provider: 'openai',
      apiKey: secret,
      nested: { api_key: secret, visible: true },
      credentialId: 'renderer-controlled',
    })
    expect(updated).toEqual({ success: true })
    const settings = await invoke<{ data: Record<string, unknown> }>('settings:get')
    expect(JSON.stringify(settings)).not.toContain(secret)
    expect(settings.data).toEqual({
      provider: 'openai',
      nested: { visible: true },
    })
    await expect(invoke('settings:update', null)).resolves.toMatchObject({
      success: false,
      errors: ['settings must be an object'],
    })

    const failure = await invoke<Record<string, unknown>>(
      'llmCredential:status',
      { scope: 'app' },
      { senderFrame: { url: 'file:///app/index.html' } },
    )
    expect(JSON.stringify(failure)).not.toContain(secret)
  })

  it('validates and authorizes backup operations through the shared registry', async () => {
    const audit = jest.fn()
    const backupService = {
      listBackups: jest.fn(async () => []),
      createBackup: jest.fn(),
      verifyBackup: jest.fn(),
      restoreBackup: jest.fn(),
      pruneBackups: jest.fn(),
    }
    const restoreBackup = jest.fn()
    setupIPC({
      backupService,
      restoreBackup,
      getDatabaseStatus: () => ({
        state: 'ready',
        integrity: 'ok',
        schemaVersion: 8,
        message: null,
        lastBackupAt: null,
        backupAllowed: true,
        backupEligibility: 'safe',
        backupBlockedReason: null,
      }),
      audit,
    })

    await expect(invoke('backup:list', { path: 'C:\\arbitrary.sqlite' })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_INVALID' },
    })
    await expect(invoke('backup:verify', { id: '' })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_INVALID' },
    })
    await expect(invoke('backup:restore', { id: 'backup-1', confirm: false })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_INVALID' },
    })
    await expect(invoke('backup:restore', {
      id: 'backup-1',
      confirm: true,
      path: 'C:\\arbitrary.sqlite',
    }, {
      senderFrame: { url: 'file:///app/index.html' },
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_INVALID' },
    })
    await expect(invoke('backup:restore', {
      id: 'backup-1',
      confirm: true,
      path: 'C:\\arbitrary.sqlite',
    }, {
      senderFrame: { url: 'https://untrusted.example/' },
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_INVALID' },
    })
    expect(restoreBackup).not.toHaveBeenCalled()
    expect(audit).toHaveBeenCalledWith({ channel: 'backup:restore', outcome: 'failed' })
  })

  it('rejects renderer paths, missing confirmation, untrusted senders, and recovery state', async () => {
    const coordinator = {
      commitImport: jest.fn(async () => ({ projectId: 'new-project' })),
      cancelImport: jest.fn(async () => ({ canceled: true as const })),
    } as unknown as ProjectPortabilityCoordinator
    const trustedEvent = { senderFrame: { url: 'file:///app/index.html' } }
    const readyStatus: DatabaseStatus = {
      state: 'ready',
      integrity: 'ok',
      schemaVersion: 8,
      message: null,
      lastBackupAt: null,
      backupAllowed: true,
      backupEligibility: 'safe',
      backupBlockedReason: null,
    }
    let status = readyStatus
    setupIPC({
      projectPortabilityCoordinator: coordinator,
      getDatabaseStatus: () => status,
    })

    await expect(invoke('projectPortability:commitImport', {
      importToken: 'opaque-token',
      confirm: true,
      path: 'C:\\renderer-controlled.json',
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'PROJECT_IMPORT_INVALID' },
    })
    await expect(invoke('projectPortability:commitImport', {
      importToken: 'opaque-token',
      confirm: false,
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'PROJECT_IMPORT_INVALID' },
    })
    await expect(invoke('projectPortability:cancelImport', {
      importToken: 'opaque-token',
    }, {
      senderFrame: { url: 'https://untrusted.example/' },
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'PROJECT_IMPORT_INVALID' },
    })
    expect(coordinator.commitImport).not.toHaveBeenCalled()
    expect(coordinator.cancelImport).not.toHaveBeenCalled()

    status = { ...readyStatus, state: 'recovery-required' }
    await expect(invoke('projectPortability:commitImport', {
      importToken: 'opaque-token',
      confirm: true,
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_RECOVERY_REQUIRED' },
    })
    expect(coordinator.commitImport).not.toHaveBeenCalled()
  })

  it('publishes live restore status and gates database-backed IPC after services close', async () => {
    const initialStatus: DatabaseStatus = {
      state: 'ready',
      integrity: 'ok',
      schemaVersion: 8,
      message: null,
      lastBackupAt: null,
      backupAllowed: true,
      backupEligibility: 'safe',
      backupBlockedReason: null,
    }
    const emitted: DatabaseStatus[] = []
    const runtimeStatus = new DatabaseRuntimeStatus(initialStatus, (status) => emitted.push(status))
    const taskManager = {
      listByProject: jest.fn(() => [{ id: 'task-1' }]),
    } as unknown as TaskManager
    const backupService = {
      listBackups: jest.fn(async () => []),
      createBackup: jest.fn(),
      verifyBackup: jest.fn(async () => ({ valid: true })),
      restoreBackup: jest.fn(),
      pruneBackups: jest.fn(),
    }
    const restoreBackup = jest.fn(async () => ({
      outcome: 'restored' as const,
      backupId: 'backup-1',
      preRestoreBackupId: null,
      relaunching: true as const,
    }))
    const trustedEvent = { senderFrame: { url: 'file:///app/index.html' } }

    setupIPC({
      taskManager,
      backupService,
      getDatabaseStatus: () => runtimeStatus.get(),
      restoreBackup,
    })

    await expect(invoke('task:list', { projectId: 'project-1' })).resolves.toEqual({
      success: true,
      data: [{ id: 'task-1' }],
    })
    runtimeStatus.beginRestore()
    expect(emitted.at(-1)).toMatchObject({
      state: 'restoring',
      backupAllowed: false,
    })
    await expect(invoke('task:list', { projectId: 'project-1' })).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_RECOVERY_REQUIRED' },
    })
    expect(taskManager.listByProject).toHaveBeenCalledTimes(1)
    await expect(invoke('backup:list', undefined, trustedEvent)).resolves.toEqual({
      success: true,
      data: [],
    })
    await expect(invoke('backup:verify', { id: 'backup-1' }, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: { valid: true },
    })
    await expect(invoke('backup:restore', {
      id: 'backup-1',
      confirm: true,
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'DATABASE_RECOVERY_REQUIRED' },
    })

    runtimeStatus.requireRecovery()
    expect(emitted.at(-1)).toMatchObject({
      state: 'recovery-required',
      integrity: 'unknown',
      backupAllowed: false,
    })
    await expect(invoke('backup:get-status', undefined, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: { state: 'recovery-required', backupAllowed: false },
    })
    await expect(invoke('backup:restore', {
      id: 'backup-1',
      confirm: true,
    }, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: { outcome: 'restored' },
    })
    expect(restoreBackup).toHaveBeenCalledWith('backup-1')
  })

  it('reads and updates backup policy through trusted IPC with immediate prune', async () => {
    const trustedEvent = { senderFrame: { url: 'file:///app/index.html' } }
    const policyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-policy-ipc-'))
    const policyStore = new BackupPolicyStore(policyRoot)
    const pruneBackups = jest.fn(async () => ({
      deleted: ['old-backup'],
      failed: [{ id: 'stuck-backup', error: '本地备份操作失败，请重试。' }],
      retained: ['kept-backup'],
      policyExceeded: false,
    }))
    const createBackup = jest.fn(async () => ({
      id: 'manual-1',
      filename: 'manual-1.sqlite',
      createdAt: '2026-03-10T00:00:00.000Z',
      reason: 'manual' as const,
      appVersion: '0.2.0-alpha.1',
      schemaVersion: 8,
      size: 100,
      sha256: 'a'.repeat(64),
    }))
    const backupService = {
      listBackups: jest.fn(async () => []),
      createBackup,
      verifyBackup: jest.fn(),
      restoreBackup: jest.fn(),
      pruneBackups,
    }

    setupIPC({
      backupService,
      backupPolicyStore: policyStore,
      getDatabaseStatus: () => ({
        state: 'ready',
        integrity: 'ok',
        schemaVersion: 8,
        message: null,
        lastBackupAt: null,
        backupAllowed: true,
        backupEligibility: 'safe',
        backupBlockedReason: null,
      }),
    })

    await expect(invoke('backup:get-policy', undefined, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: {
        policy: { maxBackups: 10, maxAgeDays: 30 },
        source: 'default',
        fallbackReason: 'missing',
      },
    })

    await expect(invoke('backup:update-policy', {
      maxBackups: 4,
      maxAgeDays: 12,
      path: 'C:\\evil',
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_POLICY_INVALID' },
    })
    await expect(invoke('backup:update-policy', {
      maxBackups: 4.5,
      maxAgeDays: 12,
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_POLICY_INVALID' },
    })
    await expect(invoke('backup:update-policy', {
      maxBackups: '4',
      maxAgeDays: 12,
    }, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_POLICY_INVALID' },
    })

    await expect(invoke('backup:update-policy', {
      maxBackups: 4,
      maxAgeDays: 12,
    }, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: {
        policy: { maxBackups: 4, maxAgeDays: 12 },
        prunePartialFailure: true,
        pruneCompleted: true,
        prune: {
          deleted: ['old-backup'],
          failed: [{ id: 'stuck-backup' }],
        },
      },
    })
    expect(pruneBackups).toHaveBeenCalledWith({ maxBackups: 4, maxAgeDays: 12 })
    expect(new BackupPolicyStore(policyRoot).load()).toMatchObject({
      policy: { maxBackups: 4, maxAgeDays: 12 },
      source: 'file',
    })

    // Manual create must read the persisted policy and prune in this process.
    pruneBackups.mockClear()
    createBackup.mockClear()
    await expect(invoke('backup:create', undefined, trustedEvent)).resolves.toMatchObject({
      success: true,
      data: { id: 'manual-1', reason: 'manual' },
    })
    expect(createBackup).toHaveBeenCalledWith({ reason: 'manual' })
    expect(pruneBackups).toHaveBeenCalledWith({ maxBackups: 4, maxAgeDays: 12 })

    // Policy is already saved; a total prune throw must not report save failure.
    const absolutePathError = new Error(
      'EPERM: operation not permitted, unlink \'C:\\\\Users\\\\Alice\\\\AppData\\\\Roaming\\\\yourcrush\\\\backups\\\\x.sqlite\'',
    )
    pruneBackups.mockImplementationOnce(async () => {
      throw absolutePathError
    })
    const pruneThrowResult = await invoke('backup:update-policy', {
      maxBackups: 5,
      maxAgeDays: 15,
    }, trustedEvent)
    expect(pruneThrowResult).toMatchObject({
      success: true,
      data: {
        policy: { maxBackups: 5, maxAgeDays: 15 },
        pruneCompleted: false,
        prunePartialFailure: false,
        prune: {
          deleted: [],
          failed: [],
          retained: [],
          policyExceeded: false,
        },
      },
    })
    expect(JSON.stringify(pruneThrowResult)).not.toContain('C:\\\\Users')
    expect(JSON.stringify(pruneThrowResult)).not.toContain('Alice')
    expect(JSON.stringify(pruneThrowResult)).not.toContain('AppData')
    expect(new BackupPolicyStore(policyRoot).load()).toMatchObject({
      policy: { maxBackups: 5, maxAgeDays: 15 },
      source: 'file',
    })

    await expect(invoke('backup:update-policy', {
      maxBackups: 6,
      maxAgeDays: 20,
    }, {
      senderFrame: { url: 'https://untrusted.example/' },
    })).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_POLICY_INVALID' },
    })

    fs.rmSync(policyRoot, { recursive: true, force: true })
  })

  it('exports diagnostics without renderer paths and allows recovery mode', async () => {
    const trustedEvent = { senderFrame: { url: 'file:///app/index.html' } }
    const exportToFile = jest.fn(async (target: string) => ({
      canceled: false as const,
      fileName: path.basename(target),
      size: 128,
      sha256: 'c'.repeat(64),
    }))
    const coordinator = {
      defaultFileName: () => 'diag.yourcrush-diagnostics.json',
      exportToFile,
    } as unknown as DiagnosticExportCoordinator
    let status: DatabaseStatus = {
      state: 'recovery-required',
      integrity: 'failed',
      schemaVersion: null,
      message: '数据库需要恢复后才能继续使用。',
      lastBackupAt: null,
      backupAllowed: false,
      backupEligibility: 'database-unavailable',
      backupBlockedReason: '数据库需要恢复后才能继续使用。',
    }

    setupIPC({
      diagnosticExportCoordinator: coordinator,
      getDatabaseStatus: () => status,
    })

    showSaveDialog.mockResolvedValue({ canceled: true })
    await expect(invoke('diagnostics:export', undefined, trustedEvent)).resolves.toEqual({
      success: true,
      data: { canceled: true },
    })
    expect(exportToFile).not.toHaveBeenCalled()

    showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: path.join(userDataPath, 'chosen.yourcrush-diagnostics.json'),
    })
    await expect(invoke('diagnostics:export', undefined, trustedEvent)).resolves.toEqual({
      success: true,
      data: {
        canceled: false,
        fileName: 'chosen.yourcrush-diagnostics.json',
        size: 128,
        sha256: 'c'.repeat(64),
      },
    })
    expect(exportToFile).toHaveBeenCalledWith(
      path.join(userDataPath, 'chosen.yourcrush-diagnostics.json'),
    )
    expect(JSON.stringify(await invoke('diagnostics:export', undefined, trustedEvent)))
      .not.toContain(userDataPath)

    await expect(invoke('diagnostics:export', { path: 'C:\\evil.json' }, trustedEvent))
      .resolves.toMatchObject({
        success: false,
        error: { code: 'LOCAL_IO_ERROR' },
      })

    status = { ...status, state: 'ready', integrity: 'ok', schemaVersion: 8 }
    await expect(invoke('backup:get-policy', undefined, trustedEvent)).resolves.toMatchObject({
      success: false,
      error: { code: 'BACKUP_POLICY_IO_ERROR' },
    })
  })
})
