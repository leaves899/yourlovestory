import type {
  ChapterOutline,
  OutlineContext,
  Project,
  ProjectConfig,
  Volume,
  VolumeOutline,
} from '../novelProject'
import type { ContextCompileTrace } from '../contextCompiler'

export type ChapterStatus = 'planned' | 'drafting' | 'review' | 'completed'

export interface Chapter {
  id: string
  project_id: string
  arc_id: string | null
  chapter_number: number
  title: string
  status: ChapterStatus
  synopsis: string
  content: string
  target_words: number | null
  actual_words: number | null
  version: number
  created_at: string
  updated_at: string
}

export interface CreateChapterInput {
  id?: string
  project_id: string
  arc_id?: string | null
  chapter_number: number
  title?: string
  status?: ChapterStatus
  synopsis?: string
  content?: string
  target_words?: number | null
  actual_words?: number | null
}

export interface UpdateChapterInput {
  arc_id?: string | null
  chapter_number?: number
  title?: string
  status?: ChapterStatus
  synopsis?: string
  content?: string
  target_words?: number | null
  actual_words?: number | null
}

export type ChapterVersionStatus = 'review' | 'approved' | 'rejected'

export type FactCheckFindingStatus = 'supported' | 'unclear' | 'contradicted'
export type FactCheckSeverity = 'info' | 'warning' | 'error'

export interface FactCheckFinding {
  claim: string
  status: FactCheckFindingStatus
  severity: FactCheckSeverity
  evidence: string
  suggestion?: string
}

export interface FactCheckReport {
  passed: boolean
  summary: string
  findings: FactCheckFinding[]
}

export function hasBlockingFactCheckFinding(
  findings: readonly FactCheckFinding[],
): boolean {
  return findings.some((finding) => finding.severity === 'error')
}

export interface ChapterVersion {
  id: string
  chapter_id: string
  task_id: string | null
  version_number: number
  content: string
  summary: string
  fact_check: FactCheckReport
  status: ChapterVersionStatus
  is_current: boolean
  created_at: string
  reviewed_at: string | null
  confirmed_at: string | null
}

export interface CreateChapterVersionInput {
  id?: string
  chapter_id: string
  task_id?: string | null
  content: string
  summary: string
  fact_check: FactCheckReport
}

export type ChapterGenerationStage = 'body' | 'summary' | 'fact_check' | 'saving' | 'review'

export type ChapterGenerationTextStage = Exclude<ChapterGenerationStage, 'saving' | 'review'>

/** Resolved model parameters used for context budget and generation. */
export interface ChapterGenerationModelParams {
  model: string | null
  temperature: number | null
  max_output_tokens: number
  context_budget: number
}

/** Per-stage compiler output persisted on checkpoints for resume/retry. */
export interface ChapterGenerationStageCompile {
  prompt_version: string
  model_params: ChapterGenerationModelParams
  /** Full compile trace; final_prompt only present when request.debug === true. */
  trace: ContextCompileTrace
}

export interface ChapterGenerationCheckpoint {
  stage: ChapterGenerationStage
  body: string
  summary: string
  fact_check_text: string
  fact_check: FactCheckReport | null
  version_id: string | null
  updated_at?: string
  /** Compiler traces + model params + prompt version for each completed/running text stage. */
  stage_compiles?: Partial<Record<ChapterGenerationTextStage, ChapterGenerationStageCompile>>
}

export interface ChapterGenerationRequest {
  project_id: string
  chapter_outline_id: string
  chapter_id?: string
  auto_confirm?: boolean
  task_id?: string
  /** When true, compiler traces include final_prompt and prompt_structure. */
  debug?: boolean
  /** Resolved LLM parameters; context_budget/max_output_tokens drive hard budget. */
  model_params?: Partial<ChapterGenerationModelParams> & {
    model?: string | null
    temperature?: number | null
  }
  /** Agent system prompt text reserved from the context window. */
  system_prompt?: string
}

export interface ChapterGenerationPreparation {
  project: Project
  config: ProjectConfig
  volume: Volume
  volume_outline: VolumeOutline
  chapter_outline: ChapterOutline
  outline_context: OutlineContext
  chapter: Chapter
}

export interface TextGenerationRequest {
  stage: ChapterGenerationTextStage
  prompt: string
  signal: AbortSignal
  existing_text?: string
  on_chunk?: (chunk: string) => void
}

export interface TextGenerationResult {
  text: string
}

export interface TextGenerator {
  generate(request: TextGenerationRequest): Promise<TextGenerationResult>
}

export interface ChapterGenerationCallbacks {
  on_stage?: (stage: ChapterGenerationStage, progress: number) => void
  on_chunk?: (stage: ChapterGenerationTextStage, chunk: string) => void
  on_checkpoint?: (checkpoint: ChapterGenerationCheckpoint) => void
  on_review?: (version: ChapterVersion, required: boolean) => void
}

export interface ChapterGenerationResult {
  status: 'completed' | 'cancelled'
  chapter: Chapter
  version: ChapterVersion | null
  checkpoint: ChapterGenerationCheckpoint
  auto_confirmed: boolean
}

export function emptyFactCheckReport(): FactCheckReport {
  return { passed: false, summary: '', findings: [] }
}

export function emptyChapterGenerationCheckpoint(): ChapterGenerationCheckpoint {
  return {
    stage: 'body',
    body: '',
    summary: '',
    fact_check_text: '',
    fact_check: null,
    version_id: null,
    stage_compiles: {},
  }
}
