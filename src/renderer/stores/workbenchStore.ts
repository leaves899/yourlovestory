import { create } from 'zustand'
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
} from '../../shared/novelProject'
import workbenchService from '../services/workbenchService'

interface WorkbenchState {
  projects: Project[]
  currentProject: Project | null
  config: ProjectConfig | null
  volumes: Volume[]
  volumeOutlines: VolumeOutline[]
  chapterOutlines: ChapterOutline[]
  characters: Character[]
  worldviewEntries: WorldviewEntry[]
  organizations: Organization[]
  relations: Relation[]
  sourceMaterials: SourceMaterial[]
  legacyCrushes: LegacyCrushSnapshot[]
  legacyFragments: LegacyFragmentSnapshot[]
  loading: boolean
  saving: boolean
  error: string | null
  initialized: boolean
  dirty: boolean
  pendingProjectId: string | null
  initialize: () => Promise<void>
  refreshProjectData: (projectId?: string) => Promise<void>
  selectProject: (projectId: string, force?: boolean) => Promise<boolean>
  confirmPendingProjectSwitch: () => Promise<boolean>
  cancelPendingProjectSwitch: () => void
  createProject: (input: CreateProjectCommand) => Promise<Project>
  updateProject: (input: UpdateProjectInput) => Promise<Project>
  deleteProject: (projectId: string) => Promise<void>
  saveConfig: (input: UpdateProjectConfigInput) => Promise<ProjectConfig>
  markDirty: () => void
  clearDirty: () => void
  createVolume: (input: Omit<CreateVolumeInput, 'project_id'>) => Promise<Volume>
  updateVolume: (volumeId: string, input: UpdateVolumeInput) => Promise<Volume>
  deleteVolume: (volumeId: string) => Promise<void>
  createVolumeOutline: (input: Omit<CreateVolumeOutlineInput, 'project_id'>) => Promise<VolumeOutline>
  updateVolumeOutline: (outlineId: string, input: UpdateVolumeOutlineInput) => Promise<VolumeOutline>
  confirmVolumeOutline: (outlineId: string) => Promise<VolumeOutline>
  lockVolumeOutline: (outlineId: string) => Promise<VolumeOutline>
  unlockVolumeOutline: (outlineId: string) => Promise<VolumeOutline>
  createChapterOutline: (input: Omit<CreateChapterOutlineInput, 'project_id'>) => Promise<ChapterOutline>
  updateChapterOutline: (outlineId: string, input: UpdateChapterOutlineInput) => Promise<ChapterOutline>
  deleteChapterOutline: (outlineId: string) => Promise<void>
  confirmChapterOutline: (outlineId: string) => Promise<ChapterOutline>
  lockChapterOutline: (outlineId: string) => Promise<ChapterOutline>
  unlockChapterOutline: (outlineId: string) => Promise<ChapterOutline>
  createCharacter: (input: Omit<CreateCharacterInput, 'project_id'>) => Promise<Character>
  updateCharacter: (characterId: string, input: UpdateCharacterInput) => Promise<Character>
  deleteCharacter: (characterId: string) => Promise<void>
  createWorldviewEntry: (input: Omit<CreateWorldviewEntryInput, 'project_id'>) => Promise<WorldviewEntry>
  updateWorldviewEntry: (entryId: string, input: UpdateWorldviewEntryInput) => Promise<WorldviewEntry>
  deleteWorldviewEntry: (entryId: string) => Promise<void>
  createOrganization: (input: Omit<CreateOrganizationInput, 'project_id'>) => Promise<Organization>
  updateOrganization: (organizationId: string, input: UpdateOrganizationInput) => Promise<Organization>
  deleteOrganization: (organizationId: string) => Promise<void>
  createRelation: (input: Omit<CreateRelationInput, 'project_id'>) => Promise<Relation>
  updateRelation: (relationId: string, input: UpdateRelationInput) => Promise<Relation>
  deleteRelation: (relationId: string) => Promise<void>
  createSourceMaterial: (input: Omit<CreateSourceMaterialInput, 'project_id'>) => Promise<SourceMaterial>
  updateSourceMaterial: (materialId: string, input: UpdateSourceMaterialInput) => Promise<SourceMaterial>
  deleteSourceMaterial: (materialId: string) => Promise<void>
  loadLegacyImportPreview: () => Promise<void>
  importLegacyCrush: (crushSlug: string, role?: string) => Promise<Character>
  importLegacyFragment: (
    fragmentId: string,
    characterId?: string | null,
    title?: string,
  ) => Promise<SourceMaterial>
}

function readError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '工作台操作失败'
}

function currentId(state: WorkbenchState): string {
  if (!state.currentProject) throw new Error('请先选择一个创作项目')
  return state.currentProject.id
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => {
  const refreshProjectData = async (projectId?: string): Promise<void> => {
    const id = projectId ?? get().currentProject?.id
    if (!id) {
      set({
        config: null,
        volumes: [],
        volumeOutlines: [],
        chapterOutlines: [],
        characters: [],
        worldviewEntries: [],
        organizations: [],
        relations: [],
        sourceMaterials: [],
      })
      return
    }
    set({ loading: true, error: null })
    try {
      const [config, volumes, volumeOutlines, chapterOutlines, characters, worldviewEntries, organizations, relations, sourceMaterials] = await Promise.all([
        workbenchService.getConfig(id),
        workbenchService.listVolumes(id),
        workbenchService.listVolumeOutlines(id),
        workbenchService.listChapterOutlines(id),
        workbenchService.listCharacters(id),
        workbenchService.listWorldviewEntries(id),
        workbenchService.listOrganizations(id),
        workbenchService.listRelations(id),
        workbenchService.listSourceMaterials(id),
      ])
      set({
        config,
        volumes,
        volumeOutlines,
        chapterOutlines,
        characters,
        worldviewEntries,
        organizations,
        relations,
        sourceMaterials,
        loading: false,
        error: null,
      })
    } catch (error) {
      set({ loading: false, error: readError(error) })
    }
  }

  const mutate = async <T>(operation: () => Promise<T>, refresh = true): Promise<T> => {
    set({ saving: true, error: null })
    try {
      const result = await operation()
      if (refresh) await refreshProjectData()
      set({ saving: false, dirty: false })
      return result
    } catch (error) {
      set({ saving: false, error: readError(error) })
      throw error
    }
  }

  return {
    projects: [],
    currentProject: null,
    config: null,
    volumes: [],
    volumeOutlines: [],
    chapterOutlines: [],
    characters: [],
    worldviewEntries: [],
    organizations: [],
    relations: [],
    sourceMaterials: [],
    legacyCrushes: [],
    legacyFragments: [],
    loading: false,
    saving: false,
    error: null,
    initialized: false,
    dirty: false,
    pendingProjectId: null,

    initialize: async () => {
      if (get().initialized && get().currentProject && !get().error) return
      set({ loading: true, error: null })
      try {
        const [projects, current] = await Promise.all([
          workbenchService.listProjects(),
          workbenchService.getCurrentProject(),
        ])
        const preferred = current ?? projects[0] ?? null
        set({ projects, currentProject: preferred, initialized: true, loading: false })
        if (preferred) await refreshProjectData(preferred.id)
      } catch (error) {
        set({ loading: false, initialized: true, error: readError(error) })
      }
    },

    refreshProjectData,

    selectProject: async (projectId, force = false) => {
      if (!projectId) return false
      if (!force && get().dirty && get().currentProject?.id !== projectId) {
        set({ pendingProjectId: projectId })
        return false
      }
      set({ loading: true, error: null })
      try {
        const project = get().currentProject?.id === projectId
          ? get().currentProject
          : await workbenchService.selectProject(projectId)
        if (!project) throw new Error('项目不存在')
        const projects = get().projects.some((item) => item.id === project.id)
          ? get().projects.map((item) => (item.id === project.id ? project : item))
          : get().projects
        set({ currentProject: project, projects, pendingProjectId: null, dirty: false, loading: false })
        await refreshProjectData(project.id)
        return true
      } catch (error) {
        set({ loading: false, error: readError(error) })
        return false
      }
    },

    confirmPendingProjectSwitch: async () => {
      const projectId = get().pendingProjectId
      if (!projectId) return false
      return get().selectProject(projectId, true)
    },

    cancelPendingProjectSwitch: () => set({ pendingProjectId: null }),

    createProject: async (input) => {
      const project = await mutate(() => workbenchService.createProject({ ...input, select_after_create: true }), false)
      const projects = await workbenchService.listProjects()
      set({ projects, currentProject: project, dirty: false })
      await refreshProjectData(project.id)
      return project
    },

    updateProject: async (input) => {
      const state = get()
      const projectId = currentId(state)
      return mutate(() => workbenchService.updateProject(projectId, input, state.currentProject?.version))
    },

    deleteProject: async (projectId) => {
      const project = get().projects.find((item) => item.id === projectId)
      if (projectId === get().currentProject?.id) throw new Error('当前项目不能直接删除，请先切换项目')
      await mutate(() => workbenchService.deleteProject(projectId, project?.version), false)
      const projects = await workbenchService.listProjects()
      set({ projects, error: null })
    },

    saveConfig: async (input) => {
      const state = get()
      const projectId = currentId(state)
      return mutate(() => workbenchService.updateConfig(projectId, input, state.config?.version))
    },

    markDirty: () => set({ dirty: true }),
    clearDirty: () => set({ dirty: false }),

    createVolume: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createVolume({ ...input, project_id: projectId }))
    },
    updateVolume: async (volumeId, input) => {
      const item = get().volumes.find((volume) => volume.id === volumeId)
      return mutate(() => workbenchService.updateVolume(currentId(get()), volumeId, input, item?.version))
    },
    deleteVolume: async (volumeId) => {
      const item = get().volumes.find((volume) => volume.id === volumeId)
      return mutate(() => workbenchService.deleteVolume(currentId(get()), volumeId, item?.version))
    },
    createVolumeOutline: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createVolumeOutline({ ...input, project_id: projectId }))
    },
    updateVolumeOutline: async (outlineId, input) => {
      const item = get().volumeOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.updateVolumeOutline(currentId(get()), outlineId, input, item?.version))
    },
    confirmVolumeOutline: async (outlineId) => {
      const item = get().volumeOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.confirmVolumeOutline(currentId(get()), outlineId, item?.version))
    },
    lockVolumeOutline: async (outlineId) => {
      const item = get().volumeOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.lockVolumeOutline(currentId(get()), outlineId, item?.version))
    },
    unlockVolumeOutline: async (outlineId) => {
      const item = get().volumeOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.unlockVolumeOutline(currentId(get()), outlineId, item?.version))
    },
    createChapterOutline: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createChapterOutline({ ...input, project_id: projectId }))
    },
    updateChapterOutline: async (outlineId, input) => {
      const item = get().chapterOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.updateChapterOutline(currentId(get()), outlineId, input, item?.version))
    },
    deleteChapterOutline: async (outlineId) => {
      const item = get().chapterOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.deleteChapterOutline(currentId(get()), outlineId, item?.version))
    },
    confirmChapterOutline: async (outlineId) => {
      const item = get().chapterOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.confirmChapterOutline(currentId(get()), outlineId, item?.version))
    },
    lockChapterOutline: async (outlineId) => {
      const item = get().chapterOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.lockChapterOutline(currentId(get()), outlineId, item?.version))
    },
    unlockChapterOutline: async (outlineId) => {
      const item = get().chapterOutlines.find((outline) => outline.id === outlineId)
      return mutate(() => workbenchService.unlockChapterOutline(currentId(get()), outlineId, item?.version))
    },
    createCharacter: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createCharacter({ ...input, project_id: projectId }))
    },
    updateCharacter: async (characterId, input) => {
      const item = get().characters.find((character) => character.id === characterId)
      return mutate(() => workbenchService.updateCharacter(currentId(get()), characterId, input, item?.version))
    },
    deleteCharacter: async (characterId) => {
      const item = get().characters.find((character) => character.id === characterId)
      return mutate(() => workbenchService.deleteCharacter(currentId(get()), characterId, item?.version))
    },
    createWorldviewEntry: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createWorldviewEntry({ ...input, project_id: projectId }))
    },
    updateWorldviewEntry: async (entryId, input) => {
      const item = get().worldviewEntries.find((entry) => entry.id === entryId)
      return mutate(() => workbenchService.updateWorldviewEntry(currentId(get()), entryId, input, item?.version))
    },
    deleteWorldviewEntry: async (entryId) => {
      const item = get().worldviewEntries.find((entry) => entry.id === entryId)
      return mutate(() => workbenchService.deleteWorldviewEntry(currentId(get()), entryId, item?.version))
    },
    createOrganization: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createOrganization({ ...input, project_id: projectId }))
    },
    updateOrganization: async (organizationId, input) => {
      const item = get().organizations.find((organization) => organization.id === organizationId)
      return mutate(() => workbenchService.updateOrganization(currentId(get()), organizationId, input, item?.version))
    },
    deleteOrganization: async (organizationId) => {
      const item = get().organizations.find((organization) => organization.id === organizationId)
      return mutate(() => workbenchService.deleteOrganization(currentId(get()), organizationId, item?.version))
    },
    createRelation: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createRelation({ ...input, project_id: projectId }))
    },
    updateRelation: async (relationId, input) => {
      const item = get().relations.find((relation) => relation.id === relationId)
      return mutate(() => workbenchService.updateRelation(currentId(get()), relationId, input, item?.version))
    },
    deleteRelation: async (relationId) => {
      const item = get().relations.find((relation) => relation.id === relationId)
      return mutate(() => workbenchService.deleteRelation(currentId(get()), relationId, item?.version))
    },
    createSourceMaterial: async (input) => {
      const projectId = currentId(get())
      return mutate(() => workbenchService.createSourceMaterial({ ...input, project_id: projectId }))
    },
    updateSourceMaterial: async (materialId, input) => {
      const item = get().sourceMaterials.find((material) => material.id === materialId)
      return mutate(() => workbenchService.updateSourceMaterial(currentId(get()), materialId, input, item?.version))
    },
    deleteSourceMaterial: async (materialId) => {
      const item = get().sourceMaterials.find((material) => material.id === materialId)
      return mutate(() => workbenchService.deleteSourceMaterial(currentId(get()), materialId, item?.version))
    },

    loadLegacyImportPreview: async () => {
      set({ loading: true, error: null })
      try {
        const [legacyCrushes, legacyFragments] = await Promise.all([
          workbenchService.listLegacyCrushes(),
          workbenchService.listLegacyFragments(get().currentProject?.id),
        ])
        set({ legacyCrushes, legacyFragments, loading: false })
      } catch (error) {
        set({ loading: false, error: readError(error) })
      }
    },

    importLegacyCrush: async (crushSlug, role = 'crush') => {
      const projectId = currentId(get())
      return mutate(() =>
        workbenchService.mapCrushToCharacter({
          project_id: projectId,
          crush_slug: crushSlug,
          role,
        }),
      )
    },

    importLegacyFragment: async (fragmentId, characterId, title) => {
      const projectId = currentId(get())
      return mutate(() =>
        workbenchService.createSourceMaterialFromFragment({
          project_id: projectId,
          fragment_id: fragmentId,
          character_id: characterId,
          title,
        }),
      )
    },
  }
})

export type { WorkbenchState }
