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

/** Query parameter names that must never appear on persisted LLM base URLs. */
const SENSITIVE_URL_QUERY_KEYS = new Set([
  'api_key',
  'apikey',
  'key',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'auth',
  'password',
  'credential',
  'client_secret',
  'private_key',
])

/**
 * Value-level secret patterns. Messages never include the matched payload so
 * rejected markers do not re-enter logs or exception strings.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /\bBearer\s+\S+/i,
  /\bsk-[A-Za-z0-9_-]{8,}/i,
  /\bsk_live_[A-Za-z0-9_-]+/i,
  /\bsk_test_[A-Za-z0-9_-]+/i,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]+\b/,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
  /(?:^|[?&])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token|authorization|password)=/i,
]

const SUPPORTED_PERSISTED_TASK_TYPES = new Set([
  'assistant',
  'chapter-generation',
  'chapter-polish',
])

const SUPPORTED_PERSISTED_PROVIDERS = new Set([
  'anthropic',
  'deepseek',
  'google',
  'openai',
  'openai-compatible',
])

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function isSensitiveInputKey(key: string): boolean {
  const normalized = normalizeKey(key)
  if (SENSITIVE_KEY_TOKENS.has(normalized)) return true
  if (normalized.includes('password')) return true
  if (normalized.includes('secret')) return true
  if (normalized.includes('authorization')) return true
  if (normalized.endsWith('token') || normalized.startsWith('token')) return true
  if (normalized.includes('apikey')) return true
  if (normalized.includes('credential')) return true
  if (normalized.includes('cookie')) return true
  return false
}

function isSensitiveQueryKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (SENSITIVE_URL_QUERY_KEYS.has(lower)) return true
  const normalized = normalizeKey(key)
  if (SENSITIVE_URL_QUERY_KEYS.has(normalized)) return true
  if (normalized.includes('secret')) return true
  if (normalized.includes('token') && normalized !== 'apitokenversion') return true
  if (normalized.includes('password')) return true
  if (normalized.includes('authorization')) return true
  if (normalized.includes('apikey')) return true
  if (normalized.includes('credential')) return true
  return false
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith('//')
}

/**
 * Reject secret-bearing string values. Error text uses only the field path so
 * the secret marker never appears in exception messages.
 */
export function assertNoSensitiveStringValue(value: string, path: string): void {
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(`拒绝持久化敏感字符串值: ${path}`)
    }
  }
  if (!looksLikeUrl(value) && !value.includes('?') && !value.includes('@')) {
    return
  }
  try {
    const candidate = value.startsWith('//') ? `https:${value}` : value
    const url = new URL(candidate)
    if (url.username || url.password) {
      throw new Error(`拒绝持久化含用户凭据的 URL: ${path}`)
    }
    for (const key of url.searchParams.keys()) {
      if (isSensitiveQueryKey(key)) {
        throw new Error(`拒绝持久化含敏感查询参数的 URL: ${path}`)
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('拒绝')) throw error
    // Non-URL strings that merely look similar are ignored unless patterns matched above.
  }
}

export function assertSafePersistedString(
  value: string,
  path: string,
  maxLength = 512,
): void {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
  if (value.trim() === '' || value.length > maxLength || hasControlCharacter) {
    throw new Error(`拒绝持久化无效字符串: ${path}`)
  }
  assertNoSensitiveStringValue(value, path)
}

export function assertSupportedPersistedTaskType(taskType: string): void {
  if (!SUPPORTED_PERSISTED_TASK_TYPES.has(taskType)) {
    throw new Error('拒绝持久化不受支持的任务类型: taskType')
  }
}

export function assertSupportedPersistedProvider(provider: string): void {
  if (!SUPPORTED_PERSISTED_PROVIDERS.has(provider)) {
    throw new Error('拒绝持久化不受支持的模型提供商: llm.provider')
  }
}

/**
 * baseUrl persistence rules: no userinfo, no sensitive query keys.
 * Non-sensitive query such as api-version may remain.
 */
export function assertSafePersistedBaseUrl(baseUrl: string, path = 'llm.baseUrl'): void {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error(`拒绝持久化无效的模型端点: ${path}`)
  }
  if (url.username || url.password) {
    throw new Error(`拒绝持久化含用户凭据的模型端点: ${path}`)
  }
  for (const key of url.searchParams.keys()) {
    if (isSensitiveQueryKey(key)) {
      throw new Error(`拒绝持久化含敏感查询参数的模型端点: ${path}`)
    }
  }
  assertNoSensitiveStringValue(baseUrl, path)
}

/**
 * Recursively reject secret-bearing keys and string values. Throws rather than
 * silently stripping so callers never persist untrusted secrets by omission.
 */
export function assertNoSensitiveTaskInput(
  value: JsonValue | undefined,
  path = 'input',
): void {
  if (value === undefined || value === null) return
  if (typeof value === 'string') {
    assertNoSensitiveStringValue(value, path)
    return
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
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

/**
 * Dual-layer validation for task start payloads (IPC + TaskManager).
 * Covers nested request, prompt text, and llm.baseUrl query/userinfo.
 */
export function assertSafeTaskStartSecrets(input: {
  prompt?: string
  input?: JsonObject
  llm?: { baseUrl?: string }
}): void {
  if (typeof input.prompt === 'string') {
    assertNoSensitiveStringValue(input.prompt, 'prompt')
  }
  assertNoSensitiveTaskInput(input.input ?? {}, 'request')
  if (typeof input.llm?.baseUrl === 'string' && input.llm.baseUrl.trim() !== '') {
    assertSafePersistedBaseUrl(input.llm.baseUrl, 'llm.baseUrl')
  }
}
