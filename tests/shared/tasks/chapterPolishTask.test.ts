import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AgentFactory, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import { initializeDatabase, TaskRepository, type SqliteDatabase } from '@/main/database'
import {
  createChapterPolishTaskRunner,
  TaskManager,
  type TaskEvent,
  type TaskEventSink,
} from '@/main/tasks'
import { WorkbenchService } from '@/main/workbench'

function createAgent(text: string): ProjectSessionAgent {
  return {
    projectId: 'project',
    sessionId: 'session',
    prompt: async () => ({
      text,
      finishReason: 'stop',
      usage: emptyTokenUsage(),
    }),
    abort: jest.fn(),
    dispose: jest.fn(),
  }
}

describe('chapter polish task pipeline', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-polish-task-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('runs polish through the task manager and persists a checkpoint', async () => {
    const workbench = new WorkbenchService(database)
    const project = workbench.createProject({ slug: 'polish-task', name: 'Polish Task' })
    const chapter = workbench.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      title: 'Chapter',
      content: 'Original paragraph.',
    })
    const events: TaskEvent[] = []
    const agentFactory: AgentFactory = {
      create: async () => createAgent('Polished paragraph.'),
    }
    const eventSink: TaskEventSink = { publish: (event) => events.push(event) }
    const manager = new TaskManager({
      store: new TaskRepository(database),
      agentFactory,
      events: eventSink,
      runners: {
        'chapter-polish': createChapterPolishTaskRunner({
          service: workbench.narrative,
          agentFactory,
        }),
      },
    })

    const handle = manager.startChapterPolish({
      projectId: project.id,
      sessionId: 'session',
      chapterId: chapter.id,
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })
    const completed = await handle.completion

    expect(completed.status).toBe('completed')
    expect(completed.result).toEqual(expect.objectContaining({ status: 'completed' }))
    expect(completed.checkpoint).toEqual(
      expect.objectContaining({ operation: 'chapter_polish', status: 'completed' }),
    )
    expect(workbench.narrative.listRevisions(project.id, chapter.id)).toHaveLength(1)
    expect(events.some((event) => event.type === 'task:checkpoint')).toBe(true)
  })
})
