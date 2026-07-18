import { randomUUID } from 'node:crypto'
import type {
  ProjectSkill,
  ProjectSkillState,
  SkillDefinition,
} from '../../../shared/narrativeWorkbench'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { JsonObject } from '../json'
import type { SqliteDatabase } from '../types'

interface SkillRow {
  id: string
  name: string
  description: string
  version: string
  prompt_template: string
  config_schema_json: string
  created_at: string
  updated_at: string
}

interface ProjectSkillRow {
  project_id: string
  skill_id: string
  enabled: number
  config_json: string
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toSkill(row: SkillRow): SkillDefinition {
  const configSchema = parseJsonObject(row.config_schema_json, 'skill.config_schema')
  if (!configSchema) throw new Error('Skill config schema cannot be null')
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    prompt_template: row.prompt_template,
    config_schema: configSchema as JsonObject,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toProjectSkill(row: ProjectSkillRow): ProjectSkill {
  const config = parseJsonObject(row.config_json, 'project_skill.config')
  if (!config) throw new Error('Project skill config cannot be null')
  return {
    project_id: row.project_id,
    skill_id: row.skill_id,
    enabled: row.enabled === 1,
    config: config as JsonObject,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class SkillRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(
    input: Omit<SkillDefinition, 'id' | 'created_at' | 'updated_at'> & { id?: string },
  ): SkillDefinition {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO skills (
          id, name, description, version, prompt_template, config_schema_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.description,
        input.version,
        input.prompt_template,
        stringifyJsonObject(input.config_schema),
        timestamp,
        timestamp,
      )
    const skill = this.getById(id)
    if (!skill) throw new Error('Skill was not created')
    return skill
  }

  public getById(id: string): SkillDefinition | null {
    const row = this.database.prepare<SkillRow>('SELECT * FROM skills WHERE id = ?').get(id)
    return row ? toSkill(row) : null
  }

  public getByName(name: string): SkillDefinition | null {
    const row = this.database.prepare<SkillRow>('SELECT * FROM skills WHERE name = ?').get(name)
    return row ? toSkill(row) : null
  }

  public list(): SkillDefinition[] {
    return this.database
      .prepare<SkillRow>('SELECT * FROM skills ORDER BY name, id')
      .all()
      .map(toSkill)
  }

  public listByProject(projectId: string): ProjectSkillState[] {
    return this.database
      .prepare<
        SkillRow & {
          project_id: string
          enabled: number | null
          config_json: string | null
        }
      >(
        `SELECT s.*, ps.project_id, ps.enabled, ps.config_json
         FROM skills s
         LEFT JOIN project_skills ps
           ON ps.skill_id = s.id AND ps.project_id = ?
         ORDER BY s.name, s.id`,
      )
      .all(projectId)
      .map((row) => {
        const definition = toSkill(row)
        const config = row.config_json ? parseJsonObject(row.config_json, 'project_skill.config') : {}
        return {
          ...definition,
          project_id: projectId,
          enabled: row.enabled === null ? true : row.enabled === 1,
          config: config as JsonObject,
        }
      })
  }

  public setProjectSkill(
    projectId: string,
    skillId: string,
    enabled: boolean,
    config: JsonObject = {},
  ): ProjectSkill {
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO project_skills (
          project_id, skill_id, enabled, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, skill_id) DO UPDATE SET
          enabled = excluded.enabled,
          config_json = excluded.config_json,
          updated_at = excluded.updated_at`,
      )
      .run(projectId, skillId, enabled ? 1 : 0, stringifyJsonObject(config), timestamp, timestamp)
    const row = this.database
      .prepare<ProjectSkillRow>(
        'SELECT * FROM project_skills WHERE project_id = ? AND skill_id = ?',
      )
      .get(projectId, skillId)
    if (!row) throw new Error('Project skill was not saved')
    return toProjectSkill(row)
  }
}

export type { ProjectSkill, ProjectSkillState, SkillDefinition }
