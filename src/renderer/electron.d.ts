import type { GenerateDayResponse } from '../shared/day/dayService'
import type { ServiceResponse } from './stores/createCrudStore'
import type { StartTaskInput } from '../main/tasks'
import type {
  TaskChunkEvent,
  TaskEndEvent,
  TaskErrorEvent,
  TaskStageEvent,
  TaskStartEvent,
} from '../main/tasks'

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
  onTaskStart: (listener: (event: TaskStartEvent) => void) => () => void
  onTaskStage: (listener: (event: TaskStageEvent) => void) => () => void
  onTaskChunk: (listener: (event: TaskChunkEvent) => void) => () => void
  onTaskEnd: (listener: (event: TaskEndEvent) => void) => () => void
  onTaskError: (listener: (event: TaskErrorEvent) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
