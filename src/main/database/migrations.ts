import type { SqliteDatabase } from './types'
import { initialSchemaMigration } from './migrations/001_initial_schema'
import { fragmentLibraryMigration } from './migrations/002_fragment_library'
import { novelProjectWorkbenchMigration } from './migrations/003_novel_project_workbench'
import { outlineWorkbenchMigration } from './migrations/004_outline_workbench'
import { chapterGenerationMigration } from './migrations/005_chapter_generation'
import { narrativeWorkbenchMigration } from './migrations/006_narrative_workbench'
import { secureLlmCredentialsMigration } from './migrations/007_secure_llm_credentials'

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

  const applied = database
    .prepare<AppliedMigration>('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    .all()
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
