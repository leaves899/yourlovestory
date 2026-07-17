import type { LlmConfig, LlmConfigInput } from './types'

export const DEFAULT_CONTEXT_BUDGET = 64_000
export const DEFAULT_MAX_OUTPUT_TOKENS = 4_096
export const DEFAULT_MAX_RETRIES = 2
export const DEFAULT_RETRY_DELAY_MS = 250
export const DEFAULT_MAX_RETRY_DELAY_MS = 5_000

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }
  return value
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return value
}

function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!normalized) throw new Error('baseUrl is required')
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('baseUrl must use http or https')
  }
  return normalized
}

export function normalizeLlmConfig(input: LlmConfigInput): LlmConfig {
  const contextBudget = requirePositiveInteger(
    input.contextBudget ?? DEFAULT_CONTEXT_BUDGET,
    'contextBudget',
  )
  const maxOutputTokens = requirePositiveInteger(
    input.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    'maxOutputTokens',
  )
  const maxRetries = requireNonNegativeInteger(input.maxRetries ?? DEFAULT_MAX_RETRIES, 'maxRetries')
  const retryDelayMs = requireNonNegativeInteger(
    input.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    'retryDelayMs',
  )
  const maxRetryDelayMs = requireNonNegativeInteger(
    input.maxRetryDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS,
    'maxRetryDelayMs',
  )

  if (input.temperature !== undefined && (!Number.isFinite(input.temperature) || input.temperature < 0)) {
    throw new Error('temperature must be a non-negative number')
  }
  if (input.timeoutMs !== undefined) {
    requirePositiveInteger(input.timeoutMs, 'timeoutMs')
  }

  return {
    provider: input.provider?.trim() || 'openai-compatible',
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim() || (() => { throw new Error('model is required') })(),
    apiKey: input.apiKey ?? '',
    contextBudget,
    maxOutputTokens,
    temperature: input.temperature,
    streamingEnabled: input.streamingEnabled ?? true,
    maxRetries,
    retryDelayMs,
    maxRetryDelayMs,
    timeoutMs: input.timeoutMs,
    compat: input.compat,
  }
}
