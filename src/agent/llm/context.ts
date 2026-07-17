import type { AgentMessage } from '@earendil-works/pi-agent-core'

export type TokenEstimator = (message: AgentMessage) => number

export function estimateMessageTokens(message: AgentMessage): number {
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
    selected.unshift(message)
    used += messageTokens
  }
  return selected
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
