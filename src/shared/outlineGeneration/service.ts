import type { ChapterStore } from '../chapterGeneration'
import {
  assembleOutlineCompilerInput, compileTraceToJson, filterApprovedMemories, filterOpenForeshadows,
  OUTLINE_GENERATION_SYSTEM_PROMPT, type ChapterGenerationModelParams, type ContextCompute,
} from '../chapterGeneration'
import { compileContext, CONTEXT_PROMPT_VERSION, ContextBudgetExceededError, type CompiledContext, type ContextCompilerInput } from '../contextCompiler'
import type { ForeshadowStore, NarrativeMemoryStore } from '../narrativeWorkbench'
import type { NovelProjectService, VolumeOutline } from '../novelProject'
import { parseOutlineCheckpoint, parseOutlineSourceBoundary, type OutlineCheckpoint } from './checkpoint'

export { OUTLINE_GENERATION_SYSTEM_PROMPT }

export interface OutlineGenerationRequest {
  projectId: string
  outlineId: string
  modelParams: ChapterGenerationModelParams
  debug: boolean
}

export class OutlineGenerationBoundaryError extends Error {}

export interface OutlineApplyValidation {
  readonly source_snapshot: string
}

type OutlineProjectPort = Pick<NovelProjectService,
  'getVolumeOutline' | 'getOutlineContext' | 'getVolume' | 'listVolumes' | 'listChapterOutlines' | 'updateVolumeOutline'>

interface OutlinePreparationSource {
  checkpoint: OutlineCheckpoint | null
  input: ContextCompilerInput
  snapshot: string
}

function checkpointFingerprint(checkpoint: OutlineCheckpoint | null): string {
  // Keep the full source snapshot as a separately compared immutable string.
  // Re-escaping several MiB of snapshot inside JSON is unnecessary main-thread work.
  return checkpoint === null ? 'null' : JSON.stringify({ ...checkpoint, source_snapshot: '' })
}

export class OutlineGenerationService {
  private readonly applyValidations = new WeakMap<OutlineApplyValidation, {
    checkpoint: string; request: string; taskId: string
  }>()

  public constructor(private readonly stores: {
    project: OutlineProjectPort
    chapters: ChapterStore
    memories: Pick<NarrativeMemoryStore, 'listByProject'>
    foreshadows: Pick<ForeshadowStore, 'listByProject'>
    computeContext?: ContextCompute
  }) {}

  private load(request: OutlineGenerationRequest): { input: ContextCompilerInput; snapshot: string; outline: VolumeOutline } {
    const project = this.stores.project
    const outline = project.getVolumeOutline(request.projectId, request.outlineId)
    if (outline.status !== 'draft') throw new OutlineGenerationBoundaryError('卷大纲必须是草稿；确认或锁定后禁止生成覆盖。')
    const context = project.getOutlineContext(request.projectId, outline.source_material_ids)
    if (context.project.status !== 'active') throw new OutlineGenerationBoundaryError('Project must be active')
    const volume = project.getVolume(request.projectId, outline.volume_id)
    const input = assembleOutlineCompilerInput(context, volume, outline, request.modelParams, request.debug)
    // Chapters and chapter outlines have independent ids. Their project-wide
    // unique chapter_number is the same association used by chapter generation.
    const priorVolumeIds = new Set(project.listVolumes(request.projectId)
      .filter((item) => item.volume_number < volume.volume_number).map((item) => item.id))
    const priorChapterNumbers = new Set(project.listChapterOutlines(request.projectId)
      .filter((chapter) => priorVolumeIds.has(chapter.volume_id)).map((chapter) => chapter.chapter_number))
    input.prior_chapters = this.stores.chapters.listByProject(request.projectId)
      .filter((chapter) => chapter.status === 'completed' && priorChapterNumbers.has(chapter.chapter_number))
      .map((chapter) => ({ id: chapter.id, chapter_number: chapter.chapter_number, title: chapter.title,
        synopsis: chapter.synopsis, content: chapter.content, status: chapter.status }))
    input.narrative_memories = filterApprovedMemories(this.stores.memories.listByProject(request.projectId))
    input.foreshadows = filterOpenForeshadows(this.stores.foreshadows.listByProject(request.projectId))
    return { input, outline, snapshot: JSON.stringify({
      prompt_version: CONTEXT_PROMPT_VERSION, input,
      target: { id: outline.id, version: outline.version, status: outline.status },
      project_version: context.project.version, config_version: context.config.version, volume_version: volume.version,
    }) }
  }

  public prepare(request: OutlineGenerationRequest, saved: OutlineCheckpoint | null, taskId?: string): {
    checkpoint: OutlineCheckpoint; prompt: string | null
  } {
    const source = this.preparationSource(request, saved, taskId)
    return this.finishPreparation(request, source, compileContext(source.input))
  }

  public async prepareAsync(
    request: OutlineGenerationRequest,
    saved: OutlineCheckpoint | null,
    taskId?: string,
    signal?: AbortSignal,
  ): Promise<{ checkpoint: OutlineCheckpoint; prompt: string | null }> {
    if (signal?.aborted) throw new Error('Outline context compilation was cancelled')
    const source = this.preparationSource(request, saved, taskId)
    const savedFingerprint = checkpointFingerprint(saved)
    const savedSnapshot = saved?.source_snapshot
    const assertCurrent = (): void => {
      if (signal?.aborted) throw new Error('Outline context compilation was cancelled')
      if (saved?.source_snapshot !== savedSnapshot || checkpointFingerprint(saved) !== savedFingerprint
        || this.preparationSource(request, saved, taskId, source.checkpoint).snapshot !== source.snapshot) {
        throw new OutlineGenerationBoundaryError('大纲来源在编译期间发生变化，已拒绝使用旧上下文。')
      }
    }
    let compiled: CompiledContext
    try {
      compiled = this.stores.computeContext
        ? await this.stores.computeContext(source.input, { signal })
        : compileContext(source.input)
    } catch (error) {
      assertCurrent()
      throw error
    }
    assertCurrent()
    return this.finishPreparation(request, source, compiled)
  }

  private preparationSource(
    request: OutlineGenerationRequest,
    saved: OutlineCheckpoint | null,
    taskId?: string,
    validatedCheckpoint?: OutlineCheckpoint | null,
  ): OutlinePreparationSource {
    const checkpoint = validatedCheckpoint === undefined
      ? saved === null ? null : parseOutlineCheckpoint(saved)
      : validatedCheckpoint
    if (saved !== null && !checkpoint) {
      throw new OutlineGenerationBoundaryError('大纲结果或 compiler metadata 损坏，已拒绝恢复。')
    }
    const loaded = this.load(request)
    let input = loaded.input
    let snapshot = loaded.snapshot
    if (checkpoint?.stage === 'applied') {
      const source = parseOutlineSourceBoundary(checkpoint.source_snapshot, request.projectId, request.outlineId)
      const proposal = checkpoint.proposal
      if (!source || !proposal || !taskId?.trim()
        || loaded.outline.version !== checkpoint.applied_version
        || loaded.outline.metadata.generated_outline_task_id !== taskId
        || loaded.outline.summary !== proposal.summary || loaded.outline.theme !== proposal.theme
        || loaded.outline.main_conflict !== proposal.main_conflict || loaded.outline.ending !== proposal.ending
        || JSON.stringify(loaded.outline.key_turning_points) !== JSON.stringify(proposal.key_turning_points)) {
        throw new OutlineGenerationBoundaryError('已采用的大纲与任务结果不一致，已拒绝恢复覆盖。')
      }
      input = { ...input, volume_outline: source.volumeOutline }
      const current = JSON.parse(snapshot) as { input: ContextCompilerInput; target: { version: number } }
      current.input = input
      current.target.version = source.targetVersion
      snapshot = JSON.stringify(current)
    }
    if (checkpoint && (checkpoint.source_snapshot !== snapshot || checkpoint.project_id !== request.projectId || checkpoint.outline_id !== request.outlineId)) {
      throw new OutlineGenerationBoundaryError('大纲来源、版本或模型参数已变化，请新建任务。')
    }
    return { checkpoint, input, snapshot }
  }

  private finishPreparation(
    request: OutlineGenerationRequest,
    { checkpoint, snapshot }: OutlinePreparationSource,
    compiled: CompiledContext,
  ): { checkpoint: OutlineCheckpoint; prompt: string | null } {
    const stage_compiles = { outline: {
      prompt_version: compiled.metadata.prompt_version, model_params: { ...request.modelParams },
      trace: compileTraceToJson(compiled.trace),
    } }
    if (checkpoint && JSON.stringify(checkpoint.stage_compiles) !== JSON.stringify(stage_compiles)) {
      throw new OutlineGenerationBoundaryError('大纲 compiler metadata 与来源不一致，已拒绝恢复。')
    }
    return {
      checkpoint: checkpoint ?? { schema_version: 1, stage: 'prepared', project_id: request.projectId,
        outline_id: request.outlineId, source_snapshot: snapshot, stage_compiles, proposal: null },
      prompt: checkpoint?.stage === 'ready' || checkpoint?.stage === 'applied' ? null : compiled.prompt,
    }
  }

  /** Validates metadata off-thread before entering the synchronous SQLite boundary. */
  public async validateApplyAsync(
    request: OutlineGenerationRequest,
    checkpoint: OutlineCheckpoint,
    taskId: string,
    signal?: AbortSignal,
  ): Promise<OutlineApplyValidation> {
    if (checkpoint.stage !== 'ready' || !taskId.trim()) {
      throw new OutlineGenerationBoundaryError('大纲结果或任务不合法，已拒绝采用。')
    }
    const fingerprint = checkpointFingerprint(checkpoint)
    const sourceSnapshot = checkpoint.source_snapshot
    const requestFingerprint = JSON.stringify(request)
    await this.prepareAsync(request, checkpoint, taskId, signal)
    if (signal?.aborted) throw new Error('Outline context compilation was cancelled')
    if (checkpoint.source_snapshot !== sourceSnapshot || checkpointFingerprint(checkpoint) !== fingerprint
      || JSON.stringify(request) !== requestFingerprint) {
      throw new OutlineGenerationBoundaryError('大纲校验输入已变化，已拒绝采用。')
    }
    const validation = Object.freeze({ source_snapshot: checkpoint.source_snapshot })
    this.applyValidations.set(validation, {
      checkpoint: fingerprint, request: requestFingerprint, taskId,
    })
    return validation
  }

  public failedBudgetCheckpoint(request: OutlineGenerationRequest, error: ContextBudgetExceededError): OutlineCheckpoint {
    const { snapshot } = this.load(request)
    return { schema_version: 1, stage: 'prepared', project_id: request.projectId, outline_id: request.outlineId,
      source_snapshot: snapshot, stage_compiles: { outline: {
        prompt_version: error.failureTrace.metadata.prompt_version, model_params: { ...request.modelParams },
        trace: compileTraceToJson(error.failureTrace),
      } }, proposal: null }
  }

  /** Runs synchronously inside the caller's SQLite transaction. Never confirms or locks. */
  public apply(
    request: OutlineGenerationRequest,
    checkpoint: OutlineCheckpoint,
    taskId: string,
    validation?: OutlineApplyValidation,
  ): VolumeOutline {
    if (checkpoint.stage !== 'ready' || !checkpoint.proposal) {
      throw new OutlineGenerationBoundaryError('大纲结果或 compiler metadata 损坏，已拒绝采用。')
    }
    if (!taskId.trim()) throw new OutlineGenerationBoundaryError('采用大纲必须关联有效任务。')
    if (validation) {
      const proof = this.applyValidations.get(validation)
      if (!proof || proof.taskId !== taskId || proof.checkpoint !== checkpointFingerprint(checkpoint)
        || proof.request !== JSON.stringify(request) || validation.source_snapshot !== checkpoint.source_snapshot) {
        throw new OutlineGenerationBoundaryError('大纲异步校验结果失效，已拒绝采用。')
      }
      this.applyValidations.delete(validation)
    } else {
      // Preserve the full synchronous contract for existing callers and tests.
      if (!parseOutlineCheckpoint(checkpoint)) {
        throw new OutlineGenerationBoundaryError('大纲结果或 compiler metadata 损坏，已拒绝采用。')
      }
      this.prepare(request, checkpoint)
    }
    const { outline, snapshot } = this.load(request)
    if (snapshot !== checkpoint.source_snapshot) {
      throw new OutlineGenerationBoundaryError('大纲来源在采用前发生变化，已拒绝写入。')
    }
    return this.stores.project.updateVolumeOutline(request.projectId, request.outlineId, {
      ...checkpoint.proposal, metadata: { ...outline.metadata, generated_outline_task_id: taskId },
    }, outline.version)
  }
}
