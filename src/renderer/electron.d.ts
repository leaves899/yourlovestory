import type { GenerateDayResponse } from '../shared/day/dayService'
import type { ServiceResponse } from './stores/createCrudStore'
import type {
  StartChapterGenerationInput,
  StartChapterPolishInput,
  StartTaskInput,
} from '../main/tasks'
import type {
  AssistantEvent,
  AssistantPromptInput,
  AssistantPromptResult,
  CreateAssistantSessionInput,
} from '../main/assistant'
import type {
  TaskCheckpointEvent,
  TaskChunkEvent,
  TaskEndEvent,
  TaskErrorEvent,
  TaskReviewEvent,
  TaskStageEvent,
  TaskStartEvent,
} from '../main/tasks'
import type {
  ChapterOutlineByVolumeParams,
  ChapterOutlineDeleteParams,
  ChapterOutlineGetParams,
  ChapterOutlineUpdateParams,
  CharacterDeleteParams,
  CharacterGetParams,
  CharacterUpdateParams,
  OrganizationDeleteParams,
  OrganizationGetParams,
  OrganizationUpdateParams,
  ProjectConfigUpdateParams,
  ProjectDeleteParams,
  ProjectIdParams,
  ProjectUpdateParams,
  RelationDeleteParams,
  RelationGetParams,
  RelationUpdateParams,
  SourceMaterialDeleteParams,
  SourceMaterialGetParams,
  SourceMaterialListParams,
  SourceMaterialSelectionParams,
  SourceMaterialUpdateParams,
  OutlineContextParams,
  OutlineStatusParams,
  VolumeDeleteParams,
  VolumeGetParams,
  VolumeOutlineByVolumeParams,
  VolumeOutlineDeleteParams,
  VolumeOutlineGetParams,
  VolumeOutlineUpdateParams,
  VolumeUpdateParams,
  WorldviewDeleteParams,
  WorldviewGetParams,
  WorldviewUpdateParams,
  WorkbenchResponse,
} from '../main/workbench'
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
  MapCrushToCharacterCommand,
  Organization,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
  OutlineContext,
  Volume,
  VolumeOutline,
  WorldviewEntry,
  LegacyCrushSnapshot,
  LegacyFragmentSnapshot,
} from '../shared/novelProject'
import type { ChapterVersion } from '../shared/chapterGeneration'
import type {
  ChapterBlock,
  ChapterRevision,
  ChapterDiff,
  Foreshadow,
  ForeshadowEvent,
  MemoryExtractionResult,
  NarrativeMemory,
  NarrativeMemoryProposal,
  ProjectSkill,
  ProjectSkillState,
} from '../shared/narrativeWorkbench'
import type {
  RendererAssistantSessionView,
  RendererChatSession,
} from './types/assistant'

interface ElectronAPI {
  // 日常写作
  generateDay: (params: any) => Promise<GenerateDayResponse>
  getDays: (params: any) => Promise<ServiceResponse>
  getDay: (params: any) => Promise<ServiceResponse>
  updateDay: (params: any) => Promise<ServiceResponse>
  deleteDay: (params: any) => Promise<ServiceResponse>

  // 碎片日记
  recordFragment: (params: any) => Promise<any>
  getFragments: (params: any) => Promise<any>
  getFragment: (params: any) => Promise<any>
  updateFragment: (params: any) => Promise<any>
  deleteFragment: (params: any) => Promise<any>
  integrateFragments: (params: any) => Promise<any>

  // 角色管理
  createCrush: (params: any) => Promise<any>
  getCrushes: (params: any) => Promise<any>
  getCrush: (params: any) => Promise<any>
  updateCrush: (params: any) => Promise<any>
  deleteCrush: (params: any) => Promise<any>

  // 关系进度
  relationshipProgress: (slug: string) => Promise<any>
  relationshipDetectSignals: (slug: string, narrativeText: string) => Promise<any>
  relationshipAdvancePhase: (slug: string, reason?: string) => Promise<any>
  relationshipSetPhase: (slug: string, phase: number) => Promise<any>

  // 设置
  getSettings: () => Promise<any>
  updateSettings: (params: any) => Promise<any>

  // 应用
  getAppInfo: () => Promise<any>
  checkUpdate: () => Promise<any>
  quitApp: () => Promise<any>

  // 长篇工作台任务
  startTask: (params: StartTaskInput) => Promise<any>
  cancelTask: (taskId: string) => Promise<any>
  getTask: (taskId: string) => Promise<any>
  listTasks: (projectId: string) => Promise<any>
  resumeTask: (taskId: string) => Promise<any>
  listRecoverableTasks: (projectId: string) => Promise<any>
  onTaskStart: (listener: (event: TaskStartEvent) => void) => () => void
  onTaskStage: (listener: (event: TaskStageEvent) => void) => () => void
  onTaskChunk: (listener: (event: TaskChunkEvent) => void) => () => void
  onTaskCheckpoint: (listener: (event: TaskCheckpointEvent) => void) => () => void
  onTaskReview: (listener: (event: TaskReviewEvent) => void) => () => void
  onTaskEnd: (listener: (event: TaskEndEvent) => void) => () => void
  onTaskError: (listener: (event: TaskErrorEvent) => void) => () => void

  // Agent 助手
  createAssistantSession: (
    params: CreateAssistantSessionInput,
  ) => Promise<{ success: true; data: RendererAssistantSessionView }>
  listAssistantSessions: (
    projectId: string,
  ) => Promise<{ success: true; data: RendererChatSession[] }>
  getAssistantSession: (
    sessionId: string,
  ) => Promise<{ success: true; data: RendererAssistantSessionView }>
  archiveAssistantSession: (
    sessionId: string,
  ) => Promise<{ success: true; data: RendererChatSession }>
  promptAssistant: (
    params: AssistantPromptInput,
  ) => Promise<{ success: true; data: AssistantPromptResult }>
  cancelAssistant: (sessionId: string) => Promise<{ success: boolean }>
  steerAssistant: (sessionId: string, prompt: string) => Promise<{ success: true }>
  followUpAssistant: (sessionId: string, prompt: string) => Promise<{ success: true }>
  confirmAssistantOperation: (
    requestId: string,
    approved: boolean,
  ) => Promise<{ success: boolean }>
  onAssistantEvent: (listener: (event: AssistantEvent) => void) => () => void

  startChapterGeneration: (
    params: StartChapterGenerationInput,
  ) => Promise<{ success: true; data: { taskId: string } }>
  listChapterVersions: (
    projectId: string,
    chapterId: string,
  ) => Promise<{ success: true; data: ChapterVersion[] }>
  getChapterVersion: (
    projectId: string,
    versionId: string,
  ) => Promise<{ success: true; data: ChapterVersion }>
  confirmChapterVersion: (
    projectId: string,
    versionId: string,
  ) => Promise<{ success: true; data: ChapterVersion }>
  rejectChapterVersion: (
    projectId: string,
    versionId: string,
  ) => Promise<{ success: true; data: ChapterVersion }>

  startChapterPolish: (
    params: StartChapterPolishInput,
  ) => Promise<{ success: true; data: { taskId: string } }>
  listNarrativeMemories: (
    projectId: string,
  ) => Promise<{ success: true; data: NarrativeMemory[] }>
  listNarrativeMemoryProposals: (
    projectId: string,
  ) => Promise<{ success: true; data: NarrativeMemoryProposal[] }>
  extractNarrativeMemories: (
    projectId: string,
    chapterId: string,
    content?: string,
    sourceVersionId?: string | null,
  ) => Promise<{ success: true; data: MemoryExtractionResult }>
  approveNarrativeMemoryProposal: (
    projectId: string,
    proposalId: string,
  ) => Promise<{ success: true; data: NarrativeMemory }>
  rejectNarrativeMemoryProposal: (
    projectId: string,
    proposalId: string,
  ) => Promise<{ success: true; data: NarrativeMemoryProposal }>
  listForeshadows: (projectId: string) => Promise<{ success: true; data: Foreshadow[] }>
  listForeshadowEvents: (
    projectId: string,
    foreshadowId: string,
  ) => Promise<{ success: true; data: ForeshadowEvent[] }>
  suggestForeshadows: (
    projectId: string,
    chapterId: string,
    endingHook?: string,
  ) => Promise<{ success: true; data: { suggestions: Foreshadow[]; used_fallback: boolean; error: string | null } }>
  transitionForeshadow: (
    projectId: string,
    foreshadowId: string,
    status: Foreshadow['status'],
    note?: string,
    chapterId?: string | null,
  ) => Promise<{ success: true; data: Foreshadow }>
  listNarrativeSkills: (
    projectId: string,
  ) => Promise<{ success: true; data: ProjectSkillState[] }>
  setNarrativeSkillEnabled: (
    projectId: string,
    skillName: string,
    enabled: boolean,
  ) => Promise<{ success: true; data: ProjectSkill }>
  getChapterBlocks: (
    projectId: string,
    chapterId: string,
  ) => Promise<{ success: true; data: ChapterBlock[] }>
  listChapterRevisions: (
    projectId: string,
    chapterId: string,
  ) => Promise<{ success: true; data: ChapterRevision[] }>
  getChapterRevision: (
    projectId: string,
    revisionId: string,
  ) => Promise<{ success: true; data: ChapterRevision }>
  applyChapterRevision: (
    projectId: string,
    revisionId: string,
  ) => Promise<{ success: true; data: import('../shared/chapterGeneration').Chapter }>
  diffChapterRevisions: (
    projectId: string,
    fromRevisionId: string,
    toRevisionId: string,
  ) => Promise<{ success: true; data: { from_revision_id: string | null; to_revision_id: string | null; diff: ChapterDiff } }>
  diffChapterVersions: (
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ) => Promise<{ success: true; data: { from_version_id: string; to_version_id: string; diff: ChapterDiff } }>

  // 长篇创作工作台
  listNovelProjects: () => Promise<WorkbenchResponse<Project[]>>
  getCurrentNovelProject: () => Promise<WorkbenchResponse<Project | null>>
  listLegacyCrushes: () => Promise<WorkbenchResponse<LegacyCrushSnapshot[]>>
  listLegacyFragments: (
    projectId?: string,
  ) => Promise<WorkbenchResponse<LegacyFragmentSnapshot[]>>
  getNovelProject: (params: ProjectIdParams) => Promise<WorkbenchResponse<Project>>
  createNovelProject: (params: CreateProjectCommand) => Promise<WorkbenchResponse<Project>>
  selectNovelProject: (params: ProjectIdParams) => Promise<WorkbenchResponse<Project>>
  updateNovelProject: (params: ProjectUpdateParams) => Promise<WorkbenchResponse<Project>>
  deleteNovelProject: (params: ProjectDeleteParams) => Promise<{ success: true }>
  getNovelProjectConfig: (params: ProjectIdParams) => Promise<WorkbenchResponse<ProjectConfig>>
  updateNovelProjectConfig: (
    params: ProjectConfigUpdateParams,
  ) => Promise<WorkbenchResponse<ProjectConfig>>

  createNovelVolume: (params: CreateVolumeInput) => Promise<WorkbenchResponse<Volume>>
  listNovelVolumes: (params: ProjectIdParams) => Promise<WorkbenchResponse<Volume[]>>
  getNovelVolume: (params: VolumeGetParams) => Promise<WorkbenchResponse<Volume>>
  updateNovelVolume: (params: VolumeUpdateParams) => Promise<WorkbenchResponse<Volume>>
  deleteNovelVolume: (params: VolumeDeleteParams) => Promise<{ success: true }>

  createNovelVolumeOutline: (
    params: CreateVolumeOutlineInput,
  ) => Promise<WorkbenchResponse<VolumeOutline>>
  listNovelVolumeOutlines: (
    params: ProjectIdParams,
  ) => Promise<WorkbenchResponse<VolumeOutline[]>>
  getNovelVolumeOutline: (
    params: VolumeOutlineGetParams,
  ) => Promise<WorkbenchResponse<VolumeOutline>>
  getNovelVolumeOutlineByVolume: (
    params: VolumeOutlineByVolumeParams,
  ) => Promise<WorkbenchResponse<VolumeOutline | null>>
  updateNovelVolumeOutline: (
    params: VolumeOutlineUpdateParams,
  ) => Promise<WorkbenchResponse<VolumeOutline>>
  deleteNovelVolumeOutline: (
    params: VolumeOutlineDeleteParams,
  ) => Promise<{ success: true }>
  confirmNovelVolumeOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<VolumeOutline>>
  lockNovelVolumeOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<VolumeOutline>>
  unlockNovelVolumeOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<VolumeOutline>>

  createNovelChapterOutline: (
    params: CreateChapterOutlineInput,
  ) => Promise<WorkbenchResponse<ChapterOutline>>
  listNovelChapterOutlines: (
    params: ProjectIdParams,
  ) => Promise<WorkbenchResponse<ChapterOutline[]>>
  listNovelChapterOutlinesByVolume: (
    params: ChapterOutlineByVolumeParams,
  ) => Promise<WorkbenchResponse<ChapterOutline[]>>
  getNovelChapterOutline: (
    params: ChapterOutlineGetParams,
  ) => Promise<WorkbenchResponse<ChapterOutline>>
  updateNovelChapterOutline: (
    params: ChapterOutlineUpdateParams,
  ) => Promise<WorkbenchResponse<ChapterOutline>>
  deleteNovelChapterOutline: (
    params: ChapterOutlineDeleteParams,
  ) => Promise<{ success: true }>
  confirmNovelChapterOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<ChapterOutline>>
  lockNovelChapterOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<ChapterOutline>>
  unlockNovelChapterOutline: (
    params: OutlineStatusParams,
  ) => Promise<WorkbenchResponse<ChapterOutline>>

  getNovelOutlineContext: (
    params: OutlineContextParams,
  ) => Promise<WorkbenchResponse<OutlineContext>>
  selectNovelOutlineSourceMaterials: (
    params: SourceMaterialSelectionParams,
  ) => Promise<WorkbenchResponse<SourceMaterial[]>>

  createNovelCharacter: (params: CreateCharacterInput) => Promise<WorkbenchResponse<Character>>
  listNovelCharacters: (params: ProjectIdParams) => Promise<WorkbenchResponse<Character[]>>
  getNovelCharacter: (params: CharacterGetParams) => Promise<WorkbenchResponse<Character>>
  updateNovelCharacter: (params: CharacterUpdateParams) => Promise<WorkbenchResponse<Character>>
  deleteNovelCharacter: (params: CharacterDeleteParams) => Promise<{ success: true }>
  mapCrushToNovelCharacter: (
    params: MapCrushToCharacterCommand,
  ) => Promise<WorkbenchResponse<Character>>

  createNovelWorldviewEntry: (
    params: CreateWorldviewEntryInput,
  ) => Promise<WorkbenchResponse<WorldviewEntry>>
  listNovelWorldviewEntries: (
    params: ProjectIdParams,
  ) => Promise<WorkbenchResponse<WorldviewEntry[]>>
  getNovelWorldviewEntry: (
    params: WorldviewGetParams,
  ) => Promise<WorkbenchResponse<WorldviewEntry>>
  updateNovelWorldviewEntry: (
    params: WorldviewUpdateParams,
  ) => Promise<WorkbenchResponse<WorldviewEntry>>
  deleteNovelWorldviewEntry: (params: WorldviewDeleteParams) => Promise<{ success: true }>

  createNovelOrganization: (
    params: CreateOrganizationInput,
  ) => Promise<WorkbenchResponse<Organization>>
  listNovelOrganizations: (
    params: ProjectIdParams,
  ) => Promise<WorkbenchResponse<Organization[]>>
  getNovelOrganization: (
    params: OrganizationGetParams,
  ) => Promise<WorkbenchResponse<Organization>>
  updateNovelOrganization: (
    params: OrganizationUpdateParams,
  ) => Promise<WorkbenchResponse<Organization>>
  deleteNovelOrganization: (params: OrganizationDeleteParams) => Promise<{ success: true }>

  createNovelRelation: (params: CreateRelationInput) => Promise<WorkbenchResponse<Relation>>
  listNovelRelations: (params: ProjectIdParams) => Promise<WorkbenchResponse<Relation[]>>
  getNovelRelation: (params: RelationGetParams) => Promise<WorkbenchResponse<Relation>>
  updateNovelRelation: (params: RelationUpdateParams) => Promise<WorkbenchResponse<Relation>>
  deleteNovelRelation: (params: RelationDeleteParams) => Promise<{ success: true }>

  createSourceMaterial: (
    params: CreateSourceMaterialInput,
  ) => Promise<WorkbenchResponse<SourceMaterial>>
  listSourceMaterials: (
    params: SourceMaterialListParams,
  ) => Promise<WorkbenchResponse<SourceMaterial[]>>
  getSourceMaterial: (
    params: SourceMaterialGetParams,
  ) => Promise<WorkbenchResponse<SourceMaterial>>
  updateSourceMaterial: (
    params: SourceMaterialUpdateParams,
  ) => Promise<WorkbenchResponse<SourceMaterial>>
  deleteSourceMaterial: (params: SourceMaterialDeleteParams) => Promise<{ success: true }>
  createSourceMaterialFromFragment: (
    params: CreateSourceMaterialFromFragmentCommand,
  ) => Promise<WorkbenchResponse<SourceMaterial>>
  selectSourceMaterialsForPrompt: (
    params: SourceMaterialSelectionParams,
  ) => Promise<WorkbenchResponse<SourceMaterial[]>>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
