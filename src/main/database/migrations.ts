import type { SqliteDatabase } from './types'
import { initialSchemaMigration } from './migrations/001_initial_schema'
import { fragmentLibraryMigration } from './migrations/002_fragment_library'
import { novelProjectWorkbenchMigration } from './migrations/003_novel_project_workbench'
import { outlineWorkbenchMigration } from './migrations/004_outline_workbench'
import { chapterGenerationMigration } from './migrations/005_chapter_generation'
import { narrativeWorkbenchMigration } from './migrations/006_narrative_workbench'
import { secureLlmCredentialsMigration } from './migrations/007_secure_llm_credentials'
import { removePlaintextLlmCredentialsMigration } from './migrations/008_remove_plaintext_llm_credentials'
import { taskCrashRecoveryMigration } from './migrations/009_task_crash_recovery'

export interface Migration {
  version: number
  name: string
  up: string
}

export interface AppliedMigration {
  version: number
  name: string
  applied_at: string
}

export const migrations: readonly Migration[] = [
  initialSchemaMigration,
  fragmentLibraryMigration,
  novelProjectWorkbenchMigration,
  outlineWorkbenchMigration,
  chapterGenerationMigration,
  narrativeWorkbenchMigration,
  secureLlmCredentialsMigration,
  removePlaintextLlmCredentialsMigration,
  taskCrashRecoveryMigration,
]

function ensureMigrationsTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

export function getAppliedMigrations(database: SqliteDatabase): AppliedMigration[] {
  const table = database
    .prepare<{ count: number }>(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
    )
    .get()
  if (!table?.count) return []
  return database
    .prepare<AppliedMigration>(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
    )
    .all()
}

export function getPendingMigrations(
  database: SqliteDatabase,
  candidateMigrations: readonly Migration[] = migrations,
): Migration[] {
  validateMigrationOrder(candidateMigrations)
  const applied = getAppliedMigrations(database)
  const appliedByVersion = new Map(applied.map((migration) => [migration.version, migration]))
  for (const migration of candidateMigrations) {
    const existing = appliedByVersion.get(migration.version)
    if (existing && existing.name !== migration.name) {
      throw new Error(`Migration ${migration.version} name does not match the recorded migration`)
    }
  }
  return candidateMigrations.filter((migration) => !appliedByVersion.has(migration.version))
}

function validateMigrationOrder(candidateMigrations: readonly Migration[]): void {
  let previousVersion = 0
  for (const migration of candidateMigrations) {
    if (migration.version <= previousVersion) {
      throw new Error('Migration versions must be strictly increasing')
    }
    previousVersion = migration.version
  }
}

export function runMigrations(
  database: SqliteDatabase,
  candidateMigrations: readonly Migration[] = migrations,
): AppliedMigration[] {
  validateMigrationOrder(candidateMigrations)
  ensureMigrationsTable(database)

  const applied = getAppliedMigrations(database)
  const appliedByVersion = new Map(applied.map((migration) => [migration.version, migration]))

  for (const migration of candidateMigrations) {
    const existing = appliedByVersion.get(migration.version)
    if (existing && existing.name !== migration.name) {
      throw new Error(`Migration ${migration.version} name does not match the recorded migration`)
    }
  }

  const pending = candidateMigrations.filter((migration) => !appliedByVersion.has(migration.version))
  if (pending.length > 0) {
    const applyPending = database.transaction(() => {
      for (const migration of pending) {
        database.exec(migration.up)
        database
          .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
          .run(migration.version, migration.name)
      }
    })
    applyPending()
  }

  return database
    .prepare<AppliedMigration>('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    .all()
}
