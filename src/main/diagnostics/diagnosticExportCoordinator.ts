import { randomBytes } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import { basename } from 'node:path'
import type { BackupRecord, BackupRetentionPolicy, DatabaseStatus } from '../../shared/backup/types'
import {
  DIAGNOSTIC_FILE_EXTENSION,
  type DiagnosticExportResult,
} from '../../shared/diagnostics'
import { diagnosticError } from '../../shared/diagnostics/errors'
import { buildDiagnosticPackage } from './diagnosticService'

export interface DiagnosticExportFileIo {
  open: typeof fsp.open
  rename: typeof fsp.rename
  rm: typeof fsp.rm
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

      const temporaryFile = `${targetFile}.${randomBytes(12).toString('hex')}.tmp`
      let handle: Awaited<ReturnType<typeof fsp.open>> | undefined
      try {
        handle = await this.fileIo.open(temporaryFile, 'wx', 0o600)
        await handle.writeFile(built.json, 'utf8')
        await handle.sync()
        await handle.close()
        handle = undefined
        await this.fileIo.rename(temporaryFile, targetFile)
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
