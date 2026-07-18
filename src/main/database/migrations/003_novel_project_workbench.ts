import type { Migration } from '../migrations'

export const novelProjectWorkbenchMigration: Migration = {
  version: 3,
  name: 'novel_project_workbench',
  up: `
ALTER TABLE projects ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE project_configs ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE characters ADD COLUMN crush_slug TEXT;
ALTER TABLE characters ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE worldview_entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE organizations ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE source_materials ADD COLUMN character_id TEXT REFERENCES characters(id) ON DELETE SET NULL;
ALTER TABLE source_materials ADD COLUMN fragment_id TEXT;
ALTER TABLE source_materials ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fragments ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

DROP INDEX idx_relations_project_id;
DROP INDEX idx_relations_source_character_id;
DROP INDEX idx_relations_target_character_id;

ALTER TABLE relations RENAME TO relations_legacy;

CREATE TABLE relations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
  target_character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  strength REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  source_entity_type TEXT NOT NULL DEFAULT 'character',
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'character',
  target_entity_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (source_entity_id <> target_entity_id OR source_entity_type <> target_entity_type)
);

INSERT INTO relations (
  id, project_id, source_character_id, target_character_id, relation_type, description,
  strength, metadata_json, source_entity_type, source_entity_id, target_entity_type,
  target_entity_id, version, created_at, updated_at
)
SELECT
  id, project_id, source_character_id, target_character_id, relation_type, description,
  strength, metadata_json, 'character', source_character_id, 'character',
  target_character_id, 1, created_at, updated_at
FROM relations_legacy;

DROP TABLE relations_legacy;

CREATE TABLE workbench_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO workbench_state (id) VALUES (1);

CREATE UNIQUE INDEX idx_characters_project_crush_slug
  ON characters(project_id, crush_slug)
  WHERE crush_slug IS NOT NULL;
CREATE INDEX idx_relations_source_entity ON relations(source_entity_type, source_entity_id);
CREATE INDEX idx_relations_target_entity ON relations(target_entity_type, target_entity_id);
CREATE INDEX idx_source_materials_character_id ON source_materials(project_id, character_id);
CREATE UNIQUE INDEX idx_source_materials_project_fragment
  ON source_materials(project_id, fragment_id)
  WHERE fragment_id IS NOT NULL;

CREATE TRIGGER relations_cleanup_after_character_delete
AFTER DELETE ON characters
BEGIN
  DELETE FROM relations
   WHERE (source_entity_type = 'character' AND source_entity_id = OLD.id)
      OR (target_entity_type = 'character' AND target_entity_id = OLD.id);
END;

CREATE TRIGGER relations_cleanup_after_organization_delete
AFTER DELETE ON organizations
BEGIN
  DELETE FROM relations
   WHERE (source_entity_type = 'organization' AND source_entity_id = OLD.id)
      OR (target_entity_type = 'organization' AND target_entity_id = OLD.id);
END;

CREATE TRIGGER relations_cleanup_after_worldview_delete
AFTER DELETE ON worldview_entries
BEGIN
  DELETE FROM relations
   WHERE (source_entity_type = 'worldview' AND source_entity_id = OLD.id)
      OR (target_entity_type = 'worldview' AND target_entity_id = OLD.id);
END;
`,
}
