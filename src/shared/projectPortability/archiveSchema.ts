import type { TSchema } from 'typebox'
import {
  PROJECT_ARCHIVE_FORMAT,
  PROJECT_ARCHIVE_VERSION,
  type ProjectArchiveCollection,
  type ProjectArchiveV1,
} from './types'
import { portabilityError } from './errors'

type ColumnKind =
  | 'id'
  | 'string'
  | 'longString'
  | 'nullableString'
  | 'number'
  | 'integer'
  | 'nullableNumber'
  | 'boolean'
  | 'json'
  | 'stringArray'

export type ArchiveTableDefinition = Readonly<Record<string, ColumnKind>>

export const ARCHIVE_TABLES: Record<ProjectArchiveCollection, ArchiveTableDefinition> = {
  projects: {
    id: 'id', slug: 'string', name: 'string', description: 'longString', status: 'string',
    version: 'integer', created_at: 'string', updated_at: 'string',
  },
  project_configs: {
    project_id: 'id', default_llm_config_id: 'nullableString', genre: 'string', tone: 'string',
    target_words: 'nullableNumber', context_budget: 'nullableNumber', settings_json: 'json',
    version: 'integer', created_at: 'string', updated_at: 'string',
  },
  llm_configs: {
    id: 'id', project_id: 'id', name: 'string', provider: 'string', base_url: 'string',
    model: 'string', context_budget: 'nullableNumber', max_output_tokens: 'nullableNumber',
    temperature: 'nullableNumber', streaming_enabled: 'boolean', is_default: 'boolean',
    created_at: 'string', updated_at: 'string',
  },
  characters: {
    id: 'id', project_id: 'id', name: 'string', role: 'string', crush_slug: 'nullableString',
    profile_json: 'json', notes: 'longString', sort_order: 'integer', version: 'integer',
    created_at: 'string', updated_at: 'string',
  },
  worldview_entries: {
    id: 'id', project_id: 'id', category: 'string', title: 'string', content: 'longString',
    metadata_json: 'json', sort_order: 'integer', version: 'integer',
    created_at: 'string', updated_at: 'string',
  },
  organizations: {
    id: 'id', project_id: 'id', name: 'string', description: 'longString', metadata_json: 'json',
    sort_order: 'integer', version: 'integer', created_at: 'string', updated_at: 'string',
  },
  relations: {
    id: 'id', project_id: 'id', source_character_id: 'nullableString',
    target_character_id: 'nullableString', relation_type: 'string', description: 'longString',
    strength: 'nullableNumber', metadata_json: 'json', source_entity_type: 'string',
    source_entity_id: 'id', target_entity_type: 'string', target_entity_id: 'id',
    version: 'integer', created_at: 'string', updated_at: 'string',
  },
  source_materials: {
    id: 'id', project_id: 'id', title: 'string', material_type: 'string',
    uri: 'nullableString', content: 'longString', metadata_json: 'json',
    character_id: 'nullableString', fragment_id: 'nullableString', version: 'integer',
    created_at: 'string', updated_at: 'string',
  },
  arcs: {
    id: 'id', project_id: 'id', parent_arc_id: 'nullableString', name: 'string',
    synopsis: 'longString', status: 'string', sort_order: 'integer', metadata_json: 'json',
    created_at: 'string', updated_at: 'string',
  },
  volumes: {
    id: 'id', project_id: 'id', volume_number: 'integer', title: 'string',
    synopsis: 'longString', status: 'string', sort_order: 'integer',
    target_words: 'nullableNumber', version: 'integer', created_at: 'string', updated_at: 'string',
  },
  volume_outlines: {
    id: 'id', project_id: 'id', volume_id: 'id', status: 'string', summary: 'longString',
    theme: 'longString', main_conflict: 'longString', key_turning_points_json: 'stringArray',
    ending: 'longString', outline_json: 'json', source_material_ids_json: 'stringArray',
    metadata_json: 'json', version: 'integer', created_at: 'string', updated_at: 'string',
  },
  chapter_outlines: {
    id: 'id', project_id: 'id', volume_id: 'id', chapter_number: 'integer',
    sort_order: 'integer', title: 'string', summary: 'longString', purpose: 'longString',
    opening: 'longString', conflict: 'longString', key_events_json: 'stringArray',
    ending: 'longString', ending_hook: 'longString', status: 'string', outline_json: 'json',
    source_material_ids_json: 'stringArray', metadata_json: 'json', version: 'integer',
    created_at: 'string', updated_at: 'string',
  },
  chapters: {
    id: 'id', project_id: 'id', arc_id: 'nullableString', chapter_number: 'integer',
    title: 'string', status: 'string', synopsis: 'longString', content: 'longString',
    target_words: 'nullableNumber', actual_words: 'nullableNumber', version: 'integer',
    created_at: 'string', updated_at: 'string',
  },
  chapter_revisions: {
    id: 'id', chapter_id: 'id', revision_number: 'integer', content: 'longString',
    summary: 'longString', reason: 'longString', is_current: 'boolean',
    created_at: 'string', parent_revision_id: 'nullableString', operation: 'string',
    blocks_json: 'json',
  },
  chapter_versions: {
    id: 'id', chapter_id: 'id', task_id: 'nullableString', version_number: 'integer',
    content: 'longString', summary: 'longString', fact_check_json: 'json', status: 'string',
    is_current: 'boolean', created_at: 'string', reviewed_at: 'nullableString',
    confirmed_at: 'nullableString',
  },
  foreshadows: {
    id: 'id', project_id: 'id', title: 'string', description: 'longString', status: 'string',
    planned_payoff_chapter_id: 'nullableString', actual_payoff_chapter_id: 'nullableString',
    importance: 'integer', metadata_json: 'json', created_at: 'string', updated_at: 'string',
  },
  foreshadow_events: {
    id: 'id', foreshadow_id: 'id', chapter_id: 'nullableString', event_type: 'string',
    note: 'longString', created_at: 'string',
  },
  narrative_memories: {
    id: 'id', project_id: 'id', memory_type: 'string', title: 'string', content: 'longString',
    source_chapter_id: 'nullableString', importance: 'integer', metadata_json: 'json',
    created_at: 'string', updated_at: 'string', status: 'string',
    source_version_id: 'nullableString', evidence_json: 'stringArray',
  },
  narrative_memory_proposals: {
    id: 'id', project_id: 'id', source_chapter_id: 'nullableString',
    source_version_id: 'nullableString', memory_type: 'string', title: 'string',
    content: 'longString', confidence: 'number', evidence_json: 'stringArray', status: 'string',
    metadata_json: 'json', created_at: 'string', updated_at: 'string',
  },
  roadmap_items: {
    id: 'id', project_id: 'id', parent_item_id: 'nullableString', title: 'string',
    description: 'longString', item_type: 'string', status: 'string', priority: 'integer',
    sort_order: 'integer', metadata_json: 'json', created_at: 'string', updated_at: 'string',
  },
  project_skills: {
    skillName: 'string', enabled: 'boolean', config: 'json',
  },
}

type TypeBoxRuntime = typeof import('typebox')
type ValueRuntime = typeof import('typebox/value')
type DynamicImporter = (specifier: string) => Promise<unknown>

const dynamicImport = new Function('specifier', 'return import(specifier)') as DynamicImporter

let schemaPromise: Promise<TSchema> | undefined
let valueRuntimePromise: Promise<ValueRuntime> | undefined

function jsonSchema(Type: TypeBoxRuntime['Type'], depth: number): TSchema {
  const primitives = [
    Type.Null(),
    Type.Boolean(),
    Type.Number({ minimum: -1e15, maximum: 1e15 }),
    Type.String({ maxLength: 2_000_000 }),
  ]
  if (depth === 0) return Type.Union(primitives)
  const child = jsonSchema(Type, depth - 1)
  return Type.Union([
    ...primitives,
    Type.Array(child, { maxItems: 10_000 }),
    Type.Record(
      Type.String({ minLength: 1, maxLength: 128 }),
      child,
      { maxProperties: 2_000 },
    ),
  ])
}

function buildArchiveSchema(runtime: TypeBoxRuntime): TSchema {
  const { Type } = runtime
  const json = jsonSchema(Type, 6)
  const schemaForKind = (kind: ColumnKind): TSchema => {
    switch (kind) {
      case 'id': return Type.String({ minLength: 1, maxLength: 256 })
      case 'string': return Type.String({ maxLength: 8_192 })
      case 'longString': return Type.String({ maxLength: 2_000_000 })
      case 'nullableString':
        return Type.Union([Type.Null(), Type.String({ maxLength: 16_384 })])
      case 'number': return Type.Number({ minimum: -1e15, maximum: 1e15 })
      case 'integer': return Type.Integer({ minimum: -2_147_483_648, maximum: 2_147_483_647 })
      case 'nullableNumber':
        return Type.Union([Type.Null(), Type.Number({ minimum: -1e15, maximum: 1e15 })])
      case 'boolean': return Type.Boolean()
      case 'json': return json
      case 'stringArray':
        return Type.Array(Type.String({ maxLength: 256 }), { maxItems: 20_000, uniqueItems: true })
    }
  }
  const payloadProperties = Object.fromEntries(
    Object.entries(ARCHIVE_TABLES).map(([table, columns]) => [
      table,
      Type.Array(
        Type.Object(
          Object.fromEntries(
            Object.entries(columns).map(([column, kind]) => [column, schemaForKind(kind)]),
          ),
          { additionalProperties: false },
        ),
        { maxItems: 100_000 },
      ),
    ]),
  )
  const warning = Type.Object({
    code: Type.Union([
      Type.Literal('legacy-crush-links-removed'),
      Type.Literal('legacy-fragment-links-removed'),
      Type.Literal('local-source-path-omitted'),
      Type.Literal('credentials-excluded'),
      Type.Literal('runtime-history-excluded'),
    ]),
    count: Type.Integer({ minimum: 0, maximum: 1_000_000 }),
    message: Type.String({ maxLength: 512 }),
  }, { additionalProperties: false })
  return Type.Object({
    manifest: Type.Object({
      format: Type.Literal(PROJECT_ARCHIVE_FORMAT),
      formatVersion: Type.Literal(PROJECT_ARCHIVE_VERSION),
      exportedAt: Type.String({ minLength: 1, maxLength: 64 }),
      appVersion: Type.String({ minLength: 1, maxLength: 128 }),
      databaseSchemaVersion: Type.Integer({ minimum: 1, maximum: 1_000_000 }),
      sourceProjectId: Type.String({ minLength: 1, maxLength: 256 }),
      projectName: Type.String({ minLength: 1, maxLength: 8_192 }),
      payloadSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
      exclusions: Type.Array(Type.String({ minLength: 1, maxLength: 256 }), {
        maxItems: 100,
        uniqueItems: true,
      }),
      warnings: Type.Array(warning, { maxItems: 100 }),
    }, { additionalProperties: false }),
    payload: Type.Object(payloadProperties, { additionalProperties: false }),
  }, { additionalProperties: false })
}

async function getSchema(): Promise<TSchema> {
  schemaPromise ??= dynamicImport('typebox').then((value) => buildArchiveSchema(value as TypeBoxRuntime))
  return schemaPromise
}

async function getValueRuntime(): Promise<ValueRuntime> {
  valueRuntimePromise ??= dynamicImport('typebox/value').then((value) => value as ValueRuntime)
  return valueRuntimePromise
}

function readFormatVersion(value: unknown): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const manifest = Reflect.get(value, 'manifest')
  if (typeof manifest !== 'object' || manifest === null) return undefined
  const version = Reflect.get(manifest, 'formatVersion')
  return typeof version === 'number' ? version : undefined
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

function isBoundedJson(value: unknown, depth = 0): boolean {
  if (depth > 6) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e15
  if (typeof value === 'string') return value.length <= 2_000_000
  if (Array.isArray(value)) {
    return value.length <= 10_000 && value.every((item) => isBoundedJson(item, depth + 1))
  }
  if (!isPlainRecord(value)) return false
  const keys = Object.keys(value)
  return keys.length <= 2_000
    && keys.every((key) => key.length >= 1 && key.length <= 128)
    && Object.values(value).every((item) => isBoundedJson(item, depth + 1))
}

function checkColumn(kind: ColumnKind, value: unknown): boolean {
  switch (kind) {
    case 'id': return typeof value === 'string' && value.length >= 1 && value.length <= 256
    case 'string': return typeof value === 'string' && value.length <= 8_192
    case 'longString': return typeof value === 'string' && value.length <= 2_000_000
    case 'nullableString':
      return value === null || (typeof value === 'string' && value.length <= 16_384)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15
    case 'integer':
      return Number.isInteger(value)
        && typeof value === 'number'
        && value >= -2_147_483_648
        && value <= 2_147_483_647
    case 'nullableNumber':
      return value === null
        || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15)
    case 'boolean': return typeof value === 'boolean'
    case 'json': return isBoundedJson(value)
    case 'stringArray':
      return Array.isArray(value)
        && value.length <= 20_000
        && value.every((item) => typeof item === 'string' && item.length <= 256)
        && new Set(value).size === value.length
  }
}

function manuallyCheckArchive(value: unknown): value is ProjectArchiveV1 {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['manifest', 'payload'])) return false
  const manifest = value.manifest
  const payload = value.payload
  const manifestKeys = [
    'format',
    'formatVersion',
    'exportedAt',
    'appVersion',
    'databaseSchemaVersion',
    'sourceProjectId',
    'projectName',
    'payloadSha256',
    'exclusions',
    'warnings',
  ]
  if (!isPlainRecord(manifest) || !hasExactKeys(manifest, manifestKeys)) return false
  if (
    manifest.format !== PROJECT_ARCHIVE_FORMAT
    || manifest.formatVersion !== PROJECT_ARCHIVE_VERSION
    || typeof manifest.exportedAt !== 'string'
    || manifest.exportedAt.length < 1
    || manifest.exportedAt.length > 64
    || typeof manifest.appVersion !== 'string'
    || manifest.appVersion.length < 1
    || manifest.appVersion.length > 128
    || !Number.isInteger(manifest.databaseSchemaVersion)
    || typeof manifest.databaseSchemaVersion !== 'number'
    || manifest.databaseSchemaVersion < 1
    || typeof manifest.sourceProjectId !== 'string'
    || manifest.sourceProjectId.length < 1
    || manifest.sourceProjectId.length > 256
    || typeof manifest.projectName !== 'string'
    || manifest.projectName.length < 1
    || manifest.projectName.length > 8_192
    || typeof manifest.payloadSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(manifest.payloadSha256)
    || !Array.isArray(manifest.exclusions)
    || manifest.exclusions.length > 100
    || !manifest.exclusions.every((item) => typeof item === 'string' && item.length >= 1 && item.length <= 256)
    || new Set(manifest.exclusions).size !== manifest.exclusions.length
    || !Array.isArray(manifest.warnings)
    || manifest.warnings.length > 100
  ) return false
  const warningCodes = new Set([
    'legacy-crush-links-removed',
    'legacy-fragment-links-removed',
    'local-source-path-omitted',
    'credentials-excluded',
    'runtime-history-excluded',
  ])
  if (!manifest.warnings.every((warning) =>
    isPlainRecord(warning)
    && hasExactKeys(warning, ['code', 'count', 'message'])
    && typeof warning.code === 'string'
    && warningCodes.has(warning.code)
    && Number.isInteger(warning.count)
    && typeof warning.count === 'number'
    && warning.count >= 0
    && warning.count <= 1_000_000
    && typeof warning.message === 'string'
    && warning.message.length <= 512,
  )) return false

  const tableNames = Object.keys(ARCHIVE_TABLES)
  if (!isPlainRecord(payload) || !hasExactKeys(payload, tableNames)) return false
  let totalRecords = 0
  for (const table of tableNames as ProjectArchiveCollection[]) {
    const rows = payload[table]
    if (!Array.isArray(rows) || rows.length > 100_000) return false
    totalRecords += rows.length
    if (totalRecords > 300_000) return false
    const definition = ARCHIVE_TABLES[table]
    const columns = Object.keys(definition)
    for (const row of rows) {
      if (!isPlainRecord(row) || !hasExactKeys(row, columns)) return false
      if (!columns.every((column) => checkColumn(definition[column], row[column]))) return false
    }
  }
  return true
}

export async function validateProjectArchive(value: unknown): Promise<ProjectArchiveV1> {
  const version = readFormatVersion(value)
  if (version !== undefined && version !== PROJECT_ARCHIVE_VERSION) {
    throw portabilityError('PROJECT_IMPORT_UNSUPPORTED_VERSION')
  }
  if (!manuallyCheckArchive(value)) throw portabilityError('PROJECT_IMPORT_INVALID')
  try {
    const [schema, Value] = await Promise.all([getSchema(), getValueRuntime()])
    if (!Value.Check(schema, value)) throw portabilityError('PROJECT_IMPORT_INVALID')
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null
      ? Reflect.get(error, 'code')
      : undefined
    if (code !== 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG') throw error
  }
  return value
}
