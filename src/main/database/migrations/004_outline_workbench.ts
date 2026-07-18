import type { Migration } from '../migrations'

export const outlineWorkbenchMigration: Migration = {
  version: 4,
  name: 'outline_workbench',
  up: `
CREATE TABLE volumes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  volume_number INTEGER NOT NULL CHECK (volume_number >= 1),
  title TEXT NOT NULL,
  synopsis TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'drafting', 'active', 'completed', 'archived')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  target_words INTEGER CHECK (target_words IS NULL OR target_words >= 1),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, volume_number)
);

CREATE TABLE volume_outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  volume_id TEXT NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'locked')),
  summary TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  main_conflict TEXT NOT NULL DEFAULT '',
  key_turning_points_json TEXT NOT NULL DEFAULT '[]',
  ending TEXT NOT NULL DEFAULT '',
  outline_json TEXT NOT NULL DEFAULT '{}',
  source_material_ids_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (volume_id)
);

CREATE TABLE chapter_outlines (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  volume_id TEXT NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL CHECK (chapter_number >= 1),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  opening TEXT NOT NULL DEFAULT '',
  conflict TEXT NOT NULL DEFAULT '',
  key_events_json TEXT NOT NULL DEFAULT '[]',
  ending TEXT NOT NULL DEFAULT '',
  ending_hook TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'locked')),
  outline_json TEXT NOT NULL DEFAULT '{}',
  source_material_ids_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, chapter_number),
  UNIQUE (volume_id, sort_order)
);

CREATE INDEX idx_volumes_project_sort ON volumes(project_id, sort_order, volume_number, id);
CREATE INDEX idx_volume_outlines_project_id ON volume_outlines(project_id);
CREATE INDEX idx_volume_outlines_volume_id ON volume_outlines(volume_id);
CREATE INDEX idx_chapter_outlines_project_order
  ON chapter_outlines(project_id, chapter_number, id);
CREATE INDEX idx_chapter_outlines_volume_sort
  ON chapter_outlines(volume_id, sort_order, chapter_number, id);
`,
}
