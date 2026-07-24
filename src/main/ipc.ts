import { ipcMain, app } from 'electron'
import type { LlmConfigInput } from '../agent/llm'
import type { ChapterGenerationService } from '../shared/chapterGeneration'
import type { ForeshadowStatus, NarrativeWorkbenchService } from '../shared/narrativeWorkbench'
import type { JsonObject } from './database'
import type { TaskManager, StartTaskInput } from './tasks'
import { parseChapterGenerationStartParams, parseChapterPolishStartParams } from './tasks'
export { parseChapterGenerationStartParams }
import type { WorkbenchService } from './workbench'
import { registerWorkbenchIPC } from './workbench'
import type { AssistantService } from './assistant'
import { registerAssistantIPC } from './assistant'
import { getSettings, updateSettings } from '../shared/persistence/settingsStore'
import { sanitizeErrorMessage } from '../shared/security/sanitizeSensitiveData'
import type { CredentialService } from './security/credentialService'
import { credentialBindingForProvider, getAppCredentialId, safeSettingsView } from './security/llmCredentials'
import {
  createCrush,
  listCrushes,
  getCrush,
  updateCrush,
  deleteCrush,
} from '../shared/crush/crushStore'
import {
  generateDay,
  listDays,
  getDay,
  updateDay,
  deleteDay,
} from '../shared/day/dayService'
import {
  managerRecordFragment,
  getFragmentsByDate,
  getFragment,
  managerUpdateFragment,
  managerDeleteFragment,
  managerIntegrateFragments,
} from '../shared/fragment/manager'
import { getCurrentDate } from '../shared/fragment/utils'
import {
  loadProgress,
  confirmPhaseAdvance,
  setPhase,
  detectNarrativeSignals,
} from '../shared/relationship/manager'

export interface IpcSetupOptions {
  taskManager?: TaskManager
  workbenchService?: WorkbenchService
  assistantService?: AssistantService
  chapterGenerationService?: ChapterGenerationService
  narrativeWorkbenchService?: NarrativeWorkbenchService
  credentialService?: CredentialService
}

type CredentialScope = { scope: 'app' } | { scope: 'project'; projectId: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stripLegacyCredentialValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLegacyCredentialValues)
  if (!isRecord(value)) return value
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (key.replace(/[\s_-]/g, '').toLowerCase() === 'apikey') continue
    result[key] = stripLegacyCredentialValues(item)
  }
  return result
}

function isJsonValue(value: unknown): value is JsonObject[string] {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function parseCredentialScope(value: unknown): CredentialScope {
  if (!isRecord(value) || (value.scope !== 'app' && value.scope !== 'project')) {
    throw new Error('credential scope is invalid')
  }
  if (value.scope === 'app') return { scope: 'app' }
  return { scope: 'project', projectId: readString(value.projectId, 'projectId') }
}

function credentialIdForScope(scope: CredentialScope, settings: Record<string, unknown>): string {
  return scope.scope === 'app' ? getAppCredentialId(settings) : `llm:project:${scope.projectId}`
}

function safeError(error: unknown, fallback?: string): string {
  return sanitizeErrorMessage(error, fallback)
}

function credentialTestEndpoint(provider: string): string {
  if (provider === 'anthropic') return 'https://api.anthropic.com/v1/models'
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/models'
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1/models'
  return 'https://api.openai.com/v1/models'
}

function parseLlmConfig(value: unknown): LlmConfigInput {
  if (!isRecord(value)) throw new Error('llm config is required')
  return {
    provider: readOptionalString(value.provider),
    baseUrl: readString(value.baseUrl, 'llm.baseUrl'),
    model: readString(value.model, 'llm.model'),
    credentialId: readOptionalString(value.credentialId),
    contextBudget: readOptionalPositiveInteger(value.contextBudget),
    maxOutputTokens: readOptionalPositiveInteger(value.maxOutputTokens),
    temperature: typeof value.temperature === 'number' ? value.temperature : undefined,
    streamingEnabled: typeof value.streamingEnabled === 'boolean' ? value.streamingEnabled : undefined,
    maxRetries: readOptionalNonNegativeInteger(value.maxRetries),
    retryDelayMs: readOptionalNonNegativeInteger(value.retryDelayMs),
    maxRetryDelayMs: readOptionalNonNegativeInteger(value.maxRetryDelayMs),
    timeoutMs: readOptionalPositiveInteger(value.timeoutMs),
  }
}

function parseTaskStartInput(value: unknown): StartTaskInput {
  if (!isRecord(value)) throw new Error('task input is required')
  const rawInput = value.input
  const input: JsonObject | undefined = isRecord(rawInput) && Object.values(rawInput).every(isJsonValue)
    ? rawInput as JsonObject
    : undefined
  return {
    projectId: readString(value.projectId, 'projectId'),
    sessionId: readString(value.sessionId, 'sessionId'),
    taskType: readString(value.taskType, 'taskType'),
    prompt: readString(value.prompt, 'prompt'),
    llm: parseLlmConfig(value.llm),
    chapterId: typeof value.chapterId === 'string' ? value.chapterId : undefined,
    parentTaskId: typeof value.parentTaskId === 'string' ? value.parentTaskId : undefined,
    input,
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : undefined,
  }
}

function parseProjectChapterParams(value: unknown): { projectId: string; chapterId: string } {
  if (!isRecord(value)) throw new Error('chapter input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
  }
}

function parseProjectIdParams(value: unknown): { project_id: string } {
  if (!isRecord(value)) throw new Error('project input is required')
  return { project_id: readString(value.project_id, 'project_id') }
}

function parseVersionActionParams(value: unknown): { projectId: string; versionId: string } {
  if (!isRecord(value)) throw new Error('chapter version input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    versionId: readString(value.version_id, 'version_id'),
  }
}

function parseRevisionActionParams(value: unknown): { projectId: string; revisionId: string } {
  if (!isRecord(value)) throw new Error('chapter revision input is required')
  const revisionId = value.revision_id ?? value.version_id
  return {
    projectId: readString(value.project_id, 'project_id'),
    revisionId: readString(revisionId, 'revision_id'),
  }
}

function parseProposalActionParams(value: unknown): { projectId: string; proposalId: string } {
  if (!isRecord(value)) throw new Error('narrative memory proposal input is required')
  const proposalId = value.proposal_id ?? value.version_id
  return {
    projectId: readString(value.project_id, 'project_id'),
    proposalId: readString(proposalId, 'proposal_id'),
  }
}

function parseForeshadowEventParams(value: unknown): { projectId: string; foreshadowId: string } {
  if (!isRecord(value)) throw new Error('foreshadow event input is required')
  return {
    projectId: readString(value.project_id, 'project_id'),
    foreshadowId: readString(value.foreshadow_id, 'foreshadow_id'),
  }
}

function parseProjectChapterRevisionParams(value: unknown): {
  projectId: string
  chapterId: string
} {
  return parseProjectChapterParams(value)
}

function parseMemoryExtractionParams(value: unknown): {
  projectId: string
  chapterId: string
  content?: string
  sourceVersionId?: string | null
} {
  if (!isRecord(value)) throw new Error('narrative memory extraction input is required')
  const sourceVersionId = value.source_version_id
  if (sourceVersionId !== undefined && sourceVersionId !== null && typeof sourceVersionId !== 'string') {
    throw new Error('source_version_id must be a string or null')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
    content: typeof value.content === 'string' ? value.content : undefined,
    sourceVersionId: typeof sourceVersionId === 'string' ? sourceVersionId : null,
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

export function setupIPC(options: IpcSetupOptions = {}) {
  // 必须在应用完成测试覆盖或平台初始化后读取，避免模块加载时缓存错误目录。
  const userDataPath = app.getPath('userData')
  const taskManager = options.taskManager
  const narrativeWorkbenchService = options.narrativeWorkbenchService ?? options.workbenchService?.narrative
  const credentialService = options.credentialService

  const invalidateCredentialRuntimes = (): void => {
    // Existing agents may hold a resolved key. Abort them before another call.
    options.assistantService?.dispose()
    taskManager?.dispose()
  }

  const clearProjectCredentialReferences = (): void => {
    for (const project of options.workbenchService?.listProjects() ?? []) {
      const current = options.workbenchService!.getProjectConfig(project.id)
      if (!('llmCredentialId' in current.settings)) continue
      const next = { ...current.settings }
      delete next.llmCredentialId
      options.workbenchService!.updateProjectConfig(project.id, { settings: next }, current.version)
    }
  }
  registerWorkbenchIPC(options.workbenchService)
  registerAssistantIPC(options.assistantService)

  ipcMain.handle('task:run', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.start(parseTaskStartInput(params))
    return { success: true, data: { taskId: handle.taskId } }
  })

  ipcMain.handle('task:cancel', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task cancel input is required')
    const taskId = readString(params.taskId, 'taskId')
    return { success: taskManager.cancel(taskId) }
  })

  ipcMain.handle('task:get', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task get input is required')
    const taskId = readString(params.taskId, 'taskId')
    return { success: true, data: taskManager.get(taskId) }
  })

  ipcMain.handle('task:list', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task list input is required')
    const projectId = readString(params.projectId, 'projectId')
    return { success: true, data: taskManager.listByProject(projectId) }
  })

  ipcMain.handle('task:resume', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task resume input is required')
    const taskId = readString(params.taskId, 'taskId')
    const handle = taskManager.resume(taskId)
    return {
      success: handle !== null,
      ...(handle ? { data: { taskId: handle.taskId } } : {}),
    }
  })

  ipcMain.handle('task:recoverable', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task recoverable input is required')
    const projectId = readString(params.projectId, 'projectId')
    return { success: true, data: taskManager.listRecoverable(projectId) }
  })

  ipcMain.handle('chapterGeneration:start', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.startChapterGeneration(parseChapterGenerationStartParams(params))
    return { success: true, data: { taskId: handle.taskId } }
  })

  ipcMain.handle('chapterGeneration:versions', async (_, params: unknown) => {
    if (!options.chapterGenerationService) throw new Error('ChapterGenerationService is not initialized')
    const parsed = parseProjectChapterParams(params)
    return {
      success: true,
      data: options.chapterGenerationService.listVersions(parsed.projectId, parsed.chapterId),
    }
  })

  ipcMain.handle('chapterGeneration:version:get', async (_, params: unknown) => {
    if (!options.chapterGenerationService) throw new Error('ChapterGenerationService is not initialized')
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: options.chapterGenerationService.getVersion(parsed.projectId, parsed.versionId),
    }
  })

  ipcMain.handle('chapterGeneration:version:confirm', async (_, params: unknown) => {
    if (!options.chapterGenerationService) throw new Error('ChapterGenerationService is not initialized')
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: options.chapterGenerationService.confirmVersion(parsed.projectId, parsed.versionId),
    }
  })

  ipcMain.handle('chapterGeneration:version:reject', async (_, params: unknown) => {
    if (!options.chapterGenerationService) throw new Error('ChapterGenerationService is not initialized')
    const parsed = parseVersionActionParams(params)
    return {
      success: true,
      data: options.chapterGenerationService.rejectVersion(parsed.projectId, parsed.versionId),
    }
  })

  ipcMain.handle('narrativeMemory:list', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: narrativeWorkbenchService.listMemories(parsed.project_id) }
  })

  ipcMain.handle('narrativeMemory:proposals', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: narrativeWorkbenchService.listMemoryProposals(parsed.project_id) }
  })

  ipcMain.handle('narrativeMemory:extract', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseMemoryExtractionParams(params)
    return {
      success: true,
      data: await narrativeWorkbenchService.extractMemoryProposals(
        parsed.projectId,
        parsed.chapterId,
        { content: parsed.content, source_version_id: parsed.sourceVersionId },
      ),
    }
  })

  ipcMain.handle('narrativeMemory:approve', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProposalActionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.approveMemoryProposal(parsed.projectId, parsed.proposalId),
    }
  })

  ipcMain.handle('narrativeMemory:reject', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProposalActionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.rejectMemoryProposal(parsed.projectId, parsed.proposalId),
    }
  })

  ipcMain.handle('foreshadow:list', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: narrativeWorkbenchService.listForeshadows(parsed.project_id) }
  })

  ipcMain.handle('foreshadow:events', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowEventParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.listForeshadowEvents(parsed.projectId, parsed.foreshadowId),
    }
  })

  ipcMain.handle('foreshadow:suggest', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowSuggestionParams(params)
    return {
      success: true,
      data: await narrativeWorkbenchService.suggestForeshadows(
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

  ipcMain.handle('foreshadow:transition', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseForeshadowTransitionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.transitionForeshadow(
        parsed.projectId,
        parsed.foreshadowId,
        parsed.status,
        parsed.note,
        parsed.chapterId,
      ),
    }
  })

  ipcMain.handle('skill:list', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectIdParams(params)
    return { success: true, data: narrativeWorkbenchService.listSkills(parsed.project_id) }
  })

  ipcMain.handle('skill:toggle', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseSkillToggleParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.setSkillEnabled(
        parsed.projectId,
        parsed.skillName,
        parsed.enabled,
      ),
    }
  })

  ipcMain.handle('chapter:blocks', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectChapterRevisionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.getChapterBlocks(parsed.projectId, parsed.chapterId),
    }
  })

  ipcMain.handle('chapter:revisions', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseProjectChapterRevisionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.listRevisions(parsed.projectId, parsed.chapterId),
    }
  })

  ipcMain.handle('chapter:revision:get', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionActionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.getRevision(parsed.projectId, parsed.revisionId),
    }
  })

  ipcMain.handle('chapter:revision:apply', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionActionParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.applyRevision(parsed.projectId, parsed.revisionId),
    }
  })

  ipcMain.handle('chapter:diff:revisions', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseRevisionDiffParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.diffRevisions(
        parsed.projectId,
        parsed.fromRevisionId,
        parsed.toRevisionId,
      ),
    }
  })

  ipcMain.handle('chapter:diff:versions', async (_, params: unknown) => {
    if (!narrativeWorkbenchService) throw new Error('NarrativeWorkbenchService is not initialized')
    const parsed = parseVersionDiffParams(params)
    return {
      success: true,
      data: narrativeWorkbenchService.diffVersions(
        parsed.projectId,
        parsed.fromVersionId,
        parsed.toVersionId,
      ),
    }
  })

  ipcMain.handle('chapterPolish:start', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.startChapterPolish(parseChapterPolishStartParams(params))
    return { success: true, data: { taskId: handle.taskId } }
  })

  // 日常写作（已迁移到 TS dayService）
  ipcMain.handle('day:generate', async (_, params) =>
    generateDay(userDataPath, params, {
      getCredential: async (credentialId) => {
        if (!credentialService) throw new Error('系统安全存储未初始化。')
        const settings = getSettings(userDataPath) as Record<string, unknown>
        const binding = credentialService.getCredentialBinding(credentialId)
        const expected = credentialBindingForProvider(settings.provider, settings.baseUrl)
        if (!binding.success) throw new Error(binding.error.message)
        if (!binding.data || binding.data.baseUrl !== expected.baseUrl) {
          throw new Error('Credential is restricted to its saved Provider endpoint.')
        }
        const result = credentialService.getCredential(credentialId)
        if (!result.success) throw new Error(result.error.message)
        return result.data
      },
    })
  )

  ipcMain.handle('day:list', async (_, params) =>
    listDays(userDataPath, params)
  )

  ipcMain.handle('day:get', async (_, params) =>
    getDay(userDataPath, params)
  )

  ipcMain.handle('day:update', async (_, params) =>
    updateDay(userDataPath, params)
  )

  ipcMain.handle('day:delete', async (_, params) =>
    deleteDay(userDataPath, params)
  )

  // 碎片日记直接调用 shared fragment 模块。
  // date 作为 currentDate（状态判断和文件定位基准）传入；
  // 不传时 recordFragment 内部退化为今天。
  ipcMain.handle('fragment:record', async (_, params) => {
    const { date, slug, ...fragmentData } = params
    const result = managerRecordFragment(userDataPath, slug, fragmentData, date)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:list', async (_, params) => ({
    success: true,
    data: getFragmentsByDate(userDataPath, params.slug, params.date ?? getCurrentDate()),
  }))

  ipcMain.handle('fragment:get', async (_, params) => {
    const fragment = getFragment(userDataPath, params.fragment_id)
    return fragment
      ? { success: true, data: fragment }
      : { success: false, errors: ['碎片不存在'] }
  })

  ipcMain.handle('fragment:update', async (_, params) => {
    const { fragment_id, slug: _slug, expected_version, ...updates } = params
    const result = managerUpdateFragment(userDataPath, fragment_id, updates, expected_version)
    if (result.fragment) {
      return { success: true, data: result.fragment }
    }
    return { success: false, errors: [result.error] }
  })

  ipcMain.handle('fragment:delete', async (_, params) =>
    managerDeleteFragment(userDataPath, params.fragment_id, params.expected_version)
  )

  ipcMain.handle('fragment:integrate', async (_, params) => ({
    success: true,
    data: {
      prompt: managerIntegrateFragments(userDataPath, params.slug, params.date ?? getCurrentDate()),
    },
  }))

  // 角色管理直接调用 shared crushStore。
  // 模板在 asar 内（只读），用 app.getAppPath() 访问；用户数据在 userData 目录（可读写）
  ipcMain.handle('crush:create', async (_, params) =>
    createCrush(userDataPath, params, app.getAppPath())
  )

  ipcMain.handle('crush:list', async () => listCrushes(userDataPath))

  ipcMain.handle('crush:get', async (_, params) => getCrush(userDataPath, params.slug))

  ipcMain.handle('crush:update', async (_, params) => updateCrush(userDataPath, params))

  ipcMain.handle('crush:delete', async (_, params) => deleteCrush(userDataPath, params.slug))

  // 关系进度
  ipcMain.handle('relationship:progress', async (_, params) => {
    try {
      const progress = loadProgress(userDataPath, params.slug)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipcMain.handle('relationship:detectSignals', async (_, params) => {
    try {
      const result = detectNarrativeSignals(userDataPath, params.slug, params.narrativeText)
      return { success: true, data: result }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipcMain.handle('relationship:advancePhase', async (_, params) => {
    try {
      const progress = confirmPhaseAdvance(userDataPath, params.slug, params.reason)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipcMain.handle('relationship:setPhase', async (_, params) => {
    try {
      const progress = setPhase(userDataPath, params.slug, params.phase)
      return { success: true, data: progress }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  // 设置直接调用 shared settingsStore。
  ipcMain.handle('settings:get', async () => {
    try {
      const data = getSettings(userDataPath) as Record<string, unknown>
      const status = credentialService?.availability()
      const configured = credentialService
        ? credentialService.hasCredential(getAppCredentialId(data))
        : { success: true as const, data: false }
      return {
        success: true,
        data: status && configured.success
          ? safeSettingsView(data, status, configured.data)
          : stripLegacyCredentialValues(data),
      }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipcMain.handle('settings:update', async (_, params: unknown) => {
    try {
      if (!isRecord(params)) throw new Error('settings must be an object')
      // API Key must travel through llmCredential:save only.
      const next = stripLegacyCredentialValues(params) as Record<string, unknown>
      const existing = getSettings(userDataPath) as Record<string, unknown>
      // Settings UI overwrites ordinary fields. Preserve the main-process-only
      // credential reference so a normal settings save cannot orphan it.
      if (typeof existing.credentialId === 'string') next.credentialId = existing.credentialId
      const success = updateSettings(userDataPath, next)
      return { success }
    } catch (error: unknown) {
      return { success: false, errors: [safeError(error)] }
    }
  })

  ipcMain.handle('llmCredential:status', async (_, value: unknown) => {
    if (!credentialService) return { success: false, error: { code: 'UNAVAILABLE', message: '凭据服务未初始化。', retryable: true } }
    try {
      const scope = parseCredentialScope(value)
      if (scope.scope === 'project' && !options.workbenchService?.getProject(scope.projectId)) {
        throw new Error('project not found')
      }
      const settings = getSettings(userDataPath) as Record<string, unknown>
      const availability = credentialService.availability()
      const configured = credentialService.hasCredential(credentialIdForScope(scope, settings))
      return {
        success: true,
        data: {
          configured: configured.success && configured.data,
          storageAvailable: availability.available,
          backend: availability.backend,
          error: availability.error ? { code: availability.error.code, message: availability.error.message } : null,
        },
      }
    } catch (error: unknown) {
      return { success: false, error: { code: 'INVALID_INPUT', message: safeError(error), retryable: false } }
    }
  })

  ipcMain.handle('llmCredential:save', async (_, value: unknown) => {
    if (!credentialService || !isRecord(value)) return { success: false, error: { code: 'UNAVAILABLE', message: '凭据服务未初始化。', retryable: true } }
    try {
      const scope = parseCredentialScope(value.target)
      const secret = readString(value.secret, 'secret')
      if (secret.length > 4096) throw new Error('API Key is too long')
      if (scope.scope === 'project' && !options.workbenchService?.getProject(scope.projectId)) throw new Error('project not found')
      const settings = getSettings(userDataPath) as Record<string, unknown>
      const credentialId = credentialIdForScope(scope, settings)
      const projectConfig = scope.scope === 'project'
        ? options.workbenchService!.getProjectConfig(scope.projectId)
        : undefined
      const binding = scope.scope === 'app'
        ? credentialBindingForProvider(settings.provider, settings.baseUrl)
        : credentialBindingForProvider(projectConfig!.settings.llmProvider, projectConfig!.settings.llmBaseUrl)
      const saved = credentialService.saveCredential(credentialId, secret, binding)
      if (!saved.success) return saved
      if (scope.scope === 'app') {
        const next: Record<string, unknown> = { ...settings, credentialId }
        delete next.apiKey
        delete next.api_key
        if (!updateSettings(userDataPath, next)) {
          return { success: false, error: { code: 'STORAGE_WRITE_FAILED', message: '凭据已加密，但配置引用写入失败。', retryable: true } }
        }
      } else {
        const current = projectConfig!
        options.workbenchService!.updateProjectConfig(
          scope.projectId,
          { settings: { ...current.settings, llmCredentialId: credentialId } },
          current.version,
        )
      }
      invalidateCredentialRuntimes()
      return { success: true, data: { configured: true } }
    } catch (error: unknown) {
      return { success: false, error: { code: 'INVALID_INPUT', message: safeError(error), retryable: false } }
    }
  })

  ipcMain.handle('llmCredential:delete', async (_, value: unknown) => {
    if (!credentialService) return { success: false, error: { code: 'UNAVAILABLE', message: '凭据服务未初始化。', retryable: true } }
    try {
      const scope = parseCredentialScope(value)
      if (scope.scope === 'project' && !options.workbenchService?.getProject(scope.projectId)) throw new Error('project not found')
      const settings = getSettings(userDataPath) as Record<string, unknown>
      const credentialId = credentialIdForScope(scope, settings)
      if (scope.scope === 'app') {
        const next = { ...settings }
        delete next.credentialId
        if (!updateSettings(userDataPath, next)) {
          return { success: false, error: { code: 'STORAGE_WRITE_FAILED', message: '凭据已删除，但配置引用清理失败。', retryable: true } }
        }
      } else {
        const current = options.workbenchService!.getProjectConfig(scope.projectId)
        const next = { ...current.settings }
        delete next.llmCredentialId
        options.workbenchService!.updateProjectConfig(scope.projectId, { settings: next }, current.version)
      }
      invalidateCredentialRuntimes()
      const removed = credentialService.deleteCredential(credentialId)
      if (!removed.success) {
        return { success: false, error: { code: removed.error.code, message: '凭据引用已清理，但系统安全存储删除失败。请重试删除。', retryable: true } }
      }
      return { success: true, data: { deleted: removed.data } }
    } catch (error: unknown) {
      return { success: false, error: { code: 'INVALID_INPUT', message: safeError(error), retryable: false } }
    }
  })

  ipcMain.handle('llmCredential:test', async (_, value: unknown) => {
    if (!credentialService) return { success: false, error: { code: 'UNAVAILABLE', message: '凭据服务未初始化。', retryable: true } }
    try {
      const scope = parseCredentialScope(value)
      if (scope.scope === 'project' && !options.workbenchService?.getProject(scope.projectId)) throw new Error('project not found')
      const settings = getSettings(userDataPath) as Record<string, unknown>
      const credential = credentialService.getCredential(credentialIdForScope(scope, settings))
      if (!credential.success) return credential
      const provider = typeof settings.provider === 'string' ? settings.provider : 'openai'
      const headers: Record<string, string> = provider === 'anthropic'
        ? { 'x-api-key': credential.data, 'anthropic-version': '2023-06-01' }
        : { Authorization: `Bearer ${credential.data}` }
      const response = await fetch(credentialTestEndpoint(provider), { headers })
      if (!response.ok) {
        return { success: false, error: { code: 'UNAVAILABLE', message: `连接测试失败（HTTP ${response.status}）。请检查 Provider、网络和 API Key。`, retryable: response.status >= 500 } }
      }
      return { success: true, data: { message: '连接测试成功。' } }
    } catch (error: unknown) {
      return { success: false, error: { code: 'UNAVAILABLE', message: safeError(error, '连接测试失败，请检查网络后重试。'), retryable: true } }
    }
  })

  ipcMain.handle('llmCredential:deleteAll', async () => {
    if (!credentialService) return { success: false, error: { code: 'UNAVAILABLE', message: '凭据服务未初始化。', retryable: true } }
    try {
      const settings = getSettings(userDataPath) as Record<string, unknown>
      delete settings.credentialId
      if (!updateSettings(userDataPath, settings)) {
        return { success: false, error: { code: 'STORAGE_WRITE_FAILED', message: '无法清理全局凭据引用。', retryable: true } }
      }
      clearProjectCredentialReferences()
      invalidateCredentialRuntimes()
      const removed = credentialService.deleteAllCredentials()
      if (!removed.success) {
        return { success: false, error: { code: removed.error.code, message: '凭据引用已清理，但系统安全存储删除失败。请重试删除。', retryable: true } }
      }
      return { success: true, data: { deleted: removed.data } }
    } catch (error: unknown) {
      return { success: false, error: { code: 'STORAGE_WRITE_FAILED', message: safeError(error), retryable: true } }
    }
  })

  // 应用
  ipcMain.handle('app:info', async () => {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
    }
  })

  ipcMain.handle('app:checkUpdate', async () => {
    // TODO: 实现更新检查
    return { hasUpdate: false, version: app.getVersion() }
  })

  ipcMain.handle('app:quit', async () => {
    app.quit()
  })
}
