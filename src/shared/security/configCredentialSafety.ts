import type { JsonValue } from '../novelProject'

const PLAINTEXT_CREDENTIAL_KEYS = new Set([
  'apikey',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
])

export interface PortableConfigSanitizationResult {
  value: JsonValue
  removedPlaintextCredentials: number
  removedCredentialReferences: number
  removedLocalPaths: number
}

export interface PortableConfigInspection {
  safe: boolean
  plaintextCredentials: number
  credentialReferences: number
  localPaths: number
}

export function normalizeConfigurationKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export function isPlaintextCredentialKey(key: string): boolean {
  return PLAINTEXT_CREDENTIAL_KEYS.has(normalizeConfigurationKey(key))
}

export function isCredentialReferenceKey(key: string): boolean {
  const normalized = normalizeConfigurationKey(key)
  return normalized === 'credentialid' || normalized.endsWith('credentialid')
}

export function isLocalConfigurationPath(value: string): boolean {
  return (
    /^[a-z]:/i.test(value)
    || /^\\\\/.test(value)
    || value.startsWith('/')
    || /^file:/i.test(value)
  )
}

function sanitizeValue(
  value: JsonValue,
  counters: Omit<PortableConfigSanitizationResult, 'value'>,
): JsonValue {
  if (typeof value === 'string' && isLocalConfigurationPath(value)) {
    counters.removedLocalPaths += 1
    return null
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, counters))
  }
  if (value === null || typeof value !== 'object') return value

  const sanitized: Record<string, JsonValue> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isCredentialReferenceKey(key)) {
      counters.removedCredentialReferences += 1
      continue
    }
    if (isPlaintextCredentialKey(key)) {
      counters.removedPlaintextCredentials += 1
      continue
    }
    sanitized[key] = sanitizeValue(entry, counters)
  }
  return sanitized
}

export function sanitizePortableConfiguration(
  value: JsonValue,
): PortableConfigSanitizationResult {
  const counters = {
    removedPlaintextCredentials: 0,
    removedCredentialReferences: 0,
    removedLocalPaths: 0,
  }
  return {
    value: sanitizeValue(value, counters),
    ...counters,
  }
}

export function inspectPortableConfiguration(value: JsonValue): PortableConfigInspection {
  const sanitized = sanitizePortableConfiguration(value)
  const plaintextCredentials = sanitized.removedPlaintextCredentials
  const credentialReferences = sanitized.removedCredentialReferences
  const localPaths = sanitized.removedLocalPaths
  return {
    safe: plaintextCredentials === 0 && credentialReferences === 0 && localPaths === 0,
    plaintextCredentials,
    credentialReferences,
    localPaths,
  }
}
