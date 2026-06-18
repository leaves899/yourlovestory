import { ipcMain, app } from 'electron'
import { runPython, buildArgs, parsePythonJSON } from '@/shared/pythonRunner'
import { getSettings, updateSettings } from '@/shared/persistence/settingsStore'
import {
  createCrush,
  listCrushes,
  getCrush,
  updateCrush,
  deleteCrush,
} from '@/shared/crush/crushStore'

/**
 * 统一调用 Python 业务模块并包装成 IPC 返回契约。
 *
 * 返回 { success: true, data } / { success: false, errors }，
 * 渲染进程依赖此结构，勿改。底层 spawn 逻辑见 src/shared/pythonRunner.ts。
 *
 * 业务失败时 Python 仍可能 exit 1 但 stdout 含 {success:false} JSON，
 * 故优先 parsePythonJSON：成功即返回 data；解析失败或无 JSON 则回退到 stderr/exitCode。
 */
async function callPython(
  modulePath: string,
  params: Record<string, any>
): Promise<{ success: boolean; data?: any; errors?: string[] }> {
  try {
    const result = await runPython(modulePath, buildArgs(params), {
      cwd: app.getAppPath(),
    })
    try {
      const data = parsePythonJSON(result.stdout)
      return { success: true, data }
    } catch {
      return {
        success: false,
        errors: [result.stderr || `Python exit ${result.exitCode}`],
      }
    }
  } catch (error: any) {
    return { success: false, errors: [error.message] }
  }
}

export function setupIPC() {
  // 日常写作
  ipcMain.handle('day:generate', (_, params) =>
    callPython('src.scripts.day.service', { action: 'generate', ...params })
  )

  ipcMain.handle('day:list', (_, params) =>
    callPython('src.scripts.day.service', { action: 'list', ...params })
  )

  ipcMain.handle('day:get', (_, params) =>
    callPython('src.scripts.day.service', { action: 'get', ...params })
  )

  ipcMain.handle('day:update', (_, params) =>
    callPython('src.scripts.day.service', { action: 'update', ...params })
  )

  ipcMain.handle('day:delete', (_, params) =>
    callPython('src.scripts.day.service', { action: 'delete', ...params })
  )

  // 碎片日记
  ipcMain.handle('fragment:record', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'record', ...params })
  )

  ipcMain.handle('fragment:list', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'list', ...params })
  )

  ipcMain.handle('fragment:get', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'get', ...params })
  )

  ipcMain.handle('fragment:update', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'update', ...params })
  )

  ipcMain.handle('fragment:delete', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'delete', ...params })
  )

  ipcMain.handle('fragment:integrate', (_, params) =>
    callPython('src.scripts.fragment.manager', { action: 'integrate', ...params })
  )

  // 角色管理（已迁移到 TS crushStore，不再走 Python 子进程）
  ipcMain.handle('crush:create', async (_, params) =>
    createCrush(app.getAppPath(), params)
  )

  ipcMain.handle('crush:list', async () => listCrushes(app.getAppPath()))

  ipcMain.handle('crush:get', async (_, params) => getCrush(app.getAppPath(), params.slug))

  ipcMain.handle('crush:update', async (_, params) => updateCrush(app.getAppPath(), params))

  ipcMain.handle('crush:delete', async (_, params) => deleteCrush(app.getAppPath(), params.slug))

  // 设置（已迁移到 TS settingsStore，不再走 Python 子进程）
  ipcMain.handle('settings:get', async () => {
    try {
      // projectRoot 用 app.getAppPath()，与原 Python __file__ 算出的项目根等价。
      // 注意：打包后指向 asar 内（只读），settings 应改用 app.getPath('userData')——
      // 属后续改进，本次保持与 Python 版行为等价。
      const data = getSettings(app.getAppPath())
      return { success: true, data }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('settings:update', async (_, params) => {
    try {
      const success = updateSettings(app.getAppPath(), params.settings ?? {})
      return { success }
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
