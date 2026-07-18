import type { TaskEventHandlers } from '@/renderer/services/taskService'

const mockWorkbenchService = {
  listProjects: jest.fn(),
  getCurrentProject: jest.fn(),
  createProject: jest.fn(),
  selectProject: jest.fn(),
  updateProject: jest.fn(),
  deleteProject: jest.fn(),
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
  listVolumes: jest.fn(),
  createVolume: jest.fn(),
  updateVolume: jest.fn(),
  deleteVolume: jest.fn(),
  listVolumeOutlines: jest.fn(),
  createVolumeOutline: jest.fn(),
  updateVolumeOutline: jest.fn(),
  deleteVolumeOutline: jest.fn(),
  confirmVolumeOutline: jest.fn(),
  lockVolumeOutline: jest.fn(),
  unlockVolumeOutline: jest.fn(),
  listChapterOutlines: jest.fn(),
  createChapterOutline: jest.fn(),
  updateChapterOutline: jest.fn(),
  deleteChapterOutline: jest.fn(),
  confirmChapterOutline: jest.fn(),
  lockChapterOutline: jest.fn(),
  unlockChapterOutline: jest.fn(),
  listCharacters: jest.fn(),
  createCharacter: jest.fn(),
  updateCharacter: jest.fn(),
  deleteCharacter: jest.fn(),
  listWorldviewEntries: jest.fn(),
  createWorldviewEntry: jest.fn(),
  updateWorldviewEntry: jest.fn(),
  deleteWorldviewEntry: jest.fn(),
  listOrganizations: jest.fn(),
  createOrganization: jest.fn(),
  updateOrganization: jest.fn(),
  deleteOrganization: jest.fn(),
  listRelations: jest.fn(),
  createRelation: jest.fn(),
  updateRelation: jest.fn(),
  deleteRelation: jest.fn(),
  listSourceMaterials: jest.fn(),
  createSourceMaterial: jest.fn(),
  updateSourceMaterial: jest.fn(),
  deleteSourceMaterial: jest.fn(),
}

const mockTaskHandlers: { current: TaskEventHandlers | null } = { current: null }
const mockTaskService = {
  list: jest.fn(),
  listRecoverable: jest.fn(),
  startChapterGeneration: jest.fn(),
  startChapterPolish: jest.fn(),
  cancel: jest.fn(),
  resume: jest.fn(),
  listVersions: jest.fn(),
  confirmVersion: jest.fn(),
  rejectVersion: jest.fn(),
  subscribe: jest.fn((handlers: TaskEventHandlers) => {
    mockTaskHandlers.current = handlers
    return () => undefined
  }),
}

jest.mock('../../src/renderer/services/workbenchService', () => ({
  __esModule: true,
  default: mockWorkbenchService,
}))
jest.mock('../../src/renderer/services/taskService', () => ({
  __esModule: true,
  default: mockTaskService,
}))

import { useTaskStore } from '@/renderer/stores/taskStore'
import { useWorkbenchStore } from '@/renderer/stores/workbenchStore'

const projectOne = {
  id: 'project-1', slug: 'one', name: '项目一', description: '', status: 'active' as const,
  version: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}
const projectTwo = { ...projectOne, id: 'project-2', slug: 'two', name: '项目二' }

function setProjectDefaults(): void {
  mockWorkbenchService.listProjects.mockResolvedValue([projectOne, projectTwo])
  mockWorkbenchService.getCurrentProject.mockResolvedValue(projectOne)
  mockWorkbenchService.selectProject.mockResolvedValue(projectTwo)
  mockWorkbenchService.getConfig.mockResolvedValue({ project_id: projectOne.id, default_llm_config_id: null, genre: '', tone: '', target_words: null, context_budget: null, settings: {}, version: 1, created_at: '', updated_at: '' })
  mockWorkbenchService.listVolumes.mockResolvedValue([])
  mockWorkbenchService.listVolumeOutlines.mockResolvedValue([])
  mockWorkbenchService.listChapterOutlines.mockResolvedValue([])
  mockWorkbenchService.listCharacters.mockResolvedValue([])
  mockWorkbenchService.listWorldviewEntries.mockResolvedValue([])
  mockWorkbenchService.listOrganizations.mockResolvedValue([])
  mockWorkbenchService.listRelations.mockResolvedValue([])
  mockWorkbenchService.listSourceMaterials.mockResolvedValue([])
}

beforeEach(() => {
  jest.clearAllMocks()
  setProjectDefaults()
  useWorkbenchStore.setState({ projects: [], currentProject: null, config: null, initialized: false, dirty: false, pendingProjectId: null, error: null })
  useTaskStore.setState({ projectId: null, activeTaskId: null, stream: '', logs: [], subscribed: false, error: null })
  mockTaskHandlers.current = null
})

test('工作台 store 在未保存时阻止项目切换，并支持确认恢复', async () => {
  await useWorkbenchStore.getState().initialize()
  useWorkbenchStore.getState().markDirty()

  await expect(useWorkbenchStore.getState().selectProject(projectTwo.id)).resolves.toBe(false)
  expect(useWorkbenchStore.getState().pendingProjectId).toBe(projectTwo.id)
  await expect(useWorkbenchStore.getState().confirmPendingProjectSwitch()).resolves.toBe(true)
  expect(useWorkbenchStore.getState().currentProject?.id).toBe(projectTwo.id)
  expect(useWorkbenchStore.getState().dirty).toBe(false)
})

test('任务 store 订阅阶段、流式内容和错误事件', () => {
  useTaskStore.setState({ projectId: projectOne.id, activeTaskId: 'task-1' })
  const unsubscribe = useTaskStore.getState().subscribeToEvents()
  expect(mockTaskHandlers.current).not.toBeNull()

  mockTaskHandlers.current?.onStage?.({ type: 'task:stage', taskId: 'task-1', stage: 'body', progress: 0.4 })
  mockTaskHandlers.current?.onChunk?.({ type: 'task:chunk', taskId: 'task-1', chunk: '流式片段', stage: 'body' })
  expect(useTaskStore.getState().stream).toBe('流式片段')
  expect(useTaskStore.getState().logs[0]).toContain('输出阶段')

  mockTaskHandlers.current?.onError?.({ type: 'task:error', taskId: 'task-1', error: '网络暂时不可用' })
  expect(useTaskStore.getState().error).toBe('网络暂时不可用')
  unsubscribe()
})
