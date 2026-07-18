import { randomUUID } from 'node:crypto'
import type {
  ChapterBlock,
  ChapterRevision,
  ChapterRevisionOperation,
  CreateChapterRevisionInput,
} from '../../../shared/narrativeWorkbench'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { SqliteDatabase } from '../types'

interface ChapterRevisionRow {
  id: string
  chapter_id: string
  parent_revision_id: string | null
  revision_number: number
  content: string
  summary: string
  reason: string
  operation: string
  blocks_json: string
  is_current: number
  created_at: string
}

const operations: readonly ChapterRevisionOperation[] = [
  'manual',
  'paragraph_revision',
  'polish',
  'fallback',
]

function now(): string {
  return new Date().toISOString()
}

function toBlocks(value: string): ChapterBlock[] {
  const parsed = parseJsonObject(value, 'chapter_revision.blocks')
  if (!parsed || !Array.isArray(parsed.blocks)) return []
  return parsed.blocks.flatMap((item): ChapterBlock[] => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return []
    const block = item as Record<string, unknown>
    if (
      typeof block.id !== 'string' ||
      typeof block.ordinal !== 'number' ||
      !Number.isInteger(block.ordinal) ||
      (block.kind !== 'heading' && block.kind !== 'paragraph') ||
      typeof block.text !== 'string' ||
      typeof block.fingerprint !== 'string'
    ) {
      return []
    }
    return [{
      id: block.id,
      ordinal: block.ordinal,
      kind: block.kind,
      text: block.text,
      fingerprint: block.fingerprint,
    }]
  })
}

function blocksJson(blocks: readonly ChapterBlock[]) {
  return stringifyJsonObject({
    blocks: blocks.map((block) => ({
      id: block.id,
      ordinal: block.ordinal,
      kind: block.kind,
      text: block.text,
      fingerprint: block.fingerprint,
    })),
  })
}

function toRevision(row: ChapterRevisionRow): ChapterRevision {
  if (!operations.includes(row.operation as ChapterRevisionOperation)) {
    throw new Error(`Unknown chapter revision operation: ${row.operation}`)
  }
  return {
    id: row.id,
    chapter_id: row.chapter_id,
    parent_revision_id: row.parent_revision_id,
    revision_number: row.revision_number,
    content: row.content,
    summary: row.summary,
    reason: row.reason,
    operation: row.operation as ChapterRevisionOperation,
    blocks: toBlocks(row.blocks_json),
    is_current: row.is_current === 1,
    created_at: row.created_at,
  }
}

export class ChapterRevisionRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateChapterRevisionInput): ChapterRevision {
    const id = input.id ?? randomUUID()
    const next = this.database
      .prepare<{ next_revision: number }>(
        'SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision FROM chapter_revisions WHERE chapter_id = ?',
      )
      .get(input.chapter_id)
    const revisionNumber = next?.next_revision ?? 1
    this.database
      .prepare(
        `INSERT INTO chapter_revisions (
          id, chapter_id, parent_revision_id, revision_number, content, summary, reason,
          operation, blocks_json, is_current, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(
        id,
        input.chapter_id,
        input.parent_revision_id ?? null,
        revisionNumber,
        input.content,
        input.summary ?? '',
        input.reason ?? '',
        input.operation ?? 'manual',
        blocksJson(input.blocks),
        now(),
      )
    const revision = this.getById(id)
    if (!revision) throw new Error('Chapter revision was not created')
    return revision
  }

  public getById(id: string): ChapterRevision | null {
    const row = this.database
      .prepare<ChapterRevisionRow>('SELECT * FROM chapter_revisions WHERE id = ?')
      .get(id)
    return row ? toRevision(row) : null
  }

  public getCurrentByChapter(chapterId: string): ChapterRevision | null {
    const row = this.database
      .prepare<ChapterRevisionRow>(
        `SELECT * FROM chapter_revisions
         WHERE chapter_id = ? AND is_current = 1
         ORDER BY revision_number DESC, id LIMIT 1`,
      )
      .get(chapterId)
    return row ? toRevision(row) : null
  }

  public listByChapter(chapterId: string): ChapterRevision[] {
    return this.database
      .prepare<ChapterRevisionRow>(
        `SELECT * FROM chapter_revisions
         WHERE chapter_id = ?
         ORDER BY revision_number DESC, id`,
      )
      .all(chapterId)
      .map(toRevision)
  }

  public setCurrent(id: string): ChapterRevision | null {
    const revision = this.getById(id)
    if (!revision) return null
    const setCurrent = this.database.transaction(() => {
      this.database
        .prepare('UPDATE chapter_revisions SET is_current = 0 WHERE chapter_id = ?')
        .run(revision.chapter_id)
      this.database
        .prepare('UPDATE chapter_revisions SET is_current = 1 WHERE id = ?')
        .run(id)
    })
    setCurrent()
    return this.getById(id)
  }
}

export type { ChapterRevision, CreateChapterRevisionInput }
