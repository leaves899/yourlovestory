import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from '../types'
import {
  CRASHED_ATTEMPT_REASON,
  type RuntimeSessionRecord,
} from '../../../shared/taskRecovery'

interface RuntimeSessionRow {
  id: string
  owner: string
  app_instance_id: string
  started_at: string
  ended_at: string | null
  end_reason: string | null
}

function toSession(row: RuntimeSessionRow): RuntimeSessionRecord {
  const endReason =
    row.end_reason === 'graceful' || row.end_reason === 'forced' ? row.end_reason : null
  return {
    id: row.id,
    owner: row.owner,
    app_instance_id: row.app_instance_id,
    started_at: row.started_at,
    ended_at: row.ended_at,
    end_reason: endReason,
  }
}

function now(): string {
  return new Date().toISOString()
}

export class RuntimeSessionRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public start(input: {
    id?: string
    owner: string
    appInstanceId: string
    startedAt?: string
  }): RuntimeSessionRecord {
    const id = input.id ?? randomUUID()
    const startedAt = input.startedAt ?? now()
    this.database
      .prepare(
        `INSERT INTO runtime_sessions (id, owner, app_instance_id, started_at, ended_at, end_reason)
         VALUES (?, ?, ?, ?, NULL, NULL)`,
      )
      .run(id, input.owner, input.appInstanceId, startedAt)
    const session = this.getById(id)
    if (!session) throw new Error('Runtime session was not created')
    return session
  }

  /**
   * Atomically reconciles every crashed session, releases its task leases,
   * closes its open recovery attempts, and creates the new runtime session.
   */
  public reconcileCrashedAndStart(input: {
    id?: string
    owner: string
    appInstanceId: string
    startedAt?: string
  }): RuntimeSessionRecord {
    const id = input.id ?? randomUUID()
    const timestamp = input.startedAt ?? now()
    const reconcile = this.database.transaction(() => {
      const crashedIds = this.database
        .prepare<{ id: string }>(
          'SELECT id FROM runtime_sessions WHERE ended_at IS NULL ORDER BY started_at, id',
        )
        .all()
        .map((row) => row.id)

      if (crashedIds.length > 0) {
        const placeholders = crashedIds.map(() => '?').join(', ')
        this.database
          .prepare(
            `UPDATE runtime_sessions
             SET ended_at = ?, end_reason = 'forced'
             WHERE id IN (${placeholders}) AND ended_at IS NULL`,
          )
          .run(timestamp, ...crashedIds)
        this.database
          .prepare(
            `UPDATE tasks
             SET lease_owner = NULL,
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 updated_at = ?
             WHERE runtime_session_id IN (${placeholders})
               AND lease_token IS NOT NULL`,
          )
          .run(timestamp, ...crashedIds)
        this.database
          .prepare(
            `UPDATE recovery_attempts
             SET finished_at = ?,
                 outcome = 'crashed',
                 error_message = ?
             WHERE finished_at IS NULL
               AND runtime_session_id IN (${placeholders})`,
          )
          .run(timestamp, CRASHED_ATTEMPT_REASON, ...crashedIds)
      }

      this.database
        .prepare(
          `INSERT INTO runtime_sessions (id, owner, app_instance_id, started_at, ended_at, end_reason)
           VALUES (?, ?, ?, ?, NULL, NULL)`,
        )
        .run(id, input.owner, input.appInstanceId, timestamp)
      const session = this.getById(id)
      if (!session) throw new Error('Runtime session was not created')
      return session
    })
    return reconcile()
  }

  public getById(id: string): RuntimeSessionRecord | null {
    const row = this.database
      .prepare<RuntimeSessionRow>('SELECT * FROM runtime_sessions WHERE id = ?')
      .get(id)
    return row ? toSession(row) : null
  }

  public listOpen(): RuntimeSessionRecord[] {
    return this.database
      .prepare<RuntimeSessionRow>(
        `SELECT * FROM runtime_sessions
         WHERE ended_at IS NULL
         ORDER BY started_at, id`,
      )
      .all()
      .map(toSession)
  }

  public end(
    id: string,
    endReason: 'graceful' | 'forced',
    endedAt?: string,
  ): RuntimeSessionRecord | null {
    const timestamp = endedAt ?? now()
    const result = this.database
      .prepare(
        `UPDATE runtime_sessions
         SET ended_at = ?, end_reason = ?
         WHERE id = ? AND ended_at IS NULL`,
      )
      .run(timestamp, endReason, id)
    if (result.changes === 0) return this.getById(id)
    return this.getById(id)
  }

  /**
   * Mark all open sessions from previous runs as crashed (no graceful end recorded).
   */
  public markOpenSessionsAsCrashed(endedAt?: string): number {
    const timestamp = endedAt ?? now()
    const result = this.database
      .prepare(
        `UPDATE runtime_sessions
         SET ended_at = ?, end_reason = 'forced'
         WHERE ended_at IS NULL`,
      )
      .run(timestamp)
    return result.changes
  }
}
