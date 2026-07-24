import {
  CROSS_ORIGIN_LLM_REDIRECT,
  createSecureFetch,
  INSECURE_LLM_BASE_URL,
  INVALID_LLM_BASE_URL,
  LOCAL_HTTP_ONLY,
  normalizeModelEndpoint,
  validateModelRedirect,
} from '@/agent/llm/urlSecurity'

describe('LLM 端点安全校验', () => {
  test('规范化 HTTPS 端点并去除末尾斜杠', () => {
    const endpoint = normalizeModelEndpoint('HTTPS://Example.COM///')

    expect(endpoint.normalized).toBe('https://example.com')
    expect(endpoint.hostname).toBe('example.com')
    expect(endpoint.isLocal).toBe(false)
  })

  test.each([
    ['https://api.openai.com', false],
    ['http://localhost:1234', true],
    ['http://127.0.0.1:8000', true],
    ['http://[::1]:9000', true],
  ])('允许安全端点 %s', (input, isLocal) => {
    expect(normalizeModelEndpoint(input).isLocal).toBe(isLocal)
  })

  test.each([
    ['http://api.example.com', INSECURE_LLM_BASE_URL],
    ['http://192.168.1.10', INSECURE_LLM_BASE_URL],
    ['http://internal.company', INSECURE_LLM_BASE_URL],
    ['http://localhost.evil.com', INSECURE_LLM_BASE_URL],
    ['http://127.0.0.2', INSECURE_LLM_BASE_URL],
    ['http://127.1', INSECURE_LLM_BASE_URL],
    ['http://0x7f000001', INSECURE_LLM_BASE_URL],
    ['http://[::ffff:127.0.0.1]', INSECURE_LLM_BASE_URL],
    ['http://localhost.', INVALID_LLM_BASE_URL],
    ['localhost.', INVALID_LLM_BASE_URL],
    ['ftp://example.com', INVALID_LLM_BASE_URL],
    ['example.com', INVALID_LLM_BASE_URL],
    ['https://user:password@example.com', INVALID_LLM_BASE_URL],
    ['http://2130706433', INSECURE_LLM_BASE_URL],
    ['javascript:alert(1)', INVALID_LLM_BASE_URL],
  ])('拒绝不安全端点 %s', (input, code) => {
    try {
      normalizeModelEndpoint(input)
      throw new Error('expected endpoint validation to fail')
    } catch (error) {
      expect(error).toMatchObject({ code })
    }
  })

  test('允许 HTTPS 重定向到 HTTPS', () => {
    const endpoint = validateModelRedirect(
      'https://provider.com/v1',
      'https://provider.com/api',
    )

    expect(endpoint.normalized).toBe('https://provider.com/api')
  })

  test('拒绝 HTTPS 协议相对重定向到其他域名', () => {
    expect(() => validateModelRedirect(
      'https://example.com',
      new URL('//evil.com', 'https://example.com'),
    )).toThrow(expect.objectContaining({ code: CROSS_ORIGIN_LLM_REDIRECT }))
  })

  test('允许本地 HTTP 在本地 HTTP 端点之间重定向', () => {
    expect(() => validateModelRedirect(
      'http://localhost:1234/v1',
      'http://localhost:1234/api',
    )).not.toThrow()
  })

  test.each([
    ['https://provider.com', 'http://evil.com', INSECURE_LLM_BASE_URL],
    ['https://provider.com', 'HTTP://evil.com', INSECURE_LLM_BASE_URL],
    ['https://provider.com', 'http://192.168.1.5', INSECURE_LLM_BASE_URL],
    ['http://localhost:1234', 'http://evil.com', LOCAL_HTTP_ONLY],
    ['https://provider.com', 'http://localhost:1234', LOCAL_HTTP_ONLY],
  ])('拒绝不安全重定向 %s -> %s', (from, to, code) => {
    expect(() => validateModelRedirect(from, to)).toThrow(expect.objectContaining({ code }))
  })

  test('安全 fetch 会逐跳检查并跟随 HTTPS 重定向', async () => {
    const calls: string[] = []
    const baseFetch: typeof fetch = async (input, init) => {
      const url = String(input)
      calls.push(url)
      expect(init?.redirect).toBe('manual')
      if (url === 'https://provider.com') {
        return new Response(null, { status: 302, headers: { location: '/api' } })
      }
      return new Response('ok')
    }

    const response = await createSecureFetch(baseFetch)('https://provider.com')

    expect(await response.text()).toBe('ok')
    expect(calls).toEqual(['https://provider.com', 'https://provider.com/api'])
  })

  test('安全 fetch 在发送第二个请求前阻止 HTTPS 降级', async () => {
    const baseFetch: typeof fetch = async () =>
      new Response(null, { status: 302, headers: { location: 'http://evil.com' } })

    await expect(createSecureFetch(baseFetch)('https://provider.com')).rejects.toThrow(
      expect.objectContaining({ code: INSECURE_LLM_BASE_URL }),
    )
  })

  test('安全 fetch 阻止 HTTPS 协议相对重定向到其他域名', async () => {
    const calls: string[] = []
    const baseFetch: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(null, { status: 302, headers: { location: '//evil.com' } })
    }

    await expect(createSecureFetch(baseFetch)('https://provider.com')).rejects.toThrow(
      expect.objectContaining({ code: CROSS_ORIGIN_LLM_REDIRECT }),
    )
    expect(calls).toEqual(['https://provider.com'])
  })

  test('安全 fetch 在重定向链中逐跳阻止降级', async () => {
    const calls: string[] = []
    const baseFetch: typeof fetch = async (input) => {
      const url = String(input)
      calls.push(url)
      if (url === 'https://provider.com') {
        return new Response(null, { status: 302, headers: { location: '/api' } })
      }
      return new Response(null, { status: 302, headers: { location: 'http://evil.com' } })
    }

    await expect(createSecureFetch(baseFetch)('https://provider.com')).rejects.toThrow(
      expect.objectContaining({ code: INSECURE_LLM_BASE_URL }),
    )
    expect(calls).toEqual(['https://provider.com', 'https://provider.com/api'])
  })

  test('安全 fetch 不允许本地 HTTP 重定向到 IPv4 简写', async () => {
    const calls: string[] = []
    const baseFetch: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(null, { status: 302, headers: { location: 'http://127.1' } })
    }

    await expect(createSecureFetch(baseFetch)('http://localhost:1234')).rejects.toThrow(
      expect.objectContaining({ code: LOCAL_HTTP_ONLY }),
    )
    expect(calls).toEqual(['http://localhost:1234'])
  })

  test('SDK 模式将安全错误转换为清晰的 400 响应且不跟随跳转', async () => {
    const calls: string[] = []
    const baseFetch: typeof fetch = async (input) => {
      calls.push(String(input))
      return new Response(null, { status: 302, headers: { location: 'http://evil.com' } })
    }

    const response = await createSecureFetch(baseFetch, { securityErrorMode: 'response' })('https://provider.com')
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(body).toContain('远程模型端点必须使用 HTTPS。')
    expect(body).not.toContain('http://evil.com')
    expect(calls).toEqual(['https://provider.com'])
  })

  test('安全 fetch 拒绝非 HTTP(S) 初始地址', async () => {
    const baseFetch: typeof fetch = async () => new Response('unexpected')

    await expect(createSecureFetch(baseFetch)('file:///tmp/model')).rejects.toThrow(
      expect.objectContaining({ code: INVALID_LLM_BASE_URL }),
    )
  })
})
