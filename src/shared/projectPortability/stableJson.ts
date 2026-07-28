import { createHash } from 'node:crypto'
import type { ProjectArchiveV1 } from './types'

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(record[key])]),
  )
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

export function projectArchiveIntegrityInput(archive: ProjectArchiveV1): unknown {
  const manifest = archive.manifest
  return {
    manifest: {
      format: manifest.format,
      formatVersion: manifest.formatVersion,
      exportedAt: manifest.exportedAt,
      appVersion: manifest.appVersion,
      databaseSchemaVersion: manifest.databaseSchemaVersion,
      sourceProjectId: manifest.sourceProjectId,
      projectName: manifest.projectName,
      exclusions: manifest.exclusions,
      warnings: manifest.warnings.map(({ code, count }) => ({ code, count })),
    },
    payload: archive.payload,
  }
}

export function projectArchiveIntegritySha256(archive: ProjectArchiveV1): string {
  return sha256(stableStringify(projectArchiveIntegrityInput(archive)))
}
