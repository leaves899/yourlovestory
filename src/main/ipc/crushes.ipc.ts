import {
  createCrush,
  deleteCrush,
  getCrush,
  listCrushes,
  updateCrush,
} from '../../shared/crush/crushStore'
import type { IpcRegistrar } from './shared'

export function registerCrushIPC(
  ipc: IpcRegistrar,
  dependencies: {
    userDataPath: string
    getAppPath: () => string
  },
): void {
  const { userDataPath, getAppPath } = dependencies

  ipc.handle('crush:create', async (_, params) =>
    createCrush(userDataPath, params, getAppPath())
  )
  ipc.handle('crush:list', async () => listCrushes(userDataPath))
  ipc.handle('crush:get', async (_, params) => getCrush(userDataPath, params.slug))
  ipc.handle('crush:update', async (_, params) => updateCrush(userDataPath, params))
  ipc.handle('crush:delete', async (_, params) => deleteCrush(userDataPath, params.slug))
}
