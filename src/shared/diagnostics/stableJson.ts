import { createHash } from 'node:crypto'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableValue(record[key])]),
  )
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value), null, 2)
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}
