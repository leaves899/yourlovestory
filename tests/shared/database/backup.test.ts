import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DatabaseBackupService,
  type BackupRecord,
} from '@/main/backup'
import {
  getDatabasePath,
  executeDatabaseRestore,
  initializeDatabase,
  initializeDatabaseLifecycle,
  type Migration,
  type SqliteDatabase,
} from '@/main/database'

function digest(filename: string): string {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex')
}

describe('database backup service', () => {
  let root: string
  let database: SqliteDatabase | null
  let service: DatabaseBackupService

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-backup-'))
    database = initializeDatabase(root)
    service = new DatabaseBackupService({
      userDataPath: root,
      databasePath: getDatabasePath(root),
      appVersion: 'test-version',
      getDatabase: () => database,
    })
  })

  afterEach(() => {
    database?.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('creates a verified online snapshot after WAL writes', async () => {
    database!.exec('CREATE TABLE backup_probe (value TEXT NOT NULL)')
    database!.prepare('INSERT INTO backup_probe (value) VALUES (?)').run('WAL 中的内容')

    const record = await service.createBackup({ reason: 'manual' })
    const backupPath = path.join(root, 'backups', 'database', record.filename)
    expect(record).toMatchObject({
      reason: 'manual',
      appVersion: 'test-version',
      schemaVersion: 8,
    })
    expect(record.sha256).toBe(digest(backupPath))
    expect(record.size).toBe(fs.statSync(backupPath).size)
    expect(await service.verifyBackup(record.id)).toMatchObject({ valid: true })

    const snapshot = new Database(backupPath, { readonly: true, fileMustExist: true })
    try {
      expect(snapshot.pragma('quick_check')).toEqual([{ quick_check: 'ok' }])
      expect(snapshot.prepare('SELECT value FROM backup_probe').get()).toEqual({
        value: 'WAL 中的内容',
      })
    } finally {
      snapshot.close()
    }
  })

  test('does not list temporary files or copy sibling security data', async () => {
    const secret = 'sk-test-secret-do-not-expose-123456'
    fs.mkdirSync(path.join(root, 'security'), { recursive: true })
    fs.writeFileSync(path.join(root, 'security', 'llm-credentials.json'), secret)
    const record = await service.createBackup({ reason: 'manual' })
    const directory = path.join(root, 'backups', 'database')
    fs.writeFileSync(path.join(directory, 'partial.sqlite.tmp'), 'partial')
    fs.writeFileSync(path.join(directory, 'partial.json.tmp'), '{}')

    expect(await service.listBackups()).toEqual([record])
    const metadata = fs.readFileSync(path.join(directory, `${record.id}.json`), 'utf8')
    expect(metadata).not.toContain(secret)
    expect(metadata).not.toContain(root)
    expect(fs.existsSync(path.join(directory, 'security'))).toBe(false)
  })

  test('creates at most one scheduled backup within 24 hours', async () => {
    const clock = { value: new Date('2026-03-01T00:00:00.000Z') }
    const scheduledService = new DatabaseBackupService({
      userDataPath: root,
      databasePath: getDatabasePath(root),
      appVersion: 'test-version',
      getDatabase: () => database,
      now: () => clock.value,
    })
    expect(await scheduledService.createScheduledBackupIfDue()).not.toBeNull()
    clock.value = new Date('2026-03-01T23:59:59.000Z')
    expect(await scheduledService.createScheduledBackupIfDue()).toBeNull()
    clock.value = new Date('2026-03-02T00:00:01.000Z')
    expect(await scheduledService.createScheduledBackupIfDue()).not.toBeNull()
  })

  test('rejects checksum mismatch and corrupted snapshots', async () => {
    const record = await service.createBackup({ reason: 'manual' })
    const backupPath = path.join(root, 'backups', 'database', record.filename)
    fs.appendFileSync(backupPath, 'tampered')
    await expect(service.verifyBackup(record.id)).resolves.toMatchObject({
      valid: false,
      error: 'Backup checksum does not match',
    })
    await expect(service.restoreBackup(record.id)).resolves.toMatchObject({ ready: false })

    const second = await service.createBackup({ reason: 'manual' })
    const secondPath = path.join(root, 'backups', 'database', second.filename)
    fs.writeFileSync(secondPath, Buffer.from('not a sqlite database'))
    const metadataPath = path.join(root, 'backups', 'database', `${second.id}.json`)
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as BackupRecord
    metadata.sha256 = digest(secondPath)
    metadata.size = fs.statSync(secondPath).size
    fs.writeFileSync(metadataPath, JSON.stringify(metadata))
    await expect(service.verifyBackup(second.id)).resolves.toMatchObject({ valid: false })
  })

  test('supports Unicode paths and prunes ordinary backups while retaining migration snapshots', async () => {
    database?.close()
    const unicodeRoot = path.join(root, '数据 备份')
    database = initializeDatabase(unicodeRoot)
    const records: BackupRecord[] = []
    const dates = [
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
      '2026-03-01T00:00:00.000Z',
    ]
    for (const [index, iso] of dates.entries()) {
      const datedService = new DatabaseBackupService({
        userDataPath: unicodeRoot,
        databasePath: getDatabasePath(unicodeRoot),
        appVersion: 'test-version',
        getDatabase: () => database,
        now: () => new Date(iso),
      })
      records.push(await datedService.createBackup({
        reason: index === 0 ? 'pre-migration' : 'manual',
      }))
    }
    const pruningService = new DatabaseBackupService({
      userDataPath: unicodeRoot,
      databasePath: getDatabasePath(unicodeRoot),
      appVersion: 'test-version',
      getDatabase: () => database,
      now: () => new Date('2026-03-15T00:00:00.000Z'),
    })
    const result = await pruningService.pruneBackups({ maxBackups: 2, maxAgeDays: 30 })
    expect(result.failed).toEqual([])
    expect(result.deleted).toEqual([records[1].id])
    expect((await pruningService.listBackups()).map((record) => record.id)).toEqual([
      records[2].id,
      records[0].id,
    ])
  })

  test('creates a pre-restore snapshot before replacing the database', async () => {
    database!.exec('CREATE TABLE restore_probe (value TEXT NOT NULL)')
    database!.prepare('INSERT INTO restore_probe (value) VALUES (?)').run('目标版本')
    const target = await service.createBackup({ reason: 'manual' })
    database!.prepare('UPDATE restore_probe SET value = ?').run('恢复前版本')
    const relaunch = jest.fn()

    const result = await executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      closeDatabase: () => {
        database!.close()
        database = null
      },
      relaunch,
    })
    expect(result).toMatchObject({
      restored: true,
      backupId: target.id,
      relaunching: true,
    })
    expect(relaunch).toHaveBeenCalledTimes(1)
    const records = await service.listBackups()
    expect(records.find((record) => record.id === result.preRestoreBackupId)?.reason)
      .toBe('pre-restore')

    const restored = new Database(getDatabasePath(root), { readonly: true, fileMustExist: true })
    try {
      expect(restored.prepare('SELECT value FROM restore_probe').get()).toEqual({
        value: '目标版本',
      })
    } finally {
      restored.close()
    }
  })

  test('restores from recovery mode while preserving the unusable original database', async () => {
    database!.exec('CREATE TABLE recovery_probe (value TEXT NOT NULL)')
    database!.prepare('INSERT INTO recovery_probe (value) VALUES (?)').run('可恢复内容')
    const target = await service.createBackup({ reason: 'manual' })
    database!.close()
    database = null
    fs.writeFileSync(getDatabasePath(root), 'not a sqlite database')
    const relaunch = jest.fn()

    const result = await executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      databaseAvailable: false,
      closeDatabase: jest.fn(),
      relaunch,
    })
    expect(result.restored).toBe(true)
    expect(result.preRestoreBackupId).toMatch(/^pre-restore-unusable-/)
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(path.join(
      root,
      'backups',
      'database',
      'failed',
      `${result.preRestoreBackupId}.sqlite`,
    ))).toBe(true)

    const restored = new Database(getDatabasePath(root), { readonly: true, fileMustExist: true })
    try {
      expect(restored.prepare('SELECT value FROM recovery_probe').get()).toEqual({
        value: '可恢复内容',
      })
    } finally {
      restored.close()
    }
  })
})

describe('managed database lifecycle', () => {
  const first: Migration = {
    version: 1,
    name: 'first',
    up: 'CREATE TABLE original_data (value TEXT NOT NULL)',
  }
  const seventh: Migration = {
    version: 7,
    name: 'credential boundary',
    up: 'CREATE TABLE credential_reference (id TEXT PRIMARY KEY)',
  }
  const eighth: Migration = {
    version: 8,
    name: 'credential cleanup',
    up: 'CREATE TABLE credential_cleanup (done INTEGER NOT NULL)',
  }
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-lifecycle-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('initializes a new database and preserves the 1-7, credential, 8 order', async () => {
    const events: string[] = []
    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: (database) => {
        expect(database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential_reference'",
        ).get()).toBeDefined()
        expect(database.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential_cleanup'",
        ).get()).toBeUndefined()
        events.push('credentials')
        return { pending: 0, failed: 0 }
      },
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    try {
      expect(events).toEqual(['credentials'])
      expect(result.migrationBackup).toBeNull()
      expect(result.database.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential_cleanup'",
      ).get()).toBeDefined()
      expect(result.status).toMatchObject({ state: 'ready', integrity: 'ok', schemaVersion: 8 })
    } finally {
      result.database.close()
    }
  })

  test('creates a migration snapshot before upgrading an existing database', async () => {
    const legacy = initializeDatabase(root, { migrations: [first] })
    legacy.prepare('INSERT INTO original_data (value) VALUES (?)').run('保留内容')
    legacy.close()

    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: () => ({ pending: 0, failed: 0 }),
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    try {
      expect(result.migrationBackup?.reason).toBe('pre-migration')
      expect(result.database.prepare('SELECT value FROM original_data').get()).toEqual({
        value: '保留内容',
      })
    } finally {
      result.database.close()
    }
  })

  test('restores the original database when credential conversion leaves side effects and fails', async () => {
    const legacy = initializeDatabase(root, { migrations: [first] })
    legacy.prepare('INSERT INTO original_data (value) VALUES (?)').run('原始数据')
    legacy.close()

    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: (database) => {
        database.exec('CREATE TABLE credential_file_side_effect (value TEXT)')
        throw new Error('Authorization: Bearer sk-test-secret-do-not-expose-123456')
      },
    })
    expect(result).toMatchObject({
      success: false,
      status: {
        state: 'migration-rolled-back',
        integrity: 'ok',
      },
    })
    expect(result.status.message).not.toContain('sk-test-secret-do-not-expose-123456')

    const restored = new Database(getDatabasePath(root), { readonly: true, fileMustExist: true })
    try {
      expect(restored.prepare('SELECT value FROM original_data').get()).toEqual({
        value: '原始数据',
      })
      expect(restored.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential_reference'",
      ).get()).toBeUndefined()
      expect(restored.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'credential_file_side_effect'",
      ).get()).toBeUndefined()
      expect(restored.pragma('quick_check')).toEqual([{ quick_check: 'ok' }])
    } finally {
      restored.close()
    }
    expect(fs.readdirSync(path.join(root, 'backups', 'database', 'failed')).length).toBeGreaterThan(0)
  })

  test('preserves a corrupt database and returns recovery information without migrating', async () => {
    fs.mkdirSync(path.dirname(getDatabasePath(root)), { recursive: true })
    fs.writeFileSync(getDatabasePath(root), 'not a sqlite database')
    const before = fs.readFileSync(getDatabasePath(root))
    const migrateCredentials = jest.fn(() => ({ pending: 0, failed: 0 }))

    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      migrateCredentials,
    })
    expect(result).toMatchObject({
      success: false,
      status: { state: 'recovery-required', integrity: 'failed' },
    })
    expect(migrateCredentials).not.toHaveBeenCalled()
    expect(fs.readFileSync(getDatabasePath(root))).toEqual(before)
  })
})
