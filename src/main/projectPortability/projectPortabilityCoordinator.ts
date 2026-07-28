import { constants } from 'node:fs'
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  PROJECT_ARCHIVE_MAX_BYTES,
  PROJECT_IMPORT_TOKEN_TTL_MS,
  portabilityError,
  sha256,
  type ProjectExportResult,
  type ProjectImportPreview,
  type ProjectImportResult,
} from '../../shared/projectPortability'
import type { ProjectArchiveV1 } from '../../shared/projectPortability'
import { ProjectPortabilityService } from './projectPortabilityService'

interface StagedImport {
  file: string
  byteSha256: string
  expiresAt: number
  expired: boolean
  expirationTimer: ReturnType<typeof setTimeout>
}

export class ProjectPortabilityCoordinator {
  private readonly stagingDirectory: string
  private readonly imports = new Map<string, StagedImport>()
  private disposed = false

  public constructor(
    private readonly service: ProjectPortabilityService,
    userDataPath: string,
  ) {
    this.stagingDirectory = join(
      userDataPath,
      'project-import-staging',
      randomBytes(16).toString('hex'),
    )
  }

  public async exportToFile(projectId: string, targetFile: string): Promise<ProjectExportResult> {
    this.assertActive()
    const built = this.service.buildArchive(projectId)
    const temporaryFile = `${targetFile}.${randomBytes(12).toString('hex')}.tmp`
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      await mkdir(dirname(targetFile), { recursive: true })
      handle = await open(temporaryFile, 'wx', 0o600)
      await handle.writeFile(built.json, 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryFile, targetFile)
      return {
        canceled: false,
        fileName: basename(targetFile),
        size: Buffer.byteLength(built.json),
        sha256: built.sha256,
        recordCounts: built.recordCounts,
        warnings: built.archive.manifest.warnings,
      }
    } catch {
      await handle?.close().catch(() => undefined)
      await rm(temporaryFile, { force: true }).catch(() => undefined)
      throw portabilityError('LOCAL_IO_ERROR')
    }
  }

  public async inspectFile(sourceFile: string): Promise<ProjectImportPreview> {
    this.assertActive()
    if (extname(sourceFile).toLowerCase() !== '.json') {
      throw portabilityError('PROJECT_IMPORT_INVALID')
    }
    const sourceStat = await stat(sourceFile).catch(() => {
      throw portabilityError('LOCAL_IO_ERROR')
    })
    if (!sourceStat.isFile()) throw portabilityError('PROJECT_IMPORT_INVALID')
    if (sourceStat.size > PROJECT_ARCHIVE_MAX_BYTES) {
      throw portabilityError('PROJECT_IMPORT_TOO_LARGE')
    }
    if (sourceStat.size === 0) throw portabilityError('PROJECT_IMPORT_INVALID')

    await mkdir(this.stagingDirectory, { recursive: true })
    const token = randomBytes(32).toString('base64url')
    const stagedFile = join(this.stagingDirectory, `${randomBytes(24).toString('hex')}.json`)
    try {
      await copyFile(sourceFile, stagedFile, constants.COPYFILE_EXCL)
      const bytes = await this.readLimited(stagedFile)
      const archive = await this.service.inspectArchiveJson(bytes.toString('utf8'))
      const expiresAt = Date.now() + PROJECT_IMPORT_TOKEN_TTL_MS
      const expirationTimer = setTimeout(() => {
        const active = this.imports.get(token)
        if (!active) return
        active.expired = true
        void rm(active.file, { force: true }).catch(() => undefined)
      }, PROJECT_IMPORT_TOKEN_TTL_MS)
      expirationTimer.unref()
      const staged: StagedImport = {
        file: stagedFile,
        byteSha256: sha256(bytes),
        expiresAt,
        expired: false,
        expirationTimer,
      }
      this.imports.set(token, staged)
      return this.preview(token, expiresAt, archive)
    } catch (error: unknown) {
      await rm(stagedFile, { force: true }).catch(() => undefined)
      throw error
    }
  }

  public async commitImport(token: string): Promise<ProjectImportResult> {
    this.assertActive()
    const staged = this.imports.get(token)
    if (!staged) throw portabilityError('PROJECT_IMPORT_ALREADY_USED')
    this.imports.delete(token)
    clearTimeout(staged.expirationTimer)
    try {
      if (staged.expired || Date.now() >= staged.expiresAt) {
        throw portabilityError('PROJECT_IMPORT_EXPIRED')
      }
      const bytes = await this.readLimited(staged.file)
      if (sha256(bytes) !== staged.byteSha256) {
        throw portabilityError('PROJECT_IMPORT_CHECKSUM_MISMATCH')
      }
      const archive = await this.service.inspectArchiveJson(bytes.toString('utf8'))
      return this.service.importArchive(archive)
    } finally {
      await rm(staged.file, { force: true }).catch(() => undefined)
    }
  }

  public async cancelImport(token: string): Promise<{ canceled: true }> {
    const staged = this.imports.get(token)
    this.imports.delete(token)
    if (staged) {
      clearTimeout(staged.expirationTimer)
      await rm(staged.file, { force: true }).catch(() => undefined)
    }
    return { canceled: true }
  }

  public async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    for (const staged of this.imports.values()) clearTimeout(staged.expirationTimer)
    this.imports.clear()
    try {
      rmSync(this.stagingDirectory, { recursive: true, force: true })
    } catch {
      // The staging directory is process-owned and contains no committed user data.
    }
  }

  private async readLimited(file: string): Promise<Buffer> {
    const fileStat = await stat(file).catch(() => {
      throw portabilityError('LOCAL_IO_ERROR')
    })
    if (fileStat.size > PROJECT_ARCHIVE_MAX_BYTES) {
      throw portabilityError('PROJECT_IMPORT_TOO_LARGE')
    }
    return readFile(file)
  }

  private preview(
    token: string,
    expiresAt: number,
    archive: ProjectArchiveV1,
  ): ProjectImportPreview {
    const recordCounts = Object.fromEntries(
      Object.entries(archive.payload).map(([name, records]) => [name, records.length]),
    ) as ProjectImportPreview['recordCounts']
    return {
      importToken: token,
      projectName: archive.manifest.projectName,
      formatVersion: archive.manifest.formatVersion,
      exportedAt: archive.manifest.exportedAt,
      appVersion: archive.manifest.appVersion,
      schemaVersion: archive.manifest.databaseSchemaVersion,
      recordCounts,
      warnings: archive.manifest.warnings,
      credentialsExcluded: true,
      runtimeHistoryExcluded: true,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  }

  private assertActive(): void {
    if (this.disposed) throw portabilityError('LOCAL_IO_ERROR')
  }
}
