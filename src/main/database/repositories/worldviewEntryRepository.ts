import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type {
  CreateWorldviewEntryInput,
  UpdateWorldviewEntryInput,
  WorldviewEntry,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type { CreateWorldviewEntryInput, UpdateWorldviewEntryInput, WorldviewEntry }

interface WorldviewEntryRow {
  id: string
  project_id: string
  category: string
  title: string
  content: string
  metadata_json: string
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toEntry(row: WorldviewEntryRow): WorldviewEntry {
  const metadata = parseJsonObject(row.metadata_json, 'worldview.metadata')
  if (!metadata) throw new Error('Worldview metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    category: row.category,
    title: row.title,
    content: row.content,
    metadata,
    sort_order: row.sort_order,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class WorldviewEntryRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateWorldviewEntryInput): WorldviewEntry {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO worldview_entries (
          id, project_id, category, title, content, metadata_json, sort_order,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.category ?? '',
        input.title,
        input.content ?? '',
        stringifyJsonObject(input.metadata ?? {}),
        input.sort_order ?? 0,
        timestamp,
        timestamp,
      )
    const entry = this.getById(id)
    if (!entry) throw new Error('Worldview entry was not created')
    return entry
  }

  public getById(id: string): WorldviewEntry | null {
    const row = this.database
      .prepare<WorldviewEntryRow>('SELECT * FROM worldview_entries WHERE id = ?')
      .get(id)
    return row ? toEntry(row) : null
  }

  public listByProject(projectId: string): WorldviewEntry[] {
    return this.database
      .prepare<WorldviewEntryRow>(
        'SELECT * FROM worldview_entries WHERE project_id = ? ORDER BY sort_order, created_at, id',
      )
      .all(projectId)
      .map(toEntry)
  }

  public update(
    id: string,
    input: UpdateWorldviewEntryInput,
    expectedVersion?: number,
  ): WorldviewEntry | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Worldview entry', id, expectedVersion, current.version)
    }
    const next = {
      category: input.category ?? current.category,
      title: input.title ?? current.title,
      content: input.content ?? current.content,
      metadata: input.metadata ?? current.metadata,
      sort_order: input.sort_order ?? current.sort_order,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE worldview_entries
             SET category = ?, title = ?, content = ?, metadata_json = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.category,
            next.title,
            next.content,
            stringifyJsonObject(next.metadata),
            next.sort_order,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE worldview_entries
             SET category = ?, title = ?, content = ?, metadata_json = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.category,
            next.title,
            next.content,
            stringifyJsonObject(next.metadata),
            next.sort_order,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Worldview entry', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Worldview entry', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM worldview_entries WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM worldview_entries WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) {
        throw new VersionConflictError('Worldview entry', id, expectedVersion, actual.version)
      }
    }
    return result.changes > 0
  }
}
