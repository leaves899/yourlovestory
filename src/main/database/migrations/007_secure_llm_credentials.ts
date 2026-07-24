import type { Migration } from '../migrations'

export const secureLlmCredentialsMigration: Migration = {
  version: 7,
  name: 'add_llm_credential_reference',
  up: `ALTER TABLE llm_configs ADD COLUMN credential_id TEXT NOT NULL DEFAULT '';`,
}
