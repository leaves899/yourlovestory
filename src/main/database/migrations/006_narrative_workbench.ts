import type { Migration } from '../migrations'

export const narrativeWorkbenchMigration: Migration = {
  version: 6,
  name: 'narrative_memory_revision_workbench',
  up: `
ALTER TABLE chapter_revisions ADD COLUMN parent_revision_id TEXT REFERENCES chapter_revisions(id) ON DELETE SET NULL;
ALTER TABLE chapter_revisions ADD COLUMN operation TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE chapter_revisions ADD COLUMN blocks_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE narrative_memories ADD COLUMN status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE narrative_memories ADD COLUMN source_version_id TEXT REFERENCES chapter_versions(id) ON DELETE SET NULL;
ALTER TABLE narrative_memories ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE narrative_memory_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  source_version_id TEXT REFERENCES chapter_versions(id) ON DELETE SET NULL,
  memory_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chapter_revisions_current
  ON chapter_revisions(chapter_id, is_current);
CREATE INDEX idx_narrative_memory_proposals_project
  ON narrative_memory_proposals(project_id, status, created_at);
CREATE INDEX idx_narrative_memory_proposals_chapter
  ON narrative_memory_proposals(source_chapter_id, created_at);
CREATE INDEX idx_narrative_memories_chapter
  ON narrative_memories(source_chapter_id, created_at);
CREATE INDEX idx_foreshadow_events_chapter
  ON foreshadow_events(chapter_id, created_at);
`,
}
