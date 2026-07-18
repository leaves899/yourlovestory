import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type { SqliteDatabase } from '../types'

export interface LibraryFragment {
  id: string
  project_id: string
  date: string
  time: string | null
  origin: string
  mood: string | null
  content: string
  env_tags: string[]
  behavior_tags: string[]
  custom_tags: string[]
  writing_mode: string
  theme: string | null
  version: number
  created_at: string
  updated_at: string
}

export type FragmentRecord = LibraryFragment

export interface CreateFragmentInput {
  id?: string
  project_id: string
  date: string
  time?: string | null
  origin?: string
  mood?: string | null
  content: string
  env_tags?: string[]
  behavior_tags?: string[]
  custom_tags?: string[]
  writing_mode?: string
  theme?: string | null
}

export interface UpdateFragmentInput {
  date?: string
  time?: string | null
  origin?: string
  mood?: string | null
  content?: string
  env_tags?: string[]
  behavior_tags?: string[]
  custom_tags?: string[]
  writing_mode?: string
  theme?: string | null
}

export interface FragmentListOptions {
  date?: string
  origin?: string
  limit?: number
}

interface FragmentRow {
  id: string
  project_id: string
  date: string
  time: string | null
  origin: string
  mood: string | null
  content: string
  env_tags_json: string
  behavior_tags_json: string
  custom_tags_json: string
  writing_mode: string
  theme: string | null
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function parseStringArray(value: string, field: string): string[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid ${field} JSON`)
  }
  return parsed
}

function stringifyStringArray(value: readonly string[]): string {
  return JSON.stringify(value)
}

function toFragment(row: FragmentRow): LibraryFragment {
  return {
    id: row.id,
    project_id: row.project_id,
    date: row.date,
    time: row.time,
    origin: row.origin,
    mood: row.mood,
    content: row.content,
    env_tags: parseStringArray(row.env_tags_json, 'fragment.env_tags'),
    behavior_tags: parseStringArray(row.behavior_tags_json, 'fragment.behavior_tags'),
    custom_tags: parseStringArray(row.custom_tags_json, 'fragment.custom_tags'),
    writing_mode: row.writing_mode,
    theme: row.theme,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class FragmentRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateFragmentInput): LibraryFragment {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO fragments (
          id, project_id, date, time, origin, mood, content, env_tags_json,
          behavior_tags_json, custom_tags_json, writing_mode, theme, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.date,
        input.time ?? null,
        input.origin ?? 'user',
        input.mood ?? null,
        input.content,
        stringifyStringArray(input.env_tags ?? []),
        stringifyStringArray(input.behavior_tags ?? []),
        stringifyStringArray(input.custom_tags ?? []),
        input.writing_mode ?? 'raw',
        input.theme ?? null,
        timestamp,
        timestamp,
      )
    const fragment = this.getById(id)
    if (!fragment) throw new Error('Fragment was not created')
    return fragment
  }

  public getById(id: string): LibraryFragment | null {
    const row = this.database.prepare<FragmentRow>('SELECT * FROM fragments WHERE id = ?').get(id)
    return row ? toFragment(row) : null
  }

  public listByProject(projectId: string, options: FragmentListOptions = {}): LibraryFragment[] {
    const conditions = ['project_id = ?']
    const params: unknown[] = [projectId]
    if (options.date !== undefined) {
      conditions.push('date = ?')
      params.push(options.date)
    }
    if (options.origin !== undefined) {
      conditions.push('origin = ?')
      params.push(options.origin)
    }
    const limit = options.limit === undefined ? '' : ' LIMIT ?'
    if (options.limit !== undefined) params.push(options.limit)
    return this.database
      .prepare<FragmentRow>(
        `SELECT * FROM fragments WHERE ${conditions.join(' AND ')}
         ORDER BY date DESC, time DESC, created_at DESC, id DESC${limit}`,
      )
      .all(...params)
      .map(toFragment)
  }

  public listByDate(projectId: string, date: string): LibraryFragment[] {
    return this.listByProject(projectId, { date })
  }

  public update(id: string, input: UpdateFragmentInput, expectedVersion?: number): LibraryFragment | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Fragment', id, expectedVersion, current.version)
    }
    const next = {
      date: input.date ?? current.date,
      time: input.time === undefined ? current.time : input.time,
      origin: input.origin ?? current.origin,
      mood: input.mood === undefined ? current.mood : input.mood,
      content: input.content ?? current.content,
      env_tags: input.env_tags ?? current.env_tags,
      behavior_tags: input.behavior_tags ?? current.behavior_tags,
      custom_tags: input.custom_tags ?? current.custom_tags,
      writing_mode: input.writing_mode ?? current.writing_mode,
      theme: input.theme === undefined ? current.theme : input.theme,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE fragments
             SET date = ?, time = ?, origin = ?, mood = ?, content = ?, env_tags_json = ?,
                 behavior_tags_json = ?, custom_tags_json = ?, writing_mode = ?, theme = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.date,
            next.time,
            next.origin,
            next.mood,
            next.content,
            stringifyStringArray(next.env_tags),
            stringifyStringArray(next.behavior_tags),
            stringifyStringArray(next.custom_tags),
            next.writing_mode,
            next.theme,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE fragments
             SET date = ?, time = ?, origin = ?, mood = ?, content = ?, env_tags_json = ?,
                 behavior_tags_json = ?, custom_tags_json = ?, writing_mode = ?, theme = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.date,
            next.time,
            next.origin,
            next.mood,
            next.content,
            stringifyStringArray(next.env_tags),
            stringifyStringArray(next.behavior_tags),
            stringifyStringArray(next.custom_tags),
            next.writing_mode,
            next.theme,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Fragment', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Fragment', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM fragments WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM fragments WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Fragment', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }
}
