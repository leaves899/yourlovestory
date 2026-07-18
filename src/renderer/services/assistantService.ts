import type { AssistantEvent, AssistantPromptInput } from '../../main/assistant'
import type { LlmConfigInput } from '../../agent/llm'

export interface ChatSessionView {
  id: string
  project_id: string
  title: string
  session_type: 'assistant' | 'writer' | 'reviewer'
  status: 'active' | 'archived'
  agent_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ChatMessageView {
  id: string
  session_id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  sequence: number
  tool_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AssistantSessionView {
  session: ChatSessionView
  messages: ChatMessageView[]
}

export interface AssistantService {
  listSessions(projectId: string): Promise<ChatSessionView[]>
  createSession(projectId: string, title: string, sessionType: ChatSessionView['session_type']): Promise<AssistantSessionView>
  getSession(sessionId: string): Promise<AssistantSessionView>
  archiveSession(sessionId: string): Promise<void>
  prompt(input: AssistantPromptInput): Promise<void>
  cancel(sessionId: string): Promise<void>
  confirm(requestId: string, approved: boolean): Promise<void>
  subscribe(listener: (event: AssistantEvent) => void): () => void
}

const assistantService: AssistantService = {
  listSessions: async (projectId) => {
    const response = await window.electronAPI.listAssistantSessions(projectId)
    if (!response.success) throw new Error('加载会话失败')
    return response.data
  },
  createSession: async (projectId, title, sessionType) => {
    const response = await window.electronAPI.createAssistantSession({
      projectId,
      title,
      sessionType,
    })
    if (!response.success) throw new Error('创建会话失败')
    return response.data
  },
  getSession: async (sessionId) => {
    const response = await window.electronAPI.getAssistantSession(sessionId)
    if (!response.success) throw new Error('加载会话失败')
    return response.data
  },
  archiveSession: async (sessionId) => {
    const response = await window.electronAPI.archiveAssistantSession(sessionId)
    if (!response.success) throw new Error('归档会话失败')
  },
  prompt: async (input) => {
    const response = await window.electronAPI.promptAssistant(input)
    if (!response.success) throw new Error('发送提示失败')
  },
  cancel: async (sessionId) => {
    const response = await window.electronAPI.cancelAssistant(sessionId)
    if (!response.success) throw new Error('停止会话失败')
  },
  confirm: async (requestId, approved) => {
    const response = await window.electronAPI.confirmAssistantOperation(requestId, approved)
    if (!response.success) throw new Error('确认操作失败')
  },
  subscribe: (listener) => window.electronAPI.onAssistantEvent(listener),
}

export function createLlmConfig(input: {
  baseUrl: string
  model: string
  apiKey?: string
  contextBudget: string
  maxOutputTokens: string
}): LlmConfigInput {
  const parsePositive = (value: string): number | undefined => {
    const number = Number(value)
    return Number.isInteger(number) && number > 0 ? number : undefined
  }
  return {
    provider: 'openai-compatible',
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey: input.apiKey,
    contextBudget: parsePositive(input.contextBudget),
    maxOutputTokens: parsePositive(input.maxOutputTokens),
    streamingEnabled: true,
  }
}

export default assistantService
