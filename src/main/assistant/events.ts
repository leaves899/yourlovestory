import type { LlmRunStats } from '../../agent/llm'
import type { ChatMessage } from '../database'
import type { JsonObject } from '../database'

export type AssistantEventChannel =
  | 'assistant:message'
  | 'assistant:delta'
  | 'assistant:tool:start'
  | 'assistant:tool:update'
  | 'assistant:tool:end'
  | 'assistant:confirmation'
  | 'assistant:end'
  | 'assistant:error'

export interface AssistantMessageEvent {
  type: 'assistant:message'
  sessionId: string
  message: ChatMessage
}

export interface AssistantDeltaEvent {
  type: 'assistant:delta'
  sessionId: string
  delta: string
}

export interface AssistantToolStartEvent {
  type: 'assistant:tool:start'
  sessionId: string
  toolCallId: string
  toolName: string
  args: JsonObject
}

export interface AssistantToolUpdateEvent {
  type: 'assistant:tool:update'
  sessionId: string
  toolCallId: string
  toolName: string
  partialResult: JsonObject
}

export interface AssistantToolEndEvent {
  type: 'assistant:tool:end'
  sessionId: string
  toolCallId: string
  toolName: string
  result: JsonObject
  isError: boolean
}

export interface AssistantConfirmationEvent {
  type: 'assistant:confirmation'
  requestId: string
  sessionId: string
  projectId: string
  toolCallId: string
  toolName: string
  args: JsonObject
}

export interface AssistantEndEvent {
  type: 'assistant:end'
  sessionId: string
  status: 'completed' | 'cancelled' | 'error'
  text: string
  stats: LlmRunStats
  errorMessage?: string
}

export interface AssistantErrorEvent {
  type: 'assistant:error'
  sessionId: string
  error: string
}

export type AssistantEvent =
  | AssistantMessageEvent
  | AssistantDeltaEvent
  | AssistantToolStartEvent
  | AssistantToolUpdateEvent
  | AssistantToolEndEvent
  | AssistantConfirmationEvent
  | AssistantEndEvent
  | AssistantErrorEvent

export interface AssistantEventSink {
  publish(event: AssistantEvent): void
}

export interface AssistantWebContentsLike {
  readonly isDestroyed?: () => boolean
  send(channel: AssistantEventChannel, payload: unknown): void
}

export function createWebContentsAssistantEventSink(
  getWebContents: () => AssistantWebContentsLike | null,
): AssistantEventSink {
  return {
    publish: (event) => {
      const webContents = getWebContents()
      if (!webContents || webContents.isDestroyed?.()) return
      webContents.send(event.type, event)
    },
  }
}
