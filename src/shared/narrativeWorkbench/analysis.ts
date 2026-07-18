import type {
  ForeshadowSuggestion,
  NarrativeMemoryType,
} from './models'

const memoryTypes: readonly NarrativeMemoryType[] = [
  'fact',
  'event',
  'relationship',
  'character',
  'worldview',
  'emotion',
  'theme',
  'custom',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMemoryType(value: unknown): NarrativeMemoryType {
  return memoryTypes.includes(value as NarrativeMemoryType)
    ? value as NarrativeMemoryType
    : 'custom'
}

function readEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

export interface ParsedMemoryProposal {
  memory_type: NarrativeMemoryType
  title: string
  content: string
  confidence: number
  evidence: string[]
}

export function parseMemoryProposalText(text: string): ParsedMemoryProposal[] {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  const candidate = first >= 0 && last > first ? text.slice(first, last + 1) : text
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return []
  }
  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.memories)
      ? parsed.memories
      : []
  return items.flatMap((item): ParsedMemoryProposal[] => {
    if (!isRecord(item)) return []
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    if (!title || !content) return []
    return [{
      memory_type: readMemoryType(item.memory_type),
      title,
      content,
      confidence: clampConfidence(item.confidence),
      evidence: readEvidence(item.evidence),
    }]
  })
}

export function parseForeshadowSuggestionText(text: string): ForeshadowSuggestion[] {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  const candidate = first >= 0 && last > first ? text.slice(first, last + 1) : text
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    return []
  }
  const items = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : []
  return items.flatMap((item): ForeshadowSuggestion[] => {
    if (!isRecord(item)) return []
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const description = typeof item.description === 'string' ? item.description.trim() : ''
    if (!title || !description) return []
    const importance = typeof item.importance === 'number' && Number.isFinite(item.importance)
      ? Math.max(0, Math.round(item.importance))
      : 0
    const evidence = readEvidence(item.evidence)
    const planned = item.planned_payoff_chapter_id
    return [{
      title,
      description,
      importance,
      planned_payoff_chapter_id: typeof planned === 'string' ? planned : null,
      evidence,
    }]
  })
}

export function splitNarrativeParagraphs(content: string): string[] {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}
