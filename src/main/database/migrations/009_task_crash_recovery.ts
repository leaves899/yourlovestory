import type { Migration } from '../migrations'

export const taskCrashRecoveryMigration: Migration = {
  version: 9,
  name: 'task_crash_recovery',
  up: `
CREATE TABLE runtime_sessions (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  app_instance_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT
);

CREATE INDEX idx_runtime_sessions_open
  ON runtime_sessions(ended_at, started_at);

ALTER TABLE tasks ADD COLUMN execution_phase TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE tasks ADD COLUMN recovery_classification TEXT;
ALTER TABLE tasks ADD COLUMN recovery_reason TEXT;
ALTER TABLE tasks ADD COLUMN recovery_action TEXT;
ALTER TABLE tasks ADD COLUMN recovery_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN max_recovery_attempts INTEGER NOT NULL DEFAULT 3;
ALTER TABLE tasks ADD COLUMN last_recovery_attempt_at TEXT;
ALTER TABLE tasks ADD COLUMN last_recovery_error TEXT;
ALTER TABLE tasks ADD COLUMN idempotency_key TEXT;
ALTER TABLE tasks ADD COLUMN checkpoint_schema_version INTEGER;
ALTER TABLE tasks ADD COLUMN recovery_root_task_id TEXT;
ALTER TABLE tasks ADD COLUMN lease_owner TEXT;
ALTER TABLE tasks ADD COLUMN lease_token TEXT;
ALTER TABLE tasks ADD COLUMN lease_expires_at TEXT;
ALTER TABLE tasks ADD COLUMN timeout_at TEXT;
ALTER TABLE tasks ADD COLUMN shutdown_kind TEXT;
ALTER TABLE tasks ADD COLUMN runtime_session_id TEXT;
ALTER TABLE tasks ADD COLUMN recovery_metadata_version INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_tasks_active_idempotency
  ON tasks(idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('pending', 'running');

CREATE INDEX idx_tasks_recovery_scan
  ON tasks(status, execution_phase, lease_expires_at);

CREATE INDEX idx_tasks_lease
  ON tasks(lease_owner, lease_expires_at);

CREATE INDEX idx_tasks_recovery_root
  ON tasks(recovery_root_task_id);

ALTER TABLE chapter_revisions ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_chapter_revisions_task
  ON chapter_revisions(task_id)
  WHERE task_id IS NOT NULL;

CREATE UNIQUE INDEX idx_postprocess_reports_task
  ON postprocess_reports(task_id)
  WHERE task_id IS NOT NULL;
`,
}
