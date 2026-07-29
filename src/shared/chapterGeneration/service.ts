import {
  ChapterGenerationBoundaryError,
  ChapterVersionStatusTransitionError,
  EntityNotFoundError,
} from '../novelProject'
import type { JsonObject, JsonValue } from '../novelProject'
import type {
  ChapterGenerationProjectPort,
  ChapterStore,
  ChapterVersionStore,
} from './ports'
import {
  emptyChapterGenerationCheckpoint,
  emptyFactCheckReport,
  hasBlockingFactCheckFinding,
  type Chapter,
  type ChapterGenerationCallbacks,
  type ChapterGenerationCheckpoint,
  type ChapterGenerationPreparation,
  type ChapterGenerationRequest,
  type ChapterGenerationResult,
  type ChapterGenerationStage,
  type ChapterVersion,
  type FactCheckFinding,
  type FactCheckReport,
  type TextGenerationResult,
  type TextGenerator,
} from './models'

export interface ChapterGenerationServiceOptions {
  project: ChapterGenerationProjectPort
  chapters: ChapterStore
  versions: ChapterVersionStore
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

export function checkpointToJson(checkpoint: ChapterGenerationCheckpoint): JsonObject {
  return {
    schema_version: checkpoint.schema_version,
    stage: checkpoint.stage,
    body: checkpoint.body,
    summary: checkpoint.summary,
    fact_check_text: checkpoint.fact_check_text,
    fact_check: checkpoint.fact_check ? factCheckToJson(checkpoint.fact_check) : null,
    version_id: checkpoint.version_id,
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
    updated_at: readString(value.updated_at) || undefined,
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

function bodyPrompt(preparation: ChapterGenerationPreparation, existing: string): string {
  const { project, config, volume, volume_outline: volumeOutline, chapter_outline: outline } = preparation
  const materials = preparation.outline_context.selected_source_materials
    .map((material) => `素材《${material.title}》：${material.content}`)
    .join('\n')
  return [
    '请生成当前章节的正文。只依据给出的项目、卷纲、章节大纲和素材，不补造未提供的事实。',
    `项目：${project.name}`,
    `类型：${config.genre}`,
    `语气：${config.tone}`,
    `卷：${volume.title}`,
    `卷纲摘要：${volumeOutline.summary}`,
    `章节标题：${outline.title}`,
    `章节摘要：${outline.summary}`,
    `章节目的：${outline.purpose}`,
    `开场：${outline.opening}`,
    `冲突：${outline.conflict}`,
    `关键事件：${outline.key_events.join('；')}`,
    `结尾：${outline.ending}`,
    `结尾钩子：${outline.ending_hook}`,
    materials ? `可用素材：\n${materials}` : '可用素材：无',
    existing ? `已经生成的正文片段，请从其后继续，不要重复已有内容：\n${existing}` : '',
    '输出正文，不要输出标题、解释或事实核查报告。',
  ].filter((line) => line.length > 0).join('\n')
}

function summaryPrompt(
  preparation: ChapterGenerationPreparation,
  body: string,
  existing: string,
): string {
  return [
    '请为以下章节正文生成简洁摘要。摘要只描述正文中实际发生的内容，不添加新事实。',
    `章节：${preparation.chapter_outline.title}`,
    `正文：\n${body}`,
    existing ? `已有摘要片段，请从其后继续，不要重复：\n${existing}` : '',
    '只输出摘要文本。',
  ].filter((line) => line.length > 0).join('\n')
}

function factCheckPrompt(
  preparation: ChapterGenerationPreparation,
  body: string,
  existing: string,
): string {
  return [
    '请核查以下章节正文是否符合项目、卷纲、章节大纲和素材。只检查可由输入验证的事实，不评价文风。',
    `卷纲：${preparation.volume_outline.summary}\n${preparation.volume_outline.main_conflict}`,
    `章节大纲：${preparation.chapter_outline.summary}\n${preparation.chapter_outline.conflict}`,
    `关键事件：${preparation.chapter_outline.key_events.join('；')}`,
    `正文：\n${body}`,
    existing ? `已有事实核查输出片段，请从其后继续，不要重复：\n${existing}` : '',
    '严格输出 JSON：{"passed":true或false,"summary":"摘要","findings":[{"claim":"事实","status":"supported|unclear|contradicted","severity":"info|warning|error","evidence":"依据","suggestion":"可执行的修改建议，可省略"}]}。',
  ].filter((line) => line.length > 0).join('\n')
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
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
    const chapter = this.requireChapter(projectId, chapterId)
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

    if (input.auto_confirm && version.status === 'review' && version.fact_check.passed) {
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
    const canReuseSavedVersion = checkpoint.stage === 'review' && checkpoint.version_id !== null
    const preparation = this.commit(
      options,
      () => this.prepareInternal(input, !canReuseSavedVersion),
    )
    let chapter = preparation.chapter

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
        const body = await this.runTextStage(
          'body',
          bodyPrompt(preparation, checkpoint.body),
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
        throw error
      }
    }

    if (!stageAtLeast(checkpoint.stage, 'fact_check')) {
      options.callbacks?.on_stage?.('summary', 0.45)
      try {
        const summary = await this.runTextStage(
          'summary',
          summaryPrompt(preparation, checkpoint.body, checkpoint.summary),
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
        throw error
      }
    }

    if (!stageAtLeast(checkpoint.stage, 'saving')) {
      options.callbacks?.on_stage?.('fact_check', 0.7)
      try {
        const factCheckText = await this.runTextStage(
          'fact_check',
          factCheckPrompt(preparation, checkpoint.body, checkpoint.fact_check_text),
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
        throw error
      }
    }

    if (options.signal.aborted) return cancel()
    options.callbacks?.on_stage?.('saving', 0.9)
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
    stage: Exclude<ChapterGenerationStage, 'saving' | 'review'>,
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
      updated_at: this.now(),
    })
  }
}
