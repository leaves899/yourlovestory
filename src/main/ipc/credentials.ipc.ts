import {
  parseCredentialScope,
  toSafeControllerFailure,
  type LlmCredentialController,
} from '../security/llmCredentialController'
import {
  assertTrustedCredentialSender,
  isRecord,
  readString,
  type IpcRegistrar,
} from './shared'

const UNAVAILABLE = {
  success: false as const,
  error: {
    code: 'UNAVAILABLE' as const,
    message: '\u51ed\u636e\u670d\u52a1\u672a\u521d\u59cb\u5316\u3002',
    retryable: true,
  },
}

export function registerCredentialIPC(
  ipc: IpcRegistrar,
  controller?: LlmCredentialController,
): void {
  ipc.handle('llmCredential:status', async (event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    try {
      assertTrustedCredentialSender(event)
      return controller.status(parseCredentialScope(value))
    } catch (error: unknown) {
      return toSafeControllerFailure(error)
    }
  })

  ipc.handle('llmCredential:save', async (event, value: unknown) => {
    if (!controller || !isRecord(value)) return UNAVAILABLE
    try {
      assertTrustedCredentialSender(event)
      return controller.save(
        parseCredentialScope(value.target),
        readString(value.secret, 'secret'),
      )
    } catch (error: unknown) {
      return toSafeControllerFailure(error)
    }
  })

  ipc.handle('llmCredential:delete', async (event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    try {
      assertTrustedCredentialSender(event)
      return controller.delete(parseCredentialScope(value))
    } catch (error: unknown) {
      return toSafeControllerFailure(error)
    }
  })

  ipc.handle('llmCredential:test', async (event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    try {
      assertTrustedCredentialSender(event)
      return await controller.test(parseCredentialScope(value))
    } catch (error: unknown) {
      return toSafeControllerFailure(error)
    }
  })

  ipc.handle('llmCredential:deleteAll', async (event) => {
    if (!controller) return UNAVAILABLE
    try {
      assertTrustedCredentialSender(event)
      return controller.deleteAll()
    } catch (error: unknown) {
      return toSafeControllerFailure(error)
    }
  })
}
