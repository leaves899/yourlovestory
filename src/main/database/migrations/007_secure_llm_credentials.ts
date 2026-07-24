import type { Migration } from '../migrations'

/**
 * This runs only after main-process credential migration has verified every
 * legacy value. Keeping the drop separate prevents data loss on unavailable
 * Linux keyrings or interrupted migrations.
 */
export const secureLlmCredentialsMigration: Migration = {
  version: 7,
  name: 'remove_plaintext_llm_api_key_column',
  up: `ALTER TABLE llm_configs DROP COLUMN api_key;`,
}
