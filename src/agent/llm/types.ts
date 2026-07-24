import type { StreamFn } from '@earendil-works/pi-agent-core'
import type { Model, OpenAICompletionsCompat, StopReason, Usage } from '@earendil-works/pi-ai'

export const OPENAI_COMPATIBLE_API = 'openai-completions' as const

export interface LlmConfigInput {
  provider?: string
  baseUrl: string
  model: string
  /** Safe reference only. The main process resolves it immediately before use. */
  credentialId?: string
  contextBudget?: number
  maxOutputTokens?: number
  temperature?: number
  streamingEnabled?: boolean
  maxRetries?: number
  retryDelayMs?: number
  maxRetryDelayMs?: number
  timeoutMs?: number
  compat?: OpenAICompletionsCompat
}

export interface LlmConfig {
  provider: string
  baseUrl: string
  model: string
  credentialId?: string
  contextBudget: number
  maxOutputTokens: number
  temperature?: number
  streamingEnabled: boolean
  maxRetries: number
  retryDelayMs: number
  maxRetryDelayMs: number
  timeoutMs?: number
  compat?: OpenAICompletionsCompat
}

/** Never expose this type through preload or renderer imports. */
export interface ResolvedLlmConfig extends LlmConfig {
  apiKey: string
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    total: number
  }
}

export interface LlmRunStats {
  finishReason: StopReason
  usage: TokenUsage
  responseModel?: string
  errorMessage?: string
}

export type DynamicPiModel = Model<typeof OPENAI_COMPATIBLE_API>

export interface LlmStreamDependencies {
  streamFn: StreamFn
  createStream: () => import('@earendil-works/pi-ai').AssistantMessageEventStream
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

export function emptyTokenUsage(): TokenUsage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

export function toTokenUsage(usage: Usage | undefined): TokenUsage {
  if (!usage) return emptyTokenUsage()
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: { ...usage.cost },
  }
}
