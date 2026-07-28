import { app, BrowserWindow, safeStorage } from 'electron'
import * as fs from 'fs'
import path from 'path'
import { setupIPC } from './ipc'
import {
  ChatRepository,
  DATABASE_STATUS_CHANGED_CHANNEL,
  DatabaseRuntimeStatus,
  executeDatabaseRestore,
  initializeDatabaseLifecycle,
  shutdownDatabaseResources,
  TaskRepository,
} from './database'
import type { SqliteDatabase } from './database'
import {
  DatabaseBackupService,
  type RestoreExecutionResult,
} from './backup'
import { createProjectSessionAgentFactory } from '../agent/agent'
import {
  createChapterGenerationTaskRunner,
  createChapterPolishTaskRunner,
  createWebContentsTaskEventSink,
  TaskManager,
} from './tasks'
import { createWorkbenchService, type WorkbenchService } from './workbench'
import { assertChapterGenerationPreflight } from './workbench/firstChapterPreflight'
import {
  AssistantService,
  createWebContentsAssistantEventSink,
} from './assistant'
import { createNovelAgentTools } from '../agent/tools/novelTools'
import { CredentialService } from './security/credentialService'
import { migrateLegacyLlmCredentials } from './security/llmCredentials'
import { LlmCredentialController } from './security/llmCredentialController'
import { sanitizeErrorMessage } from '../shared/security/sanitizeSensitiveData'

let mainWindow: BrowserWindow | null = null
let database: SqliteDatabase | null = null
let taskManager: TaskManager | null = null
let workbenchService: WorkbenchService | null = null
let assistantService: AssistantService | null = null
let credentialService: CredentialService | null = null
let backupService: DatabaseBackupService | null = null
const databaseRuntime = new DatabaseRuntimeStatus({
  state: 'recovery-required',
  integrity: 'unknown',
  schemaVersion: null,
  message: '数据库尚未初始化。',
  lastBackupAt: null,
  backupAllowed: false,
  backupEligibility: 'database-unavailable',
  backupBlockedReason: '数据库尚未初始化。',
}, (status) => {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(DATABASE_STATUS_CHANGED_CHANNEL, status)
  }
})

const e2eUserDataPath = process.env.YOURCRUSH_E2E_USER_DATA
if (process.env.NODE_ENV === 'test' && e2eUserDataPath) {
  app.setPath('userData', path.resolve(e2eUserDataPath))
}

/**
 * 数据迁移逻辑：将旧数据从项目根目录迁移到 userData 目录。
 * 打包后 app.getAppPath() 指向 asar 内部（只读），需要迁移到 userData 目录。
 * 只在 userData 目录下没有 crushes 目录时才进行迁移。
 */
function migrateData() {
  const appPath = app.getAppPath()
  const userDataPath = app.getPath('userData')

  // 迁移 crushes 目录（排除 TEMPLATE）
  // 只在 userData 目录下没有 crushes 目录时才进行迁移
  const oldCrushesDir = path.join(appPath, 'crushes')
  const newCrushesDir = path.join(userDataPath, 'crushes')

  // 检查是否需要迁移：如果 userData 下已有 crushes 目录，则跳过迁移
  if (fs.existsSync(oldCrushesDir) && !fs.existsSync(newCrushesDir)) {
    try {
      fs.mkdirSync(newCrushesDir, { recursive: true })

      const entries = fs.readdirSync(oldCrushesDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name === 'TEMPLATE') continue // 模板不迁移
        if (!entry.isDirectory()) continue

        const src = path.join(oldCrushesDir, entry.name)
        const dst = path.join(newCrushesDir, entry.name)

        if (!fs.existsSync(dst)) {
          // 递归复制目录
          fs.cpSync(src, dst, { recursive: true })
          console.log(`[Migration] 角色 ${entry.name} 迁移成功`)
        }
      }
    } catch (error: unknown) {
      console.error('[Migration] crushes 目录迁移失败:', sanitizeErrorMessage(error))
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
    show: false,
  })

  // 开发环境：检查是否为打包前（resourcesPath 包含 node_modules）
  const isDev = process.resourcesPath.includes('node_modules')

  if (isDev) {
    // 尝试加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      // 如果开发服务器不可用，加载构建后的文件
      mainWindow?.loadFile(path.join(__dirname, '../../renderer/index.html'))
    })
    if (process.env.NODE_ENV !== 'test') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'))
  }

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault()
  })
}

async function restoreDatabaseBackup(id: string): Promise<RestoreExecutionResult> {
  if (!backupService) throw new Error('Database restore is not available')
  const databaseAvailable = database !== null
  return executeDatabaseRestore({
    backupService,
    backupId: id,
    databaseAvailable,
    markRestoring: () => databaseRuntime.beginRestore(),
    closeDatabase: () => {
      const taskManagerToDispose = taskManager
      taskManager = null
      const assistantServiceToDispose = assistantService
      assistantService = null
      workbenchService = null
      const databaseToClose = database
      const result = shutdownDatabaseResources({
        taskManager: taskManagerToDispose,
        assistantService: assistantServiceToDispose,
        database: databaseToClose,
      })
      if (result.databaseClosed) {
        database = null
      }
      if (result.serviceCleanupFailed) {
        console.warn('[DatabaseRestore] Service cleanup was incomplete')
      }
      return result
    },
    relaunch: () => {
      app.relaunch()
    },
    exit: () => app.exit(0),
    markRecoveryRequired: () => databaseRuntime.requireRecovery(),
  })
}

app.whenReady().then(async () => {
  // 启动时执行数据迁移
  migrateData()
  credentialService = new CredentialService(app.getPath('userData'), safeStorage)
  const lifecycle = await initializeDatabaseLifecycle({
    userDataPath: app.getPath('userData'),
    appVersion: app.getVersion(),
    migrateCredentials: (candidateDatabase) => migrateLegacyLlmCredentials(
      app.getPath('userData'),
      app.getAppPath(),
      candidateDatabase,
      credentialService!,
    ),
  })
  backupService = lifecycle.backupService
  databaseRuntime.replace(lifecycle.status)
  createWindow()

  if (!lifecycle.success) {
    console.error('[DatabaseStartup]', lifecycle.status.state, lifecycle.status.message)
    setupIPC({
      backupService,
      getDatabaseStatus: () => databaseRuntime.get(),
      restoreBackup: restoreDatabaseBackup,
    })
    return
  }

  database = lifecycle.database
  const credentialMigration = lifecycle.credentialMigration
  if (credentialMigration.pending > 0) {
    console.warn('[CredentialMigration] pending', {
      pending: credentialMigration.pending,
      failed: credentialMigration.failed,
    })
  }
  if (lifecycle.status.state !== 'ready') {
    setupIPC({
      credentialService,
      database,
      backupService,
      getDatabaseStatus: () => databaseRuntime.get(),
      restoreBackup: restoreDatabaseBackup,
    })
    return
  }
  workbenchService = createWorkbenchService(database, { projectRoot: app.getPath('userData') })
  const llmCredentialController = new LlmCredentialController({
    userDataPath: app.getPath('userData'),
    credentialService,
    workbenchService,
    database,
    migrationIssues: credentialMigration.issues,
    invalidateRuntimes: () => {
      assistantService?.dispose()
      taskManager?.dispose()
    },
  })
  const agentFactory = createProjectSessionAgentFactory({
    resolveCredential: async (credentialId, config) => {
      const binding = credentialService!.getCredentialBinding(credentialId)
      if (!binding.success) throw new Error(binding.error.message)
      if (
        !binding.data
        || binding.data.provider !== config.provider
        || binding.data.baseUrl !== config.baseUrl
      ) {
        throw new Error('该凭据只能用于保存时绑定的 Provider 接口。')
      }
      const resolved = credentialService!.getCredential(credentialId)
      if (!resolved.success) throw new Error(resolved.error.message)
      return resolved.data
    },
  })
  taskManager = new TaskManager({
    store: new TaskRepository(database),
    agentFactory,
    events: createWebContentsTaskEventSink(() => mainWindow?.webContents ?? null),
    runners: {
      'chapter-generation': createChapterGenerationTaskRunner({
        service: workbenchService.chapterGeneration,
        agentFactory,
      }),
      'chapter-polish': createChapterPolishTaskRunner({
        service: workbenchService.narrative,
        agentFactory,
      }),
    },
    resolveLlmConfig: (projectId, input) =>
      llmCredentialController.runtimeConfig(projectId, input),
    validateChapterGeneration: (input) =>
      assertChapterGenerationPreflight(workbenchService!, input),
  })
  assistantService = new AssistantService({
    store: new ChatRepository(database),
    agentFactory,
    events: createWebContentsAssistantEventSink(() => mainWindow?.webContents ?? null),
    loadAdditionalTools: async (projectId, sessionId, llm) =>
      workbenchService
        ? createNovelAgentTools(workbenchService, projectId, {
            sessionId,
            llm,
            startChapterGeneration: (input) => taskManager!.startChapterGeneration(input),
            startChapterPolish: (input) => taskManager!.startChapterPolish(input),
          })
        : [],
  })
  setupIPC({
    taskManager,
    workbenchService,
    assistantService,
    chapterGenerationService: workbenchService.chapterGeneration,
    narrativeWorkbenchService: workbenchService.narrative,
    credentialService,
    database,
    credentialController: llmCredentialController,
    backupService,
    getDatabaseStatus: () => databaseRuntime.get(),
    restoreBackup: restoreDatabaseBackup,
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  taskManager?.dispose()
  taskManager = null
  assistantService?.dispose()
  assistantService = null
  credentialService = null
  workbenchService = null
  database?.close()
  database = null
})
