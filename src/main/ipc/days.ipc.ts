import {
  deleteDay,
  generateDay,
  getDay,
  listDays,
  updateDay,
} from '../../shared/day/dayService'
import { getSettings } from '../../shared/persistence/settingsStore'
import type { CredentialService } from '../security/credentialService'
import { credentialBindingForProvider } from '../security/llmCredentials'
import type { IpcRegistrar } from './shared'

export function registerDayIPC(
  ipc: IpcRegistrar,
  dependencies: {
    userDataPath: string
    credentialService?: CredentialService
  },
): void {
  const { userDataPath, credentialService } = dependencies

  ipc.handle('day:generate', async (_, params) =>
    generateDay(userDataPath, params, {
      getCredential: async (credentialId) => {
        if (!credentialService) {
          throw new Error('\u7cfb\u7edf\u5b89\u5168\u5b58\u50a8\u672a\u521d\u59cb\u5316\u3002')
        }
        const settings = getSettings(userDataPath) as Record<string, unknown>
        const binding = credentialService.getCredentialBinding(credentialId)
        const expected = credentialBindingForProvider(settings.provider, settings.baseUrl)
        if (!binding.success) throw new Error(binding.error.message)
        if (
          !binding.data
          || binding.data.provider !== expected.provider
          || binding.data.baseUrl !== expected.baseUrl
        ) {
          throw new Error('Credential is restricted to its saved Provider endpoint.')
        }
        const result = credentialService.getCredential(credentialId)
        if (!result.success) throw new Error(result.error.message)
        return result.data
      },
    })
  )

  ipc.handle('day:list', async (_, params) => listDays(userDataPath, params))
  ipc.handle('day:get', async (_, params) => getDay(userDataPath, params))
  ipc.handle('day:update', async (_, params) => updateDay(userDataPath, params))
  ipc.handle('day:delete', async (_, params) => deleteDay(userDataPath, params))
}
