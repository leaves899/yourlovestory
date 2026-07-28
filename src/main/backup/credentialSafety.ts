import type { SqliteDatabase } from '../database'

export interface PlaintextCredentialInspection {
  safeForUserBackup: boolean
  plaintextCredentialCount: number
  legacyCredentialColumnPresent: boolean
  credentialCleanupMigrationApplied: boolean
}

const PLAINTEXT_KEYS = new Set([
  'apikey',
  'authorization',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
])

function tableExists(database: SqliteDatabase, table: string): boolean {
  const result = database
    .prepare<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(table)
  return (result?.count ?? 0) > 0
}

function columnExists(database: SqliteDatabase, table: string, column: string): boolean {
  if (!tableExists(database, table)) return false
  return database
    .prepare<{ name: string }>(`PRAGMA table_info(${table})`)
    .all()
    .some((entry) => entry.name === column)
}

function countPlaintextValues(value: unknown): number {
  if (!value || typeof value !== 'object') return 0
  if (Array.isArray(value)) {
    return value.reduce((count, entry) => count + countPlaintextValues(entry), 0)
  }
  let count = 0
  for (const [key, entry] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
    if (PLAINTEXT_KEYS.has(normalized) && typeof entry === 'string' && entry.trim()) {
      count += 1
    } else {
      count += countPlaintextValues(entry)
    }
  }
  return count
}

function countProjectConfigPlaintext(database: SqliteDatabase): number {
  if (!columnExists(database, 'project_configs', 'settings_json')) return 0
  const rows = database
    .prepare<{ settings_json: string }>(
      "SELECT settings_json FROM project_configs WHERE settings_json LIKE '%key%' COLLATE NOCASE OR settings_json LIKE '%token%' COLLATE NOCASE OR settings_json LIKE '%secret%' COLLATE NOCASE OR settings_json LIKE '%password%' COLLATE NOCASE",
    )
    .all()
  let count = 0
  for (const row of rows) {
    try {
      count += countPlaintextValues(JSON.parse(row.settings_json) as unknown)
    } catch {
      // A malformed potentially-sensitive payload is unsafe even when it cannot be inspected.
      count += 1
    }
  }
  return count
}

export function inspectPlaintextCredentialState(
  database: SqliteDatabase,
): PlaintextCredentialInspection {
  const legacyCredentialColumnPresent = columnExists(database, 'llm_configs', 'api_key')
  const legacyRows = legacyCredentialColumnPresent
    ? database
      .prepare<{ count: number }>(
        "SELECT COUNT(*) AS count FROM llm_configs WHERE TRIM(COALESCE(api_key, '')) <> ''",
      )
      .get()?.count ?? 0
    : 0
  const projectConfigRows = countProjectConfigPlaintext(database)
  const credentialCleanupMigrationApplied = tableExists(database, 'schema_migrations')
    && (database
      .prepare<{ count: number }>(
        'SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 8',
      )
      .get()?.count ?? 0) > 0
  const plaintextCredentialCount = legacyRows + projectConfigRows
  return {
    safeForUserBackup:
      credentialCleanupMigrationApplied
      && !legacyCredentialColumnPresent
      && plaintextCredentialCount === 0,
    plaintextCredentialCount,
    legacyCredentialColumnPresent,
    credentialCleanupMigrationApplied,
  }
}
