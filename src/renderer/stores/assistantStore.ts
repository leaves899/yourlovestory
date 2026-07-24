import { create } from 'zustand'
import type { AssistantEvent, AssistantPromptInput } from '../../main/assistant'
import assistantService, {
  createLlmConfig,
  type ChatMessageView,
  type ChatSessionView,
} from '../services/assistantService'

export interface AssistantLlmForm {
  baseUrl: string
  model: string
  /** Non-secret reference only. The renderer never holds a resolved API Key. */
  credentialId?: string
  contextBudget: string
  maxOutputTokens: string
}

export interface AssistantConfirmation {
  requestId: string
  toolName: string
  args: Record<string, unknown>
}

interface AssistantStoreState {
  projectId: string | null
  sessions: ChatSessionView[]
  activeSessionId: string | null
  messages: ChatMessageView[]
  streamingText: string
  toolStatus: string
  busy: boolean
  loading: boolean
  error: string | null
  confirmation: AssistantConfirmation | null
  subscribed: boolean
  initialize: (projectId: string) => Promise<void>
  createSession: (sessionType?: ChatSessionView['session_type']) => Promise<void>
  loadSession: (sessionId: string) => Promise<void>
  archiveSession: (sessionId?: string) => Promise<void>
  sendPrompt: (prompt: string, form: AssistantLlmForm) => Promise<void>
  stop: () => Promise<void>
  confirm: (approved: boolean) => Promise<void>
  subscribeToEvents: () => () => void
  clearError: () => void
}

function readError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '助手操作失败'
}

export const useAssistantStore = create<AssistantStoreState>((set, get) => ({
  projectId: null,
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamingText: '',
  toolStatus: '',
  busy: false,
  loading: false,
  error: null,
  confirmation: null,
  subscribed: false,

  initialize: async (projectId) => {
    set({ projectId, loading: true, error: null })
    try {
      let sessions = await assistantService.listSessions(projectId)
      if (sessions.length === 0) {
        const created = await assistantService.createSession(projectId, '创作助手', 'assistant')
        sessions = [created.session]
      }
      set({ sessions, loading: false })
      const preferred = sessions.find((session) => session.status === 'active') ?? sessions[0]
      if (preferred) await get().loadSession(preferred.id)
    } catch (error) {
      set({ loading: false, error: readError(error) })
    }
  },

  createSession: async (sessionType = 'assistant') => {
    const projectId = get().projectId
    if (!projectId) return
    set({ loading: true, error: null })
    try {
      const created = await assistantService.createSession(
        projectId,
        sessionType === 'writer' ? '写作任务' : sessionType === 'reviewer' ? '审核会话' : '创作助手',
        sessionType,
      )
      set((state) => ({ sessions: [created.session, ...state.sessions], loading: false }))
      await get().loadSession(created.session.id)
    } catch (error) {
      set({ loading: false, error: readError(error) })
    }
  },

  loadSession: async (sessionId) => {
    set({ loading: true, error: null })
    try {
      const view = await assistantService.getSession(sessionId)
      set({
        activeSessionId: sessionId,
        messages: view.messages,
        streamingText: '',
        toolStatus: '',
        confirmation: null,
        loading: false,
      })
    } catch (error) {
      set({ loading: false, error: readError(error) })
    }
  },

  archiveSession: async (sessionId) => {
    const id = sessionId ?? get().activeSessionId
    if (!id) return
    try {
      await assistantService.archiveSession(id)
      set((state) => ({
        sessions: state.sessions.map((session) => session.id === id ? { ...session, status: 'archived' } : session),
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        messages: state.activeSessionId === id ? [] : state.messages,
        error: null,
      }))
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  sendPrompt: async (prompt, form) => {
    const sessionId = get().activeSessionId
    if (!sessionId || !prompt.trim()) return
    set({ busy: true, error: null, streamingText: '', toolStatus: '' })
    const input: AssistantPromptInput = {
      sessionId,
      prompt: prompt.trim(),
      llm: createLlmConfig(form),
    }
    try {
      await assistantService.prompt(input)
      set({ busy: false })
    } catch (error) {
      set({ busy: false, error: readError(error) })
    }
  },

  stop: async () => {
    const sessionId = get().activeSessionId
    if (!sessionId) return
    try {
      await assistantService.cancel(sessionId)
      set({ busy: false, toolStatus: '已请求停止' })
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  confirm: async (approved) => {
    const confirmation = get().confirmation
    if (!confirmation) return
    try {
      await assistantService.confirm(confirmation.requestId, approved)
      set({ confirmation: null })
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  subscribeToEvents: () => {
    if (get().subscribed) return () => undefined
    set({ subscribed: true })
    const unsubscribe = assistantService.subscribe((event: AssistantEvent) => {
      if ('sessionId' in event && event.sessionId !== get().activeSessionId) return
      if (event.type === 'assistant:message') {
        set((state) => ({
          messages: state.messages.some((message) => message.id === event.message.id)
            ? state.messages
            : [...state.messages, event.message as ChatMessageView],
          streamingText: event.message.role === 'assistant' ? '' : state.streamingText,
        }))
        return
      }
      if (event.type === 'assistant:delta') {
        set((state) => ({ streamingText: state.streamingText + event.delta }))
        return
      }
      if (event.type === 'assistant:tool:start') {
        set({ toolStatus: `正在使用 ${event.toolName}` })
        return
      }
      if (event.type === 'assistant:tool:end') {
        set({ toolStatus: event.isError ? `${event.toolName} 执行失败` : `${event.toolName} 已完成` })
        return
      }
      if (event.type === 'assistant:confirmation') {
        set({ confirmation: { requestId: event.requestId, toolName: event.toolName, args: event.args } })
        return
      }
      if (event.type === 'assistant:error') {
        set({ busy: false, error: event.error })
        return
      }
      if (event.type === 'assistant:end') {
        set({
          busy: false,
          toolStatus: '',
          error: event.status === 'error' ? event.errorMessage ?? 'Agent 运行失败' : null,
        })
      }
    })
    return () => {
      unsubscribe()
      set({ subscribed: false })
    }
  },

  clearError: () => set({ error: null }),
}))

export type { AssistantStoreState }
