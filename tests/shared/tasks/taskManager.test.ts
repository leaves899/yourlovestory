import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  initializeDatabase,
  ProjectRepository,
  TaskRepository,
  type SqliteDatabase,
} from '@/main/database'
import type { AgentFactory, AgentRunResult, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import { TaskManager, type TaskEvent, type TaskEventSink } from '@/main/tasks'

function message(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: '完成' }],
    api: 'openai-completions',
    provider: 'openai-compatible',
    model: 'test-model',
    usage: { ...emptyTokenUsage() },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function successfulResult(): AgentRunResult {
  return {
    text: '完成',
    finishReason: 'stop',
    usage: { ...emptyTokenUsage() },
    assistantMessage: message(),
  }
}

function eventStreamEvents(): AgentEvent[] {
  const assistant = message()
  return [
    { type: 'agent_start' },
    { type: 'message_update', message: assistant, assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: '完成', partial: assistant } },
  ]
}

describe('TaskManager', () => {
  let tempRoot: string
  let database: SqliteDatabase
  let projectId: string

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-manager-'))
    database = initializeDatabase(tempRoot)
    projectId = new ProjectRepository(database).create({
      slug: 'manager-project',
      name: 'Manager Project',
    }).id
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('persists and publishes task start, stage, chunks, and end events', async () => {
    const events: TaskEvent[] = []
    const eventSink: TaskEventSink = { publish: (event) => events.push(event) }
    const agent: ProjectSessionAgent = {
      projectId,
      sessionId: 'session-1',
      prompt: async (_prompt, options = {}) => {
        for (const event of eventStreamEvents()) await options.onEvent?.(event)
        return successfulResult()
      },
      abort: jest.fn(),
      dispose: jest.fn(),
    }
    const agentFactory: AgentFactory = { create: async () => agent }
    const manager = new TaskManager({
      store: new TaskRepository(database),
      agentFactory,
      events: eventSink,
      now: () => '2026-07-18T00:00:00.000Z',
    })

    const handle = manager.start({
      projectId,
      sessionId: 'session-1',
      taskType: 'assistant',
      prompt: '写一段内容',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })
    const result = await handle.completion

    expect(result.status).toBe('completed')
    expect(events.map((event) => event.type)).toEqual([
      'task:start',
      'task:stage',
      'task:stage',
      'task:chunk',
      'task:end',
    ])
    expect(events.find((event) => event.type === 'task:chunk')).toEqual(
      expect.objectContaining({ taskId: handle.taskId, chunk: '完成' }),
    )
    expect(result.result).toEqual(expect.objectContaining({ text: '完成', finishReason: 'stop' }))
  })

  test('aborts an active task through its AbortController and persists cancellation', async () => {
    const events: TaskEvent[] = []
    const agent: ProjectSessionAgent = {
      projectId,
      sessionId: 'session-2',
      prompt: async (_prompt, options = {}) => {
        if (options.signal?.aborted) {
          return { ...successfulResult(), finishReason: 'aborted' }
        }
        return new Promise<AgentRunResult>((resolve) => {
          options.signal?.addEventListener('abort', () => {
            resolve({ ...successfulResult(), finishReason: 'aborted' })
          }, { once: true })
        })
      },
      abort: jest.fn(),
      dispose: jest.fn(),
    }
    const manager = new TaskManager({
      store: new TaskRepository(database),
      agentFactory: { create: async () => agent },
      events: { publish: (event) => events.push(event) },
    })
    const handle = manager.start({
      projectId,
      sessionId: 'session-2',
      taskType: 'assistant',
      prompt: '可取消任务',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })

    expect(manager.cancel(handle.taskId)).toBe(true)
    const result = await handle.completion

    expect(result.status).toBe('cancelled')
    expect(result.cancel_requested).toBe(true)
    expect(events[events.length - 1]).toEqual(
      expect.objectContaining({ type: 'task:end', status: 'cancelled' }),
    )
  })
})
