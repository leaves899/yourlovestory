import { ipcMain, app } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

// 获取项目根目录
function getProjectRoot(): string {
  return app.getAppPath()
}

// 执行 Python 脚本
async function execPythonScript(scriptPath: string, params: any): Promise<string> {
  const projectRoot = getProjectRoot()
  const fullPath = path.join(projectRoot, scriptPath)
  const paramsJson = JSON.stringify(params)
  const command = `python "${fullPath}" --params '${paramsJson}'`

  const { stdout, stderr } = await execAsync(command, { cwd: projectRoot })

  if (stderr) {
    throw new Error(`Python script error: ${stderr}`)
  }

  return stdout
}

export function setupIPC() {
  // 日常写作
  ipcMain.handle('day:generate', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/day/pipeline.py', params)
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('day:list', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/day/service.py', { action: 'list', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('day:get', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/day/service.py', { action: 'get', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('day:update', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/day/service.py', { action: 'update', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('day:delete', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/day/service.py', { action: 'delete', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  // 碎片日记
  ipcMain.handle('fragment:record', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'record', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('fragment:list', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'list', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('fragment:get', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'get', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('fragment:update', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'update', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('fragment:delete', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'delete', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('fragment:integrate', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/fragment/manager.py', { action: 'integrate', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  // 角色管理
  ipcMain.handle('crush:create', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/init_template.py', params)
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('crush:list', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/init_template.py', { action: 'list', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('crush:get', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/init_template.py', { action: 'get', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('crush:update', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/init_template.py', { action: 'update', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('crush:delete', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/init_template.py', { action: 'delete', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  // 设置
  ipcMain.handle('settings:get', async () => {
    try {
      const result = await execPythonScript('src/scripts/utils/file_utils.py', { action: 'getSettings' })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('settings:update', async (_, params) => {
    try {
      const result = await execPythonScript('src/scripts/utils/file_utils.py', { action: 'updateSettings', ...params })
      return { success: true, data: JSON.parse(result) }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  // 应用
  ipcMain.handle('app:info', async () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    }
  })

  ipcMain.handle('app:checkUpdate', async () => {
    // TODO: 实现更新检查
    return { hasUpdate: false, version: app.getVersion() }
  })

  ipcMain.handle('app:quit', async () => {
    app.quit()
  })
}
