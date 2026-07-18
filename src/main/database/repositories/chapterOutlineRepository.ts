import { randomUUID } from 'node:crypto'
import {
  EntityNotFoundError,
  OutlineNotEditableError,
  OutlineStatusTransitionError,
  VersionConflictError,
} from '../../../shared/novelProject'
import type {
  ChapterOutline,
  CreateChapterOutlineInput,
  OutlineStatus,
  UpdateChapterOutlineInput,
} from '../../../shared/novelProject'
import {
  parseJsonObject,
  parseJsonStringArray,
  stringifyJsonObject,
  stringifyJsonStringArray,
} from '../json'
import type { SqliteDatabase } from '../types'

export type {
  ChapterOutline,
  CreateChapterOutlineInput,
  OutlineStatus,
  UpdateChapterOutlineInput,
}

interface ChapterOutlineRow {
  id: string
  project_id: string
  volume_id: string
  chapter_number: number
  sort_order: number
  title: string
  summary: string
  purpose: string
  opening: string
  conflict: string
  key_events_json: string
  ending: string
  ending_hook: string
  status: string
  outline_json: string
  source_material_ids_json: string
  metadata_json: string
  version: number
  created_at: string
  updated_at: string
}

const outlineStatuses: readonly OutlineStatus[] = ['draft', 'confirmed', 'locked']

function now(): string {
  return new Date().toISOString()
}

function toChapterOutline(row: ChapterOutlineRow): ChapterOutline {
  if (!outlineStatuses.includes(row.status as OutlineStatus)) {
    throw new Error(`Unknown outline status: ${row.status}`)
  }
  const outline = parseJsonObject(row.outline_json, 'chapter_outline.outline')
  const metadata = parseJsonObject(row.metadata_json, 'chapter_outline.metadata')
  if (!outline || !metadata) throw new Error('Chapter outline JSON fields cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    volume_id: row.volume_id,
    chapter_number: row.chapter_number,
    sort_order: row.sort_order,
    title: row.title,
    summary: row.summary,
    purpose: row.purpose,
    opening: row.opening,
    conflict: row.conflict,
    key_events: parseJsonStringArray(row.key_events_json, 'chapter_outline.key_events'),
    ending: row.ending,
    ending_hook: row.ending_hook,
    status: row.status as OutlineStatus,
    outline,
    source_material_ids: parseJsonStringArray(
      row.source_material_ids_json,
      'chapter_outline.source_material_ids',
    ),
    metadata,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class ChapterOutlineRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateChapterOutlineInput): ChapterOutline {
    this.assertVolumeProject(input.project_id, input.volume_id)
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO chapter_outlines (
          id, project_id, volume_id, chapter_number, sort_order, title, summary, purpose,
          opening, conflict, key_events_json, ending, ending_hook, outline_json,
          source_material_ids_json, metadata_json, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.volume_id,
        input.chapter_number,
        input.sort_order ?? input.chapter_number,
        input.title,
        input.summary ?? '',
        input.purpose ?? '',
        input.opening ?? '',
        input.conflict ?? '',
        stringifyJsonStringArray(input.key_events ?? []),
        input.ending ?? '',
        input.ending_hook ?? '',
        stringifyJsonObject(input.outline ?? {}),
        stringifyJsonStringArray(input.source_material_ids ?? []),
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const outline = this.getById(id)
    if (!outline) throw new Error('Chapter outline was not created')
    return outline
  }

  public getById(id: string): ChapterOutline | null {
    const row = this.database
      .prepare<ChapterOutlineRow>('SELECT * FROM chapter_outlines WHERE id = ?')
      .get(id)
    return row ? toChapterOutline(row) : null
  }

  public listByProject(projectId: string): ChapterOutline[] {
    return this.database
      .prepare<ChapterOutlineRow>(
        `SELECT * FROM chapter_outlines
         WHERE project_id = ?
         ORDER BY chapter_number, sort_order, id`,
      )
      .all(projectId)
      .map(toChapterOutline)
  }

  public listByVolume(volumeId: string): ChapterOutline[] {
    return this.database
      .prepare<ChapterOutlineRow>(
        `SELECT * FROM chapter_outlines
         WHERE volume_id = ?
         ORDER BY sort_order, chapter_number, id`,
      )
      .all(volumeId)
      .map(toChapterOutline)
  }

  public update(
    id: string,
    input: UpdateChapterOutlineInput,
    expectedVersion?: number,
  ): ChapterOutline | null {
    const current = this.getById(id)
    if (!current) return null
    this.assertExpectedVersion(current, expectedVersion)
    this.assertEditable(current)
    if (input.volume_id !== undefined) {
      this.assertVolumeProject(current.project_id, input.volume_id)
    }
    const next = {
      volume_id: input.volume_id ?? current.volume_id,
      chapter_number: input.chapter_number ?? current.chapter_number,
      sort_order: input.sort_order ?? current.sort_order,
      title: input.title ?? current.title,
      summary: input.summary ?? current.summary,
      purpose: input.purpose ?? current.purpose,
      opening: input.opening ?? current.opening,
      conflict: input.conflict ?? current.conflict,
      key_events: input.key_events ?? current.key_events,
      ending: input.ending ?? current.ending,
      ending_hook: input.ending_hook ?? current.ending_hook,
      outline: input.outline ?? current.outline,
      source_material_ids: input.source_material_ids ?? current.source_material_ids,
      metadata: input.metadata ?? current.metadata,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE chapter_outlines
             SET volume_id = ?, chapter_number = ?, sort_order = ?, title = ?, summary = ?,
                 purpose = ?, opening = ?, conflict = ?, key_events_json = ?, ending = ?,
                 ending_hook = ?, outline_json = ?, source_material_ids_json = ?, metadata_json = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.volume_id,
            next.chapter_number,
            next.sort_order,
            next.title,
            next.summary,
            next.purpose,
            next.opening,
            next.conflict,
            stringifyJsonStringArray(next.key_events),
            next.ending,
            next.ending_hook,
            stringifyJsonObject(next.outline),
            stringifyJsonStringArray(next.source_material_ids),
            stringifyJsonObject(next.metadata),
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE chapter_outlines
             SET volume_id = ?, chapter_number = ?, sort_order = ?, title = ?, summary = ?,
                 purpose = ?, opening = ?, conflict = ?, key_events_json = ?, ending = ?,
                 ending_hook = ?, outline_json = ?, source_material_ids_json = ?, metadata_json = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.volume_id,
            next.chapter_number,
            next.sort_order,
            next.title,
            next.summary,
            next.purpose,
            next.opening,
            next.conflict,
            stringifyJsonStringArray(next.key_events),
            next.ending,
            next.ending_hook,
            stringifyJsonObject(next.outline),
            stringifyJsonStringArray(next.source_material_ids),
            stringifyJsonObject(next.metadata),
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Chapter outline', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    this.assertExpectedVersion(current, expectedVersion)
    this.assertEditable(current)
    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM chapter_outlines WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM chapter_outlines WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Chapter outline', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }

  public setStatus(
    id: string,
    status: OutlineStatus,
    expectedVersion?: number,
  ): ChapterOutline | null {
    const current = this.getById(id)
    if (!current) return null
    this.assertExpectedVersion(current, expectedVersion)
    this.assertTransition(current, status)
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE chapter_outlines
             SET status = ?, version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(status, now(), id)
      : this.database
          .prepare(
            `UPDATE chapter_outlines
             SET status = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(status, now(), id, expectedVersion)
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Chapter outline', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  private assertExpectedVersion(outline: ChapterOutline, expectedVersion: number | undefined): void {
    if (expectedVersion !== undefined && outline.version !== expectedVersion) {
      throw new VersionConflictError('Chapter outline', outline.id, expectedVersion, outline.version)
    }
  }

  private assertVolumeProject(projectId: string, volumeId: string): void {
    const volume = this.database
      .prepare<{ project_id: string }>('SELECT project_id FROM volumes WHERE id = ?')
      .get(volumeId)
    if (!volume || volume.project_id !== projectId) {
      throw new EntityNotFoundError('Volume in project', volumeId)
    }
  }

  private assertEditable(outline: ChapterOutline): void {
    if (outline.status !== 'draft') {
      throw new OutlineNotEditableError('Chapter outline', outline.id, outline.status)
    }
  }

  private assertTransition(outline: ChapterOutline, nextStatus: OutlineStatus): void {
    const allowed =
      (outline.status === 'draft' && nextStatus === 'confirmed') ||
      (outline.status === 'confirmed' && (nextStatus === 'locked' || nextStatus === 'draft')) ||
      (outline.status === 'locked' && nextStatus === 'draft')
    if (!allowed) {
      throw new OutlineStatusTransitionError(
        'Chapter outline',
        outline.id,
        outline.status,
        nextStatus,
      )
    }
  }
}
