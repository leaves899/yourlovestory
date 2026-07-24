import type { StreamFn } from '@earendil-works/pi-agent-core'
import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
} from '@earendil-works/pi-ai'
import {
  createContextBudgetTransformer,
  createDynamicPiModel,
  createRetryingStreamFn,
  normalizeLlmConfig,
} from '@/agent/llm'
import type { ResolvedLlmConfig } from '@/agent/llm'

class TestEventStream implements AsyncIterable<AssistantMessageEvent> {
  private readonly events: AssistantMessageEvent[] = []
  private readonly waiters: Array<() => void> = []
  private finalResult: AssistantMessage | undefined
  private resultResolve: ((result: AssistantMessage) => void) | undefined
  private readonly resultPromise = new Promise<AssistantMessage>((resolve) => {
    this.resultResolve = resolve
  })

  public push(event: AssistantMessageEvent): void {
    this.events.push(event)
    this.waiters.splice(0).forEach((resolve) => resolve())
  }

  public end(result: AssistantMessage): void {
    this.finalResult = result
    this.resultResolve?.(result)
    this.waiters.splice(0).forEach((resolve) => resolve())
  }

  public result(): Promise<AssistantMessage> {
    return this.resultPromise
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
    let index = 0
    while (this.finalResult === undefined || index < this.events.length) {
      if (index >= this.events.length) {
        await new Promise<void>((resolve) => this.waiters.push(resolve))
      }
      while (index < this.events.length) {
        yield this.events[index]
        index += 1
      }
    }
  }
}

function usage(): AssistantMessage['usage'] {
  return {
    input: 2,
    output: 3,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 5,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function assistant(model: Model<'openai-completions'>, stopReason: AssistantMessage['stopReason']): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: stopReason === 'stop' ? '完成' : '' }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: usage(),
    stopReason,
    timestamp: Date.now(),
  }
}

function sourceStream(
  events: AssistantMessageEvent[],
  result: AssistantMessage,
): AssistantMessageEventStream {
  const stream = new TestEventStream()
  events.forEach((event) => stream.push(event))
  stream.end(result)
  return stream as unknown as AssistantMessageEventStream
}

function baseContext() {
  return { messages: [] }
}

describe('统一 LLM 配置和动态模型', () => {
  test('normalizes compatible config and builds a dynamic Pi model', () => {
    const config = normalizeLlmConfig({
      baseUrl: 'https://example.invalid/v1/',
      model: 'writer-model',
      credentialId: 'llm:app-default',
      contextBudget: 10_000,
      maxOutputTokens: 1_000,
      maxRetries: 1,
    })
    const model = createDynamicPiModel(config)

    expect(config.baseUrl).toBe('https://example.invalid/v1')
    expect(model.api).toBe('openai-completions')
    expect(model.provider).toBe('openai-compatible')
    expect(model.id).toBe('writer-model')
    expect(model.contextWindow).toBe(10_000)
    expect(model.maxTokens).toBe(1_000)
  })

  test('rejects invalid endpoint and model settings', () => {
    expect(() => normalizeLlmConfig({ baseUrl: 'file:///tmp', model: 'x' })).toThrow()
    expect(() => normalizeLlmConfig({ baseUrl: 'http://example.invalid', model: 'x' })).toThrow()
    expect(() => normalizeLlmConfig({ baseUrl: 'http://127.0.0.1:11434', model: 'x' })).not.toThrow()
    expect(() => normalizeLlmConfig({ baseUrl: 'https://example.invalid', model: ' ' })).toThrow()
  })
})

describe('LLM stream cancellation and finite retries', () => {
  test('retries a transport error before streaming content and preserves chunks', async () => {
    const config: ResolvedLlmConfig = {
      ...normalizeLlmConfig({
      baseUrl: 'https://example.invalid/v1',
      model: 'writer-model',
      maxRetries: 1,
      retryDelayMs: 7,
      }),
      apiKey: 'sk-test-secret-do-not-expose-123456',
    }
    const model = createDynamicPiModel(config)
    const errorMessage = assistant(model, 'error')
    const successMessage = assistant(model, 'stop')
    let calls = 0
    const baseStream: StreamFn = () => {
      calls += 1
      if (calls === 1) {
        return sourceStream(
          [
            { type: 'start', partial: errorMessage },
            { type: 'error', reason: 'error', error: errorMessage },
          ],
          errorMessage,
        )
      }
      return sourceStream(
        [
          { type: 'start', partial: successMessage },
          { type: 'text_start', contentIndex: 0, partial: successMessage },
          { type: 'text_delta', contentIndex: 0, delta: '完成', partial: successMessage },
          { type: 'text_end', contentIndex: 0, content: '完成', partial: successMessage },
          { type: 'done', reason: 'stop', message: successMessage },
        ],
        successMessage,
      )
    }
    const delays: number[] = []
    const createStream = (): AssistantMessageEventStream => new TestEventStream() as unknown as AssistantMessageEventStream
    const stream = createRetryingStreamFn(baseStream, createStream, config, async (delay) => {
      delays.push(delay)
    })(model, baseContext())
    const events: AssistantMessageEvent[] = []
    for await (const event of stream) events.push(event)
    const result = await stream.result()

    expect(calls).toBe(2)
    expect(delays).toEqual([7])
    expect(events.some((event) => event.type === 'text_delta')).toBe(true)
    expect(result.stopReason).toBe('stop')
    expect(result.usage.totalTokens).toBe(5)
  })

  test('ends with aborted finish reason when the signal is already cancelled', async () => {
    const config: ResolvedLlmConfig = {
      ...normalizeLlmConfig({ baseUrl: 'https://example.invalid', model: 'writer-model' }),
      apiKey: 'sk-test-secret-do-not-expose-123456',
    }
    const model = createDynamicPiModel(config)
    const controller = new AbortController()
    controller.abort()
    const calls: number[] = []
    const baseStream: StreamFn = () => {
      calls.push(1)
      return sourceStream([], assistant(model, 'stop'))
    }
    const stream = createRetryingStreamFn(
      baseStream,
      () => new TestEventStream() as unknown as AssistantMessageEventStream,
      config,
    )(model, baseContext(), { signal: controller.signal })
    const result = await stream.result()

    expect(calls).toHaveLength(0)
    expect(result.stopReason).toBe('aborted')
  })
})

describe('context budget', () => {
  test('keeps the newest messages within the injected budget', async () => {
    const transformer = createContextBudgetTransformer(3, () => 1)
    const messages = [
      { role: 'user', content: 'old', timestamp: 1 },
      { role: 'assistant', content: [], api: 'x', provider: 'x', model: 'x', usage: usage(), stopReason: 'stop', timestamp: 2 },
      { role: 'user', content: 'new', timestamp: 3 },
      { role: 'user', content: 'latest', timestamp: 4 },
    ]
    const result = await transformer(messages)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(messages[1])
    expect(result[2]).toEqual(messages[3])
  })
})
