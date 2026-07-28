import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { StartChapterGenerationInput, StartChapterPolishInput, StartTaskInput } from './tasks'
import type {
  AssistantEventChannel,
  AssistantEvent,
  AssistantPromptInput,
  CreateAssistantSessionInput,
} from './assistant'
import type { AssistantSessionView } from './assistant'
import type {
  TaskEventChannel,
  TaskCheckpointEvent,
  TaskChunkEvent,
  TaskEndEvent,
  TaskErrorEvent,
  TaskReviewEvent,
  TaskStageEvent,
  TaskStartEvent,
} from './tasks'
import type {
  ChapterOutlineByVolumeParams,
  ChapterOutlineDeleteParams,
  ChapterOutlineGetParams,
  ChapterOutlineUpdateParams,
  CharacterGetParams,
  CharacterDeleteParams,
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
} from './workbench'
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
import type { Foreshadow } from '../shared/narrativeWorkbench'
import type {
  BackupRecord,
  BackupError,
  BackupVerificationResult,
  DatabaseStatus,
  RestoreExecutionResult,
} from '../shared/backup/types'
import type {
  ProjectExportResult,
  ProjectImportPreview,
  ProjectImportResult,
  ProjectPortabilityError,
} from '../shared/projectPortability'

const DATABASE_STATUS_CHANGED_CHANNEL = 'backup:status-changed'

interface TaskEventMap {
  'task:start': TaskStartEvent
  'task:stage': TaskStageEvent
  'task:chunk': TaskChunkEvent
  'task:checkpoint': TaskCheckpointEvent
  'task:review': TaskReviewEvent
  'task:end': TaskEndEvent
  'task:error': TaskErrorEvent
}

interface AssistantEventMap {
  'assistant:message': Extract<AssistantEvent, { type: 'assistant:message' }>
  'assistant:delta': Extract<AssistantEvent, { type: 'assistant:delta' }>
  'assistant:tool:start': Extract<AssistantEvent, { type: 'assistant:tool:start' }>
  'assistant:tool:update': Extract<AssistantEvent, { type: 'assistant:tool:update' }>
  'assistant:tool:end': Extract<AssistantEvent, { type: 'assistant:tool:end' }>
  'assistant:confirmation': Extract<AssistantEvent, { type: 'assistant:confirmation' }>
  'assistant:end': Extract<AssistantEvent, { type: 'assistant:end' }>
  'assistant:error': Extract<AssistantEvent, { type: 'assistant:error' }>
}

function subscribeTaskEvent<C extends TaskEventChannel>(
  channel: C,
  listener: (event: TaskEventMap[C]) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
    listener(payload as TaskEventMap[C])
  }
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

function subscribeAssistantEvent<C extends AssistantEventChannel>(
  channel: C,
  listener: (event: AssistantEventMap[C]) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
    listener(payload as AssistantEventMap[C])
  }
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 日常写作
  generateDay: (params: any) => ipcRenderer.invoke('day:generate', params),
  getDays: (params: any) => ipcRenderer.invoke('day:list', params),
  getDay: (params: any) => ipcRenderer.invoke('day:get', params),
  updateDay: (params: any) => ipcRenderer.invoke('day:update', params),
  deleteDay: (params: any) => ipcRenderer.invoke('day:delete', params),

  // 碎片日记
  recordFragment: (params: any) => ipcRenderer.invoke('fragment:record', params),
  getFragments: (params: any) => ipcRenderer.invoke('fragment:list', params),
  getFragment: (params: any) => ipcRenderer.invoke('fragment:get', params),
  updateFragment: (params: any) => ipcRenderer.invoke('fragment:update', params),
  deleteFragment: (params: any) => ipcRenderer.invoke('fragment:delete', params),
  integrateFragments: (params: any) => ipcRenderer.invoke('fragment:integrate', params),

  // 角色管理
  createCrush: (params: any) => ipcRenderer.invoke('crush:create', params),
  getCrushes: (params: any) => ipcRenderer.invoke('crush:list', params),
  getCrush: (params: any) => ipcRenderer.invoke('crush:get', params),
  updateCrush: (params: any) => ipcRenderer.invoke('crush:update', params),
  deleteCrush: (params: any) => ipcRenderer.invoke('crush:delete', params),

  // 关系进度
  relationshipProgress: (slug: string) => ipcRenderer.invoke('relationship:progress', { slug }),
  relationshipDetectSignals: (slug: string, narrativeText: string) =>
    ipcRenderer.invoke('relationship:detectSignals', { slug, narrativeText }),
  relationshipAdvancePhase: (slug: string, reason?: string) =>
    ipcRenderer.invoke('relationship:advancePhase', { slug, reason }),
  relationshipSetPhase: (slug: string, phase: number) =>
    ipcRenderer.invoke('relationship:setPhase', { slug, phase }),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (params: any) => ipcRenderer.invoke('settings:update', params),
  getLlmCredentialStatus: (target: { scope: 'app' } | { scope: 'project'; projectId: string }) =>
    ipcRenderer.invoke('llmCredential:status', target),
  saveLlmCredential: (
    target: { scope: 'app' } | { scope: 'project'; projectId: string },
    secret: string,
  ) => ipcRenderer.invoke('llmCredential:save', { target, secret }),
  deleteLlmCredential: (target: { scope: 'app' } | { scope: 'project'; projectId: string }) =>
    ipcRenderer.invoke('llmCredential:delete', target),
  testLlmCredential: (target: { scope: 'app' } | { scope: 'project'; projectId: string }) =>
    ipcRenderer.invoke('llmCredential:test', target),
  deleteAllLlmCredentials: () => ipcRenderer.invoke('llmCredential:deleteAll'),

  // 数据安全
  listBackups: (): Promise<{ success: boolean; data?: BackupRecord[]; error?: BackupError }> =>
    ipcRenderer.invoke('backup:list'),
  createBackup: (): Promise<{ success: boolean; data?: BackupRecord; error?: BackupError }> =>
    ipcRenderer.invoke('backup:create'),
  verifyBackup: (
    id: string,
  ): Promise<{ success: boolean; data?: BackupVerificationResult; error?: BackupError }> =>
    ipcRenderer.invoke('backup:verify', { id }),
  restoreBackup: (
    id: string,
    confirm: true,
  ): Promise<{ success: boolean; data?: RestoreExecutionResult; error?: BackupError }> =>
    ipcRenderer.invoke('backup:restore', { id, confirm }),
  getDatabaseStatus: (): Promise<{ success: boolean; data?: DatabaseStatus; error?: BackupError }> =>
    ipcRenderer.invoke('backup:get-status'),
  onDatabaseStatusChanged: (listener: (status: DatabaseStatus) => void): (() => void) => {
    const wrapped = (_event: IpcRendererEvent, status: DatabaseStatus): void => {
      listener(status)
    }
    ipcRenderer.on(DATABASE_STATUS_CHANGED_CHANNEL, wrapped)
    return () => ipcRenderer.removeListener(DATABASE_STATUS_CHANGED_CHANNEL, wrapped)
  },
  exportProject: (
    projectId: string,
  ): Promise<{ success: boolean; data?: ProjectExportResult; error?: ProjectPortabilityError }> =>
    ipcRenderer.invoke('projectPortability:export', { projectId }),
  inspectProjectImport: (): Promise<{
    success: boolean
    data?: { canceled: true } | { canceled: false; preview: ProjectImportPreview }
    error?: ProjectPortabilityError
  }> => ipcRenderer.invoke('projectPortability:inspectImport'),
  commitProjectImport: (
    importToken: string,
    confirm: true,
  ): Promise<{ success: boolean; data?: ProjectImportResult; error?: ProjectPortabilityError }> =>
    ipcRenderer.invoke('projectPortability:commitImport', { importToken, confirm }),
  cancelProjectImport: (
    importToken: string,
  ): Promise<{ success: boolean; data?: { canceled: true }; error?: ProjectPortabilityError }> =>
    ipcRenderer.invoke('projectPortability:cancelImport', { importToken }),

  // 应用
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // 长篇工作台任务
  startTask: (params: StartTaskInput) => ipcRenderer.invoke('task:run', params),
  cancelTask: (taskId: string) => ipcRenderer.invoke('task:cancel', { taskId }),
  getTask: (taskId: string) => ipcRenderer.invoke('task:get', { taskId }),
  listTasks: (projectId: string) => ipcRenderer.invoke('task:list', { projectId }),
  resumeTask: (taskId: string) => ipcRenderer.invoke('task:resume', { taskId }),
  listRecoverableTasks: (projectId: string) => ipcRenderer.invoke('task:recoverable', { projectId }),
  onTaskStart: (listener: (event: TaskStartEvent) => void) =>
    subscribeTaskEvent('task:start', listener),
  onTaskStage: (listener: (event: TaskStageEvent) => void) =>
    subscribeTaskEvent('task:stage', listener),
  onTaskChunk: (listener: (event: TaskChunkEvent) => void) =>
    subscribeTaskEvent('task:chunk', listener),
  onTaskCheckpoint: (listener: (event: TaskCheckpointEvent) => void) =>
    subscribeTaskEvent('task:checkpoint', listener),
  onTaskReview: (listener: (event: TaskReviewEvent) => void) =>
    subscribeTaskEvent('task:review', listener),
  onTaskEnd: (listener: (event: TaskEndEvent) => void) =>
    subscribeTaskEvent('task:end', listener),
  onTaskError: (listener: (event: TaskErrorEvent) => void) =>
    subscribeTaskEvent('task:error', listener),

  // Agent 助手
  createAssistantSession: (params: CreateAssistantSessionInput) =>
    ipcRenderer.invoke('assistant:session:create', params),
  listAssistantSessions: (projectId: string) =>
    ipcRenderer.invoke('assistant:session:list', { projectId }),
  getAssistantSession: (sessionId: string): Promise<{ success: true; data: AssistantSessionView }> =>
    ipcRenderer.invoke('assistant:session:get', { sessionId }),
  archiveAssistantSession: (sessionId: string) =>
    ipcRenderer.invoke('assistant:session:archive', { sessionId }),
  promptAssistant: (params: AssistantPromptInput) =>
    ipcRenderer.invoke('assistant:prompt', params),
  cancelAssistant: (sessionId: string) =>
    ipcRenderer.invoke('assistant:cancel', { sessionId }),
  steerAssistant: (sessionId: string, prompt: string) =>
    ipcRenderer.invoke('assistant:steer', { sessionId, prompt }),
  followUpAssistant: (sessionId: string, prompt: string) =>
    ipcRenderer.invoke('assistant:followUp', { sessionId, prompt }),
  confirmAssistantOperation: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('assistant:confirmation', { requestId, approved }),
  onAssistantEvent: (listener: (event: AssistantEvent) => void) => {
    const unsubscribers = [
      subscribeAssistantEvent('assistant:message', listener),
      subscribeAssistantEvent('assistant:delta', listener),
      subscribeAssistantEvent('assistant:tool:start', listener),
      subscribeAssistantEvent('assistant:tool:update', listener),
      subscribeAssistantEvent('assistant:tool:end', listener),
      subscribeAssistantEvent('assistant:confirmation', listener),
      subscribeAssistantEvent('assistant:end', listener),
      subscribeAssistantEvent('assistant:error', listener),
    ]
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe())
  },

  startChapterGeneration: (params: StartChapterGenerationInput) =>
    ipcRenderer.invoke('chapterGeneration:start', {
      project_id: params.projectId,
      session_id: params.sessionId,
      chapter_outline_id: params.chapterOutlineId,
      ...(params.chapterId ? { chapter_id: params.chapterId } : {}),
      ...(params.autoConfirm === undefined ? {} : { auto_confirm: params.autoConfirm }),
      llm: params.llm,
    }),
  listChapterVersions: (projectId: string, chapterId: string) =>
    ipcRenderer.invoke('chapterGeneration:versions', {
      project_id: projectId,
      chapter_id: chapterId,
    }),
  getChapterVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke('chapterGeneration:version:get', {
      project_id: projectId,
      version_id: versionId,
    }),
  confirmChapterVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke('chapterGeneration:version:confirm', {
      project_id: projectId,
      version_id: versionId,
    }),
  rejectChapterVersion: (projectId: string, versionId: string) =>
    ipcRenderer.invoke('chapterGeneration:version:reject', {
      project_id: projectId,
      version_id: versionId,
    }),

  startChapterPolish: (params: StartChapterPolishInput) =>
    ipcRenderer.invoke('chapterPolish:start', {
      project_id: params.projectId,
      session_id: params.sessionId,
      chapter_id: params.chapterId,
      mode: params.mode,
      block_id: params.blockId,
      instruction: params.instruction,
      source_revision_id: params.sourceRevisionId,
      auto_apply: params.autoApply,
      llm: params.llm,
    }),
  listNarrativeMemories: (projectId: string) =>
    ipcRenderer.invoke('narrativeMemory:list', { project_id: projectId }),
  listNarrativeMemoryProposals: (projectId: string) =>
    ipcRenderer.invoke('narrativeMemory:proposals', { project_id: projectId }),
  extractNarrativeMemories: (
    projectId: string,
    chapterId: string,
    content?: string,
    sourceVersionId?: string | null,
  ) =>
    ipcRenderer.invoke('narrativeMemory:extract', {
      project_id: projectId,
      chapter_id: chapterId,
      content,
      source_version_id: sourceVersionId,
    }),
  approveNarrativeMemoryProposal: (projectId: string, proposalId: string) =>
    ipcRenderer.invoke('narrativeMemory:approve', {
      project_id: projectId,
      proposal_id: proposalId,
    }),
  rejectNarrativeMemoryProposal: (projectId: string, proposalId: string) =>
    ipcRenderer.invoke('narrativeMemory:reject', {
      project_id: projectId,
      proposal_id: proposalId,
    }),
  listForeshadows: (projectId: string) =>
    ipcRenderer.invoke('foreshadow:list', { project_id: projectId }),
  listForeshadowEvents: (projectId: string, foreshadowId: string) =>
    ipcRenderer.invoke('foreshadow:events', {
      project_id: projectId,
      foreshadow_id: foreshadowId,
    }),
  suggestForeshadows: (projectId: string, chapterId: string, endingHook?: string) =>
    ipcRenderer.invoke('foreshadow:suggest', {
      project_id: projectId,
      chapter_id: chapterId,
      ending_hook: endingHook,
    }),
  transitionForeshadow: (
    projectId: string,
    foreshadowId: string,
    status: Foreshadow['status'],
    note?: string,
    chapterId?: string | null,
  ) =>
    ipcRenderer.invoke('foreshadow:transition', {
      project_id: projectId,
      foreshadow_id: foreshadowId,
      status,
      note,
      chapter_id: chapterId,
    }),
  listNarrativeSkills: (projectId: string) =>
    ipcRenderer.invoke('skill:list', { project_id: projectId }),
  setNarrativeSkillEnabled: (projectId: string, skillName: string, enabled: boolean) =>
    ipcRenderer.invoke('skill:toggle', {
      project_id: projectId,
      skill_name: skillName,
      enabled,
    }),
  getChapterBlocks: (projectId: string, chapterId: string) =>
    ipcRenderer.invoke('chapter:blocks', { project_id: projectId, chapter_id: chapterId }),
  listChapterRevisions: (projectId: string, chapterId: string) =>
    ipcRenderer.invoke('chapter:revisions', { project_id: projectId, chapter_id: chapterId }),
  getChapterRevision: (projectId: string, revisionId: string) =>
    ipcRenderer.invoke('chapter:revision:get', {
      project_id: projectId,
      revision_id: revisionId,
    }),
  applyChapterRevision: (projectId: string, revisionId: string) =>
    ipcRenderer.invoke('chapter:revision:apply', {
      project_id: projectId,
      revision_id: revisionId,
    }),
  diffChapterRevisions: (projectId: string, fromRevisionId: string, toRevisionId: string) =>
    ipcRenderer.invoke('chapter:diff:revisions', {
      project_id: projectId,
      from_revision_id: fromRevisionId,
      to_revision_id: toRevisionId,
    }),
  diffChapterVersions: (projectId: string, fromVersionId: string, toVersionId: string) =>
    ipcRenderer.invoke('chapter:diff:versions', {
      project_id: projectId,
      from_version_id: fromVersionId,
      to_version_id: toVersionId,
    }),

  // 长篇创作工作台
  listNovelProjects: (): Promise<WorkbenchResponse<Project[]>> =>
    ipcRenderer.invoke('novelProject:list'),
  getCurrentNovelProject: (): Promise<WorkbenchResponse<Project | null>> =>
    ipcRenderer.invoke('novelProject:current'),
  listLegacyCrushes: (): Promise<WorkbenchResponse<LegacyCrushSnapshot[]>> =>
    ipcRenderer.invoke('novelProject:legacyCrushes:list'),
  listLegacyFragments: (
    projectId?: string,
  ): Promise<WorkbenchResponse<LegacyFragmentSnapshot[]>> =>
    ipcRenderer.invoke('novelProject:legacyFragments:list', { project_id: projectId }),
  getNovelProject: (params: ProjectIdParams): Promise<WorkbenchResponse<Project>> =>
    ipcRenderer.invoke('novelProject:get', params),
  createNovelProject: (params: CreateProjectCommand): Promise<WorkbenchResponse<Project>> =>
    ipcRenderer.invoke('novelProject:create', params),
  selectNovelProject: (params: ProjectIdParams): Promise<WorkbenchResponse<Project>> =>
    ipcRenderer.invoke('novelProject:select', params),
  updateNovelProject: (params: ProjectUpdateParams): Promise<WorkbenchResponse<Project>> =>
    ipcRenderer.invoke('novelProject:update', params),
  deleteNovelProject: (params: ProjectDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:delete', params),
  getNovelProjectConfig: (params: ProjectIdParams): Promise<WorkbenchResponse<ProjectConfig>> =>
    ipcRenderer.invoke('novelProject:config:get', params),
  updateNovelProjectConfig: (
    params: ProjectConfigUpdateParams,
  ): Promise<WorkbenchResponse<ProjectConfig>> => ipcRenderer.invoke('novelProject:config:update', params),

  createNovelVolume: (params: CreateVolumeInput): Promise<WorkbenchResponse<Volume>> =>
    ipcRenderer.invoke('novelProject:volume:create', params),
  listNovelVolumes: (params: ProjectIdParams): Promise<WorkbenchResponse<Volume[]>> =>
    ipcRenderer.invoke('novelProject:volume:list', params),
  getNovelVolume: (params: VolumeGetParams): Promise<WorkbenchResponse<Volume>> =>
    ipcRenderer.invoke('novelProject:volume:get', params),
  updateNovelVolume: (params: VolumeUpdateParams): Promise<WorkbenchResponse<Volume>> =>
    ipcRenderer.invoke('novelProject:volume:update', params),
  deleteNovelVolume: (params: VolumeDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:volume:delete', params),

  createNovelVolumeOutline: (
    params: CreateVolumeOutlineInput,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:create', params),
  listNovelVolumeOutlines: (params: ProjectIdParams): Promise<WorkbenchResponse<VolumeOutline[]>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:list', params),
  getNovelVolumeOutline: (
    params: VolumeOutlineGetParams,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:get', params),
  getNovelVolumeOutlineByVolume: (
    params: VolumeOutlineByVolumeParams,
  ): Promise<WorkbenchResponse<VolumeOutline | null>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:getByVolume', params),
  updateNovelVolumeOutline: (
    params: VolumeOutlineUpdateParams,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:update', params),
  deleteNovelVolumeOutline: (
    params: VolumeOutlineDeleteParams,
  ): Promise<{ success: true }> => ipcRenderer.invoke('novelProject:volumeOutline:delete', params),
  confirmNovelVolumeOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:confirm', params),
  lockNovelVolumeOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:lock', params),
  unlockNovelVolumeOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<VolumeOutline>> =>
    ipcRenderer.invoke('novelProject:volumeOutline:unlock', params),

  createNovelChapterOutline: (
    params: CreateChapterOutlineInput,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:create', params),
  listNovelChapterOutlines: (params: ProjectIdParams): Promise<WorkbenchResponse<ChapterOutline[]>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:list', params),
  listNovelChapterOutlinesByVolume: (
    params: ChapterOutlineByVolumeParams,
  ): Promise<WorkbenchResponse<ChapterOutline[]>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:listByVolume', params),
  getNovelChapterOutline: (
    params: ChapterOutlineGetParams,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:get', params),
  updateNovelChapterOutline: (
    params: ChapterOutlineUpdateParams,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:update', params),
  deleteNovelChapterOutline: (
    params: ChapterOutlineDeleteParams,
  ): Promise<{ success: true }> => ipcRenderer.invoke('novelProject:chapterOutline:delete', params),
  confirmNovelChapterOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:confirm', params),
  lockNovelChapterOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:lock', params),
  unlockNovelChapterOutline: (
    params: OutlineStatusParams,
  ): Promise<WorkbenchResponse<ChapterOutline>> =>
    ipcRenderer.invoke('novelProject:chapterOutline:unlock', params),

  getNovelOutlineContext: (
    params: OutlineContextParams,
  ): Promise<WorkbenchResponse<OutlineContext>> =>
    ipcRenderer.invoke('novelProject:outline:context', params),
  selectNovelOutlineSourceMaterials: (
    params: SourceMaterialSelectionParams,
  ): Promise<WorkbenchResponse<SourceMaterial[]>> =>
    ipcRenderer.invoke('novelProject:outline:selectSourceMaterials', params),

  createNovelCharacter: (params: CreateCharacterInput): Promise<WorkbenchResponse<Character>> =>
    ipcRenderer.invoke('novelProject:character:create', params),
  listNovelCharacters: (params: ProjectIdParams): Promise<WorkbenchResponse<Character[]>> =>
    ipcRenderer.invoke('novelProject:character:list', params),
  getNovelCharacter: (params: CharacterGetParams): Promise<WorkbenchResponse<Character>> =>
    ipcRenderer.invoke('novelProject:character:get', params),
  updateNovelCharacter: (params: CharacterUpdateParams): Promise<WorkbenchResponse<Character>> =>
    ipcRenderer.invoke('novelProject:character:update', params),
  deleteNovelCharacter: (params: CharacterDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:character:delete', params),
  mapCrushToNovelCharacter: (
    params: MapCrushToCharacterCommand,
  ): Promise<WorkbenchResponse<Character>> => ipcRenderer.invoke('novelProject:character:mapCrush', params),

  createNovelWorldviewEntry: (
    params: CreateWorldviewEntryInput,
  ): Promise<WorkbenchResponse<WorldviewEntry>> =>
    ipcRenderer.invoke('novelProject:worldview:create', params),
  listNovelWorldviewEntries: (params: ProjectIdParams): Promise<WorkbenchResponse<WorldviewEntry[]>> =>
    ipcRenderer.invoke('novelProject:worldview:list', params),
  getNovelWorldviewEntry: (params: WorldviewGetParams): Promise<WorkbenchResponse<WorldviewEntry>> =>
    ipcRenderer.invoke('novelProject:worldview:get', params),
  updateNovelWorldviewEntry: (
    params: WorldviewUpdateParams,
  ): Promise<WorkbenchResponse<WorldviewEntry>> => ipcRenderer.invoke('novelProject:worldview:update', params),
  deleteNovelWorldviewEntry: (params: WorldviewDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:worldview:delete', params),

  createNovelOrganization: (
    params: CreateOrganizationInput,
  ): Promise<WorkbenchResponse<Organization>> => ipcRenderer.invoke('novelProject:organization:create', params),
  listNovelOrganizations: (params: ProjectIdParams): Promise<WorkbenchResponse<Organization[]>> =>
    ipcRenderer.invoke('novelProject:organization:list', params),
  getNovelOrganization: (params: OrganizationGetParams): Promise<WorkbenchResponse<Organization>> =>
    ipcRenderer.invoke('novelProject:organization:get', params),
  updateNovelOrganization: (
    params: OrganizationUpdateParams,
  ): Promise<WorkbenchResponse<Organization>> => ipcRenderer.invoke('novelProject:organization:update', params),
  deleteNovelOrganization: (params: OrganizationDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:organization:delete', params),

  createNovelRelation: (params: CreateRelationInput): Promise<WorkbenchResponse<Relation>> =>
    ipcRenderer.invoke('novelProject:relation:create', params),
  listNovelRelations: (params: ProjectIdParams): Promise<WorkbenchResponse<Relation[]>> =>
    ipcRenderer.invoke('novelProject:relation:list', params),
  getNovelRelation: (params: RelationGetParams): Promise<WorkbenchResponse<Relation>> =>
    ipcRenderer.invoke('novelProject:relation:get', params),
  updateNovelRelation: (params: RelationUpdateParams): Promise<WorkbenchResponse<Relation>> =>
    ipcRenderer.invoke('novelProject:relation:update', params),
  deleteNovelRelation: (params: RelationDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:relation:delete', params),

  createSourceMaterial: (
    params: CreateSourceMaterialInput,
  ): Promise<WorkbenchResponse<SourceMaterial>> => ipcRenderer.invoke('novelProject:sourceMaterial:create', params),
  listSourceMaterials: (
    params: SourceMaterialListParams,
  ): Promise<WorkbenchResponse<SourceMaterial[]>> => ipcRenderer.invoke('novelProject:sourceMaterial:list', params),
  getSourceMaterial: (params: SourceMaterialGetParams): Promise<WorkbenchResponse<SourceMaterial>> =>
    ipcRenderer.invoke('novelProject:sourceMaterial:get', params),
  updateSourceMaterial: (
    params: SourceMaterialUpdateParams,
  ): Promise<WorkbenchResponse<SourceMaterial>> => ipcRenderer.invoke('novelProject:sourceMaterial:update', params),
  deleteSourceMaterial: (params: SourceMaterialDeleteParams): Promise<{ success: true }> =>
    ipcRenderer.invoke('novelProject:sourceMaterial:delete', params),
  createSourceMaterialFromFragment: (
    params: CreateSourceMaterialFromFragmentCommand,
  ): Promise<WorkbenchResponse<SourceMaterial>> =>
    ipcRenderer.invoke('novelProject:sourceMaterial:fromFragment', params),
  selectSourceMaterialsForPrompt: (
    params: SourceMaterialSelectionParams,
  ): Promise<WorkbenchResponse<SourceMaterial[]>> =>
    ipcRenderer.invoke('novelProject:sourceMaterial:selectForPrompt', params),
})
