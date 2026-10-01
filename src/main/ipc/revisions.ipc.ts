import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { NarrativeBoundaryError } from '../../shared/narrativeWorkbench/errors'
import { sharedComputeWorkerClient } from '../workers/computeWorkerClient'
import type { ChapterDiffPayload } from '../workers/protocol'
import {
  isRecord,
  parseProjectChapterParams,
  readString,
  assertTrustedIpcSender,
  safeError,
  type IpcRegistry,
} from './shared'

function requestId(value: unknown): string {
  if (!isRecord(value) || value.request_id === undefined) return randomUUID()
  if (typeof value.request_id !== 'string' || !/^[\w-]{1,128}$/.test(value.request_id)) {
    throw new Error('Invalid diff request_id')
  }
  return value.request_id
}

function diffError(error: unknown) {
  const cancelled = error instanceof Error && error.name === 'AbortError'
  const message = cancelled ? '章节对比已取消' : safeError(error)
  return { success: false, errors: [message], error: { code: cancelled ? 'DIFF_CANCELLED' : 'DIFF_FAILED', message } }
}

function parseRevisionActionParams(
  value: unknown,
): { projectId: string; revisionId: string } {
  if (!isRecord(value)) throw new Error('chapter revision input is required')
  const revisionId = value.revision_id ?? value.version_id
  return {
    projectId: readString(value.project_id, 'project_id'),
    revisionId: readString(revisionId, 'revision_id'),
  }
}

function parseRevisionDiffParams(value: unknown): {
  projectId: string
  fromRevisionId: string
  toRevisionId: string
} {
  if (!isRecord(value)) throw new Error('chapter revision diff input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    fromRevisionId: readString(value.from_revision_id, 'from_revision_id'),
    toRevisionId: readString(value.to_revision_id, 'to_revision_id'),
  }
}

function parseVersionDiffParams(value: unknown): {
  projectId: string
  fromVersionId: string
  toVersionId: string
} {
  if (!isRecord(value)) throw new Error('chapter version diff input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    fromVersionId: readString(value.from_version_id, 'from_version_id'),
    toVersionId: readString(value.to_version_id, 'to_version_id'),
  }
}

export function registerRevisionIPC(
  ipc: IpcRegistry,
  service?: NarrativeWorkbenchService,
  computeWorker = sharedComputeWorkerClient,
): void {
  const active = new Map<number, { requestId: string; controller: AbortController }>()

  const runDiff = async (event: IpcMainInvokeEvent, id: string, payload: ChapterDiffPayload) => {
    const ownerId = event.sender.id
    if (active.has(ownerId)) throw new Error('A chapter diff is already running in this window')
    const controller = new AbortController()
    active.set(ownerId, { requestId: id, controller })
    const cancelOnClose = () => controller.abort()
    event.sender.once('destroyed', cancelOnClose)
    try {
      return await computeWorker.run('chapter-diff', payload, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send('chapter:diff:progress', { request_id: id, progress })
          }
        },
      })
    } finally {
      active.delete(ownerId)
      event.sender.removeListener('destroyed', cancelOnClose)
    }
  }
  ipc.register('chapter:blocks', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectChapterParams(params)
    return {
      success: true,
      data: service.getChapterBlocks(parsed.projectId, parsed.chapterId),
    }
  })

  ipc.register('chapter:revisions', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectChapterParams(params)
    return {
      success: true,
      data: service.listRevisions(parsed.projectId, parsed.chapterId),
    }
  })

  ipc.register('chapter:revision:get', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionActionParams(params)
    return {
      success: true,
      data: service.getRevision(parsed.projectId, parsed.revisionId),
    }
  })

  ipc.register('chapter:revision:apply', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionActionParams(params)
    return {
      success: true,
      data: service.applyRevision(parsed.projectId, parsed.revisionId),
    }
  })

  ipc.register('chapter:diff:revisions', async (event, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionDiffParams(params)
    const from = service.getRevision(parsed.projectId, parsed.fromRevisionId)
    const to = service.getRevision(parsed.projectId, parsed.toRevisionId)
    if (from.chapter_id !== to.chapter_id) {
      throw new NarrativeBoundaryError('Chapter revisions must belong to the same chapter')
    }
    const diff = await runDiff(event, requestId(params), {
      mode: 'blocks',
      before: from.blocks,
      after: to.blocks,
    })
    return {
      success: true,
      data: {
        from_revision_id: from.id,
        to_revision_id: to.id,
        diff,
      },
    }
  }, { authorize: assertTrustedIpcSender, formatError: diffError })

  ipc.register('chapter:diff:versions', async (event, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseVersionDiffParams(params)
    const from = service.getVersionForDiff(parsed.projectId, parsed.fromVersionId)
    const to = service.getVersionForDiff(parsed.projectId, parsed.toVersionId)
    if (from.chapter_id !== to.chapter_id) {
      throw new NarrativeBoundaryError('Chapter versions must belong to the same chapter')
    }
    const diff = await runDiff(event, requestId(params), {
      mode: 'content', chapter_id: from.chapter_id,
      before_content: from.content, after_content: to.content,
    })
    return {
      success: true,
      data: { from_version_id: from.id, to_version_id: to.id, diff },
    }
  }, { authorize: assertTrustedIpcSender, formatError: diffError })

  ipc.register('chapter:diff:cancel', async (event, params: unknown) => {
    if (!isRecord(params) || typeof params.request_id !== 'string') throw new Error('request_id is required')
    const running = active.get(event.sender.id)
    const cancelled = running?.requestId === requestId(params)
    if (cancelled) running?.controller.abort()
    return { success: true, data: { cancelled } }
  }, { authorize: assertTrustedIpcSender, formatError: diffError })
}
