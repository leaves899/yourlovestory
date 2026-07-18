import { createHash } from 'node:crypto'
import type {
  ChapterBlock,
  ChapterBlockChange,
  ChapterBlockKind,
  ChapterDiff,
} from './models'

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function blockKind(text: string): ChapterBlockKind {
  return /^#{1,6}\s/.test(text.trim()) ? 'heading' : 'paragraph'
}

function fingerprint(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 20)
}

function deterministicId(
  chapterId: string,
  kind: ChapterBlockKind,
  ordinal: number,
  text: string,
): string {
  const source = `${chapterId}\u0000${kind}\u0000${ordinal}\u0000${normalizeText(text)}`
  return `block-${createHash('sha256').update(source).digest('hex').slice(0, 24)}`
}

function rawBlocks(content: string): Array<{ kind: ChapterBlockKind; text: string }> {
  return content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ kind: blockKind(text), text }))
}

export function assignStableBlockIds(
  chapterId: string,
  content: string,
  previousBlocks: readonly ChapterBlock[] = [],
): ChapterBlock[] {
  const raw = rawBlocks(content)
  const previousByFingerprint = new Map<string, ChapterBlock[]>()
  for (const block of previousBlocks) {
    const key = `${block.kind}:${normalizeText(block.text)}`
    const existing = previousByFingerprint.get(key) ?? []
    existing.push(block)
    previousByFingerprint.set(key, existing)
  }
  const claimed = new Set<string>()
  const canReuseByPosition = raw.length === previousBlocks.length

  const assignments: Array<ChapterBlock | undefined> = new Array(raw.length).fill(undefined)
  raw.forEach((item, ordinal) => {
    const exactCandidates = previousByFingerprint.get(
      `${item.kind}:${normalizeText(item.text)}`,
    ) ?? []
    const exact = exactCandidates.find((candidate) => !claimed.has(candidate.id))
    if (exact) {
      assignments[ordinal] = exact
      claimed.add(exact.id)
    }
  })

  function nearestCandidate(ordinal: number): ChapterBlock | undefined {
    const beforeCandidates = assignments
      .slice(0, ordinal)
      .filter((block): block is ChapterBlock => block !== undefined)
    const before = beforeCandidates.length > 0
      ? beforeCandidates[beforeCandidates.length - 1]
      : undefined
    const after = assignments
      .slice(ordinal + 1)
      .find((block): block is ChapterBlock => block !== undefined)
    let candidates = previousBlocks.filter((block) => !claimed.has(block.id))
    if (before && after) {
      candidates = candidates.filter(
        (block) => block.ordinal > before.ordinal && block.ordinal < after.ordinal,
      )
    } else if (before) {
      candidates = candidates.filter((block) => block.ordinal > before.ordinal)
    } else if (after) {
      candidates = candidates.filter((block) => block.ordinal < after.ordinal)
    } else if (canReuseByPosition) {
      candidates = candidates.filter((block) => block.ordinal === ordinal)
    } else {
      candidates = []
    }
    return candidates.sort(
      (left, right) => Math.abs(left.ordinal - ordinal) - Math.abs(right.ordinal - ordinal),
    )[0]
  }

  return raw.map((item, ordinal) => {
    const reusable = assignments[ordinal] ?? nearestCandidate(ordinal)
    if (reusable) claimed.add(reusable.id)
    return {
      id: reusable?.id ?? deterministicId(chapterId, item.kind, ordinal, item.text),
      ordinal,
      kind: item.kind,
      text: item.text,
      fingerprint: fingerprint(item.text),
    }
  })
}

export function chapterBlocksToContent(blocks: readonly ChapterBlock[]): string {
  return blocks
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((block) => block.text.trim())
    .filter((text) => text.length > 0)
    .join('\n\n')
}

export function replaceChapterBlock(
  blocks: readonly ChapterBlock[],
  blockId: string,
  text: string,
): ChapterBlock[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('Revised block cannot be empty')
  let replaced = false
  const result = blocks.map((block) => {
    if (block.id !== blockId) return { ...block }
    replaced = true
    return { ...block, text: trimmed, fingerprint: fingerprint(trimmed) }
  })
  if (!replaced) throw new Error(`Chapter block not found: ${blockId}`)
  return result
}

export function diffChapterBlocks(
  before: readonly ChapterBlock[],
  after: readonly ChapterBlock[],
): ChapterDiff {
  const beforeById = new Map(before.map((block) => [block.id, block]))
  const seen = new Set<string>()
  const changes: ChapterBlockChange[] = []

  for (const next of after) {
    const previous = beforeById.get(next.id)
    seen.add(next.id)
    if (!previous) {
      changes.push({ block_id: next.id, kind: 'added', before: null, after: next })
    } else if (normalizeText(previous.text) === normalizeText(next.text)) {
      changes.push({ block_id: next.id, kind: 'unchanged', before: previous, after: next })
    } else {
      changes.push({ block_id: next.id, kind: 'modified', before: previous, after: next })
    }
  }

  for (const previous of before) {
    if (!seen.has(previous.id)) {
      changes.push({ block_id: previous.id, kind: 'removed', before: previous, after: null })
    }
  }

  return {
    changes,
    unchanged_count: changes.filter((change) => change.kind === 'unchanged').length,
    added_count: changes.filter((change) => change.kind === 'added').length,
    removed_count: changes.filter((change) => change.kind === 'removed').length,
    modified_count: changes.filter((change) => change.kind === 'modified').length,
  }
}

export function diffChapterContent(
  chapterId: string,
  beforeContent: string,
  afterContent: string,
): ChapterDiff {
  const before = assignStableBlockIds(chapterId, beforeContent)
  const after = assignStableBlockIds(chapterId, afterContent, before)
  return diffChapterBlocks(before, after)
}

export function findChapterBlock(
  blocks: readonly ChapterBlock[],
  blockId: string,
): ChapterBlock | null {
  return blocks.find((block) => block.id === blockId) ?? null
}

export function blockTextFingerprint(text: string): string {
  return fingerprint(text)
}
