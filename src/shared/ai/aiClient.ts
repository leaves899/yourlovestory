/**
 * AI 调用模块 —— 使用原生 fetch 调用各 LLM 提供商 API。
 *
 * 支持 Anthropic / DeepSeek / OpenAI（OpenAI 兼容格式）。
 * 不依赖 ESM-only 的 pi-ai 包，兼容主进程 CJS 编译。
 */

/** AI 调用参数 */
export interface AICallParams {
  systemPrompt: string
  userPrompt: string
  provider: string
  modelId: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

/** 通用消息格式 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Anthropic API 响应 */
interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
  stop_reason: string
}

/** OpenAI 兼容 API 响应 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string
      reasoning_content?: string  // DeepSeek 思维链字段
    }
  }>
}

/** 构建 Anthropic API 请求 */
async function callAnthropic(params: AICallParams): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.8,
      system: params.systemPrompt,
      messages: [{ role: 'user', content: params.userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Anthropic API 错误 (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as AnthropicResponse
  const textParts = data.content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text as string)

  return textParts.join('').trim()
}

/** 构建 OpenAI 兼容 API 请求（DeepSeek / OpenAI / 其他兼容提供商） */
async function callOpenAICompatible(params: AICallParams): Promise<string> {
  // 根据 provider 确定 API endpoint
  const endpoints: Record<string, string> = {
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    openai: 'https://api.openai.com/v1/chat/completions',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  }

  const baseUrl = endpoints[params.provider]
  if (!baseUrl) {
    throw new Error(`不支持的 AI 提供商: ${params.provider}。支持: ${Object.keys(endpoints).join(', ')}`)
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: params.systemPrompt },
    { role: 'user', content: params.userPrompt },
  ]

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.8,
      messages,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${params.provider} API 错误 (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as OpenAIResponse
  const choice = data.choices?.[0]?.message

  if (!choice) {
    throw new Error('AI 未返回有效内容，请重试')
  }

  // 优先使用 content（正文），忽略 reasoning_content（思维链）
  // DeepSeek 的思维链内容在 reasoning_content 字段，不在 content 中
  const text = choice.content?.trim()

  if (!text) {
    throw new Error('AI 未返回有效内容，请重试')
  }

  return text
}

/**
 * 调用 LLM 生成叙事内容。
 *
 * @param params - AI 调用参数（provider/model/密钥/温度等）
 * @returns 生成的纯文本内容
 * @throws 如果 apiKey 为空或 API 调用失败
 */
export async function generateNarrative(params: AICallParams): Promise<string> {
  if (!params.apiKey || params.apiKey.trim() === '') {
    throw new Error('API Key 未配置，请先在设置页面配置 AI API Key')
  }

  if (!params.systemPrompt || params.systemPrompt.trim() === '') {
    throw new Error('系统 Prompt 不能为空')
  }

  // Anthropic 使用专用 API，其他 provider 使用 OpenAI 兼容格式
  if (params.provider === 'anthropic') {
    return callAnthropic(params)
  }

  return callOpenAICompatible(params)
}
