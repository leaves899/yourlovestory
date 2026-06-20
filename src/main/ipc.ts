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
import {
  loadProgress,
  confirmPhaseAdvance,
  setPhase,
  detectNarrativeSignals,
} from '../shared/relationship/manager'

// 用户数据目录（可读写），打包后指向 userData 而非 asar 内部
const userDataPath = app.getPath('userData')

export function setupIPC() {
  // 日常写作（已迁移到 TS dayService）
  ipcMain.handle('day:generate', async (_, params) =>
    generateDay(userDataPath, params)
  )

  ipcMain.handle('day:list', async (_, params) =>
    listDays(userDataPath, params)
  )

  ipcMain.handle('day:get', async (_, params) =>
    getDay(userDataPath, params)
  )

  ipcMain.handle('day:update', async (_, params) =>
    updateDay(userDataPath, params)
  )

  ipcMain.handle('day:delete', async (_, params) =>
    deleteDay(userDataPath, params)
  )

  // 碎片日记（已迁移到 TS fragment 模块，不再走 Python 子进程）
  // date 作为 currentDate（状态判断/文件定位基准）传入，与 Python ipc 行为等价；
  // 不传时 recordFragment 内部退化为今天。
  ipcMain.handle('fragment:record', async (_, params) => {
    const { date, slug, ...fragmentData } = params
    const result = managerRecordFragment(userDataPath, slug, fragmentData, date)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:list', async (_, params) => ({
    success: true,
    data: getFragmentsByDate(userDataPath, params.slug, params.date ?? getCurrentDate()),
  }))

  ipcMain.handle('fragment:get', async (_, params) => {
    const fragment = getFragment(userDataPath, params.fragment_id)
    return fragment
      ? { success: true, data: fragment }
      : { success: false, errors: ['碎片不存在'] }
  })

  ipcMain.handle('fragment:update', async (_, params) => {
    const { fragment_id, slug, expected_version, ...updates } = params
    const result = managerUpdateFragment(userDataPath, fragment_id, updates, expected_version)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:delete', async (_, params) =>
    managerDeleteFragment(userDataPath, params.fragment_id, params.expected_version)
  )

  ipcMain.handle('fragment:integrate', async (_, params) => ({
    success: true,
    data: {
      prompt: managerIntegrateFragments(userDataPath, params.slug, params.date ?? getCurrentDate()),
    },
  }))

  // 角色管理（已迁移到 TS crushStore，不再走 Python 子进程）
  // 模板在 asar 内（只读），用 app.getAppPath() 访问；用户数据在 userData 目录（可读写）
  ipcMain.handle('crush:create', async (_, params) =>
    createCrush(userDataPath, params, app.getAppPath())
  )

  ipcMain.handle('crush:list', async () => listCrushes(userDataPath))

  ipcMain.handle('crush:get', async (_, params) => getCrush(userDataPath, params.slug))

  ipcMain.handle('crush:update', async (_, params) => updateCrush(userDataPath, params))

  ipcMain.handle('crush:delete', async (_, params) => deleteCrush(userDataPath, params.slug))

  // 关系进度
  ipcMain.handle('relationship:progress', async (_, params) => {
    try {
      const progress = loadProgress(userDataPath, params.slug)
      return { success: true, data: progress }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('relationship:detectSignals', async (_, params) => {
    try {
      const result = detectNarrativeSignals(userDataPath, params.slug, params.narrativeText)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('relationship:advancePhase', async (_, params) => {
    try {
      const progress = confirmPhaseAdvance(userDataPath, params.slug, params.reason)
      return { success: true, data: progress }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('relationship:setPhase', async (_, params) => {
    try {
      const progress = setPhase(userDataPath, params.slug, params.phase)
      return { success: true, data: progress }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  // 设置（已迁移到 TS settingsStore，不再走 Python 子进程）
  ipcMain.handle('settings:get', async () => {
    try {
      const data = getSettings(userDataPath)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, errors: [error.message] }
    }
  })

  ipcMain.handle('settings:update', async (_, params) => {
    try {
      // 前端直接传递设置对象，而不是 params.settings
      const success = updateSettings(userDataPath, params)
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
