import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { CredentialService, type SafeStorageAdapter } from '@/main/security/credentialService'
import { migrateLegacyLlmCredentials } from '@/main/security/llmCredentials'
import { initializeDatabase, migrations } from '@/main/database'

const TEST_SECRET = 'sk-test-secret-do-not-expose-123456'

class FakeSafeStorage implements SafeStorageAdapter {
  public available = true
  public failEncrypt = false
  public failDecrypt = false

  public isEncryptionAvailable(): boolean { return this.available }
  public encryptString(value: string): Buffer {
    if (this.failEncrypt) throw new Error('encrypt failed')
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
    expect(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')).toContain(TEST_SECRET)
  })

  it('migrates legacy project JSON without retaining a plaintext key in SQLite', () => {
    const database = initializeDatabase(root, {
      filename: path.join(root, 'legacy.sqlite'),
      migrations: migrations.filter((migration) => migration.version < 7),
    })
    try {
      database.prepare("INSERT INTO projects (id, slug, name) VALUES ('project-1', 'project-1', 'Project')").run()
      database.prepare("INSERT INTO project_configs (project_id, settings_json) VALUES ('project-1', ?)").run(
        JSON.stringify({ apiKey: TEST_SECRET, nested: { api_key: TEST_SECRET } }),
      )
      const report = migrateLegacyLlmCredentials(root, root, database, service)
      const row = database.prepare<{ settings_json: string }>('SELECT settings_json FROM project_configs WHERE project_id = ?').get('project-1')
      expect(report.migrated).toBe(1)
      expect(row?.settings_json).not.toContain(TEST_SECRET)
      expect(row?.settings_json).toContain('llmCredentialId')
      expect(service.getCredential('llm:project:project-1')).toEqual({ success: true, data: TEST_SECRET })
    } finally {
      database.close()
    }
  })
})
