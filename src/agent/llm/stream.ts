import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Context,
  Model,
  StopReason,
} from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { ResolvedLlmConfig, LlmStreamDependencies } from './types'
import { emptyTokenUsage } from './types'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'

function isContentEvent(event: AssistantMessageEvent): boolean {
  return event.type !== 'start' && event.type !== 'done' && event.type !== 'error'
}

function createErrorMessage(
  model: Model<string>,
  reason: Extract<StopReason, 'error' | 'aborted'>,
  error: unknown,
): AssistantMessage {
  return {
    role: 'assistant',
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyTokenUsage(),
    stopReason: reason,
    errorMessage: sanitizeErrorMessage(error),
    timestamp: Date.now(),
  }
}

function defaultSleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Retry wait was cancelled'))
      },
      { once: true },
    )
  })
}

async function runAttempt(
  output: AssistantMessageEventStream,
  baseStream: StreamFn,
  model: Model<string>,
  context: Context,
  options: Parameters<StreamFn>[2],
  config: ResolvedLlmConfig,
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>,
): Promise<void> {
  const signal = options?.signal
  let attempt = 0

  for (;;) {
    if (signal?.aborted) {
      const error = createErrorMessage(model, 'aborted', 'LLM request was cancelled')
      output.push({ type: 'error', reason: 'aborted', error })
      output.end(error)
      return
    }

    const buffered: AssistantMessageEvent[] = []
    let hasContent = false
    let shouldRetry = false

    try {
      const source = await baseStream(model, context, {
        ...options,
        apiKey: config.apiKey,
        temperature: config.temperature,
        maxTokens: config.maxOutputTokens,
        maxRetries: 0,
        timeoutMs: config.timeoutMs,
        maxRetryDelayMs: config.maxRetryDelayMs,
      })

      for await (const event of source) {
        if (
          event.type === 'error' &&
          !hasContent &&
          attempt < config.maxRetries &&
          event.reason !== 'aborted'
        ) {
          shouldRetry = true
          break
        }

        if (!hasContent && isContentEvent(event)) {
          hasContent = true
          for (const pending of buffered) output.push(pending)
          buffered.length = 0
          output.push(event)
        } else if (hasContent) {
          output.push(event)
        } else {
          buffered.push(event)
        }
      }

      if (shouldRetry) {
        attempt += 1
        const delay = Math.min(
          config.maxRetryDelayMs,
          config.retryDelayMs * 2 ** (attempt - 1),
        )
        await sleep(delay, signal)
        continue
      }

      const result = await source.result()
      if (
        result.stopReason === 'error' &&
        !hasContent &&
        attempt < config.maxRetries &&
        !signal?.aborted
      ) {
        attempt += 1
        const delay = Math.min(
          config.maxRetryDelayMs,
          config.retryDelayMs * 2 ** (attempt - 1),
        )
        await sleep(delay, signal)
        continue
      }

      for (const pending of buffered) output.push(pending)
      output.end(result)
      return
    } catch (error) {
      if (signal?.aborted) {
        const aborted = createErrorMessage(model, 'aborted', 'LLM request was cancelled')
        output.push({ type: 'error', reason: 'aborted', error: aborted })
        output.end(aborted)
        return
      }
      if (attempt < config.maxRetries && !hasContent) {
        attempt += 1
        const delay = Math.min(
          config.maxRetryDelayMs,
          config.retryDelayMs * 2 ** (attempt - 1),
        )
        await sleep(delay, signal)
        continue
      }
      const failure = createErrorMessage(model, 'error', error)
      output.push({ type: 'error', reason: 'error', error: failure })
      output.end(failure)
      return
    }
  }
}

export function createRetryingStreamFn(
  baseStream: StreamFn,
  createStream: LlmStreamDependencies['createStream'],
  config: ResolvedLlmConfig,
  sleep: LlmStreamDependencies['sleep'] = defaultSleep,
): StreamFn {
  return (model, context, options) => {
    const output = createStream()
    void runAttempt(
      output,
      baseStream,
      model,
      context,
      options,
      config,
      sleep,
    )
    return output
  }
}
