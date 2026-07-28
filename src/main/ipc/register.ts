import { app, ipcMain } from 'electron'
import type { ChapterGenerationService } from '../../shared/chapterGeneration'
import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import type { SqliteDatabase } from '../database'
import type { AssistantService } from '../assistant'
import type {
  BackupService,
  DatabaseStatus,
  RestoreExecutionResult,
} from '../backup'
import { registerAssistantIPC } from '../assistant'
import type { CredentialService } from '../security/credentialService'
import { LlmCredentialController } from '../security/llmCredentialController'
import type { TaskManager } from '../tasks'
import type { WorkbenchService } from '../workbench'
import { registerWorkbenchIPC } from '../workbench'
import { registerAppIPC } from './app.ipc'
import { registerBackupIPC } from './backup.ipc'
import { registerChapterIPC, registerChapterPolishIPC } from './chapters.ipc'
import { registerCredentialIPC } from './credentials.ipc'
import { registerCrushIPC } from './crushes.ipc'
import { registerDayIPC } from './days.ipc'
import { registerForeshadowIPC } from './foreshadow.ipc'
import { registerFragmentIPC } from './fragments.ipc'
import { registerMemoryIPC } from './memory.ipc'
import { registerRelationshipIPC } from './relationships.ipc'
import { registerRevisionIPC } from './revisions.ipc'
import { registerSettingsIPC } from './settings.ipc'
import { registerSkillIPC } from './skills.ipc'
import { registerTaskIPC } from './tasks.ipc'
import { createIpcRegistry, type IpcAuditSink } from './shared'

export interface IpcSetupOptions {
  taskManager?: TaskManager
  workbenchService?: WorkbenchService
  assistantService?: AssistantService
  chapterGenerationService?: ChapterGenerationService
  narrativeWorkbenchService?: NarrativeWorkbenchService
  credentialService?: CredentialService
  database?: SqliteDatabase
  credentialController?: LlmCredentialController
  audit?: IpcAuditSink
  backupService?: BackupService
  databaseStatus?: DatabaseStatus
  restoreBackup?: (id: string) => Promise<RestoreExecutionResult>
}

export function setupIPC(options: IpcSetupOptions = {}): void {
  const userDataPath = app.getPath('userData')
  const ipc = createIpcRegistry(ipcMain, options.audit)
  const narrativeWorkbenchService = options.narrativeWorkbenchService
    ?? options.workbenchService?.narrative

  const invalidateCredentialRuntimes = (): void => {
    options.assistantService?.dispose()
    options.taskManager?.dispose()
  }

  const credentialController = options.credentialController
    ?? (options.credentialService
      ? new LlmCredentialController({
          userDataPath,
          credentialService: options.credentialService,
          workbenchService: options.workbenchService,
          database: options.database,
          invalidateRuntimes: invalidateCredentialRuntimes,
        })
      : undefined)

  registerWorkbenchIPC(options.workbenchService, invalidateCredentialRuntimes)
  registerAssistantIPC(
    options.assistantService,
    credentialController
      ? (projectId, input) => credentialController.runtimeConfig(projectId, input)
      : undefined,
  )

  registerTaskIPC(ipc, options.taskManager)
  registerChapterIPC(ipc, {
    taskManager: options.taskManager,
    chapterGenerationService: options.chapterGenerationService,
  })
  registerMemoryIPC(ipc, narrativeWorkbenchService)
  registerForeshadowIPC(ipc, narrativeWorkbenchService)
  registerSkillIPC(ipc, narrativeWorkbenchService)
  registerRevisionIPC(ipc, narrativeWorkbenchService)
  registerChapterPolishIPC(ipc, options.taskManager)
  registerDayIPC(ipc, {
    userDataPath,
    credentialService: options.credentialService,
  })
  registerFragmentIPC(ipc, userDataPath)
  registerCrushIPC(ipc, {
    userDataPath,
    getAppPath: () => app.getAppPath(),
  })
  registerRelationshipIPC(ipc, userDataPath)
  registerSettingsIPC(ipc, {
    userDataPath,
    credentialService: options.credentialService,
  })
  registerCredentialIPC(ipc, credentialController)
  registerAppIPC(ipc, app)
  registerBackupIPC(ipc, {
    backupService: options.backupService,
    getStatus: () => options.databaseStatus ?? {
      state: 'recovery-required',
      integrity: 'unknown',
      schemaVersion: null,
      message: 'Database status is unavailable',
      lastBackupAt: null,
    },
    restoreBackup: options.restoreBackup,
  })
}
