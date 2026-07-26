import type {
  Agent,
  AgentEvent,
  AgentMessage,
  AgentOptions,
  AgentTool,
} from '@earendil-works/pi-agent-core'
import type { AssistantMessage, Message, StopReason } from '@earendil-works/pi-ai'
import { createContextBudgetTransformer } from './llm/context'
import { normalizeLlmConfig } from './llm/config'
import { createDynamicPiModel } from './llm/model'
import { createRetryingStreamFn } from './llm/stream'
import {
  emptyTokenUsage,
  toTokenUsage,
  type LlmConfig,
  type LlmConfigInput,
  type ResolvedLlmConfig,
  type LlmRunStats,
} from './llm/types'
import {
  configureToolExecution,
  createDangerousOperationHook,
  createToolPolicyRegistry,
  type DangerousOperationConfirmation,
} from './permissions'
import { loadDefaultAgentTools, loadDefaultPiRuntime, type PiRuntime } from './runtime'

const DEFAULT_SYSTEM_PROMPT = '你是长篇创作项目助手，只依据当前项目和会话上下文工作。'

export interface AgentCreationOptions {
  projectId: string
  sessionId: string
  llm: LlmConfigInput
  systemPrompt?: string
  initialMessages?: AgentMessage[]
  tools?: readonly AgentTool[]
  additionalTools?: readonly AgentTool[]
  confirmDangerousOperation?: DangerousOperationConfirmation
}

export interface AgentPromptOptions {
  signal?: AbortSignal
  onEvent?: (event: AgentEvent) => Promise<void> | void
}

export interface AgentRunResult extends LlmRunStats {
  text: string
  assistantMessage?: AssistantMessage
}

export interface ProjectSessionAgent {
  readonly projectId: string
  readonly sessionId: string
  prompt(prompt: string, options?: AgentPromptOptions): Promise<AgentRunResult>
  abort(): void
  steer?(prompt: string): void
  followUp?(prompt: string): void
  dispose(): void
}

export interface AgentFactory {
  create(options: AgentCreationOptions): Promise<ProjectSessionAgent>
}

export interface AgentFactoryDependencies {
  loadRuntime?: () => Promise<PiRuntime>
  loadTools?: () => Promise<readonly AgentTool[]>
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  resolveCredential?: (credentialId: string, config: LlmConfig) => Promise<string>
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
  return message.role === 'assistant'
}

function findLastAssistant(messages: readonly AgentMessage[]): AssistantMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isAssistantMessage(message)) return message
  }
  return undefined
}

function assistantText(message: AssistantMessage | undefined): string {
  if (!message) return ''
  return message.content
    .filter((content): content is Extract<AssistantMessage['content'][number], { type: 'text' }> => content.type === 'text')
    .map((content) => content.text)
    .join('')
}

function createFallbackStats(signal?: AbortSignal): LlmRunStats {
  return {
    finishReason: signal?.aborted ? 'aborted' : 'error',
    usage: emptyTokenUsage(),
    errorMessage: signal?.aborted ? 'Agent run was cancelled' : 'Agent did not return an assistant message',
  }
}

class PiProjectSessionAgent implements ProjectSessionAgent {
  public constructor(
    public readonly projectId: string,
    public readonly sessionId: string,
    private readonly agent: Agent,
  ) {}

  public async prompt(prompt: string, options: AgentPromptOptions = {}): Promise<AgentRunResult> {
    let lastAssistant: AssistantMessage | undefined
    const unsubscribe = this.agent.subscribe(async (event) => {
      if (event.type === 'message_end' && isAssistantMessage(event.message)) {
        lastAssistant = event.message
      }
      if (event.type === 'agent_end') {
        lastAssistant = findLastAssistant(event.messages) ?? lastAssistant
      }
      await options.onEvent?.(event)
    })

    const abort = (): void => this.agent.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      await this.agent.prompt(prompt)
    } finally {
      options.signal?.removeEventListener('abort', abort)
      unsubscribe()
    }

    const assistant = lastAssistant ?? findLastAssistant(this.agent.state.messages)
    if (!assistant) return { text: '', ...createFallbackStats(options.signal) }

    return {
      text: assistantText(assistant),
      finishReason: assistant.stopReason,
      usage: toTokenUsage(assistant.usage),
      responseModel: assistant.responseModel,
      errorMessage: assistant.errorMessage,
      assistantMessage: assistant,
    }
  }

  public abort(): void {
    this.agent.abort()
  }

  public steer(prompt: string): void {
    this.agent.steer({ role: 'user', content: prompt, timestamp: Date.now() })
  }

  public followUp(prompt: string): void {
    this.agent.followUp({ role: 'user', content: prompt, timestamp: Date.now() })
  }

  public dispose(): void {
    this.agent.abort()
    this.agent.clearAllQueues()
  }
}

export function createProjectSessionAgentFactory(
  dependencies: AgentFactoryDependencies = {},
): AgentFactory {
  const loadRuntime = dependencies.loadRuntime ?? loadDefaultPiRuntime
  const loadTools = dependencies.loadTools ?? loadDefaultAgentTools

  return {
    create: async (options) => {
      const [runtime, normalizedLlm] = await Promise.all([
        loadRuntime(),
        Promise.resolve(normalizeLlmConfig(options.llm)),
      ])
      const apiKey = normalizedLlm.credentialId
        ? await (dependencies.resolveCredential?.(normalizedLlm.credentialId, normalizedLlm) ?? Promise.resolve(''))
        : ''
      const configuredLlm: ResolvedLlmConfig = { ...normalizedLlm, apiKey }
      const baseTools = options.tools ?? (await loadTools())
      const tools = [...baseTools, ...(options.additionalTools ?? [])]
      const toolPolicies = createToolPolicyRegistry(tools)
      const model = createDynamicPiModel(configuredLlm)
      const permissionHook = createDangerousOperationHook({
        projectId: options.projectId,
        sessionId: options.sessionId,
        toolPolicies,
        confirm: options.confirmDangerousOperation,
      })
      const agentOptions: AgentOptions = {
        initialState: {
          systemPrompt: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          model,
          messages: options.initialMessages ?? [],
          tools: configureToolExecution(tools, toolPolicies),
        },
        streamFn: createRetryingStreamFn(
          runtime.streamSimple,
          runtime.createStream,
          configuredLlm,
          dependencies.sleep,
        ),
        getApiKey: () => configuredLlm.apiKey,
        transformContext: createContextBudgetTransformer(configuredLlm.contextBudget),
        beforeToolCall: permissionHook,
        sessionId: options.sessionId,
        toolExecution: 'parallel',
        maxRetryDelayMs: configuredLlm.maxRetryDelayMs,
      }
      return new PiProjectSessionAgent(
        options.projectId,
        options.sessionId,
        new runtime.Agent(agentOptions),
      )
    },
  }
}

export type { LlmConfig, LlmConfigInput, StopReason, Message }
