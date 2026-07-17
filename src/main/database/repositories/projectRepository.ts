import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from '../types'

export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  slug: string
  name: string
  description: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  id?: string
  slug: string
  name: string
  description?: string
  status?: ProjectStatus
}

export interface UpdateProjectInput {
  slug?: string
  name?: string
  description?: string
  status?: ProjectStatus
}

interface ProjectRow {
  id: string
  slug: string
  name: string
  description: string
  status: string
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
    this.database
      .prepare(
        `INSERT INTO projects (id, slug, name, description, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
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

  public update(id: string, input: UpdateProjectInput): Project | null {
    const current = this.getById(id)
    if (!current) return null

    const next = {
      slug: input.slug ?? current.slug,
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      status: input.status ?? current.status,
    }
    this.database
      .prepare(
        `UPDATE projects
         SET slug = ?, name = ?, description = ?, status = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.slug, next.name, next.description, next.status, now(), id)
    return this.getById(id)
  }

  public delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return result.changes > 0
  }
}
