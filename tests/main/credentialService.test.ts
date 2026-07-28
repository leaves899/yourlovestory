import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CredentialService, type SafeStorageAdapter } from '@/main/security/credentialService'
import { migrateLegacyLlmCredentials } from '@/main/security/llmCredentials'
import { initializeDatabase, migrations } from '@/main/database'
import * as llmConfig from '@/agent/llm/config'

const TEST_SECRET = 'sk-test-secret-do-not-expose-123456'

class FakeSafeStorage implements SafeStorageAdapter {
  public available = true
  public failEncrypt = false
  public failDecrypt = false
  public failEncryptValue: string | null = null

  public isEncryptionAvailable(): boolean { return this.available }
  public encryptString(value: string): Buffer {
    if (this.failEncrypt || value === this.failEncryptValue) throw new Error('encrypt failed')
    return Buffer.from(`encrypted:${value}`, 'utf8')
  }
  public decryptString(value: Buffer): string {
    if (this.failDecrypt) throw new Error('decrypt failed')
    const decoded = value.toString('utf8')
    if (!decoded.startsWith('encrypted:')) throw new Error('corrupted')
    return decoded.slice('encrypted:'.length)
  }
  public getSelectedStorageBackend(): string { return 'kwallet' }
}

describe('CredentialService', () => {
  let root: string
  let safeStorage: FakeSafeStorage
  let service: CredentialService

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-credentials-'))
    safeStorage = new FakeSafeStorage()
    service = new CredentialService(root, safeStorage, 'win32', () => '2026-01-01T00:00:00.000Z')
  })

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

  it('saves, replaces, reads, and deletes credentials without plaintext storage', () => {
    expect(service.saveCredential('llm:app-default', TEST_SECRET).success).toBe(true)
    expect(service.getCredential('llm:app-default')).toEqual({ success: true, data: TEST_SECRET })
    expect(service.saveCredential('llm:app-default', 'sk-test-secret-do-not-expose-replaced').success).toBe(true)
    expect(service.getCredential('llm:app-default')).toEqual({ success: true, data: 'sk-test-secret-do-not-expose-replaced' })
    expect(service.hasCredential('llm:app-default')).toEqual({ success: true, data: true })
    const payload = fs.readFileSync(path.join(root, 'security', 'llm-credentials.json'), 'utf8')
    expect(payload).not.toContain(TEST_SECRET)
    expect(service.deleteCredential('llm:app-default')).toEqual({ success: true, data: true })
    expect(service.hasCredential('llm:app-default')).toEqual({ success: true, data: false })
  })

  it('deletes all credentials', () => {
    service.saveCredential('llm:app-default', TEST_SECRET)
    service.saveCredential('llm:project:project-1', TEST_SECRET)
    expect(service.deleteAllCredentials()).toEqual({ success: true, data: 2 })
    expect(service.hasCredential('llm:app-default')).toEqual({ success: true, data: false })
  })

  it('never falls back to plaintext when secure storage is unavailable or encryption fails', () => {
    safeStorage.available = false
    expect(service.saveCredential('llm:app-default', TEST_SECRET)).toMatchObject({ success: false, error: { code: 'UNAVAILABLE' } })
    safeStorage.available = true
    safeStorage.failEncrypt = true
    expect(service.saveCredential('llm:app-default', TEST_SECRET)).toMatchObject({ success: false, error: { code: 'ENCRYPT_FAILED' } })
    expect(fs.existsSync(path.join(root, 'security', 'llm-credentials.json'))).toBe(false)
  })

  it('reports decrypt failure and corrupted payload safely', () => {
    service.saveCredential('llm:app-default', TEST_SECRET)
    safeStorage.failDecrypt = true
    expect(service.getCredential('llm:app-default')).toMatchObject({ success: false, error: { code: 'DECRYPT_FAILED' } })
    safeStorage.failDecrypt = false
    fs.writeFileSync(path.join(root, 'security', 'llm-credentials.json'), '{bad json', 'utf8')
    expect(service.getCredential('llm:app-default')).toMatchObject({ success: false, error: { code: 'CORRUPTED' } })
  })

  it('rejects malformed Base64 payloads as corrupted data', () => {
    fs.mkdirSync(path.join(root, 'security'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'security', 'llm-credentials.json'),
      JSON.stringify({
        version: 1,
        credentials: {
          'llm:app-default': {
            payload: 'not valid base64',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      }),
      'utf8',
    )
    expect(service.getCredential('llm:app-default')).toMatchObject({
      success: false,
      error: { code: 'CORRUPTED' },
    })
  })

  it('rejects Linux basic_text backends', () => {
    const linux = new CredentialService(root, {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (value) => safeStorage.encryptString(value),
      decryptString: (value) => safeStorage.decryptString(value),
      getSelectedStorageBackend: () => 'basic_text',
    }, 'linux')
    expect(linux.availability()).toMatchObject({ available: false, error: { code: 'UNSAFE_BACKEND' } })
  })

  it('migrates plaintext settings only after a verified write and is idempotent', () => {
    fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ apiKey: TEST_SECRET, provider: 'openai' }), 'utf8')
    const database = { prepare: () => ({ all: () => [] }) } as never
    const first = migrateLegacyLlmCredentials(root, root, database, service)
    const settings = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')) as Record<string, unknown>
    expect(first.migrated).toBe(1)
    expect(JSON.stringify(settings)).not.toContain(TEST_SECRET)
    expect(settings.credentialId).toBe('llm:app-default')
    expect(migrateLegacyLlmCredentials(root, root, database, service).migrated).toBe(0)
  })

  it('retains plaintext migration input when secure storage fails', () => {
    fs.writeFileSync(path.join(root, 'settings.json'), JSON.stringify({ apiKey: TEST_SECRET }), 'utf8')
    safeStorage.available = false
    const database = { prepare: () => ({ all: () => [] }) } as never
    const report = migrateLegacyLlmCredentials(root, root, database, service)
    expect(report.migrated).toBe(0)
    expect(report.pending).toBe(1)
    expect(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')).toContain(TEST_SECRET)
  })

  it('does not block an empty database when secure storage is unavailable', () => {
    safeStorage.available = false
    const database = {
      prepare: () => ({
        get: () => ({ count: 0 }),
        all: () => [],
      }),
    } as never

    expect(migrateLegacyLlmCredentials(root, root, database, service)).toMatchObject({
      migrated: 0,
      pending: 0,
      failed: 0,
      issues: [],
    })
  })

  it.each([
    ['not a valid url', 'INVALID_LEGACY_LLM_BASE_URL'],
    ['http://192.168.1.20:11434', 'INSECURE_LEGACY_LLM_BASE_URL'],
  ])('retains global plaintext and reports a safe pending issue for legacy URL %s', (baseUrl, code) => {
    fs.writeFileSync(
      path.join(root, 'settings.json'),
      JSON.stringify({ provider: 'openai', baseUrl, apiKey: TEST_SECRET }),
      'utf8',
    )
    const database = { prepare: () => ({ all: () => [] }) } as never

    const report = migrateLegacyLlmCredentials(root, root, database, service)
    const persisted = fs.readFileSync(path.join(root, 'settings.json'), 'utf8')

    expect(report).toMatchObject({
      migrated: 0,
      pending: 1,
      failed: 0,
      issues: [{ source: 'settings', identifier: 'app-default', code }],
    })
    expect(JSON.stringify(report)).not.toContain(TEST_SECRET)
    expect(persisted).toContain(TEST_SECRET)
    expect(persisted).not.toContain('credentialId')
    expect(service.listCredentialIds()).toEqual({ success: true, data: [] })
  })

  it('migrates legacy project JSON without retaining a plaintext key in SQLite', () => {
    const database = initializeDatabase(root, {
      filename: path.join(root, 'legacy.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    try {
      database.prepare("INSERT INTO projects (id, slug, name) VALUES ('project-1', 'project-1', 'Project')").run()
      database.prepare("INSERT INTO project_configs (project_id, settings_json) VALUES ('project-1', ?)").run(
        JSON.stringify({
          openai: { apiKey: 'sk-test-openai-secret-111' },
          deepseek: { api_key: 'sk-test-deepseek-secret-222' },
        }),
      )
      const report = migrateLegacyLlmCredentials(root, root, database, service)
      const row = database.prepare<{ settings_json: string }>('SELECT settings_json FROM project_configs WHERE project_id = ?').get('project-1')
      const settings = JSON.parse(row!.settings_json) as {
        openai: { credentialId: string }
        deepseek: { credentialId: string }
      }
      expect(report).toMatchObject({ migrated: 2, pending: 0 })
      expect(row?.settings_json).not.toContain('sk-test-openai-secret-111')
      expect(row?.settings_json).not.toContain('sk-test-deepseek-secret-222')
      expect(settings.openai.credentialId).not.toBe(settings.deepseek.credentialId)
      expect(service.getCredential(settings.openai.credentialId)).toEqual({
        success: true,
        data: 'sk-test-openai-secret-111',
      })
      expect(service.getCredential(settings.deepseek.credentialId)).toEqual({
        success: true,
        data: 'sk-test-deepseek-secret-222',
      })
      expect(migrateLegacyLlmCredentials(root, root, database, service).migrated).toBe(0)
    } finally {
      database.close()
    }
  })

  it('migrates project credentials independently and retains only a failed plaintext field', () => {
    const database = initializeDatabase(root, {
      filename: path.join(root, 'partial.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    try {
      database.prepare("INSERT INTO projects (id, slug, name) VALUES ('project-2', 'project-2', 'Project')").run()
      database.prepare("INSERT INTO project_configs (project_id, settings_json) VALUES ('project-2', ?)").run(
        JSON.stringify({
          openai: { apiKey: 'sk-test-openai-secret-111' },
          deepseek: { api_key: 'sk-test-deepseek-secret-222' },
        }),
      )
      safeStorage.failEncryptValue = 'sk-test-deepseek-secret-222'
      const first = migrateLegacyLlmCredentials(root, root, database, service)
      const partial = database.prepare<{ settings_json: string }>(
        'SELECT settings_json FROM project_configs WHERE project_id = ?',
      ).get('project-2')!.settings_json

      expect(first).toMatchObject({ migrated: 1, pending: 1 })
      expect(partial).not.toContain('sk-test-openai-secret-111')
      expect(partial).toContain('sk-test-deepseek-secret-222')
      expect(
        database.prepare<{ count: number }>(
          'SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 8',
        ).get(),
      ).toEqual({ count: 0 })

      safeStorage.failEncryptValue = null
      const recovered = migrateLegacyLlmCredentials(root, root, database, service)
      const completed = database.prepare<{ settings_json: string }>(
        'SELECT settings_json FROM project_configs WHERE project_id = ?',
      ).get('project-2')!.settings_json
      expect(recovered).toMatchObject({ migrated: 1, pending: 0 })
      expect(completed).not.toContain('sk-test-')
    } finally {
      database.close()
    }
  })

  it('continues database migration while retaining a row with an insecure legacy URL', () => {
    const database = initializeDatabase(root, {
      filename: path.join(root, 'legacy-invalid-url.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    try {
      database.prepare(
        "INSERT INTO projects (id, slug, name) VALUES ('project-db', 'project-db', 'Project')",
      ).run()
      const insert = database.prepare(
        `INSERT INTO llm_configs
          (id, project_id, name, provider, base_url, model, api_key)
         VALUES (?, 'project-db', ?, 'openai', ?, 'test-model', ?)`,
      )
      insert.run('valid-config', 'Valid', 'https://api.example.test/v1', TEST_SECRET)
      insert.run('invalid-config', 'Invalid', 'http://10.0.0.8:8080', TEST_SECRET)

      const report = migrateLegacyLlmCredentials(root, root, database, service)
      const rows = database.prepare<{
        id: string
        api_key: string
        credential_id: string
      }>('SELECT id, api_key, credential_id FROM llm_configs ORDER BY id').all()
      const invalid = rows.find((row) => row.id === 'invalid-config')!
      const valid = rows.find((row) => row.id === 'valid-config')!

      expect(report).toMatchObject({ migrated: 1, pending: 1, failed: 0 })
      expect(report.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          identifier: 'project-db:invalid-config',
          code: 'INSECURE_LEGACY_LLM_BASE_URL',
        }),
      ]))
      expect(invalid.api_key).toBe(TEST_SECRET)
      expect(invalid.credential_id).toBe('')
      expect(valid.api_key).toBe('')
      expect(valid.credential_id).toBe('llm-config:valid-config')
      expect(
        database.prepare<{ count: number }>(
          'SELECT COUNT(*) AS count FROM schema_migrations WHERE version = 8',
        ).get(),
      ).toEqual({ count: 0 })
      expect(database.prepare<{ name: string }>('PRAGMA table_info(llm_configs)').all())
        .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'api_key' })]))
      expect(JSON.stringify(report)).not.toContain(TEST_SECRET)
    } finally {
      database.close()
    }
  })

  it('migrates valid project credentials around an invalid URL and recovers after correction', () => {
    const database = initializeDatabase(root, {
      filename: path.join(root, 'project-mixed-url.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    try {
      database.prepare(
        "INSERT INTO projects (id, slug, name) VALUES ('project-mixed', 'project-mixed', 'Project')",
      ).run()
      database.prepare(
        "INSERT INTO project_configs (project_id, settings_json) VALUES ('project-mixed', ?)",
      ).run(JSON.stringify({
        valid: {
          provider: 'deepseek',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: TEST_SECRET,
        },
        invalid: {
          provider: 'openai',
          baseUrl: 'http://172.16.0.5:3000',
          apiKey: TEST_SECRET,
        },
      }))

      const first = migrateLegacyLlmCredentials(root, root, database, service)
      const partialRow = database.prepare<{ settings_json: string }>(
        "SELECT settings_json FROM project_configs WHERE project_id = 'project-mixed'",
      ).get()!
      const partial = JSON.parse(partialRow.settings_json) as {
        valid: { apiKey?: string; credentialId?: string }
        invalid: { apiKey?: string; credentialId?: string; baseUrl: string }
      }

      expect(first).toMatchObject({ migrated: 1, pending: 1, failed: 0 })
      expect(partial.valid.apiKey).toBeUndefined()
      expect(partial.valid.credentialId).toBeDefined()
      expect(partial.invalid.apiKey).toBe(TEST_SECRET)
      expect(partial.invalid.credentialId).toBeUndefined()
      expect(migrateLegacyLlmCredentials(root, root, database, service))
        .toMatchObject({ migrated: 0, pending: 1, failed: 0 })

      partial.invalid.baseUrl = 'https://local-model.example/v1'
      database.prepare(
        "UPDATE project_configs SET settings_json = ? WHERE project_id = 'project-mixed'",
      ).run(JSON.stringify(partial))
      const recovered = migrateLegacyLlmCredentials(root, root, database, service)
      const completed = database.prepare<{ settings_json: string }>(
        "SELECT settings_json FROM project_configs WHERE project_id = 'project-mixed'",
      ).get()!.settings_json

      expect(recovered).toMatchObject({ migrated: 1, pending: 0, failed: 0 })
      expect(completed).not.toContain(TEST_SECRET)
    } finally {
      database.close()
    }
  })

  it('returns a structured failure for an unexpected binding error and continues other records', () => {
    fs.writeFileSync(
      path.join(root, 'settings.json'),
      JSON.stringify({ provider: 'openai', baseUrl: 'https://app.example/v1', apiKey: TEST_SECRET }),
      'utf8',
    )
    const database = initializeDatabase(root, {
      filename: path.join(root, 'unexpected-binding.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    try {
      database.prepare(
        "INSERT INTO projects (id, slug, name) VALUES ('project-next', 'project-next', 'Project')",
      ).run()
      database.prepare(
        `INSERT INTO llm_configs
          (id, project_id, name, provider, base_url, model, api_key)
         VALUES ('next-config', 'project-next', 'Next', 'openai',
           'https://api.example.test/v1', 'test-model', ?)`,
      ).run(TEST_SECRET)
      jest.spyOn(llmConfig, 'normalizeLlmBaseUrl')
        .mockImplementationOnce(() => { throw new Error('unexpected implementation failure') })

      const report = migrateLegacyLlmCredentials(root, root, database, service)

      expect(report).toMatchObject({
        migrated: 1,
        pending: 1,
        failed: 1,
        issues: [expect.objectContaining({ code: 'CREDENTIAL_BINDING_INVALID' })],
      })
      expect(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')).toContain(TEST_SECRET)
      expect(JSON.stringify(report)).not.toContain(TEST_SECRET)
    } finally {
      jest.restoreAllMocks()
      database.close()
    }
  })

  it('restores the previous encrypted credential when reference commit fails', () => {
    expect(service.saveCredential('llm:app-default', TEST_SECRET).success).toBe(true)
    const result = service.saveCredentialWithCommit(
      'llm:app-default',
      'sk-test-secret-do-not-expose-replacement',
      { provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
      () => false,
    )
    expect(result).toMatchObject({ success: false, error: { code: 'REFERENCE_WRITE_FAILED' } })
    expect(service.getCredential('llm:app-default')).toEqual({ success: true, data: TEST_SECRET })
  })
})
