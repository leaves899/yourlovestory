import {
  parseCredentialScope,
  toSafeControllerFailure,
  type LlmCredentialController,
} from '../security/llmCredentialController'
import {
  assertTrustedCredentialSender,
  isRecord,
  readString,
  type IpcRegistry,
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
  ipc: IpcRegistry,
  controller?: LlmCredentialController,
): void {
  ipc.register('llmCredential:status', async (_event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    return controller.status(parseCredentialScope(value))
  }, {
    authorize: (event) => {
      if (controller) assertTrustedCredentialSender(event)
    },
    formatError: toSafeControllerFailure,
  })

  ipc.register('llmCredential:save', async (_event, value: unknown) => {
    if (!controller || !isRecord(value)) return UNAVAILABLE
    return controller.save(
      parseCredentialScope(value.target),
      readString(value.secret, 'secret'),
    )
  }, {
    authorize: (event, value) => {
      if (controller && isRecord(value)) assertTrustedCredentialSender(event)
    },
    formatError: toSafeControllerFailure,
  })

  ipc.register('llmCredential:delete', async (_event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    return controller.delete(parseCredentialScope(value))
  }, {
    authorize: (event) => {
      if (controller) assertTrustedCredentialSender(event)
    },
    formatError: toSafeControllerFailure,
  })

  ipc.register('llmCredential:test', async (_event, value: unknown) => {
    if (!controller) return UNAVAILABLE
    return await controller.test(parseCredentialScope(value))
  }, {
    authorize: (event) => {
      if (controller) assertTrustedCredentialSender(event)
    },
    formatError: toSafeControllerFailure,
  })

  ipc.register('llmCredential:deleteAll', async () => {
    if (!controller) return UNAVAILABLE
    return controller.deleteAll()
  }, {
    authorize: (event) => {
      if (controller) assertTrustedCredentialSender(event)
    },
    formatError: toSafeControllerFailure,
  })
}
