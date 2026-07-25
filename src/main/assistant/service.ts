import { randomUUID } from 'node:crypto'
import type { AgentEvent, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { AgentFactory, AgentRunResult, ProjectSessionAgent } from '../../agent/agent'
import type {
  DangerousOperationConfirmation,
  DangerousOperationRequest,
} from '../../agent/permissions'
import type { LlmConfigInput } from '../../agent/llm'
import { sanitizeErrorMessage, sanitizeSensitiveData } from '../../shared/security/sanitizeSensitiveData'
import {
  isJsonValue,
  type ChatMessage,
  type ChatRepository,
  type ChatSession,
  type ChatSessionType,
  type JsonObject,
} from '../database'
import type {
  AssistantConfirmationEvent,
  AssistantEvent,
  AssistantEventSink,
} from './events'

export interface CreateAssistantSessionInput {
  projectId: string
  title?: string
  sessionType?: ChatSessionType
  agentConfig?: JsonObject
}

export interface AssistantSessionView {
  session: ChatSession
  messages: ChatMessage[]
}

export interface AssistantPromptInput {
  sessionId: string
  prompt: string
  llm: LlmConfigInput
  systemPrompt?: string
}

export interface AssistantPromptResult extends AgentRunResult {
  status: 'completed' | 'cancelled' | 'error'
}

export interface AssistantServiceOptions {
  store: ChatRepository
  agentFactory: AgentFactory
  events: AssistantEventSink
  loadAdditionalTools?: (
    projectId: string,
    sessionId: string,
    llm: LlmConfigInput,
  ) => Promise<readonly AgentTool[]>
}

interface RuntimeSession {
  readonly sessionId: string
  readonly projectId: string
  readonly agent: ProjectSessionAgent
  messageCount: number
  lastPrompt: string | null
  activeController: AbortController | null
  promptChain: Promise<void>
}

interface PendingConfirmation {
  readonly resolve: (approved: boolean) => void
  readonly signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toJsonObject(value: unknown): JsonObject {
  const sanitized = sanitizeSensitiveData(value)
  if (isRecord(sanitized) && Object.values(sanitized).every(isJsonValue)) return sanitized as JsonObject
  return { value: toJsonValue(sanitized) }
}

function toJsonValue(value: unknown): JsonObject[string] {
  if (isJsonValue(value)) return value
  if (value instanceof Error) return sanitizeErrorMessage(value)
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value
  return String(value)
}

function messageText(message: AgentMessage): string {
  if (message.role === 'user') return typeof message.content === 'string' ? message.content : ''
  if (message.role === 'assistant' || message.role === 'toolResult') {
    return message.content
      .filter((content): content is Extract<typeof content, { type: 'text' }> => content.type === 'text')
      .map((content) => content.text)
      .join('')
  }
  return ''
}

function serializeMessage(message: AgentMessage): JsonObject {
  const parsed: unknown = sanitizeSensitiveData(message)
  if (!isRecord(parsed) || !Object.values(parsed).every(isJsonValue)) {
    throw new Error('Agent message cannot be serialized')
  }
  return parsed as JsonObject
}

function readStoredMessage(value: JsonObject[string]): AgentMessage | null {
  if (!isRecord(value)) return null
  if (value.role === 'user' && typeof value.timestamp === 'number') {
    return value as unknown as Extract<AgentMessage, { role: 'user' }>
  }
  if (
    value.role === 'assistant' &&
    typeof value.api === 'string' &&
    typeof value.provider === 'string' &&
    typeof value.model === 'string' &&
    typeof value.timestamp === 'number'
  ) {
    return value as unknown as Extract<AgentMessage, { role: 'assistant' }>
  }
  if (
    value.role === 'toolResult' &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    typeof value.timestamp === 'number'
  ) {
    return value as unknown as Extract<AgentMessage, { role: 'toolResult' }>
  }
  return null
}

function restoreMessages(messages: readonly ChatMessage[]): AgentMessage[] {
  return messages.flatMap((message) => {
    const stored = readStoredMessage(message.metadata.message)
    if (stored) return [stored]
    if (message.role === 'user') {
      return [{ role: 'user', content: message.content, timestamp: Date.parse(message.created_at) || Date.now() }]
    }
    return []
  })
}

function llmConfigForStorage(config: LlmConfigInput): JsonObject {
  return {
    provider: config.provider ?? 'openai-compatible',
    baseUrl: config.baseUrl,
    model: config.model,
    credentialId: config.credentialId ?? null,
    contextBudget: config.contextBudget ?? null,
    maxOutputTokens: config.maxOutputTokens ?? null,
    streamingEnabled: config.streamingEnabled ?? true,
  }
}

function createUserMessage(prompt: string): AgentMessage {
  return { role: 'user', content: prompt, timestamp: Date.now() }
}

type TextDeltaAgentEvent = Extract<AgentEvent, { type: 'message_update' }> & {
  assistantMessageEvent: Extract<Extract<AgentEvent, { type: 'message_update' }>['assistantMessageEvent'], { type: 'text_delta' }>
}

function isTextDelta(event: AgentEvent): event is TextDeltaAgentEvent {
  return event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta'
}

export class AssistantService {
  private readonly runtimes = new Map<string, RuntimeSession>()
  private readonly confirmations = new Map<string, PendingConfirmation>()

  public constructor(private readonly options: AssistantServiceOptions) {}

  public createSession(input: CreateAssistantSessionInput): AssistantSessionView {
    const session = this.options.store.create({
      project_id: input.projectId,
      title: input.title ?? '',
      session_type: input.sessionType ?? 'assistant',
      agent_config: input.agentConfig ?? {},
    })
    return { session, messages: [] }
  }

  public listSessions(projectId: string): ChatSession[] {
    return this.options.store.listByProject(projectId)
  }

  public getSession(sessionId: string): AssistantSessionView {
    const session = this.requireSession(sessionId)
    return { session, messages: this.options.store.listBySession(sessionId) }
  }

  public archiveSession(sessionId: string): ChatSession {
    const runtime = this.runtimes.get(sessionId)
    runtime?.agent.abort()
    runtime?.activeController?.abort()
    const session = this.options.store.update(sessionId, { status: 'archived' })
    if (!session) throw new Error(`Chat session not found: ${sessionId}`)
    runtime?.agent.dispose()
    this.runtimes.delete(sessionId)
    return session
  }

  public async prompt(input: AssistantPromptInput): Promise<AssistantPromptResult> {
    const session = this.requireSession(input.sessionId)
    if (session.status !== 'active') throw new Error(`Chat session is archived: ${session.id}`)
    if (!input.prompt.trim()) throw new Error('prompt is required')

    const runtime = await this.ensureRuntime(session, input.llm, input.systemPrompt)
    if (runtime.activeController) throw new Error(`Chat session is busy: ${session.id}`)

    const controller = new AbortController()
    runtime.activeController = controller
    const userMessage = this.options.store.append({
      session_id: session.id,
      role: 'user',
      content: input.prompt,
      metadata: { message: serializeMessage(createUserMessage(input.prompt)) },
    })
    runtime.messageCount += 1
    runtime.lastPrompt = input.prompt
    this.publish({ type: 'assistant:message', sessionId: session.id, message: userMessage })

    const run = async (): Promise<AssistantPromptResult> => {
      try {
        const result = await runtime.agent.prompt(input.prompt, {
          signal: controller.signal,
          onEvent: async (event) => this.handleAgentEvent(runtime, event),
        })
        const status = result.finishReason === 'aborted' || controller.signal.aborted
          ? 'cancelled'
          : result.errorMessage || result.finishReason === 'error'
            ? 'error'
            : 'completed'
        const safeResultError = result.errorMessage ? sanitizeErrorMessage(result.errorMessage) : undefined
        this.publish({
          type: 'assistant:end',
          sessionId: session.id,
          status,
          text: result.text,
          stats: result,
          ...(safeResultError ? { errorMessage: safeResultError } : {}),
        })
        return { ...result, ...(safeResultError ? { errorMessage: safeResultError } : {}), status }
      } catch (error) {
        const message = sanitizeErrorMessage(error)
        this.publish({ type: 'assistant:error', sessionId: session.id, error: message })
        const result: AssistantPromptResult = {
          text: '',
          status: controller.signal.aborted ? 'cancelled' : 'error',
          finishReason: controller.signal.aborted ? 'aborted' : 'error',
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          errorMessage: message,
        }
        this.publish({
          type: 'assistant:end',
          sessionId: session.id,
          status: result.status,
          text: '',
          stats: result,
          errorMessage: message,
        })
        return result
      } finally {
        runtime.activeController = null
      }
    }

    const previous = runtime.promptChain
    const current = previous.then(run, run)
    runtime.promptChain = current.then(() => undefined, () => undefined)
    return current
  }

  public cancel(sessionId: string): boolean {
    const runtime = this.runtimes.get(sessionId)
    if (!runtime?.activeController) return false
    runtime.activeController.abort()
    runtime.agent.abort()
    return true
  }

  public steer(sessionId: string, prompt: string): void {
    if (!prompt.trim()) throw new Error('steering prompt is required')
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) throw new Error(`Chat session is not running: ${sessionId}`)
    runtime.agent.steer?.(prompt)
  }

  public followUp(sessionId: string, prompt: string): void {
    if (!prompt.trim()) throw new Error('follow-up prompt is required')
    const runtime = this.runtimes.get(sessionId)
    if (!runtime) throw new Error(`Chat session is not running: ${sessionId}`)
    runtime.agent.followUp?.(prompt)
  }

  public confirmOperation(requestId: string, approved: boolean): boolean {
    const pending = this.confirmations.get(requestId)
    if (!pending) return false
    this.confirmations.delete(requestId)
    pending.resolve(approved)
    return true
  }

  public dispose(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.activeController?.abort()
      runtime.agent.dispose()
    }
    this.runtimes.clear()
    for (const pending of this.confirmations.values()) pending.resolve(false)
    this.confirmations.clear()
  }

  private requireSession(sessionId: string): ChatSession {
    const session = this.options.store.getById(sessionId)
    if (!session) throw new Error(`Chat session not found: ${sessionId}`)
    return session
  }

  private async ensureRuntime(
    session: ChatSession,
    llm: LlmConfigInput,
    systemPrompt?: string,
  ): Promise<RuntimeSession> {
    const existing = this.runtimes.get(session.id)
    if (existing) return existing
    const initialMessages = restoreMessages(this.options.store.listBySession(session.id))
    const additionalTools = this.options.loadAdditionalTools
      ? await this.options.loadAdditionalTools(session.project_id, session.id, llm)
      : []
    const confirm: DangerousOperationConfirmation = (request, signal) =>
      this.requestConfirmation(request, signal)
    const agent = await this.options.agentFactory.create({
      projectId: session.project_id,
      sessionId: session.id,
      llm,
      initialMessages,
      additionalTools,
      confirmDangerousOperation: confirm,
      systemPrompt: systemPrompt ?? '你是本地长篇创作助手。只依据当前项目和会话上下文工作，不补造未提供的事实。亲密内容默认关闭，只有项目明确启用时才可处理。写作输出避免破折号和过度省略号。',
    })
    const runtime: RuntimeSession = {
      sessionId: session.id,
      projectId: session.project_id,
      agent,
      messageCount: initialMessages.length,
      lastPrompt: null,
      activeController: null,
      promptChain: Promise.resolve(),
    }
    this.runtimes.set(session.id, runtime)
    this.options.store.update(session.id, { agent_config: llmConfigForStorage(llm) })
    return runtime
  }

  private async handleAgentEvent(runtime: RuntimeSession, event: AgentEvent): Promise<void> {
    if (isTextDelta(event)) {
      this.publish({
        type: 'assistant:delta',
        sessionId: runtime.sessionId,
        delta: event.assistantMessageEvent.delta,
      })
      return
    }
    if (event.type === 'tool_execution_start') {
      this.publish({
        type: 'assistant:tool:start',
        sessionId: runtime.sessionId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: toJsonObject(event.args),
      })
      return
    }
    if (event.type === 'tool_execution_update') {
      this.publish({
        type: 'assistant:tool:update',
        sessionId: runtime.sessionId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: toJsonObject(event.partialResult),
      })
      return
    }
    if (event.type === 'tool_execution_end') {
      this.publish({
        type: 'assistant:tool:end',
        sessionId: runtime.sessionId,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: toJsonObject(event.result),
        isError: event.isError,
      })
      return
    }
    if (event.type !== 'agent_end') return
    const candidateMessages = event.messages.length > runtime.messageCount
      ? event.messages.slice(runtime.messageCount)
      : event.messages
    const newMessages = candidateMessages.filter(
      (message) => message.role !== 'user' || messageText(message) !== runtime.lastPrompt,
    )
    for (const message of newMessages) {
      const persisted = this.persistAgentMessage(runtime.sessionId, message)
      this.publish({ type: 'assistant:message', sessionId: runtime.sessionId, message: persisted })
    }
    runtime.messageCount += newMessages.length
    runtime.lastPrompt = null
  }

  private persistAgentMessage(sessionId: string, message: AgentMessage): ChatMessage {
    if (message.role === 'toolResult') {
      return this.options.store.append({
        session_id: sessionId,
        role: 'tool',
        content: messageText(message),
        tool_name: message.toolName,
        metadata: { message: serializeMessage(message) },
      })
    }
    if (message.role === 'assistant') {
      return this.options.store.append({
        session_id: sessionId,
        role: 'assistant',
        content: messageText(message),
        metadata: { message: serializeMessage(message) },
      })
    }
    return this.options.store.append({
      session_id: sessionId,
      role: 'user',
      content: messageText(message),
      metadata: { message: serializeMessage(message) },
    })
  }

  private requestConfirmation(
    request: DangerousOperationRequest,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false)
    const requestId = randomUUID()
    const event: AssistantConfirmationEvent = {
      type: 'assistant:confirmation',
      requestId,
      sessionId: request.sessionId,
      projectId: request.projectId,
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      args: toJsonObject(request.args),
    }
    return new Promise<boolean>((resolve) => {
      const pending: PendingConfirmation = { resolve, signal }
      this.confirmations.set(requestId, pending)
      const cancel = (): void => {
        if (!this.confirmations.delete(requestId)) return
        resolve(false)
      }
      signal?.addEventListener('abort', cancel, { once: true })
      this.publish(event)
    })
  }

  private publish(event: AssistantEvent): void {
    this.options.events.publish(event)
  }
}
