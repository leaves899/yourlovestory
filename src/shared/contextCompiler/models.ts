import type { JsonObject } from '../novelProject'
import type { TOKEN_ESTIMATION_METHOD } from './tokenEstimate'

export type ContextTaskKind = 'chapter_body' | 'outline' | 'summary' | 'fact_check'

export type ContextSourceKind =
  | 'system_prompt'
  | 'task_instruction'
  | 'project_config'
  | 'volume_goal'
  | 'chapter_goal'
  | 'character'
  | 'relation'
  | 'worldview'
  | 'source_material'
  | 'prior_chapter_summary'
  | 'recent_body'
  | 'narrative_memory'
  | 'foreshadow'
  | 'stage_body'
  | 'continuation'

export type ContextPriority = 'required' | 'high' | 'medium' | 'low'

export type ContextDiscardReasonCode =
  | 'below_relevance_threshold'
  | 'budget_exhausted'
  | 'strategy_excluded'
  | 'duplicate'
  | 'status_filtered'
  | 'capacity_limit'

export type ContextSelectReasonCode =
  | 'required_by_strategy'
  | 'high_relevance'
  | 'within_budget'
  | 'priority_slot'
  | 'explicit_selection'

export interface ContextReason {
  code: ContextSelectReasonCode | ContextDiscardReasonCode
  message: string
}

export interface ContextCandidate {
  id: string
  source: ContextSourceKind
  title: string
  content: string
  priority: ContextPriority
  relevance_score: number
  /** Stable secondary sort key; higher first when scores tie. */
  importance: number
  metadata: JsonObject
}

export interface ContextTraceItem {
  id: string
  source: ContextSourceKind
  title: string
  priority: ContextPriority
  relevance_score: number
  importance: number
  estimated_tokens: number
  reason: ContextReason
}

export interface ContextBudgetSummary {
  total_budget: number
  system_reserved: number
  max_output_reserved: number
  available_for_prompt: number
  selected_tokens: number
  discarded_tokens: number
  remaining_tokens: number
  estimation_method: typeof TOKEN_ESTIMATION_METHOD
  estimation_note: string
}

export interface PromptSection {
  id: string
  source: ContextSourceKind
  title: string
  content: string
  estimated_tokens: number
}

export interface PromptStructure {
  sections: PromptSection[]
  joined_prompt: string
  estimated_tokens: number
}

export interface PromptMetadata {
  prompt_version: string
  task_kind: ContextTaskKind
  strategy_id: string
  model: string | null
  temperature: number | null
  max_output_tokens: number | null
  context_budget: number | null
}

export interface ContextCompileTrace {
  task_kind: ContextTaskKind
  selected: ContextTraceItem[]
  discarded: ContextTraceItem[]
  budget: ContextBudgetSummary
  warnings: string[]
  errors: string[]
  metadata: PromptMetadata
  /** Full joined prompt; only set when input.debug is true. */
  final_prompt?: string
}

export interface CompiledContext {
  task_kind: ContextTaskKind
  /** Full prompt for LLM invocation (main-process only). */
  prompt: string
  selected: ContextTraceItem[]
  discarded: ContextTraceItem[]
  budget: ContextBudgetSummary
  warnings: string[]
  errors: string[]
  metadata: PromptMetadata
  /** Present only when input.debug is true. */
  prompt_structure: PromptStructure | null
  trace: ContextCompileTrace
}

export interface ContextBudgetInput {
  /** Total context window tokens (inclusive of system + output reserve). */
  total: number
  max_output_tokens: number
  /** Fixed system / agent prompt text reserved before user context. */
  system_prompt?: string
  /** Override system reserved tokens; takes precedence over system_prompt estimate. */
  system_reserved_tokens?: number
}

export interface ContextModelParams {
  model?: string | null
  temperature?: number | null
  max_output_tokens?: number | null
  context_budget?: number | null
}

export interface ContextProjectSnapshot {
  id: string
  name: string
  genre: string
  tone: string
  target_words: number | null
  description?: string
}

export interface ContextVolumeSnapshot {
  id: string
  title: string
  synopsis: string
  volume_number: number
}

export interface ContextVolumeOutlineSnapshot {
  id: string
  summary: string
  theme: string
  main_conflict: string
  key_turning_points: string[]
  ending: string
}

export interface ContextChapterOutlineSnapshot {
  id: string
  chapter_number: number
  title: string
  summary: string
  purpose: string
  opening: string
  conflict: string
  key_events: string[]
  ending: string
  ending_hook: string
}

export interface ContextCharacterSnapshot {
  id: string
  name: string
  role: string
  notes: string
  profile_text: string
}

export interface ContextRelationSnapshot {
  id: string
  relation_type: string
  description: string
  source_label: string
  target_label: string
  strength: number | null
}

export interface ContextWorldviewSnapshot {
  id: string
  category: string
  title: string
  content: string
}

export interface ContextSourceMaterialSnapshot {
  id: string
  title: string
  material_type: string
  content: string
  /** True when material was explicitly selected on volume/chapter outline. */
  explicitly_selected: boolean
}

export interface ContextPriorChapterSnapshot {
  id: string
  chapter_number: number
  title: string
  synopsis: string
  content: string
  status: string
}

export interface ContextNarrativeMemorySnapshot {
  id: string
  memory_type: string
  title: string
  content: string
  importance: number
  status: string
  /** Approved memory evidence lines; empty when none. */
  evidence: readonly string[]
}

export interface ContextForeshadowSnapshot {
  id: string
  title: string
  description: string
  status: string
  importance: number
  /** Optional evidence lines extracted from domain metadata when present. */
  evidence: readonly string[]
}

export interface ContextStagePayload {
  /** Generated chapter body used by summary / fact_check. */
  body?: string
  /** Partial text already generated for continuation. */
  existing_text?: string
}

/**
 * Unified, I/O-free input package for the Context Compiler.
 * Callers assemble real domain data; the compiler never touches SQLite or files.
 */
export interface ContextCompilerInput {
  task_kind: ContextTaskKind
  project: ContextProjectSnapshot
  volume?: ContextVolumeSnapshot | null
  volume_outline?: ContextVolumeOutlineSnapshot | null
  chapter_outline?: ContextChapterOutlineSnapshot | null
  characters?: readonly ContextCharacterSnapshot[]
  relations?: readonly ContextRelationSnapshot[]
  worldview_entries?: readonly ContextWorldviewSnapshot[]
  source_materials?: readonly ContextSourceMaterialSnapshot[]
  prior_chapters?: readonly ContextPriorChapterSnapshot[]
  narrative_memories?: readonly ContextNarrativeMemorySnapshot[]
  foreshadows?: readonly ContextForeshadowSnapshot[]
  stage?: ContextStagePayload
  budget: ContextBudgetInput
  model_params?: ContextModelParams
  /** When true, include prompt_structure with full section contents. */
  debug?: boolean
  /** Optional extra fixed instruction appended as required task text. */
  extra_instruction?: string
}

export interface SourceCapacity {
  source: ContextSourceKind
  max_items: number | null
}

export interface ContextTaskStrategy {
  id: string
  task_kind: ContextTaskKind
  /** Sources that may appear as candidates for this task. */
  allowed_sources: readonly ContextSourceKind[]
  /** Sources that must fit entirely or compilation throws. */
  required_sources: readonly ContextSourceKind[]
  /** Optional per-source item caps after relevance sort. */
  capacities: readonly SourceCapacity[]
  /** Minimum relevance (0–1) for optional candidates; required ignore this. */
  min_relevance: number
  /** Prefer more recent prior chapters when scoring recent_body. */
  recent_body_chapter_limit: number
  /** Max characters kept per recent body candidate before token estimate. */
  recent_body_char_limit: number
  /** Max prior summaries considered as candidates. */
  prior_summary_limit: number
}
