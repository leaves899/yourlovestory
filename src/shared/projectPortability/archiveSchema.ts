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
  | 'nonEmptyString'
  | 'longString'
  | 'nullableString'
  | 'number'
  | 'integer'
  | 'nullableNumber'
  | 'positiveInteger'
  | 'nonNegativeInteger'
  | 'nullablePositiveInteger'
  | 'unitNumber'
  | 'boolean'
  | 'json'
  | 'stringArray'
  | 'date'
  | 'nullableDate'
  | 'nullableTemperature'
  | 'projectStatus'
  | 'relationEntityType'
  | 'volumeStatus'
  | 'outlineStatus'
  | 'chapterStatus'
  | 'revisionOperation'
  | 'versionStatus'
  | 'foreshadowStatus'
  | 'foreshadowEventType'
  | 'memoryType'
  | 'memoryStatus'
  | 'proposalStatus'

export type ArchiveTableDefinition = Readonly<Record<string, ColumnKind>>
const SAFE_NUMERIC_MAX = 1e15

export const ARCHIVE_TABLES: Record<ProjectArchiveCollection, ArchiveTableDefinition> = {
  projects: {
    id: 'id', slug: 'nonEmptyString', name: 'nonEmptyString', description: 'longString',
    status: 'projectStatus', version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  project_configs: {
    project_id: 'id', default_llm_config_id: 'nullableString', genre: 'string', tone: 'string',
    target_words: 'nullableNumber', context_budget: 'nullableNumber',
    settings_json: 'json', version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  llm_configs: {
    id: 'id', project_id: 'id', name: 'string', provider: 'string', base_url: 'string',
    model: 'nonEmptyString', context_budget: 'nullablePositiveInteger',
    max_output_tokens: 'nullablePositiveInteger', temperature: 'nullableTemperature',
    streaming_enabled: 'boolean', is_default: 'boolean', created_at: 'date', updated_at: 'date',
  },
  characters: {
    id: 'id', project_id: 'id', name: 'string', role: 'string', crush_slug: 'nullableString',
    profile_json: 'json', notes: 'longString', sort_order: 'number',
    version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  worldview_entries: {
    id: 'id', project_id: 'id', category: 'string', title: 'string', content: 'longString',
    metadata_json: 'json', sort_order: 'number', version: 'positiveInteger',
    created_at: 'date', updated_at: 'date',
  },
  organizations: {
    id: 'id', project_id: 'id', name: 'string', description: 'longString', metadata_json: 'json',
    sort_order: 'number', version: 'positiveInteger',
    created_at: 'date', updated_at: 'date',
  },
  relations: {
    id: 'id', project_id: 'id', source_character_id: 'nullableString',
    target_character_id: 'nullableString', relation_type: 'string', description: 'longString',
    strength: 'nullableNumber', metadata_json: 'json',
    source_entity_type: 'relationEntityType', source_entity_id: 'id',
    target_entity_type: 'relationEntityType', target_entity_id: 'id',
    version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  source_materials: {
    id: 'id', project_id: 'id', title: 'string', material_type: 'string',
    uri: 'nullableString', content: 'longString', metadata_json: 'json',
    character_id: 'nullableString', fragment_id: 'nullableString', version: 'positiveInteger',
    created_at: 'date', updated_at: 'date',
  },
  arcs: {
    id: 'id', project_id: 'id', parent_arc_id: 'nullableString', name: 'string',
    synopsis: 'longString', status: 'nonEmptyString', sort_order: 'number',
    metadata_json: 'json', created_at: 'date', updated_at: 'date',
  },
  volumes: {
    id: 'id', project_id: 'id', volume_number: 'positiveInteger', title: 'nonEmptyString',
    synopsis: 'longString', status: 'volumeStatus', sort_order: 'nonNegativeInteger',
    target_words: 'nullablePositiveInteger', version: 'positiveInteger',
    created_at: 'date', updated_at: 'date',
  },
  volume_outlines: {
    id: 'id', project_id: 'id', volume_id: 'id', status: 'outlineStatus', summary: 'longString',
    theme: 'longString', main_conflict: 'longString', key_turning_points_json: 'stringArray',
    ending: 'longString', outline_json: 'json', source_material_ids_json: 'stringArray',
    metadata_json: 'json', version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  chapter_outlines: {
    id: 'id', project_id: 'id', volume_id: 'id', chapter_number: 'positiveInteger',
    sort_order: 'nonNegativeInteger', title: 'nonEmptyString', summary: 'longString',
    purpose: 'longString',
    opening: 'longString', conflict: 'longString', key_events_json: 'stringArray',
    ending: 'longString', ending_hook: 'longString', status: 'outlineStatus',
    outline_json: 'json', source_material_ids_json: 'stringArray', metadata_json: 'json',
    version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  chapters: {
    id: 'id', project_id: 'id', arc_id: 'nullableString', chapter_number: 'number',
    title: 'string', status: 'chapterStatus', synopsis: 'longString', content: 'longString',
    target_words: 'nullableNumber', actual_words: 'nullableNumber',
    version: 'positiveInteger', created_at: 'date', updated_at: 'date',
  },
  chapter_revisions: {
    id: 'id', chapter_id: 'id', revision_number: 'positiveInteger', content: 'longString',
    summary: 'longString', reason: 'longString', is_current: 'boolean',
    created_at: 'date', parent_revision_id: 'nullableString', operation: 'revisionOperation',
    blocks_json: 'json',
  },
  chapter_versions: {
    id: 'id', chapter_id: 'id', task_id: 'nullableString', version_number: 'positiveInteger',
    content: 'longString', summary: 'longString', fact_check_json: 'json',
    status: 'versionStatus', is_current: 'boolean', created_at: 'date',
    reviewed_at: 'nullableDate', confirmed_at: 'nullableDate',
  },
  foreshadows: {
    id: 'id', project_id: 'id', title: 'nonEmptyString', description: 'longString',
    status: 'foreshadowStatus',
    planned_payoff_chapter_id: 'nullableString', actual_payoff_chapter_id: 'nullableString',
    importance: 'number', metadata_json: 'json',
    created_at: 'date', updated_at: 'date',
  },
  foreshadow_events: {
    id: 'id', foreshadow_id: 'id', chapter_id: 'nullableString',
    event_type: 'foreshadowEventType', note: 'longString', created_at: 'date',
  },
  narrative_memories: {
    id: 'id', project_id: 'id', memory_type: 'memoryType', title: 'nonEmptyString',
    content: 'longString', source_chapter_id: 'nullableString',
    importance: 'number', metadata_json: 'json', created_at: 'date',
    updated_at: 'date', status: 'memoryStatus',
    source_version_id: 'nullableString', evidence_json: 'stringArray',
  },
  narrative_memory_proposals: {
    id: 'id', project_id: 'id', source_chapter_id: 'nullableString',
    source_version_id: 'nullableString', memory_type: 'memoryType', title: 'nonEmptyString',
    content: 'longString', confidence: 'unitNumber', evidence_json: 'stringArray',
    status: 'proposalStatus', metadata_json: 'json', created_at: 'date', updated_at: 'date',
  },
  roadmap_items: {
    id: 'id', project_id: 'id', parent_item_id: 'nullableString', title: 'string',
    description: 'longString', item_type: 'nonEmptyString', status: 'nonEmptyString',
    priority: 'number', sort_order: 'number', metadata_json: 'json',
    created_at: 'date', updated_at: 'date',
  },
  project_skills: {
    skillName: 'string', enabled: 'boolean', config: 'json',
  },
}

export function isArchiveTimestampColumn(
  table: ProjectArchiveCollection,
  column: string,
): boolean {
  const kind = ARCHIVE_TABLES[table][column]
  return kind === 'date' || kind === 'nullableDate'
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
  const literalUnion = (values: readonly string[]): TSchema =>
    Type.Union(values.map((value) => Type.Literal(value)))
  const date = Type.String({
    minLength: 24,
    maxLength: 24,
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$',
  })
  const schemaForKind = (kind: ColumnKind): TSchema => {
    switch (kind) {
      case 'id': return Type.String({ minLength: 1, maxLength: 256 })
      case 'string': return Type.String({ maxLength: 8_192 })
      case 'nonEmptyString': return Type.String({ minLength: 1, maxLength: 8_192 })
      case 'longString': return Type.String({ maxLength: 2_000_000 })
      case 'nullableString':
        return Type.Union([Type.Null(), Type.String({ maxLength: 16_384 })])
      case 'number': return Type.Number({ minimum: -SAFE_NUMERIC_MAX, maximum: SAFE_NUMERIC_MAX })
      case 'integer':
        return Type.Integer({ minimum: -SAFE_NUMERIC_MAX, maximum: SAFE_NUMERIC_MAX })
      case 'nullableNumber':
        return Type.Union([
          Type.Null(),
          Type.Number({ minimum: -SAFE_NUMERIC_MAX, maximum: SAFE_NUMERIC_MAX }),
        ])
      case 'positiveInteger':
        return Type.Integer({ minimum: 1, maximum: SAFE_NUMERIC_MAX })
      case 'nonNegativeInteger':
        return Type.Integer({ minimum: 0, maximum: SAFE_NUMERIC_MAX })
      case 'nullablePositiveInteger':
        return Type.Union([Type.Null(), Type.Integer({ minimum: 1, maximum: SAFE_NUMERIC_MAX })])
      case 'unitNumber': return Type.Number({ minimum: 0, maximum: 1 })
      case 'nullableTemperature':
        return Type.Union([
          Type.Null(),
          Type.Number({ minimum: 0, maximum: SAFE_NUMERIC_MAX }),
        ])
      case 'boolean': return Type.Boolean()
      case 'json': return json
      case 'stringArray':
        return Type.Array(Type.String({ maxLength: 256 }), { maxItems: 20_000, uniqueItems: true })
      case 'date': return date
      case 'nullableDate': return Type.Union([Type.Null(), date])
      case 'projectStatus': return literalUnion(['active', 'archived'])
      case 'relationEntityType': return literalUnion(['character', 'organization', 'worldview'])
      case 'volumeStatus':
        return literalUnion(['planned', 'drafting', 'active', 'completed', 'archived'])
      case 'outlineStatus': return literalUnion(['draft', 'confirmed', 'locked'])
      case 'chapterStatus': return literalUnion(['planned', 'drafting', 'review', 'completed'])
      case 'revisionOperation':
        return literalUnion(['manual', 'paragraph_revision', 'polish', 'fallback'])
      case 'versionStatus': return literalUnion(['review', 'approved', 'rejected'])
      case 'foreshadowStatus':
        return literalUnion([
          'suggested', 'planned', 'planted', 'active', 'revealed',
          'paid_off', 'resolved', 'abandoned',
        ])
      case 'foreshadowEventType':
        return literalUnion([
          'suggested', 'planned', 'planted', 'activated', 'revealed',
          'paid_off', 'resolved', 'abandoned', 'note',
        ])
      case 'memoryType':
        return literalUnion([
          'fact', 'event', 'relationship', 'character',
          'worldview', 'emotion', 'theme', 'custom',
        ])
      case 'memoryStatus': return literalUnion(['proposed', 'approved', 'rejected', 'archived'])
      case 'proposalStatus': return literalUnion(['proposed', 'approved', 'rejected'])
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
      exportedAt: date,
      appVersion: Type.String({ minLength: 1, maxLength: 128 }),
      databaseSchemaVersion: Type.Integer({ minimum: 1, maximum: 1_000_000 }),
      sourceProjectId: Type.String({ minLength: 1, maxLength: 256 }),
      projectName: Type.String({ minLength: 1, maxLength: 8_192 }),
      integritySha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
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

function isValidArchiveDate(value: unknown): value is string {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value
}

function checkColumn(kind: ColumnKind, value: unknown): boolean {
  const isIntegerBetween = (minimum: number, maximum: number): boolean =>
    typeof value === 'number'
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum
  const isNumberBetween = (minimum: number, maximum: number): boolean =>
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum
  const isOneOf = (values: readonly string[]): boolean =>
    typeof value === 'string' && values.includes(value)
  switch (kind) {
    case 'id': return typeof value === 'string' && value.length >= 1 && value.length <= 256
    case 'string': return typeof value === 'string' && value.length <= 8_192
    case 'nonEmptyString':
      return typeof value === 'string' && value.length >= 1 && value.length <= 8_192
    case 'longString': return typeof value === 'string' && value.length <= 2_000_000
    case 'nullableString':
      return value === null || (typeof value === 'string' && value.length <= 16_384)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15
    case 'integer': return isIntegerBetween(-SAFE_NUMERIC_MAX, SAFE_NUMERIC_MAX)
    case 'nullableNumber':
      return value === null
        || (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15)
    case 'positiveInteger': return isIntegerBetween(1, SAFE_NUMERIC_MAX)
    case 'nonNegativeInteger': return isIntegerBetween(0, SAFE_NUMERIC_MAX)
    case 'nullablePositiveInteger':
      return value === null || isIntegerBetween(1, SAFE_NUMERIC_MAX)
    case 'unitNumber': return isNumberBetween(0, 1)
    case 'nullableTemperature': return value === null || isNumberBetween(0, SAFE_NUMERIC_MAX)
    case 'boolean': return typeof value === 'boolean'
    case 'json': return isBoundedJson(value)
    case 'stringArray':
      return Array.isArray(value)
        && value.length <= 20_000
        && value.every((item) => typeof item === 'string' && item.length <= 256)
        && new Set(value).size === value.length
    case 'date': return isValidArchiveDate(value)
    case 'nullableDate': return value === null || isValidArchiveDate(value)
    case 'projectStatus': return isOneOf(['active', 'archived'])
    case 'relationEntityType': return isOneOf(['character', 'organization', 'worldview'])
    case 'volumeStatus':
      return isOneOf(['planned', 'drafting', 'active', 'completed', 'archived'])
    case 'outlineStatus': return isOneOf(['draft', 'confirmed', 'locked'])
    case 'chapterStatus': return isOneOf(['planned', 'drafting', 'review', 'completed'])
    case 'revisionOperation':
      return isOneOf(['manual', 'paragraph_revision', 'polish', 'fallback'])
    case 'versionStatus': return isOneOf(['review', 'approved', 'rejected'])
    case 'foreshadowStatus':
      return isOneOf([
        'suggested', 'planned', 'planted', 'active', 'revealed',
        'paid_off', 'resolved', 'abandoned',
      ])
    case 'foreshadowEventType':
      return isOneOf([
        'suggested', 'planned', 'planted', 'activated', 'revealed',
        'paid_off', 'resolved', 'abandoned', 'note',
      ])
    case 'memoryType':
      return isOneOf([
        'fact', 'event', 'relationship', 'character',
        'worldview', 'emotion', 'theme', 'custom',
      ])
    case 'memoryStatus': return isOneOf(['proposed', 'approved', 'rejected', 'archived'])
    case 'proposalStatus': return isOneOf(['proposed', 'approved', 'rejected'])
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
    'integritySha256',
    'exclusions',
    'warnings',
  ]
  if (!isPlainRecord(manifest) || !hasExactKeys(manifest, manifestKeys)) return false
  if (
    manifest.format !== PROJECT_ARCHIVE_FORMAT
    || manifest.formatVersion !== PROJECT_ARCHIVE_VERSION
    || !isValidArchiveDate(manifest.exportedAt)
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
    || typeof manifest.integritySha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(manifest.integritySha256)
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
