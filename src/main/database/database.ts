import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { runMigrations, type Migration } from './migrations'
import type { SqliteDatabase, SqliteStatement } from './types'

const DATABASE_DIRECTORY = 'data'
const DATABASE_FILENAME = 'yourcrush.sqlite'
const DEFAULT_BUSY_TIMEOUT_MS = 5000

type NativeDatabase = Database.Database

class BetterSqliteDatabaseAdapter implements SqliteDatabase {
  public constructor(private readonly nativeDatabase: NativeDatabase) {}

  public get inTransaction(): boolean {
    return this.nativeDatabase.inTransaction
  }

  public prepare<Row = unknown>(source: string): SqliteStatement<Row> {
    const nativeStatement = this.nativeDatabase.prepare(source) as Database.Statement<unknown[], Row>
    return {
      run: (...params) => nativeStatement.run(...params),
      get: (...params) => nativeStatement.get(...params),
      all: (...params) => nativeStatement.all(...params),
    }
  }

  public exec(source: string): void {
    this.nativeDatabase.exec(source)
  }

  public pragma(source: string, options?: { simple?: boolean }): unknown {
    return this.nativeDatabase.pragma(source, options)
  }

  public transaction<T>(callback: () => T): () => T {
    const transaction = this.nativeDatabase.transaction(callback)
    return () => transaction()
  }

  public close(): void {
    this.nativeDatabase.close()
  }
}

export interface InitializeDatabaseOptions {
  filename?: string
  busyTimeoutMs?: number
  migrations?: readonly Migration[]
}

export function getDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, DATABASE_DIRECTORY, DATABASE_FILENAME)
}

function ensureDatabaseDirectory(filename: string): void {
  if (filename === ':memory:') return
  fs.mkdirSync(path.dirname(filename), { recursive: true })
}

function configureDatabase(database: SqliteDatabase, busyTimeoutMs: number): void {
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  database.pragma(`busy_timeout = ${busyTimeoutMs}`)
}

export function initializeDatabase(
  userDataPath: string,
  options: InitializeDatabaseOptions = {},
): SqliteDatabase {
  const filename = options.filename ?? getDatabasePath(userDataPath)
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS
  ensureDatabaseDirectory(filename)

  const nativeDatabase = new Database(filename, { timeout: busyTimeoutMs })
  const database = new BetterSqliteDatabaseAdapter(nativeDatabase)
  configureDatabase(database, busyTimeoutMs)
  runMigrations(database, options.migrations)
  return database
}

export function configureInjectedDatabase(
  database: SqliteDatabase,
  options: Pick<InitializeDatabaseOptions, 'busyTimeoutMs' | 'migrations'> = {},
): SqliteDatabase {
  configureDatabase(database, options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS)
  runMigrations(database, options.migrations)
  return database
}
