import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  BACKUP_POLICY_BOUNDS,
  BACKUP_POLICY_FILE_VERSION,
  DEFAULT_BACKUP_RETENTION_POLICY,
  type BackupPolicyFileV1,
  type BackupPolicyLoadResult,
  type BackupRetentionPolicy,
} from '../../shared/backup/types'
import { backupError } from './errors'

const POLICY_RELATIVE_PATH = path.join('backups', 'backup-policy.json')

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertBoundedInteger(
  value: unknown,
  field: 'maxBackups' | 'maxAgeDays',
): number {
  const bounds = BACKUP_POLICY_BOUNDS[field]
  if (typeof value !== 'number') throw backupError('BACKUP_POLICY_INVALID')
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw backupError('BACKUP_POLICY_INVALID')
  }
  if (value < bounds.min || value > bounds.max) {
    throw backupError('BACKUP_POLICY_INVALID')
  }
  return value
}

/**
 * Strict validation for renderer / IPC update payloads.
 * Only `maxBackups` and `maxAgeDays` are accepted.
 */
export function parseBackupPolicyUpdateInput(value: unknown): BackupRetentionPolicy {
  if (!isPlainObject(value)) throw backupError('BACKUP_POLICY_INVALID')
  const keys = Object.keys(value)
  if (keys.length !== 2 || !('maxBackups' in value) || !('maxAgeDays' in value)) {
    throw backupError('BACKUP_POLICY_INVALID')
  }
  return {
    maxBackups: assertBoundedInteger(value.maxBackups, 'maxBackups'),
    maxAgeDays: assertBoundedInteger(value.maxAgeDays, 'maxAgeDays'),
  }
}

/**
 * Strict validation for on-disk policy files (versioned).
 */
export function parseBackupPolicyFile(value: unknown): BackupRetentionPolicy {
  if (!isPlainObject(value)) throw backupError('BACKUP_POLICY_INVALID')
  const keys = Object.keys(value)
  if (
    keys.length !== 3
    || !('version' in value)
    || !('maxBackups' in value)
    || !('maxAgeDays' in value)
  ) {
    throw backupError('BACKUP_POLICY_INVALID')
  }
  if (value.version !== BACKUP_POLICY_FILE_VERSION) {
    throw backupError('BACKUP_POLICY_INVALID')
  }
  return {
    maxBackups: assertBoundedInteger(value.maxBackups, 'maxBackups'),
    maxAgeDays: assertBoundedInteger(value.maxAgeDays, 'maxAgeDays'),
  }
}

function toPolicyFile(policy: BackupRetentionPolicy): BackupPolicyFileV1 {
  return {
    version: BACKUP_POLICY_FILE_VERSION,
    maxBackups: policy.maxBackups,
    maxAgeDays: policy.maxAgeDays,
  }
}

function randomTempName(prefix: string): string {
  return `${prefix}.${randomBytes(12).toString('hex')}.tmp`
}

export interface BackupPolicyStoreIo {
  existsSync: (target: string) => boolean
  mkdirSync: (target: string, options?: fs.MakeDirectoryOptions) => void
  readFileSync: (target: string, encoding: BufferEncoding) => string
  writeFileSync: (
    target: string,
    data: string,
    options: fs.WriteFileOptions,
  ) => void
  renameSync: (from: string, to: string) => void
  rmSync: (target: string, options?: fs.RmOptions) => void
}

const defaultIo: BackupPolicyStoreIo = {
  existsSync: (target) => fs.existsSync(target),
  mkdirSync: (target, options) => {
    fs.mkdirSync(target, options)
  },
  readFileSync: (target, encoding) => fs.readFileSync(target, encoding),
  writeFileSync: (target, data, options) => {
    fs.writeFileSync(target, data, options)
  },
  renameSync: (from, to) => {
    fs.renameSync(from, to)
  },
  rmSync: (target, options) => {
    fs.rmSync(target, options)
  },
}

/**
 * Cross-platform replace: never rely on rename overwriting an existing file
 * (Windows cannot). Displace the previous target first; restore it if the new
 * install rename fails. Never truncate or delete the only valid target first.
 */
function replaceFileSafely(
  io: BackupPolicyStoreIo,
  temporaryPath: string,
  targetPath: string,
): void {
  const directory = path.dirname(targetPath)
  const displacedPath = path.join(directory, randomTempName('backup-policy.displaced'))
  let targetDisplaced = false
  let installed = false

  try {
    if (io.existsSync(targetPath)) {
      io.renameSync(targetPath, displacedPath)
      targetDisplaced = true
    }
    io.renameSync(temporaryPath, targetPath)
    installed = true
    if (targetDisplaced) {
      try {
        io.rmSync(displacedPath, { force: true })
      } catch {
        // Best-effort cleanup of the previous policy file.
      }
    }
  } catch (error: unknown) {
    if (targetDisplaced && io.existsSync(displacedPath)) {
      if (installed) {
        try {
          const failedInstallPath = path.join(
            directory,
            randomTempName('backup-policy.failed-install'),
          )
          if (io.existsSync(targetPath)) {
            io.renameSync(targetPath, failedInstallPath)
            try {
              io.rmSync(failedInstallPath, { force: true })
            } catch {
              // Best-effort.
            }
          }
        } catch {
          try {
            io.rmSync(targetPath, { force: true })
          } catch {
            // Best-effort before restore.
          }
        }
      }
      if (!io.existsSync(targetPath)) {
        try {
          io.renameSync(displacedPath, targetPath)
        } catch {
          // Keep displaced file when restore also fails so the last valid
          // policy is not discarded.
        }
      }
    }
    try {
      io.rmSync(temporaryPath, { force: true })
    } catch {
      // Best-effort temp cleanup.
    }
    // Never delete displaced if it is still the only copy of the previous policy.
    throw error
  }
}

export class BackupPolicyStore {
  private readonly policyPath: string
  private readonly io: BackupPolicyStoreIo
  private writeChain: Promise<unknown> = Promise.resolve()

  public constructor(userDataPath: string, io: BackupPolicyStoreIo = defaultIo) {
    this.policyPath = path.join(userDataPath, POLICY_RELATIVE_PATH)
    this.io = io
  }

  public getPolicyPath(): string {
    return this.policyPath
  }

  public load(): BackupPolicyLoadResult {
    if (!this.io.existsSync(this.policyPath)) {
      return {
        policy: { ...DEFAULT_BACKUP_RETENTION_POLICY },
        source: 'default',
        fallbackReason: 'missing',
      }
    }
    try {
      const raw = this.io.readFileSync(this.policyPath, 'utf8')
      const parsed: unknown = JSON.parse(raw)
      return {
        policy: parseBackupPolicyFile(parsed),
        source: 'file',
      }
    } catch (error: unknown) {
      const fallbackReason = error instanceof SyntaxError || (
        error instanceof Error && error.name === 'BackupOperationError'
      )
        ? 'invalid'
        : 'io-error'
      return {
        policy: { ...DEFAULT_BACKUP_RETENTION_POLICY },
        source: 'default',
        fallbackReason,
      }
    }
  }

  public async save(policy: BackupRetentionPolicy): Promise<BackupRetentionPolicy> {
    const validated = parseBackupPolicyUpdateInput(policy)
    const run = async (): Promise<BackupRetentionPolicy> => {
      const directory = path.dirname(this.policyPath)
      this.io.mkdirSync(directory, { recursive: true })
      const temporaryPath = path.join(directory, randomTempName('backup-policy'))
      const payload = `${JSON.stringify(toPolicyFile(validated), null, 2)}\n`
      try {
        this.io.writeFileSync(temporaryPath, payload, {
          encoding: 'utf8',
          flag: 'wx',
          mode: 0o600,
        })
        replaceFileSafely(this.io, temporaryPath, this.policyPath)
        return validated
      } catch {
        try {
          this.io.rmSync(temporaryPath, { force: true })
        } catch {
          // Best-effort temp cleanup; keep previous valid policy.
        }
        throw backupError('BACKUP_POLICY_IO_ERROR')
      }
    }

    const result = this.writeChain.then(run, run)
    this.writeChain = result.then(() => undefined, () => undefined)
    return result
  }
}
