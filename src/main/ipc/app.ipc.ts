import type { App } from 'electron'
import type { IpcRegistrar } from './shared'

export function registerAppIPC(ipc: IpcRegistrar, app: App): void {
  ipc.handle('app:info', async () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }))

  ipc.handle('app:checkUpdate', async () => ({
    hasUpdate: false,
    version: app.getVersion(),
  }))

  ipc.handle('app:quit', async () => {
    app.quit()
  })
}
