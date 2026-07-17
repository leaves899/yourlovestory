import type { LlmConfig, DynamicPiModel } from './types'

export function createDynamicPiModel(config: LlmConfig): DynamicPiModel {
  return {
    id: config.model,
    name: config.model,
    api: 'openai-completions',
    provider: config.provider,
    baseUrl: config.baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: config.contextBudget,
    maxTokens: config.maxOutputTokens,
    compat: config.compat,
  }
}
