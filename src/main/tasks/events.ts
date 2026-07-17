import type { LlmRunStats } from '../../agent/llm'
import type { JsonObject, Task, TaskStatus } from '../database'

export type TaskEventChannel = 'task:start' | 'task:stage' | 'task:chunk' | 'task:end' | 'task:error'

export interface TaskStartEvent {
  type: 'task:start'
  task: Task
}

export interface TaskStageEvent {
  type: 'task:stage'
  taskId: string
  stage: string
  progress: number
}

export interface TaskChunkEvent {
  type: 'task:chunk'
  taskId: string
  chunk: string
}

export interface TaskEndEvent {
  type: 'task:end'
  taskId: string
  status: Extract<TaskStatus, 'completed' | 'cancelled' | 'failed'>
  result?: JsonObject
  stats?: LlmRunStats
}

export interface TaskErrorEvent {
  type: 'task:error'
  taskId: string
  error: string
}

export type TaskEvent =
  | TaskStartEvent
  | TaskStageEvent
  | TaskChunkEvent
  | TaskEndEvent
  | TaskErrorEvent

export interface TaskEventSink {
  publish(event: TaskEvent): void
}

export interface WebContentsLike {
  readonly isDestroyed?: () => boolean
  send(channel: TaskEventChannel, payload: unknown): void
}

export function createWebContentsTaskEventSink(
  getWebContents: () => WebContentsLike | null,
): TaskEventSink {
  return {
    publish: (event) => {
      const webContents = getWebContents()
      if (!webContents || webContents.isDestroyed?.()) return
      webContents.send(event.type, event)
    },
  }
}
