import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type {
  Character,
  CreateCharacterInput,
  UpdateCharacterInput,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type { Character, CreateCharacterInput, UpdateCharacterInput }

interface CharacterRow {
  id: string
  project_id: string
  name: string
  role: string
  crush_slug: string | null
  profile_json: string
  notes: string
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toCharacter(row: CharacterRow): Character {
  const profile = parseJsonObject(row.profile_json, 'character.profile')
  if (!profile) throw new Error('Character profile cannot be null')
  return { ...row, profile }
}

export class CharacterRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateCharacterInput): Character {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO characters (
          id, project_id, name, role, crush_slug, profile_json, notes, sort_order,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.name,
        input.role ?? '',
        input.crush_slug ?? null,
        stringifyJsonObject(input.profile ?? {}),
        input.notes ?? '',
        input.sort_order ?? 0,
        timestamp,
        timestamp,
      )
    const character = this.getById(id)
    if (!character) throw new Error('Character was not created')
    return character
  }

  public getById(id: string): Character | null {
    const row = this.database.prepare<CharacterRow>('SELECT * FROM characters WHERE id = ?').get(id)
    return row ? toCharacter(row) : null
  }

  public getByCrushSlug(projectId: string, crushSlug: string): Character | null {
    const row = this.database
      .prepare<CharacterRow>(
        'SELECT * FROM characters WHERE project_id = ? AND crush_slug = ?',
      )
      .get(projectId, crushSlug)
    return row ? toCharacter(row) : null
  }

  public listByProject(projectId: string): Character[] {
    return this.database
      .prepare<CharacterRow>(
        'SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order, created_at, id',
      )
      .all(projectId)
      .map(toCharacter)
  }

  public update(id: string, input: UpdateCharacterInput, expectedVersion?: number): Character | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Character', id, expectedVersion, current.version)
    }
    const next = {
      name: input.name ?? current.name,
      role: input.role ?? current.role,
      crush_slug: input.crush_slug === undefined ? current.crush_slug : input.crush_slug,
      profile: input.profile ?? current.profile,
      notes: input.notes ?? current.notes,
      sort_order: input.sort_order ?? current.sort_order,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE characters
             SET name = ?, role = ?, crush_slug = ?, profile_json = ?, notes = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.name,
            next.role,
            next.crush_slug,
            stringifyJsonObject(next.profile),
            next.notes,
            next.sort_order,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE characters
             SET name = ?, role = ?, crush_slug = ?, profile_json = ?, notes = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.name,
            next.role,
            next.crush_slug,
            stringifyJsonObject(next.profile),
            next.notes,
            next.sort_order,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Character', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Character', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM characters WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM characters WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Character', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }
}
