import type {
  Character,
  CreateCharacterInput,
  CreateOrganizationInput,
  CreateProjectInput,
  CreateRelationInput,
  CreateSourceMaterialInput,
  CreateChapterOutlineInput,
  CreateVolumeInput,
  CreateVolumeOutlineInput,
  ChapterOutline,
  CreateWorldviewEntryInput,
  Organization,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
  SourceMaterialListOptions,
  OutlineStatus,
  UpdateChapterOutlineInput,
  UpdateCharacterInput,
  UpdateOrganizationInput,
  UpdateProjectConfigInput,
  UpdateProjectInput,
  UpdateRelationInput,
  UpdateSourceMaterialInput,
  UpdateVolumeInput,
  UpdateVolumeOutlineInput,
  UpdateWorldviewEntryInput,
  Volume,
  VolumeOutline,
  WorldviewEntry,
  LegacyCrushSnapshot,
} from './models'

export interface ProjectStore {
  create(input: CreateProjectInput): Project
  getById(id: string): Project | null
  getBySlug(slug: string): Project | null
  list(): Project[]
  update(id: string, input: UpdateProjectInput, expectedVersion?: number): Project | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface ProjectConfigStore {
  getByProject(projectId: string): ProjectConfig | null
  save(
    projectId: string,
    input: UpdateProjectConfigInput,
    expectedVersion?: number,
  ): ProjectConfig
}

export interface CharacterStore {
  create(input: CreateCharacterInput): Character
  getById(id: string): Character | null
  getByCrushSlug(projectId: string, crushSlug: string): Character | null
  listByProject(projectId: string): Character[]
  update(id: string, input: UpdateCharacterInput, expectedVersion?: number): Character | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface WorldviewEntryStore {
  create(input: CreateWorldviewEntryInput): WorldviewEntry
  getById(id: string): WorldviewEntry | null
  listByProject(projectId: string): WorldviewEntry[]
  update(
    id: string,
    input: UpdateWorldviewEntryInput,
    expectedVersion?: number,
  ): WorldviewEntry | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface OrganizationStore {
  create(input: CreateOrganizationInput): Organization
  getById(id: string): Organization | null
  listByProject(projectId: string): Organization[]
  update(id: string, input: UpdateOrganizationInput, expectedVersion?: number): Organization | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface RelationStore {
  create(input: CreateRelationInput): Relation
  getById(id: string): Relation | null
  listByProject(projectId: string): Relation[]
  update(id: string, input: UpdateRelationInput, expectedVersion?: number): Relation | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface SourceMaterialStore {
  create(input: CreateSourceMaterialInput): SourceMaterial
  getById(id: string): SourceMaterial | null
  getByFragmentId(projectId: string, fragmentId: string): SourceMaterial | null
  listByProject(projectId: string, options?: SourceMaterialListOptions): SourceMaterial[]
  update(
    id: string,
    input: UpdateSourceMaterialInput,
    expectedVersion?: number,
  ): SourceMaterial | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface CurrentProjectStore {
  getCurrentProjectId(): string | null
  select(projectId: string): void
  clear(): void
}

export interface VolumeStore {
  create(input: CreateVolumeInput): Volume
  getById(id: string): Volume | null
  listByProject(projectId: string): Volume[]
  update(id: string, input: UpdateVolumeInput, expectedVersion?: number): Volume | null
  delete(id: string, expectedVersion?: number): boolean
}

export interface VolumeOutlineStore {
  create(input: CreateVolumeOutlineInput): VolumeOutline
  getById(id: string): VolumeOutline | null
  getByVolumeId(volumeId: string): VolumeOutline | null
  listByProject(projectId: string): VolumeOutline[]
  listByVolume(volumeId: string): VolumeOutline[]
  update(id: string, input: UpdateVolumeOutlineInput, expectedVersion?: number): VolumeOutline | null
  delete(id: string, expectedVersion?: number): boolean
  setStatus(id: string, status: OutlineStatus, expectedVersion?: number): VolumeOutline | null
}

export interface ChapterOutlineStore {
  create(input: CreateChapterOutlineInput): ChapterOutline
  getById(id: string): ChapterOutline | null
  listByProject(projectId: string): ChapterOutline[]
  listByVolume(volumeId: string): ChapterOutline[]
  update(id: string, input: UpdateChapterOutlineInput, expectedVersion?: number): ChapterOutline | null
  delete(id: string, expectedVersion?: number): boolean
  setStatus(id: string, status: OutlineStatus, expectedVersion?: number): ChapterOutline | null
}

export interface OutlineStores {
  volumes: VolumeStore
  volumeOutlines: VolumeOutlineStore
  chapterOutlines: ChapterOutlineStore
}

export interface CrushSnapshot {
  meta: {
    name: string
    nickname: string
    slug: string
    gender: string
    description: string
    intimate_enabled: boolean
  }
  context: {
    persona: string
    memory: string
    weekday: string
    contextSummary: string
    intimateKnowledge: string | null
    intimateEnabled: boolean
  }
}

export interface CrushSource {
  getBySlug(slug: string): CrushSnapshot | null
  list?(): LegacyCrushSnapshot[]
}

export interface LegacyFragmentSource {
  getById(fragmentId: string): LegacyFragmentSnapshot | null
  list?(projectId?: string): LegacyFragmentSnapshot[]
}

export interface NovelProjectStores {
  projects: ProjectStore
  configs: ProjectConfigStore
  characters: CharacterStore
  worldviewEntries: WorldviewEntryStore
  organizations: OrganizationStore
  relations: RelationStore
  sourceMaterials: SourceMaterialStore
  currentProject: CurrentProjectStore
  outline?: OutlineStores
}

import type { LegacyFragmentSnapshot } from './models'
