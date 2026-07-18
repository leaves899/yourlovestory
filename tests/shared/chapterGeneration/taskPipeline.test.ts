import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import {
  initializeDatabase,
  TaskRepository,
  type SqliteDatabase,
} from '@/main/database'
import type { AgentFactory, AgentRunResult, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import { WorkbenchService } from '@/main/workbench'
import {
  createChapterGenerationTaskRunner,
  TaskManager,
  type TaskEvent,
  type TaskEventSink,
} from '@/main/tasks'

function message(text: string, stopReason: 'stop' | 'aborted' = 'stop'): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'openai-compatible',
    model: 'test-model',
    usage: { ...emptyTokenUsage() },
    stopReason,
    timestamp: Date.now(),
  }
}

function result(text: string, finishReason: 'stop' | 'aborted' = 'stop'): AgentRunResult {
  return {
    text,
    finishReason,
    usage: { ...emptyTokenUsage() },
    assistantMessage: message(text, finishReason),
  }
}

async function emitText(
  options: Parameters<ProjectSessionAgent['prompt']>[1],
  text: string,
): Promise<void> {
  const assistant = message(text)
  const event: AgentEvent = {
    type: 'message_update',
    message: assistant,
    assistantMessageEvent: {
      type: 'text_delta',
      contentIndex: 0,
      delta: text,
      partial: assistant,
    },
  }
  await options?.onEvent?.(event)
}

function setupOutlines(workbench: WorkbenchService, slug: string): {
  projectId: string
  chapterOutlineId: string
} {
  const project = workbench.createProject({ slug, name: 'Task Pipeline Project' })
  const volume = workbench.createVolume({
    project_id: project.id,
    volume_number: 1,
    title: 'Volume',
  })
  const volumeOutline = workbench.createVolumeOutline({
    project_id: project.id,
    volume_id: volume.id,
    summary: 'Volume summary',
  })
  const chapterOutline = workbench.createChapterOutline({
    project_id: project.id,
    volume_id: volume.id,
    chapter_number: 1,
    title: 'Chapter',
    summary: 'Chapter summary',
    key_events: ['Event'],
  })
  workbench.confirmVolumeOutline(project.id, volumeOutline.id, volumeOutline.version)
  workbench.confirmChapterOutline(project.id, chapterOutline.id, chapterOutline.version)
  return { projectId: project.id, chapterOutlineId: chapterOutline.id }
}

describe('chapter generation task pipeline', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-task-pipeline-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('persists stream checkpoints on cancellation and resumes from the saved body', async () => {
    const workbench = new WorkbenchService(database)
    const outline = setupOutlines(workbench, 'task-pipeline-project')
    const events: TaskEvent[] = []
    let resolveBodyStarted: () => void = () => undefined
    const bodyStarted = new Promise<void>((resolve) => {
      resolveBodyStarted = resolve
    })
    let agentRuns = 0

    function createAgent(runNumber: number): ProjectSessionAgent {
      return {
        projectId: outline.projectId,
        sessionId: 'session-pipeline',
        prompt: async (prompt, options = {}) => {
          if (prompt.startsWith('请生成当前章节')) {
            if (runNumber === 1) {
              await emitText(options, '部分正文')
              resolveBodyStarted()
              return new Promise<AgentRunResult>((resolve) => {
                options.signal?.addEventListener(
                  'abort',
                  () => resolve(result('部分正文', 'aborted')),
                  { once: true },
                )
              })
            }
            await emitText(options, '续写正文')
            return result('续写正文')
          }
          if (prompt.startsWith('请为以下章节正文')) {
            await emitText(options, '章节摘要')
            return result('章节摘要')
          }
          await emitText(options, '{"passed":true,"summary":"一致","findings":[]}')
          return result('{"passed":true,"summary":"一致","findings":[]}')
        },
        abort: jest.fn(),
        dispose: jest.fn(),
      }
    }

    const agentFactory: AgentFactory = {
      create: async () => {
        agentRuns += 1
        return createAgent(agentRuns)
      },
    }

    const eventSink: TaskEventSink = { publish: (event) => events.push(event) }
    const manager = new TaskManager({
      store: new TaskRepository(database),
      agentFactory: agentFactory!,
      events: eventSink,
      runners: {
        'chapter-generation': createChapterGenerationTaskRunner({
          service: workbench.chapterGeneration,
          agentFactory: agentFactory!,
        }),
      },
    })

    const handle = manager.startChapterGeneration({
      projectId: outline.projectId,
      sessionId: 'session-pipeline',
      chapterOutlineId: outline.chapterOutlineId,
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })
    await bodyStarted
    expect(manager.cancel(handle.taskId)).toBe(true)
    const cancelled = await handle.completion

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.checkpoint).toEqual(expect.objectContaining({ stage: 'body', body: '部分正文' }))

    const resumed = manager.resume(handle.taskId)
    expect(resumed).not.toBeNull()
    const completed = await resumed!.completion

    expect(completed.status).toBe('completed')
    expect(completed.checkpoint).toEqual(expect.objectContaining({ stage: 'review' }))
    expect(completed.result).toEqual(
      expect.objectContaining({ review_required: true, fact_check_passed: true }),
    )
    expect(workbench.chapterVersions.listByChapter(workbench.chapters.listByProject(outline.projectId)[0].id)).toHaveLength(1)
    expect(events.some((event) => event.type === 'task:checkpoint')).toBe(true)
    expect(events.some((event) => event.type === 'task:review')).toBe(true)
    expect(events.some((event) => event.type === 'task:chunk')).toBe(true)
    expect(agentRuns).toBe(2)
  })
})
