import { app, ipcMain } from 'electron'
import type { ChapterGenerationService } from '../../shared/chapterGeneration'
import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import type { SqliteDatabase } from '../database'
import type { AssistantService } from '../assistant'
import { registerAssistantIPC } from '../assistant'
import type { CredentialService } from '../security/credentialService'
import { LlmCredentialController } from '../security/llmCredentialController'
import type { TaskManager } from '../tasks'
import type { WorkbenchService } from '../workbench'
import { registerWorkbenchIPC } from '../workbench'
import { registerAppIPC } from './app.ipc'
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

export interface IpcSetupOptions {
  taskManager?: TaskManager
  workbenchService?: WorkbenchService
  assistantService?: AssistantService
  chapterGenerationService?: ChapterGenerationService
  narrativeWorkbenchService?: NarrativeWorkbenchService
  credentialService?: CredentialService
  database?: SqliteDatabase
  credentialController?: LlmCredentialController
}

export function setupIPC(options: IpcSetupOptions = {}): void {
  const userDataPath = app.getPath('userData')
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

  registerTaskIPC(ipcMain, options.taskManager)
  registerChapterIPC(ipcMain, {
    taskManager: options.taskManager,
    chapterGenerationService: options.chapterGenerationService,
  })
  registerMemoryIPC(ipcMain, narrativeWorkbenchService)
  registerForeshadowIPC(ipcMain, narrativeWorkbenchService)
  registerSkillIPC(ipcMain, narrativeWorkbenchService)
  registerRevisionIPC(ipcMain, narrativeWorkbenchService)
  registerChapterPolishIPC(ipcMain, options.taskManager)
  registerDayIPC(ipcMain, {
    userDataPath,
    credentialService: options.credentialService,
  })
  registerFragmentIPC(ipcMain, userDataPath)
  registerCrushIPC(ipcMain, {
    userDataPath,
    getAppPath: () => app.getAppPath(),
  })
  registerRelationshipIPC(ipcMain, userDataPath)
  registerSettingsIPC(ipcMain, {
    userDataPath,
    credentialService: options.credentialService,
  })
  registerCredentialIPC(ipcMain, credentialController)
  registerAppIPC(ipcMain, app)
}
