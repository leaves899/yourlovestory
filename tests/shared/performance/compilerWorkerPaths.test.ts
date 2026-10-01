import { compilePerformanceWorker } from '../../helpers/performanceWorkerFixture'
import { ComputeWorkerClient } from '@/main/workers/computeWorkerClient'
import {
  ChapterGenerationService, compileTraceToJson,
  type Chapter, type ChapterStore, type ChapterVersion, type ChapterVersionStore,
  type ContextCompute, type TextGenerator,
} from '@/shared/chapterGeneration'
import { compileContext, ContextBudgetExceededError } from '@/shared/contextCompiler'
import {
  ChapterGenerationBoundaryError, EntityNotFoundError,
  type ChapterOutline, type OutlineContext, type Project, type ProjectConfig,
  type SourceMaterial, type Volume, type VolumeOutline,
} from '@/shared/novelProject'
import { OutlineGenerationService, OutlineGenerationBoundaryError, type OutlineCheckpoint } from '@/shared/outlineGeneration'

function fixture(computeContext?: ContextCompute) {
  const now = '2000-01-01T00:00:00.000Z'
  const state: { project: Project; config: ProjectConfig; volume: Volume;
    volumeOutline: VolumeOutline; chapterOutline: ChapterOutline; chapter: Chapter;
    materials: SourceMaterial[]; versions: ChapterVersion[] } = {
    project: { id: 'project', slug: 'synthetic', name: '航线', description: 'trust signal', status: 'active', version: 1, created_at: now, updated_at: now },
    config: { project_id: 'project', default_llm_config_id: null, genre: '科幻', tone: '冷静', target_words: 10000,
      context_budget: 64000, settings: {}, version: 1, created_at: now, updated_at: now },
    volume: { id: 'volume', project_id: 'project', volume_number: 1, title: '航线', synopsis: 'trust', status: 'planned', sort_order: 0,
      target_words: 10000, version: 1, created_at: now, updated_at: now },
    volumeOutline: { id: 'volume-outline', project_id: 'project', volume_id: 'volume', status: 'draft', summary: '航线', theme: 'trust',
      main_conflict: 'signal', key_turning_points: [], ending: '航线', outline: {}, source_material_ids: [], metadata: {}, version: 1, created_at: now, updated_at: now },
    chapterOutline: { id: 'chapter-outline', project_id: 'project', volume_id: 'volume', chapter_number: 1, sort_order: 0, title: '航线',
      summary: '航线', purpose: 'trust', opening: 'signal', conflict: '航线', key_events: ['trust'], ending: 'signal', ending_hook: '', status: 'confirmed',
      outline: {}, source_material_ids: [], metadata: {}, version: 1, created_at: now, updated_at: now },
    chapter: { id: 'chapter-entity', project_id: 'project', arc_id: null, chapter_number: 1, title: '航线', status: 'planned', synopsis: '', content: '',
      target_words: 10000, actual_words: null, version: 1, created_at: now, updated_at: now },
    materials: [], versions: [],
  }
  const chapters: ChapterStore = {
    create: jest.fn(() => { throw new Error('Read fence must never create a chapter') }),
    getById: jest.fn((id) => id === state.chapter.id ? structuredClone(state.chapter) : null),
    getByProjectAndNumber: jest.fn((id, number) => id === state.chapter.project_id && number === state.chapter.chapter_number ? structuredClone(state.chapter) : null),
    listByProject: () => [structuredClone(state.chapter)],
    update: jest.fn((id, input, version) => {
      if (id !== state.chapter.id || version !== state.chapter.version) throw new Error('Version conflict')
      state.chapter = { ...state.chapter, ...input, version: state.chapter.version + 1 }
      return structuredClone(state.chapter)
    }),
  }
  const versions: ChapterVersionStore = {
    create: jest.fn((input) => {
      const value: ChapterVersion = { ...input, id: `version-${state.versions.length}`, task_id: input.task_id ?? null,
        version_number: state.versions.length + 1, status: 'review', is_current: false, created_at: now, reviewed_at: null, confirmed_at: null }
      state.versions.push(value)
      return structuredClone(value)
    }),
    getById: (id) => state.versions.find((value) => value.id === id) ?? null,
    getByTaskId: (id) => state.versions.find((value) => value.task_id === id) ?? null,
    listByChapter: jest.fn((id) => state.versions.filter((value) => value.chapter_id === id)),
    setStatus: () => { throw new Error('Unexpected status write') },
  }
  const project = {
    getProject: () => structuredClone(state.project),
    getProjectConfig: () => structuredClone(state.config),
    getVolume: () => structuredClone(state.volume),
    getVolumeOutline: () => structuredClone(state.volumeOutline),
    getVolumeOutlineByVolume: () => structuredClone(state.volumeOutline),
    getChapterOutline: (projectId: string, id: string) => {
      if (projectId !== state.project.id || id !== state.chapterOutline.id) throw new EntityNotFoundError('Chapter outline', id)
      return structuredClone(state.chapterOutline)
    },
    getOutlineContext: (): OutlineContext => ({ project: structuredClone(state.project), config: structuredClone(state.config),
      characters: [], worldview_entries: [], organizations: [], relations: [], source_materials: structuredClone(state.materials), selected_source_materials: [] }),
    listVolumes: () => [structuredClone(state.volume)],
    listChapterOutlines: () => [structuredClone(state.chapterOutline)],
    updateVolumeOutline: jest.fn((_project: string, _id: string, input: Partial<VolumeOutline>, version?: number) => {
      if (version !== state.volumeOutline.version) throw new Error('Version conflict')
      state.volumeOutline = { ...state.volumeOutline, ...input, version: state.volumeOutline.version + 1 }
      return structuredClone(state.volumeOutline)
    }),
  }
  const modelParams = { model: 'synthetic', temperature: 0.7, max_output_tokens: 1024, context_budget: 64000 }
  const outlineRequest = { projectId: state.project.id, outlineId: state.volumeOutline.id, modelParams, debug: false }
  const chapterRequest = { project_id: state.project.id, chapter_outline_id: state.chapterOutline.id, chapter_id: state.chapter.id, model_params: modelParams }
  const outline = new OutlineGenerationService({ project, chapters, memories: { listByProject: () => [] }, foreshadows: { listByProject: () => [] }, computeContext })
  const chapter = new ChapterGenerationService({ project, chapters, versions, computeContext })
  return { state, project, chapters, versions, outlineRequest, chapterRequest, outline, chapter }
}

function ready(checkpoint: OutlineCheckpoint): OutlineCheckpoint {
  return { ...checkpoint, stage: 'ready', proposal: { summary: '航线 proposal', theme: 'trust', main_conflict: 'signal', key_turning_points: ['航线'], ending: 'signal' } }
}

const generator: TextGenerator = {
  generate: jest.fn(async ({ stage }) => ({ text: stage === 'body' ? '航线正文' : stage === 'summary' ? '航线摘要' : '{"passed":true,"summary":"一致","findings":[]}' })),
}

describe('compiler Worker production service paths without native SQLite', () => {
  let workerFixture: ReturnType<typeof compilePerformanceWorker>
  beforeAll(() => { workerFixture = compilePerformanceWorker() }, 30000)
  afterAll(() => { workerFixture?.dispose() })
  test('outline async prepare preserves synchronous prompt and trace', async () => {
    const compute = jest.fn<ReturnType<ContextCompute>, Parameters<ContextCompute>>(async (input) => compileContext(input))
    const f = fixture(compute)
    const synchronous = f.outline.prepare(f.outlineRequest, null)
    const controller = new AbortController()
    await expect(f.outline.prepareAsync(f.outlineRequest, null, 'task', controller.signal)).resolves.toEqual(synchronous)
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ task_kind: 'outline' }), { signal: controller.signal })
  })

  test('outline source edits while computation awaits fail closed', async () => {
    const f = fixture(async (input) => {
      const result = compileContext(input)
      f.state.volumeOutline = { ...f.state.volumeOutline, summary: 'user edit', version: 2 }
      return result
    })
    await expect(f.outline.prepareAsync(f.outlineRequest, null)).rejects.toBeInstanceOf(OutlineGenerationBoundaryError)
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })

  test('cancelled outline computation yields no validation or write', async () => {
    const controller = new AbortController()
    const f = fixture(async (input) => { controller.abort(); return compileContext(input) })
    await expect(f.outline.prepareAsync(f.outlineRequest, null, 'task', controller.signal)).rejects.toThrow('cancelled')
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })

  test('validated apply performs no synchronous recompile inside transaction', async () => {
    const compute = jest.fn<ReturnType<ContextCompute>, Parameters<ContextCompute>>(async (input) => compileContext(input))
    const f = fixture(compute)
    const checkpoint = ready((await f.outline.prepareAsync(f.outlineRequest, null)).checkpoint)
    const proof = await f.outline.validateApplyAsync(f.outlineRequest, checkpoint, 'task')
    const synchronousPrepare = jest.spyOn(f.outline, 'prepare')
    expect(f.outline.apply(f.outlineRequest, checkpoint, 'task', proof).summary).toBe(checkpoint.proposal?.summary)
    expect(synchronousPrepare).not.toHaveBeenCalled()
    expect(compute).toHaveBeenCalledTimes(2)
    expect(f.project.updateVolumeOutline).toHaveBeenCalledTimes(1)
  })

  test('edit after async validation is fenced by synchronous apply', async () => {
    const f = fixture(async (input) => compileContext(input))
    const checkpoint = ready((await f.outline.prepareAsync(f.outlineRequest, null)).checkpoint)
    const proof = await f.outline.validateApplyAsync(f.outlineRequest, checkpoint, 'task')
    f.state.config = { ...f.state.config, tone: 'changed', version: 2 }
    expect(() => f.outline.apply(f.outlineRequest, checkpoint, 'task', proof)).toThrow(OutlineGenerationBoundaryError)
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })

  test('forged metadata and fabricated apply proof fail closed', async () => {
    const f = fixture(async (input) => compileContext(input))
    const checkpoint = ready((await f.outline.prepareAsync(f.outlineRequest, null)).checkpoint)
    const forged = structuredClone(checkpoint)
    const metadata = forged.stage_compiles.outline
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('fixture metadata missing')
    metadata.model_params = { ...f.outlineRequest.modelParams, model: 'forged' }
    await expect(f.outline.validateApplyAsync(f.outlineRequest, forged, 'task')).rejects.toBeInstanceOf(OutlineGenerationBoundaryError)
    expect(() => f.outline.apply(f.outlineRequest, checkpoint, 'task', { source_snapshot: checkpoint.source_snapshot })).toThrow(OutlineGenerationBoundaryError)
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })

  test('outline budget failure keeps the original failureTrace', async () => {
    const f = fixture(async (input) => compileContext(input))
    const request = { ...f.outlineRequest, modelParams: { ...f.outlineRequest.modelParams, context_budget: 1 } }
    let synchronous: ContextBudgetExceededError | undefined
    try { f.outline.prepare(request, null) } catch (error) {
      if (!(error instanceof ContextBudgetExceededError)) throw error
      synchronous = error
    }
    if (!synchronous) throw new Error('Expected budget rejection')
    try {
      await f.outline.prepareAsync(request, null)
      throw new Error('Expected async budget rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetExceededError)
      if (!(error instanceof ContextBudgetExceededError)) throw error
      expect(error.failureTrace).toEqual(synchronous.failureTrace)
      const checkpoint = f.outline.failedBudgetCheckpoint(request, error)
      expect(checkpoint.stage_compiles.outline).toEqual(expect.objectContaining({ trace: compileTraceToJson(synchronous.failureTrace) }))
    }
  })

  test('chapter generation awaits all three compiler stages', async () => {
    const compute = jest.fn<ReturnType<ContextCompute>, Parameters<ContextCompute>>(async (input) => compileContext(input))
    const f = fixture(compute)
    f.state.volumeOutline.status = 'confirmed'
    const result = await f.chapter.generate(f.chapterRequest, generator, { signal: new AbortController().signal })
    expect(result.status).toBe('completed')
    expect(compute.mock.calls.map(([input]) => input.task_kind)).toEqual(['chapter_body', 'summary', 'fact_check'])
    expect(result.checkpoint.stage_compiles?.summary?.trace).toBeDefined()
  })

  test('chapter source edits while Worker awaits prevent model calls and versions', async () => {
    const f = fixture(async (input) => {
      const result = compileContext(input)
      f.state.chapterOutline = { ...f.state.chapterOutline, conflict: 'user edit', version: 2 }
      return result
    })
    f.state.volumeOutline.status = 'confirmed'
    const model: TextGenerator = { generate: jest.fn(async () => ({ text: 'unexpected' })) }
    await expect(f.chapter.generate(f.chapterRequest, model, { signal: new AbortController().signal })).rejects.toBeInstanceOf(ChapterGenerationBoundaryError)
    expect(model.generate).not.toHaveBeenCalled()
    expect(f.versions.create).not.toHaveBeenCalled()
  })

  test('chapter cancellation while Worker awaits preserves cancellation semantics', async () => {
    const controller = new AbortController()
    const f = fixture(async (input) => { controller.abort(); return compileContext(input) })
    f.state.volumeOutline.status = 'confirmed'
    const model: TextGenerator = { generate: jest.fn(async () => ({ text: 'unexpected' })) }
    await expect(f.chapter.generate(f.chapterRequest, model, { signal: controller.signal })).resolves.toMatchObject({ status: 'cancelled', version: null })
    expect(model.generate).not.toHaveBeenCalled()
    expect(f.versions.create).not.toHaveBeenCalled()
  })

  test('capacity rejection propagates without synchronous compiler fallback', async () => {
    const f = fixture(async () => { throw new Error('Compute worker capacity exceeded') })
    f.state.volumeOutline.status = 'confirmed'
    const model: TextGenerator = { generate: jest.fn(async () => ({ text: 'unexpected' })) }
    await expect(f.chapter.generate(f.chapterRequest, model, { signal: new AbortController().signal })).rejects.toThrow('capacity exceeded')
    f.state.volumeOutline.status = 'draft'
    await expect(f.outline.prepareAsync(f.outlineRequest, null)).rejects.toThrow('capacity exceeded')
    expect(model.generate).not.toHaveBeenCalled()
  })

  test('version list resolves independent outline/entity IDs without writes', () => {
    const f = fixture()
    f.chapter.listVersions('project', 'chapter-outline')
    expect(f.chapters.getByProjectAndNumber).toHaveBeenCalledWith('project', 1)
    expect(f.versions.listByChapter).toHaveBeenCalledWith('chapter-entity')
    expect(f.chapters.create).not.toHaveBeenCalled()
    expect(f.chapters.update).not.toHaveBeenCalled()
    f.state.chapter.project_id = 'another-project'
    expect(() => f.chapter.listVersions('project', 'chapter-entity')).toThrow(EntityNotFoundError)
  })

  test('real compiled Worker preserves outline budget-error instance and trace', async () => {
    const client = new ComputeWorkerClient({ workerPath: workerFixture.workerPath })
    const f = fixture((input, options) => client.run('compile-context', input, options))
    const request = { ...f.outlineRequest, modelParams: { ...f.outlineRequest.modelParams, context_budget: 1 } }
    let synchronous: ContextBudgetExceededError | undefined
    try { f.outline.prepare(request, null) } catch (error) {
      if (!(error instanceof ContextBudgetExceededError)) throw error
      synchronous = error
    }
    if (!synchronous) throw new Error('Expected budget rejection')
    try {
      await f.outline.prepareAsync(request, null)
      throw new Error('Expected real Worker budget rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetExceededError)
      expect(error).toMatchObject({ requiredTokens: synchronous.requiredTokens,
        availableTokens: synchronous.availableTokens, failureTrace: synchronous.failureTrace })
    }
  })

  test('a rejected budget result from changed sources is not saved as current metadata', async () => {
    const f = fixture(async (input) => {
      f.state.config = { ...f.state.config, tone: 'edited during Worker wait', version: 2 }
      return compileContext(input)
    })
    const request = { ...f.outlineRequest, modelParams: { ...f.outlineRequest.modelParams, context_budget: 1 } }
    await expect(f.outline.prepareAsync(request, null)).rejects.toBeInstanceOf(OutlineGenerationBoundaryError)
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })

  test('checkpoint mutation after validation cannot reuse a proof', async () => {
    const f = fixture(async (input) => compileContext(input))
    const checkpoint = ready((await f.outline.prepareAsync(f.outlineRequest, null)).checkpoint)
    const proof = await f.outline.validateApplyAsync(f.outlineRequest, checkpoint, 'task')
    if (!checkpoint.proposal) throw new Error('Fixture proposal missing')
    checkpoint.proposal.summary = 'replaced after validation'
    expect(() => f.outline.apply(f.outlineRequest, checkpoint, 'task', proof)).toThrow(OutlineGenerationBoundaryError)
    expect(f.project.updateVolumeOutline).not.toHaveBeenCalled()
  })
})
