import { randomUUID } from 'node:crypto'
import type { JsonValue } from '../../shared/novelProject'
import {
  ARCHIVE_TABLES,
  isArchiveTimestampColumn,
  validateProjectArchive,
} from '../../shared/projectPortability/archiveSchema'
import {
  canonicalizeProjectArchiveWarnings,
  isCanonicalPortableSourceUri,
  portableSourceUri,
  PROJECT_ARCHIVE_MAX_BYTES,
  PROJECT_ARCHIVE_FORMAT,
  PROJECT_ARCHIVE_VERSION,
  portabilityError,
  projectArchiveIntegritySha256,
  projectArchiveWarningMessage,
  sha256,
  stableStringify,
  type ProjectArchiveCollection,
  type ProjectArchivePayloadV1,
  type ProjectArchiveRecord,
  type ProjectArchiveRecordCounts,
  type ProjectArchiveV1,
  type ProjectArchiveWarning,
  type ProjectImportResult,
} from '../../shared/projectPortability'
import {
  inspectPortableConfiguration,
  sanitizePortableConfiguration,
} from '../../shared/security/configCredentialSafety'
import { normalizeModelEndpoint } from '../../shared/security/urlSecurity'
import type { SqliteDatabase } from '../database'

const EXCLUSIONS = [
  'API keys and credential identifiers',
  'application settings and local paths',
  'database backups, metadata, and migrations',
  'workbench state',
  'global skill prompts and templates',
  'tasks, checkpoints, chats, and post-process reports',
  'logs, environment variables, diagnostics, and recovery files',
] as const

const JSON_COLUMNS = new Set([
  'settings_json',
  'profile_json',
  'metadata_json',
  'key_turning_points_json',
  'outline_json',
  'source_material_ids_json',
  'key_events_json',
  'blocks_json',
  'fact_check_json',
  'evidence_json',
  'config',
])

const BOOLEAN_COLUMNS = new Set(['streaming_enabled', 'is_default', 'is_current', 'enabled'])

const PROJECT_SCOPED_TABLES = [
  'projects',
  'project_configs',
  'llm_configs',
  'characters',
  'worldview_entries',
  'organizations',
  'relations',
  'source_materials',
  'arcs',
  'volumes',
  'volume_outlines',
  'chapter_outlines',
  'chapters',
  'foreshadows',
  'narrative_memories',
  'narrative_memory_proposals',
  'roadmap_items',
] as const

interface RawRow {
  [column: string]: unknown
}

interface ProjectRow {
  id: string
  slug: string
  name: string
}

export interface ProjectPortabilityServiceOptions {
  appVersion: string
  schemaVersion: number
  archiveMaxBytes?: number
  faultInjection?: (stage: string) => void
}

export interface BuiltProjectArchive {
  archive: ProjectArchiveV1
  json: string
  sha256: string
  recordCounts: ProjectArchiveRecordCounts
}

function isJsonValue(value: unknown): value is JsonValue {
  const pending: unknown[] = [value]
  while (pending.length > 0) {
    const current = pending.pop()
    if (
      current === null
      || typeof current === 'string'
      || typeof current === 'boolean'
      || (typeof current === 'number' && Number.isFinite(current))
    ) continue
    if (Array.isArray(current)) {
      for (const entry of current) pending.push(entry)
      continue
    }
    if (typeof current !== 'object') return false
    for (const entry of Object.values(current)) pending.push(entry)
  }
  return true
}

function parseJsonColumn(value: unknown): JsonValue {
  if (typeof value !== 'string') throw portabilityError('PROJECT_EXPORT_FAILED')
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isJsonValue(parsed)) throw portabilityError('PROJECT_EXPORT_FAILED')
    return parsed
  } catch {
    throw portabilityError('PROJECT_EXPORT_FAILED')
  }
}

function normalizeDatabaseTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw portabilityError('PROJECT_EXPORT_FAILED')
  const sqliteUtc = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value)
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const explicitIso =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  if (!sqliteUtc && !dateOnly && !explicitIso) {
    throw portabilityError('PROJECT_EXPORT_FAILED')
  }
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!dateParts) throw portabilityError('PROJECT_EXPORT_FAILED')
  const year = Number(dateParts[1])
  const month = Number(dateParts[2])
  const day = Number(dateParts[3])
  const normalizedDate = new Date(Date.UTC(year, month - 1, day))
  if (
    normalizedDate.getUTCFullYear() !== year
    || normalizedDate.getUTCMonth() !== month - 1
    || normalizedDate.getUTCDate() !== day
  ) {
    throw portabilityError('PROJECT_EXPORT_FAILED')
  }
  const candidate = sqliteUtc
    ? `${sqliteUtc[1]}T${sqliteUtc[2]}Z`
    : dateOnly
      ? `${value}T00:00:00Z`
      : value
  const timestamp = new Date(candidate)
  if (Number.isNaN(timestamp.getTime())) throw portabilityError('PROJECT_EXPORT_FAILED')
  return timestamp.toISOString()
}

function toArchiveRow(row: RawRow, table: ProjectArchiveCollection): ProjectArchiveRecord {
  const result: ProjectArchiveRecord = {}
  for (const column of Object.keys(ARCHIVE_TABLES[table])) {
    const value = row[column]
    if (isArchiveTimestampColumn(table, column) && value !== null) {
      result[column] = normalizeDatabaseTimestamp(value)
    } else if (JSON_COLUMNS.has(column)) result[column] = parseJsonColumn(value)
    else if (BOOLEAN_COLUMNS.has(column)) result[column] = value === 1
    else if (value === null || typeof value === 'string' || typeof value === 'number') {
      result[column] = value
    } else {
      throw portabilityError('PROJECT_EXPORT_FAILED')
    }
  }
  return result
}

function databaseValue(column: string, value: JsonValue): unknown {
  if (JSON_COLUMNS.has(column)) return JSON.stringify(value)
  if (BOOLEAN_COLUMNS.has(column)) return value ? 1 : 0
  return value
}

function counts(payload: ProjectArchivePayloadV1): ProjectArchiveRecordCounts {
  return Object.fromEntries(
    Object.keys(ARCHIVE_TABLES).map((table) => [
      table,
      payload[table as ProjectArchiveCollection].length,
    ]),
  ) as ProjectArchiveRecordCounts
}

function stringField(row: ProjectArchiveRecord, field: string): string {
  const value = row[field]
  if (typeof value !== 'string') throw portabilityError('PROJECT_IMPORT_INVALID')
  return value
}

function nullableStringField(row: ProjectArchiveRecord, field: string): string | null {
  const value = row[field]
  if (value !== null && typeof value !== 'string') {
    throw portabilityError('PROJECT_IMPORT_INVALID')
  }
  return value
}

function normalizeSlug(value: string): string {
  const slug = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'imported-project'
}

export class ProjectPortabilityService {
  public constructor(
    private readonly database: SqliteDatabase,
    private readonly options: ProjectPortabilityServiceOptions,
  ) {}

  public async buildArchive(projectId: string): Promise<BuiltProjectArchive> {
    const project = this.database
      .prepare<ProjectRow>('SELECT id, slug, name FROM projects WHERE id = ?')
      .get(projectId)
    if (!project) throw portabilityError('PROJECT_NOT_FOUND')

    const payload = this.readPayload(projectId)
    const warnings = this.sanitizeExternalLinks(
      payload,
      this.countBoundLlmCredentials(projectId),
    )
    warnings.push(
      {
        code: 'runtime-history-excluded',
        count: 0,
        message: projectArchiveWarningMessage('runtime-history-excluded', 0),
      },
    )
    const archive: ProjectArchiveV1 = {
      manifest: {
        format: PROJECT_ARCHIVE_FORMAT,
        formatVersion: PROJECT_ARCHIVE_VERSION,
        exportedAt: new Date().toISOString(),
        appVersion: this.options.appVersion,
        databaseSchemaVersion: this.options.schemaVersion,
        sourceProjectId: project.id,
        projectName: project.name,
        integritySha256: '0'.repeat(64),
        exclusions: [...EXCLUSIONS],
        warnings,
      },
      payload,
    }
    archive.manifest.integritySha256 = projectArchiveIntegritySha256(archive)
    await this.validateArchive(archive)
    const json = `${stableStringify(archive)}\n`
    const archiveMaxBytes = Math.min(
      this.options.archiveMaxBytes ?? PROJECT_ARCHIVE_MAX_BYTES,
      PROJECT_ARCHIVE_MAX_BYTES,
    )
    if (Buffer.byteLength(json) > archiveMaxBytes) {
      throw portabilityError('PROJECT_EXPORT_TOO_LARGE')
    }
    return { archive, json, sha256: sha256(json), recordCounts: counts(payload) }
  }

  public async inspectArchiveJson(json: string): Promise<ProjectArchiveV1> {
    let value: unknown
    try {
      value = JSON.parse(json)
    } catch {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    const archive = await validateProjectArchive(value)
    await this.validateArchive(archive)
    return archive
  }

  private async validateArchive(archive: ProjectArchiveV1): Promise<void> {
    await validateProjectArchive(archive)
    if (projectArchiveIntegritySha256(archive) !== archive.manifest.integritySha256) {
      throw portabilityError('PROJECT_IMPORT_CHECKSUM_MISMATCH')
    }
    if (
      archive.payload.projects.length !== 1
      || archive.manifest.sourceProjectId !== archive.payload.projects[0].id
      || archive.manifest.projectName !== archive.payload.projects[0].name
    ) {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    try {
      archive.manifest.warnings = canonicalizeProjectArchiveWarnings(archive.manifest.warnings)
    } catch {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    this.validateReferences(archive.payload)
  }

  public importArchive(archive: ProjectArchiveV1): ProjectImportResult {
    this.validateReferences(archive.payload)
    const imported = this.remapPayload(archive.payload)
    const missingSkills: string[] = []
    const transaction = this.database.transaction(() => {
      this.insertCollection('projects', imported.projects)
      this.options.faultInjection?.('after-project')
      this.insertCollection('llm_configs', imported.llm_configs)
      this.insertCollection('project_configs', imported.project_configs)
      this.insertCollection('characters', imported.characters)
      this.options.faultInjection?.('after-character')
      this.insertCollection('worldview_entries', imported.worldview_entries)
      this.insertCollection('organizations', imported.organizations)
      this.insertCollection('source_materials', imported.source_materials)
      this.insertSelfReferential('arcs', imported.arcs, 'id', 'parent_arc_id')
      this.insertCollection('volumes', imported.volumes)
      this.insertCollection('volume_outlines', imported.volume_outlines)
      this.insertCollection('chapter_outlines', imported.chapter_outlines)
      this.insertCollection('chapters', imported.chapters)
      this.options.faultInjection?.('after-chapter')
      this.insertSelfReferential(
        'chapter_revisions',
        imported.chapter_revisions,
        'id',
        'parent_revision_id',
      )
      this.insertCollection('chapter_versions', imported.chapter_versions)
      this.insertCollection('relations', imported.relations)
      this.insertCollection('foreshadows', imported.foreshadows)
      this.insertCollection('foreshadow_events', imported.foreshadow_events)
      this.insertCollection('narrative_memories', imported.narrative_memories)
      this.insertCollection('narrative_memory_proposals', imported.narrative_memory_proposals)
      this.options.faultInjection?.('after-narrative-memory')
      this.insertSelfReferential('roadmap_items', imported.roadmap_items, 'id', 'parent_item_id')
      this.insertProjectSkills(imported, missingSkills)
      this.options.faultInjection?.('after-project-skill')
      this.verifyImported(imported, missingSkills.length)
    })
    try {
      transaction()
    } catch (error: unknown) {
      if (
        error instanceof Error
        && error.name === 'ProjectPortabilityException'
      ) throw error
      throw portabilityError('PROJECT_IMPORT_FAILED')
    }
    const project = imported.projects[0]
    return {
      projectId: stringField(project, 'id'),
      projectName: stringField(project, 'name'),
      projectSlug: stringField(project, 'slug'),
      recordCounts: counts(imported),
      missingSkills: [...new Set(missingSkills)].sort(),
      credentialsRequireRebinding: true,
    }
  }

  private readPayload(projectId: string): ProjectArchivePayloadV1 {
    const direct = (table: Exclude<ProjectArchiveCollection, 'project_skills'>): ProjectArchiveRecord[] =>
      this.database
        .prepare<RawRow>(`SELECT ${Object.keys(ARCHIVE_TABLES[table]).join(', ')} FROM ${table} WHERE ${
          table === 'projects' ? 'id' : table === 'project_configs' ? 'project_id' : 'project_id'
        } = ? ORDER BY rowid`)
        .all(projectId)
        .map((row) => toArchiveRow(row, table))

    const child = (
      table: 'chapter_revisions' | 'chapter_versions',
    ): ProjectArchiveRecord[] =>
      this.database
        .prepare<RawRow>(
          `SELECT ${Object.keys(ARCHIVE_TABLES[table]).map((column) => `child.${column}`).join(', ')}
           FROM ${table} child
           JOIN chapters parent ON parent.id = child.chapter_id
           WHERE parent.project_id = ?
           ORDER BY child.rowid`,
        )
        .all(projectId)
        .map((row) => toArchiveRow(row, table))

    const foreshadowEvents = this.database
      .prepare<RawRow>(
        `SELECT ${Object.keys(ARCHIVE_TABLES.foreshadow_events).map((column) => `child.${column}`).join(', ')}
         FROM foreshadow_events child
         JOIN foreshadows parent ON parent.id = child.foreshadow_id
         WHERE parent.project_id = ?
         ORDER BY child.rowid`,
      )
      .all(projectId)
      .map((row) => toArchiveRow(row, 'foreshadow_events'))

    const skills = this.database
      .prepare<RawRow>(
        `SELECT skills.name AS skillName, project_skills.enabled, project_skills.config_json AS config
         FROM project_skills
         JOIN skills ON skills.id = project_skills.skill_id
         WHERE project_skills.project_id = ?
         ORDER BY skills.name`,
      )
      .all(projectId)
      .map((row) => {
        const archiveRow = toArchiveRow(row, 'project_skills')
        return {
          skillName: stringField(archiveRow, 'skillName'),
          enabled: archiveRow.enabled === true,
          config: archiveRow.config,
        }
      })

    return {
      projects: direct('projects'),
      project_configs: direct('project_configs'),
      llm_configs: direct('llm_configs'),
      characters: direct('characters'),
      worldview_entries: direct('worldview_entries'),
      organizations: direct('organizations'),
      relations: direct('relations'),
      source_materials: direct('source_materials'),
      arcs: direct('arcs'),
      volumes: direct('volumes'),
      volume_outlines: direct('volume_outlines'),
      chapter_outlines: direct('chapter_outlines'),
      chapters: direct('chapters'),
      chapter_revisions: child('chapter_revisions'),
      chapter_versions: child('chapter_versions'),
      foreshadows: direct('foreshadows'),
      foreshadow_events: foreshadowEvents,
      narrative_memories: direct('narrative_memories'),
      narrative_memory_proposals: direct('narrative_memory_proposals'),
      roadmap_items: direct('roadmap_items'),
      project_skills: skills,
    }
  }

  private countBoundLlmCredentials(projectId: string): number {
    return this.database.prepare<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM llm_configs
       WHERE project_id = ?
         AND TRIM(COALESCE(credential_id, '')) <> ''`,
    ).get(projectId)?.count ?? 0
  }

  private normalizeLlmEndpoints(
    payload: ProjectArchivePayloadV1,
    mode: 'export' | 'import',
  ): void {
    for (const row of payload.llm_configs) {
      const baseUrl = row.base_url
      if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
        throw portabilityError(
          mode === 'export' ? 'PROJECT_EXPORT_FAILED' : 'PROJECT_IMPORT_INVALID',
        )
      }
      let normalized: string
      try {
        normalized = normalizeModelEndpoint(baseUrl).normalized
      } catch {
        throw portabilityError(
          mode === 'export' ? 'PROJECT_EXPORT_FAILED' : 'PROJECT_IMPORT_INVALID',
        )
      }
      if (mode === 'import' && normalized !== baseUrl) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
      if (mode === 'export') row.base_url = normalized
    }
  }

  private sanitizeExternalLinks(
    payload: ProjectArchivePayloadV1,
    boundCredentialCount: number,
  ): ProjectArchiveWarning[] {
    let crushLinks = 0
    for (const character of payload.characters) {
      if (character.crush_slug !== null) crushLinks += 1
      character.crush_slug = null
    }
    let fragmentLinks = 0
    let localUris = 0
    let plaintextCredentials = 0
    let credentialReferences = 0
    const sanitizeConfig = (value: JsonValue): JsonValue => {
      try {
        const sanitized = sanitizePortableConfiguration(value)
        plaintextCredentials += sanitized.removedPlaintextCredentials
        credentialReferences += sanitized.removedCredentialReferences
        localUris += sanitized.removedLocalPaths
        return sanitized.value
      } catch {
        throw portabilityError('PROJECT_EXPORT_FAILED')
      }
    }
    for (const config of payload.project_configs) {
      config.settings_json = sanitizeConfig(config.settings_json)
    }
    for (const skill of payload.project_skills) {
      skill.config = sanitizeConfig(skill.config)
    }
    this.normalizeLlmEndpoints(payload, 'export')
    for (const material of payload.source_materials) {
      if (material.fragment_id !== null) fragmentLinks += 1
      material.fragment_id = null
      if (typeof material.uri === 'string') {
        const portableUri = portableSourceUri(material.uri)
        if (portableUri !== material.uri) localUris += 1
        material.uri = portableUri
      }
    }
    for (const version of payload.chapter_versions) version.task_id = null
    const warnings: ProjectArchiveWarning[] = []
    if (crushLinks > 0) warnings.push({
      code: 'legacy-crush-links-removed',
      count: crushLinks,
      message: projectArchiveWarningMessage('legacy-crush-links-removed', crushLinks),
    })
    if (fragmentLinks > 0) warnings.push({
      code: 'legacy-fragment-links-removed',
      count: fragmentLinks,
      message: projectArchiveWarningMessage('legacy-fragment-links-removed', fragmentLinks),
    })
    if (localUris > 0) warnings.push({
      code: 'local-source-path-omitted',
      count: localUris,
      message: projectArchiveWarningMessage('local-source-path-omitted', localUris),
    })
    const credentialStateCount =
      boundCredentialCount + plaintextCredentials + credentialReferences
    warnings.push({
      code: 'credentials-excluded',
      count: credentialStateCount,
      message: projectArchiveWarningMessage('credentials-excluded', credentialStateCount),
    })
    return warnings
  }

  private validateReferences(payload: ProjectArchivePayloadV1): void {
    if (payload.projects.length !== 1 || payload.project_configs.length !== 1) {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    for (const value of [
      payload.project_configs[0].settings_json,
      ...payload.project_skills.map((skill) => skill.config),
    ]) {
      try {
        if (inspectPortableConfiguration(value).safe) continue
      } catch {
        // All configuration walker failures map to the stable import contract below.
      }
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    this.normalizeLlmEndpoints(payload, 'import')
    const ids = new Map<ProjectArchiveCollection, Set<string>>()
    for (const table of Object.keys(ARCHIVE_TABLES) as ProjectArchiveCollection[]) {
      if (table === 'project_skills') continue
      const rows = payload[table] as ProjectArchiveRecord[]
      const set = new Set<string>()
      for (const row of rows) {
        const idColumn = table === 'project_configs' ? 'project_id' : 'id'
        const id = stringField(row, idColumn)
        if (set.has(id)) throw portabilityError('PROJECT_IMPORT_CONFLICT')
        set.add(id)
      }
      ids.set(table, set)
    }
    const requireUnique = (
      rows: readonly ProjectArchiveRecord[],
      keyFor: (row: ProjectArchiveRecord) => string,
    ): void => {
      const seen = new Set<string>()
      for (const row of rows) {
        const key = keyFor(row)
        if (seen.has(key)) throw portabilityError('PROJECT_IMPORT_CONFLICT')
        seen.add(key)
      }
    }
    const numberField = (row: ProjectArchiveRecord, field: string): number => {
      const value = row[field]
      if (typeof value !== 'number') throw portabilityError('PROJECT_IMPORT_INVALID')
      return value
    }
    requireUnique(
      payload.project_skills as unknown as ProjectArchiveRecord[],
      (row) => stringField(row, 'skillName'),
    )
    requireUnique(payload.llm_configs, (row) => stringField(row, 'name'))
    requireUnique(payload.volumes, (row) => String(numberField(row, 'volume_number')))
    requireUnique(payload.volume_outlines, (row) => stringField(row, 'volume_id'))
    requireUnique(
      payload.chapter_outlines,
      (row) => String(numberField(row, 'chapter_number')),
    )
    requireUnique(
      payload.chapter_outlines,
      (row) => `${stringField(row, 'volume_id')}:${numberField(row, 'sort_order')}`,
    )
    requireUnique(payload.chapters, (row) => String(numberField(row, 'chapter_number')))
    requireUnique(
      payload.chapter_revisions,
      (row) => `${stringField(row, 'chapter_id')}:${numberField(row, 'revision_number')}`,
    )
    requireUnique(
      payload.chapter_versions,
      (row) => `${stringField(row, 'chapter_id')}:${numberField(row, 'version_number')}`,
    )
    for (const rows of [payload.chapter_revisions, payload.chapter_versions]) {
      requireUnique(
        rows.filter((row) => row.is_current === true),
        (row) => stringField(row, 'chapter_id'),
      )
    }
    const assertAcyclic = (
      rows: readonly ProjectArchiveRecord[],
      parentColumn: string,
    ): void => {
      const parents = new Map(
        rows.map((row) => [
          stringField(row, 'id'),
          nullableStringField(row, parentColumn),
        ]),
      )
      for (const start of parents.keys()) {
        const path = new Set<string>()
        let current: string | null = start
        while (current !== null) {
          if (path.has(current)) throw portabilityError('PROJECT_IMPORT_INVALID')
          path.add(current)
          current = parents.get(current) ?? null
        }
      }
    }
    assertAcyclic(payload.arcs, 'parent_arc_id')
    assertAcyclic(payload.chapter_revisions, 'parent_revision_id')
    assertAcyclic(payload.roadmap_items, 'parent_item_id')
    const requireRef = (
      table: ProjectArchiveCollection,
      row: ProjectArchiveRecord,
      column: string,
      target: ProjectArchiveCollection,
      optional = false,
    ): void => {
      const value = optional ? nullableStringField(row, column) : stringField(row, column)
      if (value !== null && !ids.get(target)?.has(value)) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
    }
    const projectId = stringField(payload.projects[0], 'id')
    for (const table of PROJECT_SCOPED_TABLES) {
      if (table === 'projects') continue
      for (const row of payload[table]) {
        if (stringField(row, 'project_id') !== projectId) {
          throw portabilityError('PROJECT_IMPORT_INVALID')
        }
      }
    }
    requireRef('project_configs', payload.project_configs[0], 'default_llm_config_id', 'llm_configs', true)
    for (const row of payload.source_materials) {
      if (!isCanonicalPortableSourceUri(row.uri)) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
      requireRef('source_materials', row, 'character_id', 'characters', true)
    }
    for (const row of payload.arcs) requireRef('arcs', row, 'parent_arc_id', 'arcs', true)
    for (const row of payload.volumes) void row
    for (const row of payload.volume_outlines) {
      requireRef('volume_outlines', row, 'volume_id', 'volumes')
      this.validateSourceIds(row, payload)
    }
    for (const row of payload.chapter_outlines) {
      requireRef('chapter_outlines', row, 'volume_id', 'volumes')
      this.validateSourceIds(row, payload)
    }
    for (const row of payload.chapters) requireRef('chapters', row, 'arc_id', 'arcs', true)
    for (const row of payload.chapter_revisions) {
      requireRef('chapter_revisions', row, 'chapter_id', 'chapters')
      requireRef('chapter_revisions', row, 'parent_revision_id', 'chapter_revisions', true)
      const parentId = nullableStringField(row, 'parent_revision_id')
      const parent = parentId === null
        ? undefined
        : payload.chapter_revisions.find((candidate) => candidate.id === parentId)
      if (parent && parent.chapter_id !== row.chapter_id) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
    }
    for (const row of payload.chapter_versions) {
      requireRef('chapter_versions', row, 'chapter_id', 'chapters')
      if (row.task_id !== null) throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    for (const row of payload.foreshadows) {
      requireRef('foreshadows', row, 'planned_payoff_chapter_id', 'chapters', true)
      requireRef('foreshadows', row, 'actual_payoff_chapter_id', 'chapters', true)
    }
    for (const row of payload.foreshadow_events) {
      requireRef('foreshadow_events', row, 'foreshadow_id', 'foreshadows')
      requireRef('foreshadow_events', row, 'chapter_id', 'chapters', true)
    }
    for (const table of ['narrative_memories', 'narrative_memory_proposals'] as const) {
      for (const row of payload[table]) {
        requireRef(table, row, 'source_chapter_id', 'chapters', true)
        requireRef(table, row, 'source_version_id', 'chapter_versions', true)
        const chapterId = nullableStringField(row, 'source_chapter_id')
        const versionId = nullableStringField(row, 'source_version_id')
        const version = versionId === null
          ? undefined
          : payload.chapter_versions.find((candidate) => candidate.id === versionId)
        if (chapterId !== null && version && version.chapter_id !== chapterId) {
          throw portabilityError('PROJECT_IMPORT_INVALID')
        }
      }
    }
    for (const row of payload.roadmap_items) {
      requireRef('roadmap_items', row, 'parent_item_id', 'roadmap_items', true)
    }
    for (const relation of payload.relations) {
      const sourceType = stringField(relation, 'source_entity_type')
      const targetType = stringField(relation, 'target_entity_type')
      const targetTable = (type: string): ProjectArchiveCollection => {
        if (type === 'character') return 'characters'
        if (type === 'organization') return 'organizations'
        if (type === 'worldview') return 'worldview_entries'
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
      requireRef('relations', relation, 'source_entity_id', targetTable(sourceType))
      requireRef('relations', relation, 'target_entity_id', targetTable(targetType))
      if (
        sourceType === targetType
        && relation.source_entity_id === relation.target_entity_id
      ) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
      const sourceCharacterId = nullableStringField(relation, 'source_character_id')
      const targetCharacterId = nullableStringField(relation, 'target_character_id')
      if (
        sourceCharacterId !== (sourceType === 'character' ? relation.source_entity_id : null)
        || targetCharacterId !== (targetType === 'character' ? relation.target_entity_id : null)
      ) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
    }
  }

  private validateSourceIds(
    row: ProjectArchiveRecord,
    payload: ProjectArchivePayloadV1,
  ): void {
    const value = row.source_material_ids_json
    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    const known = new Set(payload.source_materials.map((item) => stringField(item, 'id')))
    if (value.some((id) => !known.has(id))) throw portabilityError('PROJECT_IMPORT_INVALID')
  }

  private remapPayload(payload: ProjectArchivePayloadV1): ProjectArchivePayloadV1 {
    const result = JSON.parse(JSON.stringify(payload)) as ProjectArchivePayloadV1
    const maps = new Map<ProjectArchiveCollection, Map<string, string>>()
    for (const table of Object.keys(ARCHIVE_TABLES) as ProjectArchiveCollection[]) {
      if (table === 'project_configs' || table === 'project_skills') continue
      const map = new Map<string, string>()
      for (const row of result[table] as ProjectArchiveRecord[]) {
        const oldId = stringField(row, 'id')
        const newId = randomUUID()
        map.set(oldId, newId)
        row.id = newId
      }
      maps.set(table, map)
    }
    const remap = (table: ProjectArchiveCollection, value: JsonValue): JsonValue => {
      if (value === null) return null
      if (typeof value !== 'string') throw portabilityError('PROJECT_IMPORT_INVALID')
      const mapped = maps.get(table)?.get(value)
      if (!mapped) throw portabilityError('PROJECT_IMPORT_INVALID')
      return mapped
    }
    const oldProjectId = stringField(payload.projects[0], 'id')
    const newProjectId = remap('projects', oldProjectId)
    const project = result.projects[0]
    project.slug = this.uniqueSlug(stringField(payload.projects[0], 'slug'))
    result.project_configs[0].project_id = newProjectId
    for (const table of PROJECT_SCOPED_TABLES) {
      if (table === 'projects' || table === 'project_configs') continue
      for (const row of result[table]) row.project_id = newProjectId
    }
    const optional = (
      rows: ProjectArchiveRecord[],
      column: string,
      target: ProjectArchiveCollection,
    ): void => {
      for (const row of rows) row[column] = remap(target, row[column])
    }
    optional(result.project_configs, 'default_llm_config_id', 'llm_configs')
    optional(result.source_materials, 'character_id', 'characters')
    for (const row of result.source_materials) {
      row.fragment_id = null
      if (!isCanonicalPortableSourceUri(row.uri)) {
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
    }
    for (const row of result.characters) row.crush_slug = null
    optional(result.arcs, 'parent_arc_id', 'arcs')
    optional(result.volume_outlines, 'volume_id', 'volumes')
    optional(result.chapter_outlines, 'volume_id', 'volumes')
    for (const rows of [result.volume_outlines, result.chapter_outlines]) {
      for (const row of rows) {
        const ids = row.source_material_ids_json
        if (!Array.isArray(ids)) throw portabilityError('PROJECT_IMPORT_INVALID')
        row.source_material_ids_json = ids.map((id) => remap('source_materials', id))
      }
    }
    optional(result.chapters, 'arc_id', 'arcs')
    optional(result.chapter_revisions, 'chapter_id', 'chapters')
    optional(result.chapter_revisions, 'parent_revision_id', 'chapter_revisions')
    optional(result.chapter_versions, 'chapter_id', 'chapters')
    for (const row of result.chapter_versions) row.task_id = null
    for (const row of result.relations) {
      const tableFor = (type: JsonValue): ProjectArchiveCollection => {
        if (type === 'character') return 'characters'
        if (type === 'organization') return 'organizations'
        if (type === 'worldview') return 'worldview_entries'
        throw portabilityError('PROJECT_IMPORT_INVALID')
      }
      row.source_entity_id = remap(tableFor(row.source_entity_type), row.source_entity_id)
      row.target_entity_id = remap(tableFor(row.target_entity_type), row.target_entity_id)
      row.source_character_id = row.source_entity_type === 'character'
        ? row.source_entity_id
        : null
      row.target_character_id = row.target_entity_type === 'character'
        ? row.target_entity_id
        : null
    }
    optional(result.foreshadows, 'planned_payoff_chapter_id', 'chapters')
    optional(result.foreshadows, 'actual_payoff_chapter_id', 'chapters')
    optional(result.foreshadow_events, 'foreshadow_id', 'foreshadows')
    optional(result.foreshadow_events, 'chapter_id', 'chapters')
    for (const table of ['narrative_memories', 'narrative_memory_proposals'] as const) {
      optional(result[table], 'source_chapter_id', 'chapters')
      optional(result[table], 'source_version_id', 'chapter_versions')
    }
    optional(result.roadmap_items, 'parent_item_id', 'roadmap_items')
    return result
  }

  private uniqueSlug(source: string): string {
    const base = normalizeSlug(source)
    for (let suffix = 1; suffix < 100_000; suffix += 1) {
      const candidate = suffix === 1 ? `${base}-imported` : `${base}-imported-${suffix}`
      const exists = this.database
        .prepare<{ found: number }>('SELECT 1 AS found FROM projects WHERE slug = ?')
        .get(candidate)
      if (!exists) return candidate
    }
    throw portabilityError('PROJECT_IMPORT_CONFLICT')
  }

  private insertCollection(
    table: Exclude<ProjectArchiveCollection, 'project_skills'>,
    rows: ProjectArchiveRecord[],
  ): void {
    const columns = Object.keys(ARCHIVE_TABLES[table])
    const statement = this.database.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    for (const row of rows) {
      statement.run(...columns.map((column) => databaseValue(column, row[column])))
    }
  }

  private insertSelfReferential(
    table: 'arcs' | 'chapter_revisions' | 'roadmap_items',
    rows: ProjectArchiveRecord[],
    idColumn: string,
    parentColumn: string,
  ): void {
    const pending = [...rows]
    const inserted = new Set<string>()
    while (pending.length > 0) {
      const ready = pending.filter((row) => {
        const parent = nullableStringField(row, parentColumn)
        return parent === null || inserted.has(parent)
      })
      if (ready.length === 0) throw portabilityError('PROJECT_IMPORT_INVALID')
      this.insertCollection(table, ready)
      for (const row of ready) inserted.add(stringField(row, idColumn))
      const readyIds = new Set(ready.map((row) => stringField(row, idColumn)))
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        if (readyIds.has(stringField(pending[index], idColumn))) pending.splice(index, 1)
      }
    }
  }

  private insertProjectSkills(
    payload: ProjectArchivePayloadV1,
    missingSkills: string[],
  ): void {
    const projectId = stringField(payload.projects[0], 'id')
    const insert = this.database.prepare(
      `INSERT INTO project_skills (
        project_id, skill_id, enabled, config_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    const timestamp = new Date().toISOString()
    for (const binding of payload.project_skills) {
      const name = binding.skillName
      const skill = this.database
        .prepare<{ id: string }>('SELECT id FROM skills WHERE name = ?')
        .get(name)
      if (!skill) {
        missingSkills.push(name)
        continue
      }
      insert.run(
        projectId,
        skill.id,
        binding.enabled ? 1 : 0,
        JSON.stringify(binding.config),
        timestamp,
        timestamp,
      )
    }
  }

  private verifyImported(payload: ProjectArchivePayloadV1, missingSkillCount: number): void {
    const projectId = stringField(payload.projects[0], 'id')
    for (const table of PROJECT_SCOPED_TABLES) {
      const expected = payload[table].length
      const column = table === 'projects' ? 'id' : 'project_id'
      const actual = this.database
        .prepare<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`)
        .get(projectId)?.count
      if (actual !== expected) throw portabilityError('PROJECT_IMPORT_FAILED')
    }
    const skillCount = this.database
      .prepare<{ count: number }>('SELECT COUNT(*) AS count FROM project_skills WHERE project_id = ?')
      .get(projectId)?.count
    if (skillCount !== payload.project_skills.length - missingSkillCount) {
      throw portabilityError('PROJECT_IMPORT_FAILED')
    }
    const childQueries: Record<
      'chapter_revisions' | 'chapter_versions' | 'foreshadow_events',
      string
    > = {
      chapter_revisions: `SELECT COUNT(*) AS count
        FROM chapter_revisions child
        JOIN chapters parent ON parent.id = child.chapter_id
        WHERE parent.project_id = ?`,
      chapter_versions: `SELECT COUNT(*) AS count
        FROM chapter_versions child
        JOIN chapters parent ON parent.id = child.chapter_id
        WHERE parent.project_id = ?`,
      foreshadow_events: `SELECT COUNT(*) AS count
        FROM foreshadow_events child
        JOIN foreshadows parent ON parent.id = child.foreshadow_id
        WHERE parent.project_id = ?`,
    }
    for (const table of Object.keys(childQueries) as (keyof typeof childQueries)[]) {
      const actual = this.database
        .prepare<{ count: number }>(childQueries[table])
        .get(projectId)?.count
      if (actual !== payload[table].length) throw portabilityError('PROJECT_IMPORT_FAILED')
    }
    const foreignKeys = this.database.pragma('foreign_key_check') as unknown
    if (Array.isArray(foreignKeys) && foreignKeys.length > 0) {
      throw portabilityError('PROJECT_IMPORT_FAILED')
    }
  }
}
