import type { TaskView } from '../stores/taskStore'

export type ContextTextStage = 'body' | 'summary' | 'fact_check'

export interface ContextTraceRow {
  id: string
  source_kind: string
  source_id: string
  title: string
  reason_code: string
  reason_message: string
  tokens: number
  priority: string
  relevance_score: number
}

export interface ContextBudgetView {
  total_budget: number
  selected_tokens: number
  discarded_tokens: number
  max_output_reserved: number
  system_reserved: number
  available_for_prompt: number
  remaining_tokens: number
}

export interface ContextStageCompileView {
  stage: ContextTextStage
  prompt_version: string
  model: string | null
  temperature: number | null
  max_output_tokens: number | null
  context_budget: number | null
  budget: ContextBudgetView | null
  selected: ContextTraceRow[]
  discarded: ContextTraceRow[]
  /** Only populated when uiDebug is true and the stored trace contains final_prompt. */
  final_prompt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function splitSourceId(id: string, source: string): string {
  const prefix = `${source}:`
  if (id.startsWith(prefix)) return id.slice(prefix.length)
  return id
}

function parseTraceRow(value: unknown): ContextTraceRow | null {
  if (!isRecord(value)) return null
  const id = readString(value.id)
  const source = readString(value.source)
  if (!id || !source) return null
  const reason = isRecord(value.reason) ? value.reason : {}
  return {
    id,
    source_kind: source,
    source_id: splitSourceId(id, source),
    title: readString(value.title, id),
    reason_code: readString(reason.code, 'unknown'),
    reason_message: readString(reason.message, ''),
    tokens: readNumber(value.estimated_tokens) ?? 0,
    priority: readString(value.priority, ''),
    relevance_score: readNumber(value.relevance_score) ?? 0,
  }
}

function parseBudget(value: unknown): ContextBudgetView | null {
  if (!isRecord(value)) return null
  const total_budget = readNumber(value.total_budget)
  const selected_tokens = readNumber(value.selected_tokens)
  const max_output_reserved = readNumber(value.max_output_reserved)
  if (total_budget == null || selected_tokens == null || max_output_reserved == null) return null
  return {
    total_budget,
    selected_tokens,
    discarded_tokens: readNumber(value.discarded_tokens) ?? 0,
    max_output_reserved,
    system_reserved: readNumber(value.system_reserved) ?? 0,
    available_for_prompt: readNumber(value.available_for_prompt) ?? 0,
    remaining_tokens: readNumber(value.remaining_tokens) ?? 0,
  }
}

/**
 * Parse one stage compile snapshot from checkpoint/result JSON.
 * When uiDebug is false, final_prompt is always null even if present in raw data.
 */
export function parseStageCompileView(
  stage: ContextTextStage,
  raw: unknown,
  uiDebug: boolean,
): ContextStageCompileView | null {
  if (!isRecord(raw)) return null
  const modelParams = isRecord(raw.model_params) ? raw.model_params : {}
  const trace = isRecord(raw.trace) ? raw.trace : null
  if (!trace) return null

  const selectedRaw = Array.isArray(trace.selected) ? trace.selected : []
  const discardedRaw = Array.isArray(trace.discarded) ? trace.discarded : []
  const selected = selectedRaw
    .map(parseTraceRow)
    .filter((row): row is ContextTraceRow => row !== null)
  const discarded = discardedRaw
    .map(parseTraceRow)
    .filter((row): row is ContextTraceRow => row !== null)

  const metadata = isRecord(trace.metadata) ? trace.metadata : {}
  const prompt_version =
    readString(raw.prompt_version) ||
    readString(metadata.prompt_version) ||
    'unknown'

  // Hard gate: never surface final_prompt unless the UI debug switch is on.
  let final_prompt: string | null = null
  if (uiDebug === true && typeof trace.final_prompt === 'string' && trace.final_prompt.length > 0) {
    final_prompt = trace.final_prompt
  }

  return {
    stage,
    prompt_version,
    model:
      typeof modelParams.model === 'string'
        ? modelParams.model
        : typeof metadata.model === 'string'
          ? metadata.model
          : null,
    temperature: readNumber(modelParams.temperature) ?? readNumber(metadata.temperature),
    max_output_tokens:
      readNumber(modelParams.max_output_tokens) ?? readNumber(metadata.max_output_tokens),
    context_budget:
      readNumber(modelParams.context_budget) ?? readNumber(metadata.context_budget),
    budget: parseBudget(trace.budget),
    selected,
    discarded,
    final_prompt,
  }
}

export function readStageCompilesMap(source: unknown): Record<string, unknown> | null {
  if (!isRecord(source)) return null
  if (isRecord(source.stage_compiles)) return source.stage_compiles
  return null
}

/** Prefer live checkpoint, then task result (both may carry stage_compiles). */
export function extractStageCompilesSource(task: TaskView | null): unknown {
  if (!task) return null
  const fromCheckpoint = readStageCompilesMap(task.checkpoint)
  if (fromCheckpoint && Object.keys(fromCheckpoint).length > 0) return fromCheckpoint
  const fromResult = readStageCompilesMap(task.result)
  if (fromResult && Object.keys(fromResult).length > 0) return fromResult
  return null
}

export function buildStageCompileViews(
  task: TaskView | null,
  uiDebug: boolean,
): ContextStageCompileView[] {
  const map = extractStageCompilesSource(task)
  if (!isRecord(map)) return []
  const stages: ContextTextStage[] = ['body', 'summary', 'fact_check']
  return stages
    .map((stage) => parseStageCompileView(stage, map[stage], uiDebug))
    .filter((view): view is ContextStageCompileView => view !== null)
}

export function taskChapterOutlineIdFromInput(task: TaskView): string | null {
  const request = task.input?.request
  if (!isRecord(request)) return null
  const outlineId = request.chapter_outline_id
  return typeof outlineId === 'string' && outlineId.trim() ? outlineId : null
}

/**
 * Resolve the chapter-generation task whose compiler trace should be shown:
 * active running task first, otherwise the most recently updated generation task
 * for the selected outline (or any generation task if no outline filter).
 */
export function selectContextCompilerTask(
  tasks: readonly TaskView[],
  activeTaskId: string | null,
  chapterOutlineId: string | undefined,
): TaskView | null {
  const generation = tasks.filter((task) => task.task_type === 'chapter-generation')
  if (activeTaskId) {
    const active = generation.find((task) => task.id === activeTaskId)
    if (active) return active
  }
  const scoped = chapterOutlineId
    ? generation.filter((task) => taskChapterOutlineIdFromInput(task) === chapterOutlineId)
    : generation
  const pool = scoped.length > 0 ? scoped : generation
  if (pool.length === 0) return null
  return [...pool].sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null
}
