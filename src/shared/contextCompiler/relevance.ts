import type { ContextCompilerInput, ContextPriority } from './models'

const LATIN_WORD = /[a-z0-9_]{3,}/g
const CJK_RUN = /[\u4e00-\u9fff]+/g

/**
 * Deterministic tokenizer for relevance:
 * - English/ASCII identifiers: words of length ≥ 3
 * - CJK: character bigrams within each contiguous Han run (unigram if run length is 1)
 *
 * Bigrams let shared phrases like 导航芯片 score > 0 even when embedded in longer sentences.
 */
export function tokenizeForRelevance(text: string): Set<string> {
  const tokens = new Set<string>()
  const lowered = text.toLowerCase()

  for (const match of lowered.matchAll(LATIN_WORD)) {
    tokens.add(match[0])
  }

  for (const match of lowered.matchAll(CJK_RUN)) {
    const run = match[0]
    if (run.length === 1) {
      tokens.add(run)
      continue
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.add(run.slice(index, index + 2))
    }
  }

  return tokens
}

export function buildFocusText(input: ContextCompilerInput): string {
  const parts: string[] = [
    input.project.name,
    input.project.genre,
    input.project.tone,
    input.project.description ?? '',
    input.volume?.title ?? '',
    input.volume?.synopsis ?? '',
    input.volume_outline?.summary ?? '',
    input.volume_outline?.theme ?? '',
    input.volume_outline?.main_conflict ?? '',
    input.chapter_outline?.title ?? '',
    input.chapter_outline?.summary ?? '',
    input.chapter_outline?.purpose ?? '',
    input.chapter_outline?.opening ?? '',
    input.chapter_outline?.conflict ?? '',
    input.chapter_outline?.ending ?? '',
    input.chapter_outline?.ending_hook ?? '',
    ...(input.chapter_outline?.key_events ?? []),
    input.extra_instruction ?? '',
  ]
  if (input.stage?.body) parts.push(input.stage.body.slice(0, 4_000))
  return parts.filter((part) => part.length > 0).join('\n')
}

/**
 * Deterministic Jaccard-like score in [0, 1].
 * Empty candidate content scores 0; empty focus scores 0.5 baseline for non-empty content.
 */
export function scoreRelevance(focusTokens: ReadonlySet<string>, content: string): number {
  if (content.trim().length === 0) return 0
  const contentTokens = tokenizeForRelevance(content)
  if (contentTokens.size === 0) return 0.1
  if (focusTokens.size === 0) return 0.5
  let intersection = 0
  for (const token of contentTokens) {
    if (focusTokens.has(token)) intersection += 1
  }
  const union = focusTokens.size + contentTokens.size - intersection
  if (union <= 0) return 0
  return Math.min(1, intersection / union)
}

export function priorityRank(priority: ContextPriority): number {
  switch (priority) {
    case 'required':
      return 4
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default: {
      const _exhaustive: never = priority
      return _exhaustive
    }
  }
}

export function compareCandidates(
  left: { priority: ContextPriority; relevance_score: number; importance: number; id: string },
  right: { priority: ContextPriority; relevance_score: number; importance: number; id: string },
): number {
  const byPriority = priorityRank(right.priority) - priorityRank(left.priority)
  if (byPriority !== 0) return byPriority
  if (right.relevance_score !== left.relevance_score) {
    return right.relevance_score - left.relevance_score
  }
  if (right.importance !== left.importance) return right.importance - left.importance
  return left.id.localeCompare(right.id)
}
