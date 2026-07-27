import type { NarrativeWorkbenchService } from '../../shared/narrativeWorkbench'
import {
  isRecord,
  parseProjectIdParams,
  readString,
  type IpcRegistry,
} from './shared'

function parseSkillToggleParams(value: unknown): {
  projectId: string
  skillName: string
  enabled: boolean
} {
  if (!isRecord(value)) throw new Error('skill toggle input is required')
  if (typeof value.enabled !== 'boolean') throw new Error('enabled must be a boolean')
  return {
    projectId: readString(value.project_id, 'project_id'),
    skillName: readString(value.skill_name, 'skill_name'),
    enabled: value.enabled,
  }
}

export function registerSkillIPC(
  ipc: IpcRegistry,
  service?: NarrativeWorkbenchService,
): void {
  ipc.register('skill:list', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: service.listSkills(parsed.project_id) }
  })

  ipc.register('skill:toggle', async (_, params: unknown) => {
    if (!service) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseSkillToggleParams(params)
    return {
      success: true,
      data: service.setSkillEnabled(parsed.projectId, parsed.skillName, parsed.enabled),
    }
  })
}
