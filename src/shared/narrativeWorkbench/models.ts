import type { JsonObject } from '../novelProject'

export type NarrativeMemoryType =
  | 'fact'
  | 'event'
  | 'relationship'
  | 'character'
  | 'worldview'
  | 'emotion'
  | 'theme'
  | 'custom'

export type NarrativeMemoryStatus = 'proposed' | 'approved' | 'rejected' | 'archived'
export type MemoryProposalStatus = 'proposed' | 'approved' | 'rejected'

export interface NarrativeMemory {
  id: string
  project_id: string
  memory_type: NarrativeMemoryType
  title: string
  content: string
  source_chapter_id: string | null
  source_version_id: string | null
  importance: number
  status: NarrativeMemoryStatus
  evidence: string[]
  metadata: JsonObject
  created_at: string
  updated_at: string
}

export interface CreateNarrativeMemoryInput {
  id?: string
  project_id: string
  memory_type: NarrativeMemoryType
  title: string
  content?: string
  source_chapter_id?: string | null
  source_version_id?: string | null
  importance?: number
  status?: NarrativeMemoryStatus
  evidence?: string[]
  metadata?: JsonObject
}

export interface NarrativeMemoryProposal {
  id: string
  project_id: string
  source_chapter_id: string | null
  source_version_id: string | null
  memory_type: NarrativeMemoryType
  title: string
  content: string
  confidence: number
  status: MemoryProposalStatus
  evidence: string[]
  metadata: JsonObject
  created_at: string
  updated_at: string
}

export interface CreateNarrativeMemoryProposalInput {
  id?: string
  project_id: string
  source_chapter_id?: string | null
  source_version_id?: string | null
  memory_type: NarrativeMemoryType
  title: string
  content?: string
  confidence?: number
  evidence?: string[]
  metadata?: JsonObject
}

export type ForeshadowStatus =
  | 'suggested'
  | 'planned'
  | 'planted'
  | 'active'
  | 'revealed'
  | 'paid_off'
  | 'resolved'
  | 'abandoned'

export type ForeshadowEventType =
  | 'suggested'
  | 'planned'
  | 'planted'
  | 'activated'
  | 'revealed'
  | 'paid_off'
  | 'resolved'
  | 'abandoned'
  | 'note'

export interface Foreshadow {
  id: string
  project_id: string
  title: string
  description: string
  status: ForeshadowStatus
  planned_payoff_chapter_id: string | null
  actual_payoff_chapter_id: string | null
  importance: number
  metadata: JsonObject
  created_at: string
  updated_at: string
}

export interface CreateForeshadowInput {
  id?: string
  project_id: string
  title: string
  description?: string
  status?: ForeshadowStatus
  planned_payoff_chapter_id?: string | null
  actual_payoff_chapter_id?: string | null
  importance?: number
  metadata?: JsonObject
}

export interface ForeshadowEvent {
  id: string
  foreshadow_id: string
  chapter_id: string | null
  event_type: ForeshadowEventType
  note: string
  created_at: string
}

export interface ForeshadowSuggestion {
  title: string
  description: string
  importance: number
  planned_payoff_chapter_id: string | null
  evidence: string[]
}

export type ChapterBlockKind = 'heading' | 'paragraph'

export interface ChapterBlock {
  id: string
  ordinal: number
  kind: ChapterBlockKind
  text: string
  fingerprint: string
}

export interface ChapterBlockChange {
  block_id: string
  kind: 'unchanged' | 'added' | 'removed' | 'modified'
  before: ChapterBlock | null
  after: ChapterBlock | null
}

export interface ChapterDiff {
  changes: ChapterBlockChange[]
  unchanged_count: number
  added_count: number
  removed_count: number
  modified_count: number
}

export type ChapterRevisionOperation =
  | 'manual'
  | 'paragraph_revision'
  | 'polish'
  | 'fallback'

export interface ChapterRevision {
  id: string
  chapter_id: string
  parent_revision_id: string | null
  task_id: string | null
  revision_number: number
  content: string
  summary: string
  reason: string
  operation: ChapterRevisionOperation
  blocks: ChapterBlock[]
  is_current: boolean
  created_at: string
}

export interface CreateChapterRevisionInput {
  id?: string
  chapter_id: string
  parent_revision_id?: string | null
  task_id?: string | null
  content: string
  summary?: string
  reason?: string
  operation?: ChapterRevisionOperation
  blocks: ChapterBlock[]
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  version: string
  prompt_template: string
  config_schema: JsonObject
  created_at: string
  updated_at: string
}

export interface ProjectSkill {
  project_id: string
  skill_id: string
  enabled: boolean
  config: JsonObject
  created_at: string
  updated_at: string
}

export interface ProjectSkillState extends SkillDefinition {
  project_id: string
  enabled: boolean
  config: JsonObject
}

export type PostprocessReportType = 'chapter-polish' | 'paragraph-revision'
export type PostprocessReportStatus = 'pending' | 'completed' | 'fallback' | 'failed'

export interface PostprocessReport {
  id: string
  project_id: string
  chapter_id: string | null
  task_id: string | null
  report_type: PostprocessReportType
  status: PostprocessReportStatus
  summary: string
  details: JsonObject
  created_at: string
}

export interface CreatePostprocessReportInput {
  id?: string
  project_id: string
  chapter_id?: string | null
  task_id?: string | null
  report_type: PostprocessReportType
  status: PostprocessReportStatus
  summary?: string
  details?: JsonObject
}

export interface NarrativeTextGenerationRequest {
  operation: 'memory-extraction' | 'foreshadow-suggestion' | 'paragraph-revision' | 'chapter-polish'
  prompt: string
  signal: AbortSignal
  existing_text?: string
  on_chunk?: (chunk: string) => void
}

export interface NarrativeTextGenerationResult {
  text: string
}

export interface NarrativeTextGenerator {
  generate(request: NarrativeTextGenerationRequest): Promise<NarrativeTextGenerationResult>
}

export interface NarrativeRunOptions {
  signal?: AbortSignal
  existing_text?: string
  on_chunk?: (operation: NarrativeTextGenerationRequest['operation'], chunk: string) => void
  on_checkpoint?: (checkpoint: NarrativeOperationCheckpoint) => void
}

export interface NarrativeOperationCheckpoint {
  schema_version: number
  operation: 'paragraph_revision' | 'chapter_polish'
  source_content: string
  generated_content: string
  revision_id: string | null
  status: 'running' | 'completed' | 'fallback' | 'cancelled'
  error: string | null
  applied?: boolean
  updated_at?: string
}

export interface ParagraphRevisionOptions extends NarrativeRunOptions {
  generator?: NarrativeTextGenerator
  task_id?: string | null
}

export interface ChapterPolishOptions extends NarrativeRunOptions {
  source_revision_id?: string | null
  instruction?: string
  generator?: NarrativeTextGenerator
  task_id?: string | null
}

export interface ChapterRevisionOperationResult {
  status: 'completed' | 'fallback' | 'cancelled'
  content: string
  revision: ChapterRevision | null
  diff: ChapterDiff
  report: PostprocessReport | null
  error: string | null
}

export interface MemoryExtractionOptions extends NarrativeRunOptions {
  content?: string
  source_version_id?: string | null
  generator?: NarrativeTextGenerator
}

export interface MemoryExtractionResult {
  proposals: NarrativeMemoryProposal[]
  used_fallback: boolean
  error: string | null
}

export interface ForeshadowSuggestionOptions extends NarrativeRunOptions {
  content?: string
  ending_hook?: string
  planned_payoff_chapter_id?: string | null
  generator?: NarrativeTextGenerator
}

export interface ForeshadowSuggestionResult {
  suggestions: Foreshadow[]
  used_fallback: boolean
  error: string | null
}
