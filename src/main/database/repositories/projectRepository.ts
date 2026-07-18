import { randomUUID } from 'node:crypto'
import { CurrentProjectDeletionError, VersionConflictError } from '../../../shared/novelProject'
import type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  UpdateProjectInput,
} from '../../../shared/novelProject'
import type { SqliteDatabase } from '../types'

export type { CreateProjectInput, Project, ProjectStatus, UpdateProjectInput }

interface ProjectRow {
  id: string
  slug: string
  name: string
  description: string
  status: string
  version: number
  created_at: string
  updated_at: string
}

function toProject(row: ProjectRow): Project {
  if (row.status !== 'active' && row.status !== 'archived') {
    throw new Error(`Unknown project status: ${row.status}`)
  }
  return { ...row, status: row.status }
}

function now(): string {
  return new Date().toISOString()
}

export class ProjectRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateProjectInput): Project {
    const timestamp = now()
    const id = input.id ?? randomUUID()
    const insert = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO projects (
            id, slug, name, description, status, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          id,
          input.slug,
          input.name,
          input.description ?? '',
          input.status ?? 'active',
          timestamp,
          timestamp,
        )
      this.database
        .prepare('INSERT INTO project_configs (project_id) VALUES (?)')
        .run(id)
    })
    insert()
    const project = this.getById(id)
    if (!project) throw new Error('Project was not created')
    return project
  }

  public getById(id: string): Project | null {
    const row = this.database
      .prepare<ProjectRow>('SELECT * FROM projects WHERE id = ?')
      .get(id)
    return row ? toProject(row) : null
  }

  public getBySlug(slug: string): Project | null {
    const row = this.database
      .prepare<ProjectRow>('SELECT * FROM projects WHERE slug = ?')
      .get(slug)
    return row ? toProject(row) : null
  }

  public list(): Project[] {
    return this.database
      .prepare<ProjectRow>('SELECT * FROM projects ORDER BY created_at, id')
      .all()
      .map(toProject)
  }

  public update(id: string, input: UpdateProjectInput, expectedVersion?: number): Project | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Project', id, expectedVersion, current.version)
    }

    const next = {
      slug: input.slug ?? current.slug,
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      status: input.status ?? current.status,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE projects
             SET slug = ?, name = ?, description = ?, status = ?, version = version + 1,
                 updated_at = ?
             WHERE id = ?`,
          )
          .run(next.slug, next.name, next.description, next.status, now(), id)
      : this.database
          .prepare(
            `UPDATE projects
             SET slug = ?, name = ?, description = ?, status = ?, version = version + 1,
                 updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(next.slug, next.name, next.description, next.status, now(), id, expectedVersion)
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Project', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const project = this.getById(id)
    if (!project) return false
    const current = this.database
      .prepare<{ current_project_id: string | null }>(
        'SELECT current_project_id FROM workbench_state WHERE id = 1',
      )
      .get()
    if (current?.current_project_id === id) {
      throw new CurrentProjectDeletionError(id)
    }
    if (expectedVersion !== undefined && project.version !== expectedVersion) {
      throw new VersionConflictError('Project', id, expectedVersion, project.version)
    }
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM projects WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM projects WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Project', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }
}
