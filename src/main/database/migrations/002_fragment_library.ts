import type { Migration } from '../migrations'

export const fragmentLibraryMigration: Migration = {
  version: 2,
  name: 'fragment_library',
  up: `
CREATE TABLE fragments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  time TEXT,
  origin TEXT NOT NULL DEFAULT 'user',
  mood TEXT,
  content TEXT NOT NULL DEFAULT '',
  env_tags_json TEXT NOT NULL DEFAULT '[]',
  behavior_tags_json TEXT NOT NULL DEFAULT '[]',
  custom_tags_json TEXT NOT NULL DEFAULT '[]',
  writing_mode TEXT NOT NULL DEFAULT 'raw',
  theme TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fragments_project_id ON fragments(project_id);
CREATE INDEX idx_fragments_project_date ON fragments(project_id, date);
`,
}
