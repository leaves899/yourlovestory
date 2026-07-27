import type { App } from 'electron'
import type { IpcRegistry } from './shared'

export function registerAppIPC(ipc: IpcRegistry, app: App): void {
  ipc.register('app:info', async () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }))

  ipc.register('app:checkUpdate', async () => ({
    hasUpdate: false,
    version: app.getVersion(),
  }))

  ipc.register('app:quit', async () => {
    app.quit()
  })
}
