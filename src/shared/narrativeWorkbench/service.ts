import {
  type Chapter,
  type ChapterVersion,
  type UpdateChapterInput,
} from '../chapterGeneration'
import { EntityNotFoundError, type JsonObject } from '../novelProject'
import { NarrativeBoundaryError, NarrativeStatusTransitionError } from './errors'
import {
  assignStableBlockIds,
  chapterBlocksToContent,
  diffChapterBlocks,
  findChapterBlock,
  replaceChapterBlock,
} from './blocks'
import {
  parseForeshadowSuggestionText,
  parseMemoryProposalText,
  splitNarrativeParagraphs,
  type ParsedMemoryProposal,
} from './analysis'
import type {
  ChapterDiff,
  ChapterPolishOptions,
  ChapterRevision,
  ChapterRevisionOperationResult,
  CreateForeshadowInput,
  Foreshadow,
  ForeshadowEventType,
  ForeshadowStatus,
  ForeshadowSuggestion,
  ForeshadowSuggestionOptions,
  ForeshadowSuggestionResult,
  MemoryExtractionOptions,
  MemoryExtractionResult,
  NarrativeMemoryProposal,
  NarrativeOperationCheckpoint,
  NarrativeRunOptions,
  NarrativeTextGenerationRequest,
  NarrativeTextGenerationResult,
  NarrativeTextGenerator,
  PostprocessReport,
  ProjectSkillState,
  ChapterRevisionOperation,
  ParagraphRevisionOptions,
} from './models'
import type { NarrativeWorkbenchStores } from './ports'

export interface NarrativeWorkbenchServiceOptions {
  stores: NarrativeWorkbenchStores
  now?: () => string
}

export interface ChapterRevisionDiffResult {
  from_revision_id: string | null
  to_revision_id: string | null
  diff: ChapterDiff
}

export interface ChapterVersionDiffResult {
  from_version_id: string
  to_version_id: string
  diff: ChapterDiff
}

interface TextRunResult {
  status: 'completed' | 'fallback' | 'cancelled'
  text: string
  error: string | null
}

interface RevisionSource {
  chapter: Chapter
  revision: ChapterRevision | null
  content: string
  blocks: ReturnType<typeof assignStableBlockIds>
}

interface DefaultSkill {
  name: string
  description: string
  prompt_template: string
}

const defaultSkills: readonly DefaultSkill[] = [
  {
    name: 'continuity',
    description: 'Check continuity with the approved chapter context.',
    prompt_template: 'Keep character facts, chronology, and causal relations consistent.',
  },
  {
    name: 'clarity',
    description: 'Improve clarity without changing established facts.',
    prompt_template: 'Prefer concrete wording, readable sentence boundaries, and clear references.',
  },
  {
    name: 'style',
    description: 'Keep the configured narrative voice consistent.',
    prompt_template: 'Preserve the existing voice and emotional distance unless the instruction says otherwise.',
  },
  {
    name: 'pacing',
    description: 'Check paragraph rhythm and scene pacing.',
    prompt_template: 'Remove accidental repetition and keep scene movement proportional to its purpose.',
  },
]

const foreshadowTransitions: Record<ForeshadowStatus, readonly ForeshadowStatus[]> = {
  suggested: ['planned', 'abandoned'],
  planned: ['planted', 'abandoned'],
  planted: ['active', 'revealed', 'paid_off', 'resolved', 'abandoned'],
  active: ['revealed', 'paid_off', 'resolved', 'abandoned'],
  revealed: ['paid_off', 'resolved', 'abandoned'],
  paid_off: [],
  resolved: [],
  abandoned: [],
}

const eventTypes: Record<ForeshadowStatus, ForeshadowEventType> = {
  suggested: 'suggested',
  planned: 'planned',
  planted: 'planted',
  active: 'activated',
  revealed: 'revealed',
  paid_off: 'paid_off',
  resolved: 'resolved',
  abandoned: 'abandoned',
}

function emptyDiff(): ChapterDiff {
  return {
    changes: [],
    unchanged_count: 0,
    added_count: 0,
    removed_count: 0,
    modified_count: 0,
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}

function signalFrom(options: NarrativeRunOptions): AbortSignal {
  return options.signal ?? new AbortController().signal
}

function blockToJson(block: {
  id: string
  ordinal: number
  kind: string
  text: string
  fingerprint: string
}): JsonObject {
  return {
    id: block.id,
    ordinal: block.ordinal,
    kind: block.kind,
    text: block.text,
    fingerprint: block.fingerprint,
  }
}

function diffToJson(diff: ChapterDiff): JsonObject {
  return {
    changes: diff.changes.map((change) => ({
      block_id: change.block_id,
      kind: change.kind,
      before: change.before ? blockToJson(change.before) : null,
      after: change.after ? blockToJson(change.after) : null,
    })),
    unchanged_count: diff.unchanged_count,
    added_count: diff.added_count,
    removed_count: diff.removed_count,
    modified_count: diff.modified_count,
  }
}

function checkpointFor(
  operation: NarrativeOperationCheckpoint['operation'],
  sourceContent: string,
  generatedContent: string,
  status: NarrativeOperationCheckpoint['status'],
  revisionId: string | null,
  error: string | null,
  now: string,
  applied = false,
): NarrativeOperationCheckpoint {
  return {
    schema_version: 1,
    operation,
    source_content: sourceContent,
    generated_content: generatedContent,
    revision_id: revisionId,
    status,
    error,
    applied,
    updated_at: now,
  }
}

function notifyCheckpoint(
  options: NarrativeRunOptions,
  checkpoint: NarrativeOperationCheckpoint,
): void {
  options.on_checkpoint?.(checkpoint)
}

function parsedMemoryToInput(
  projectId: string,
  chapterId: string,
  sourceVersionId: string | null | undefined,
  item: ParsedMemoryProposal,
): Parameters<NarrativeWorkbenchStores['memories']['createProposal']>[0] {
  return {
    project_id: projectId,
    source_chapter_id: chapterId,
    source_version_id: sourceVersionId ?? null,
    memory_type: item.memory_type,
    title: item.title,
    content: item.content,
    confidence: item.confidence,
    evidence: item.evidence,
  }
}

function uniqueMemoryItems(items: readonly ParsedMemoryProposal[]): ParsedMemoryProposal[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.memory_type}:${item.title}:${item.content}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function heuristicMemoryItems(content: string): ParsedMemoryProposal[] {
  return uniqueMemoryItems(
    splitNarrativeParagraphs(content)
      .filter((paragraph) => paragraph.length >= 8)
      .slice(0, 12)
      .map((paragraph, index) => ({
        memory_type: 'event',
        title: `Memory candidate ${index + 1}`,
        content: paragraph,
        confidence: Math.min(0.85, 0.45 + paragraph.length / 400),
        evidence: [paragraph],
      })),
  )
}

function heuristicForeshadow(content: string, endingHook: string): ForeshadowSuggestion[] {
  const paragraphs = splitNarrativeParagraphs(content)
  const evidence = endingHook.trim() || (paragraphs.length > 0 ? paragraphs[paragraphs.length - 1] : '')
  if (!evidence) return []
  return [{
    title: 'Unresolved thread',
    description: evidence,
    importance: 1,
    planned_payoff_chapter_id: null,
    evidence: [evidence],
  }]
}

function buildMemoryPrompt(content: string): string {
  return [
    'Extract only durable narrative facts from the chapter text.',
    'Return JSON in the form {"memories":[{"memory_type":"event","title":"<title>","content":"<content>","confidence":0.0,"evidence":["<quote>"]}]}.' ,
    'Do not invent facts and do not include private information that is not present in the text.',
    `Chapter text:\n${content}`,
  ].join('\n')
}

function buildForeshadowPrompt(content: string, endingHook: string): string {
  return [
    'Suggest only unresolved story threads supported by the supplied chapter.',
    'Return JSON in the form {"suggestions":[{"title":"<title>","description":"<description>","importance":1,"evidence":["<quote>"]}]}.' ,
    `Ending hook:\n${endingHook}`,
    `Chapter text:\n${content}`,
  ].join('\n')
}

function buildParagraphPrompt(
  blockText: string,
  previousText: string,
  nextText: string,
  instruction: string,
): string {
  return [
    'Revise one quoted chapter paragraph while preserving its facts and narrative point of view.',
    `Instruction: ${instruction}`,
    `Previous context: ${previousText || '(none)'}`,
    `Target paragraph: ${blockText}`,
    `Next context: ${nextText || '(none)'}`,
    'Return only the revised paragraph.',
  ].join('\n')
}

function buildPolishPrompt(
  content: string,
  skills: readonly ProjectSkillState[],
  instruction: string,
): string {
  const skillPrompts = skills
    .filter((skill) => skill.enabled)
    .map((skill) => `- ${skill.name}: ${skill.prompt_template}`)
    .join('\n')
  return [
    'Polish the chapter without adding unsupported facts or changing its plot.',
    skillPrompts ? `Enabled skills:\n${skillPrompts}` : 'No optional skill is enabled.',
    instruction ? `Additional instruction: ${instruction}` : '',
    `Chapter text:\n${content}`,
    'Return the complete polished chapter only.',
  ].filter((line) => line.length > 0).join('\n')
}

export class NarrativeWorkbenchService {
  private readonly now: () => string
  private readonly memoryProposalRuns = new Map<string, Promise<MemoryExtractionResult>>()
  private readonly foreshadowRuns = new Map<string, Promise<ForeshadowSuggestionResult>>()

  public constructor(private readonly options: NarrativeWorkbenchServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString())
  }

  public listMemories(projectId: string): ReturnType<NarrativeWorkbenchStores['memories']['listByProject']> {
    this.requireProject(projectId)
    return this.options.stores.memories.listByProject(projectId)
  }

  public listMemoryProposals(projectId: string): NarrativeMemoryProposal[] {
    this.requireProject(projectId)
    return this.options.stores.memories.listProposalsByProject(projectId)
  }

  public async extractMemoryProposals(
    projectId: string,
    chapterId: string,
    options: MemoryExtractionOptions = {},
  ): Promise<MemoryExtractionResult> {
    const key = `${projectId}:${chapterId}:${options.source_version_id ?? 'chapter'}`
    const running = this.memoryProposalRuns.get(key)
    if (running) return running
    const operation = this.extractMemoryProposalsOnce(projectId, chapterId, options)
      .finally(() => {
        if (this.memoryProposalRuns.get(key) === operation) {
          this.memoryProposalRuns.delete(key)
        }
      })
    this.memoryProposalRuns.set(key, operation)
    return operation
  }

  private async extractMemoryProposalsOnce(
    projectId: string,
    chapterId: string,
    options: MemoryExtractionOptions,
  ): Promise<MemoryExtractionResult> {
    const chapter = this.requireChapter(projectId, chapterId)
    const existing = this.options.stores.memories
      .listProposalsByChapter(projectId, chapterId)
      .filter((proposal) =>
        options.source_version_id
          ? proposal.source_version_id === options.source_version_id
          : proposal.source_version_id === null,
      )
    if (existing.length > 0) {
      return { proposals: existing, used_fallback: false, error: null }
    }
    const content = options.content ?? chapter.content
    const signal = signalFrom(options)
    let parsed: ParsedMemoryProposal[] = []
    let usedFallback = false
    let error: string | null = null

    if (options.generator && !signal.aborted) {
      try {
        const result = await options.generator.generate({
          operation: 'memory-extraction',
          prompt: buildMemoryPrompt(content),
          signal,
        })
        parsed = uniqueMemoryItems(parseMemoryProposalText(result.text))
        if (parsed.length === 0) {
          usedFallback = true
          error = 'Memory extraction returned no valid proposals'
        }
      } catch (generationError) {
        usedFallback = true
        error = errorText(generationError)
      }
    }

    if (signal.aborted) {
      usedFallback = true
      error = error ?? 'Memory extraction was cancelled'
    }
    if (parsed.length === 0) parsed = heuristicMemoryItems(content)

    const proposals = parsed.map((item) =>
      this.options.stores.memories.createProposal(
        parsedMemoryToInput(projectId, chapter.id, options.source_version_id, item),
      ),
    )
    return { proposals, used_fallback: usedFallback, error }
  }

  public approveMemoryProposal(projectId: string, proposalId: string) {
    const proposal = this.options.stores.memories.getProposalById(proposalId)
    if (!proposal || proposal.project_id !== projectId) {
      throw new EntityNotFoundError('Narrative memory proposal', proposalId)
    }
    const memory = this.options.stores.memories.approveProposal(proposalId)
    if (!memory) throw new NarrativeBoundaryError(`Memory proposal cannot be approved: ${proposalId}`)
    return memory
  }

  public rejectMemoryProposal(projectId: string, proposalId: string): NarrativeMemoryProposal {
    const proposal = this.options.stores.memories.getProposalById(proposalId)
    if (!proposal || proposal.project_id !== projectId) {
      throw new EntityNotFoundError('Narrative memory proposal', proposalId)
    }
    const rejected = this.options.stores.memories.setProposalStatus(proposalId, 'rejected')
    if (!rejected) throw new EntityNotFoundError('Narrative memory proposal', proposalId)
    return rejected
  }

  public listForeshadows(projectId: string): Foreshadow[] {
    this.requireProject(projectId)
    return this.options.stores.foreshadows.listByProject(projectId)
  }

  public listForeshadowEvents(projectId: string, foreshadowId: string) {
    const foreshadow = this.requireForeshadow(projectId, foreshadowId)
    return this.options.stores.foreshadows.listEvents(foreshadow.id)
  }

  public async suggestForeshadows(
    projectId: string,
    chapterId: string,
    options: ForeshadowSuggestionOptions = {},
  ): Promise<ForeshadowSuggestionResult> {
    const key = `${projectId}:${chapterId}`
    const running = this.foreshadowRuns.get(key)
    if (running) return running
    const operation = this.suggestForeshadowsOnce(projectId, chapterId, options)
      .finally(() => {
        if (this.foreshadowRuns.get(key) === operation) {
          this.foreshadowRuns.delete(key)
        }
      })
    this.foreshadowRuns.set(key, operation)
    return operation
  }

  private async suggestForeshadowsOnce(
    projectId: string,
    chapterId: string,
    options: ForeshadowSuggestionOptions,
  ): Promise<ForeshadowSuggestionResult> {
    const chapter = this.requireChapter(projectId, chapterId)
    const existing = this.options.stores.foreshadows
      .listByProject(projectId)
      .filter((item) => item.metadata.source_chapter_id === chapterId)
    if (existing.length > 0) {
      return { suggestions: existing, used_fallback: false, error: null }
    }
    const content = options.content ?? chapter.content
    const endingHook = options.ending_hook ?? ''
    const signal = signalFrom(options)
    let suggestions: ForeshadowSuggestion[] = []
    let usedFallback = false
    let error: string | null = null

    if (options.generator && !signal.aborted) {
      try {
        const result = await options.generator.generate({
          operation: 'foreshadow-suggestion',
          prompt: buildForeshadowPrompt(content, endingHook),
          signal,
        })
        suggestions = parseForeshadowSuggestionText(result.text)
        if (suggestions.length === 0) {
          usedFallback = true
          error = 'Foreshadow suggestion returned no valid suggestions'
        }
      } catch (generationError) {
        usedFallback = true
        error = errorText(generationError)
      }
    }

    if (signal.aborted) {
      usedFallback = true
      error = error ?? 'Foreshadow suggestion was cancelled'
    }
    if (suggestions.length === 0) suggestions = heuristicForeshadow(content, endingHook)

    const created = suggestions.map((suggestion) => {
      const input: CreateForeshadowInput = {
        project_id: projectId,
        title: suggestion.title,
        description: suggestion.description,
        status: 'suggested',
        planned_payoff_chapter_id:
          suggestion.planned_payoff_chapter_id ?? options.planned_payoff_chapter_id ?? null,
        importance: suggestion.importance,
        metadata: {
          source: 'chapter-analysis',
          source_chapter_id: chapterId,
          evidence: suggestion.evidence,
        },
      }
      const foreshadow = this.options.stores.foreshadows.create(input)
      this.options.stores.foreshadows.addEvent(
        foreshadow.id,
        chapterId,
        'suggested',
        suggestion.description,
      )
      return foreshadow
    })
    return { suggestions: created, used_fallback: usedFallback, error }
  }

  public transitionForeshadow(
    projectId: string,
    foreshadowId: string,
    nextStatus: ForeshadowStatus,
    note = '',
    chapterId: string | null = null,
  ): Foreshadow {
    const current = this.requireForeshadow(projectId, foreshadowId)
    if (!foreshadowTransitions[current.status].includes(nextStatus)) {
      throw new NarrativeStatusTransitionError(
        'Foreshadow',
        current.id,
        current.status,
        nextStatus,
      )
    }
    const actualPayoffChapterId =
      nextStatus === 'paid_off' || nextStatus === 'resolved' ? chapterId : undefined
    const next = this.options.stores.foreshadows.updateStatus(
      current.id,
      nextStatus,
      actualPayoffChapterId,
    )
    if (!next) throw new EntityNotFoundError('Foreshadow', foreshadowId)
    this.options.stores.foreshadows.addEvent(
      next.id,
      chapterId,
      eventTypes[nextStatus],
      note,
    )
    return next
  }

  public listSkills(projectId: string): ProjectSkillState[] {
    this.requireProject(projectId)
    const definitions = this.ensureDefaultSkills()
    const states = new Map(
      this.options.stores.skills.listByProject(projectId).map((state) => [state.id, state]),
    )
    return definitions.map((definition) => {
      const state = states.get(definition.id)
      return {
        ...definition,
        project_id: projectId,
        enabled: state?.enabled ?? true,
        config: state?.config ?? {},
      }
    })
  }

  public setSkillEnabled(
    projectId: string,
    skillName: string,
    enabled: boolean,
    config?: JsonObject,
  ) {
    this.requireProject(projectId)
    const definition = this.ensureDefaultSkills().find((skill) => skill.name === skillName)
    if (!definition) throw new EntityNotFoundError('Skill', skillName)
    return this.options.stores.skills.setProjectSkill(projectId, definition.id, enabled, config)
  }

  public listRevisions(projectId: string, chapterId: string): ChapterRevision[] {
    const chapter = this.requireChapter(projectId, chapterId)
    return this.options.stores.revisions.listByChapter(chapter.id)
  }

  /** Lookup revision already persisted for a task (idempotent finish path). */
  public getRevisionByTaskId(taskId: string): ChapterRevision | null {
    return this.options.stores.revisions.getByTaskId?.(taskId) ?? null
  }

  public getReportByTaskId(taskId: string): PostprocessReport | null {
    return this.options.stores.reports.getByTaskId?.(taskId) ?? null
  }

  /**
   * Ensure a postprocess report is linked to the task without re-running the model.
   * Idempotent: returns the existing report when task_id already has one.
   */
  public ensureReportForTask(
    projectId: string,
    chapterId: string,
    taskId: string,
    revisionId: string,
    reportType: 'chapter-polish' | 'paragraph-revision' = 'chapter-polish',
  ): PostprocessReport | null {
    return this.createReport(
      projectId,
      chapterId,
      taskId,
      reportType,
      'completed',
      `${reportType} completed`,
      { revision_id: revisionId },
    )
  }

  public getRevision(projectId: string, revisionId: string): ChapterRevision {
    const revision = this.options.stores.revisions.getById(revisionId)
    if (!revision) throw new EntityNotFoundError('Chapter revision', revisionId)
    this.requireChapter(projectId, revision.chapter_id)
    return revision
  }

  public getChapterBlocks(projectId: string, chapterId: string) {
    const source = this.getRevisionSource(projectId, chapterId)
    return source.blocks
  }

  public diffRevisions(
    projectId: string,
    fromRevisionId: string,
    toRevisionId: string,
  ): ChapterRevisionDiffResult {
    const from = this.getRevision(projectId, fromRevisionId)
    const to = this.getRevision(projectId, toRevisionId)
    if (from.chapter_id !== to.chapter_id) {
      throw new NarrativeBoundaryError('Chapter revisions must belong to the same chapter')
    }
    return {
      from_revision_id: from.id,
      to_revision_id: to.id,
      diff: diffChapterBlocks(from.blocks, to.blocks),
    }
  }

  public diffVersions(
    projectId: string,
    fromVersionId: string,
    toVersionId: string,
  ): ChapterVersionDiffResult {
    const from = this.requireVersion(projectId, fromVersionId)
    const to = this.requireVersion(projectId, toVersionId)
    if (from.chapter_id !== to.chapter_id) {
      throw new NarrativeBoundaryError('Chapter versions must belong to the same chapter')
    }
    const before = assignStableBlockIds(from.chapter_id, from.content)
    const after = assignStableBlockIds(from.chapter_id, to.content, before)
    return {
      from_version_id: from.id,
      to_version_id: to.id,
      diff: diffChapterBlocks(before, after),
    }
  }

  public applyRevision(projectId: string, revisionId: string): Chapter {
    const revision = this.getRevision(projectId, revisionId)
    const chapter = this.requireChapter(projectId, revision.chapter_id)
    // Idempotent: if chapter already matches the revision and it is current, skip write.
    if (
      chapter.content === revision.content
      && revision.is_current
      && chapter.status === 'completed'
    ) {
      return chapter
    }
    const updated = this.options.stores.chapters.update(
      chapter.id,
      {
        content: revision.content,
        synopsis: revision.summary,
        status: 'completed',
        actual_words: revision.content.length,
      },
      chapter.version,
    )
    if (!updated) throw new EntityNotFoundError('Chapter', chapter.id)
    this.options.stores.revisions.setCurrent(revision.id)
    return updated
  }

  /**
   * Recovery-only compare-and-apply boundary. A task's old auto_apply consent
   * cannot overwrite chapter text changed after the checkpoint was persisted.
   */
  public applyRecoveredRevision(
    projectId: string,
    revisionId: string,
    expectedSourceContent: string | null,
  ): Chapter {
    const revision = this.getRevision(projectId, revisionId)
    const latest = this.options.stores.revisions.listByChapter(revision.chapter_id)[0]
    if (!revision.is_current || !latest || latest.id !== revision.id) {
      throw new NarrativeBoundaryError('Recovered revision is no longer latest and current')
    }
    const chapter = this.requireChapter(projectId, revision.chapter_id)
    if (expectedSourceContent === null) {
      throw new NarrativeBoundaryError(
        'Recovered revision has no source-content evidence; explicit review is required',
      )
    }
    if (
      chapter.content === revision.content
      && chapter.status === 'completed'
    ) {
      return chapter
    }
    if (chapter.content !== expectedSourceContent) {
      throw new NarrativeBoundaryError(
        'Chapter changed after the revision checkpoint; explicit review is required',
      )
    }
    return this.applyRevision(projectId, revisionId)
  }

  public async reviseParagraph(
    projectId: string,
    chapterId: string,
    blockId: string,
    instruction: string,
    generator: NarrativeTextGenerator,
    options: ParagraphRevisionOptions = {},
  ): Promise<ChapterRevisionOperationResult> {
    const source = this.getRevisionSource(projectId, chapterId)
    const block = findChapterBlock(source.blocks, blockId)
    if (!block) throw new NarrativeBoundaryError(`Chapter block not found: ${blockId}`)
    const index = source.blocks.findIndex((item) => item.id === block.id)
    const run = await this.runText(
      'paragraph-revision',
      buildParagraphPrompt(
        block.text,
        index > 0 ? source.blocks[index - 1].text : '',
        index + 1 < source.blocks.length ? source.blocks[index + 1].text : '',
        instruction,
      ),
      block.text,
      generator,
      options,
      source.content,
      'paragraph_revision',
    )
    if (run.status !== 'completed') {
      return this.fallbackResult(
        projectId,
        source,
        run.status,
        run.error,
        'paragraph-revision',
        options,
      )
    }
    const revisedBlocks = replaceChapterBlock(source.blocks, block.id, run.text)
    return this.saveRevisionResult(
      projectId,
      source,
      revisedBlocks,
      instruction,
      'paragraph_revision',
      'paragraph-revision',
      options,
    )
  }

  public async polishChapter(
    projectId: string,
    chapterId: string,
    generator: NarrativeTextGenerator,
    options: ChapterPolishOptions = {},
  ): Promise<ChapterRevisionOperationResult> {
    const source = this.getRevisionSource(projectId, chapterId, options.source_revision_id)
    const skills = this.listSkills(projectId)
    const run = await this.runText(
      'chapter-polish',
      buildPolishPrompt(source.content, skills, options.instruction ?? ''),
      source.content,
      generator,
      options,
      source.content,
      'chapter_polish',
    )
    if (run.status !== 'completed') {
      return this.fallbackResult(
        projectId,
        source,
        run.status,
        run.error,
        'chapter-polish',
        options,
      )
    }
    const polished = run.text.trim()
    if (!polished) {
      return this.fallbackResult(
        projectId,
        source,
        'fallback',
        'Polished chapter is empty',
        'chapter-polish',
        options,
      )
    }
    const revisedBlocks = assignStableBlockIds(source.chapter.id, polished, source.blocks)
    return this.saveRevisionResult(
      projectId,
      source,
      revisedBlocks,
      options.instruction ?? 'Polish chapter with enabled skills',
      'polish',
      'chapter-polish',
      options,
    )
  }

  private getRevisionSource(
    projectId: string,
    chapterId: string,
    revisionId?: string | null,
  ): RevisionSource {
    const chapter = this.requireChapter(projectId, chapterId)
    const revision = revisionId
      ? this.getRevision(projectId, revisionId)
      : this.options.stores.revisions.getCurrentByChapter(chapter.id)
    if (revision && revision.chapter_id !== chapter.id) {
      throw new NarrativeBoundaryError('Revision does not belong to the requested chapter')
    }
    const content = revision?.content ?? chapter.content
    const blocks = revision?.blocks.length
      ? revision.blocks
      : assignStableBlockIds(chapter.id, content)
    return { chapter, revision, content, blocks }
  }

  private async runText(
    operation: NarrativeTextGenerationRequest['operation'],
    prompt: string,
    existingText: string,
    generator: NarrativeTextGenerator,
    options: NarrativeRunOptions,
    sourceContent: string,
    checkpointOperation: NarrativeOperationCheckpoint['operation'],
  ): Promise<TextRunResult> {
    const signal = signalFrom(options)
    let streamed = ''
    const emit = (text: string): void => {
      streamed += text
      options.on_chunk?.(operation, text)
      notifyCheckpoint(
        options,
        checkpointFor(
          checkpointOperation,
          sourceContent,
          streamed,
          'running',
          null,
          null,
          this.now(),
        ),
      )
    }
    try {
      if (signal.aborted) return { status: 'cancelled', text: existingText, error: 'Operation was cancelled' }
      const result: NarrativeTextGenerationResult = await generator.generate({
        operation,
        prompt,
        signal,
        existing_text: options.existing_text ?? undefined,
        on_chunk: emit,
      })
      if (signal.aborted) {
        const message = 'Operation was cancelled'
        notifyCheckpoint(
          options,
          checkpointFor(checkpointOperation, sourceContent, streamed, 'cancelled', null, message, this.now()),
        )
        return { status: 'cancelled', text: existingText, error: message }
      }
      const text = result.text.trim() || streamed.trim()
      if (!text) {
        const error = 'Text generation returned empty content'
        notifyCheckpoint(
          options,
          checkpointFor(checkpointOperation, sourceContent, '', 'fallback', null, error, this.now()),
        )
        return { status: 'fallback', text: existingText, error }
      }
      notifyCheckpoint(
        options,
        checkpointFor(checkpointOperation, sourceContent, text, 'running', null, null, this.now()),
      )
      return { status: 'completed', text, error: null }
    } catch (error) {
      if (isAbortError(error, signal)) {
        const message = errorText(error)
        notifyCheckpoint(
          options,
          checkpointFor(checkpointOperation, sourceContent, streamed, 'cancelled', null, message, this.now()),
        )
        return { status: 'cancelled', text: existingText, error: message }
      }
      const message = errorText(error)
      notifyCheckpoint(
        options,
        checkpointFor(checkpointOperation, sourceContent, streamed, 'fallback', null, message, this.now()),
      )
      return { status: 'fallback', text: existingText, error: message }
    }
  }

  private saveRevisionResult(
    projectId: string,
    source: RevisionSource,
    blocks: ReturnType<typeof assignStableBlockIds>,
    reason: string,
    operation: ChapterRevisionOperation,
    reportType: 'chapter-polish' | 'paragraph-revision',
    options: NarrativeRunOptions & { task_id?: string | null },
  ): ChapterRevisionOperationResult {
    const content = chapterBlocksToContent(blocks)
    const diff = diffChapterBlocks(source.blocks, blocks)
    return this.commit(options, () => {
      const taskId = options.task_id ?? null
      if (taskId) {
        const existing = this.options.stores.revisions.getByTaskId?.(taskId)
          ?? null
        if (existing) {
          const report = this.options.stores.reports.getByTaskId?.(taskId)
            ?? this.createReport(
              projectId,
              source.chapter.id,
              taskId,
              reportType,
              'completed',
              `${operation} completed`,
              { revision_id: existing.id, diff: diffToJson(diff) },
            )
          notifyCheckpoint(
            options,
            checkpointFor(
              operation === 'polish' ? 'chapter_polish' : 'paragraph_revision',
              source.content,
              existing.content,
              'completed',
              existing.id,
              null,
              this.now(),
            ),
          )
          return {
            status: 'completed',
            content: existing.content,
            revision: existing,
            diff,
            report,
            error: null,
          }
        }
      }
      const revision = this.options.stores.revisions.create({
        chapter_id: source.chapter.id,
        parent_revision_id: source.revision?.id ?? null,
        task_id: taskId,
        content,
        summary: source.chapter.synopsis,
        reason,
        operation,
        blocks,
      })
      const current = this.options.stores.revisions.setCurrent(revision.id) ?? revision
      const report = this.createReport(
        projectId,
        source.chapter.id,
        taskId,
        reportType,
        'completed',
        `${operation} completed`,
        { revision_id: current.id, diff: diffToJson(diff) },
      )
      notifyCheckpoint(
        options,
        checkpointFor(
          operation === 'polish' ? 'chapter_polish' : 'paragraph_revision',
          source.content,
          content,
          'completed',
          current.id,
          null,
          this.now(),
        ),
      )
      return {
        status: 'completed',
        content,
        revision: current,
        diff,
        report,
        error: null,
      }
    })
  }

  private fallbackResult(
    projectId: string,
    source: RevisionSource,
    status: 'fallback' | 'cancelled',
    error: string | null,
    reportType: 'chapter-polish' | 'paragraph-revision',
    options: NarrativeRunOptions & { task_id?: string | null },
  ): ChapterRevisionOperationResult {
    const actualStatus = status === 'cancelled' ? 'cancelled' : 'fallback'
    const fallbackError = error ?? `${reportType} used the original content`
    const report = actualStatus === 'fallback'
      ? this.commit(
          options,
          () => this.createReport(
            projectId,
            source.chapter.id,
            options.task_id ?? null,
            reportType,
            'fallback',
            `${reportType} fell back to the original content`,
            { error: fallbackError },
          ),
        )
      : null
    return {
      status: actualStatus,
      content: source.content,
      revision: null,
      diff: emptyDiff(),
      report,
      error: fallbackError,
    }
  }

  private commit<T>(options: NarrativeRunOptions, operation: () => T): T {
    return options.commit ? options.commit(operation) : operation()
  }

  private createReport(
    projectId: string,
    chapterId: string,
    taskId: string | null,
    reportType: 'chapter-polish' | 'paragraph-revision',
    status: 'completed' | 'fallback',
    summary: string,
    details: JsonObject,
  ): PostprocessReport | null {
    try {
      if (taskId) {
        const existing = this.options.stores.reports.getByTaskId?.(taskId) ?? null
        if (existing) return existing
      }
      return this.options.stores.reports.create({
        project_id: projectId,
        chapter_id: chapterId,
        task_id: taskId,
        report_type: reportType,
        status,
        summary,
        details,
      })
    } catch {
      if (taskId) {
        return this.options.stores.reports.getByTaskId?.(taskId) ?? null
      }
      return null
    }
  }

  private ensureDefaultSkills() {
    return defaultSkills.map((skill) => {
      const existing = this.options.stores.skills.getByName(skill.name)
      if (existing) return existing
      return this.options.stores.skills.create({
        name: skill.name,
        description: skill.description,
        version: '1',
        prompt_template: skill.prompt_template,
        config_schema: {},
      })
    })
  }

  private requireProject(projectId: string): { id: string; status: string } {
    const project = this.options.stores.project.getProject(projectId)
    if (!project) throw new EntityNotFoundError('Project', projectId)
    return project
  }

  private requireChapter(projectId: string, chapterId: string): Chapter {
    const chapter = this.options.stores.chapters.getById(chapterId)
    if (!chapter || chapter.project_id !== projectId) {
      throw new EntityNotFoundError('Chapter', chapterId)
    }
    return chapter
  }

  private requireVersion(projectId: string, versionId: string): ChapterVersion {
    const version = this.options.stores.versions.getById(versionId)
    if (!version) throw new EntityNotFoundError('Chapter version', versionId)
    this.requireChapter(projectId, version.chapter_id)
    return version
  }

  private requireForeshadow(projectId: string, foreshadowId: string): Foreshadow {
    const foreshadow = this.options.stores.foreshadows.getById(foreshadowId)
    if (!foreshadow || foreshadow.project_id !== projectId) {
      throw new EntityNotFoundError('Foreshadow', foreshadowId)
    }
    return foreshadow
  }
}

export type { UpdateChapterInput }
