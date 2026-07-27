import type { LlmConfig, DynamicPiModel } from './types'
import { normalizeModelEndpoint } from './urlSecurity'

export function createDynamicPiModel(config: LlmConfig): DynamicPiModel {
  const endpoint = normalizeModelEndpoint(config.baseUrl)
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: config.provider,
    baseUrl: endpoint.normalized,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.contextBudget,
    maxTokens: config.maxOutputTokens,
    compat: config.compat,
  }
}
