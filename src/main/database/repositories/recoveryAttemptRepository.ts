import { randomUUID } from 'node:crypto'
import type {
  RecoveryAttemptKind,
  RecoveryAttemptOutcome,
  RecoveryAttemptRecord,
} from '../../../shared/taskRecovery'
import type { SqliteDatabase } from '../types'

interface RecoveryAttemptRow {
  id: string
  task_id: string
  recovery_root_task_id: string
  attempt_number: number
  kind: string
  owner: string
  runtime_session_id: string | null
  lease_token: string | null
  claimed_at: string
  started_at: string | null
  finished_at: string | null
  outcome: string | null
  error_message: string | null
}

function toAttempt(row: RecoveryAttemptRow): RecoveryAttemptRecord {
  const kind: RecoveryAttemptKind = row.kind === 'manual' ? 'manual' : 'auto'
  const outcome =
    row.outcome === 'completed'
    || row.outcome === 'failed'
    || row.outcome === 'cancelled'
    || row.outcome === 'timeout'
    || row.outcome === 'lost_lease'
    || row.outcome === 'aborted'
    || row.outcome === 'interrupted'
    || row.outcome === 'crashed'
      ? row.outcome
      : null
  return {
    id: row.id,
    task_id: row.task_id,
    recovery_root_task_id: row.recovery_root_task_id,
    attempt_number: row.attempt_number,
    kind,
    owner: row.owner,
    runtime_session_id: row.runtime_session_id,
    lease_token: row.lease_token,
    claimed_at: row.claimed_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    outcome,
    error_message: row.error_message,
  }
}

export interface CreateRecoveryAttemptInput {
  id?: string
  taskId: string
  recoveryRootTaskId: string
  attemptNumber: number
  kind: RecoveryAttemptKind
  owner: string
  runtimeSessionId?: string | null
  leaseToken?: string | null
  claimedAt: string
}

export class RecoveryAttemptRepository {
  public constructor(private readonly database: SqliteDatabase) {}

  public create(input: CreateRecoveryAttemptInput): RecoveryAttemptRecord {
    const id = input.id ?? randomUUID()
    this.database
      .prepare(
        `INSERT INTO recovery_attempts (
          id, task_id, recovery_root_task_id, attempt_number, kind, owner,
          runtime_session_id, lease_token, claimed_at, started_at, finished_at, outcome, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
      )
      .run(
        id,
        input.taskId,
        input.recoveryRootTaskId,
        input.attemptNumber,
        input.kind,
        input.owner,
        input.runtimeSessionId ?? null,
        input.leaseToken ?? null,
        input.claimedAt,
      )
    const attempt = this.getById(id)
    if (!attempt) throw new Error('Recovery attempt was not created')
    return attempt
  }

  public getById(id: string): RecoveryAttemptRecord | null {
    const row = this.database
      .prepare<RecoveryAttemptRow>('SELECT * FROM recovery_attempts WHERE id = ?')
      .get(id)
    return row ? toAttempt(row) : null
  }

  public listByTask(taskId: string): RecoveryAttemptRecord[] {
    return this.database
      .prepare<RecoveryAttemptRow>(
        `SELECT * FROM recovery_attempts
         WHERE task_id = ?
         ORDER BY attempt_number ASC, claimed_at ASC, id ASC`,
      )
      .all(taskId)
      .map(toAttempt)
  }

  public listByRoot(rootTaskId: string): RecoveryAttemptRecord[] {
    return this.database
      .prepare<RecoveryAttemptRow>(
        `SELECT * FROM recovery_attempts
         WHERE recovery_root_task_id = ?
         ORDER BY claimed_at ASC, attempt_number ASC, id ASC`,
      )
      .all(rootTaskId)
      .map(toAttempt)
  }

  public markStarted(id: string, startedAt: string): RecoveryAttemptRecord | null {
    this.database
      .prepare(
        `UPDATE recovery_attempts
         SET started_at = COALESCE(started_at, ?)
         WHERE id = ?`,
      )
      .run(startedAt, id)
    return this.getById(id)
  }

  public finish(
    id: string,
    outcome: RecoveryAttemptOutcome,
    finishedAt: string,
    errorMessage: string | null = null,
  ): RecoveryAttemptRecord | null {
    this.database
      .prepare(
        `UPDATE recovery_attempts
         SET finished_at = ?,
             outcome = ?,
             error_message = ?
         WHERE id = ? AND finished_at IS NULL`,
      )
      .run(finishedAt, outcome, errorMessage, id)
    return this.getById(id)
  }

  public countOpen(): number {
    return this.database
      .prepare<{ count: number }>(
        'SELECT COUNT(*) AS count FROM recovery_attempts WHERE finished_at IS NULL',
      )
      .get()?.count ?? 0
  }

  /**
   * Deterministically finish open attempts belonging to crashed runtime sessions.
   * Does not touch attempts for sessions outside the provided id set.
   */
  public finishOpenForRuntimeSessions(
    sessionIds: readonly string[],
    outcome: Extract<RecoveryAttemptOutcome, 'interrupted' | 'crashed'>,
    finishedAt: string,
    errorMessage: string,
  ): number {
    if (sessionIds.length === 0) return 0
    const placeholders = sessionIds.map(() => '?').join(', ')
    const result = this.database
      .prepare(
        `UPDATE recovery_attempts
         SET finished_at = ?,
             outcome = ?,
             error_message = ?
         WHERE finished_at IS NULL
           AND runtime_session_id IN (${placeholders})`,
      )
      .run(finishedAt, outcome, errorMessage, ...sessionIds)
    return result.changes
  }
}
