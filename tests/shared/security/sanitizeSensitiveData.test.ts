import { REDACTED, sanitizeForExport, sanitizeSensitiveData } from '@/shared/security/sanitizeSensitiveData'

const TEST_SECRET = 'sk-test-secret-do-not-expose-123456'

describe('sanitizeSensitiveData', () => {
  it('redacts nested keys, headers, bearer tokens, URL query values, and Error causes without mutation', () => {
    const input = {
      apiKey: TEST_SECRET,
      nested: [{ Authorization: `Bearer ${TEST_SECRET}` }],
      headers: {
        'x-api-key': TEST_SECRET,
        'X_API_KEY': TEST_SECRET,
        'Proxy-Authorization': `Bearer ${TEST_SECRET}`,
      },
      url: `https://example.test/?token=${TEST_SECRET}&x=1`,
      error: Object.assign(new Error(`failed with ${TEST_SECRET}`), { cause: { refresh_token: TEST_SECRET } }),
    }
    const output = sanitizeSensitiveData(input) as Record<string, unknown>
    expect(input.apiKey).toBe(TEST_SECRET)
    expect(JSON.stringify(output)).not.toContain(TEST_SECRET)
    expect(output.apiKey).toBe(REDACTED)
    expect((output.nested as Array<Record<string, unknown>>)[0].Authorization).toBe(REDACTED)
    expect((output.headers as Record<string, unknown>)['x-api-key']).toBe(REDACTED)
    expect((output.headers as Record<string, unknown>).X_API_KEY).toBe(REDACTED)
  })

  it('handles circular values and produces export-safe copies', () => {
    const circular: { token: string; self?: unknown } = { token: TEST_SECRET }
    circular.self = circular
    const output = sanitizeForExport(circular)
    expect(output).not.toBe(circular)
    expect(JSON.stringify(output)).not.toContain(TEST_SECRET)
    expect(JSON.stringify(output)).toContain('[Circular]')
  })

  it('removes encrypted credential payloads from export and diagnostic representations', () => {
    const exported = sanitizeForExport({
      project: { title: 'safe' },
      credentialStore: {
        version: 1,
        credentials: {
          'llm:app-default': {
            payload: 'base64-encrypted-payload',
            updatedAt: '2026-01-01T00:00:00.000Z',
            binding: { provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
          },
        },
      },
      diagnostic: { encryptedPayload: 'cipher', ciphertext: 'cipher' },
    })
    const serialized = JSON.stringify(exported)
    expect(serialized).not.toContain('base64-encrypted-payload')
    expect(serialized).not.toContain('"cipher"')
    expect(serialized).toContain('"title":"safe"')
  })

  it('redacts user-specific local paths from errors', () => {
    const output = sanitizeSensitiveData(
      new Error('EPERM opening C:\\Users\\Alice\\AppData\\Roaming\\yourcrush\\data.sqlite'),
    )
    const serialized = JSON.stringify(output)
    expect(serialized).toContain('[LOCAL_PATH]')
    expect(serialized).not.toContain('Alice')
    expect(serialized).not.toContain('data.sqlite')
  })

  it('redacts llm credential ids embedded in free-form strings', () => {
    const output = sanitizeSensitiveData(
      'restore blocked for llm:app-default-credential-id',
    )
    expect(output).toBe('restore blocked for [REDACTED]')
    expect(String(output)).not.toContain('llm:app-default')
  })
})
