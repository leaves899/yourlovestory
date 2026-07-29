import { randomBytes } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { BackupRecord, BackupRetentionPolicy, DatabaseStatus } from '../../shared/backup/types'
import {
  DIAGNOSTIC_FILE_EXTENSION,
  type DiagnosticExportResult,
} from '../../shared/diagnostics'
import { diagnosticError } from '../../shared/diagnostics/errors'
import { buildDiagnosticPackage } from '../../shared/diagnostics/buildDiagnosticPackage'

export interface DiagnosticExportFileIo {
  open: typeof fsp.open
  rename: typeof fsp.rename
  rm: typeof fsp.rm
  access: typeof fsp.access
}

export interface DiagnosticExportCoordinatorOptions {
  appVersion: string
  platform: string
  arch: string
  electronVersion: string | null
  nodeVersion: string
  getDatabaseStatus: () => DatabaseStatus
  getBackupPolicy: () => BackupRetentionPolicy
  listBackups: () => Promise<readonly BackupRecord[]>
  now?: () => Date
  fileIo?: DiagnosticExportFileIo
}

const defaultFileIo: DiagnosticExportFileIo = {
  open: (...args) => fsp.open(...args),
  rename: (...args) => fsp.rename(...args),
  rm: (...args) => fsp.rm(...args),
  access: (...args) => fsp.access(...args),
}

function randomTempName(prefix: string): string {
  return `${prefix}.${randomBytes(12).toString('hex')}.tmp`
}

async function pathExists(io: DiagnosticExportFileIo, target: string): Promise<boolean> {
  try {
    await io.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * Cross-platform replace: displace existing target, install new file, restore
 * previous bytes if install fails. Never truncate or delete-then-write the only
 * valid target. Windows cannot rename-over an existing file.
 */
async function replaceFileSafely(
  io: DiagnosticExportFileIo,
  temporaryFile: string,
  targetFile: string,
): Promise<void> {
  const directory = dirname(targetFile)
  const displacedPath = join(directory, randomTempName('diagnostics.displaced'))
  let targetDisplaced = false
  let installed = false

  try {
    if (await pathExists(io, targetFile)) {
      await io.rename(targetFile, displacedPath)
      targetDisplaced = true
    }
    await io.rename(temporaryFile, targetFile)
    installed = true
    if (targetDisplaced) {
      await io.rm(displacedPath, { force: true }).catch(() => undefined)
    }
  } catch (error: unknown) {
    if (targetDisplaced && await pathExists(io, displacedPath)) {
      if (installed && await pathExists(io, targetFile)) {
        const failedInstallPath = join(
          directory,
          randomTempName('diagnostics.failed-install'),
        )
        await io.rename(targetFile, failedInstallPath).catch(async () => {
          await io.rm(targetFile, { force: true }).catch(() => undefined)
        })
        await io.rm(failedInstallPath, { force: true }).catch(() => undefined)
      }
      if (!(await pathExists(io, targetFile))) {
        try {
          await io.rename(displacedPath, targetFile)
        } catch {
          // Keep displaced when restore also fails so prior bytes are not lost.
        }
      }
    }
    await io.rm(temporaryFile, { force: true }).catch(() => undefined)
    // Never delete displaced if it is still the only copy of the previous file.
    throw error
  }
}

export class DiagnosticExportCoordinator {
  private exportChain: Promise<unknown> = Promise.resolve()
  private readonly fileIo: DiagnosticExportFileIo

  public constructor(private readonly options: DiagnosticExportCoordinatorOptions) {
    this.fileIo = options.fileIo ?? defaultFileIo
  }

  /**
   * Write a sanitized diagnostic package to an absolute path chosen by the
   * native save dialog in the main process. Renderer never supplies paths.
   */
  public async exportToFile(targetFile: string): Promise<DiagnosticExportResult> {
    const run = async (): Promise<DiagnosticExportResult> => {
      const backups = await this.options.listBackups().catch(() => [] as BackupRecord[])
      const built = buildDiagnosticPackage({
        appVersion: this.options.appVersion,
        platform: this.options.platform,
        arch: this.options.arch,
        electronVersion: this.options.electronVersion,
        nodeVersion: this.options.nodeVersion,
        generatedAt: (this.options.now ?? (() => new Date()))().toISOString(),
        databaseStatus: this.options.getDatabaseStatus(),
        backupPolicy: this.options.getBackupPolicy(),
        backups,
      })

      const temporaryFile = join(
        dirname(targetFile),
        randomTempName(`${basename(targetFile)}.part`),
      )
      let handle: Awaited<ReturnType<typeof fsp.open>> | undefined
      try {
        handle = await this.fileIo.open(temporaryFile, 'wx', 0o600)
        await handle.writeFile(built.json, 'utf8')
        await handle.sync()
        await handle.close()
        handle = undefined
        await replaceFileSafely(this.fileIo, temporaryFile, targetFile)
        return {
          canceled: false,
          fileName: basename(targetFile),
          size: built.size,
          sha256: built.sha256,
        }
      } catch {
        await handle?.close().catch(() => undefined)
        await this.fileIo.rm(temporaryFile, { force: true }).catch(() => undefined)
        throw diagnosticError('LOCAL_IO_ERROR')
      }
    }

    const result = this.exportChain.then(run, run)
    this.exportChain = result.then(() => undefined, () => undefined)
    return result
  }

  public defaultFileName(): string {
    const stamp = (this.options.now ?? (() => new Date()))()
      .toISOString()
      .replace(/[:.]/g, '-')
    return `yourcrush-diagnostics-${stamp}${DIAGNOSTIC_FILE_EXTENSION}`
  }
}
