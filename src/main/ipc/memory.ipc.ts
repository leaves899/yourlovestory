import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import {
  isRecord,
  parseProjectIdParams,
  readString,
  type IpcRegistrar,
} from './shared'

function parseProposalActionParams(
  value: unknown,
): { projectId: string; proposalId: string } {
  if (!isRecord(value)) throw new Error('narrative memory proposal input is required')
  const proposalId = value.proposal_id ?? value.version_id
  return {
    projectId: readString(value.project_id, 'project_id'),
    proposalId: readString(proposalId, 'proposal_id'),
  }
}

function parseMemoryExtractionParams(value: unknown): {
  projectId: string
  chapterId: string
  content?: string
  sourceVersionId?: string | null
} {
  if (!isRecord(value)) throw new Error('narrative memory extraction input is required')
  const sourceVersionId = value.source_version_id
  if (
    sourceVersionId !== undefined
    && sourceVersionId !== null
    && typeof sourceVersionId !== 'string'
  ) {
    throw new Error('source_version_id must be a string or null')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
    content: typeof value.content === 'string' ? value.content : undefined,
    sourceVersionId: typeof sourceVersionId === 'string' ? sourceVersionId : null,
  }
}

export function registerMemoryIPC(
  ipc: IpcRegistrar,
  service?: NarrativeWorkbenchService,
): void {
  ipc.handle('narrativeMemory:list', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: service.listMemories(parsed.project_id) }
  })

  ipc.handle('narrativeMemory:proposals', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: service.listMemoryProposals(parsed.project_id) }
  })

  ipc.handle('narrativeMemory:extract', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseMemoryExtractionParams(params)
    return {
      success: true,
      data: await service.extractMemoryProposals(
        parsed.projectId,
        parsed.chapterId,
        { content: parsed.content, source_version_id: parsed.sourceVersionId },
      ),
    }
  })

  ipc.handle('narrativeMemory:approve', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProposalActionParams(params)
    return {
      success: true,
      data: service.approveMemoryProposal(parsed.projectId, parsed.proposalId),
    }
  })

  ipc.handle('narrativeMemory:reject', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProposalActionParams(params)
    return {
      success: true,
      data: service.rejectMemoryProposal(parsed.projectId, parsed.proposalId),
    }
  })
}
