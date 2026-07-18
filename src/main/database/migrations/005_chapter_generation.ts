import type { Migration } from '../migrations'

export const chapterGenerationMigration: Migration = {
  version: 5,
  name: 'chapter_generation_pipeline',
  up: `
ALTER TABLE chapters ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN checkpoint_json TEXT;

CREATE TABLE chapter_versions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  content TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  fact_check_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'review'
    CHECK (status IN ('review', 'approved', 'rejected')),
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  confirmed_at TEXT,
  UNIQUE (chapter_id, version_number)
);

CREATE UNIQUE INDEX idx_chapter_versions_task
  ON chapter_versions(task_id)
  WHERE task_id IS NOT NULL;
CREATE INDEX idx_chapter_versions_chapter
  ON chapter_versions(chapter_id, version_number DESC);
CREATE INDEX idx_chapter_versions_current
  ON chapter_versions(chapter_id, is_current);
`,
}
