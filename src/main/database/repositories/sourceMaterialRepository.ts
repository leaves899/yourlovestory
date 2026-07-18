import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type {
  CreateSourceMaterialInput,
  JsonObject,
  SourceMaterial,
  SourceMaterialListOptions,
  UpdateSourceMaterialInput,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type {
  CreateSourceMaterialInput,
  SourceMaterial,
  SourceMaterialListOptions,
  UpdateSourceMaterialInput,
}

interface SourceMaterialRow {
  id: string
  project_id: string
  character_id: string | null
  fragment_id: string | null
  title: string
  material_type: string
  uri: string | null
  content: string
  metadata_json: string
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toSourceMaterial(row: SourceMaterialRow): SourceMaterial {
  const metadata = parseJsonObject(row.metadata_json, 'source_material.metadata')
  if (!metadata) throw new Error('Source material metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    character_id: row.character_id,
    fragment_id: row.fragment_id,
    title: row.title,
    material_type: row.material_type,
    uri: row.uri,
    content: row.content,
    metadata: metadata as JsonObject,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class SourceMaterialRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateSourceMaterialInput): SourceMaterial {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO source_materials (
          id, project_id, character_id, fragment_id, title, material_type, uri, content,
          metadata_json, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.character_id ?? null,
        input.fragment_id ?? null,
        input.title,
        input.material_type ?? 'text',
        input.uri ?? null,
        input.content ?? '',
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const material = this.getById(id)
    if (!material) throw new Error('Source material was not created')
    return material
  }

  public getById(id: string): SourceMaterial | null {
    const row = this.database
      .prepare<SourceMaterialRow>('SELECT * FROM source_materials WHERE id = ?')
      .get(id)
    return row ? toSourceMaterial(row) : null
  }

  public getByFragmentId(projectId: string, fragmentId: string): SourceMaterial | null {
    const row = this.database
      .prepare<SourceMaterialRow>(
        'SELECT * FROM source_materials WHERE project_id = ? AND fragment_id = ?',
      )
      .get(projectId, fragmentId)
    return row ? toSourceMaterial(row) : null
  }

  public listByProject(
    projectId: string,
    options: SourceMaterialListOptions = {},
  ): SourceMaterial[] {
    const conditions = ['project_id = ?']
    const params: unknown[] = [projectId]
    if (options.character_id !== undefined) {
      conditions.push(options.character_id === null ? 'character_id IS NULL' : 'character_id = ?')
      if (options.character_id !== null) params.push(options.character_id)
    }
    if (options.fragment_id !== undefined) {
      conditions.push(options.fragment_id === null ? 'fragment_id IS NULL' : 'fragment_id = ?')
      if (options.fragment_id !== null) params.push(options.fragment_id)
    }
    if (options.material_type !== undefined) {
      conditions.push('material_type = ?')
      params.push(options.material_type)
    }
    return this.database
      .prepare<SourceMaterialRow>(
        `SELECT * FROM source_materials WHERE ${conditions.join(' AND ')}
         ORDER BY created_at, id`,
      )
      .all(...params)
      .map(toSourceMaterial)
  }

  public update(
    id: string,
    input: UpdateSourceMaterialInput,
    expectedVersion?: number,
  ): SourceMaterial | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Source material', id, expectedVersion, current.version)
    }
    const next = {
      character_id:
        input.character_id === undefined ? current.character_id : input.character_id,
      fragment_id: input.fragment_id === undefined ? current.fragment_id : input.fragment_id,
      title: input.title ?? current.title,
      material_type: input.material_type ?? current.material_type,
      uri: input.uri === undefined ? current.uri : input.uri,
      content: input.content ?? current.content,
      metadata: input.metadata ?? current.metadata,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE source_materials
             SET character_id = ?, fragment_id = ?, title = ?, material_type = ?, uri = ?,
                 content = ?, metadata_json = ?, version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.character_id,
            next.fragment_id,
            next.title,
            next.material_type,
            next.uri,
            next.content,
            stringifyJsonObject(next.metadata),
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE source_materials
             SET character_id = ?, fragment_id = ?, title = ?, material_type = ?, uri = ?,
                 content = ?, metadata_json = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.character_id,
            next.fragment_id,
            next.title,
            next.material_type,
            next.uri,
            next.content,
            stringifyJsonObject(next.metadata),
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Source material', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Source material', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM source_materials WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM source_materials WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Source material', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }
}
