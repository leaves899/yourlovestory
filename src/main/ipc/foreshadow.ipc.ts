import type {
  ForeshadowStatus,
  NarrativeWorkbenchService,
} from '../../shared/narrativeWorkbench'
import {
  isRecord,
  parseProjectIdParams,
  readString,
  type IpcRegistry,
} from './shared'

function parseForeshadowEventParams(
  value: unknown,
): { projectId: string; foreshadowId: string } {
  if (!isRecord(value)) throw new Error('foreshadow event input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    foreshadowId: readString(value.foreshadow_id, 'foreshadow_id'),
  }
}

function parseForeshadowSuggestionParams(value: unknown): {
  projectId: string
  chapterId: string
  content?: string
  endingHook?: string
  plannedPayoffChapterId?: string | null
} {
  if (!isRecord(value)) throw new Error('foreshadow suggestion input is required')
  const planned = value.planned_payoff_chapter_id
  if (planned !== undefined && planned !== null && typeof planned !== 'string') {
    throw new Error('planned_payoff_chapter_id must be a string or null')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
    content: typeof value.content === 'string' ? value.content : undefined,
    endingHook: typeof value.ending_hook === 'string' ? value.ending_hook : undefined,
    plannedPayoffChapterId: typeof planned === 'string' ? planned : null,
  }
}

function parseForeshadowTransitionParams(value: unknown): {
  projectId: string
  foreshadowId: string
  status: ForeshadowStatus
  note: string
  chapterId: string | null
} {
  if (!isRecord(value)) throw new Error('foreshadow transition input is required')
  const statuses: readonly ForeshadowStatus[] = [
    'suggested',
    'planned',
    'planted',
    'active',
    'revealed',
    'paid_off',
    'resolved',
    'abandoned',
  ]
  if (!statuses.includes(value.status as ForeshadowStatus)) throw new Error('status is invalid')
  const chapterId = value.chapter_id
  if (chapterId !== undefined && chapterId !== null && typeof chapterId !== 'string') {
    throw new Error('chapter_id must be a string or null')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    foreshadowId: readString(value.foreshadow_id, 'foreshadow_id'),
    status: value.status as ForeshadowStatus,
    note: typeof value.note === 'string' ? value.note : '',
    chapterId: typeof chapterId === 'string' ? chapterId : null,
  }
}

export function registerForeshadowIPC(
  ipc: IpcRegistry,
  service?: NarrativeWorkbenchService,
): void {
  ipc.register('foreshadow:list', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: service.listForeshadows(parsed.project_id) }
  })

  ipc.register('foreshadow:events', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowEventParams(params)
    return {
      success: true,
      data: service.listForeshadowEvents(parsed.projectId, parsed.foreshadowId),
    }
  })

  ipc.register('foreshadow:suggest', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowSuggestionParams(params)
    return {
      success: true,
      data: await service.suggestForeshadows(
        parsed.projectId,
        parsed.chapterId,
        {
          content: parsed.content,
          ending_hook: parsed.endingHook,
          planned_payoff_chapter_id: parsed.plannedPayoffChapterId,
        },
      ),
    }
  })

  ipc.register('foreshadow:transition', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowTransitionParams(params)
    return {
      success: true,
      data: service.transitionForeshadow(
        parsed.projectId,
        parsed.foreshadowId,
        parsed.status,
        parsed.note,
        parsed.chapterId,
      ),
    }
  })
}
