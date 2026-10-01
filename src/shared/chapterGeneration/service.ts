import {
  ChapterGenerationBoundaryError,
  ChapterVersionStatusTransitionError,
  EntityNotFoundError,
} from '../novelProject'
import type { JsonObject, JsonValue } from '../novelProject'
import {
  compileContext,
  ContextBudgetExceededError,
  CONTEXT_PROMPT_VERSION,
  type CompiledContext,
  type ContextCompilerInput,
  type ContextCompileTrace,
  type ContextTraceItem,
} from '../contextCompiler'
import type {
  ChapterGenerationForeshadowPort,
  ChapterGenerationMemoryPort,
  ChapterGenerationProjectPort,
  ChapterStore,
  ChapterVersionStore,
} from './ports'
import {
  assembleContextCompilerInput,
  filterApprovedMemories,
  filterOpenForeshadows,
  mapPriorChapters,
  resolveGenerationModelParams,
} from './contextAssembly'
import {
  emptyChapterGenerationCheckpoint,
  emptyFactCheckReport,
  hasBlockingFactCheckFinding,
  type Chapter,
  type ChapterGenerationCallbacks,
  type ChapterGenerationCheckpoint,
  type ChapterGenerationModelParams,
  type ChapterGenerationPreparation,
  type ChapterGenerationRequest,
  type ChapterGenerationResult,
  type ChapterGenerationStage,
  type ChapterGenerationStageCompile,
  type ChapterGenerationTextStage,
  type ChapterVersion,
  type FactCheckFinding,
  type FactCheckReport,
  type TextGenerationResult,
  type TextGenerator,
} from './models'

export type ContextCompute = (
  input: ContextCompilerInput,
  options?: { signal?: AbortSignal },
) => Promise<CompiledContext>

export interface ChapterGenerationServiceOptions {
  project: ChapterGenerationProjectPort
  chapters: ChapterStore
  versions: ChapterVersionStore
  memories?: ChapterGenerationMemoryPort
  foreshadows?: ChapterGenerationForeshadowPort
  computeContext?: ContextCompute
  now?: () => string
}

export interface ChapterGenerationRunOptions {
  signal: AbortSignal
  checkpoint?: ChapterGenerationCheckpoint
  callbacks?: ChapterGenerationCallbacks
  /**
   * Optional synchronous commit boundary supplied by a persistent task runner.
   * The main process uses it to fence durable writes with the task lease.
   */
  commit?: <T>(operation: () => T) => T
}

const stableOutlineStatuses = new Set(['confirmed', 'locked'])
const stageOrder: readonly ChapterGenerationStage[] = [
  'body',
  'summary',
  'fact_check',
  'saving',
  'review',
]

function isStage(value: JsonValue | undefined): value is ChapterGenerationStage {
  return typeof value === 'string' && stageOrder.includes(value as ChapterGenerationStage)
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function readNullableString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function readNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseFinding(value: JsonValue): FactCheckFinding | null {
  if (!isRecord(value)) return null
  const status = value.status
  const severity = value.severity
  if (
    typeof value.claim !== 'string' ||
    typeof value.evidence !== 'string' ||
    (status !== 'supported' && status !== 'unclear' && status !== 'contradicted') ||
    (severity !== 'info' && severity !== 'warning' && severity !== 'error')
  ) {
    return null
  }
  return {
    claim: value.claim,
    evidence: value.evidence,
    status,
    severity,
    suggestion: typeof value.suggestion === 'string' ? value.suggestion : undefined,
  }
}

function parseFactCheck(value: JsonValue | undefined): FactCheckReport | null {
  if (!isRecord(value) || typeof value.passed !== 'boolean' || typeof value.summary !== 'string') {
    return null
  }
  if (!Array.isArray(value.findings)) return null
  const findings = value.findings.map(parseFinding)
  if (findings.some((finding) => finding === null)) return null
  return {
    passed: value.passed,
    summary: value.summary,
    findings: findings.filter((finding): finding is FactCheckFinding => finding !== null),
  }
}

function factCheckToJson(report: FactCheckReport): JsonObject {
  return {
    passed: report.passed,
    summary: report.summary,
    findings: report.findings.map((finding) => ({
      claim: finding.claim,
      status: finding.status,
      severity: finding.severity,
      evidence: finding.evidence,
      suggestion: finding.suggestion ?? null,
    })),
  }
}

function reasonToJson(reason: ContextTraceItem['reason']): JsonObject {
  return {
    code: reason.code,
    message: reason.message,
  }
}

function traceItemToJson(item: ContextTraceItem): JsonObject {
  return {
    id: item.id,
    source: item.source,
    title: item.title,
    priority: item.priority,
    relevance_score: item.relevance_score,
    importance: item.importance,
    estimated_tokens: item.estimated_tokens,
    reason: reasonToJson(item.reason),
  }
}

function budgetToJson(budget: ContextCompileTrace['budget']): JsonObject {
  return {
    total_budget: budget.total_budget,
    system_reserved: budget.system_reserved,
    max_output_reserved: budget.max_output_reserved,
    available_for_prompt: budget.available_for_prompt,
    selected_tokens: budget.selected_tokens,
    discarded_tokens: budget.discarded_tokens,
    remaining_tokens: budget.remaining_tokens,
    estimation_method: budget.estimation_method,
    estimation_note: budget.estimation_note,
  }
}

function metadataToJson(metadata: ContextCompileTrace['metadata']): JsonObject {
  return {
    prompt_version: metadata.prompt_version,
    task_kind: metadata.task_kind,
    strategy_id: metadata.strategy_id,
    model: metadata.model,
    temperature: metadata.temperature,
    max_output_tokens: metadata.max_output_tokens,
    context_budget: metadata.context_budget,
  }
}

export function compileTraceToJson(trace: ContextCompileTrace): JsonObject {
  const json: JsonObject = {
    task_kind: trace.task_kind,
    selected: trace.selected.map(traceItemToJson),
    discarded: trace.discarded.map(traceItemToJson),
    budget: budgetToJson(trace.budget),
    warnings: [...trace.warnings],
    errors: [...trace.errors],
    metadata: metadataToJson(trace.metadata),
  }
  if (typeof trace.final_prompt === 'string') {
    json.final_prompt = trace.final_prompt
  }
  return json
}

function parseTraceItem(value: JsonValue): ContextTraceItem | null {
  if (!isRecord(value)) return null
  if (
    typeof value.id !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.title !== 'string' ||
    typeof value.priority !== 'string' ||
    typeof value.relevance_score !== 'number' ||
    typeof value.importance !== 'number' ||
    typeof value.estimated_tokens !== 'number' ||
    !isRecord(value.reason) ||
    typeof value.reason.code !== 'string' ||
    typeof value.reason.message !== 'string'
  ) {
    return null
  }
  return {
    id: value.id,
    source: value.source as ContextTraceItem['source'],
    title: value.title,
    priority: value.priority as ContextTraceItem['priority'],
    relevance_score: value.relevance_score,
    importance: value.importance,
    estimated_tokens: value.estimated_tokens,
    reason: {
      code: value.reason.code as ContextTraceItem['reason']['code'],
      message: value.reason.message,
    },
  }
}

function parseCompileTrace(value: JsonValue | undefined): ContextCompileTrace | null {
  if (!isRecord(value)) return null
  if (typeof value.task_kind !== 'string' || !isRecord(value.budget) || !isRecord(value.metadata)) {
    return null
  }
  if (!Array.isArray(value.selected) || !Array.isArray(value.discarded)) return null
  if (!Array.isArray(value.warnings) || !Array.isArray(value.errors)) return null
  const selected = value.selected.map(parseTraceItem)
  const discarded = value.discarded.map(parseTraceItem)
  if (selected.some((item) => item === null) || discarded.some((item) => item === null)) return null
  const budget = value.budget
  const metadata = value.metadata
  if (
    typeof budget.total_budget !== 'number' ||
    typeof budget.system_reserved !== 'number' ||
    typeof budget.max_output_reserved !== 'number' ||
    typeof budget.available_for_prompt !== 'number' ||
    typeof budget.selected_tokens !== 'number' ||
    typeof budget.discarded_tokens !== 'number' ||
    typeof budget.remaining_tokens !== 'number' ||
    typeof budget.estimation_method !== 'string' ||
    typeof budget.estimation_note !== 'string' ||
    typeof metadata.prompt_version !== 'string' ||
    typeof metadata.task_kind !== 'string' ||
    typeof metadata.strategy_id !== 'string'
  ) {
    return null
  }
  const trace: ContextCompileTrace = {
    task_kind: value.task_kind as ContextCompileTrace['task_kind'],
    selected: selected as ContextTraceItem[],
    discarded: discarded as ContextTraceItem[],
    budget: {
      total_budget: budget.total_budget,
      system_reserved: budget.system_reserved,
      max_output_reserved: budget.max_output_reserved,
      available_for_prompt: budget.available_for_prompt,
      selected_tokens: budget.selected_tokens,
      discarded_tokens: budget.discarded_tokens,
      remaining_tokens: budget.remaining_tokens,
      estimation_method: budget.estimation_method as ContextCompileTrace['budget']['estimation_method'],
      estimation_note: budget.estimation_note,
    },
    warnings: value.warnings.filter((item): item is string => typeof item === 'string'),
    errors: value.errors.filter((item): item is string => typeof item === 'string'),
    metadata: {
      prompt_version: metadata.prompt_version,
      task_kind: metadata.task_kind as ContextCompileTrace['metadata']['task_kind'],
      strategy_id: metadata.strategy_id,
      model: typeof metadata.model === 'string' ? metadata.model : null,
      temperature: readNumber(metadata.temperature),
      max_output_tokens: readNumber(metadata.max_output_tokens),
      context_budget: readNumber(metadata.context_budget),
    },
  }
  if (typeof value.final_prompt === 'string') {
    trace.final_prompt = value.final_prompt
  }
  return trace
}

function modelParamsToJson(params: ChapterGenerationModelParams): JsonObject {
  return {
    model: params.model,
    temperature: params.temperature,
    max_output_tokens: params.max_output_tokens,
    context_budget: params.context_budget,
  }
}

function parseModelParams(value: JsonValue | undefined): ChapterGenerationModelParams | null {
  if (!isRecord(value)) return null
  const maxOut = readNumber(value.max_output_tokens)
  const budget = readNumber(value.context_budget)
  if (maxOut == null || budget == null || maxOut <= 0 || budget <= 0) return null
  return {
    model: typeof value.model === 'string' ? value.model : null,
    temperature: readNumber(value.temperature),
    max_output_tokens: maxOut,
    context_budget: budget,
  }
}

function stageCompileToJson(compile: ChapterGenerationStageCompile): JsonObject {
  return {
    prompt_version: compile.prompt_version,
    model_params: modelParamsToJson(compile.model_params),
    trace: compileTraceToJson(compile.trace),
  }
}

function parseStageCompile(value: JsonValue | undefined): ChapterGenerationStageCompile | null {
  if (!isRecord(value) || typeof value.prompt_version !== 'string') return null
  const model_params = parseModelParams(value.model_params)
  const trace = parseCompileTrace(value.trace)
  if (!model_params || !trace) return null
  return { prompt_version: value.prompt_version, model_params, trace }
}

export function hasValidContextStageCompile(value: JsonValue | undefined, taskKind: ContextCompileTrace['task_kind']): boolean {
  const parsed = parseStageCompile(value)
  return parsed !== null
    && parsed.trace.task_kind === taskKind
    && parsed.trace.metadata.task_kind === taskKind
    && parsed.prompt_version === parsed.trace.metadata.prompt_version
    && parsed.model_params.model === parsed.trace.metadata.model
    && parsed.model_params.temperature === parsed.trace.metadata.temperature
    && parsed.model_params.max_output_tokens === parsed.trace.metadata.max_output_tokens
    && parsed.model_params.context_budget === parsed.trace.metadata.context_budget
    && Object.values(parsed.model_params).every((field) => typeof field !== 'number' || Number.isFinite(field))
    && Object.values(parsed.trace.budget).every((field) => typeof field !== 'number' || (Number.isFinite(field) && field >= 0))
}

export function hasValidStageCompileMetadata(value: JsonValue | undefined): boolean {
  if (value === undefined) return true
  if (!isRecord(value)) return false
  const kinds = { body: 'chapter_body', summary: 'summary', fact_check: 'fact_check' } as const
  return Object.entries(value).every(([stage, item]) => {
    if (stage !== 'body' && stage !== 'summary' && stage !== 'fact_check') return false
    return hasValidContextStageCompile(item, kinds[stage])
  })
}

function stageCompilesToJson(
  compiles: ChapterGenerationCheckpoint['stage_compiles'],
): JsonObject {
  const out: JsonObject = {}
  if (!compiles) return out
  for (const stage of ['body', 'summary', 'fact_check'] as const) {
    const item = compiles[stage]
    if (item) out[stage] = stageCompileToJson(item)
  }
  return out
}

function parseStageCompiles(
  value: JsonValue | undefined,
): ChapterGenerationCheckpoint['stage_compiles'] {
  if (!isRecord(value)) return {}
  const out: NonNullable<ChapterGenerationCheckpoint['stage_compiles']> = {}
  for (const stage of ['body', 'summary', 'fact_check'] as const) {
    const parsed = parseStageCompile(value[stage])
    if (parsed) out[stage] = parsed
  }
  return out
}

export function checkpointToJson(checkpoint: ChapterGenerationCheckpoint): JsonObject {
  return {
    schema_version: checkpoint.schema_version,
    stage: checkpoint.stage,
    body: checkpoint.body,
    summary: checkpoint.summary,
    fact_check_text: checkpoint.fact_check_text,
    fact_check: checkpoint.fact_check ? factCheckToJson(checkpoint.fact_check) : null,
    version_id: checkpoint.version_id,
    ...(checkpoint.source_content !== undefined ? { source_content: checkpoint.source_content } : {}),
    ...(checkpoint.source_chapter_version !== undefined ? { source_chapter_version: checkpoint.source_chapter_version } : {}),
    ...(checkpoint.context_source_snapshot !== undefined ? { context_source_snapshot: checkpoint.context_source_snapshot } : {}),
    stage_compiles: stageCompilesToJson(checkpoint.stage_compiles),
    ...(checkpoint.updated_at ? { updated_at: checkpoint.updated_at } : {}),
  }
}

export function checkpointFromJson(value: JsonObject | null): ChapterGenerationCheckpoint {
  if (!value || !isStage(value.stage)) return emptyChapterGenerationCheckpoint()
  const schemaVersion = typeof value.schema_version === 'number' ? value.schema_version : 1
  return {
    schema_version: schemaVersion,
    stage: value.stage,
    body: readString(value.body),
    summary: readString(value.summary),
    fact_check_text: readString(value.fact_check_text),
    fact_check: parseFactCheck(value.fact_check),
    version_id: readNullableString(value.version_id),
    ...(typeof value.source_content === 'string' ? { source_content: value.source_content } : {}),
    ...(typeof value.source_chapter_version === 'number' ? { source_chapter_version: value.source_chapter_version } : {}),
    ...(typeof value.context_source_snapshot === 'string' ? { context_source_snapshot: value.context_source_snapshot } : {}),
    updated_at: readString(value.updated_at) || undefined,
    stage_compiles: parseStageCompiles(value.stage_compiles),
  }
}

function normalizeText(existing: string, streamed: string, result: TextGenerationResult): string {
  if (result.text.length > 0 && result.text.startsWith(existing)) return result.text
  if (streamed.length > 0) {
    if (result.text === streamed) return `${existing}${streamed}`
    if (result.text.startsWith(streamed)) return `${existing}${result.text}`
  }
  if (result.text.length > 0) return `${existing}${result.text}`
  return `${existing}${streamed}`
}

function stageAtLeast(current: ChapterGenerationStage, required: ChapterGenerationStage): boolean {
  return stageOrder.indexOf(current) >= stageOrder.indexOf(required)
}

function extractJsonObject(text: string): JsonObject | null {
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first < 0 || last <= first) return null
  try {
    const parsed: unknown = JSON.parse(text.slice(first, last + 1))
    return isRecord(parsed as JsonValue) ? parsed as JsonObject : null
  } catch {
    return null
  }
}

function parseFactCheckText(text: string): FactCheckReport {
  const parsed = extractJsonObject(text)
  const report = parseFactCheck(parsed ?? undefined)
  if (report) return report
  return {
    ...emptyFactCheckReport(),
    summary: text.trim(),
    findings: [
      {
        claim: '事实核查输出格式',
        status: 'unclear',
        severity: 'warning',
        evidence: text.trim(),
      },
    ],
  }
}

function collectMaterialIds(
  volumeMaterialIds: readonly string[],
  chapterMaterialIds: readonly string[],
): string[] {
  return [...new Set([...volumeMaterialIds, ...chapterMaterialIds])]
}

function assertStableOutline(status: string, entity: string, id: string): void {
  if (!stableOutlineStatuses.has(status)) {
    throw new ChapterGenerationBoundaryError(`${entity} must be confirmed or locked before generation: ${id}`)
  }
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}

function persistableTrace(compiled: CompiledContext): ContextCompileTrace {
  // compileContext only sets final_prompt when debug=true; copy as-is for resume.
  const trace: ContextCompileTrace = {
    task_kind: compiled.trace.task_kind,
    selected: compiled.trace.selected,
    discarded: compiled.trace.discarded,
    budget: compiled.trace.budget,
    warnings: [...compiled.trace.warnings],
    errors: [...compiled.trace.errors],
    metadata: { ...compiled.trace.metadata },
  }
  if (typeof compiled.trace.final_prompt === 'string') {
    trace.final_prompt = compiled.trace.final_prompt
  }
  return trace
}

/** Budget failure traces never include final_prompt unless the error already attached one (it does not by default). */
function persistableFailureTrace(trace: ContextCompileTrace): ContextCompileTrace {
  return {
    task_kind: trace.task_kind,
    selected: trace.selected,
    discarded: trace.discarded,
    budget: trace.budget,
    warnings: [...trace.warnings],
    errors: [...trace.errors],
    metadata: { ...trace.metadata },
  }
}

export class ChapterGenerationService {
  private readonly now: () => string

  public constructor(private readonly options: ChapterGenerationServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  public prepare(input: ChapterGenerationRequest): ChapterGenerationPreparation {
    return this.prepareInternal(input, true)
  }

  public listVersions(projectId: string, chapterId: string): ChapterVersion[] {
    const entity = this.options.chapters.getById(chapterId)
    if (entity) {
      const chapter = this.requireChapter(projectId, chapterId)
      return this.options.versions.listByChapter(chapter.id)
    }
    const outline = this.options.project.getChapterOutline(projectId, chapterId)
    const chapter = this.options.chapters.getByProjectAndNumber(projectId, outline.chapter_number)
    if (!chapter) return []
    this.requireChapter(projectId, chapter.id)
    return this.options.versions.listByChapter(chapter.id)
  }

  public getVersion(projectId: string, versionId: string): ChapterVersion {
    const version = this.options.versions.getById(versionId)
    if (!version) throw new EntityNotFoundError('Chapter version', versionId)
    this.requireChapter(projectId, version.chapter_id)
    return version
  }

  /** Lookup chapter version already persisted for a task (idempotent finish path). */
  public getVersionByTaskId(taskId: string): ChapterVersion | null {
    return this.options.versions.getByTaskId(taskId)
  }

  /**
   * Completes every durable side effect that may remain after a crash occurring
   * immediately after the task-bound version insert.
   */
  public finalizePersistedVersion(
    input: ChapterGenerationRequest,
    versionId: string,
    expectedSourceContent: string | null = null,
    expectedSourceVersion?: number,
  ): { chapter: Chapter; version: ChapterVersion; autoConfirmed: boolean } {
    let version = this.getVersion(input.project_id, versionId)
    if (version.task_id !== input.task_id) {
      throw new ChapterGenerationBoundaryError('Chapter version does not belong to this task')
    }
    const outline = this.options.project.getChapterOutline(
      input.project_id,
      input.chapter_outline_id,
    )
    let chapter = this.requireChapter(input.project_id, version.chapter_id)
    if (
      (input.chapter_id && chapter.id !== input.chapter_id)
      || chapter.chapter_number !== outline.chapter_number
    ) {
      throw new ChapterGenerationBoundaryError('Chapter version does not match the task target')
    }
    const latestVersion = this.options.versions.listByChapter(chapter.id)[0]
    if (!latestVersion || latestVersion.id !== version.id) {
      throw new ChapterGenerationBoundaryError(
        'A newer chapter version exists; the recovered task cannot overwrite it',
      )
    }
    if (version.status === 'rejected') {
      throw new ChapterGenerationBoundaryError('Rejected chapter version cannot finish a task')
    }
    if (version.status === 'approved' && !version.is_current) {
      throw new ChapterGenerationBoundaryError(
        'Approved chapter version is no longer current',
      )
    }

    if (version.status === 'review' && expectedSourceContent !== null && chapter.content !== expectedSourceContent) {
      throw new ChapterGenerationBoundaryError('Chapter changed after the generation checkpoint')
    }
    if (version.status === 'review' && expectedSourceVersion !== undefined) {
      const ownReviewUpdate = chapter.version === expectedSourceVersion + 1
        && chapter.status === 'review' && chapter.synopsis === version.summary
        && chapter.actual_words === version.content.length
      if (chapter.version !== expectedSourceVersion && !ownReviewUpdate) {
        throw new ChapterGenerationBoundaryError('Chapter version changed after generation; recovery cannot overwrite metadata')
      }
    }

    if (input.auto_confirm && version.status === 'review' && version.fact_check.passed) {
      if (expectedSourceContent === null || chapter.content !== expectedSourceContent) {
        throw new ChapterGenerationBoundaryError(
          'Chapter changed after the generation checkpoint or source evidence is missing; recovery cannot auto-confirm',
        )
      }
      version = this.confirmVersion(input.project_id, version.id)
      chapter = this.requireChapter(input.project_id, version.chapter_id)
      return { chapter, version, autoConfirmed: true }
    }

    if (version.status === 'approved') {
      if (
        chapter.status !== 'completed'
        || chapter.content !== version.content
        || chapter.synopsis !== version.summary
        || chapter.actual_words !== version.content.length
      ) {
        throw new ChapterGenerationBoundaryError(
          'Approved version differs from the current chapter; recovery cannot overwrite user content',
        )
      }
      return { chapter, version, autoConfirmed: true }
    }

    if (
      chapter.status !== 'review'
      || chapter.synopsis !== version.summary
      || chapter.actual_words !== version.content.length
    ) {
      const updated = this.options.chapters.update(
        chapter.id,
        {
          status: 'review',
          synopsis: version.summary,
          actual_words: version.content.length,
        },
        chapter.version,
      )
      if (!updated) throw new EntityNotFoundError('Chapter', chapter.id)
      chapter = updated
    }
    return { chapter, version, autoConfirmed: false }
  }

  public confirmVersion(projectId: string, versionId: string): ChapterVersion {
    const version = this.getVersion(projectId, versionId)
    if (version.status !== 'review') {
      throw new ChapterVersionStatusTransitionError(version.id, version.status, 'approved')
    }
    if (hasBlockingFactCheckFinding(version.fact_check.findings)) {
      throw new ChapterGenerationBoundaryError(
        `Chapter version has blocking fact-check errors: ${version.id}`,
      )
    }
    const chapter = this.requireChapter(projectId, version.chapter_id)
    const approved = this.options.versions.setStatus(version.id, 'approved', 'review')
    if (!approved) throw new EntityNotFoundError('Chapter version', version.id)
    const published = this.options.chapters.update(
      chapter.id,
      {
        content: approved.content,
        synopsis: approved.summary,
        status: 'completed',
        actual_words: approved.content.length,
      },
      chapter.version,
    )
    if (!published) throw new EntityNotFoundError('Chapter', chapter.id)
    return approved
  }

  public rejectVersion(projectId: string, versionId: string): ChapterVersion {
    const version = this.getVersion(projectId, versionId)
    if (version.status !== 'review') {
      throw new ChapterVersionStatusTransitionError(version.id, version.status, 'rejected')
    }
    const rejected = this.options.versions.setStatus(version.id, 'rejected', 'review')
    if (!rejected) throw new EntityNotFoundError('Chapter version', version.id)
    const chapter = this.requireChapter(projectId, version.chapter_id)
    const current = this.options.versions.listByChapter(chapter.id).find((item) => item.is_current)
    if (!current) {
      this.options.chapters.update(chapter.id, { status: 'planned' }, chapter.version)
    }
    return rejected
  }

  public async generate(
    input: ChapterGenerationRequest,
    generator: TextGenerator,
    options: ChapterGenerationRunOptions,
  ): Promise<ChapterGenerationResult> {
    let checkpoint = options.checkpoint ?? emptyChapterGenerationCheckpoint()
    if (!checkpoint.stage_compiles) checkpoint = { ...checkpoint, stage_compiles: {} }
    const canReuseSavedVersion = checkpoint.stage === 'review' && checkpoint.version_id !== null
    const preparation = this.commit(
      options,
      () => {
        const existing = input.chapter_id
          ? this.requireChapter(input.project_id, input.chapter_id)
          : this.options.chapters.getByProjectAndNumber(
              input.project_id,
              this.options.project.getChapterOutline(input.project_id, input.chapter_outline_id).chapter_number,
            )
        if (checkpoint.source_content !== undefined && existing?.content !== checkpoint.source_content) {
          throw new ChapterGenerationBoundaryError('Chapter changed after the generation checkpoint')
        }
        if (!canReuseSavedVersion && checkpoint.source_chapter_version !== undefined && existing?.version !== checkpoint.source_chapter_version) {
          throw new ChapterGenerationBoundaryError('Chapter version changed after the generation checkpoint')
        }
        if (input.auto_confirm && checkpoint.body && checkpoint.source_content === undefined) {
          throw new ChapterGenerationBoundaryError('Generation source evidence is missing; cannot auto-confirm')
        }
        const prepared = this.prepareInternal(input, false)
        const sourceSnapshot = this.compilerSourceSnapshot(input, prepared, resolveGenerationModelParams(input))
        if (checkpoint.context_source_snapshot !== undefined && checkpoint.context_source_snapshot !== sourceSnapshot) {
          throw new ChapterGenerationBoundaryError('Context sources or model parameters changed; start a new generation task')
        }
        if (Object.keys(checkpoint.stage_compiles ?? {}).length > 0 && checkpoint.context_source_snapshot === undefined) {
          throw new ChapterGenerationBoundaryError('Compiler source evidence is missing; start a new generation task')
        }
        checkpoint = { ...checkpoint, context_source_snapshot: sourceSnapshot }
        if (!canReuseSavedVersion && prepared.chapter.status !== 'drafting') {
          prepared.chapter = this.options.chapters.update(prepared.chapter.id, { status: 'drafting' }, prepared.chapter.version) ?? prepared.chapter
        }
        checkpoint = { ...checkpoint, source_chapter_version: prepared.chapter.version }
        return prepared
      },
    )
    if (checkpoint.source_content === undefined) {
      checkpoint = { ...checkpoint, source_content: preparation.chapter.content }
    }
    let chapter = preparation.chapter
    const modelParams = resolveGenerationModelParams(input)

    if (canReuseSavedVersion) {
      const saved = this.options.versions.getById(checkpoint.version_id!)
      if (saved) {
        if (input.auto_confirm && saved.status === 'review' && saved.fact_check.passed) {
          const confirmed = this.commit(
            options,
            () => this.confirmVersion(input.project_id, saved.id),
          )
          checkpoint = { ...checkpoint, stage: 'review' }
          options.callbacks?.on_review?.(confirmed, false)
          return {
            status: 'completed',
            chapter: this.requireChapter(input.project_id, confirmed.chapter_id),
            version: confirmed,
            checkpoint,
            auto_confirmed: true,
          }
        }
        if (saved.status === 'approved') {
          return {
            status: 'completed',
            chapter: this.requireChapter(input.project_id, saved.chapter_id),
            version: saved,
            checkpoint,
            auto_confirmed: true,
          }
        }
        return {
          status: 'completed',
          chapter,
          version: saved,
          checkpoint,
          auto_confirmed: false,
        }
      }
      checkpoint = { ...checkpoint, stage: 'saving', version_id: null }
    }

    const cancel = (): ChapterGenerationResult => ({
      status: 'cancelled',
      chapter,
      version: null,
      checkpoint,
      auto_confirmed: false,
    })

    if (options.signal.aborted) return cancel()

    if (!stageAtLeast(checkpoint.stage, 'summary')) {
      checkpoint = { ...checkpoint, stage: 'body' }
      options.callbacks?.on_stage?.('body', 0.1)
      try {
        const compiled = await this.compileStage(input, preparation, modelParams, 'body', {
          existingText: checkpoint.body,
        }, checkpoint.context_source_snapshot, options.signal)
        checkpoint = this.withStageCompile(checkpoint, 'body', compiled, modelParams)
        this.publishCheckpoint(options, checkpoint)
        const body = await this.runTextStage(
          'body',
          compiled.prompt,
          checkpoint.body,
          generator,
          options,
          (text) => {
            checkpoint = { ...checkpoint, body: text, stage: 'body' }
            this.publishCheckpoint(options, checkpoint)
          },
        )
        if (options.signal.aborted) return cancel()
        if (body.trim() === '') throw new ChapterGenerationBoundaryError('Generated chapter body is empty')
        checkpoint = { ...checkpoint, body, stage: 'summary' }
        this.publishCheckpoint(options, checkpoint)
      } catch (error) {
        if (isAbortError(error, options.signal)) return cancel()
        if (error instanceof ContextBudgetExceededError) {
          checkpoint = this.withFailureStageCompile(checkpoint, 'body', error, modelParams)
          this.publishCheckpoint(options, checkpoint)
        }
        throw error
      }
    }

    if (!stageAtLeast(checkpoint.stage, 'fact_check')) {
      options.callbacks?.on_stage?.('summary', 0.45)
      try {
        const compiled = await this.compileStage(input, preparation, modelParams, 'summary', {
          body: checkpoint.body,
          existingText: checkpoint.summary,
        }, checkpoint.context_source_snapshot, options.signal)
        checkpoint = this.withStageCompile(checkpoint, 'summary', compiled, modelParams)
        this.publishCheckpoint(options, checkpoint)
        const summary = await this.runTextStage(
          'summary',
          compiled.prompt,
          checkpoint.summary,
          generator,
          options,
          (text) => {
            checkpoint = { ...checkpoint, summary: text, stage: 'summary' }
            this.publishCheckpoint(options, checkpoint)
          },
        )
        if (options.signal.aborted) return cancel()
        checkpoint = { ...checkpoint, summary, stage: 'fact_check' }
        this.publishCheckpoint(options, checkpoint)
      } catch (error) {
        if (isAbortError(error, options.signal)) return cancel()
        if (error instanceof ContextBudgetExceededError) {
          checkpoint = this.withFailureStageCompile(checkpoint, 'summary', error, modelParams)
          this.publishCheckpoint(options, checkpoint)
        }
        throw error
      }
    }

    if (!stageAtLeast(checkpoint.stage, 'saving')) {
      options.callbacks?.on_stage?.('fact_check', 0.7)
      try {
        const compiled = await this.compileStage(input, preparation, modelParams, 'fact_check', {
          body: checkpoint.body,
          existingText: checkpoint.fact_check_text,
        }, checkpoint.context_source_snapshot, options.signal)
        checkpoint = this.withStageCompile(checkpoint, 'fact_check', compiled, modelParams)
        this.publishCheckpoint(options, checkpoint)
        const factCheckText = await this.runTextStage(
          'fact_check',
          compiled.prompt,
          checkpoint.fact_check_text,
          generator,
          options,
          (text) => {
            checkpoint = { ...checkpoint, fact_check_text: text, stage: 'fact_check' }
            this.publishCheckpoint(options, checkpoint)
          },
        )
        if (options.signal.aborted) return cancel()
        checkpoint = {
          ...checkpoint,
          fact_check_text: factCheckText,
          fact_check: parseFactCheckText(factCheckText),
          stage: 'saving',
        }
        this.publishCheckpoint(options, checkpoint)
      } catch (error) {
        if (isAbortError(error, options.signal)) return cancel()
        if (error instanceof ContextBudgetExceededError) {
          checkpoint = this.withFailureStageCompile(checkpoint, 'fact_check', error, modelParams)
          this.publishCheckpoint(options, checkpoint)
        }
        throw error
      }
    }

    if (options.signal.aborted) return cancel()
    options.callbacks?.on_stage?.('saving', 0.9)
    this.commit(options, () => {
      this.assertCompilationSource(input, preparation, modelParams, checkpoint.context_source_snapshot)
      const current = this.requireChapter(input.project_id, chapter.id)
      if (current.version !== chapter.version || current.content !== checkpoint.source_content) {
        throw new ChapterGenerationBoundaryError('Chapter changed during generation; cannot save stale results')
      }
    })
    checkpoint = { ...checkpoint, stage: 'saving' }
    this.publishCheckpoint(options, checkpoint)
    const version = this.commit(options, () =>
      input.task_id
        ? this.options.versions.getByTaskId(input.task_id) ?? this.options.versions.create({
            chapter_id: chapter.id,
            task_id: input.task_id,
            content: checkpoint.body,
            summary: checkpoint.summary,
            fact_check: checkpoint.fact_check ?? parseFactCheckText(checkpoint.fact_check_text),
          })
        : this.options.versions.create({
            chapter_id: chapter.id,
            content: checkpoint.body,
            summary: checkpoint.summary,
            fact_check: checkpoint.fact_check ?? parseFactCheckText(checkpoint.fact_check_text),
          }),
    )
    checkpoint = { ...checkpoint, stage: 'review', version_id: version.id }
    this.publishCheckpoint(options, checkpoint)
    chapter = this.commit(
      options,
      () => this.options.chapters.update(
        chapter.id,
        {
          status: 'review',
          synopsis: version.summary,
          actual_words: version.content.length,
        },
        chapter.version,
      ) ?? chapter,
    )

    const autoConfirmed = Boolean(input.auto_confirm && version.fact_check.passed)
    options.callbacks?.on_review?.(version, !autoConfirmed)
    if (autoConfirmed && version.status === 'review') {
      const confirmed = this.commit(
        options,
        () => this.confirmVersion(input.project_id, version.id),
      )
      options.callbacks?.on_review?.(confirmed, false)
      chapter = this.requireChapter(input.project_id, confirmed.chapter_id)
      options.callbacks?.on_stage?.('review', 1)
      return {
        status: 'completed',
        chapter,
        version: confirmed,
        checkpoint,
        auto_confirmed: true,
      }
    }

    if (autoConfirmed && version.status === 'approved') {
      chapter = this.requireChapter(input.project_id, version.chapter_id)
      options.callbacks?.on_stage?.('review', 1)
      return {
        status: 'completed',
        chapter,
        version,
        checkpoint,
        auto_confirmed: true,
      }
    }

    options.callbacks?.on_stage?.('review', 1)
    return {
      status: 'completed',
      chapter,
      version,
      checkpoint,
      auto_confirmed: false,
    }
  }

  private commit<T>(
    options: ChapterGenerationRunOptions,
    operation: () => T,
  ): T {
    return options.commit ? options.commit(operation) : operation()
  }

  private async compileStage(
    input: ChapterGenerationRequest,
    preparation: ChapterGenerationPreparation,
    modelParams: ChapterGenerationModelParams,
    stage: ChapterGenerationTextStage,
    parts: { body?: string; existingText?: string },
    expectedSnapshot?: string,
    signal?: AbortSignal,
  ): Promise<CompiledContext> {
    if (signal?.aborted) throw new Error('Context compilation was cancelled')
    const current = this.assertCompilationSource(input, preparation, modelParams, expectedSnapshot)
    const compilerInput = this.compilerInput(input, current, modelParams, stage, parts)
    const assertCurrent = (): void => {
      if (signal?.aborted) throw new Error('Context compilation was cancelled')
      this.assertCompilationSource(input, preparation, modelParams, expectedSnapshot)
    }
    let compiled: CompiledContext
    try {
      compiled = this.options.computeContext
        ? await this.options.computeContext(compilerInput, { signal })
        : compileContext(compilerInput)
    } catch (error) {
      // The Worker await permits user edits; also fence rejected budget results
      // before associating their failureTrace with a durable source snapshot.
      assertCurrent()
      throw error
    }
    assertCurrent()
    return compiled
  }

  private assertCompilationSource(
    input: ChapterGenerationRequest,
    preparation: ChapterGenerationPreparation,
    modelParams: ChapterGenerationModelParams,
    expectedSnapshot?: string,
  ): ChapterGenerationPreparation {
    // Supplying the existing entity id keeps this fence strictly read-only:
    // deleting a chapter while a Worker runs must never recreate it.
    const current = this.prepareInternal({ ...input, chapter_id: preparation.chapter.id }, false)
    if (current.chapter.version !== preparation.chapter.version
      || current.chapter.content !== preparation.chapter.content) {
      throw new ChapterGenerationBoundaryError('Chapter changed during compilation; cannot use stale context')
    }
    if (expectedSnapshot !== this.compilerSourceSnapshot(input, current, modelParams)) {
      throw new ChapterGenerationBoundaryError('Context sources changed during generation; start a new generation task')
    }
    return current
  }

  private compilerSourceSnapshot(
    input: ChapterGenerationRequest,
    preparation: ChapterGenerationPreparation,
    modelParams: ChapterGenerationModelParams,
  ): string {
    const sources = this.compilerInput(input, preparation, modelParams, 'body', {})
    return JSON.stringify({ ...sources, prompt_version: CONTEXT_PROMPT_VERSION })
  }

  private compilerInput(
    input: ChapterGenerationRequest,
    preparation: ChapterGenerationPreparation,
    modelParams: ChapterGenerationModelParams,
    stage: ChapterGenerationTextStage,
    parts: { body?: string; existingText?: string },
  ) {
    const priorChapters = mapPriorChapters(
      this.options.chapters.listByProject(input.project_id),
      preparation.chapter_outline.chapter_number,
    )
    const narrativeMemories = filterApprovedMemories(
      this.options.memories?.listByProject(input.project_id) ?? [],
    )
    const foreshadows = filterOpenForeshadows(
      this.options.foreshadows?.listByProject(input.project_id) ?? [],
    )
    const compilerInput = assembleContextCompilerInput({
      preparation,
      stage,
      request: input,
      modelParams,
      priorChapters,
      narrativeMemories,
      foreshadows,
      body: parts.body,
      existingText: parts.existingText,
    })
    // ContextBudgetExceededError propagates — never silent.
    return compilerInput
  }

  private withStageCompile(
    checkpoint: ChapterGenerationCheckpoint,
    stage: ChapterGenerationTextStage,
    compiled: CompiledContext,
    modelParams: ChapterGenerationModelParams,
  ): ChapterGenerationCheckpoint {
    const stageCompile: ChapterGenerationStageCompile = {
      prompt_version: compiled.metadata.prompt_version || CONTEXT_PROMPT_VERSION,
      model_params: { ...modelParams },
      trace: persistableTrace(compiled),
    }
    return {
      ...checkpoint,
      stage_compiles: {
        ...checkpoint.stage_compiles,
        [stage]: stageCompile,
      },
    }
  }

  private withFailureStageCompile(
    checkpoint: ChapterGenerationCheckpoint,
    stage: ChapterGenerationTextStage,
    error: ContextBudgetExceededError,
    modelParams: ChapterGenerationModelParams,
  ): ChapterGenerationCheckpoint {
    const stageCompile: ChapterGenerationStageCompile = {
      prompt_version: error.failureTrace.metadata.prompt_version || CONTEXT_PROMPT_VERSION,
      model_params: { ...modelParams },
      trace: persistableFailureTrace(error.failureTrace),
    }
    return {
      ...checkpoint,
      stage_compiles: {
        ...checkpoint.stage_compiles,
        [stage]: stageCompile,
      },
    }
  }

  private prepareInternal(
    input: ChapterGenerationRequest,
    markDrafting: boolean,
  ): ChapterGenerationPreparation {
    const project = this.options.project.getProject(input.project_id)
    if (project.status !== 'active') {
      throw new ChapterGenerationBoundaryError(`Project is not active: ${project.id}`)
    }
    const config = this.options.project.getProjectConfig(input.project_id)
    const chapterOutline = this.options.project.getChapterOutline(
      input.project_id,
      input.chapter_outline_id,
    )
    assertStableOutline(chapterOutline.status, 'Chapter outline', chapterOutline.id)
    const volume = this.options.project.getVolume(input.project_id, chapterOutline.volume_id)
    const volumeOutline = this.options.project.getVolumeOutlineByVolume(
      input.project_id,
      volume.id,
    )
    if (!volumeOutline) {
      throw new ChapterGenerationBoundaryError(`Volume outline is required before generation: ${volume.id}`)
    }
    assertStableOutline(volumeOutline.status, 'Volume outline', volumeOutline.id)
    const sourceMaterialIds = collectMaterialIds(
      volumeOutline.source_material_ids,
      chapterOutline.source_material_ids,
    )
    const outlineContext = this.options.project.getOutlineContext(
      input.project_id,
      sourceMaterialIds,
    )
    let chapter = input.chapter_id
      ? this.requireChapter(input.project_id, input.chapter_id)
      : this.options.chapters.getByProjectAndNumber(
          input.project_id,
          chapterOutline.chapter_number,
        )
    if (!chapter) {
      chapter = this.options.chapters.create({
        project_id: input.project_id,
        chapter_number: chapterOutline.chapter_number,
        title: chapterOutline.title,
        synopsis: chapterOutline.summary,
        status: 'planned',
        target_words: config.target_words,
      })
    }
    if (chapter.chapter_number !== chapterOutline.chapter_number) {
      throw new ChapterGenerationBoundaryError('Chapter does not match chapter outline number')
    }
    if (markDrafting && chapter.status !== 'drafting') {
      chapter = this.options.chapters.update(chapter.id, { status: 'drafting' }, chapter.version) ?? chapter
    }
    return {
      project,
      config,
      volume,
      volume_outline: volumeOutline,
      chapter_outline: chapterOutline,
      outline_context: outlineContext,
      chapter,
    }
  }

  private requireChapter(projectId: string, chapterId: string): Chapter {
    const chapter = this.options.chapters.getById(chapterId)
    if (!chapter) throw new EntityNotFoundError('Chapter', chapterId)
    if (chapter.project_id !== projectId) {
      throw new EntityNotFoundError('Chapter in project', chapterId)
    }
    return chapter
  }

  private async runTextStage(
    stage: ChapterGenerationTextStage,
    prompt: string,
    existing: string,
    generator: TextGenerator,
    options: ChapterGenerationRunOptions,
    onText: (text: string) => void,
  ): Promise<string> {
    let streamed = ''
    const result = await generator.generate({
      stage,
      prompt,
      existing_text: existing || undefined,
      signal: options.signal,
      on_chunk: (chunk) => {
        streamed += chunk
        const current = normalizeText(existing, streamed, { text: streamed })
        onText(current)
        options.callbacks?.on_chunk?.(stage, chunk)
      },
    })
    const text = normalizeText(existing, streamed, result)
    onText(text)
    if (streamed.length === 0 && result.text.length > 0) {
      options.callbacks?.on_chunk?.(stage, result.text)
    }
    return text
  }

  private publishCheckpoint(
    options: ChapterGenerationRunOptions,
    checkpoint: ChapterGenerationCheckpoint,
  ): void {
    options.callbacks?.on_checkpoint?.({
      ...checkpoint,
      fact_check: checkpoint.fact_check
        ? { ...checkpoint.fact_check, findings: [...checkpoint.fact_check.findings] }
        : null,
      stage_compiles: checkpoint.stage_compiles
        ? { ...checkpoint.stage_compiles }
        : {},
      updated_at: this.now(),
    })
  }
}
