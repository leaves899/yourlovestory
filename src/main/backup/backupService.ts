import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'
import type { SqliteDatabase } from '../database'
import {
  DEFAULT_BACKUP_RETENTION_POLICY,
  type BackupRecord,
  type BackupRetentionPolicy,
  type BackupService,
  type BackupVerificationResult,
  type CreateBackupOptions,
  type PruneResult,
  type RestorePreparationResult,
} from './types'

const BACKUP_DIRECTORY = path.join('backups', 'database')
const METADATA_SUFFIX = '.json'
const DATABASE_SUFFIX = '.sqlite'
const TEMP_SUFFIX = '.tmp'
const SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000
const BACKUP_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

function metadataFilename(id: string): string {
  return `${id}${METADATA_SUFFIX}`
}

function databaseFilename(id: string): string {
  return `${id}${DATABASE_SUFFIX}`
}

function assertBackupId(id: string): void {
  if (!BACKUP_ID_PATTERN.test(id)) throw new Error('Invalid backup id')
}

function isBackupRecord(value: unknown): value is BackupRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<BackupRecord>
  return (
    typeof record.id === 'string'
    && BACKUP_ID_PATTERN.test(record.id)
    && record.filename === databaseFilename(record.id)
    && typeof record.createdAt === 'string'
    && !Number.isNaN(Date.parse(record.createdAt))
    && (
      record.reason === 'scheduled'
      || record.reason === 'manual'
      || record.reason === 'pre-migration'
      || record.reason === 'pre-restore'
    )
    && typeof record.appVersion === 'string'
    && typeof record.schemaVersion === 'number'
    && Number.isInteger(record.schemaVersion)
    && typeof record.size === 'number'
    && Number.isFinite(record.size)
    && typeof record.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(record.sha256)
  )
}

async function sha256(filename: string): Promise<string> {
  const hash = createHash('sha256')
  const stream = fs.createReadStream(filename)
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

function inspectSnapshot(filename: string): number {
  const database = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const result = database.pragma('quick_check') as Array<{ quick_check: string }>
    if (result.length !== 1 || result[0]?.quick_check !== 'ok') {
      throw new Error('Backup database integrity check failed')
    }
    const table = database
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      )
      .get() as { count: number } | undefined
    if (!table?.count) return 0
    const version = database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null } | undefined
    return version?.version ?? 0
  } finally {
    database.close()
  }
}

export interface DatabaseBackupServiceOptions {
  userDataPath: string
  databasePath: string
  appVersion: string
  getDatabase: () => SqliteDatabase | null
  now?: () => Date
}

export class DatabaseBackupService implements BackupService {
  private readonly backupDirectory: string
  private readonly now: () => Date

  public constructor(private readonly options: DatabaseBackupServiceOptions) {
    this.backupDirectory = path.join(options.userDataPath, BACKUP_DIRECTORY)
    this.now = options.now ?? (() => new Date())
  }

  public async createBackup(options: CreateBackupOptions): Promise<BackupRecord> {
    const database = this.options.getDatabase()
    if (!database) throw new Error('Database is not available for backup')
    fs.mkdirSync(this.backupDirectory, { recursive: true })

    const createdAt = this.now().toISOString()
    const id = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}`
    const finalFilename = databaseFilename(id)
    const finalPath = path.join(this.backupDirectory, finalFilename)
    const temporaryPath = `${finalPath}${TEMP_SUFFIX}`
    const metadataPath = path.join(this.backupDirectory, metadataFilename(id))
    const temporaryMetadataPath = `${metadataPath}${TEMP_SUFFIX}`

    try {
      await database.backup(temporaryPath)
      const schemaVersion = inspectSnapshot(temporaryPath)
      const fileHash = await sha256(temporaryPath)
      const stat = fs.statSync(temporaryPath)
      const record: BackupRecord = {
        id,
        filename: finalFilename,
        createdAt,
        reason: options.reason,
        appVersion: this.options.appVersion,
        schemaVersion,
        size: stat.size,
        sha256: fileHash,
      }
      fs.renameSync(temporaryPath, finalPath)
      fs.writeFileSync(temporaryMetadataPath, JSON.stringify(record, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      })
      fs.renameSync(temporaryMetadataPath, metadataPath)
      return record
    } catch (error: unknown) {
      fs.rmSync(temporaryPath, { force: true })
      fs.rmSync(temporaryMetadataPath, { force: true })
      fs.rmSync(finalPath, { force: true })
      fs.rmSync(metadataPath, { force: true })
      throw new Error(sanitizeErrorMessage(error, 'Database backup failed'))
    }
  }

  public async listBackups(): Promise<BackupRecord[]> {
    if (!fs.existsSync(this.backupDirectory)) return []
    const records: BackupRecord[] = []
    for (const entry of fs.readdirSync(this.backupDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(METADATA_SUFFIX)) continue
      if (entry.name.endsWith(`${METADATA_SUFFIX}${TEMP_SUFFIX}`)) continue
      try {
        const value: unknown = JSON.parse(
          fs.readFileSync(path.join(this.backupDirectory, entry.name), 'utf8'),
        )
        if (!isBackupRecord(value)) continue
        if (!fs.existsSync(path.join(this.backupDirectory, value.filename))) continue
        records.push(value)
      } catch {
        // Invalid metadata is ignored instead of exposing local file details.
      }
    }
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  public async verifyBackup(id: string): Promise<BackupVerificationResult> {
    const checkedAt = this.now().toISOString()
    try {
      const record = await this.readRecord(id)
      const filename = this.resolveDatabasePath(record)
      if ((await sha256(filename)) !== record.sha256) {
        throw new Error('Backup checksum does not match')
      }
      const schemaVersion = inspectSnapshot(filename)
      if (schemaVersion !== record.schemaVersion) {
        throw new Error('Backup schema version does not match')
      }
      return { id, valid: true, checkedAt }
    } catch (error: unknown) {
      return {
        id,
        valid: false,
        checkedAt,
        error: sanitizeErrorMessage(error, 'Backup verification failed'),
      }
    }
  }

  public async restoreBackup(id: string): Promise<RestorePreparationResult> {
    assertBackupId(id)
    const verification = await this.verifyBackup(id)
    return { id, ready: verification.valid, verification }
  }

  public async stageRestore(id: string): Promise<string> {
    const prepared = await this.restoreBackup(id)
    if (!prepared.ready) throw new Error(prepared.verification.error ?? 'Backup verification failed')
    const record = await this.readRecord(id)
    const source = this.resolveDatabasePath(record)
    const staged = `${this.options.databasePath}.restore-${randomUUID()}${TEMP_SUFFIX}`
    fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL)
    try {
      inspectSnapshot(staged)
      if ((await sha256(staged)) !== record.sha256) throw new Error('Staged restore checksum does not match')
      return staged
    } catch (error: unknown) {
      fs.rmSync(staged, { force: true })
      throw error
    }
  }

  public async createScheduledBackupIfDue(): Promise<BackupRecord | null> {
    const latest = (await this.listBackups())
      .find((record) => record.reason === 'scheduled')
    if (latest && this.now().getTime() - Date.parse(latest.createdAt) < SCHEDULE_INTERVAL_MS) {
      return null
    }
    const backup = await this.createBackup({ reason: 'scheduled' })
    await this.pruneBackups(DEFAULT_BACKUP_RETENTION_POLICY)
    return backup
  }

  public async pruneBackups(
    policy: BackupRetentionPolicy,
    protectedBackupIds: readonly string[] = [],
  ): Promise<PruneResult> {
    if (!Number.isInteger(policy.maxBackups) || policy.maxBackups < 1) {
      throw new Error('maxBackups must be a positive integer')
    }
    if (!Number.isInteger(policy.maxAgeDays) || policy.maxAgeDays < 1) {
      throw new Error('maxAgeDays must be a positive integer')
    }

    const protectedIds = new Set(protectedBackupIds)
    const records = await this.listBackups()
    const ordinary = records.filter(
      (record) => record.reason !== 'pre-migration' && !protectedIds.has(record.id),
    )
    const cutoff = this.now().getTime() - policy.maxAgeDays * 24 * 60 * 60 * 1000
    const expired = ordinary.filter((record) => Date.parse(record.createdAt) < cutoff)
    const remainingOrdinary = ordinary.filter((record) => !expired.includes(record))
    const retainedProtected = records.length - ordinary.length
    const allowedOrdinary = Math.max(0, policy.maxBackups - retainedProtected)
    const overLimit = remainingOrdinary.slice(allowedOrdinary)
    const targets = [...new Map([...expired, ...overLimit].map((record) => [record.id, record])).values()]
    const result: PruneResult = { deleted: [], failed: [] }

    for (const record of targets) {
      try {
        fs.rmSync(this.resolveDatabasePath(record), { force: true })
        fs.rmSync(path.join(this.backupDirectory, metadataFilename(record.id)), { force: true })
        result.deleted.push(record.id)
      } catch (error: unknown) {
        result.failed.push({
          id: record.id,
          error: sanitizeErrorMessage(error, 'Backup deletion failed'),
        })
      }
    }
    return result
  }

  public getDatabasePath(): string {
    return this.options.databasePath
  }

  public preserveCurrentDatabase(label: 'pre-restore-unusable'): string {
    if (!fs.existsSync(this.options.databasePath)) {
      throw new Error('Current database is unavailable')
    }
    const directory = path.join(this.backupDirectory, 'failed')
    fs.mkdirSync(directory, { recursive: true })
    const id = `${label}-${this.now().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
    const destination = path.join(directory, `${id}${DATABASE_SUFFIX}`)
    fs.copyFileSync(this.options.databasePath, destination, fs.constants.COPYFILE_EXCL)
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${this.options.databasePath}${suffix}`
      if (fs.existsSync(sidecar)) fs.copyFileSync(sidecar, `${destination}${suffix}`)
    }
    return id
  }

  private async readRecord(id: string): Promise<BackupRecord> {
    assertBackupId(id)
    const metadataPath = path.join(this.backupDirectory, metadataFilename(id))
    let value: unknown
    try {
      value = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
    } catch {
      throw new Error('Backup metadata is unavailable')
    }
    if (!isBackupRecord(value) || value.id !== id) throw new Error('Backup metadata is invalid')
    return value
  }

  private resolveDatabasePath(record: BackupRecord): string {
    return path.join(this.backupDirectory, databaseFilename(record.id))
  }
}
