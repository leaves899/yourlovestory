import type { Static } from 'typebox'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { LlmConfigInput } from '../llm'
import { loadTypeBoxRuntime, type TypeBoxBuilder } from '../runtime'
import type { WorkbenchService } from '../../main/workbench'
import type {
  StartChapterGenerationInput,
  StartChapterPolishInput,
} from '../../main/tasks'
import type {
  CreateChapterOutlineInput,
  CreateVolumeOutlineInput,
  UpdateChapterOutlineInput,
  UpdateVolumeOutlineInput,
} from '../../shared/novelProject'
import type { ForeshadowStatus } from '../../shared/narrativeWorkbench'

function createToolSchemas(Type: TypeBoxBuilder) {
  return {
    context: Type.Object({
      action: Type.Union([
        Type.Literal('full'),
        Type.Literal('project'),
        Type.Literal('characters'),
        Type.Literal('worldview'),
        Type.Literal('organizations'),
        Type.Literal('relations'),
        Type.Literal('materials'),
        Type.Literal('volumes'),
        Type.Literal('outlines'),
        Type.Literal('chapters'),
        Type.Literal('memories'),
        Type.Literal('foreshadows'),
        Type.Literal('skills'),
      ]),
    }),
    outline: Type.Object({
      action: Type.Union([
        Type.Literal('create_volume_outline'),
        Type.Literal('update_volume_outline'),
        Type.Literal('confirm_volume_outline'),
        Type.Literal('lock_volume_outline'),
        Type.Literal('create_chapter_outline'),
        Type.Literal('update_chapter_outline'),
        Type.Literal('confirm_chapter_outline'),
        Type.Literal('lock_chapter_outline'),
      ]),
      volume_id: Type.Optional(Type.String()),
      outline_id: Type.Optional(Type.String()),
      chapter_number: Type.Optional(Type.Integer({ minimum: 1 })),
      title: Type.Optional(Type.String()),
      summary: Type.Optional(Type.String()),
      theme: Type.Optional(Type.String()),
      main_conflict: Type.Optional(Type.String()),
      purpose: Type.Optional(Type.String()),
      opening: Type.Optional(Type.String()),
      conflict: Type.Optional(Type.String()),
      ending: Type.Optional(Type.String()),
      ending_hook: Type.Optional(Type.String()),
      key_turning_points: Type.Optional(Type.Array(Type.String())),
      key_events: Type.Optional(Type.Array(Type.String())),
      expected_version: Type.Optional(Type.Integer({ minimum: 1 })),
    }),
    narrative: Type.Object({
      action: Type.Union([
        Type.Literal('list_memories'),
        Type.Literal('list_memory_proposals'),
        Type.Literal('list_foreshadows'),
        Type.Literal('list_skills'),
        Type.Literal('list_revisions'),
        Type.Literal('get_blocks'),
        Type.Literal('approve_memory'),
        Type.Literal('reject_memory'),
        Type.Literal('apply_revision'),
        Type.Literal('transition_foreshadow'),
        Type.Literal('toggle_skill'),
        Type.Literal('diff_revisions'),
        Type.Literal('diff_versions'),
      ]),
      proposal_id: Type.Optional(Type.String()),
      revision_id: Type.Optional(Type.String()),
      chapter_id: Type.Optional(Type.String()),
      foreshadow_id: Type.Optional(Type.String()),
      from_revision_id: Type.Optional(Type.String()),
      to_revision_id: Type.Optional(Type.String()),
      from_version_id: Type.Optional(Type.String()),
      to_version_id: Type.Optional(Type.String()),
      status: Type.Optional(
        Type.Union([
          Type.Literal('suggested'),
          Type.Literal('planned'),
          Type.Literal('planted'),
          Type.Literal('active'),
          Type.Literal('revealed'),
          Type.Literal('paid_off'),
          Type.Literal('resolved'),
          Type.Literal('abandoned'),
        ]),
      ),
      note: Type.Optional(Type.String()),
      skill_name: Type.Optional(Type.String()),
      enabled: Type.Optional(Type.Boolean()),
    }),
    chapter: Type.Object({
      action: Type.Union([Type.Literal('list'), Type.Literal('get')]),
      chapter_id: Type.Optional(Type.String()),
    }),
    creative: Type.Object({
      action: Type.Union([
        Type.Literal('start_chapter_generation'),
        Type.Literal('start_chapter_polish'),
      ]),
      chapter_outline_id: Type.Optional(Type.String()),
      chapter_id: Type.Optional(Type.String()),
      mode: Type.Optional(Type.Union([Type.Literal('chapter'), Type.Literal('paragraph')])),
      block_id: Type.Optional(Type.String()),
      instruction: Type.Optional(Type.String()),
      source_revision_id: Type.Optional(Type.String()),
      auto_confirm: Type.Optional(Type.Boolean()),
      auto_apply: Type.Optional(Type.Boolean()),
    }),
  }
}

type ToolSchemas = ReturnType<typeof createToolSchemas>
type ContextParameters = Static<ToolSchemas['context']>
type OutlineParameters = Static<ToolSchemas['outline']>
type NarrativeParameters = Static<ToolSchemas['narrative']>
type ChapterParameters = Static<ToolSchemas['chapter']>
type CreativeParameters = Static<ToolSchemas['creative']>

export interface NovelAgentToolOptions {
  sessionId: string
  llm: LlmConfigInput
  startChapterGeneration?: (input: StartChapterGenerationInput) => { taskId: string }
  startChapterPolish?: (input: StartChapterPolishInput) => { taskId: string }
}

interface ToolDetails {
  success: boolean
}

function result(value: unknown): {
  content: [{ type: 'text'; text: string }]
  details: ToolDetails
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    details: { success: true },
  }
}

function requiredString(value: string | undefined, field: string): string {
  if (!value || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function createContextTool(
  service: WorkbenchService,
  projectId: string,
  schemas: ToolSchemas,
): AgentTool<ToolSchemas['context'], ToolDetails> {
  return {
    name: 'novel_context',
    label: 'Novel Context',
    description: '读取当前长篇项目的角色、世界观、提纲、章节和叙事状态。',
    parameters: schemas.context,
    execute: async (_toolCallId: string, params: ContextParameters) => {
      const project = service.getProject(projectId)
      const config = service.getProjectConfig(projectId)
      const read = (action: ContextParameters['action']): unknown => {
        switch (action) {
          case 'project': return { project, config }
          case 'characters': return service.listCharacters(projectId)
          case 'worldview': return service.listWorldviewEntries(projectId)
          case 'organizations': return service.listOrganizations(projectId)
          case 'relations': return service.listRelations(projectId)
          case 'materials': return service.listSourceMaterials(projectId)
          case 'volumes': return service.listVolumes(projectId)
          case 'outlines': return {
            volumes: service.listVolumeOutlines(projectId),
            chapters: service.listChapterOutlines(projectId),
          }
          case 'chapters': return service.listChapters(projectId)
          case 'memories': return {
            memories: service.narrative.listMemories(projectId),
            proposals: service.narrative.listMemoryProposals(projectId),
          }
          case 'foreshadows': return service.narrative.listForeshadows(projectId)
          case 'skills': return service.narrative.listSkills(projectId)
          case 'full': return {
            project,
            config,
            characters: service.listCharacters(projectId),
            worldview_entries: service.listWorldviewEntries(projectId),
            organizations: service.listOrganizations(projectId),
            relations: service.listRelations(projectId),
            source_materials: service.listSourceMaterials(projectId),
            volumes: service.listVolumes(projectId),
            volume_outlines: service.listVolumeOutlines(projectId),
            chapter_outlines: service.listChapterOutlines(projectId),
            chapters: service.listChapters(projectId),
            memories: service.narrative.listMemories(projectId),
            foreshadows: service.narrative.listForeshadows(projectId),
            skills: service.narrative.listSkills(projectId),
          }
        }
      }
      return result(read(params.action))
    },
  }
}

function createOutlineTool(
  service: WorkbenchService,
  projectId: string,
  schemas: ToolSchemas,
): AgentTool<ToolSchemas['outline'], ToolDetails> {
  return {
    name: 'outline_manager',
    label: 'Outline Manager',
    description: '创建、修改、确认或锁定当前项目的卷纲和章节大纲。写入操作需要确认。',
    parameters: schemas.outline,
    executionMode: 'sequential',
    execute: async (_toolCallId: string, params: OutlineParameters) => {
      switch (params.action) {
        case 'create_volume_outline': {
          const input: CreateVolumeOutlineInput = {
            project_id: projectId,
            volume_id: requiredString(params.volume_id, 'volume_id'),
            ...(params.summary === undefined ? {} : { summary: params.summary }),
            ...(params.theme === undefined ? {} : { theme: params.theme }),
            ...(params.main_conflict === undefined ? {} : { main_conflict: params.main_conflict }),
            ...(params.key_turning_points === undefined ? {} : { key_turning_points: params.key_turning_points }),
            ...(params.ending === undefined ? {} : { ending: params.ending }),
          }
          return result(service.createVolumeOutline(input))
        }
        case 'update_volume_outline': {
          const input: UpdateVolumeOutlineInput = {
            ...(params.summary === undefined ? {} : { summary: params.summary }),
            ...(params.theme === undefined ? {} : { theme: params.theme }),
            ...(params.main_conflict === undefined ? {} : { main_conflict: params.main_conflict }),
            ...(params.key_turning_points === undefined ? {} : { key_turning_points: params.key_turning_points }),
            ...(params.ending === undefined ? {} : { ending: params.ending }),
          }
          return result(service.updateVolumeOutline(
            projectId,
            requiredString(params.outline_id, 'outline_id'),
            input,
            params.expected_version,
          ))
        }
        case 'confirm_volume_outline':
          return result(service.confirmVolumeOutline(projectId, requiredString(params.outline_id, 'outline_id'), params.expected_version))
        case 'lock_volume_outline':
          return result(service.lockVolumeOutline(projectId, requiredString(params.outline_id, 'outline_id'), params.expected_version))
        case 'create_chapter_outline': {
          const input: CreateChapterOutlineInput = {
            project_id: projectId,
            volume_id: requiredString(params.volume_id, 'volume_id'),
            chapter_number: params.chapter_number ?? (() => { throw new Error('chapter_number is required') })(),
            title: requiredString(params.title, 'title'),
            ...(params.summary === undefined ? {} : { summary: params.summary }),
            ...(params.purpose === undefined ? {} : { purpose: params.purpose }),
            ...(params.opening === undefined ? {} : { opening: params.opening }),
            ...(params.conflict === undefined ? {} : { conflict: params.conflict }),
            ...(params.key_events === undefined ? {} : { key_events: params.key_events }),
            ...(params.ending === undefined ? {} : { ending: params.ending }),
            ...(params.ending_hook === undefined ? {} : { ending_hook: params.ending_hook }),
          }
          return result(service.createChapterOutline(input))
        }
        case 'update_chapter_outline': {
          const input: UpdateChapterOutlineInput = {
            ...(params.volume_id === undefined ? {} : { volume_id: params.volume_id }),
            ...(params.chapter_number === undefined ? {} : { chapter_number: params.chapter_number }),
            ...(params.title === undefined ? {} : { title: params.title }),
            ...(params.summary === undefined ? {} : { summary: params.summary }),
            ...(params.purpose === undefined ? {} : { purpose: params.purpose }),
            ...(params.opening === undefined ? {} : { opening: params.opening }),
            ...(params.conflict === undefined ? {} : { conflict: params.conflict }),
            ...(params.key_events === undefined ? {} : { key_events: params.key_events }),
            ...(params.ending === undefined ? {} : { ending: params.ending }),
            ...(params.ending_hook === undefined ? {} : { ending_hook: params.ending_hook }),
          }
          return result(service.updateChapterOutline(
            projectId,
            requiredString(params.outline_id, 'outline_id'),
            input,
            params.expected_version,
          ))
        }
        case 'confirm_chapter_outline':
          return result(service.confirmChapterOutline(projectId, requiredString(params.outline_id, 'outline_id'), params.expected_version))
        case 'lock_chapter_outline':
          return result(service.lockChapterOutline(projectId, requiredString(params.outline_id, 'outline_id'), params.expected_version))
      }
    },
  }
}

function createNarrativeTool(
  service: WorkbenchService,
  projectId: string,
  schemas: ToolSchemas,
): AgentTool<ToolSchemas['narrative'], ToolDetails> {
  return {
    name: 'narrative_manager',
    label: 'Narrative Manager',
    description: '读取和管理叙事记忆、伏笔、写作技能、章节修订及差异。写入操作需要确认。',
    parameters: schemas.narrative,
    executionMode: 'sequential',
    execute: async (_toolCallId: string, params: NarrativeParameters) => {
      switch (params.action) {
        case 'list_memories': return result(service.narrative.listMemories(projectId))
        case 'list_memory_proposals': return result(service.narrative.listMemoryProposals(projectId))
        case 'list_foreshadows': return result(service.narrative.listForeshadows(projectId))
        case 'list_skills': return result(service.narrative.listSkills(projectId))
        case 'list_revisions': return result(service.narrative.listRevisions(projectId, requiredString(params.chapter_id, 'chapter_id')))
        case 'get_blocks': return result(service.narrative.getChapterBlocks(projectId, requiredString(params.chapter_id, 'chapter_id')))
        case 'approve_memory': return result(service.narrative.approveMemoryProposal(projectId, requiredString(params.proposal_id, 'proposal_id')))
        case 'reject_memory': return result(service.narrative.rejectMemoryProposal(projectId, requiredString(params.proposal_id, 'proposal_id')))
        case 'apply_revision': return result(service.narrative.applyRevision(projectId, requiredString(params.revision_id, 'revision_id')))
        case 'transition_foreshadow': {
          const status = params.status
          if (!status) throw new Error('status is required')
          return result(service.narrative.transitionForeshadow(
            projectId,
            requiredString(params.foreshadow_id, 'foreshadow_id'),
            status as ForeshadowStatus,
            params.note ?? '',
            params.chapter_id ?? null,
          ))
        }
        case 'toggle_skill': {
          if (params.enabled === undefined) throw new Error('enabled is required')
          return result(service.narrative.setSkillEnabled(
            projectId,
            requiredString(params.skill_name, 'skill_name'),
            params.enabled,
          ))
        }
        case 'diff_revisions': return result(service.narrative.diffRevisions(
          projectId,
          requiredString(params.from_revision_id, 'from_revision_id'),
          requiredString(params.to_revision_id, 'to_revision_id'),
        ))
        case 'diff_versions': return result(service.narrative.diffVersions(
          projectId,
          requiredString(params.from_version_id, 'from_version_id'),
          requiredString(params.to_version_id, 'to_version_id'),
        ))
      }
    },
  }
}

function createChapterTool(
  service: WorkbenchService,
  projectId: string,
  schemas: ToolSchemas,
): AgentTool<ToolSchemas['chapter'], ToolDetails> {
  return {
    name: 'chapter_context',
    label: 'Chapter Context',
    description: '读取当前长篇项目的章节列表或指定章节正文。',
    parameters: schemas.chapter,
    execute: async (_toolCallId: string, params: ChapterParameters) => {
      if (params.action === 'list') return result(service.listChapters(projectId))
      return result(service.getChapter(projectId, requiredString(params.chapter_id, 'chapter_id')))
    },
  }
}

function createCreativeTool(
  projectId: string,
  options: NovelAgentToolOptions,
  schemas: ToolSchemas,
): AgentTool<ToolSchemas['creative'], ToolDetails> {
  return {
    name: 'creative_task',
    label: 'Creative Task',
    description: '启动章节生成或章节润色任务，任务会在后台保存进度并支持恢复。',
    parameters: schemas.creative,
    executionMode: 'sequential',
    execute: async (_toolCallId: string, params: CreativeParameters) => {
      if (params.action === 'start_chapter_generation') {
        if (!options.startChapterGeneration) throw new Error('chapter generation is not available')
        const task = options.startChapterGeneration({
          projectId,
          sessionId: options.sessionId,
          chapterOutlineId: requiredString(params.chapter_outline_id, 'chapter_outline_id'),
          chapterId: params.chapter_id,
          autoConfirm: params.auto_confirm,
          llm: options.llm,
        })
        return result({ task_id: task.taskId, status: 'started' })
      }
      if (!options.startChapterPolish) throw new Error('chapter polish is not available')
      const task = options.startChapterPolish({
        projectId,
        sessionId: options.sessionId,
        chapterId: requiredString(params.chapter_id, 'chapter_id'),
        mode: params.mode,
        blockId: params.block_id,
        instruction: params.instruction,
        sourceRevisionId: params.source_revision_id,
        autoApply: params.auto_apply,
        llm: options.llm,
      })
      return result({ task_id: task.taskId, status: 'started' })
    },
  }
}

export async function createNovelAgentTools(
  service: WorkbenchService,
  projectId: string,
  options?: NovelAgentToolOptions,
): Promise<readonly AgentTool[]> {
  const { Type } = await loadTypeBoxRuntime()
  const schemas = createToolSchemas(Type)
  const tools: AgentTool[] = [
    createContextTool(service, projectId, schemas),
    createOutlineTool(service, projectId, schemas),
    createNarrativeTool(service, projectId, schemas),
    createChapterTool(service, projectId, schemas),
  ]
  if (options) tools.push(createCreativeTool(projectId, options, schemas))
  return tools
}
