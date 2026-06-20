import { app, BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import path from 'path'
import { setupIPC } from './ipc'

let mainWindow: BrowserWindow | null = null

/**
 * 数据迁移逻辑：将旧数据从项目根目录迁移到 userData 目录。
 * 打包后 app.getAppPath() 指向 asar 内部（只读），需要迁移到 userData 目录。
 * 只在 userData 目录下没有 crushes 目录时才进行迁移。
 */
function migrateData() {
  const appPath = app.getAppPath()
  const userDataPath = app.getPath('userData')

  // 迁移 settings.json
  const oldSettings = path.join(appPath, 'settings.json')
  const newSettings = path.join(userDataPath, 'settings.json')
  if (fs.existsSync(oldSettings) && !fs.existsSync(newSettings)) {
    try {
      fs.copyFileSync(oldSettings, newSettings)
      console.log('[Migration] settings.json 迁移成功')
    } catch (e) {
      console.error('[Migration] settings.json 迁移失败:', e)
    }
  }

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
    } catch (e) {
      console.error('[Migration] crushes 目录迁移失败:', e)
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
    mainWindow.webContents.openDevTools()
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
}

app.whenReady().then(() => {
  // 启动时执行数据迁移
  migrateData()

  createWindow()
  setupIPC()

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
