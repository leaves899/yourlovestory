import type { JsonObject, JsonValue } from '../database'

/**
 * Keys that must never be accepted into persisted task request payloads.
 * Normalized by stripping non-alphanumeric characters and lowercasing.
 */
const SENSITIVE_KEY_TOKENS = new Set([
  'apikey',
  'xapikey',
  'authorization',
  'proxyauthorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
  'credential',
  'credentialid',
  'credentialsecret',
  'cookie',
  'setcookie',
  'auth',
  'bearer',
  'privatekey',
  'clientsecret',
  'apisecret',
])

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function isSensitiveInputKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (SENSITIVE_KEY_TOKENS.has(normalized)) return true
  // Catch variants like api_key_value, mySecretToken, userPasswordHash
  if (normalized.includes('password')) return true
  if (normalized.includes('secret')) return true
  if (normalized.includes('authorization')) return true
  if (normalized.endsWith('token') || normalized.startsWith('token')) return true
  if (normalized.includes('apikey')) return true
  if (normalized.includes('credential')) return true
  if (normalized.includes('cookie')) return true
  return false
}

/**
 * Recursively reject secret-bearing fields. Throws rather than silently stripping
 * so callers never persist untrusted secrets by omission.
 */
export function assertNoSensitiveTaskInput(
  value: JsonValue | undefined,
  path = 'input',
): void {
  if (value === undefined || value === null) return
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoSensitiveTaskInput(item, `${path}[${index}]`)
    })
    return
  }
  if (typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as JsonObject)) {
    if (isSensitiveInputKey(key)) {
      throw new Error(`拒绝持久化敏感字段: ${path}.${key}`)
    }
    assertNoSensitiveTaskInput(child, `${path}.${key}`)
  }
}
