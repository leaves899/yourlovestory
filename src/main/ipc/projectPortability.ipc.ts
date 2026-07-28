import { dialog } from 'electron'
import {
  PROJECT_ARCHIVE_EXTENSION,
  toProjectPortabilityError,
} from '../../shared/projectPortability'
import type { ProjectPortabilityCoordinator } from '../projectPortability'
import {
  assertTrustedIpcSender,
  isRecord,
  readString,
  type IpcRegistry,
} from './shared'

function parseProjectId(value: unknown): { projectId: string } {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'projectId')) {
    throw new Error('Invalid project export input')
  }
  return { projectId: readString(value.projectId, 'projectId') }
}

function parseNoInput(value: unknown): undefined {
  if (value !== undefined) throw new Error('This operation does not accept input')
  return undefined
}

function parseToken(value: unknown): { importToken: string } {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'importToken')) {
    throw new Error('Invalid import token input')
  }
  return { importToken: readString(value.importToken, 'importToken') }
}

function parseCommit(value: unknown): { importToken: string; confirm: true } {
  if (
    !isRecord(value)
    || Object.keys(value).some((key) => key !== 'importToken' && key !== 'confirm')
    || value.confirm !== true
  ) {
    throw new Error('Explicit import confirmation is required')
  }
  return { importToken: readString(value.importToken, 'importToken'), confirm: true }
}

const formatError = (error: unknown) => ({
  success: false as const,
  error: toProjectPortabilityError(error, 'PROJECT_IMPORT_INVALID'),
})

function requireCoordinator(
  coordinator?: ProjectPortabilityCoordinator,
): ProjectPortabilityCoordinator {
  if (!coordinator) throw new Error('Project portability is unavailable')
  return coordinator
}

export function registerProjectPortabilityIPC(
  ipc: IpcRegistry,
  coordinator?: ProjectPortabilityCoordinator,
): void {
  const authorize = assertTrustedIpcSender

  ipc.register('projectPortability:export', async (_, input) => {
    const service = requireCoordinator(coordinator)
    const selected = await dialog.showSaveDialog({
      title: '导出项目',
      defaultPath: `project-${input.projectId.slice(0, 8)}${PROJECT_ARCHIVE_EXTENSION}`,
      filters: [
        { name: 'YourCrush 项目', extensions: ['yourcrush-project.json', 'json'] },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (selected.canceled || !selected.filePath) {
      return { success: true as const, data: { canceled: true as const } }
    }
    return {
      success: true as const,
      data: await service.exportToFile(input.projectId, selected.filePath),
    }
  }, { parse: parseProjectId, authorize, formatError: (error) => ({
    success: false,
    error: toProjectPortabilityError(error, 'PROJECT_EXPORT_FAILED'),
  }) })

  ipc.register('projectPortability:inspectImport', async () => {
    const service = requireCoordinator(coordinator)
    const selected = await dialog.showOpenDialog({
      title: '导入项目',
      filters: [
        { name: 'YourCrush 项目', extensions: ['yourcrush-project.json', 'json'] },
      ],
      properties: ['openFile'],
    })
    if (selected.canceled || selected.filePaths.length !== 1) {
      return { success: true as const, data: { canceled: true as const } }
    }
    return {
      success: true as const,
      data: {
        canceled: false as const,
        preview: await service.inspectFile(selected.filePaths[0]),
      },
    }
  }, { parse: parseNoInput, authorize, formatError })

  ipc.register('projectPortability:commitImport', async (_, input) => ({
    success: true as const,
    data: await requireCoordinator(coordinator).commitImport(input.importToken),
  }), { parse: parseCommit, authorize, formatError })

  ipc.register('projectPortability:cancelImport', async (_, input) => ({
    success: true as const,
    data: await requireCoordinator(coordinator).cancelImport(input.importToken),
  }), { parse: parseToken, authorize, formatError })
}
