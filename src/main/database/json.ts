export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

export interface JsonObject {
  [key: string]: JsonValue
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

export function parseJsonObject(value: string | null, field: string): JsonObject | null {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (!isJsonValue(parsed) || !isRecord(parsed)) {
    throw new Error(`Invalid ${field} JSON`)
  }
  return parsed
}

export function stringifyJsonObject(value: JsonObject): string {
  return JSON.stringify(value)
}

export function parseJsonStringArray(value: string | null, field: string): string[] {
  if (value === null) return []
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid ${field} JSON`)
  }
  return parsed
}

export function stringifyJsonStringArray(value: readonly string[]): string {
  return JSON.stringify(value)
}
