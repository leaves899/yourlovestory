export interface SqliteRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

export interface SqliteStatement<Row = unknown> {
  run(...params: unknown[]): SqliteRunResult
  get(...params: unknown[]): Row | undefined
  all(...params: unknown[]): Row[]
}

export interface SqliteDatabase {
  readonly inTransaction: boolean
  prepare<Row = unknown>(source: string): SqliteStatement<Row>
  exec(source: string): void
  pragma(source: string, options?: { simple?: boolean }): unknown
  transaction<T>(callback: () => T): () => T
  backup(filename: string): Promise<void>
  close(): void
}
