import { generateNarrative } from '@/shared/ai/aiClient'
import type { AICallParams } from '@/shared/ai/aiClient'

describe('aiClient', () => {
  let mockFetch: jest.Mock

  beforeEach(() => {
    mockFetch = jest.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    mockFetch.mockReset()
  })

  function makeParams(overrides: Partial<AICallParams> = {}): AICallParams {
    return {
      systemPrompt: '系统提示',
      userPrompt: '用户提示',
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-20250514',
      apiKey: 'sk-test-key',
      ...overrides,
    }
  }

  function anthropicSuccess(text: string) {
    return {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
      }),
      text: async () => '',
    }
  }

  function openAISuccess(text: string) {
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: text } }],
      }),
      text: async () => '',
    }
  }

  function apiErrorResponse(status: number, body: string) {
    return {
      ok: false,
      status,
      json: async () => { throw new Error('not json') },
      text: async () => body,
    }
  }

  describe('generateNarrative 参数校验', () => {
    test('apiKey 为空字符串', async () => {
      await expect(generateNarrative(makeParams({ apiKey: '' }))).rejects.toThrow('API Key 未配置')
    })

    test('apiKey 为 undefined', async () => {
      await expect(generateNarrative(makeParams({ apiKey: undefined as any }))).rejects.toThrow('API Key 未配置')
    })

    test('systemPrompt 为空字符串', async () => {
      await expect(generateNarrative(makeParams({ systemPrompt: '' }))).rejects.toThrow('系统 Prompt 不能为空')
    })

    test('systemPrompt 为 undefined', async () => {
      await expect(generateNarrative(makeParams({ systemPrompt: undefined as any }))).rejects.toThrow('系统 Prompt 不能为空')
    })
  })

  describe('Anthropic API 调用', () => {
    test('成功调用，返回文本内容', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('叙事内容'))
      const result = await generateNarrative(makeParams())
      expect(result).toBe('叙事内容')
    })

    test('多个 content block 拼接', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            { type: 'text', text: '第一部分' },
            { type: 'text', text: '第二部分' },
          ],
          stop_reason: 'end_turn',
        }),
        text: async () => '',
      })
      const result = await generateNarrative(makeParams())
      expect(result).toBe('第一部分第二部分')
    })

    test('过滤非 text 类型 block', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            { type: 'image' },
            { type: 'text', text: 'OK' },
          ],
          stop_reason: 'end_turn',
        }),
        text: async () => '',
      })
      const result = await generateNarrative(makeParams())
      expect(result).toBe('OK')
    })

    test('API 返回错误状态码', async () => {
      mockFetch.mockResolvedValue(apiErrorResponse(401, 'Unauthorized'))
      await expect(generateNarrative(makeParams())).rejects.toThrow('Anthropic API 错误 (401)')
    })

    test('验证请求头正确', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams())
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        'x-api-key': 'sk-test-key',
        'anthropic-version': '2023-06-01',
      })
    })

    test('验证请求体正确', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams())
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.model).toBe('claude-sonnet-4-20250514')
      expect(body.max_tokens).toBe(4096)
      expect(body.temperature).toBe(0.8)
      expect(body.system).toBe('系统提示')
      expect(body.messages).toEqual([{ role: 'user', content: '用户提示' }])
    })

    test('默认温度 0.8', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams())
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.temperature).toBe(0.8)
    })

    test('自定义温度', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams({ temperature: 0.3 }))
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.temperature).toBe(0.3)
    })

    test('默认 maxTokens 4096', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams())
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.max_tokens).toBe(4096)
    })

    test('自定义 maxTokens', async () => {
      mockFetch.mockResolvedValue(anthropicSuccess('OK'))
      await generateNarrative(makeParams({ maxTokens: 8192 }))
      const [, options] = mockFetch.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(body.max_tokens).toBe(8192)
    })
  })

  describe('OpenAI 兼容 API 调用', () => {
    test('成功调用 DeepSeek', async () => {
      mockFetch.mockResolvedValue(openAISuccess('叙事'))
      const result = await generateNarrative(makeParams({ provider: 'deepseek' }))
      expect(result).toBe('叙事')
    })

    test('验证 endpoint 为 DeepSeek', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      await generateNarrative(makeParams({ provider: 'deepseek' }))
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    })

    test('验证请求头包含 Bearer token', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      await generateNarrative(makeParams({ provider: 'deepseek' }))
      const [, options] = mockFetch.mock.calls[0]
      expect(options.headers).toEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test-key',
      })
    })

    test('DeepSeek API 返回错误', async () => {
      mockFetch.mockResolvedValue(apiErrorResponse(429, 'Rate limit'))
      await expect(generateNarrative(makeParams({ provider: 'deepseek' }))).rejects.toThrow('deepseek API 错误 (429)')
    })

    test('成功调用 OpenAI', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      const result = await generateNarrative(makeParams({ provider: 'openai' }))
      expect(result).toBe('OK')
    })

    test('验证 endpoint 为 OpenAI', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      await generateNarrative(makeParams({ provider: 'openai' }))
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://api.openai.com/v1/chat/completions')
    })

    test('成功调用 Google', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      const result = await generateNarrative(makeParams({ provider: 'google' }))
      expect(result).toBe('OK')
    })

    test('验证 endpoint 为 Google', async () => {
      mockFetch.mockResolvedValue(openAISuccess('OK'))
      await generateNarrative(makeParams({ provider: 'google' }))
      const [url] = mockFetch.mock.calls[0]
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions')
    })
  })

  describe('不支持的 provider', () => {
    test('provider 为 mistral', async () => {
      await expect(generateNarrative(makeParams({ provider: 'mistral' }))).rejects.toThrow('不支持的 AI 提供商')
    })

    test('provider 为空字符串', async () => {
      await expect(generateNarrative(makeParams({ provider: '' }))).rejects.toThrow('不支持的 AI 提供商')
    })
  })

  describe('响应内容边界情况', () => {
    test('choices 为空数组', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [] }),
        text: async () => '',
      })
      await expect(generateNarrative(makeParams({ provider: 'deepseek' }))).rejects.toThrow('AI 未返回有效内容')
    })

    test('content 为空字符串', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }],
        }),
        text: async () => '',
      })
      await expect(generateNarrative(makeParams({ provider: 'deepseek' }))).rejects.toThrow('AI 未返回有效内容')
    })

    test('content 为 null', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: null } }],
        }),
        text: async () => '',
      })
      await expect(generateNarrative(makeParams({ provider: 'deepseek' }))).rejects.toThrow('AI 未返回有效内容')
    })

    test('DeepSeek reasoning_content 被忽略', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '', reasoning_content: '思维链' } }],
        }),
        text: async () => '',
      })
      await expect(generateNarrative(makeParams({ provider: 'deepseek' }))).rejects.toThrow('AI 未返回有效内容')
    })

    test('内容前后有空白', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '  叙事  ' } }],
        }),
        text: async () => '',
      })
      const result = await generateNarrative(makeParams({ provider: 'deepseek' }))
      expect(result).toBe('叙事')
    })
  })

  describe('fetch 网络错误', () => {
    test('fetch 本身抛错', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      await expect(generateNarrative(makeParams())).rejects.toThrow('Network error')
    })
  })
})
