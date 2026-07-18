import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  initializeDatabase,
  ProjectRepository,
  TaskRepository,
  type SqliteDatabase,
} from '@/main/database'

describe('TaskRepository', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-task-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('persists task lifecycle fields through the existing SQLite schema', () => {
    const project = new ProjectRepository(database).create({
      slug: 'task-project',
      name: 'Task Project',
    })
    const tasks = new TaskRepository(database)
    const task = tasks.create({
      project_id: project.id,
      task_type: 'assistant',
      input: { prompt: 'hello', attempt: 1 },
    })

    expect(task.status).toBe('pending')
    expect(task.input).toEqual({ prompt: 'hello', attempt: 1 })

    const startedAt = new Date().toISOString()
    const finishedAt = new Date(Date.now() + 1).toISOString()
    const running = tasks.update(task.id, {
      status: 'running',
      stage: 'agent',
      progress: 0.25,
      checkpoint: { stage: 'body', body: 'partial' },
      started_at: startedAt,
    })
    expect(running).toEqual(expect.objectContaining({
      status: 'running',
      stage: 'agent',
      progress: 0.25,
      checkpoint: { stage: 'body', body: 'partial' },
    }))

    const completed = tasks.update(task.id, {
      status: 'completed',
      stage: 'completed',
      progress: 1,
      result: { text: 'done', finishReason: 'stop' },
      finished_at: finishedAt,
    })
    expect(completed?.result).toEqual({ text: 'done', finishReason: 'stop' })
    expect(tasks.listByProject(project.id)).toHaveLength(1)
    expect(tasks.requestCancellation(task.id)).toBe(false)
  })

  test('marks only pending and running tasks as cancellation requested', () => {
    const project = new ProjectRepository(database).create({
      slug: 'cancel-project',
      name: 'Cancel Project',
    })
    const tasks = new TaskRepository(database)
    const task = tasks.create({ project_id: project.id, task_type: 'assistant' })

    expect(tasks.requestCancellation(task.id)).toBe(true)
    expect(tasks.getById(task.id)?.cancel_requested).toBe(true)
    tasks.update(task.id, { status: 'cancelled' })
    expect(tasks.requestCancellation(task.id)).toBe(false)
  })
})
