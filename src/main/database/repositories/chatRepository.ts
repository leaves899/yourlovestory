import { randomUUID } from 'node:crypto'
import {
  parseJsonObject,
  stringifyJsonObject,
  type JsonObject,
} from '../json'
import type { SqliteDatabase } from '../types'

export type ChatSessionType = 'assistant' | 'writer' | 'reviewer'
export type ChatSessionStatus = 'active' | 'archived'
export type ChatMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatSession {
  id: string
  project_id: string
  title: string
  session_type: ChatSessionType
  status: ChatSessionStatus
  agent_config: JsonObject
  created_at: string
  updated_at: string
}

export interface CreateChatSessionInput {
  id?: string
  project_id: string
  title?: string
  session_type?: ChatSessionType
  agent_config?: JsonObject
}

export interface UpdateChatSessionInput {
  title?: string
  status?: ChatSessionStatus
  agent_config?: JsonObject
}

export interface ChatMessage {
  id: string
  session_id: string
  role: ChatMessageRole
  content: string
  sequence: number
  tool_name: string | null
  metadata: JsonObject
  created_at: string
}

export interface AppendChatMessageInput {
  id?: string
  session_id: string
  role: ChatMessageRole
  content?: string
  tool_name?: string | null
  metadata?: JsonObject
}

export interface ChatSessionStore {
  create(input: CreateChatSessionInput): ChatSession
  getById(id: string): ChatSession | null
  listByProject(projectId: string): ChatSession[]
  update(id: string, input: UpdateChatSessionInput): ChatSession | null
}

export interface ChatMessageStore {
  append(input: AppendChatMessageInput): ChatMessage
  listBySession(sessionId: string): ChatMessage[]
  deleteBySession(sessionId: string): number
}

export interface ChatStore extends ChatSessionStore, ChatMessageStore {}

interface ChatSessionRow {
  id: string
  project_id: string
  title: string
  session_type: string
  status: string
  agent_config_json: string
  created_at: string
  updated_at: string
}

interface ChatMessageRow {
  id: string
  session_id: string
  role: string
  content: string
  sequence: number
  tool_name: string | null
  metadata_json: string
  created_at: string
}

const sessionTypes: readonly ChatSessionType[] = ['assistant', 'writer', 'reviewer']
const sessionStatuses: readonly ChatSessionStatus[] = ['active', 'archived']
const messageRoles: readonly ChatMessageRole[] = ['system', 'user', 'assistant', 'tool']

function now(): string {
  return new Date().toISOString()
}

function toSession(row: ChatSessionRow): ChatSession {
  if (!sessionTypes.includes(row.session_type as ChatSessionType)) {
    throw new Error(`Unknown chat session type: ${row.session_type}`)
  }
  if (!sessionStatuses.includes(row.status as ChatSessionStatus)) {
    throw new Error(`Unknown chat session status: ${row.status}`)
  }
  const agentConfig = parseJsonObject(row.agent_config_json, 'chat session agent_config')
  if (!agentConfig) throw new Error('Chat session agent_config cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    session_type: row.session_type as ChatSessionType,
    status: row.status as ChatSessionStatus,
    agent_config: agentConfig,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toMessage(row: ChatMessageRow): ChatMessage {
  if (!messageRoles.includes(row.role as ChatMessageRole)) {
    throw new Error(`Unknown chat message role: ${row.role}`)
  }
  const metadata = parseJsonObject(row.metadata_json, 'chat message metadata')
  if (!metadata) throw new Error('Chat message metadata cannot be null')
  return {
    id: row.id,
    session_id: row.session_id,
    role: row.role as ChatMessageRole,
    content: row.content,
    sequence: row.sequence,
    tool_name: row.tool_name,
    metadata,
    created_at: row.created_at,
  }
}

export class ChatRepository implements ChatStore {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateChatSessionInput): ChatSession {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO chat_sessions (
          id, project_id, title, session_type, status, agent_config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.title ?? '',
        input.session_type ?? 'assistant',
        stringifyJsonObject(input.agent_config ?? {}),
        timestamp,
        timestamp,
      )
    const session = this.getById(id)
    if (!session) throw new Error('Chat session was not created')
    return session
  }

  public getById(id: string): ChatSession | null {
    const row = this.database
      .prepare<ChatSessionRow>('SELECT * FROM chat_sessions WHERE id = ?')
      .get(id)
    return row ? toSession(row) : null
  }

  public listByProject(projectId: string): ChatSession[] {
    return this.database
      .prepare<ChatSessionRow>(
        `SELECT * FROM chat_sessions
         WHERE project_id = ?
         ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, updated_at DESC, id`,
      )
      .all(projectId)
      .map(toSession)
  }

  public update(id: string, input: UpdateChatSessionInput): ChatSession | null {
    const current = this.getById(id)
    if (!current) return null
    const next = {
      title: input.title ?? current.title,
      status: input.status ?? current.status,
      agent_config: input.agent_config ?? current.agent_config,
    }
    this.database
      .prepare(
        `UPDATE chat_sessions
         SET title = ?, status = ?, agent_config_json = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.title, next.status, stringifyJsonObject(next.agent_config), now(), id)
    return this.getById(id)
  }

  public append(input: AppendChatMessageInput): ChatMessage {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    const append = this.database.transaction(() => {
      const session = this.getById(input.session_id)
      if (!session) throw new Error(`Chat session not found: ${input.session_id}`)
      if (session.status !== 'active') throw new Error(`Chat session is archived: ${session.id}`)
      const next = this.database
        .prepare<{ next_sequence: number }>(
          `SELECT COALESCE(MAX(sequence), -1) + 1 AS next_sequence
           FROM chat_messages WHERE session_id = ?`,
        )
        .get(input.session_id)
      const sequence = next?.next_sequence ?? 0
      this.database
        .prepare(
          `INSERT INTO chat_messages (
            id, session_id, role, content, sequence, tool_name, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.session_id,
          input.role,
          input.content ?? '',
          sequence,
          input.tool_name ?? null,
          stringifyJsonObject(input.metadata ?? {}),
          timestamp,
        )
    })
    append()
    const message = this.database
      .prepare<ChatMessageRow>('SELECT * FROM chat_messages WHERE id = ?')
      .get(id)
    if (!message) throw new Error('Chat message was not created')
    return toMessage(message)
  }

  public listBySession(sessionId: string): ChatMessage[] {
    return this.database
      .prepare<ChatMessageRow>(
        'SELECT * FROM chat_messages WHERE session_id = ? ORDER BY sequence, id',
      )
      .all(sessionId)
      .map(toMessage)
  }

  public deleteBySession(sessionId: string): number {
    const result = this.database
      .prepare('DELETE FROM chat_messages WHERE session_id = ?')
      .run(sessionId)
    return result.changes
  }
}
