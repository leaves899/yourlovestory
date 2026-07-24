import type {
  ChapterOutline,
  Character,
  LegacyCrushSnapshot,
  LegacyFragmentSnapshot,
  CreateChapterOutlineInput,
  CreateCharacterInput,
  CreateOrganizationInput,
  CreateProjectCommand,
  CreateRelationInput,
  CreateSourceMaterialInput,
  CreateVolumeInput,
  CreateVolumeOutlineInput,
  CreateWorldviewEntryInput,
  Organization,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
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
  MapCrushToCharacterCommand,
  CreateSourceMaterialFromFragmentCommand,
} from '../../shared/novelProject'

interface ApiResponse<T> {
  success: boolean
  data?: T
  errors?: string[]
}

export class WorkbenchRequestError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'WorkbenchRequestError'
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '工作台请求失败'
}

async function unwrap<T>(request: () => Promise<ApiResponse<T>>): Promise<T> {
  try {
    const response = await request()
    if (!response.success || response.data === undefined) {
      throw new WorkbenchRequestError(response.errors?.[0] ?? '工作台请求失败')
    }
    return response.data
  } catch (error) {
    if (error instanceof WorkbenchRequestError) throw error
    throw new WorkbenchRequestError(errorMessage(error))
  }
}

async function complete(request: () => Promise<ApiResponse<unknown>>): Promise<void> {
  try {
    const response = await request()
    if (!response.success) {
      throw new WorkbenchRequestError(response.errors?.[0] ?? '工作台操作失败')
    }
  } catch (error) {
    if (error instanceof WorkbenchRequestError) throw error
    throw new WorkbenchRequestError(errorMessage(error))
  }
}

const workbenchService = {
  listProjects: (): Promise<Project[]> => unwrap(() => window.electronAPI.listNovelProjects()),
  getCurrentProject: (): Promise<Project | null> =>
    unwrap(() => window.electronAPI.getCurrentNovelProject()),
  listLegacyCrushes: (): Promise<LegacyCrushSnapshot[]> =>
    typeof window.electronAPI.listLegacyCrushes === 'function'
      ? unwrap(() => window.electronAPI.listLegacyCrushes())
      : Promise.resolve([]),
  listLegacyFragments: (projectId?: string): Promise<LegacyFragmentSnapshot[]> =>
    typeof window.electronAPI.listLegacyFragments === 'function'
      ? unwrap(() => window.electronAPI.listLegacyFragments(projectId))
      : Promise.resolve([]),
  createProject: (input: CreateProjectCommand): Promise<Project> =>
    unwrap(() => window.electronAPI.createNovelProject(input)),
  selectProject: (projectId: string): Promise<Project> =>
    unwrap(() => window.electronAPI.selectNovelProject({ project_id: projectId })),
  updateProject: (
    projectId: string,
    input: UpdateProjectInput,
    expectedVersion?: number,
  ): Promise<Project> =>
    unwrap(() =>
      window.electronAPI.updateNovelProject({
        project_id: projectId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteProject: (projectId: string, expectedVersion?: number): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelProject({
        project_id: projectId,
        expected_version: expectedVersion,
      }),
    ),
  getConfig: (projectId: string): Promise<ProjectConfig> =>
    unwrap(() => window.electronAPI.getNovelProjectConfig({ project_id: projectId })),
  updateConfig: (
    projectId: string,
    input: UpdateProjectConfigInput,
    expectedVersion?: number,
  ): Promise<ProjectConfig> =>
    unwrap(() =>
      window.electronAPI.updateNovelProjectConfig({
        project_id: projectId,
        input,
        expected_version: expectedVersion,
      }),
    ),

  listVolumes: (projectId: string): Promise<Volume[]> =>
    unwrap(() => window.electronAPI.listNovelVolumes({ project_id: projectId })),
  createVolume: (input: CreateVolumeInput): Promise<Volume> =>
    unwrap(() => window.electronAPI.createNovelVolume(input)),
  updateVolume: (
    projectId: string,
    volumeId: string,
    input: UpdateVolumeInput,
    expectedVersion?: number,
  ): Promise<Volume> =>
    unwrap(() =>
      window.electronAPI.updateNovelVolume({
        project_id: projectId,
        volume_id: volumeId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteVolume: (projectId: string, volumeId: string, expectedVersion?: number): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelVolume({
        project_id: projectId,
        volume_id: volumeId,
        expected_version: expectedVersion,
      }),
    ),

  listVolumeOutlines: (projectId: string): Promise<VolumeOutline[]> =>
    unwrap(() => window.electronAPI.listNovelVolumeOutlines({ project_id: projectId })),
  createVolumeOutline: (input: CreateVolumeOutlineInput): Promise<VolumeOutline> =>
    unwrap(() => window.electronAPI.createNovelVolumeOutline(input)),
  updateVolumeOutline: (
    projectId: string,
    outlineId: string,
    input: UpdateVolumeOutlineInput,
    expectedVersion?: number,
  ): Promise<VolumeOutline> =>
    unwrap(() =>
      window.electronAPI.updateNovelVolumeOutline({
        project_id: projectId,
        outline_id: outlineId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteVolumeOutline: (
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelVolumeOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  confirmVolumeOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.confirmNovelVolumeOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  lockVolumeOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.lockNovelVolumeOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  unlockVolumeOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.unlockNovelVolumeOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),

  listChapterOutlines: (projectId: string): Promise<ChapterOutline[]> =>
    unwrap(() => window.electronAPI.listNovelChapterOutlines({ project_id: projectId })),
  createChapterOutline: (input: CreateChapterOutlineInput): Promise<ChapterOutline> =>
    unwrap(() => window.electronAPI.createNovelChapterOutline(input)),
  updateChapterOutline: (
    projectId: string,
    outlineId: string,
    input: UpdateChapterOutlineInput,
    expectedVersion?: number,
  ): Promise<ChapterOutline> =>
    unwrap(() =>
      window.electronAPI.updateNovelChapterOutline({
        project_id: projectId,
        outline_id: outlineId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteChapterOutline: (
    projectId: string,
    outlineId: string,
    expectedVersion?: number,
  ): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelChapterOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  confirmChapterOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.confirmNovelChapterOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  lockChapterOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.lockNovelChapterOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),
  unlockChapterOutline: (projectId: string, outlineId: string, expectedVersion?: number) =>
    unwrap(() =>
      window.electronAPI.unlockNovelChapterOutline({
        project_id: projectId,
        outline_id: outlineId,
        expected_version: expectedVersion,
      }),
    ),

  listCharacters: (projectId: string): Promise<Character[]> =>
    unwrap(() => window.electronAPI.listNovelCharacters({ project_id: projectId })),
  createCharacter: (input: CreateCharacterInput): Promise<Character> =>
    unwrap(() => window.electronAPI.createNovelCharacter(input)),
  updateCharacter: (
    projectId: string,
    characterId: string,
    input: UpdateCharacterInput,
    expectedVersion?: number,
  ): Promise<Character> =>
    unwrap(() =>
      window.electronAPI.updateNovelCharacter({
        project_id: projectId,
        character_id: characterId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteCharacter: (projectId: string, characterId: string, expectedVersion?: number): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelCharacter({
        project_id: projectId,
        character_id: characterId,
        expected_version: expectedVersion,
      }),
    ),
  mapCrushToCharacter: (input: MapCrushToCharacterCommand): Promise<Character> =>
    unwrap(() => window.electronAPI.mapCrushToNovelCharacter(input)),

  listWorldviewEntries: (projectId: string): Promise<WorldviewEntry[]> =>
    unwrap(() => window.electronAPI.listNovelWorldviewEntries({ project_id: projectId })),
  createWorldviewEntry: (input: CreateWorldviewEntryInput): Promise<WorldviewEntry> =>
    unwrap(() => window.electronAPI.createNovelWorldviewEntry(input)),
  updateWorldviewEntry: (
    projectId: string,
    entryId: string,
    input: UpdateWorldviewEntryInput,
    expectedVersion?: number,
  ): Promise<WorldviewEntry> =>
    unwrap(() =>
      window.electronAPI.updateNovelWorldviewEntry({
        project_id: projectId,
        entry_id: entryId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteWorldviewEntry: (projectId: string, entryId: string, expectedVersion?: number): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelWorldviewEntry({
        project_id: projectId,
        entry_id: entryId,
        expected_version: expectedVersion,
      }),
    ),

  listOrganizations: (projectId: string): Promise<Organization[]> =>
    unwrap(() => window.electronAPI.listNovelOrganizations({ project_id: projectId })),
  createOrganization: (input: CreateOrganizationInput): Promise<Organization> =>
    unwrap(() => window.electronAPI.createNovelOrganization(input)),
  updateOrganization: (
    projectId: string,
    organizationId: string,
    input: UpdateOrganizationInput,
    expectedVersion?: number,
  ): Promise<Organization> =>
    unwrap(() =>
      window.electronAPI.updateNovelOrganization({
        project_id: projectId,
        organization_id: organizationId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteOrganization: (
    projectId: string,
    organizationId: string,
    expectedVersion?: number,
  ): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelOrganization({
        project_id: projectId,
        organization_id: organizationId,
        expected_version: expectedVersion,
      }),
    ),

  listRelations: (projectId: string): Promise<Relation[]> =>
    unwrap(() => window.electronAPI.listNovelRelations({ project_id: projectId })),
  createRelation: (input: CreateRelationInput): Promise<Relation> =>
    unwrap(() => window.electronAPI.createNovelRelation(input)),
  updateRelation: (
    projectId: string,
    relationId: string,
    input: UpdateRelationInput,
    expectedVersion?: number,
  ): Promise<Relation> =>
    unwrap(() =>
      window.electronAPI.updateNovelRelation({
        project_id: projectId,
        relation_id: relationId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteRelation: (projectId: string, relationId: string, expectedVersion?: number): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteNovelRelation({
        project_id: projectId,
        relation_id: relationId,
        expected_version: expectedVersion,
      }),
    ),

  listSourceMaterials: (projectId: string): Promise<SourceMaterial[]> =>
    unwrap(() => window.electronAPI.listSourceMaterials({ project_id: projectId })),
  createSourceMaterial: (input: CreateSourceMaterialInput): Promise<SourceMaterial> =>
    unwrap(() => window.electronAPI.createSourceMaterial(input)),
  createSourceMaterialFromFragment: (
    input: CreateSourceMaterialFromFragmentCommand,
  ): Promise<SourceMaterial> =>
    unwrap(() => window.electronAPI.createSourceMaterialFromFragment(input)),
  updateSourceMaterial: (
    projectId: string,
    materialId: string,
    input: UpdateSourceMaterialInput,
    expectedVersion?: number,
  ): Promise<SourceMaterial> =>
    unwrap(() =>
      window.electronAPI.updateSourceMaterial({
        project_id: projectId,
        material_id: materialId,
        input,
        expected_version: expectedVersion,
      }),
    ),
  deleteSourceMaterial: (
    projectId: string,
    materialId: string,
    expectedVersion?: number,
  ): Promise<void> =>
    complete(() =>
      window.electronAPI.deleteSourceMaterial({
        project_id: projectId,
        material_id: materialId,
        expected_version: expectedVersion,
      }),
    ),
}

export default workbenchService
