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
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '任务请求失败'
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
