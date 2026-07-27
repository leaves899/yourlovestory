import {
  createCrush,
  deleteCrush,
  getCrush,
  listCrushes,
  updateCrush,
} from '../../shared/crush/crushStore'
import type { IpcRegistry } from './shared'

export function registerCrushIPC(
  ipc: IpcRegistry,
  dependencies: {
    userDataPath: string
    getAppPath: () => string
  },
): void {
  const { userDataPath, getAppPath } = dependencies

  ipc.register('crush:create', async (_, params) =>
    createCrush(userDataPath, params, getAppPath())
  )
  ipc.register('crush:list', async () => listCrushes(userDataPath))
  ipc.register('crush:get', async (_, params) => getCrush(userDataPath, params.slug))
  ipc.register('crush:update', async (_, params) => updateCrush(userDataPath, params))
  ipc.register('crush:delete', async (_, params) => deleteCrush(userDataPath, params.slug))
}
