import type { LlmConfigInput } from '../../agent/llm'
import type { ProjectConfig } from '../../shared/novelProject'

export interface OutlineModelForm {
  model: string
  contextBudget: string
  maxOutputTokens: string
  temperature: string
}

export function readOutlineModelForm(config: ProjectConfig | null): OutlineModelForm {
  const settings = config?.settings ?? {}
  return {
    model: typeof settings.llmModel === 'string' ? settings.llmModel : 'gpt-4o-mini',
    contextBudget: String(config?.context_budget ?? 64000),
    maxOutputTokens: String(typeof settings.llmMaxOutputTokens === 'number' ? settings.llmMaxOutputTokens : 4096),
    temperature: String(typeof settings.llmTemperature === 'number' ? settings.llmTemperature : 0.7),
  }
}

/** Explicit allowlist: project settings and credential references never enter task input. */
export function outlineModelInput(config: ProjectConfig | null, form: OutlineModelForm): LlmConfigInput {
  const settings = config?.settings ?? {}
  const provider = typeof settings.llmProvider === 'string' ? settings.llmProvider : 'openai-compatible'
  const defaults: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    deepseek: 'https://api.deepseek.com/v1',
  }
  const contextBudget = Number(form.contextBudget)
  const maxOutputTokens = Number(form.maxOutputTokens)
  const temperature = Number(form.temperature)
  if (!form.model.trim() || !Number.isInteger(contextBudget) || contextBudget <= 0
    || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0 || maxOutputTokens >= contextBudget
    || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error('请填写模型、正整数预算和输出上限，以及 0 到 2 的温度；输出上限必须小于上下文预算。')
  }
  return {
    provider,
    baseUrl: typeof settings.llmBaseUrl === 'string'
      ? settings.llmBaseUrl
      : defaults[provider] ?? 'https://api.openai.com/v1',
    model: form.model.trim(),
    contextBudget,
    maxOutputTokens,
    temperature,
    streamingEnabled: true,
  }
}
