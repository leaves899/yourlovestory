import { randomUUID } from 'node:crypto'
import {
  EntityNotFoundError,
  OutlineNotEditableError,
  OutlineStatusTransitionError,
  VersionConflictError,
} from '../../../shared/novelProject'
import type {
  CreateVolumeOutlineInput,
  OutlineStatus,
  UpdateVolumeOutlineInput,
  VolumeOutline,
} from '../../../shared/novelProject'
import {
  parseJsonObject,
  parseJsonStringArray,
  stringifyJsonObject,
  stringifyJsonStringArray,
} from '../json'
import type { SqliteDatabase } from '../types'

export type {
  CreateVolumeOutlineInput,
  OutlineStatus,
  UpdateVolumeOutlineInput,
  VolumeOutline,
}

interface VolumeOutlineRow {
  id: string
  project_id: string
  volume_id: string
  status: string
  summary: string
  theme: string
  main_conflict: string
  key_turning_points_json: string
  ending: string
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

function toVolumeOutline(row: VolumeOutlineRow): VolumeOutline {
  if (!outlineStatuses.includes(row.status as OutlineStatus)) {
    throw new Error(`Unknown outline status: ${row.status}`)
  }
  const outline = parseJsonObject(row.outline_json, 'volume_outline.outline')
  const metadata = parseJsonObject(row.metadata_json, 'volume_outline.metadata')
  if (!outline || !metadata) throw new Error('Volume outline JSON fields cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    volume_id: row.volume_id,
    status: row.status as OutlineStatus,
    summary: row.summary,
    theme: row.theme,
    main_conflict: row.main_conflict,
    key_turning_points: parseJsonStringArray(
      row.key_turning_points_json,
      'volume_outline.key_turning_points',
    ),
    ending: row.ending,
    outline,
    source_material_ids: parseJsonStringArray(
      row.source_material_ids_json,
      'volume_outline.source_material_ids',
    ),
    metadata,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export class VolumeOutlineRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateVolumeOutlineInput): VolumeOutline {
    this.assertVolumeProject(input.project_id, input.volume_id)
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO volume_outlines (
          id, project_id, volume_id, summary, theme, main_conflict,
          key_turning_points_json, ending, outline_json, source_material_ids_json,
          metadata_json, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.volume_id,
        input.summary ?? '',
        input.theme ?? '',
        input.main_conflict ?? '',
        stringifyJsonStringArray(input.key_turning_points ?? []),
        input.ending ?? '',
        stringifyJsonObject(input.outline ?? {}),
        stringifyJsonStringArray(input.source_material_ids ?? []),
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const outline = this.getById(id)
    if (!outline) throw new Error('Volume outline was not created')
    return outline
  }

  public getById(id: string): VolumeOutline | null {
    const row = this.database
      .prepare<VolumeOutlineRow>('SELECT * FROM volume_outlines WHERE id = ?')
      .get(id)
    return row ? toVolumeOutline(row) : null
  }

  public getByVolumeId(volumeId: string): VolumeOutline | null {
    const row = this.database
      .prepare<VolumeOutlineRow>('SELECT * FROM volume_outlines WHERE volume_id = ?')
      .get(volumeId)
    return row ? toVolumeOutline(row) : null
  }

  public listByProject(projectId: string): VolumeOutline[] {
    return this.database
      .prepare<VolumeOutlineRow>(
        `SELECT * FROM volume_outlines
         WHERE project_id = ?
         ORDER BY created_at, id`,
      )
      .all(projectId)
      .map(toVolumeOutline)
  }

  public listByVolume(volumeId: string): VolumeOutline[] {
    return this.database
      .prepare<VolumeOutlineRow>(
        'SELECT * FROM volume_outlines WHERE volume_id = ? ORDER BY created_at, id',
      )
      .all(volumeId)
      .map(toVolumeOutline)
  }

  public update(
    id: string,
    input: UpdateVolumeOutlineInput,
    expectedVersion?: number,
  ): VolumeOutline | null {
    const current = this.getById(id)
    if (!current) return null
    this.assertExpectedVersion(current, expectedVersion)
    this.assertEditable(current)
    const next = {
      summary: input.summary ?? current.summary,
      theme: input.theme ?? current.theme,
      main_conflict: input.main_conflict ?? current.main_conflict,
      key_turning_points: input.key_turning_points ?? current.key_turning_points,
      ending: input.ending ?? current.ending,
      outline: input.outline ?? current.outline,
      source_material_ids: input.source_material_ids ?? current.source_material_ids,
      metadata: input.metadata ?? current.metadata,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE volume_outlines
             SET summary = ?, theme = ?, main_conflict = ?, key_turning_points_json = ?,
                 ending = ?, outline_json = ?, source_material_ids_json = ?, metadata_json = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.summary,
            next.theme,
            next.main_conflict,
            stringifyJsonStringArray(next.key_turning_points),
            next.ending,
            stringifyJsonObject(next.outline),
            stringifyJsonStringArray(next.source_material_ids),
            stringifyJsonObject(next.metadata),
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE volume_outlines
             SET summary = ?, theme = ?, main_conflict = ?, key_turning_points_json = ?,
                 ending = ?, outline_json = ?, source_material_ids_json = ?, metadata_json = ?,
                 version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.summary,
            next.theme,
            next.main_conflict,
            stringifyJsonStringArray(next.key_turning_points),
            next.ending,
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
        throw new VersionConflictError('Volume outline', id, expectedVersion, actual.version)
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
      ? this.database.prepare('DELETE FROM volume_outlines WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM volume_outlines WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Volume outline', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }

  public setStatus(
    id: string,
    status: OutlineStatus,
    expectedVersion?: number,
  ): VolumeOutline | null {
    const current = this.getById(id)
    if (!current) return null
    this.assertExpectedVersion(current, expectedVersion)
    this.assertTransition(current, status)
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE volume_outlines
             SET status = ?, version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(status, now(), id)
      : this.database
          .prepare(
            `UPDATE volume_outlines
             SET status = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(status, now(), id, expectedVersion)
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Volume outline', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  private assertExpectedVersion(outline: VolumeOutline, expectedVersion: number | undefined): void {
    if (expectedVersion !== undefined && outline.version !== expectedVersion) {
      throw new VersionConflictError('Volume outline', outline.id, expectedVersion, outline.version)
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

  private assertEditable(outline: VolumeOutline): void {
    if (outline.status !== 'draft') {
      throw new OutlineNotEditableError('Volume outline', outline.id, outline.status)
    }
  }

  private assertTransition(outline: VolumeOutline, nextStatus: OutlineStatus): void {
    const allowed =
      (outline.status === 'draft' && nextStatus === 'confirmed') ||
      (outline.status === 'confirmed' && (nextStatus === 'locked' || nextStatus === 'draft')) ||
      (outline.status === 'locked' && nextStatus === 'draft')
    if (!allowed) {
      throw new OutlineStatusTransitionError(
        'Volume outline',
        outline.id,
        outline.status,
        nextStatus,
      )
    }
  }
}
