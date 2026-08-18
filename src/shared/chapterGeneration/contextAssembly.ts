import type {
  Character,
  JsonObject,
  JsonValue,
  Relation,
  SourceMaterial,
  WorldviewEntry,
} from '../novelProject'
import type { Foreshadow, NarrativeMemory } from '../narrativeWorkbench'
import type {
  ContextCharacterSnapshot,
  ContextCompilerInput,
  ContextForeshadowSnapshot,
  ContextNarrativeMemorySnapshot,
  ContextPriorChapterSnapshot,
  ContextRelationSnapshot,
  ContextSourceMaterialSnapshot,
  ContextTaskKind,
  ContextWorldviewSnapshot,
} from '../contextCompiler'
import type {
  Chapter,
  ChapterGenerationModelParams,
  ChapterGenerationPreparation,
  ChapterGenerationRequest,
  ChapterGenerationTextStage,
} from './models'

/** Defaults mirror agent/llm config without importing main/agent into shared. */
export const CHAPTER_GENERATION_DEFAULT_CONTEXT_BUDGET = 64_000
export const CHAPTER_GENERATION_DEFAULT_MAX_OUTPUT_TOKENS = 4_096

export const CHAPTER_GENERATION_SYSTEM_PROMPT =
  '你负责依据已确认的长篇大纲生成章节，不执行大纲修改，不生成叙事记忆。'

const TERMINAL_FORESHADOW = new Set([
  'revealed',
  'paid_off',
  'resolved',
  'abandoned',
])

const STAGE_TO_TASK: Record<ChapterGenerationTextStage, ContextTaskKind> = {
  body: 'chapter_body',
  summary: 'summary',
  fact_check: 'fact_check',
}

const STAGE_EXTRA_INSTRUCTION: Record<ChapterGenerationTextStage, string> = {
  body: '输出正文，不要输出标题、解释或事实核查报告。若存在已生成片段，请从其后继续且不要重复。',
  summary: '只输出摘要文本，不添加新事实，不要输出标题或解释。',
  fact_check:
    '严格输出 JSON：{"passed":true或false,"summary":"摘要","findings":[{"claim":"事实","status":"supported|unclear|contradicted","severity":"info|warning|error","evidence":"依据","suggestion":"可执行的修改建议，可省略"}]}。只检查可由输入验证的事实，不评价文风。',
}

export function resolveGenerationModelParams(
  request: ChapterGenerationRequest,
): ChapterGenerationModelParams {
  const raw = request.model_params
  const max_output_tokens =
    raw?.max_output_tokens != null && raw.max_output_tokens > 0
      ? Math.floor(raw.max_output_tokens)
      : CHAPTER_GENERATION_DEFAULT_MAX_OUTPUT_TOKENS
  const context_budget =
    raw?.context_budget != null && raw.context_budget > 0
      ? Math.floor(raw.context_budget)
      : CHAPTER_GENERATION_DEFAULT_CONTEXT_BUDGET
  return {
    model: raw?.model ?? null,
    temperature: raw?.temperature ?? null,
    max_output_tokens,
    context_budget,
  }
}

function profileText(profile: JsonObject): string {
  const keys = Object.keys(profile)
  if (keys.length === 0) return ''
  try {
    return JSON.stringify(profile)
  } catch {
    return ''
  }
}

function mapCharacters(characters: readonly Character[]): ContextCharacterSnapshot[] {
  return characters.map((character) => ({
    id: character.id,
    name: character.name,
    role: character.role,
    notes: character.notes,
    profile_text: profileText(character.profile),
  }))
}

function endpointLabel(
  type: string,
  id: string,
  characters: readonly Character[],
): string {
  if (type === 'character') {
    const found = characters.find((item) => item.id === id)
    if (found) return found.name
  }
  return `${type}:${id}`
}

function mapRelations(
  relations: readonly Relation[],
  characters: readonly Character[],
): ContextRelationSnapshot[] {
  return relations.map((relation) => ({
    id: relation.id,
    relation_type: relation.relation_type,
    description: relation.description,
    source_label: endpointLabel(
      relation.source_entity_type,
      relation.source_entity_id,
      characters,
    ),
    target_label: endpointLabel(
      relation.target_entity_type,
      relation.target_entity_id,
      characters,
    ),
    strength: relation.strength,
  }))
}

function mapWorldview(entries: readonly WorldviewEntry[]): ContextWorldviewSnapshot[] {
  return entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    title: entry.title,
    content: entry.content,
  }))
}

function mapSourceMaterials(
  materials: readonly SourceMaterial[],
): ContextSourceMaterialSnapshot[] {
  return materials.map((material) => ({
    id: material.id,
    title: material.title,
    material_type: material.material_type,
    content: material.content,
    explicitly_selected: true,
  }))
}

/**
 * Only adopted (completed) chapters may feed prior summaries / recent body.
 * planned / drafting / review must not leak into the next chapter's context.
 */
export function mapPriorChapters(
  chapters: readonly Chapter[],
  beforeChapterNumber: number,
): ContextPriorChapterSnapshot[] {
  return chapters
    .filter(
      (chapter) =>
        chapter.chapter_number < beforeChapterNumber && chapter.status === 'completed',
    )
    .map((chapter) => ({
      id: chapter.id,
      chapter_number: chapter.chapter_number,
      title: chapter.title,
      synopsis: chapter.synopsis,
      content: chapter.content,
      status: chapter.status,
    }))
}

/** Extract string[] evidence from JsonObject metadata without unsafe casts. */
function evidenceFromMetadata(metadata: JsonObject): string[] {
  const raw: JsonValue | undefined = metadata.evidence
  if (!Array.isArray(raw)) return []
  const lines: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const trimmed = item.trim()
    if (trimmed.length > 0) lines.push(trimmed)
  }
  return lines
}

function sanitizeMemoryEvidence(evidence: readonly string[] | undefined): string[] {
  if (!evidence || evidence.length === 0) return []
  return evidence
    .filter((line): line is string => typeof line === 'string')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

export function filterApprovedMemories(
  memories: readonly NarrativeMemory[],
): ContextNarrativeMemorySnapshot[] {
  return memories
    .filter((memory) => memory.status === 'approved')
    .map((memory) => ({
      id: memory.id,
      memory_type: memory.memory_type,
      title: memory.title,
      content: memory.content,
      importance: memory.importance,
      status: memory.status,
      evidence: sanitizeMemoryEvidence(memory.evidence),
    }))
}

export function filterOpenForeshadows(
  foreshadows: readonly Foreshadow[],
): ContextForeshadowSnapshot[] {
  return foreshadows
    .filter((item) => !TERMINAL_FORESHADOW.has(item.status))
    .map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      importance: item.importance,
      evidence: evidenceFromMetadata(item.metadata),
    }))
}

export interface AssembleCompilerInputArgs {
  preparation: ChapterGenerationPreparation
  stage: ChapterGenerationTextStage
  request: ChapterGenerationRequest
  modelParams: ChapterGenerationModelParams
  priorChapters: readonly ContextPriorChapterSnapshot[]
  narrativeMemories: readonly ContextNarrativeMemorySnapshot[]
  foreshadows: readonly ContextForeshadowSnapshot[]
  /** Generated chapter body for summary / fact_check. */
  body?: string
  /** Partial text already generated for the current stage. */
  existingText?: string
}

export function assembleContextCompilerInput(args: AssembleCompilerInputArgs): ContextCompilerInput {
  const {
    preparation,
    stage,
    request,
    modelParams,
    priorChapters,
    narrativeMemories,
    foreshadows,
    body,
    existingText,
  } = args
  const { project, config, volume, volume_outline: volumeOutline, chapter_outline: chapterOutline } =
    preparation
  const context = preparation.outline_context
  const systemPrompt = request.system_prompt?.trim() || CHAPTER_GENERATION_SYSTEM_PROMPT

  const input: ContextCompilerInput = {
    task_kind: STAGE_TO_TASK[stage],
    project: {
      id: project.id,
      name: project.name,
      genre: config.genre,
      tone: config.tone,
      target_words: config.target_words,
      description: project.description,
    },
    volume: {
      id: volume.id,
      title: volume.title,
      synopsis: volume.synopsis,
      volume_number: volume.volume_number,
    },
    volume_outline: {
      id: volumeOutline.id,
      summary: volumeOutline.summary,
      theme: volumeOutline.theme,
      main_conflict: volumeOutline.main_conflict,
      key_turning_points: volumeOutline.key_turning_points,
      ending: volumeOutline.ending,
    },
    chapter_outline: {
      id: chapterOutline.id,
      chapter_number: chapterOutline.chapter_number,
      title: chapterOutline.title,
      summary: chapterOutline.summary,
      purpose: chapterOutline.purpose,
      opening: chapterOutline.opening,
      conflict: chapterOutline.conflict,
      key_events: chapterOutline.key_events,
      ending: chapterOutline.ending,
      ending_hook: chapterOutline.ending_hook,
    },
    characters: mapCharacters(context.characters),
    relations: mapRelations(context.relations, context.characters),
    worldview_entries: mapWorldview(context.worldview_entries),
    source_materials: mapSourceMaterials(context.selected_source_materials),
    prior_chapters: [...priorChapters],
    narrative_memories: [...narrativeMemories],
    foreshadows: [...foreshadows],
    stage: {
      ...(body != null && body.length > 0 ? { body } : {}),
      ...(existingText != null && existingText.length > 0 ? { existing_text: existingText } : {}),
    },
    budget: {
      total: modelParams.context_budget,
      max_output_tokens: modelParams.max_output_tokens,
      system_prompt: systemPrompt,
    },
    model_params: {
      model: modelParams.model,
      temperature: modelParams.temperature,
      max_output_tokens: modelParams.max_output_tokens,
      context_budget: modelParams.context_budget,
    },
    debug: request.debug === true,
    extra_instruction: STAGE_EXTRA_INSTRUCTION[stage],
  }

  return input
}
