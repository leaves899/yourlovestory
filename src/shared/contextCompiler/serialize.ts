import type { ContextCandidate, ContextSourceKind, PromptSection, PromptStructure } from './models'
import { estimateJoinedTextTokens, estimateTextTokens } from './tokenEstimate'

/** Separator used between prompt sections; must match joinSections. */
export const SECTION_JOINER = '\n\n'

export function formatSectionBody(title: string, source: ContextSourceKind, content: string): string {
  return `### [${source}] ${title}\n${content}`
}

export function candidateToSection(candidate: ContextCandidate): PromptSection {
  const body = formatSectionBody(candidate.title, candidate.source, candidate.content)
  return {
    id: candidate.id,
    source: candidate.source,
    title: candidate.title,
    content: body,
    estimated_tokens: estimateTextTokens(body),
  }
}

export function estimateCandidatePromptTokens(candidate: ContextCandidate): number {
  return estimateTextTokens(formatSectionBody(candidate.title, candidate.source, candidate.content))
}

/** Full serialized cost including inter-section separators (hard-budget source of truth). */
export function estimateCandidatesJoinedTokens(candidates: readonly ContextCandidate[]): number {
  if (candidates.length === 0) return 0
  const bodies = candidates.map((candidate) =>
    formatSectionBody(candidate.title, candidate.source, candidate.content),
  )
  return estimateJoinedTextTokens(bodies, SECTION_JOINER)
}

export function joinSections(sections: readonly PromptSection[]): PromptStructure {
  const joined_prompt = sections.map((section) => section.content).join(SECTION_JOINER)
  return {
    sections: [...sections],
    joined_prompt,
    estimated_tokens: estimateTextTokens(joined_prompt),
  }
}

export function serializeCandidates(candidates: readonly ContextCandidate[]): PromptStructure {
  return joinSections(candidates.map(candidateToSection))
}
