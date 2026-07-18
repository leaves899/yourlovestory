import { randomUUID } from 'node:crypto'
import { VersionConflictError } from '../../../shared/novelProject'
import type {
  Chapter,
  ChapterStatus,
  CreateChapterInput,
  UpdateChapterInput,
} from '../../../shared/chapterGeneration'
import type { SqliteDatabase } from '../types'

export type { Chapter, ChapterStatus, CreateChapterInput, UpdateChapterInput }

interface ChapterRow {
  id: string
  project_id: string
  arc_id: string | null
  chapter_number: number
  title: string
  status: string
  synopsis: string
  content: string
  target_words: number | null
  actual_words: number | null
  version: number
  created_at: string
  updated_at: string
}

function toChapter(row: ChapterRow): Chapter {
  const statuses: readonly ChapterStatus[] = ['planned', 'drafting', 'review', 'completed']
  if (!statuses.includes(row.status as ChapterStatus)) {
    throw new Error(`Unknown chapter status: ${row.status}`)
  }
  return { ...row, status: row.status as ChapterStatus }
}

function now(): string {
  return new Date().toISOString()
}

export class ChapterRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateChapterInput): Chapter {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO chapters (
          id, project_id, arc_id, chapter_number, title, status, synopsis, content,
          target_words, actual_words, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.arc_id ?? null,
        input.chapter_number,
        input.title ?? '',
        input.status ?? 'planned',
        input.synopsis ?? '',
        input.content ?? '',
        input.target_words ?? null,
        input.actual_words ?? null,
        timestamp,
        timestamp,
      )
    const chapter = this.getById(id)
    if (!chapter) throw new Error('Chapter was not created')
    return chapter
  }

  public getById(id: string): Chapter | null {
    const row = this.database
      .prepare<ChapterRow>('SELECT * FROM chapters WHERE id = ?')
      .get(id)
    return row ? toChapter(row) : null
  }

  public getByProjectAndNumber(projectId: string, chapterNumber: number): Chapter | null {
    const row = this.database
      .prepare<ChapterRow>(
        'SELECT * FROM chapters WHERE project_id = ? AND chapter_number = ?',
      )
      .get(projectId, chapterNumber)
    return row ? toChapter(row) : null
  }

  public listByProject(projectId: string): Chapter[] {
    return this.database
      .prepare<ChapterRow>(
        'SELECT * FROM chapters WHERE project_id = ? ORDER BY chapter_number, id',
      )
      .all(projectId)
      .map(toChapter)
  }

  public update(
    id: string,
    input: UpdateChapterInput,
    expectedVersion?: number,
  ): Chapter | null {
    const current = this.getById(id)
    if (!current) return null
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw new VersionConflictError('Chapter', id, expectedVersion, current.version)
    }

    const next = {
      arc_id: input.arc_id === undefined ? current.arc_id : input.arc_id,
      chapter_number: input.chapter_number ?? current.chapter_number,
      title: input.title ?? current.title,
      status: input.status ?? current.status,
      synopsis: input.synopsis ?? current.synopsis,
      content: input.content ?? current.content,
      target_words: input.target_words === undefined ? current.target_words : input.target_words,
      actual_words: input.actual_words === undefined ? current.actual_words : input.actual_words,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE chapters
         SET arc_id = ?, chapter_number = ?, title = ?, status = ?, synopsis = ?, content = ?,
             target_words = ?, actual_words = ?, version = version + 1, updated_at = ?
         WHERE id = ?`,
          )
          .run(
            next.arc_id,
            next.chapter_number,
            next.title,
            next.status,
            next.synopsis,
            next.content,
            next.target_words,
            next.actual_words,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE chapters
         SET arc_id = ?, chapter_number = ?, title = ?, status = ?, synopsis = ?, content = ?,
             target_words = ?, actual_words = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
          )
          .run(
            next.arc_id,
            next.chapter_number,
            next.title,
            next.status,
            next.synopsis,
            next.content,
            next.target_words,
            next.actual_words,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Chapter', id, expectedVersion, actual.version)
    }
    return this.getById(id)
  }

  public delete(id: string): boolean {
    const result = this.database.prepare('DELETE FROM chapters WHERE id = ?').run(id)
    return result.changes > 0
  }
}
