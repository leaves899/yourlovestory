import { getSettings, updateSettings } from '../../shared/persistence/settingsStore'
import type { CredentialService } from '../security/credentialService'
import { getAppCredentialId, safeSettingsView } from '../security/llmCredentials'
import { isRecord, safeError, type IpcRegistrar } from './shared'

function stripLegacyCredentialValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLegacyCredentialValues)
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key.replace(/[\s_-]/g, '').toLowerCase() === 'apikey') continue
    result[key] = stripLegacyCredentialValues(item)
  }
  return result
}

export function registerSettingsIPC(
  ipc: IpcRegistrar,
  dependencies: {
    userDataPath: string
    credentialService?: CredentialService
  },
): void {
  const { userDataPath, credentialService } = dependencies

  ipc.handle('settings:get', async () => {
    try {
      const data = getSettings(userDataPath) as Record<string, unknown>
      const status = credentialService?.availability()
      const configured = credentialService
        ? credentialService.hasCredential(getAppCredentialId(data))
        : { success: true as const, data: false }
      return {
        success: true,
        data: status && configured.success
          ? safeSettingsView(data, status, configured.data)
          : stripLegacyCredentialValues(data),
      }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipc.handle('settings:update', async (_, params: unknown) => {
    try {
      if (!isRecord(params)) throw new Error('settings must be an object')
      const next = stripLegacyCredentialValues(params) as Record<string, unknown>
      delete next.credentialId
      const existing = getSettings(userDataPath) as Record<string, unknown>
      if (typeof existing.credentialId === 'string') {
        next.credentialId = existing.credentialId
      }
      const success = updateSettings(userDataPath, next)
      return { success }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })
}
