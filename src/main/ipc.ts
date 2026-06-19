import { ipcMain, app } from 'electron'
import { getSettings, updateSettings } from '../shared/persistence/settingsStore'
import {
  createCrush,
  listCrushes,
  getCrush,
  updateCrush,
  deleteCrush,
} from '../shared/crush/crushStore'
import {
  generateDay,
  listDays,
  getDay,
  updateDay,
  deleteDay,
} from '../shared/day/dayService'
import {
  managerRecordFragment,
  getFragmentsByDate,
  getFragment,
  managerUpdateFragment,
  managerDeleteFragment,
  managerIntegrateFragments,
} from '../shared/fragment/manager'
import { getCurrentDate } from '../shared/fragment/utils'

export function setupIPC() {
  // 日常写作（已迁移到 TS dayService）
  ipcMain.handle('day:generate', async (_, params) =>
    generateDay(app.getAppPath(), params)
  )

  ipcMain.handle('day:list', async (_, params) =>
    listDays(app.getAppPath(), params)
  )

  ipcMain.handle('day:get', async (_, params) =>
    getDay(app.getAppPath(), params)
  )

  ipcMain.handle('day:update', async (_, params) =>
    updateDay(app.getAppPath(), params)
  )

  ipcMain.handle('day:delete', async (_, params) =>
    deleteDay(app.getAppPath(), params)
  )

  // 碎片日记（已迁移到 TS fragment 模块，不再走 Python 子进程）
  // date 作为 currentDate（状态判断/文件定位基准）传入，与 Python ipc 行为等价；
  // 不传时 recordFragment 内部退化为今天。
  ipcMain.handle('fragment:record', async (_, params) => {
    const { date, slug, ...fragmentData } = params
    const result = managerRecordFragment(app.getAppPath(), slug, fragmentData, date)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:list', async (_, params) => ({
    success: true,
    data: getFragmentsByDate(app.getAppPath(), params.slug, params.date ?? getCurrentDate()),
  }))

  ipcMain.handle('fragment:get', async (_, params) => {
    const fragment = getFragment(app.getAppPath(), params.fragment_id)
    return fragment
      ? { success: true, data: fragment }
      : { success: false, errors: ['碎片不存在'] }
  })

  ipcMain.handle('fragment:update', async (_, params) => {
    const { fragment_id, slug, expected_version, ...updates } = params
    const result = managerUpdateFragment(app.getAppPath(), fragment_id, updates, expected_version)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:delete', async (_, params) =>
    managerDeleteFragment(app.getAppPath(), params.fragment_id, params.expected_version)
  )

  ipcMain.handle('fragment:integrate', async (_, params) => ({
    success: true,
    data: {
      prompt: managerIntegrateFragments(app.getAppPath(), params.slug, params.date ?? getCurrentDate()),
    },
  }))

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
