import { randomUUID } from 'node:crypto'
import {
  InvalidRelationEndpointError,
  VersionConflictError,
} from '../../../shared/novelProject'
import type {
  CreateRelationInput,
  JsonObject,
  Relation,
  RelationEndpoint,
  RelationEntityType,
  UpdateRelationInput,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type {
  CreateRelationInput,
  Relation,
  RelationEndpoint,
  RelationEntityType,
  UpdateRelationInput,
}

interface RelationRow {
  id: string
  project_id: string
  source_entity_type: string
  source_entity_id: string | null
  target_entity_type: string
  target_entity_id: string | null
  source_character_id: string | null
  target_character_id: string | null
  relation_type: string
  description: string
  strength: number | null
  metadata_json: string
  version: number
  created_at: string
  updated_at: string
}

const relationEntityTypes: readonly RelationEntityType[] = [
  'character',
  'organization',
  'worldview',
]

function now(): string {
  return new Date().toISOString()
}

function readEntityType(value: string): RelationEntityType {
  if (!relationEntityTypes.includes(value as RelationEntityType)) {
    throw new InvalidRelationEndpointError(`Unknown relation entity type: ${value}`)
  }
  return value as RelationEntityType
}

function toRelation(row: RelationRow): Relation {
  const sourceType = readEntityType(row.source_entity_type)
  const targetType = readEntityType(row.target_entity_type)
  const sourceId = row.source_entity_id ?? row.source_character_id
  const targetId = row.target_entity_id ?? row.target_character_id
  if (!sourceId || !targetId) throw new Error('Relation endpoint id cannot be null')
  const metadata = parseJsonObject(row.metadata_json, 'relation.metadata')
  if (!metadata) throw new Error('Relation metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    source_entity_type: sourceType,
    source_entity_id: sourceId,
    target_entity_type: targetType,
    target_entity_id: targetId,
    source_character_id: row.source_character_id,
    target_character_id: row.target_character_id,
    relation_type: row.relation_type,
    description: row.description,
    strength: row.strength,
    metadata: metadata as JsonObject,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class RelationRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateRelationInput): Relation {
    this.assertDistinctEndpoints(input.source, input.target)
    this.assertEndpointBelongsToProject(input.project_id, input.source)
    this.assertEndpointBelongsToProject(input.project_id, input.target)
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO relations (
          id, project_id, source_character_id, target_character_id, relation_type,
          description, strength, metadata_json, source_entity_type, source_entity_id,
          target_entity_type, target_entity_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.source.type === 'character' ? input.source.id : null,
        input.target.type === 'character' ? input.target.id : null,
        input.relation_type,
        input.description ?? '',
        input.strength ?? null,
        stringifyJsonObject(input.metadata ?? {}),
        input.source.type,
        input.source.id,
        input.target.type,
        input.target.id,
        timestamp,
        timestamp,
      )
    const relation = this.getById(id)
    if (!relation) throw new Error('Relation was not created')
    return relation
  }

  public getById(id: string): Relation | null {
    const row = this.database.prepare<RelationRow>('SELECT * FROM relations WHERE id = ?').get(id)
    return row ? toRelation(row) : null
  }

  public listByProject(projectId: string): Relation[] {
    return this.database
      .prepare<RelationRow>(
        'SELECT * FROM relations WHERE project_id = ? ORDER BY created_at, id',
      )
      .all(projectId)
      .map(toRelation)
  }

  public listByEntity(projectId: string, endpoint: RelationEndpoint): Relation[] {
    this.assertEndpointBelongsToProject(projectId, endpoint)
    return this.database
      .prepare<RelationRow>(
        `SELECT * FROM relations
         WHERE project_id = ? AND (
           (source_entity_type = ? AND source_entity_id = ?)
           OR (target_entity_type = ? AND target_entity_id = ?)
         )
         ORDER BY created_at, id`,
      )
      .all(projectId, endpoint.type, endpoint.id, endpoint.type, endpoint.id)
      .map(toRelation)
  }

  public update(id: string, input: UpdateRelationInput, expectedVersion?: number): Relation | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Relation', id, expectedVersion, current.version)
    }
    const source = input.source ?? {
      type: current.source_entity_type,
      id: current.source_entity_id,
    }
    const target = input.target ?? {
      type: current.target_entity_type,
      id: current.target_entity_id,
    }
    this.assertDistinctEndpoints(source, target)
    this.assertEndpointBelongsToProject(current.project_id, source)
    this.assertEndpointBelongsToProject(current.project_id, target)
    const next = {
      relation_type: input.relation_type ?? current.relation_type,
      description: input.description ?? current.description,
      strength: input.strength === undefined ? current.strength : input.strength,
      metadata: input.metadata ?? current.metadata,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE relations
             SET source_character_id = ?, target_character_id = ?, relation_type = ?,
                 description = ?, strength = ?, metadata_json = ?,
                 source_entity_type = ?, source_entity_id = ?,
                 target_entity_type = ?, target_entity_id = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            source.type === 'character' ? source.id : null,
            target.type === 'character' ? target.id : null,
            next.relation_type,
            next.description,
            next.strength,
            stringifyJsonObject(next.metadata),
            source.type,
            source.id,
            target.type,
            target.id,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE relations
             SET source_character_id = ?, target_character_id = ?, relation_type = ?,
                 description = ?, strength = ?, metadata_json = ?,
                 source_entity_type = ?, source_entity_id = ?,
                 target_entity_type = ?, target_entity_id = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            source.type === 'character' ? source.id : null,
            target.type === 'character' ? target.id : null,
            next.relation_type,
            next.description,
            next.strength,
            stringifyJsonObject(next.metadata),
            source.type,
            source.id,
            target.type,
            target.id,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Relation', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Relation', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM relations WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM relations WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Relation', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }

  private assertDistinctEndpoints(source: RelationEndpoint, target: RelationEndpoint): void {
    if (source.type === target.type && source.id === target.id) {
      throw new InvalidRelationEndpointError('A relation cannot connect an entity to itself')
    }
  }

  private assertEndpointBelongsToProject(projectId: string, endpoint: RelationEndpoint): void {
    const table = endpoint.type === 'character'
      ? 'characters'
      : endpoint.type === 'organization'
        ? 'organizations'
        : 'worldview_entries'
    const row = this.database
      .prepare<{ project_id: string }>(`SELECT project_id FROM ${table} WHERE id = ?`)
      .get(endpoint.id)
    if (!row || row.project_id !== projectId) {
      throw new InvalidRelationEndpointError(
        `Relation endpoint does not belong to project: ${endpoint.type}/${endpoint.id}`,
      )
    }
  }
}
