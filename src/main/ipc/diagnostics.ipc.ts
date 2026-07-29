import { dialog } from 'electron'
import {
  DIAGNOSTIC_FILE_EXTENSION,
  toDiagnosticError,
} from '../../shared/diagnostics'
import type { DiagnosticExportCoordinator } from '../diagnostics'
import {
  assertTrustedIpcSender,
  type IpcRegistry,
} from './shared'

function parseNoInput(value: unknown): undefined {
  if (value !== undefined) throw new Error('This operation does not accept input')
  return undefined
}

function requireCoordinator(
  coordinator?: DiagnosticExportCoordinator,
): DiagnosticExportCoordinator {
  if (!coordinator) throw new Error('Diagnostic export is unavailable')
  return coordinator
}

export function registerDiagnosticsIPC(
  ipc: IpcRegistry,
  coordinator?: DiagnosticExportCoordinator,
): void {
  const authorize = assertTrustedIpcSender

  ipc.register('diagnostics:export', async () => {
    const service = requireCoordinator(coordinator)
    const selected = await dialog.showSaveDialog({
      title: '导出脱敏诊断包',
      defaultPath: service.defaultFileName(),
      filters: [
        {
          name: 'YourCrush 诊断包',
          extensions: [
            DIAGNOSTIC_FILE_EXTENSION.replace(/^\./, ''),
            'json',
          ],
        },
      ],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (selected.canceled || !selected.filePath) {
      return { success: true as const, data: { canceled: true as const } }
    }
    return {
      success: true as const,
      data: await service.exportToFile(selected.filePath),
    }
  }, {
    parse: parseNoInput,
    authorize,
    formatError: (error) => ({
      success: false as const,
      error: toDiagnosticError(error, 'LOCAL_IO_ERROR'),
    }),
  })
}
