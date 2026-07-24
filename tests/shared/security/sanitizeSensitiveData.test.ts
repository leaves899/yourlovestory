import { REDACTED, sanitizeForExport, sanitizeSensitiveData } from '@/shared/security/sanitizeSensitiveData'

const TEST_SECRET = 'sk-test-secret-do-not-expose-123456'

describe('sanitizeSensitiveData', () => {
  it('redacts nested keys, headers, bearer tokens, URL query values, and Error causes without mutation', () => {
    const input = {
      apiKey: TEST_SECRET,
      nested: [{ Authorization: `Bearer ${TEST_SECRET}` }],
      url: `https://example.test/?token=${TEST_SECRET}&x=1`,
      error: Object.assign(new Error(`failed with ${TEST_SECRET}`), { cause: { refresh_token: TEST_SECRET } }),
    }
    const output = sanitizeSensitiveData(input) as Record<string, unknown>
    expect(input.apiKey).toBe(TEST_SECRET)
    expect(JSON.stringify(output)).not.toContain(TEST_SECRET)
    expect(output.apiKey).toBe(REDACTED)
    expect((output.nested as Array<Record<string, unknown>>)[0].Authorization).toBe(REDACTED)
  })

  it('handles circular values and produces export-safe copies', () => {
    const circular: { token: string; self?: unknown } = { token: TEST_SECRET }
    circular.self = circular
    const output = sanitizeForExport(circular)
    expect(output).not.toBe(circular)
    expect(JSON.stringify(output)).not.toContain(TEST_SECRET)
    expect(JSON.stringify(output)).toContain('[Circular]')
  })
})
