export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject

export interface JsonObject {
  [key: string]: JsonValue
}

export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  slug: string
  name: string
  description: string
  status: ProjectStatus
  version: number
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

export type VolumeStatus = 'planned' | 'drafting' | 'active' | 'completed' | 'archived'

export type OutlineStatus = 'draft' | 'confirmed' | 'locked'

export interface Volume {
  id: string
  project_id: string
  volume_number: number
  title: string
  synopsis: string
  status: VolumeStatus
  sort_order: number
  target_words: number | null
  version: number
  created_at: string
  updated_at: string
}

export interface CreateVolumeInput {
  id?: string
  project_id: string
  volume_number: number
  title: string
  synopsis?: string
  status?: VolumeStatus
  sort_order?: number
  target_words?: number | null
}

export interface UpdateVolumeInput {
  volume_number?: number
  title?: string
  synopsis?: string
  status?: VolumeStatus
  sort_order?: number
  target_words?: number | null
}

export interface VolumeOutline {
  id: string
  project_id: string
  volume_id: string
  status: OutlineStatus
  summary: string
  theme: string
  main_conflict: string
  key_turning_points: string[]
  ending: string
  outline: JsonObject
  source_material_ids: string[]
  metadata: JsonObject
  version: number
  created_at: string
  updated_at: string
}

export interface CreateVolumeOutlineInput {
  id?: string
  project_id: string
  volume_id: string
  summary?: string
  theme?: string
  main_conflict?: string
  key_turning_points?: string[]
  ending?: string
  outline?: JsonObject
  source_material_ids?: string[]
  metadata?: JsonObject
}

export interface UpdateVolumeOutlineInput {
  summary?: string
  theme?: string
  main_conflict?: string
  key_turning_points?: string[]
  ending?: string
  outline?: JsonObject
  source_material_ids?: string[]
  metadata?: JsonObject
}

export interface ChapterOutline {
  id: string
  project_id: string
  volume_id: string
  chapter_number: number
  sort_order: number
  title: string
  summary: string
  purpose: string
  opening: string
  conflict: string
  key_events: string[]
  ending: string
  ending_hook: string
  status: OutlineStatus
  outline: JsonObject
  source_material_ids: string[]
  metadata: JsonObject
  version: number
  created_at: string
  updated_at: string
}

export interface CreateChapterOutlineInput {
  id?: string
  project_id: string
  volume_id: string
  chapter_number: number
  sort_order?: number
  title: string
  summary?: string
  purpose?: string
  opening?: string
  conflict?: string
  key_events?: string[]
  ending?: string
  ending_hook?: string
  outline?: JsonObject
  source_material_ids?: string[]
  metadata?: JsonObject
}

export interface UpdateChapterOutlineInput {
  volume_id?: string
  chapter_number?: number
  sort_order?: number
  title?: string
  summary?: string
  purpose?: string
  opening?: string
  conflict?: string
  key_events?: string[]
  ending?: string
  ending_hook?: string
  outline?: JsonObject
  source_material_ids?: string[]
  metadata?: JsonObject
}

export interface OutlineContext {
  project: Project
  config: ProjectConfig
  characters: Character[]
  worldview_entries: WorldviewEntry[]
  organizations: Organization[]
  relations: Relation[]
  source_materials: SourceMaterial[]
  selected_source_materials: SourceMaterial[]
}

export interface ProjectConfig {
  project_id: string
  default_llm_config_id: string | null
  genre: string
  tone: string
  target_words: number | null
  context_budget: number | null
  settings: JsonObject
  version: number
  created_at: string
  updated_at: string
}

export interface UpdateProjectConfigInput {
  default_llm_config_id?: string | null
  genre?: string
  tone?: string
  target_words?: number | null
  context_budget?: number | null
  settings?: JsonObject
}

export interface Character {
  id: string
  project_id: string
  name: string
  role: string
  crush_slug: string | null
  profile: JsonObject
  notes: string
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

export interface CreateCharacterInput {
  id?: string
  project_id: string
  name: string
  role?: string
  crush_slug?: string | null
  profile?: JsonObject
  notes?: string
  sort_order?: number
}

export interface UpdateCharacterInput {
  name?: string
  role?: string
  crush_slug?: string | null
  profile?: JsonObject
  notes?: string
  sort_order?: number
}

export interface WorldviewEntry {
  id: string
  project_id: string
  category: string
  title: string
  content: string
  metadata: JsonObject
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

export interface CreateWorldviewEntryInput {
  id?: string
  project_id: string
  category?: string
  title: string
  content?: string
  metadata?: JsonObject
  sort_order?: number
}

export interface UpdateWorldviewEntryInput {
  category?: string
  title?: string
  content?: string
  metadata?: JsonObject
  sort_order?: number
}

export interface Organization {
  id: string
  project_id: string
  name: string
  description: string
  metadata: JsonObject
  sort_order: number
  version: number
  created_at: string
  updated_at: string
}

export interface CreateOrganizationInput {
  id?: string
  project_id: string
  name: string
  description?: string
  metadata?: JsonObject
  sort_order?: number
}

export interface UpdateOrganizationInput {
  name?: string
  description?: string
  metadata?: JsonObject
  sort_order?: number
}

export type RelationEntityType = 'character' | 'organization' | 'worldview'

export interface RelationEndpoint {
  type: RelationEntityType
  id: string
}

export interface Relation {
  id: string
  project_id: string
  source_entity_type: RelationEntityType
  source_entity_id: string
  target_entity_type: RelationEntityType
  target_entity_id: string
  source_character_id: string | null
  target_character_id: string | null
  relation_type: string
  description: string
  strength: number | null
  metadata: JsonObject
  version: number
  created_at: string
  updated_at: string
}

export interface CreateRelationInput {
  id?: string
  project_id: string
  source: RelationEndpoint
  target: RelationEndpoint
  relation_type: string
  description?: string
  strength?: number | null
  metadata?: JsonObject
}

export interface UpdateRelationInput {
  source?: RelationEndpoint
  target?: RelationEndpoint
  relation_type?: string
  description?: string
  strength?: number | null
  metadata?: JsonObject
}

export interface SourceMaterial {
  id: string
  project_id: string
  character_id: string | null
  fragment_id: string | null
  title: string
  material_type: string
  uri: string | null
  content: string
  metadata: JsonObject
  version: number
  created_at: string
  updated_at: string
}

export interface CreateSourceMaterialInput {
  id?: string
  project_id: string
  character_id?: string | null
  fragment_id?: string | null
  title: string
  material_type?: string
  uri?: string | null
  content?: string
  metadata?: JsonObject
}

export interface UpdateSourceMaterialInput {
  character_id?: string | null
  fragment_id?: string | null
  title?: string
  material_type?: string
  uri?: string | null
  content?: string
  metadata?: JsonObject
}

export interface SourceMaterialListOptions {
  character_id?: string | null
  fragment_id?: string | null
  material_type?: string
}

export interface LegacyFragmentSnapshot {
  id: string
  date: string
  time: string | null
  origin: string
  mood: string | null
  content: string
  env_tags: string[]
  behavior_tags: string[]
  custom_tags: string[]
  writing_mode: string
  theme: string | null
  crush_slug: string
}
