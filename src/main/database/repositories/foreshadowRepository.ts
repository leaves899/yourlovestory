import { randomUUID } from 'node:crypto'
import { NarrativeStatusTransitionError } from '../../../shared/narrativeWorkbench'
import type {
  CreateForeshadowInput,
  Foreshadow,
  ForeshadowEvent,
  ForeshadowEventType,
  ForeshadowStatus,
} from '../../../shared/narrativeWorkbench'
import { parseJsonObject, stringifyJsonObject } from '../json'
import type { JsonObject } from '../json'
import type { SqliteDatabase } from '../types'

interface ForeshadowRow {
  id: string
  project_id: string
  title: string
  description: string
  status: string
  planned_payoff_chapter_id: string | null
  actual_payoff_chapter_id: string | null
  importance: number
  metadata_json: string
  created_at: string
  updated_at: string
}

interface ForeshadowEventRow {
  id: string
  foreshadow_id: string
  chapter_id: string | null
  event_type: string
  note: string
  created_at: string
}

const statuses: readonly ForeshadowStatus[] = [
  'suggested',
  'planned',
  'planted',
  'active',
  'revealed',
  'paid_off',
  'resolved',
  'abandoned',
]
const eventTypes: readonly ForeshadowEventType[] = [
  'suggested',
  'planned',
  'planted',
  'activated',
  'revealed',
  'paid_off',
  'resolved',
  'abandoned',
  'note',
]

function now(): string {
  return new Date().toISOString()
}

function toStatus(value: string): ForeshadowStatus {
  if (!statuses.includes(value as ForeshadowStatus)) {
    throw new Error(`Unknown foreshadow status: ${value}`)
  }
  return value as ForeshadowStatus
}

function toEventType(value: string): ForeshadowEventType {
  if (!eventTypes.includes(value as ForeshadowEventType)) {
    throw new Error(`Unknown foreshadow event type: ${value}`)
  }
  return value as ForeshadowEventType
}

function toForeshadow(row: ForeshadowRow): Foreshadow {
  const metadata = parseJsonObject(row.metadata_json, 'foreshadow.metadata')
  if (!metadata) throw new Error('Foreshadow metadata cannot be null')
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: toStatus(row.status),
    planned_payoff_chapter_id: row.planned_payoff_chapter_id,
    actual_payoff_chapter_id: row.actual_payoff_chapter_id,
    importance: row.importance,
    metadata: metadata as JsonObject,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function toEvent(row: ForeshadowEventRow): ForeshadowEvent {
  return {
    id: row.id,
    foreshadow_id: row.foreshadow_id,
    chapter_id: row.chapter_id,
    event_type: toEventType(row.event_type),
    note: row.note,
    created_at: row.created_at,
  }
}

export class ForeshadowRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateForeshadowInput): Foreshadow {
    const id = input.id ?? randomUUID()
    const timestamp = now()
    this.database
      .prepare(
        `INSERT INTO foreshadows (
          id, project_id, title, description, status, planned_payoff_chapter_id,
          actual_payoff_chapter_id, importance, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.project_id,
        input.title,
        input.description ?? '',
        input.status ?? 'planned',
        input.planned_payoff_chapter_id ?? null,
        input.actual_payoff_chapter_id ?? null,
        input.importance ?? 0,
        stringifyJsonObject(input.metadata ?? {}),
        timestamp,
        timestamp,
      )
    const foreshadow = this.getById(id)
    if (!foreshadow) throw new Error('Foreshadow was not created')
    return foreshadow
  }

  public getById(id: string): Foreshadow | null {
    const row = this.database
      .prepare<ForeshadowRow>('SELECT * FROM foreshadows WHERE id = ?')
      .get(id)
    return row ? toForeshadow(row) : null
  }

  public listByProject(projectId: string): Foreshadow[] {
    return this.database
      .prepare<ForeshadowRow>(
        `SELECT * FROM foreshadows
         WHERE project_id = ?
         ORDER BY importance DESC, created_at DESC, id`,
      )
      .all(projectId)
      .map(toForeshadow)
  }

  public updateStatus(
    id: string,
    status: ForeshadowStatus,
    actualPayoffChapterId?: string | null,
  ): Foreshadow | null {
    const current = this.getById(id)
    if (!current) return null
    if (current.status === status) return current
    const actualPayoff =
      actualPayoffChapterId === undefined
        ? current.actual_payoff_chapter_id
        : actualPayoffChapterId
    const result = this.database
      .prepare(
        `UPDATE foreshadows
         SET status = ?, actual_payoff_chapter_id = ?, updated_at = ?
         WHERE id = ? AND status = ?`,
      )
      .run(status, actualPayoff, now(), id, current.status)
    if (result.changes === 0) {
      throw new NarrativeStatusTransitionError('Foreshadow', id, current.status, status)
    }
    return this.getById(id)
  }

  public addEvent(
    foreshadowId: string,
    chapterId: string | null,
    eventType: ForeshadowEventType,
    note = '',
  ): ForeshadowEvent {
    const id = randomUUID()
    this.database
      .prepare(
        `INSERT INTO foreshadow_events (
          id, foreshadow_id, chapter_id, event_type, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, foreshadowId, chapterId, eventType, note, now())
    const event = this.database
      .prepare<ForeshadowEventRow>('SELECT * FROM foreshadow_events WHERE id = ?')
      .get(id)
    if (!event) throw new Error('Foreshadow event was not created')
    return toEvent(event)
  }

  public listEvents(foreshadowId: string): ForeshadowEvent[] {
    return this.database
      .prepare<ForeshadowEventRow>(
        `SELECT * FROM foreshadow_events
         WHERE foreshadow_id = ?
         ORDER BY created_at, id`,
      )
      .all(foreshadowId)
      .map(toEvent)
  }
}

export type { CreateForeshadowInput, Foreshadow, ForeshadowEvent, ForeshadowStatus }
