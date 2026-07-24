import {
  CurrentProjectDeletionError,
  EntityNotFoundError,
  OutlineStoreNotConfiguredError,
  VersionConflictError,
} from './errors'
import type {
  ChapterOutline,
  Character,
  CreateCharacterInput,
  CreateOrganizationInput,
  CreateProjectInput,
  CreateRelationInput,
  CreateSourceMaterialInput,
  CreateWorldviewEntryInput,
  JsonObject,
  LegacyFragmentSnapshot,
  LegacyCrushSnapshot,
  Organization,
  OutlineContext,
  OutlineStatus,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
  SourceMaterialListOptions,
  CreateChapterOutlineInput,
  CreateVolumeInput,
  CreateVolumeOutlineInput,
  UpdateChapterOutlineInput,
  UpdateVolumeInput,
  UpdateVolumeOutlineInput,
  Volume,
  VolumeOutline,
  UpdateCharacterInput,
  UpdateOrganizationInput,
  UpdateProjectConfigInput,
  UpdateProjectInput,
  UpdateRelationInput,
  UpdateSourceMaterialInput,
  UpdateWorldviewEntryInput,
  WorldviewEntry,
} from './models'
import type { CrushSource, LegacyFragmentSource, NovelProjectStores, OutlineStores } from './ports'

export interface CreateProjectCommand extends CreateProjectInput {
  select_after_create?: boolean
}

export interface MapCrushToCharacterCommand {
  project_id: string
  crush_slug: string
  character_id?: string
  role?: string
  expected_version?: number
}

export interface CreateSourceMaterialFromFragmentCommand {
  project_id: string
  fragment_id: string
  character_id?: string | null
  title?: string
}

export class NovelProjectService {
  public constructor(
    private readonly stores: NovelProjectStores,
    private readonly crushSource?: CrushSource,
    private readonly legacyFragmentSource?: LegacyFragmentSource,
  ) {}

  public createProject(input: CreateProjectCommand): Project {
    const project = this.stores.projects.create(input)
    if (input.select_after_create) this.stores.currentProject.select(project.id)
    return project
  }

  public listProjects(): Project[] {
    return this.stores.projects.list()
  }

  /** 返回可供一次性导入的旧角色预览，不会写入任何新数据。 */
  public listImportableCrushes(): LegacyCrushSnapshot[] {
    return this.crushSource?.list?.() ?? []
  }

  /** 返回可供一次性导入的旧碎片预览，不会写入任何新数据。 */
  public listImportableFragments(projectId?: string): LegacyFragmentSnapshot[] {
    if (projectId !== undefined) this.requireProject(projectId)
    return this.legacyFragmentSource?.list?.(projectId) ?? []
  }

  public getProject(projectId: string): Project {
    return this.requireProject(projectId)
  }

  public getCurrentProject(): Project | null {
    const projectId = this.stores.currentProject.getCurrentProjectId()
    return projectId ? this.stores.projects.getById(projectId) : null
  }

  public selectProject(projectId: string): Project {
    const project = this.requireProject(projectId)
    this.stores.currentProject.select(project.id)
    return project
  }

  public updateProject(
    projectId: string,
    input: UpdateProjectInput,
    expectedVersion?: number,
  ): Project {
    this.requireProject(projectId)
    const project = this.stores.projects.update(projectId, input, expectedVersion)
    if (!project) throw new EntityNotFoundError('Project', projectId)
    return project
  }

  public deleteProject(projectId: string, expectedVersion?: number): void {
    const project = this.requireProject(projectId)
    if (this.stores.currentProject.getCurrentProjectId() === project.id) {
      throw new CurrentProjectDeletionError(project.id)
    }
    if (!this.stores.projects.delete(projectId, expectedVersion)) {
      throw new EntityNotFoundError('Project', projectId)
    }
  }

  public getProjectConfig(projectId: string): ProjectConfig {
    this.requireProject(projectId)
    const existing = this.stores.configs.getByProject(projectId)
    return existing ?? this.stores.configs.save(projectId, {})
  }

  public updateProjectConfig(
    projectId: string,
    input: UpdateProjectConfigInput,
    expectedVersion?: number,
  ): ProjectConfig {
    this.requireProject(projectId)
    return this.stores.configs.save(projectId, input, expectedVersion)
  }

  public createCharacter(input: CreateCharacterInput): Character {
    this.requireProject(input.project_id)
    this.assertCharacterCrushSlugAvailable(input.project_id, input.crush_slug, undefined)
    return this.stores.characters.create(input)
  }

  public listCharacters(projectId: string): Character[] {
    this.requireProject(projectId)
    return this.stores.characters.listByProject(projectId)
  }

  public getCharacter(projectId: string, characterId: string): Character {
    const character = this.requireEntity(
      this.stores.characters.getById(characterId),
      'Character',
      characterId,
    )
    this.assertProjectOwnership(character.project_id, projectId)
    return character
  }

  public updateCharacter(
    projectId: string,
    characterId: string,
    input: UpdateCharacterInput,
    expectedVersion?: number,
  ): Character {
    const current = this.getCharacter(projectId, characterId)
    this.assertCharacterCrushSlugAvailable(projectId, input.crush_slug, characterId)
    const character = this.stores.characters.update(characterId, input, expectedVersion)
    if (!character) throw new EntityNotFoundError('Character', characterId)
    if (character.project_id !== current.project_id) {
      throw new Error('Character project cannot change')
    }
    return character
  }

  public deleteCharacter(projectId: string, characterId: string, expectedVersion?: number): void {
    this.getCharacter(projectId, characterId)
    if (!this.stores.characters.delete(characterId, expectedVersion)) {
      throw new EntityNotFoundError('Character', characterId)
    }
  }

  public mapCrushToCharacter(input: MapCrushToCharacterCommand): Character {
    this.requireProject(input.project_id)
    if (!this.crushSource) throw new Error('Crush source is not configured')
    const snapshot = this.crushSource.getBySlug(input.crush_slug)
    if (!snapshot) throw new EntityNotFoundError('Crush', input.crush_slug)

    const existing = input.character_id
      ? this.getCharacter(input.project_id, input.character_id)
      : this.stores.characters.getByCrushSlug(input.project_id, input.crush_slug)
    const profile = this.buildCrushProfile(snapshot)
    const update: UpdateCharacterInput = {
      name: snapshot.meta.nickname || snapshot.meta.name,
      role: input.role ?? 'crush',
      crush_slug: snapshot.meta.slug,
      profile,
      notes: snapshot.meta.description,
    }
    if (existing) {
      return this.updateCharacter(
        input.project_id,
        existing.id,
        update,
        input.expected_version,
      )
    }
    return this.createCharacter({
      project_id: input.project_id,
      name: update.name ?? snapshot.meta.name,
      role: update.role,
      crush_slug: snapshot.meta.slug,
      profile,
      notes: update.notes,
    })
  }

  public createWorldviewEntry(input: CreateWorldviewEntryInput): WorldviewEntry {
    this.requireProject(input.project_id)
    return this.stores.worldviewEntries.create(input)
  }

  public listWorldviewEntries(projectId: string): WorldviewEntry[] {
    this.requireProject(projectId)
    return this.stores.worldviewEntries.listByProject(projectId)
  }

  public getWorldviewEntry(projectId: string, entryId: string): WorldviewEntry {
    const entry = this.requireEntity(
      this.stores.worldviewEntries.getById(entryId),
      'Worldview entry',
      entryId,
    )
    this.assertProjectOwnership(entry.project_id, projectId)
    return entry
  }

  public updateWorldviewEntry(
    projectId: string,
    entryId: string,
    input: UpdateWorldviewEntryInput,
    expectedVersion?: number,
  ): WorldviewEntry {
    this.getWorldviewEntry(projectId, entryId)
    const entry = this.stores.worldviewEntries.update(entryId, input, expectedVersion)
    if (!entry) throw new EntityNotFoundError('Worldview entry', entryId)
    return entry
  }

  public deleteWorldviewEntry(projectId: string, entryId: string, expectedVersion?: number): void {
    this.getWorldviewEntry(projectId, entryId)
    if (!this.stores.worldviewEntries.delete(entryId, expectedVersion)) {
      throw new EntityNotFoundError('Worldview entry', entryId)
    }
  }

  public createOrganization(input: CreateOrganizationInput): Organization {
    this.requireProject(input.project_id)
    return this.stores.organizations.create(input)
  }

  public listOrganizations(projectId: string): Organization[] {
    this.requireProject(projectId)
    return this.stores.organizations.listByProject(projectId)
  }

  public getOrganization(projectId: string, organizationId: string): Organization {
    const organization = this.requireEntity(
      this.stores.organizations.getById(organizationId),
      'Organization',
      organizationId,
    )
    this.assertProjectOwnership(organization.project_id, projectId)
    return organization
  }

  public updateOrganization(
    projectId: string,
    organizationId: string,
    input: UpdateOrganizationInput,
    expectedVersion?: number,
  ): Organization {
    this.getOrganization(projectId, organizationId)
    const organization = this.stores.organizations.update(organizationId, input, expectedVersion)
    if (!organization) throw new EntityNotFoundError('Organization', organizationId)
    return organization
  }

  public deleteOrganization(
    projectId: string,
    organizationId: string,
    expectedVersion?: number,
  ): void {
    this.getOrganization(projectId, organizationId)
    if (!this.stores.organizations.delete(organizationId, expectedVersion)) {
      throw new EntityNotFoundError('Organization', organizationId)
    }
  }

  public createRelation(input: CreateRelationInput): Relation {
    this.requireProject(input.project_id)
    return this.stores.relations.create(input)
  }

  public listRelations(projectId: string): Relation[] {
    this.requireProject(projectId)
    return this.stores.relations.listByProject(projectId)
  }

  public getRelation(projectId: string, relationId: string): Relation {
    const relation = this.requireEntity(
      this.stores.relations.getById(relationId),
      'Relation',
      relationId,
    )
    this.assertProjectOwnership(relation.project_id, projectId)
    return relation
  }

  public updateRelation(
    projectId: string,
    relationId: string,
    input: UpdateRelationInput,
    expectedVersion?: number,
  ): Relation {
    this.getRelation(projectId, relationId)
    const relation = this.stores.relations.update(relationId, input, expectedVersion)
    if (!relation) throw new EntityNotFoundError('Relation', relationId)
    return relation
  }

  public deleteRelation(projectId: string, relationId: string, expectedVersion?: number): void {
    this.getRelation(projectId, relationId)
    if (!this.stores.relations.delete(relationId, expectedVersion)) {
      throw new EntityNotFoundError('Relation', relationId)
    }
  }

  public createSourceMaterial(input: CreateSourceMaterialInput): SourceMaterial {
    this.requireProject(input.project_id)
    this.assertOptionalCharacterOwnership(input.project_id, input.character_id)
    return this.stores.sourceMaterials.create(input)
  }

  public listSourceMaterials(
    projectId: string,
    options: SourceMaterialListOptions = {},
  ): SourceMaterial[] {
    this.requireProject(projectId)
    return this.stores.sourceMaterials.listByProject(projectId, options)
  }

  public getSourceMaterial(projectId: string, materialId: string): SourceMaterial {
    const material = this.requireEntity(
      this.stores.sourceMaterials.getById(materialId),
      'Source material',
      materialId,
    )
    this.assertProjectOwnership(material.project_id, projectId)
    return material
  }

  public updateSourceMaterial(
    projectId: string,
    materialId: string,
    input: UpdateSourceMaterialInput,
    expectedVersion?: number,
  ): SourceMaterial {
    this.getSourceMaterial(projectId, materialId)
    this.assertOptionalCharacterOwnership(projectId, input.character_id)
    const material = this.stores.sourceMaterials.update(materialId, input, expectedVersion)
    if (!material) throw new EntityNotFoundError('Source material', materialId)
    return material
  }

  public deleteSourceMaterial(
    projectId: string,
    materialId: string,
    expectedVersion?: number,
  ): void {
    this.getSourceMaterial(projectId, materialId)
    if (!this.stores.sourceMaterials.delete(materialId, expectedVersion)) {
      throw new EntityNotFoundError('Source material', materialId)
    }
  }

  public createSourceMaterialFromFragment(
    input: CreateSourceMaterialFromFragmentCommand,
  ): SourceMaterial {
    this.requireProject(input.project_id)
    if (!this.legacyFragmentSource) throw new Error('Legacy fragment source is not configured')
    const fragment = this.legacyFragmentSource.getById(input.fragment_id)
    if (!fragment) throw new EntityNotFoundError('Fragment', input.fragment_id)
    if (
      fragment.source_project_id !== undefined
      && fragment.source_project_id !== input.project_id
    ) {
      throw new Error('SQLite fragment must be imported into its original project')
    }
    const existing = this.stores.sourceMaterials.getByFragmentId(
      input.project_id,
      input.fragment_id,
    )
    if (existing) return existing

    const mappedCharacterId =
      input.character_id === undefined
        ? fragment.crush_slug
          ? this.stores.characters.getByCrushSlug(input.project_id, fragment.crush_slug)?.id ?? null
          : null
        : input.character_id
    this.assertOptionalCharacterOwnership(input.project_id, mappedCharacterId)
    return this.createSourceMaterial({
      project_id: input.project_id,
      character_id: mappedCharacterId,
      fragment_id: input.fragment_id,
      title: input.title ?? `Fragment ${fragment.date}`,
      material_type: 'fragment',
      content: fragment.content,
      metadata: this.buildFragmentMetadata(fragment),
    })
  }

  public selectSourceMaterialsForPrompt(
    projectId: string,
    materialIds: readonly string[],
  ): SourceMaterial[] {
    this.requireProject(projectId)
    const selected: SourceMaterial[] = []
    const seen = new Set<string>()
    for (const materialId of materialIds) {
      if (seen.has(materialId)) continue
      seen.add(materialId)
      selected.push(this.getSourceMaterial(projectId, materialId))
    }
    return selected
  }

  public selectMaterialsForPrompt(
    projectId: string,
    materialIds: readonly string[],
  ): SourceMaterial[] {
    return this.selectSourceMaterialsForPrompt(projectId, materialIds)
  }

  public createVolume(input: CreateVolumeInput): Volume {
    this.requireProject(input.project_id)
    return this.requireOutlineStores().volumes.create(input)
  }

  public listVolumes(projectId: string): Volume[] {
    this.requireProject(projectId)
    return this.requireOutlineStores().volumes.listByProject(projectId)
  }

  public getVolume(projectId: string, volumeId: string): Volume {
    const volume = this.requireEntity(
      this.requireOutlineStores().volumes.getById(volumeId),
      'Volume',
      volumeId,
    )
    this.assertProjectOwnership(volume.project_id, projectId)
    return volume
  }

  public updateVolume(
    projectId: string,
    volumeId: string,
    input: UpdateVolumeInput,
    expectedVersion?: number,
  ): Volume {
    this.getVolume(projectId, volumeId)
    const volume = this.requireOutlineStores().volumes.update(volumeId, input, expectedVersion)
    if (!volume) throw new EntityNotFoundError('Volume', volumeId)
    return volume
  }

  public deleteVolume(projectId: string, volumeId: string, expectedVersion?: number): void {
    this.getVolume(projectId, volumeId)
    if (!this.requireOutlineStores().volumes.delete(volumeId, expectedVersion)) {
      throw new EntityNotFoundError('Volume', volumeId)
    }
  }

  public createVolumeOutline(input: CreateVolumeOutlineInput): VolumeOutline {
    this.getVolume(input.project_id, input.volume_id)
    const sourceMaterialIds = this.selectSourceMaterialsForPrompt(
      input.project_id,
      input.source_material_ids ?? [],
    ).map((material) => material.id)
    return this.requireOutlineStores().volumeOutlines.create({
      ...input,
      source_material_ids: sourceMaterialIds,
    })
  }

  public listVolumeOutlines(projectId: string): VolumeOutline[] {
    this.requireProject(projectId)
    return this.requireOutlineStores().volumeOutlines.listByProject(projectId)
  }

  public getVolumeOutline(projectId: string, outlineId: string): VolumeOutline {
    const outline = this.requireEntity(
      this.requireOutlineStores().volumeOutlines.getById(outlineId),
      'Volume outline',
      outlineId,
    )
    this.assertProjectOwnership(outline.project_id, projectId)
    this.getVolume(projectId, outline.volume_id)
    return outline
  }

  public getVolumeOutlineByVolume(projectId: string, volumeId: string): VolumeOutline | null {
    this.getVolume(projectId, volumeId)
    const outline = this.requireOutlineStores().volumeOutlines.getByVolumeId(volumeId)
    if (outline) this.assertProjectOwnership(outline.project_id, projectId)
    return outline
  }

  public updateVolumeOutline(
    projectId: string,
    outlineId: string,
    input: UpdateVolumeOutlineInput,
    expectedVersion?: number,
  ): VolumeOutline {
    this.getVolumeOutline(projectId, outlineId)
    const sourceMaterialIds = input.source_material_ids === undefined
      ? undefined
      : this.selectSourceMaterialsForPrompt(projectId, input.source_material_ids).map(
          (material) => material.id,
        )
    const outline = this.requireOutlineStores().volumeOutlines.update(
      outlineId,
      { ...input, source_material_ids: sourceMaterialIds },
      expectedVersion,
    )
    if (!outline) throw new EntityNotFoundError('Volume outline', outlineId)
    return outline
  }

  public deleteVolumeOutline(projectId: string, outlineId: string, expectedVersion?: number): void {
    this.getVolumeOutline(projectId, outlineId)
    if (!this.requireOutlineStores().volumeOutlines.delete(outlineId, expectedVersion)) {
      throw new EntityNotFoundError('Volume outline', outlineId)
    }
  }

  public confirmVolumeOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): VolumeOutline {
    return this.changeVolumeOutlineStatus(projectId, outlineId, 'confirmed', expectedVersion)
  }

  public lockVolumeOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): VolumeOutline {
    return this.changeVolumeOutlineStatus(projectId, outlineId, 'locked', expectedVersion)
  }

  public unlockVolumeOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): VolumeOutline {
    return this.changeVolumeOutlineStatus(projectId, outlineId, 'draft', expectedVersion)
  }

  public createChapterOutline(input: CreateChapterOutlineInput): ChapterOutline {
    this.getVolume(input.project_id, input.volume_id)
    const sourceMaterialIds = this.selectSourceMaterialsForPrompt(
      input.project_id,
      input.source_material_ids ?? [],
    ).map((material) => material.id)
    return this.requireOutlineStores().chapterOutlines.create({
      ...input,
      source_material_ids: sourceMaterialIds,
    })
  }

  public listChapterOutlines(projectId: string): ChapterOutline[] {
    this.requireProject(projectId)
    return this.requireOutlineStores().chapterOutlines.listByProject(projectId)
  }

  public listChapterOutlinesByVolume(projectId: string, volumeId: string): ChapterOutline[] {
    this.getVolume(projectId, volumeId)
    return this.requireOutlineStores().chapterOutlines.listByVolume(volumeId)
  }

  public getChapterOutline(projectId: string, outlineId: string): ChapterOutline {
    const outline = this.requireEntity(
      this.requireOutlineStores().chapterOutlines.getById(outlineId),
      'Chapter outline',
      outlineId,
    )
    this.assertProjectOwnership(outline.project_id, projectId)
    this.getVolume(projectId, outline.volume_id)
    return outline
  }

  public updateChapterOutline(
    projectId: string,
    outlineId: string,
    input: UpdateChapterOutlineInput,
    expectedVersion?: number,
  ): ChapterOutline {
    const current = this.getChapterOutline(projectId, outlineId)
    if (input.volume_id !== undefined) this.getVolume(projectId, input.volume_id)
    const sourceMaterialIds = input.source_material_ids === undefined
      ? undefined
      : this.selectSourceMaterialsForPrompt(projectId, input.source_material_ids).map(
          (material) => material.id,
        )
    const outline = this.requireOutlineStores().chapterOutlines.update(
      outlineId,
      { ...input, source_material_ids: sourceMaterialIds },
      expectedVersion,
    )
    if (!outline) throw new EntityNotFoundError('Chapter outline', outlineId)
    if (outline.project_id !== current.project_id) {
      throw new Error('Chapter outline project cannot change')
    }
    return outline
  }

  public deleteChapterOutline(projectId: string, outlineId: string, expectedVersion?: number): void {
    this.getChapterOutline(projectId, outlineId)
    if (!this.requireOutlineStores().chapterOutlines.delete(outlineId, expectedVersion)) {
      throw new EntityNotFoundError('Chapter outline', outlineId)
    }
  }

  public confirmChapterOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): ChapterOutline {
    return this.changeChapterOutlineStatus(projectId, outlineId, 'confirmed', expectedVersion)
  }

  public lockChapterOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): ChapterOutline {
    return this.changeChapterOutlineStatus(projectId, outlineId, 'locked', expectedVersion)
  }

  public unlockChapterOutline(
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): ChapterOutline {
    return this.changeChapterOutlineStatus(projectId, outlineId, 'draft', expectedVersion)
  }

  public getOutlineContext(
    projectId: string,
    sourceMaterialIds: readonly string[] = [],
  ): OutlineContext {
    const project = this.requireProject(projectId)
    const sourceMaterials = this.listSourceMaterials(projectId)
    return {
      project,
      config: this.getProjectConfig(projectId),
      characters: this.listCharacters(projectId),
      worldview_entries: this.listWorldviewEntries(projectId),
      organizations: this.listOrganizations(projectId),
      relations: this.listRelations(projectId),
      source_materials: sourceMaterials,
      selected_source_materials: this.selectSourceMaterialsForPrompt(projectId, sourceMaterialIds),
    }
  }

  public selectOutlineSourceMaterials(
    projectId: string,
    materialIds: readonly string[],
  ): SourceMaterial[] {
    return this.selectSourceMaterialsForPrompt(projectId, materialIds)
  }

  private changeVolumeOutlineStatus(
    projectId: string,
    outlineId: string,
    status: OutlineStatus,
    expectedVersion: number | undefined,
  ): VolumeOutline {
    this.getVolumeOutline(projectId, outlineId)
    const outline = this.requireOutlineStores().volumeOutlines.setStatus(
      outlineId,
      status,
      expectedVersion,
    )
    if (!outline) throw new EntityNotFoundError('Volume outline', outlineId)
    return outline
  }

  private changeChapterOutlineStatus(
    projectId: string,
    outlineId: string,
    status: OutlineStatus,
    expectedVersion: number | undefined,
  ): ChapterOutline {
    this.getChapterOutline(projectId, outlineId)
    const outline = this.requireOutlineStores().chapterOutlines.setStatus(
      outlineId,
      status,
      expectedVersion,
    )
    if (!outline) throw new EntityNotFoundError('Chapter outline', outlineId)
    return outline
  }

  private requireOutlineStores(): OutlineStores {
    if (!this.stores.outline) throw new OutlineStoreNotConfiguredError()
    return this.stores.outline
  }

  private requireProject(projectId: string): Project {
    return this.requireEntity(this.stores.projects.getById(projectId), 'Project', projectId)
  }

  private assertProjectOwnership(actualProjectId: string, expectedProjectId: string): void {
    if (actualProjectId !== expectedProjectId) {
      throw new EntityNotFoundError('Entity in project', expectedProjectId)
    }
  }

  private assertOptionalCharacterOwnership(projectId: string, characterId?: string | null): void {
    if (characterId === undefined || characterId === null) return
    this.getCharacter(projectId, characterId)
  }

  private assertCharacterCrushSlugAvailable(
    projectId: string,
    crushSlug: string | null | undefined,
    currentCharacterId: string | undefined,
  ): void {
    if (crushSlug === undefined || crushSlug === null) return
    const existing = this.stores.characters.getByCrushSlug(projectId, crushSlug)
    if (existing && existing.id !== currentCharacterId) {
      throw new Error(`Crush is already mapped to character: ${crushSlug}`)
    }
  }

  private requireEntity<T>(entity: T | null, name: string, id: string): T {
    if (!entity) throw new EntityNotFoundError(name, id)
    return entity
  }

  private buildCrushProfile(snapshot: {
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
  }): JsonObject {
    const profile: JsonObject = {
      source: 'crush',
      name: snapshot.meta.name,
      nickname: snapshot.meta.nickname,
      slug: snapshot.meta.slug,
      gender: snapshot.meta.gender,
      description: snapshot.meta.description,
      intimate_enabled: snapshot.meta.intimate_enabled,
      persona: snapshot.context.persona,
      memory: snapshot.context.memory,
      weekday: snapshot.context.weekday,
      context_summary: snapshot.context.contextSummary,
      intimate_enabled_in_context: snapshot.context.intimateEnabled,
    }
    if (
      snapshot.meta.intimate_enabled &&
      snapshot.context.intimateEnabled &&
      snapshot.context.intimateKnowledge !== null
    ) {
      profile.intimate_knowledge = snapshot.context.intimateKnowledge
    }
    return profile
  }

  private buildFragmentMetadata(fragment: LegacyFragmentSnapshot): JsonObject {
    return {
      source: fragment.source,
      source_project_id: fragment.source_project_id ?? null,
      date: fragment.date,
      time: fragment.time,
      origin: fragment.origin,
      mood: fragment.mood,
      env_tags: fragment.env_tags,
      behavior_tags: fragment.behavior_tags,
      custom_tags: fragment.custom_tags,
      writing_mode: fragment.writing_mode,
      theme: fragment.theme,
      crush_slug: fragment.crush_slug,
    }
  }
}

export type { VersionConflictError, CurrentProjectDeletionError }
