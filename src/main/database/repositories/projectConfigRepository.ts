import { VersionConflictError } from '../../../shared/novelProject'
import type {
  JsonObject,
  ProjectConfig,
  UpdateProjectConfigInput,
} from '../../../shared/novelProject'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

export type { ProjectConfig, UpdateProjectConfigInput }

interface ProjectConfigRow {
  project_id: string
  default_llm_config_id: string | null
  genre: string
  tone: string
  target_words: number | null
  context_budget: number | null
  settings_json: string
  version: number
  created_at: string
  updated_at: string
}

function now(): string {
  return new Date().toISOString()
}

function toProjectConfig(row: ProjectConfigRow): ProjectConfig {
  const settings = parseJsonObject(row.settings_json, 'project_config.settings')
  if (!settings) throw new Error('Project config settings cannot be null')
  return {
    project_id: row.project_id,
    default_llm_config_id: row.default_llm_config_id,
    genre: row.genre,
    tone: row.tone,
    target_words: row.target_words,
    context_budget: row.context_budget,
    settings: settings as JsonObject,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class ProjectConfigRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public getByProject(projectId: string): ProjectConfig | null {
    const row = this.database
      .prepare<ProjectConfigRow>('SELECT * FROM project_configs WHERE project_id = ?')
      .get(projectId)
    return row ? toProjectConfig(row) : null
  }

  public save(
    projectId: string,
    input: UpdateProjectConfigInput,
    expectedVersion?: number,
  ): ProjectConfig {
    const current = this.getByProject(projectId)
    if (!current) {
      if (expectedVersion !== undefined) {
        throw new VersionConflictError('Project config', projectId, expectedVersion, 0)
      }
      const timestamp = now()
      this.database
        .prepare(
          `INSERT INTO project_configs (
            project_id, default_llm_config_id, genre, tone, target_words, context_budget,
            settings_json, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          projectId,
          input.default_llm_config_id ?? null,
          input.genre ?? '',
          input.tone ?? '',
          input.target_words ?? null,
          input.context_budget ?? null,
          stringifyJsonObject(input.settings ?? {}),
          timestamp,
          timestamp,
        )
      const created = this.getByProject(projectId)
      if (!created) throw new Error('Project config was not created')
      return created
    }
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Project config', projectId, expectedVersion, current.version)
    }
    const next = {
      default_llm_config_id:
        input.default_llm_config_id === undefined
          ? current.default_llm_config_id
          : input.default_llm_config_id,
      genre: input.genre ?? current.genre,
      tone: input.tone ?? current.tone,
      target_words: input.target_words === undefined ? current.target_words : input.target_words,
      context_budget:
        input.context_budget === undefined ? current.context_budget : input.context_budget,
      settings: input.settings ?? current.settings,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE project_configs
             SET default_llm_config_id = ?, genre = ?, tone = ?, target_words = ?,
                 context_budget = ?, settings_json = ?, version = version + 1, updated_at = ?
             WHERE project_id = ?`,
          )
          .run(
            next.default_llm_config_id,
            next.genre,
            next.tone,
            next.target_words,
            next.context_budget,
            stringifyJsonObject(next.settings),
            now(),
            projectId,
          )
      : this.database
          .prepare(
            `UPDATE project_configs
             SET default_llm_config_id = ?, genre = ?, tone = ?, target_words = ?,
                 context_budget = ?, settings_json = ?, version = version + 1, updated_at = ?
             WHERE project_id = ? AND version = ?`,
          )
          .run(
            next.default_llm_config_id,
            next.genre,
            next.tone,
            next.target_words,
            next.context_budget,
            stringifyJsonObject(next.settings),
            now(),
            projectId,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getByProject(projectId)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Project config', projectId, expectedVersion, actual.version)
      }
      throw new Error(`Project config not found: ${projectId}`)
    }
    const updated = this.getByProject(projectId)
    if (!updated) throw new Error('Project config disappeared after update')
    return updated
  }
}
