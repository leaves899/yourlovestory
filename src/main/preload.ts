import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { StartTaskInput } from './tasks'
import type {
  TaskChunkEvent,
  TaskEndEvent,
  TaskErrorEvent,
  TaskStageEvent,
  TaskStartEvent,
} from './tasks'

function subscribeTaskEvent<T>(
  channel: 'task:start' | 'task:stage' | 'task:chunk' | 'task:end' | 'task:error',
  listener: (event: T) => void,
): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
    listener(payload as T)
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

  // 应用
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  quitApp: () => ipcRenderer.invoke('app:quit'),

  // 长篇工作台任务
  startTask: (params: StartTaskInput) => ipcRenderer.invoke('task:run', params),
  cancelTask: (taskId: string) => ipcRenderer.invoke('task:cancel', { taskId }),
  getTask: (taskId: string) => ipcRenderer.invoke('task:get', { taskId }),
  listTasks: (projectId: string) => ipcRenderer.invoke('task:list', { projectId }),
  onTaskStart: (listener: (event: TaskStartEvent) => void) =>
    subscribeTaskEvent('task:start', listener),
  onTaskStage: (listener: (event: TaskStageEvent) => void) =>
    subscribeTaskEvent('task:stage', listener),
  onTaskChunk: (listener: (event: TaskChunkEvent) => void) =>
    subscribeTaskEvent('task:chunk', listener),
  onTaskEnd: (listener: (event: TaskEndEvent) => void) =>
    subscribeTaskEvent('task:end', listener),
  onTaskError: (listener: (event: TaskErrorEvent) => void) =>
    subscribeTaskEvent('task:error', listener),
})
