const REDACTED = '[REDACTED]'
const CIRCULAR = '[Circular]'
const UNAVAILABLE = '[Unserializable sensitive value]'
const sensitiveKeys = new Set([
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
])

const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=:-]+/gi
const keyPattern = /\b(?:sk-(?:[A-Za-z0-9_-]{8,})|sk-ant-[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g
const queryPattern = /([?&](?:api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|key)=)[^&#\s]*/gi
const windowsPathPattern = /\b[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g
const unixHomePathPattern = /\/(?:Users|home)\/[^/\s]+(?:\/[^\s]*)?/g

function redactString(value: string): string {
  return value
    .replace(bearerPattern, 'Bearer ' + REDACTED)
    .replace(keyPattern, REDACTED)
    .replace(queryPattern, `$1${REDACTED}`)
    .replace(windowsPathPattern, '[LOCAL_PATH]')
    .replace(unixHomePathPattern, '[LOCAL_PATH]')
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return sensitiveKeys.has(normalized)
}

function errorValue(error: Error): Record<string, unknown> {
  const result: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  }
  if (error.stack) result.stack = error.stack
  if ('cause' in error) result.cause = (error as Error & { cause?: unknown }).cause
  return result
}

/**
 * Creates a safe, non-mutating log/export representation. Never return the
 * original object when traversal fails: diagnostics are useful only when they
 * cannot disclose a credential.
 */
export function sanitizeSensitiveData(value: unknown): unknown {
  const seen = new WeakSet<object>()

  const visit = (current: unknown, depth: number): unknown => {
    if (depth > 20) return '[Max depth reached]'
    if (typeof current === 'string') return redactString(current)
    if (current === null || typeof current === 'number' || typeof current === 'boolean') return current
    if (typeof current === 'bigint') return current.toString()
    if (typeof current === 'undefined') return undefined
    if (typeof current === 'function' || typeof current === 'symbol') return String(current)

    try {
      if (current instanceof Error) return visit(errorValue(current), depth + 1)
      if (typeof current !== 'object') return UNAVAILABLE
      if (seen.has(current)) return CIRCULAR
      seen.add(current)
      if (Array.isArray(current)) return current.map((item) => visit(item, depth + 1))

      const result: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(current)) {
        result[key] = isSensitiveKey(key) ? REDACTED : visit(item, depth + 1)
      }
      return result
    } catch {
      return UNAVAILABLE
    }
  }

  return visit(value, 0)
}

export function sanitizeErrorMessage(error: unknown, fallback = '操作失败，请检查配置后重试'): string {
  const sanitized = sanitizeSensitiveData(error)
  if (typeof sanitized === 'string') return sanitized
  if (sanitized && typeof sanitized === 'object' && 'message' in sanitized) {
    const message = (sanitized as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function sanitizeForExport<T>(value: T): T {
  const sanitized = sanitizeSensitiveData(value)
  const filterCredentialPayloads = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(filterCredentialPayloads)
    if (!current || typeof current !== 'object') return current
    const record = current as Record<string, unknown>
    const isCredentialRecord = typeof record.payload === 'string'
      && (typeof record.updatedAt === 'string' || 'binding' in record)
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(record)) {
      const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      result[key] = isCredentialRecord && normalized === 'payload'
        ? REDACTED
        : normalized === 'encryptedpayload' || normalized === 'ciphertext'
          ? REDACTED
          : filterCredentialPayloads(item)
    }
    return result
  }
  return filterCredentialPayloads(sanitized) as T
}

export { REDACTED }
