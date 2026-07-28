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
  migrations,
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

  test('blocks every user-visible backup while legacy plaintext credentials remain', async () => {
    database?.close()
    database = null
    const legacyRoot = path.join(root, 'legacy')
    const legacyDatabase = initializeDatabase(legacyRoot, {
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    const secret = 'sk-legacy-plaintext-secret-123456'
    legacyDatabase.prepare(
      "INSERT INTO projects (id, slug, name) VALUES ('project-1', 'project-1', 'Project')",
    ).run()
    legacyDatabase.prepare(
      `INSERT INTO llm_configs
        (id, project_id, name, provider, base_url, model, api_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('config-1', 'project-1', 'Default', 'openai', 'https://example.invalid', 'model', secret)

    for (const reason of ['manual', 'scheduled', 'pre-migration', 'pre-restore'] as const) {
      const legacyService = new DatabaseBackupService({
        userDataPath: legacyRoot,
        databasePath: getDatabasePath(legacyRoot),
        appVersion: 'test-version',
        getDatabase: () => legacyDatabase,
      })
      await expect(legacyService.createBackup({ reason })).rejects.toMatchObject({
        code: 'BACKUP_NOT_ALLOWED',
      })
    }
    const legacyService = new DatabaseBackupService({
      userDataPath: legacyRoot,
      databasePath: getDatabasePath(legacyRoot),
      appVersion: 'test-version',
      getDatabase: () => legacyDatabase,
    })
    expect(await legacyService.listBackups()).toEqual([])
    expect(JSON.stringify(await legacyService.listBackups())).not.toContain(secret)

    const internal = await legacyService.createInternalMigrationSnapshot()
    expect(await legacyService.listBackups()).toEqual([])
    await expect(legacyService.verifyBackup(internal.id)).resolves.toMatchObject({
      valid: false,
      errorCode: 'BACKUP_NOT_FOUND',
    })
    legacyService.finalizeInternalMigrationSnapshot(internal, 'success')
    legacyDatabase.close()
  })

  test('rejects checksum mismatch and corrupted snapshots', async () => {
    const record = await service.createBackup({ reason: 'manual' })
    const backupPath = path.join(root, 'backups', 'database', record.filename)
    fs.appendFileSync(backupPath, 'tampered')
    await expect(service.verifyBackup(record.id)).resolves.toMatchObject({
      valid: false,
      errorCode: 'BACKUP_CHECKSUM_MISMATCH',
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

  test('supports Unicode paths and keeps only the newest migration snapshot within the cap', async () => {
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

  test('bounds a mixed set of 17 backups while preserving explicit and newest recovery points', async () => {
    const records: BackupRecord[] = []
    for (let index = 0; index < 17; index += 1) {
      const datedService = new DatabaseBackupService({
        userDataPath: root,
        databasePath: getDatabasePath(root),
        appVersion: 'test-version',
        getDatabase: () => database,
        now: () => new Date(Date.UTC(2026, 2, index + 1)),
      })
      const reason = index % 5 === 0
        ? 'pre-migration'
        : index % 4 === 0
          ? 'pre-restore'
          : index % 2 === 0
            ? 'scheduled'
            : 'manual'
      records.push(await datedService.createBackup({ reason }))
    }
    const newestMigration = [...records].reverse()
      .find((record) => record.reason === 'pre-migration')!
    const newestRestore = [...records].reverse()
      .find((record) => record.reason === 'pre-restore')!
    const protectedId = records[0].id

    const result = await new DatabaseBackupService({
      userDataPath: root,
      databasePath: getDatabasePath(root),
      appVersion: 'test-version',
      getDatabase: () => database,
      now: () => new Date('2026-04-01T00:00:00.000Z'),
    }).pruneBackups({ maxBackups: 10, maxAgeDays: 30 }, [protectedId])

    expect(result.failed).toEqual([])
    expect(result.policyExceeded).toBe(false)
    expect(result.retained).toHaveLength(10)
    expect(result.retained).toEqual(expect.arrayContaining([
      protectedId,
      newestMigration.id,
      newestRestore.id,
    ]))
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
      exit: jest.fn(),
    })
    expect(result).toMatchObject({
      outcome: 'restored',
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
      exit: jest.fn(),
    })
    expect(result.outcome).toBe('restored')
    expect(result.preRestoreBackupId).toBeNull()
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(path.join(
      root,
      'backups',
      'database',
      'failed',
    )).some((entry) => entry.startsWith('pre-restore-unusable-'))).toBe(true)

    const restored = new Database(getDatabasePath(root), { readonly: true, fileMustExist: true })
    try {
      expect(restored.prepare('SELECT value FROM recovery_probe').get()).toEqual({
        value: '可恢复内容',
      })
    } finally {
      restored.close()
    }
  })

  test('rolls back and relaunches when replacement fails after the database closes', async () => {
    const target = await service.createBackup({ reason: 'manual' })
    const replaceDatabase = jest.fn()
      .mockImplementationOnce(() => {
        throw new Error('injected target replacement failure')
      })
      .mockImplementationOnce(() => undefined)
    const relaunch = jest.fn()
    const exit = jest.fn()

    const result = await executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      closeDatabase: () => {
        database!.close()
        database = null
      },
      replaceDatabase,
      verifyDatabase: jest.fn(),
      relaunch,
      exit,
    })

    expect(result.outcome).toBe('restore-failed-rolled-back')
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(path.dirname(getDatabasePath(root)))
      .filter((entry) => entry.includes('.restore-'))).toEqual([])
    const reopened = new Database(getDatabasePath(root), { readonly: true, fileMustExist: true })
    expect(reopened.pragma('quick_check')).toEqual([{ quick_check: 'ok' }])
    reopened.close()
  })

  test('rolls back when the target replacement succeeds but final verification fails', async () => {
    const target = await service.createBackup({ reason: 'manual' })
    const verifyDatabase = jest.fn()
      .mockImplementationOnce(() => {
        throw new Error('injected target verification failure')
      })
      .mockImplementationOnce(() => undefined)

    const result = await executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      closeDatabase: () => {
        database!.close()
        database = null
      },
      replaceDatabase: jest.fn(),
      verifyDatabase,
      relaunch: jest.fn(),
      exit: jest.fn(),
    })

    expect(result.outcome).toBe('restore-failed-rolled-back')
    expect(verifyDatabase).toHaveBeenCalledTimes(2)
  })

  test('enters recovery mode and relaunches when restore and rollback both fail', async () => {
    const target = await service.createBackup({ reason: 'manual' })
    const markRecoveryRequired = jest.fn()
    const relaunch = jest.fn()
    const exit = jest.fn()

    const result = await executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      closeDatabase: () => {
        database!.close()
        database = null
      },
      replaceDatabase: jest.fn(() => {
        throw new Error('injected replacement failure')
      }),
      verifyDatabase: jest.fn(),
      markRecoveryRequired,
      relaunch,
      exit,
    })

    expect(result.outcome).toBe('restore-failed-recovery-required')
    expect(markRecoveryRequired).toHaveBeenCalledTimes(1)
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(exit).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(path.join(root, 'backups', 'database', 'failed'))
      .some((entry) => entry.startsWith('restore-failed-target-'))).toBe(true)
  })

  test('does not exit when scheduling the relaunch fails', async () => {
    const target = await service.createBackup({ reason: 'manual' })
    const exit = jest.fn()
    const markRestoring = jest.fn()
    const markRecoveryRequired = jest.fn()
    const closeDatabase = jest.fn(() => {
      database!.close()
      database = null
    })

    await expect(executeDatabaseRestore({
      backupService: service,
      backupId: target.id,
      closeDatabase,
      replaceDatabase: jest.fn(),
      verifyDatabase: jest.fn(),
      markRestoring,
      markRecoveryRequired,
      relaunch: () => {
        throw new Error('injected relaunch failure')
      },
      exit,
    })).rejects.toEqual(expect.objectContaining({
      code: 'RESTORE_FAILED',
      message: expect.not.stringContaining('injected relaunch failure'),
    }))

    expect(markRestoring).toHaveBeenCalledTimes(1)
    expect(markRestoring.mock.invocationCallOrder[0]).toBeLessThan(
      closeDatabase.mock.invocationCallOrder[0]!,
    )
    expect(markRecoveryRequired).toHaveBeenCalledTimes(1)
    expect(exit).not.toHaveBeenCalled()
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
      expect(result.migrationBackup).toBeNull()
      expect(await result.backupService.listBackups()).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ reason: 'pre-migration' })]),
      )
      expect(result.database.prepare('SELECT value FROM original_data').get()).toEqual({
        value: '保留内容',
      })
    } finally {
      result.database.close()
    }
  })

  test('keeps the application gated and ordinary backups blocked when credential migration is pending', async () => {
    const legacy = initializeDatabase(root, { migrations: [first] })
    legacy.close()
    const vacuumDatabase = jest.fn()

    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: () => ({ pending: 1, failed: 0 }),
      vacuumDatabase,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    try {
      expect(result.status).toMatchObject({
        state: 'credential-migration-required',
        backupAllowed: false,
        backupEligibility: 'credential-migration-pending',
        schemaVersion: 7,
      })
      await expect(result.backupService.createBackup({ reason: 'manual' })).rejects.toMatchObject({
        code: 'BACKUP_NOT_ALLOWED',
      })
      expect(await result.backupService.listBackups()).toEqual([])
      expect(vacuumDatabase).not.toHaveBeenCalled()
    } finally {
      result.database.close()
    }
  })

  test('removes legacy credential bytes before creating the first ordinary backup', async () => {
    const secret = 'sk-test-secret-do-not-expose-123456'
    const legacy = initializeDatabase(root, {
      migrations: migrations.filter((migration) => migration.version < 8),
    })
    legacy.prepare(
      "INSERT INTO projects (id, slug, name) VALUES ('project-1', 'project-1', 'Project')",
    ).run()
    legacy.prepare(
      `INSERT INTO llm_configs
        (id, project_id, name, provider, base_url, model, api_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('config-1', 'project-1', 'Default', 'openai', 'https://example.invalid', 'model', secret)
    legacy.close()
    const vacuumDatabase = jest.fn((candidate: SqliteDatabase) => {
      candidate.exec('VACUUM')
    })

    const result = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      migrateCredentials: (candidate) => {
        candidate.prepare('UPDATE llm_configs SET api_key = ? WHERE id = ?').run('', 'config-1')
        return { pending: 0, failed: 0 }
      },
      vacuumDatabase,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    try {
      expect(vacuumDatabase).toHaveBeenCalledTimes(1)
      const backup = (await result.backupService.listBackups())[0]
      expect(backup).toBeDefined()
      const backupPath = path.join(root, 'backups', 'database', backup.filename)
      expect(fs.readFileSync(backupPath).includes(Buffer.from(secret))).toBe(false)
      const snapshot = new Database(backupPath, { readonly: true, fileMustExist: true })
      try {
        const columns = snapshot.pragma('table_info(llm_configs)') as Array<{ name: string }>
        expect(columns.some((column) => column.name === 'api_key')).toBe(false)
      } finally {
        snapshot.close()
      }
      expect(fs.readFileSync(
        path.join(root, 'backups', 'database', `${backup.id}.json`),
        'utf8',
      )).not.toContain(secret)
    } finally {
      result.database.close()
    }
  })

  test('does not vacuum again when migration 8 was already applied', async () => {
    const initial = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: () => ({ pending: 0, failed: 0 }),
    })
    expect(initial.success).toBe(true)
    if (!initial.success) return
    initial.database.close()

    const vacuumDatabase = jest.fn()
    const restarted = await initializeDatabaseLifecycle({
      userDataPath: root,
      appVersion: 'test-version',
      candidateMigrations: [first, seventh, eighth],
      migrateCredentials: () => ({ pending: 0, failed: 0 }),
      vacuumDatabase,
    })

    expect(restarted.success).toBe(true)
    if (!restarted.success) return
    try {
      expect(vacuumDatabase).not.toHaveBeenCalled()
      expect(restarted.status).toMatchObject({
        state: 'ready',
        schemaVersion: 8,
      })
      expect(restarted.migrationBackup).toBeNull()
      expect(await restarted.backupService.listBackups()).toEqual(
        expect.arrayContaining([expect.objectContaining({ reason: 'scheduled' })]),
      )
    } finally {
      restarted.database.close()
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
