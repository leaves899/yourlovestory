import { ipcMain } from 'electron'
import type {
  ChapterOutline,
  Character,
  CreateChapterOutlineInput,
  CreateCharacterInput,
  CreateOrganizationInput,
  CreateProjectCommand,
  CreateRelationInput,
  CreateSourceMaterialFromFragmentCommand,
  CreateSourceMaterialInput,
  CreateVolumeInput,
  CreateVolumeOutlineInput,
  CreateWorldviewEntryInput,
  JsonObject,
  NovelProjectService,
  Organization,
  OutlineContext,
  Project,
  ProjectConfig,
  Relation,
  RelationEndpoint,
  RelationEntityType,
  SourceMaterial,
  SourceMaterialListOptions,
  UpdateChapterOutlineInput,
  UpdateCharacterInput,
  UpdateOrganizationInput,
  UpdateProjectConfigInput,
  UpdateProjectInput,
  UpdateRelationInput,
  UpdateSourceMaterialInput,
  UpdateVolumeInput,
  UpdateVolumeOutlineInput,
  Volume,
  VolumeOutline,
  UpdateWorldviewEntryInput,
  WorldviewEntry,
} from '../../shared/novelProject'

export interface WorkbenchResponse<T> {
  success: true
  data: T
}

export interface ProjectIdParams {
  project_id: string
}

export interface ProjectUpdateParams {
  project_id: string
  input: UpdateProjectInput
  expected_version?: number
}

export interface ProjectDeleteParams {
  project_id: string
  expected_version?: number
}

export interface ProjectConfigUpdateParams {
  project_id: string
  input: UpdateProjectConfigInput
  expected_version?: number
}

export interface CharacterUpdateParams {
  project_id: string
  character_id: string
  input: UpdateCharacterInput
  expected_version?: number
}

export interface CharacterGetParams {
  project_id: string
  character_id: string
}

export interface CharacterDeleteParams {
  project_id: string
  character_id: string
  expected_version?: number
}

export interface WorldviewUpdateParams {
  project_id: string
  entry_id: string
  input: UpdateWorldviewEntryInput
  expected_version?: number
}

export interface WorldviewGetParams {
  project_id: string
  entry_id: string
}

export interface WorldviewDeleteParams {
  project_id: string
  entry_id: string
  expected_version?: number
}

export interface OrganizationUpdateParams {
  project_id: string
  organization_id: string
  input: UpdateOrganizationInput
  expected_version?: number
}

export interface OrganizationGetParams {
  project_id: string
  organization_id: string
}

export interface OrganizationDeleteParams {
  project_id: string
  organization_id: string
  expected_version?: number
}

export interface RelationUpdateParams {
  project_id: string
  relation_id: string
  input: UpdateRelationInput
  expected_version?: number
}

export interface RelationGetParams {
  project_id: string
  relation_id: string
}

export interface RelationDeleteParams {
  project_id: string
  relation_id: string
  expected_version?: number
}

export interface SourceMaterialListParams extends ProjectIdParams, SourceMaterialListOptions {}

export interface SourceMaterialGetParams {
  project_id: string
  material_id: string
}

export interface SourceMaterialUpdateParams {
  project_id: string
  material_id: string
  input: UpdateSourceMaterialInput
  expected_version?: number
}

export interface SourceMaterialDeleteParams {
  project_id: string
  material_id: string
  expected_version?: number
}

export interface SourceMaterialSelectionParams {
  project_id: string
  material_ids: string[]
}

export interface VolumeUpdateParams {
  project_id: string
  volume_id: string
  input: UpdateVolumeInput
  expected_version?: number
}

export interface VolumeGetParams {
  project_id: string
  volume_id: string
}

export interface VolumeDeleteParams {
  project_id: string
  volume_id: string
  expected_version?: number
}

export interface VolumeOutlineUpdateParams {
  project_id: string
  outline_id: string
  input: UpdateVolumeOutlineInput
  expected_version?: number
}

export interface VolumeOutlineGetParams {
  project_id: string
  outline_id: string
}

export interface VolumeOutlineByVolumeParams {
  project_id: string
  volume_id: string
}

export interface VolumeOutlineDeleteParams {
  project_id: string
  outline_id: string
  expected_version?: number
}

export interface ChapterOutlineUpdateParams {
  project_id: string
  outline_id: string
  input: UpdateChapterOutlineInput
  expected_version?: number
}

export interface ChapterOutlineGetParams {
  project_id: string
  outline_id: string
}

export interface ChapterOutlineByVolumeParams {
  project_id: string
  volume_id: string
}

export interface ChapterOutlineDeleteParams {
  project_id: string
  outline_id: string
  expected_version?: number
}

export interface OutlineStatusParams {
  project_id: string
  outline_id: string
  expected_version?: number
}

export interface OutlineContextParams {
  project_id: string
  source_material_ids?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is JsonObject[string] {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} is required`)
  return value
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function readOptionalString(record: Record<string, unknown>, field: string): string | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  if (typeof record[field] !== 'string') throw new Error(`${field} must be a string`)
  return record[field]
}

function readOptionalNullableString(
  record: Record<string, unknown>,
  field: string,
): string | null | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  if (record[field] === null) return null
  if (typeof record[field] !== 'string') throw new Error(`${field} must be a string or null`)
  return record[field]
}

function readOptionalInteger(
  record: Record<string, unknown>,
  field: string,
  minimum: number,
): number | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  const value = record[field]
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`${field} must be an integer >= ${minimum}`)
  }
  return value
}

function readRequiredInteger(
  record: Record<string, unknown>,
  field: string,
  minimum: number,
): number {
  const value = readOptionalInteger(record, field, minimum)
  if (value === undefined) throw new Error(`${field} is required`)
  return value
}

function readOptionalNullableInteger(
  record: Record<string, unknown>,
  field: string,
  minimum: number,
): number | null | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  if (record[field] === null) return null
  return readOptionalInteger(record, field, minimum)
}

function readOptionalNumber(record: Record<string, unknown>, field: string): number | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field} must be a number`)
  return value
}

function readOptionalBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  if (typeof record[field] !== 'boolean') throw new Error(`${field} must be a boolean`)
  return record[field]
}

function readOptionalJsonObject(record: Record<string, unknown>, field: string): JsonObject | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  const value = record[field]
  if (!isRecord(value) || !Object.values(value).every(isJsonValue)) {
    throw new Error(`${field} must be a JSON object`)
  }
  return value as JsonObject
}

function readOptionalArrayOfStrings(
  record: Record<string, unknown>,
  field: string,
): string[] | undefined {
  if (!(field in record) || record[field] === undefined) return undefined
  const value = record[field]
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim() !== '')) {
    throw new Error(`${field} must be a string array`)
  }
  return value
}

function readExpectedVersion(record: Record<string, unknown>): number | undefined {
  return readOptionalInteger(record, 'expected_version', 1)
}

function parseProjectStatus(value: unknown): 'active' | 'archived' | undefined {
  if (value === undefined) return undefined
  if (value !== 'active' && value !== 'archived') throw new Error('status must be active or archived')
  return value
}

function parseVolumeStatus(value: unknown): Volume['status'] | undefined {
  if (value === undefined) return undefined
  if (
    value !== 'planned' &&
    value !== 'drafting' &&
    value !== 'active' &&
    value !== 'completed' &&
    value !== 'archived'
  ) {
    throw new Error('status must be planned, drafting, active, completed, or archived')
  }
  return value
}

export function parseProjectCreateParams(value: unknown): CreateProjectCommand {
  const record = readRecord(value, 'project create input')
  const selectAfterCreate = readOptionalBoolean(record, 'select_after_create') ?? false
  return {
    slug: readString(record.slug, 'slug'),
    name: readString(record.name, 'name'),
    description: readOptionalString(record, 'description'),
    status: parseProjectStatus(record.status),
    select_after_create: selectAfterCreate,
  }
}

export function parseProjectUpdateParams(value: unknown): ProjectUpdateParams {
  const record = readRecord(value, 'project update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    expected_version: readExpectedVersion(record),
    input: {
      slug: readOptionalString(input, 'slug'),
      name: readOptionalString(input, 'name'),
      description: readOptionalString(input, 'description'),
      status: parseProjectStatus(input.status),
    },
  }
}

function parseProjectIdParams(value: unknown): ProjectIdParams {
  const record = readRecord(value, 'project input')
  return { project_id: readString(record.project_id, 'project_id') }
}

function parseProjectDeleteParams(value: unknown): ProjectDeleteParams {
  const record = readRecord(value, 'project delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseConfigUpdateParams(value: unknown): ProjectConfigUpdateParams {
  const record = readRecord(value, 'project config input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    expected_version: readExpectedVersion(record),
    input: {
      default_llm_config_id: readOptionalNullableString(input, 'default_llm_config_id'),
      genre: readOptionalString(input, 'genre'),
      tone: readOptionalString(input, 'tone'),
      target_words: readOptionalNullableInteger(input, 'target_words', 1),
      context_budget: readOptionalNullableInteger(input, 'context_budget', 1),
      settings: readOptionalJsonObject(input, 'settings'),
    },
  }
}

export function parseVolumeCreateParams(value: unknown): CreateVolumeInput {
  const record = readRecord(value, 'volume create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_number: readRequiredInteger(record, 'volume_number', 1),
    title: readString(record.title, 'title'),
    synopsis: readOptionalString(record, 'synopsis'),
    status: parseVolumeStatus(record.status),
    sort_order: readOptionalInteger(record, 'sort_order', 0),
    target_words: readOptionalNullableInteger(record, 'target_words', 1),
  }
}

export function parseVolumeUpdateParams(value: unknown): VolumeUpdateParams {
  const record = readRecord(value, 'volume update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
    expected_version: readExpectedVersion(record),
    input: {
      volume_number: readOptionalInteger(input, 'volume_number', 1),
      title: readOptionalString(input, 'title'),
      synopsis: readOptionalString(input, 'synopsis'),
      status: parseVolumeStatus(input.status),
      sort_order: readOptionalInteger(input, 'sort_order', 0),
      target_words: readOptionalNullableInteger(input, 'target_words', 1),
    },
  }
}

function parseVolumeGetParams(value: unknown): VolumeGetParams {
  const record = readRecord(value, 'volume get input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
  }
}

function parseVolumeDeleteParams(value: unknown): VolumeDeleteParams {
  const record = readRecord(value, 'volume delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
    expected_version: readExpectedVersion(record),
  }
}

export function parseVolumeOutlineCreateParams(value: unknown): CreateVolumeOutlineInput {
  const record = readRecord(value, 'volume outline create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
    summary: readOptionalString(record, 'summary'),
    theme: readOptionalString(record, 'theme'),
    main_conflict: readOptionalString(record, 'main_conflict'),
    key_turning_points: readOptionalArrayOfStrings(record, 'key_turning_points'),
    ending: readOptionalString(record, 'ending'),
    outline: readOptionalJsonObject(record, 'outline'),
    source_material_ids: readOptionalArrayOfStrings(record, 'source_material_ids'),
    metadata: readOptionalJsonObject(record, 'metadata'),
  }
}

export function parseVolumeOutlineUpdateParams(value: unknown): VolumeOutlineUpdateParams {
  const record = readRecord(value, 'volume outline update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
    expected_version: readExpectedVersion(record),
    input: {
      summary: readOptionalString(input, 'summary'),
      theme: readOptionalString(input, 'theme'),
      main_conflict: readOptionalString(input, 'main_conflict'),
      key_turning_points: readOptionalArrayOfStrings(input, 'key_turning_points'),
      ending: readOptionalString(input, 'ending'),
      outline: readOptionalJsonObject(input, 'outline'),
      source_material_ids: readOptionalArrayOfStrings(input, 'source_material_ids'),
      metadata: readOptionalJsonObject(input, 'metadata'),
    },
  }
}

function parseVolumeOutlineGetParams(value: unknown): VolumeOutlineGetParams {
  const record = readRecord(value, 'volume outline get input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
  }
}

function parseVolumeOutlineByVolumeParams(value: unknown): VolumeOutlineByVolumeParams {
  const record = readRecord(value, 'volume outline by volume input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
  }
}

function parseVolumeOutlineDeleteParams(value: unknown): VolumeOutlineDeleteParams {
  const record = readRecord(value, 'volume outline delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
    expected_version: readExpectedVersion(record),
  }
}

export function parseChapterOutlineCreateParams(value: unknown): CreateChapterOutlineInput {
  const record = readRecord(value, 'chapter outline create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
    chapter_number: readRequiredInteger(record, 'chapter_number', 1),
    sort_order: readOptionalInteger(record, 'sort_order', 0),
    title: readString(record.title, 'title'),
    summary: readOptionalString(record, 'summary'),
    purpose: readOptionalString(record, 'purpose'),
    opening: readOptionalString(record, 'opening'),
    conflict: readOptionalString(record, 'conflict'),
    key_events: readOptionalArrayOfStrings(record, 'key_events'),
    ending: readOptionalString(record, 'ending'),
    ending_hook: readOptionalString(record, 'ending_hook'),
    outline: readOptionalJsonObject(record, 'outline'),
    source_material_ids: readOptionalArrayOfStrings(record, 'source_material_ids'),
    metadata: readOptionalJsonObject(record, 'metadata'),
  }
}

export function parseChapterOutlineUpdateParams(value: unknown): ChapterOutlineUpdateParams {
  const record = readRecord(value, 'chapter outline update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
    expected_version: readExpectedVersion(record),
    input: {
      volume_id: readOptionalString(input, 'volume_id'),
      chapter_number: readOptionalInteger(input, 'chapter_number', 1),
      sort_order: readOptionalInteger(input, 'sort_order', 0),
      title: readOptionalString(input, 'title'),
      summary: readOptionalString(input, 'summary'),
      purpose: readOptionalString(input, 'purpose'),
      opening: readOptionalString(input, 'opening'),
      conflict: readOptionalString(input, 'conflict'),
      key_events: readOptionalArrayOfStrings(input, 'key_events'),
      ending: readOptionalString(input, 'ending'),
      ending_hook: readOptionalString(input, 'ending_hook'),
      outline: readOptionalJsonObject(input, 'outline'),
      source_material_ids: readOptionalArrayOfStrings(input, 'source_material_ids'),
      metadata: readOptionalJsonObject(input, 'metadata'),
    },
  }
}

function parseChapterOutlineGetParams(value: unknown): ChapterOutlineGetParams {
  const record = readRecord(value, 'chapter outline get input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
  }
}

function parseChapterOutlineByVolumeParams(value: unknown): ChapterOutlineByVolumeParams {
  const record = readRecord(value, 'chapter outline by volume input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    volume_id: readString(record.volume_id, 'volume_id'),
  }
}

function parseChapterOutlineDeleteParams(value: unknown): ChapterOutlineDeleteParams {
  const record = readRecord(value, 'chapter outline delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseOutlineStatusParams(value: unknown): OutlineStatusParams {
  const record = readRecord(value, 'outline status input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    outline_id: readString(record.outline_id, 'outline_id'),
    expected_version: readExpectedVersion(record),
  }
}

export function parseOutlineContextParams(value: unknown): OutlineContextParams {
  const record = readRecord(value, 'outline context input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    source_material_ids: readOptionalArrayOfStrings(record, 'source_material_ids'),
  }
}

function parseCharacterCreateParams(value: unknown): CreateCharacterInput {
  const record = readRecord(value, 'character create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    name: readString(record.name, 'name'),
    role: readOptionalString(record, 'role'),
    crush_slug: readOptionalNullableString(record, 'crush_slug'),
    profile: readOptionalJsonObject(record, 'profile'),
    notes: readOptionalString(record, 'notes'),
    sort_order: readOptionalInteger(record, 'sort_order', 0),
  }
}

function parseCharacterUpdateParams(value: unknown): CharacterUpdateParams {
  const record = readRecord(value, 'character update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    character_id: readString(record.character_id, 'character_id'),
    expected_version: readExpectedVersion(record),
    input: {
      name: readOptionalString(input, 'name'),
      role: readOptionalString(input, 'role'),
      crush_slug: readOptionalNullableString(input, 'crush_slug'),
      profile: readOptionalJsonObject(input, 'profile'),
      notes: readOptionalString(input, 'notes'),
      sort_order: readOptionalInteger(input, 'sort_order', 0),
    },
  }
}

function parseCharacterDeleteParams(value: unknown): CharacterDeleteParams {
  const record = readRecord(value, 'character delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    character_id: readString(record.character_id, 'character_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseWorldviewCreateParams(value: unknown): CreateWorldviewEntryInput {
  const record = readRecord(value, 'worldview create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    category: readOptionalString(record, 'category'),
    title: readString(record.title, 'title'),
    content: readOptionalString(record, 'content'),
    metadata: readOptionalJsonObject(record, 'metadata'),
    sort_order: readOptionalInteger(record, 'sort_order', 0),
  }
}

function parseWorldviewUpdateParams(value: unknown): WorldviewUpdateParams {
  const record = readRecord(value, 'worldview update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    entry_id: readString(record.entry_id, 'entry_id'),
    expected_version: readExpectedVersion(record),
    input: {
      category: readOptionalString(input, 'category'),
      title: readOptionalString(input, 'title'),
      content: readOptionalString(input, 'content'),
      metadata: readOptionalJsonObject(input, 'metadata'),
      sort_order: readOptionalInteger(input, 'sort_order', 0),
    },
  }
}

function parseWorldviewDeleteParams(value: unknown): WorldviewDeleteParams {
  const record = readRecord(value, 'worldview delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    entry_id: readString(record.entry_id, 'entry_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseOrganizationCreateParams(value: unknown): CreateOrganizationInput {
  const record = readRecord(value, 'organization create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    name: readString(record.name, 'name'),
    description: readOptionalString(record, 'description'),
    metadata: readOptionalJsonObject(record, 'metadata'),
    sort_order: readOptionalInteger(record, 'sort_order', 0),
  }
}

function parseOrganizationUpdateParams(value: unknown): OrganizationUpdateParams {
  const record = readRecord(value, 'organization update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    organization_id: readString(record.organization_id, 'organization_id'),
    expected_version: readExpectedVersion(record),
    input: {
      name: readOptionalString(input, 'name'),
      description: readOptionalString(input, 'description'),
      metadata: readOptionalJsonObject(input, 'metadata'),
      sort_order: readOptionalInteger(input, 'sort_order', 0),
    },
  }
}

function parseOrganizationDeleteParams(value: unknown): OrganizationDeleteParams {
  const record = readRecord(value, 'organization delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    organization_id: readString(record.organization_id, 'organization_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseRelationEndpoint(value: unknown, field: string): RelationEndpoint {
  const record = readRecord(value, field)
  const type = readString(record.type, `${field}.type`)
  if (type !== 'character' && type !== 'organization' && type !== 'worldview') {
    throw new Error(`${field}.type is invalid`)
  }
  return { type: type as RelationEntityType, id: readString(record.id, `${field}.id`) }
}

export function parseRelationCreateParams(value: unknown): CreateRelationInput {
  const record = readRecord(value, 'relation create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    source: parseRelationEndpoint(record.source, 'source'),
    target: parseRelationEndpoint(record.target, 'target'),
    relation_type: readString(record.relation_type, 'relation_type'),
    description: readOptionalString(record, 'description'),
    strength: record.strength === null ? null : readOptionalNumber(record, 'strength'),
    metadata: readOptionalJsonObject(record, 'metadata'),
  }
}

function parseRelationUpdateParams(value: unknown): RelationUpdateParams {
  const record = readRecord(value, 'relation update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    relation_id: readString(record.relation_id, 'relation_id'),
    expected_version: readExpectedVersion(record),
    input: {
      source: input.source === undefined ? undefined : parseRelationEndpoint(input.source, 'input.source'),
      target: input.target === undefined ? undefined : parseRelationEndpoint(input.target, 'input.target'),
      relation_type: readOptionalString(input, 'relation_type'),
      description: readOptionalString(input, 'description'),
      strength: input.strength === null ? null : readOptionalNumber(input, 'strength'),
      metadata: readOptionalJsonObject(input, 'metadata'),
    },
  }
}

function parseRelationDeleteParams(value: unknown): RelationDeleteParams {
  const record = readRecord(value, 'relation delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    relation_id: readString(record.relation_id, 'relation_id'),
    expected_version: readExpectedVersion(record),
  }
}

function parseSourceMaterialCreateParams(value: unknown): CreateSourceMaterialInput {
  const record = readRecord(value, 'source material create input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    character_id: readOptionalNullableString(record, 'character_id'),
    fragment_id: readOptionalNullableString(record, 'fragment_id'),
    title: readString(record.title, 'title'),
    material_type: readOptionalString(record, 'material_type'),
    uri: readOptionalNullableString(record, 'uri'),
    content: readOptionalString(record, 'content'),
    metadata: readOptionalJsonObject(record, 'metadata'),
  }
}

export function parseSourceMaterialListParams(value: unknown): SourceMaterialListParams {
  const record = readRecord(value, 'source material list input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    character_id: readOptionalNullableString(record, 'character_id'),
    fragment_id: readOptionalNullableString(record, 'fragment_id'),
    material_type: readOptionalString(record, 'material_type'),
  }
}

function parseSourceMaterialGetParams(value: unknown): SourceMaterialGetParams {
  const record = readRecord(value, 'source material get input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    material_id: readString(record.material_id, 'material_id'),
  }
}

function parseSourceMaterialUpdateParams(value: unknown): SourceMaterialUpdateParams {
  const record = readRecord(value, 'source material update input')
  const input = readRecord(record.input, 'input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    material_id: readString(record.material_id, 'material_id'),
    expected_version: readExpectedVersion(record),
    input: {
      character_id: readOptionalNullableString(input, 'character_id'),
      fragment_id: readOptionalNullableString(input, 'fragment_id'),
      title: readOptionalString(input, 'title'),
      material_type: readOptionalString(input, 'material_type'),
      uri: readOptionalNullableString(input, 'uri'),
      content: readOptionalString(input, 'content'),
      metadata: readOptionalJsonObject(input, 'metadata'),
    },
  }
}

function parseSourceMaterialDeleteParams(value: unknown): SourceMaterialDeleteParams {
  const record = readRecord(value, 'source material delete input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    material_id: readString(record.material_id, 'material_id'),
    expected_version: readExpectedVersion(record),
  }
}

export function parseSourceMaterialSelectionParams(value: unknown): SourceMaterialSelectionParams {
  const record = readRecord(value, 'source material selection input')
  const materialIds = readOptionalArrayOfStrings(record, 'material_ids')
  if (!materialIds) throw new Error('material_ids is required')
  return {
    project_id: readString(record.project_id, 'project_id'),
    material_ids: materialIds,
  }
}

function parseMapCrushParams(value: unknown): Parameters<NovelProjectService['mapCrushToCharacter']>[0] {
  const record = readRecord(value, 'crush mapping input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    crush_slug: readString(record.crush_slug, 'crush_slug'),
    character_id: readOptionalString(record, 'character_id'),
    role: readOptionalString(record, 'role'),
    expected_version: readExpectedVersion(record),
  }
}

function parseSourceMaterialFromFragmentParams(
  value: unknown,
): CreateSourceMaterialFromFragmentCommand {
  const record = readRecord(value, 'fragment material input')
  return {
    project_id: readString(record.project_id, 'project_id'),
    fragment_id: readString(record.fragment_id, 'fragment_id'),
    character_id: readOptionalNullableString(record, 'character_id'),
    title: readOptionalString(record, 'title'),
  }
}

function success<T>(data: T): WorkbenchResponse<T> {
  return { success: true, data }
}

export function registerWorkbenchIPC(service: NovelProjectService | undefined): void {
  if (!service) return

  ipcMain.handle('novelProject:list', async () => success<Project[]>(service.listProjects()))
  ipcMain.handle('novelProject:current', async () => success(service.getCurrentProject()))
  ipcMain.handle('novelProject:get', async (_, value: unknown) =>
    success(service.getProject(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:create', async (_, value: unknown) =>
    success(service.createProject(parseProjectCreateParams(value))),
  )
  ipcMain.handle('novelProject:select', async (_, value: unknown) =>
    success(service.selectProject(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:update', async (_, value: unknown) => {
    const params = parseProjectUpdateParams(value)
    return success(service.updateProject(params.project_id, params.input, params.expected_version))
  })
  ipcMain.handle('novelProject:delete', async (_, value: unknown) => {
    const params = parseProjectDeleteParams(value)
    service.deleteProject(params.project_id, params.expected_version)
    return { success: true }
  })

  ipcMain.handle('novelProject:config:get', async (_, value: unknown) =>
    success(service.getProjectConfig(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:config:update', async (_, value: unknown) => {
    const params = parseConfigUpdateParams(value)
    return success(
      service.updateProjectConfig(params.project_id, params.input, params.expected_version),
    )
  })

  ipcMain.handle('novelProject:volume:create', async (_, value: unknown) =>
    success(service.createVolume(parseVolumeCreateParams(value))),
  )
  ipcMain.handle('novelProject:volume:list', async (_, value: unknown) =>
    success(service.listVolumes(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:volume:get', async (_, value: unknown) => {
    const params = parseVolumeGetParams(value)
    return success(service.getVolume(params.project_id, params.volume_id))
  })
  ipcMain.handle('novelProject:volume:update', async (_, value: unknown) => {
    const params = parseVolumeUpdateParams(value)
    return success(
      service.updateVolume(params.project_id, params.volume_id, params.input, params.expected_version),
    )
  })
  ipcMain.handle('novelProject:volume:delete', async (_, value: unknown) => {
    const params = parseVolumeDeleteParams(value)
    service.deleteVolume(params.project_id, params.volume_id, params.expected_version)
    return { success: true }
  })

  ipcMain.handle('novelProject:volumeOutline:create', async (_, value: unknown) =>
    success(service.createVolumeOutline(parseVolumeOutlineCreateParams(value))),
  )
  ipcMain.handle('novelProject:volumeOutline:list', async (_, value: unknown) =>
    success(service.listVolumeOutlines(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:volumeOutline:get', async (_, value: unknown) => {
    const params = parseVolumeOutlineGetParams(value)
    return success(service.getVolumeOutline(params.project_id, params.outline_id))
  })
  ipcMain.handle('novelProject:volumeOutline:getByVolume', async (_, value: unknown) => {
    const params = parseVolumeOutlineByVolumeParams(value)
    return success(service.getVolumeOutlineByVolume(params.project_id, params.volume_id))
  })
  ipcMain.handle('novelProject:volumeOutline:update', async (_, value: unknown) => {
    const params = parseVolumeOutlineUpdateParams(value)
    return success(
      service.updateVolumeOutline(
        params.project_id,
        params.outline_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:volumeOutline:delete', async (_, value: unknown) => {
    const params = parseVolumeOutlineDeleteParams(value)
    service.deleteVolumeOutline(params.project_id, params.outline_id, params.expected_version)
    return { success: true }
  })
  ipcMain.handle('novelProject:volumeOutline:confirm', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.confirmVolumeOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })
  ipcMain.handle('novelProject:volumeOutline:lock', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.lockVolumeOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })
  ipcMain.handle('novelProject:volumeOutline:unlock', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.unlockVolumeOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })

  ipcMain.handle('novelProject:chapterOutline:create', async (_, value: unknown) =>
    success(service.createChapterOutline(parseChapterOutlineCreateParams(value))),
  )
  ipcMain.handle('novelProject:chapterOutline:list', async (_, value: unknown) =>
    success(service.listChapterOutlines(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:chapterOutline:listByVolume', async (_, value: unknown) => {
    const params = parseChapterOutlineByVolumeParams(value)
    return success(service.listChapterOutlinesByVolume(params.project_id, params.volume_id))
  })
  ipcMain.handle('novelProject:chapterOutline:get', async (_, value: unknown) => {
    const params = parseChapterOutlineGetParams(value)
    return success(service.getChapterOutline(params.project_id, params.outline_id))
  })
  ipcMain.handle('novelProject:chapterOutline:update', async (_, value: unknown) => {
    const params = parseChapterOutlineUpdateParams(value)
    return success(
      service.updateChapterOutline(
        params.project_id,
        params.outline_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:chapterOutline:delete', async (_, value: unknown) => {
    const params = parseChapterOutlineDeleteParams(value)
    service.deleteChapterOutline(params.project_id, params.outline_id, params.expected_version)
    return { success: true }
  })
  ipcMain.handle('novelProject:chapterOutline:confirm', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.confirmChapterOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })
  ipcMain.handle('novelProject:chapterOutline:lock', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.lockChapterOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })
  ipcMain.handle('novelProject:chapterOutline:unlock', async (_, value: unknown) => {
    const params = parseOutlineStatusParams(value)
    return success(
      service.unlockChapterOutline(params.project_id, params.outline_id, params.expected_version),
    )
  })

  ipcMain.handle('novelProject:outline:context', async (_, value: unknown) => {
    const params = parseOutlineContextParams(value)
    return success(service.getOutlineContext(params.project_id, params.source_material_ids ?? []))
  })
  ipcMain.handle('novelProject:outline:selectSourceMaterials', async (_, value: unknown) => {
    const params = parseSourceMaterialSelectionParams(value)
    return success(service.selectOutlineSourceMaterials(params.project_id, params.material_ids))
  })

  ipcMain.handle('novelProject:character:create', async (_, value: unknown) =>
    success(service.createCharacter(parseCharacterCreateParams(value))),
  )
  ipcMain.handle('novelProject:character:list', async (_, value: unknown) =>
    success(service.listCharacters(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:character:get', async (_, value: unknown) => {
    const params = readRecord(value, 'character get input')
    return success(
      service.getCharacter(
        readString(params.project_id, 'project_id'),
        readString(params.character_id, 'character_id'),
      ),
    )
  })
  ipcMain.handle('novelProject:character:update', async (_, value: unknown) => {
    const params = parseCharacterUpdateParams(value)
    return success(
      service.updateCharacter(
        params.project_id,
        params.character_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:character:delete', async (_, value: unknown) => {
    const params = parseCharacterDeleteParams(value)
    service.deleteCharacter(params.project_id, params.character_id, params.expected_version)
    return { success: true }
  })
  ipcMain.handle('novelProject:character:mapCrush', async (_, value: unknown) =>
    success(service.mapCrushToCharacter(parseMapCrushParams(value))),
  )

  ipcMain.handle('novelProject:worldview:create', async (_, value: unknown) =>
    success(service.createWorldviewEntry(parseWorldviewCreateParams(value))),
  )
  ipcMain.handle('novelProject:worldview:list', async (_, value: unknown) =>
    success(service.listWorldviewEntries(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:worldview:get', async (_, value: unknown) => {
    const params = readRecord(value, 'worldview get input')
    return success(
      service.getWorldviewEntry(
        readString(params.project_id, 'project_id'),
        readString(params.entry_id, 'entry_id'),
      ),
    )
  })
  ipcMain.handle('novelProject:worldview:update', async (_, value: unknown) => {
    const params = parseWorldviewUpdateParams(value)
    return success(
      service.updateWorldviewEntry(
        params.project_id,
        params.entry_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:worldview:delete', async (_, value: unknown) => {
    const params = parseWorldviewDeleteParams(value)
    service.deleteWorldviewEntry(params.project_id, params.entry_id, params.expected_version)
    return { success: true }
  })

  ipcMain.handle('novelProject:organization:create', async (_, value: unknown) =>
    success(service.createOrganization(parseOrganizationCreateParams(value))),
  )
  ipcMain.handle('novelProject:organization:list', async (_, value: unknown) =>
    success(service.listOrganizations(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:organization:get', async (_, value: unknown) => {
    const params = readRecord(value, 'organization get input')
    return success(
      service.getOrganization(
        readString(params.project_id, 'project_id'),
        readString(params.organization_id, 'organization_id'),
      ),
    )
  })
  ipcMain.handle('novelProject:organization:update', async (_, value: unknown) => {
    const params = parseOrganizationUpdateParams(value)
    return success(
      service.updateOrganization(
        params.project_id,
        params.organization_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:organization:delete', async (_, value: unknown) => {
    const params = parseOrganizationDeleteParams(value)
    service.deleteOrganization(
      params.project_id,
      params.organization_id,
      params.expected_version,
    )
    return { success: true }
  })

  ipcMain.handle('novelProject:relation:create', async (_, value: unknown) =>
    success(service.createRelation(parseRelationCreateParams(value))),
  )
  ipcMain.handle('novelProject:relation:list', async (_, value: unknown) =>
    success(service.listRelations(parseProjectIdParams(value).project_id)),
  )
  ipcMain.handle('novelProject:relation:get', async (_, value: unknown) => {
    const params = readRecord(value, 'relation get input')
    return success(
      service.getRelation(
        readString(params.project_id, 'project_id'),
        readString(params.relation_id, 'relation_id'),
      ),
    )
  })
  ipcMain.handle('novelProject:relation:update', async (_, value: unknown) => {
    const params = parseRelationUpdateParams(value)
    return success(
      service.updateRelation(
        params.project_id,
        params.relation_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:relation:delete', async (_, value: unknown) => {
    const params = parseRelationDeleteParams(value)
    service.deleteRelation(params.project_id, params.relation_id, params.expected_version)
    return { success: true }
  })

  ipcMain.handle('novelProject:sourceMaterial:create', async (_, value: unknown) =>
    success(service.createSourceMaterial(parseSourceMaterialCreateParams(value))),
  )
  ipcMain.handle('novelProject:sourceMaterial:list', async (_, value: unknown) => {
    const params = parseSourceMaterialListParams(value)
    const options: SourceMaterialListOptions = {
      character_id: params.character_id,
      fragment_id: params.fragment_id,
      material_type: params.material_type,
    }
    return success(service.listSourceMaterials(params.project_id, options))
  })
  ipcMain.handle('novelProject:sourceMaterial:get', async (_, value: unknown) => {
    const params = parseSourceMaterialGetParams(value)
    return success(service.getSourceMaterial(params.project_id, params.material_id))
  })
  ipcMain.handle('novelProject:sourceMaterial:update', async (_, value: unknown) => {
    const params = parseSourceMaterialUpdateParams(value)
    return success(
      service.updateSourceMaterial(
        params.project_id,
        params.material_id,
        params.input,
        params.expected_version,
      ),
    )
  })
  ipcMain.handle('novelProject:sourceMaterial:delete', async (_, value: unknown) => {
    const params = parseSourceMaterialDeleteParams(value)
    service.deleteSourceMaterial(params.project_id, params.material_id, params.expected_version)
    return { success: true }
  })
  ipcMain.handle('novelProject:sourceMaterial:fromFragment', async (_, value: unknown) =>
    success(service.createSourceMaterialFromFragment(parseSourceMaterialFromFragmentParams(value))),
  )
  ipcMain.handle('novelProject:sourceMaterial:selectForPrompt', async (_, value: unknown) => {
    const params = parseSourceMaterialSelectionParams(value)
    return success(service.selectSourceMaterialsForPrompt(params.project_id, params.material_ids))
  })
}

export type {
  ChapterOutline,
  Character,
  Organization,
  OutlineContext,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
  Volume,
  VolumeOutline,
  WorldviewEntry,
}
