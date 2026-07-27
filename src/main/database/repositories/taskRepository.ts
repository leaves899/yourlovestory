import { randomUUID } from 'node:crypto'
import {
  parseJsonObject,
  stringifyJsonObject,
  type JsonObject,
} from '../json'
import type { SqliteDatabase } from '../types'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type { JsonObject, JsonPrimitive, JsonValue } from '../json'

export interface Task {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: TaskStatus
  stage: string
  progress: number
  input: JsonObject
  checkpoint: JsonObject | null
  result: JsonObject | null
  error_message: string | null
  cancel_requested: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateTaskInput {
  id?: string
  project_id: string
  chapter_id?: string | null
  parent_task_id?: string | null
  task_type: string
  input?: JsonObject
}

export interface UpdateTaskInput {
  chapter_id?: string | null
  status?: TaskStatus
  stage?: string
  progress?: number
  checkpoint?: JsonObject | null
  result?: JsonObject | null
  error_message?: string | null
  cancel_requested?: boolean
  started_at?: string | null
  finished_at?: string | null
}

export interface TaskStore {
  create(input: CreateTaskInput): Task
  getById(id: string): Task | null
  listByProject(projectId: string): Task[]
  update(id: string, input: UpdateTaskInput): Task | null
  requestCancellation(id: string): boolean
}

interface TaskRow {
  id: string
  project_id: string
  chapter_id: string | null
  parent_task_id: string | null
  task_type: string
  status: string
  stage: string
  progress: number
  input_json: string
  result_json: string | null
  error_message: string | null
  checkpoint_json: string | null
  cancel_requested: number
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

function toTask(row: TaskRow): Task {
  const statuses: readonly TaskStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
  ]
  if (!statuses.includes(row.status as TaskStatus)) {
    throw new Error(`Unknown task status: ${row.status}`)
  }
  const input = parseJsonObject(row.input_json, 'input')
  if (!input) throw new Error('Task input cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    chapter_id: row.chapter_id,
    parent_task_id: row.parent_task_id,
    task_type: row.task_type,
    status: row.status as TaskStatus,
    stage: row.stage,
    progress: row.progress,
    input,
    checkpoint: parseJsonObject(row.checkpoint_json, 'checkpoint'),
    result: parseJsonObject(row.result_json, 'result'),
    error_message: row.error_message,
    cancel_requested: row.cancel_requested === 1,
    started_at: row.started_at,
    finished_at: row.finished_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function now(): string {
  return new Date().toISOString()
}

export class TaskRepository implements TaskStore {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateTaskInput): Task {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO tasks (
          id, project_id, chapter_id, parent_task_id, task_type, status, stage, progress,
          input_json, checkpoint_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', '', 0, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.chapter_id ?? null,
        input.parent_task_id ?? null,
        input.task_type,
        stringifyJsonObject(input.input ?? {}),
        timestamp,
        timestamp,
      )
    const task = this.getById(id)
    if (!task) throw new Error('Task was not created')
    return task
  }

  public getById(id: string): Task | null {
    const row = this.database.prepare<TaskRow>('SELECT * FROM tasks WHERE id = ?').get(id)
    return row ? toTask(row) : null
  }

  public listByProject(projectId: string): Task[] {
    return this.database
      .prepare<TaskRow>('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at, id')
      .all(projectId)
      .map(toTask)
  }

  public update(id: string, input: UpdateTaskInput): Task | null {
    const current = this.getById(id)
    if (!current) return null
    const next = {
      chapter_id: input.chapter_id === undefined ? current.chapter_id : input.chapter_id,
      status: input.status ?? current.status,
      stage: input.stage ?? current.stage,
      progress: input.progress ?? current.progress,
      checkpoint: input.checkpoint === undefined ? current.checkpoint : input.checkpoint,
      result: input.result === undefined ? current.result : input.result,
      error_message: input.error_message === undefined ? current.error_message : input.error_message,
      cancel_requested: input.cancel_requested ?? current.cancel_requested,
      started_at: input.started_at === undefined ? current.started_at : input.started_at,
      finished_at: input.finished_at === undefined ? current.finished_at : input.finished_at,
    }
    this.database
      .prepare(
        `UPDATE tasks
         SET chapter_id = ?, status = ?, stage = ?, progress = ?, checkpoint_json = ?, result_json = ?,
             error_message = ?, cancel_requested = ?, started_at = ?, finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.chapter_id,
        next.status,
        next.stage,
        next.progress,
        next.checkpoint === null ? null : stringifyJsonObject(next.checkpoint),
        next.result === null ? null : stringifyJsonObject(next.result),
        next.error_message,
        next.cancel_requested ? 1 : 0,
        next.started_at,
        next.finished_at,
        now(),
        id,
      )
    return this.getById(id)
  }

  public requestCancellation(id: string): boolean {
    const result = this.database
      .prepare(
        `UPDATE tasks
         SET cancel_requested = 1, updated_at = ?
         WHERE id = ? AND status IN ('pending', 'running')`,
      )
      .run(now(), id)
    return result.changes > 0
  }
}
