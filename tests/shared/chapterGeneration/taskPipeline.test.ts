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
          if (prompt.includes('续写或生成完整') || prompt.includes('本章正文')) {
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
          if (prompt.includes('生成客观、精炼的章节摘要') || prompt.includes('只输出摘要文本')) {
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
      llm: {
        baseUrl: 'https://example.invalid/v1',
        model: 'test-model',
        contextBudget: 48_000,
        maxOutputTokens: 2_000,
      },
    })
    await bodyStarted
    expect(manager.cancel(handle.taskId)).toBe(true)
    const cancelled = await handle.completion

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.checkpoint).toEqual(expect.objectContaining({ stage: 'body', body: '部分正文' }))
    expect(cancelled.checkpoint).toEqual(
      expect.objectContaining({
        stage_compiles: expect.objectContaining({
          body: expect.objectContaining({
            prompt_version: 'context-compiler/v1',
            model_params: expect.objectContaining({
              model: 'test-model',
              context_budget: 48_000,
              max_output_tokens: 2_000,
            }),
            trace: expect.objectContaining({
              selected: expect.any(Array),
              discarded: expect.any(Array),
            }),
          }),
        }),
      }),
    )
    expect(
      (cancelled.checkpoint as { stage_compiles?: { body?: { trace?: { final_prompt?: string } } } })
        ?.stage_compiles?.body?.trace?.final_prompt,
    ).toBeUndefined()

    const resumed = manager.resume(handle.taskId)
    expect(resumed).not.toBeNull()
    const completed = await resumed!.completion

    expect(completed.status).toBe('completed')
    expect(completed.checkpoint).toEqual(expect.objectContaining({ stage: 'review' }))
    expect(completed.result).toEqual(
      expect.objectContaining({
        review_required: true,
        fact_check_passed: true,
        prompt_version: 'context-compiler/v1',
        stage_compiles: expect.objectContaining({
          body: expect.any(Object),
          summary: expect.any(Object),
          fact_check: expect.any(Object),
        }),
      }),
    )
    expect(completed.chapter_id).toBe(completed.result?.chapter_id)
    expect(workbench.chapterVersions.listByChapter(workbench.chapters.listByProject(outline.projectId)[0].id)).toHaveLength(1)
    expect(events.some((event) => event.type === 'task:checkpoint')).toBe(true)
    expect(events.some((event) => event.type === 'task:review')).toBe(true)
    expect(events.some((event) => event.type === 'task:chunk')).toBe(true)
    expect(agentRuns).toBe(2)
  })

  test('budget exceeded fails task but persists stage_compiles body failure trace without agent prompt', async () => {
    const workbench = new WorkbenchService(database)
    const outline = setupOutlines(workbench, 'task-pipeline-budget-fail')
    const events: TaskEvent[] = []
    const promptMock = jest.fn(async () => result('should-not-run'))
    const agentFactory: AgentFactory = {
      create: async () => ({
        projectId: outline.projectId,
        sessionId: 'session-budget-fail',
        prompt: promptMock,
        abort: jest.fn(),
        dispose: jest.fn(),
      }),
    }
    const store = new TaskRepository(database)
    const manager = new TaskManager({
      store,
      agentFactory,
      events: { publish: (event) => events.push(event) },
      runners: {
        'chapter-generation': createChapterGenerationTaskRunner({
          service: workbench.chapterGeneration,
          agentFactory,
        }),
      },
    })

    const handle = manager.startChapterGeneration({
      projectId: outline.projectId,
      sessionId: 'session-budget-fail',
      chapterOutlineId: outline.chapterOutlineId,
      llm: {
        baseUrl: 'https://example.invalid/v1',
        model: 'test-model',
        contextBudget: 80,
        maxOutputTokens: 60,
      },
    })
    const failed = await handle.completion
    const persisted = store.getById(handle.taskId)

    expect(failed.status).toBe('failed')
    expect(persisted?.status).toBe('failed')
    expect(promptMock).not.toHaveBeenCalled()

    const checkpoint = persisted?.checkpoint ?? failed.checkpoint
    expect(checkpoint).toEqual(
      expect.objectContaining({
        stage_compiles: expect.objectContaining({
          body: expect.objectContaining({
            prompt_version: 'context-compiler/v1',
            model_params: expect.objectContaining({
              model: 'test-model',
              context_budget: 80,
              max_output_tokens: 60,
            }),
            trace: expect.objectContaining({
              errors: expect.arrayContaining([expect.stringContaining('超过可用预算')]),
              discarded: expect.any(Array),
              metadata: expect.objectContaining({
                strategy_id: 'chapter_body/v1',
                prompt_version: 'context-compiler/v1',
              }),
            }),
          }),
        }),
      }),
    )
    const bodyTrace = (
      checkpoint as {
        stage_compiles?: {
          body?: {
            trace?: {
              errors?: unknown[]
              discarded?: unknown[]
              final_prompt?: string
              metadata?: { strategy_id?: string }
            }
          }
        }
      }
    ).stage_compiles?.body?.trace
    expect(bodyTrace?.errors?.length).toBeGreaterThan(0)
    expect(bodyTrace?.discarded?.length).toBeGreaterThan(0)
    expect(bodyTrace?.final_prompt).toBeUndefined()
    expect(bodyTrace?.metadata?.strategy_id).toBe('chapter_body/v1')
    expect(events.some((event) => event.type === 'task:checkpoint')).toBe(true)
  })
})
