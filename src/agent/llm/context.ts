import type { AgentMessage } from '@earendil-works/pi-agent-core'

export type TokenEstimator = (message: AgentMessage) => number

function escapedStringLength(text: string): number {
  let length = text.length
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(index + 1) >= 0xdc00
      && text.charCodeAt(index + 1) <= 0xdfff) {
      index += 1
      continue
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      length += 5
      continue
    }
    if (code < 0x20) length += code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 1 : 5
    else if (code === 34 || code === 92) length += 1
  }
  return length
}

export function estimateMessageTokens(message: AgentMessage): number {
  if (message.role === 'user' && typeof message.content === 'string') {
    // Preserve JSON's exact UTF-16 length without allocating a copy of the long content.
    const envelope = JSON.stringify({ ...message, content: '' })
    return Math.max(1, Math.ceil((envelope.length + escapedStringLength(message.content)) / 4))
  }
  const serialized = JSON.stringify(message)
  return Math.max(1, Math.ceil((serialized?.length ?? 0) / 4))
}

export function trimMessagesToBudget(
  messages: readonly AgentMessage[],
  budget: number,
  estimate: TokenEstimator = estimateMessageTokens,
): AgentMessage[] {
  if (budget <= 0) return []

  const selected: AgentMessage[] = []
  let used = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const messageTokens = estimate(message)
    if (selected.length > 0 && used + messageTokens > budget) break
    selected.push(message)
    used += messageTokens
  }
  return selected.reverse()
}

export function createContextBudgetTransformer(
  budget: number,
  estimate: TokenEstimator = estimateMessageTokens,
): (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]> {
  return async (messages, signal) => {
    if (signal?.aborted) throw new Error('Context transformation was cancelled')
    return trimMessagesToBudget(messages, budget, estimate)
  }
}
