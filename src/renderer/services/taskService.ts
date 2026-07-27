import type {
  StartChapterGenerationInput,
  StartChapterPolishInput,
} from '../../main/tasks'
import type {
  TaskCheckpointEvent,
  TaskChunkEvent,
  TaskEndEvent,
  TaskErrorEvent,
  TaskReviewEvent,
  TaskStageEvent,
  TaskStartEvent,
} from '../../main/tasks'
import type { ChapterVersion } from '../../shared/chapterGeneration'

export type TaskEvent =
  | TaskStartEvent
  | TaskStageEvent
  | TaskChunkEvent
  | TaskCheckpointEvent
  | TaskReviewEvent
  | TaskEndEvent
  | TaskErrorEvent

export interface TaskEventUnsubscribe {
  (): void
}

export interface TaskEventHandlers {
  onStart?: (event: TaskStartEvent) => void
  onStage?: (event: TaskStageEvent) => void
  onChunk?: (event: TaskChunkEvent) => void
  onCheckpoint?: (event: TaskCheckpointEvent) => void
  onReview?: (event: TaskReviewEvent) => void
  onEnd?: (event: TaskEndEvent) => void
  onError?: (event: TaskErrorEvent) => void
}

export interface RendererTask {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  stage: string
  progress: number
  input: Record<string, unknown>
  checkpoint: Record<string, unknown> | null
  result: Record<string, unknown> | null
  error_message: string | null
  cancel_requested: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface TaskService {
  list(projectId: string): Promise<RendererTask[]>
  listRecoverable(projectId: string): Promise<RendererTask[]>
  startChapterGeneration(input: StartChapterGenerationInput): Promise<string>
  startChapterPolish(input: StartChapterPolishInput): Promise<string>
  cancel(taskId: string): Promise<void>
  resume(taskId: string): Promise<string | null>
  listVersions(projectId: string, chapterId: string): Promise<ChapterVersion[]>
  confirmVersion(projectId: string, versionId: string): Promise<ChapterVersion>
  rejectVersion(projectId: string, versionId: string): Promise<ChapterVersion>
  subscribe(handlers: TaskEventHandlers): TaskEventUnsubscribe
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const translations: Array<[RegExp, string]> = [
    [/Project must be active/i, '当前项目不是进行中状态，请先在项目管理中恢复项目。'],
    [/Volume outline must be confirmed or locked/i, '卷大纲必须先确认或锁定，请前往卷章大纲处理。'],
    [/Chapter outline must be confirmed or locked/i, '章大纲必须先确认或锁定，请前往卷章大纲处理。'],
    [/credential/i, '模型凭据不可用，请前往项目配置安全保存并测试凭据。'],
    [/endpoint|base url|url security/i, '模型接口地址不安全或无效，请在项目配置中使用 HTTPS 或本机回环地址。'],
    [/already running|conflict/i, '已有互斥任务正在运行，请等待完成或取消后重试。'],
  ]
  return translations.find(([pattern]) => pattern.test(message))?.[1]
    ?? message
    ?? '任务请求失败'
}

async function requireSuccess<T>(request: () => Promise<{ success: boolean; data?: T; errors?: string[] }>): Promise<T> {
  try {
    const response = await request()
    if (!response.success || response.data === undefined) {
      throw new Error(response.errors?.[0] ?? '任务请求失败')
    }
    return response.data
  } catch (error) {
    throw new Error(errorMessage(error))
  }
}

async function requireComplete(
  request: () => Promise<{ success: boolean; errors?: string[] }>,
): Promise<void> {
  try {
    const response = await request()
    if (!response.success) throw new Error(response.errors?.[0] ?? '任务操作失败')
  } catch (error) {
    throw new Error(errorMessage(error))
  }
}

const taskService: TaskService = {
  list: (projectId) => requireSuccess(() => window.electronAPI.listTasks(projectId)),
  listRecoverable: (projectId) =>
    requireSuccess(() => window.electronAPI.listRecoverableTasks(projectId)),
  startChapterGeneration: async (input) => {
    const result = await requireSuccess(() => window.electronAPI.startChapterGeneration(input))
    return result.taskId
  },
  startChapterPolish: async (input) => {
    const result = await requireSuccess(() => window.electronAPI.startChapterPolish(input))
    return result.taskId
  },
  cancel: (taskId) => requireComplete(() => window.electronAPI.cancelTask(taskId)),
  resume: async (taskId) => {
    const response = await window.electronAPI.resumeTask(taskId)
    if (!response.success) return null
    return response.data.taskId
  },
  listVersions: (projectId, chapterId) =>
    requireSuccess(() => window.electronAPI.listChapterVersions(projectId, chapterId)),
  confirmVersion: (projectId, versionId) =>
    requireSuccess(() => window.electronAPI.confirmChapterVersion(projectId, versionId)),
  rejectVersion: (projectId, versionId) =>
    requireSuccess(() => window.electronAPI.rejectChapterVersion(projectId, versionId)),
  subscribe: (handlers) => {
    const unsubscribe = [
      window.electronAPI.onTaskStart((event) => handlers.onStart?.(event)),
      window.electronAPI.onTaskStage((event) => handlers.onStage?.(event)),
      window.electronAPI.onTaskChunk((event) => handlers.onChunk?.(event)),
      window.electronAPI.onTaskCheckpoint((event) => handlers.onCheckpoint?.(event)),
      window.electronAPI.onTaskReview((event) => handlers.onReview?.(event)),
      window.electronAPI.onTaskEnd((event) => handlers.onEnd?.(event)),
      window.electronAPI.onTaskError((event) => handlers.onError?.(event)),
    ]
    return () => unsubscribe.forEach((remove) => remove())
  },
}

export default taskService
