import { randomUUID } from 'node:crypto'
import {
  VersionConflictError,
  VolumeDeletionProtectedError,
} from '../../../shared/novelProject'
import type {
  CreateVolumeInput,
  UpdateVolumeInput,
  Volume,
  VolumeStatus,
} from '../../../shared/novelProject'
import type { SqliteDatabase } from '../types'

export type { CreateVolumeInput, UpdateVolumeInput, Volume, VolumeStatus }

interface VolumeRow {
  id: string
  project_id: string
  volume_number: number
  title: string
  synopsis: string
  status: string
  sort_order: number
  target_words: number | null
  version: number
  created_at: string
  updated_at: string
}

const volumeStatuses: readonly VolumeStatus[] = [
  'planned',
  'drafting',
  'active',
  'completed',
  'archived',
]

function now(): string {
  return new Date().toISOString()
}

function toVolume(row: VolumeRow): Volume {
  if (!volumeStatuses.includes(row.status as VolumeStatus)) {
    throw new Error(`Unknown volume status: ${row.status}`)
  }
  return { ...row, status: row.status as VolumeStatus }
}

export class VolumeRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateVolumeInput): Volume {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO volumes (
          id, project_id, volume_number, title, synopsis, status, sort_order,
          target_words, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.volume_number,
        input.title,
        input.synopsis ?? '',
        input.status ?? 'planned',
        input.sort_order ?? input.volume_number,
        input.target_words ?? null,
        timestamp,
        timestamp,
      )
    const volume = this.getById(id)
    if (!volume) throw new Error('Volume was not created')
    return volume
  }

  public getById(id: string): Volume | null {
    const row = this.database.prepare<VolumeRow>('SELECT * FROM volumes WHERE id = ?').get(id)
    return row ? toVolume(row) : null
  }

  public listByProject(projectId: string): Volume[] {
    return this.database
      .prepare<VolumeRow>(
        `SELECT * FROM volumes
         WHERE project_id = ?
         ORDER BY sort_order, volume_number, created_at, id`,
      )
      .all(projectId)
      .map(toVolume)
  }

  public update(id: string, input: UpdateVolumeInput, expectedVersion?: number): Volume | null {
    const current = this.getById(id)
    if (!current) return null
    this.assertExpectedVersion(current, expectedVersion)
    const next = {
      volume_number: input.volume_number ?? current.volume_number,
      title: input.title ?? current.title,
      synopsis: input.synopsis ?? current.synopsis,
      status: input.status ?? current.status,
      sort_order: input.sort_order ?? current.sort_order,
      target_words: input.target_words === undefined ? current.target_words : input.target_words,
    }
    const result = expectedVersion === undefined
      ? this.database
          .prepare(
            `UPDATE volumes
             SET volume_number = ?, title = ?, synopsis = ?, status = ?, sort_order = ?,
                 target_words = ?, version = version + 1, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            next.volume_number,
            next.title,
            next.synopsis,
            next.status,
            next.sort_order,
            next.target_words,
            now(),
            id,
          )
      : this.database
          .prepare(
            `UPDATE volumes
             SET volume_number = ?, title = ?, synopsis = ?, status = ?, sort_order = ?,
                 target_words = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND version = ?`,
          )
          .run(
            next.volume_number,
            next.title,
            next.synopsis,
            next.status,
            next.sort_order,
            next.target_words,
            now(),
            id,
            expectedVersion,
          )
    if (result.changes === 0) {
      const actual = this.getById(id)
      if (actual && expectedVersion !== undefined) {
        throw new VersionConflictError('Volume', id, expectedVersion, actual.version)
      }
      return null
    }
    return this.getById(id)
  }

  public delete(id: string, expectedVersion?: number): boolean {
    const current = this.getById(id)
    if (!current) return false
    this.assertExpectedVersion(current, expectedVersion)
    const children = this.database
      .prepare<{ count: number }>(
        `SELECT (
           (SELECT COUNT(*) FROM volume_outlines WHERE volume_id = ?)
           + (SELECT COUNT(*) FROM chapter_outlines WHERE volume_id = ?)
         ) AS count`,
      )
      .get(id, id)
    if ((children?.count ?? 0) > 0) throw new VolumeDeletionProtectedError(id)

    const result = expectedVersion === undefined
      ? this.database.prepare('DELETE FROM volumes WHERE id = ?').run(id)
      : this.database
          .prepare('DELETE FROM volumes WHERE id = ? AND version = ?')
          .run(id, expectedVersion)
    if (result.changes === 0 && expectedVersion !== undefined) {
      const actual = this.getById(id)
      if (actual) throw new VersionConflictError('Volume', id, expectedVersion, actual.version)
    }
    return result.changes > 0
  }

  private assertExpectedVersion(volume: Volume, expectedVersion: number | undefined): void {
    if (expectedVersion !== undefined && volume.version !== expectedVersion) {
      throw new VersionConflictError('Volume', volume.id, expectedVersion, volume.version)
    }
  }
}
