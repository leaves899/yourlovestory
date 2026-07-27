import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import {
  isRecord,
  parseProjectChapterParams,
  readString,
  type IpcRegistry,
} from './shared'

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
): void {
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

  ipc.register('chapter:diff:revisions', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionDiffParams(params)
    return {
      success: true,
      data: service.diffRevisions(
        parsed.projectId,
        parsed.fromRevisionId,
        parsed.toRevisionId,
      ),
    }
  })

  ipc.register('chapter:diff:versions', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseVersionDiffParams(params)
    return {
      success: true,
      data: service.diffVersions(
        parsed.projectId,
        parsed.fromVersionId,
        parsed.toVersionId,
      ),
    }
  })
}
