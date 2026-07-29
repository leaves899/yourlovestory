import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SqliteDatabase } from '../database'
import { inspectPlaintextCredentialState } from './credentialSafety'
import { BackupOperationError, backupError, toBackupError } from './errors'
import {
  DEFAULT_BACKUP_RETENTION_POLICY,
  type BackupRecord,
  type BackupRetentionPolicy,
  type BackupService,
  type BackupVerificationResult,
  type CreateBackupOptions,
  type PruneResult,
  type RestorePreparationResult,
  type InternalMigrationSnapshot,
} from './types'

const BACKUP_DIRECTORY = path.join('backups', 'database')
const INTERNAL_MIGRATION_DIRECTORY = 'internal-migration'
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
  if (!BACKUP_ID_PATTERN.test(id)) throw backupError('BACKUP_INVALID')
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
    fs.rmSync(`${filename}-wal`, { force: true })
    fs.rmSync(`${filename}-shm`, { force: true })
  }
}

export interface DatabaseBackupServiceOptions {
  userDataPath: string
  databasePath: string
  appVersion: string
  getDatabase: () => SqliteDatabase | null
  now?: () => Date
  /** Injectable for tests that simulate partial delete failures. */
  removeFile?: (target: string) => void
}

export class DatabaseBackupService implements BackupService {
  private readonly backupDirectory: string
  private readonly now: () => Date
  private readonly removeFile: (target: string) => void

  public constructor(private readonly options: DatabaseBackupServiceOptions) {
    this.backupDirectory = path.join(options.userDataPath, BACKUP_DIRECTORY)
    this.now = options.now ?? (() => new Date())
    this.removeFile = options.removeFile
      ?? ((target: string) => {
        fs.rmSync(target, { force: true })
      })
  }

  public async createBackup(options: CreateBackupOptions): Promise<BackupRecord> {
    const database = this.options.getDatabase()
    if (!database) throw backupError('DATABASE_UNAVAILABLE')
    if (!inspectPlaintextCredentialState(database).safeForUserBackup) {
      throw backupError('BACKUP_NOT_ALLOWED')
    }
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
      if (error instanceof BackupOperationError) throw error
      throw backupError('LOCAL_IO_ERROR')
    }
  }

  public async createInternalMigrationSnapshot(): Promise<InternalMigrationSnapshot> {
    const database = this.options.getDatabase()
    if (!database) throw backupError('DATABASE_UNAVAILABLE')
    const directory = path.join(this.backupDirectory, INTERNAL_MIGRATION_DIRECTORY)
    fs.mkdirSync(directory, { recursive: true })
    const createdAt = this.now().toISOString()
    const id = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}`
    const finalPath = path.join(directory, databaseFilename(id))
    const metadataPath = path.join(directory, metadataFilename(id))
    const temporaryPath = `${finalPath}${TEMP_SUFFIX}`
    try {
      await database.backup(temporaryPath)
      inspectSnapshot(temporaryPath)
      const fileHash = await sha256(temporaryPath)
      fs.renameSync(temporaryPath, finalPath)
      fs.writeFileSync(metadataPath, JSON.stringify({
        id,
        createdAt,
        sha256: fileHash,
        containsLegacySensitiveSchema: true,
        purpose: 'single-migration-rollback',
      }, null, 2), { encoding: 'utf8', flag: 'wx' })
      return { id, createdAt, sha256: fileHash }
    } catch {
      fs.rmSync(temporaryPath, { force: true })
      fs.rmSync(finalPath, { force: true })
      fs.rmSync(metadataPath, { force: true })
      throw backupError('LOCAL_IO_ERROR')
    }
  }

  public async stageInternalMigrationRestore(
    snapshot: InternalMigrationSnapshot,
  ): Promise<string> {
    assertBackupId(snapshot.id)
    const source = path.join(
      this.backupDirectory,
      INTERNAL_MIGRATION_DIRECTORY,
      databaseFilename(snapshot.id),
    )
    if (!fs.existsSync(source)) throw backupError('BACKUP_NOT_FOUND')
    if ((await sha256(source)) !== snapshot.sha256) {
      throw backupError('BACKUP_CHECKSUM_MISMATCH')
    }
    inspectSnapshot(source)
    const staged = `${this.options.databasePath}.restore-${randomUUID()}${TEMP_SUFFIX}`
    fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL)
    return staged
  }

  public finalizeInternalMigrationSnapshot(
    snapshot: InternalMigrationSnapshot,
    outcome: 'success' | 'failed',
  ): void {
    const directory = path.join(this.backupDirectory, INTERNAL_MIGRATION_DIRECTORY)
    const source = path.join(directory, databaseFilename(snapshot.id))
    const metadata = path.join(directory, metadataFilename(snapshot.id))
    if (!fs.existsSync(source)) return
    if (outcome === 'success') {
      fs.rmSync(source, { force: true })
      fs.rmSync(metadata, { force: true })
      return
    }
    const failedDirectory = path.join(directory, 'failed')
    fs.mkdirSync(failedDirectory, { recursive: true })
    fs.renameSync(source, path.join(failedDirectory, databaseFilename(snapshot.id)))
    if (fs.existsSync(metadata)) {
      fs.renameSync(metadata, path.join(failedDirectory, metadataFilename(snapshot.id)))
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
        throw backupError('BACKUP_CHECKSUM_MISMATCH')
      }
      const schemaVersion = inspectSnapshot(filename)
      if (schemaVersion !== record.schemaVersion) {
        throw backupError('BACKUP_INVALID')
      }
      return { id, valid: true, checkedAt }
    } catch (error: unknown) {
      const safeError = toBackupError(error, 'BACKUP_INVALID')
      return {
        id,
        valid: false,
        checkedAt,
        error: safeError.message,
        errorCode: safeError.code,
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
    if (!prepared.ready) {
      throw backupError(prepared.verification.errorCode ?? 'BACKUP_INVALID')
    }
    const record = await this.readRecord(id)
    const source = this.resolveDatabasePath(record)
    const staged = `${this.options.databasePath}.restore-${randomUUID()}${TEMP_SUFFIX}`
    fs.copyFileSync(source, staged, fs.constants.COPYFILE_EXCL)
    try {
      inspectSnapshot(staged)
      if ((await sha256(staged)) !== record.sha256) {
        throw backupError('BACKUP_CHECKSUM_MISMATCH')
      }
      return staged
    } catch (error: unknown) {
      fs.rmSync(staged, { force: true })
      throw error
    }
  }

  public async createScheduledBackupIfDue(
    policy: BackupRetentionPolicy = DEFAULT_BACKUP_RETENTION_POLICY,
  ): Promise<BackupRecord | null> {
    const latest = (await this.listBackups())
      .find((record) => record.reason === 'scheduled')
    if (latest && this.now().getTime() - Date.parse(latest.createdAt) < SCHEDULE_INTERVAL_MS) {
      return null
    }
    const backup = await this.createBackup({ reason: 'scheduled' })
    await this.pruneBackups(policy)
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
    const cutoff = this.now().getTime() - policy.maxAgeDays * 24 * 60 * 60 * 1000
    const retain = new Set<string>(
      records.filter((record) => protectedIds.has(record.id)).map((record) => record.id),
    )
    for (const reason of ['pre-migration', 'pre-restore'] as const) {
      if (retain.size >= policy.maxBackups) break
      const latest = records.find((record) => record.reason === reason)
      if (latest) retain.add(latest.id)
    }
    const priority: Record<BackupRecord['reason'], number> = {
      manual: 0,
      scheduled: 1,
      'pre-migration': 2,
      'pre-restore': 2,
    }
    const eligible = records
      .filter((record) => {
        if (retain.has(record.id)) return false
        if (
          (record.reason === 'manual' || record.reason === 'scheduled')
          && Date.parse(record.createdAt) < cutoff
        ) return false
        return true
      })
      .sort((left, right) => (
        priority[left.reason] - priority[right.reason]
        || right.createdAt.localeCompare(left.createdAt)
      ))
    for (const record of eligible) {
      if (retain.size >= policy.maxBackups) break
      retain.add(record.id)
    }
    const targets = records.filter((record) => !retain.has(record.id))
    const result: PruneResult = {
      deleted: [],
      failed: [],
      retained: [],
      policyExceeded: false,
    }

    for (const record of targets) {
      try {
        this.removeFile(this.resolveDatabasePath(record))
        this.removeFile(path.join(this.backupDirectory, metadataFilename(record.id)))
        result.deleted.push(record.id)
      } catch (error: unknown) {
        result.failed.push({
          id: record.id,
          error: toBackupError(error, 'LOCAL_IO_ERROR').message,
        })
      }
    }
    result.retained = (await this.listBackups()).map((record) => record.id)
    result.policyExceeded = result.retained.length > policy.maxBackups
    return result
  }

  public getDatabasePath(): string {
    return this.options.databasePath
  }

  public preserveCurrentDatabase(
    label: 'pre-restore-unusable' | 'restore-failed-target',
  ): string {
    if (!fs.existsSync(this.options.databasePath)) {
      throw backupError('DATABASE_UNAVAILABLE')
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
      throw backupError('BACKUP_NOT_FOUND')
    }
    if (!isBackupRecord(value) || value.id !== id) throw backupError('BACKUP_INVALID')
    return value
  }

  private resolveDatabasePath(record: BackupRecord): string {
    return path.join(this.backupDirectory, databaseFilename(record.id))
  }
}
