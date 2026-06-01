import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { setupIPC } from './ipc'

let mainWindow: BrowserWindow | null = null

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
      mainWindow?.loadFile(path.join(__dirname, '../renderer/index.html'))
    })
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
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
