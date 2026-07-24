import type { Migration } from '../migrations'

/**
 * Main process runs this only after every legacy value has been verified in
 * safeStorage. Keeping the destructive step separate makes interrupted or
 * unavailable-keyring migrations recoverable.
 */
export const removePlaintextLlmCredentialsMigration: Migration = {
  version: 8,
  name: 'remove_plaintext_llm_api_key_column',
  up: `ALTER TABLE llm_configs DROP COLUMN api_key;`,
}
