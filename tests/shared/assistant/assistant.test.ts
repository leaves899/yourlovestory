import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AgentEvent } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import {
  AssistantService,
  type AssistantEvent,
} from '@/main/assistant'
import type { AgentFactory, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import {
  ChatRepository,
  initializeDatabase,
  ProjectRepository,
  type SqliteDatabase,
} from '@/main/database'

function assistantMessage(text: string): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'test-provider',
    model: 'test-model',
    usage: emptyTokenUsage(),
    stopReason: 'stop',
    timestamp: 2,
  }
}

describe('AssistantService', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-assistant-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('persists a streamed turn and restores it into the next runtime', async () => {
    const project = new ProjectRepository(database).create({
      slug: 'assistant-project',
      name: 'Assistant Project',
    })
    const events: AssistantEvent[] = []
    let restoredMessages = 0
    const agentFactory: AgentFactory = {
      create: async (options): Promise<ProjectSessionAgent> => {
        restoredMessages = options.initialMessages?.length ?? 0
        const agent: ProjectSessionAgent = {
          projectId: options.projectId,
          sessionId: options.sessionId,
          prompt: async (prompt, promptOptions = {}) => {
            const user = { role: 'user' as const, content: prompt, timestamp: 1 }
            const assistant = assistantMessage('已经整理好。')
            const update: AgentEvent = {
              type: 'message_update',
              message: assistant,
              assistantMessageEvent: {
                type: 'text_delta',
                contentIndex: 0,
                delta: '已经整理好。',
                partial: assistant,
              },
            }
            await promptOptions.onEvent?.(update)
            await promptOptions.onEvent?.({
              type: 'agent_end',
              messages: [user, assistant],
            })
            return {
              text: '已经整理好。',
              finishReason: 'stop',
              usage: emptyTokenUsage(),
              assistantMessage: assistant,
            }
          },
          abort: () => undefined,
          dispose: () => undefined,
        }
        return agent
      },
    }
    const service = new AssistantService({
      store: new ChatRepository(database),
      agentFactory,
      events: { publish: (event) => events.push(event) },
    })
    const session = service.createSession({ projectId: project.id, title: '助手会话' })

    const result = await service.prompt({
      sessionId: session.session.id,
      prompt: '请整理这一章。',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })

    expect(result.status).toBe('completed')
    expect(result.text).toBe('已经整理好。')
    expect(service.getSession(session.session.id).messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ])
    expect(events.some((event) => event.type === 'assistant:delta')).toBe(true)
    expect(events.some((event) => event.type === 'assistant:end')).toBe(true)

    service.dispose()
    const restored = new AssistantService({
      store: new ChatRepository(database),
      agentFactory,
      events: { publish: (event) => events.push(event) },
    })
    await restored.prompt({
      sessionId: session.session.id,
      prompt: '继续。',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
    })
    expect(restoredMessages).toBe(2)
    restored.dispose()
  })
})
