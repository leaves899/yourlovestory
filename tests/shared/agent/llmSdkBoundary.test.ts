import OpenAI from 'openai'
import { installLlmFetchGuard } from '@/shared/security/urlSecurity'

describe('LLM SDK 网络边界', () => {
  test('OpenAI SDK 使用手动重定向并保留安全错误', async () => {
    const originalFetch = globalThis.fetch
    const calls: Array<{ url: string; redirect: RequestInit['redirect'] }> = []
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), redirect: init?.redirect })
      return new Response(null, { status: 302, headers: { location: 'http://evil.com' } })
    }
    const restoreFetchGuard = installLlmFetchGuard()

    try {
      const client = new OpenAI({
        apiKey: 'test-api-key',
        baseURL: 'https://provider.example/v1',
        maxRetries: 0,
      })

      await expect(client.chat.completions.create({
        model: 'test-model',
        messages: [{ role: 'user', content: 'private prompt' }],
      })).rejects.toThrow('远程模型端点必须使用 HTTPS。')
      expect(calls).toEqual([{
        url: 'https://provider.example/v1/chat/completions',
        redirect: 'manual',
      }])
    } finally {
      restoreFetchGuard()
      globalThis.fetch = originalFetch
    }
  })
})
