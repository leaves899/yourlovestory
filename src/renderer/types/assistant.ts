export interface RendererChatSession {
  id: string
  project_id: string
  title: string
  session_type: 'assistant' | 'writer' | 'reviewer'
  status: 'active' | 'archived'
  agent_config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RendererChatMessage {
  id: string
  session_id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  sequence: number
  tool_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface RendererAssistantSessionView {
  session: RendererChatSession
  messages: RendererChatMessage[]
}
