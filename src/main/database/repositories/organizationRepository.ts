import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type {
  CreateOrganizationInput,
  Organization,
  UpdateOrganizationInput,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type { CreateOrganizationInput, Organization, UpdateOrganizationInput }

interface OrganizationRow {
  id: string
  project_id: string
  name: string
  description: string
  metadata_json: string
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toOrganization(row: OrganizationRow): Organization {
  const metadata = parseJsonObject(row.metadata_json, 'organization.metadata')
  if (!metadata) throw new Error('Organization metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    name: row.name,
    description: row.description,
    metadata,
    sort_order: row.sort_order,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class OrganizationRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateOrganizationInput): Organization {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO organizations (
          id, project_id, name, description, metadata_json, sort_order, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.name,
        input.description ?? '',
        stringifyJsonObject(input.metadata ?? {}),
        input.sort_order ?? 0,
        timestamp,
        timestamp,
      )
    const organization = this.getById(id)
    if (!organization) throw new Error('Organization was not created')
    return organization
  }

  public getById(id: string): Organization | null {
    const row = this.database
      .prepare<OrganizationRow>('SELECT * FROM organizations WHERE id = ?')
      .get(id)
    return row ? toOrganization(row) : null
  }

  public listByProject(projectId: string): Organization[] {
    return this.database
      .prepare<OrganizationRow>(
        'SELECT * FROM organizations WHERE project_id = ? ORDER BY sort_order, created_at, id',
      )
      .all(projectId)
      .map(toOrganization)
  }

  public update(
    id: string,
    input: UpdateOrganizationInput,
    expectedVersion?: number,
  ): Organization | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Organization', id, expectedVersion, current.version)
    }
    const next = {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      metadata: input.metadata ?? current.metadata,
      sort_order: input.sort_order ?? current.sort_order,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE organizations
             SET name = ?, description = ?, metadata_json = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.name,
            next.description,
            stringifyJsonObject(next.metadata),
            next.sort_order,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE organizations
             SET name = ?, description = ?, metadata_json = ?, sort_order = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.name,
            next.description,
            stringifyJsonObject(next.metadata),
            next.sort_order,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Organization', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Organization', id, expectedVersion, current.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM organizations WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM organizations WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Organization', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }
}
