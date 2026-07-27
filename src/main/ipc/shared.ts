import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'

export type IpcRegistrar = Pick<IpcMain, 'handle'>
type IpcHandler = Parameters<IpcMain['handle']>[1]
type IpcHandlerResult = ReturnType<IpcHandler>

export interface IpcAuditEvent {
  channel: string
  outcome: 'started' | 'succeeded' | 'failed'
}

export type IpcAuditSink = (event: IpcAuditEvent) => void

interface IpcHandlerOptions<Input> {
  parse?: (value: unknown) => Input
  authorize?: (event: IpcMainInvokeEvent, value: unknown) => void
  formatError?: (error: unknown) => unknown
}

export interface IpcRegistry {
  register<Input>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, input: Input) => IpcHandlerResult,
    options: IpcHandlerOptions<Input> & { parse: (value: unknown) => Input },
  ): void
  register(
    channel: string,
    handler: IpcHandler,
    options?: IpcHandlerOptions<unknown>,
  ): void
}

export function createIpcRegistry(
  registrar: IpcRegistrar,
  audit?: IpcAuditSink,
): IpcRegistry {
  const emitAudit = (event: IpcAuditEvent): void => {
    try {
      audit?.(event)
    } catch {
      // Audit failures must never alter the IPC contract.
    }
  }

  return {
    register(
      channel: string,
      handler: IpcHandler,
      options: IpcHandlerOptions<unknown> = {},
    ): void {
      registrar.handle(channel, async (event, value: unknown) => {
        emitAudit({ channel, outcome: 'started' })
        try {
          options.authorize?.(event, value)
          const input = options.parse ? options.parse(value) : value
          const result = await handler(event, input)
          emitAudit({ channel, outcome: 'succeeded' })
          return result
        } catch (error: unknown) {
          emitAudit({ channel, outcome: 'failed' })
          if (options.formatError) return options.formatError(error)
          throw error
        }
      })
    },
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

export function safeError(error: unknown, fallback?: string): string {
  return sanitizeErrorMessage(error, fallback)
}

export function assertTrustedCredentialSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender?.getURL()
  if (!senderUrl && process.env.NODE_ENV === 'test') return
  if (senderUrl?.startsWith('file://')) return
  if (senderUrl?.startsWith('http://localhost:3000/')) return
  throw new Error('untrusted IPC sender')
}

export function parseProjectIdParams(value: unknown): { project_id: string } {
  if (!isRecord(value)) throw new Error('project input is required')
  return { project_id: readString(value.project_id, 'project_id') }
}

export function parseProjectChapterParams(
  value: unknown,
): { projectId: string; chapterId: string } {
  if (!isRecord(value)) throw new Error('chapter input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
  }
}
