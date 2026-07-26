import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { sanitizeErrorMessage } from '../../shared/security/sanitizeSensitiveData'

export type IpcRegistrar = Pick<IpcMain, 'handle'>

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
