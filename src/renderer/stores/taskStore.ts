import { create } from 'zustand'
import type { StartChapterGenerationInput, StartChapterPolishInput } from '../../main/tasks'
import type { ChapterVersion } from '../../shared/chapterGeneration'
import taskService from '../services/taskService'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskView {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: TaskStatus
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

interface TaskStoreState {
  projectId: string | null
  tasks: TaskView[]
  recoverableTasks: TaskView[]
  versions: ChapterVersion[]
  activeTaskId: string | null
  stream: string
  logs: string[]
  loading: boolean
  busy: boolean
  error: string | null
  subscribed: boolean
  load: (projectId: string) => Promise<void>
  subscribeToEvents: () => () => void
  startGeneration: (input: StartChapterGenerationInput) => Promise<string>
  startPolish: (input: StartChapterPolishInput) => Promise<string>
  cancel: (taskId?: string) => Promise<void>
  resume: (taskId: string) => Promise<string | null>
  loadVersions: (projectId: string, chapterId: string) => Promise<void>
  confirmVersion: (projectId: string, versionId: string) => Promise<void>
  rejectVersion: (projectId: string, versionId: string) => Promise<void>
  clearOutput: () => void
}

function readError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '任务操作失败'
}

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  projectId: null,
  tasks: [],
  recoverableTasks: [],
  versions: [],
  activeTaskId: null,
  stream: '',
  logs: [],
  loading: false,
  busy: false,
  error: null,
  subscribed: false,

  load: async (projectId) => {
    const projectChanged = get().projectId !== projectId
    set({
      projectId,
      loading: true,
      error: null,
      ...(projectChanged ? {
        tasks: [],
        recoverableTasks: [],
        versions: [],
        activeTaskId: null,
        stream: '',
        logs: [],
        busy: false,
      } : {}),
    })
    try {
      const [tasks, recoverableTasks] = await Promise.all([
        taskService.list(projectId),
        taskService.listRecoverable(projectId),
      ])
      if (get().projectId !== projectId) return
      const active = tasks.find((task) => task.status === 'running' || task.status === 'pending')
      set({
        tasks,
        recoverableTasks,
        activeTaskId: active?.id ?? get().activeTaskId,
        loading: false,
      })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ loading: false, error: readError(error) })
    }
  },

  subscribeToEvents: () => {
    if (get().subscribed) return () => undefined
    set({ subscribed: true })
    const unsubscribe = taskService.subscribe({
      onStart: (event) => {
        if (get().projectId && event.task.project_id !== get().projectId) return
        set((state) => ({
          activeTaskId: event.task.id,
          tasks: [event.task as TaskView, ...state.tasks.filter((task) => task.id !== event.task.id)],
          logs: [`任务 ${event.task.task_type} 已启动`, ...state.logs].slice(0, 80),
          stream: '',
          error: null,
        }))
      },
      onStage: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set((state) => ({
          tasks: state.tasks.map((task) => task.id === event.taskId
            ? { ...task, stage: event.stage, progress: event.progress, status: 'running' }
            : task),
          logs: [`阶段：${event.stage}（${Math.round(event.progress * 100)}%）`, ...state.logs].slice(0, 80),
        }))
      },
      onChunk: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set((state) => ({
          stream: state.stream + event.chunk,
          logs: event.stage ? [`输出阶段：${event.stage}`, ...state.logs].slice(0, 80) : state.logs,
        }))
      },
      onCheckpoint: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set((state) => ({
          tasks: state.tasks.map((task) => task.id === event.taskId
            ? { ...task, checkpoint: event.checkpoint }
            : task),
          logs: ['检查点已保存，可从这里恢复', ...state.logs].slice(0, 80),
        }))
      },
      onReview: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set((state) => ({
          logs: [event.required ? '生成结果等待审核' : '生成结果已自动确认', ...state.logs].slice(0, 80),
        }))
      },
      onEnd: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set((state) => ({
          busy: false,
          tasks: state.tasks.map((task) => task.id === event.taskId
            ? { ...task, status: event.status, stage: event.status }
            : task),
          logs: [`任务${event.status === 'completed' ? '完成' : event.status === 'cancelled' ? '已取消' : '失败'}`, ...state.logs].slice(0, 80),
        }))
        const projectId = get().projectId
        if (projectId) void get().load(projectId)
      },
      onError: (event) => {
        if (event.taskId !== get().activeTaskId) return
        set({ busy: false, error: event.error, logs: [`错误：${event.error}`, ...get().logs].slice(0, 80) })
      },
    })
    return () => {
      unsubscribe()
      set({ subscribed: false })
    }
  },

  startGeneration: async (input) => {
    set({ busy: true, error: null, stream: '', logs: ['正在提交章节生成任务'] })
    try {
      const taskId = await taskService.startChapterGeneration(input)
      if (get().projectId !== input.projectId) return taskId
      set({ activeTaskId: taskId })
      const projectId = get().projectId
      if (projectId) void get().load(projectId)
      return taskId
    } catch (error) {
      if (get().projectId !== input.projectId) throw error
      set({ busy: false, error: readError(error) })
      throw error
    }
  },

  startPolish: async (input) => {
    set({ busy: true, error: null, stream: '', logs: ['正在提交章节修订任务'] })
    try {
      const taskId = await taskService.startChapterPolish(input)
      set({ activeTaskId: taskId })
      return taskId
    } catch (error) {
      set({ busy: false, error: readError(error) })
      throw error
    }
  },

  cancel: async (taskId) => {
    const id = taskId ?? get().activeTaskId
    if (!id) return
    set({ busy: true, error: null })
    try {
      await taskService.cancel(id)
      set((state) => ({ logs: ['已发送取消请求，等待任务收尾', ...state.logs].slice(0, 80) }))
    } catch (error) {
      set({ busy: false, error: readError(error) })
    }
  },

  resume: async (taskId) => {
    set({ busy: true, error: null })
    try {
      const nextTaskId = await taskService.resume(taskId)
      set({ activeTaskId: nextTaskId, busy: Boolean(nextTaskId) })
      const projectId = get().projectId
      if (projectId) void get().load(projectId)
      return nextTaskId
    } catch (error) {
      set({ busy: false, error: readError(error) })
      return null
    }
  },

  loadVersions: async (projectId, chapterId) => {
    try {
      const versions = await taskService.listVersions(projectId, chapterId)
      if (get().projectId !== projectId) return
      set({ versions, error: null })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ error: readError(error) })
    }
  },

  confirmVersion: async (projectId, versionId) => {
    try {
      await taskService.confirmVersion(projectId, versionId)
      set((state) => ({
        versions: state.versions.map((version) => version.id === versionId
          ? { ...version, status: 'approved', is_current: true }
          : version),
        error: null,
      }))
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  rejectVersion: async (projectId, versionId) => {
    try {
      await taskService.rejectVersion(projectId, versionId)
      set((state) => ({
        versions: state.versions.map((version) => version.id === versionId
          ? { ...version, status: 'rejected', is_current: false }
          : version),
        error: null,
      }))
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  clearOutput: () => set({ stream: '', logs: [], error: null }),
}))

export type { TaskStoreState }
