import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  initializeDatabase,
  type SqliteDatabase,
} from '@/main/database'
import { WorkbenchService } from '@/main/workbench'
import {
  ChapterGenerationBoundaryError,
  ChapterVersionStatusTransitionError,
  VersionConflictError,
} from '@/shared/novelProject'
import {
  checkpointFromJson,
  checkpointToJson,
  mapPriorChapters,
  type Chapter,
  type ChapterGenerationRequest,
  type FactCheckReport,
  type TextGenerationRequest,
  type TextGenerationResult,
  type TextGenerator,
} from '@/shared/chapterGeneration'
import { ContextBudgetExceededError } from '@/shared/contextCompiler'

function factCheck(passed: boolean): FactCheckReport {
  return {
    passed,
    summary: passed ? '输入事实一致' : '存在需要人工确认的内容',
    findings: [
      {
        claim: '章节与大纲一致',
        status: passed ? 'supported' : 'unclear',
        severity: passed ? 'info' : 'warning',
        evidence: passed ? '章节关键事件可在大纲中找到' : '需要人工核对',
        suggestion: passed ? '保持当前表述' : '对照大纲修订相关段落',
      },
    ],
  }
}

class ScriptedGenerator implements TextGenerator {
  public readonly calls: TextGenerationRequest[] = []

  public constructor(
    private readonly scripts: Record<TextGenerationRequest['stage'], readonly string[]>,
  ) {}

  public async generate(request: TextGenerationRequest): Promise<TextGenerationResult> {
    this.calls.push(request)
    let text = ''
    for (const chunk of this.scripts[request.stage]) {
      if (request.signal.aborted) return { text }
      text += chunk
      request.on_chunk?.(chunk)
    }
    return { text }
  }
}

function createWorkbench(
  database: SqliteDatabase,
  confirmOutlines = true,
  slug = 'generation-project',
): {
  workbench: WorkbenchService
  projectId: string
  chapterOutlineId: string
} {
  const workbench = new WorkbenchService(database)
  const project = workbench.createProject({ slug, name: 'Generation Project' })
  const volume = workbench.createVolume({
    project_id: project.id,
    volume_number: 1,
    title: 'Volume One',
  })
  const volumeOutline = workbench.createVolumeOutline({
    project_id: project.id,
    volume_id: volume.id,
    summary: 'Volume summary',
    main_conflict: 'A controlled conflict',
  })
  const chapterOutline = workbench.createChapterOutline({
    project_id: project.id,
    volume_id: volume.id,
    chapter_number: 1,
    title: 'Opening Chapter',
    summary: 'Chapter summary',
    purpose: 'Establish the situation',
    opening: 'The chapter opens quietly',
    conflict: 'The characters face a choice',
    key_events: ['A discovery', 'A decision'],
    ending: 'The choice is made',
    ending_hook: 'A new question remains',
  })
  if (confirmOutlines) {
    workbench.confirmVolumeOutline(project.id, volumeOutline.id, volumeOutline.version)
    workbench.confirmChapterOutline(project.id, chapterOutline.id, chapterOutline.version)
  }
  return { workbench, projectId: project.id, chapterOutlineId: chapterOutline.id }
}

describe('chapter generation repositories and domain service', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-generation-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('saves chapter versions, tracks current version, and enforces chapter optimistic versions', () => {
    const { workbench, projectId } = createWorkbench(database)
    const chapter = workbench.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      title: 'Chapter',
    })
    expect(chapter.version).toBe(1)
    expect(workbench.chapters.getByProjectAndNumber(projectId, 1)).toEqual(chapter)

    const updated = workbench.chapters.update(chapter.id, { status: 'drafting' }, chapter.version)
    expect(updated?.version).toBe(2)
    expect(() => workbench.chapters.update(chapter.id, { title: 'stale' }, chapter.version)).toThrow(
      VersionConflictError,
    )

    const first = workbench.chapterVersions.create({
      chapter_id: chapter.id,
      content: '正文一',
      summary: '摘要一',
      fact_check: factCheck(true),
    })
    const approved = workbench.chapterVersions.setStatus(first.id, 'approved', 'review')
    expect(approved?.is_current).toBe(true)
    expect(approved?.status).toBe('approved')

    const second = workbench.chapterVersions.create({
      chapter_id: chapter.id,
      content: '正文二',
      summary: '摘要二',
      fact_check: factCheck(true),
    })
    const secondApproved = workbench.chapterVersions.setStatus(second.id, 'approved', 'review')
    expect(secondApproved?.is_current).toBe(true)
    expect(workbench.chapterVersions.getById(first.id)?.is_current).toBe(false)
    expect(() => workbench.chapterVersions.setStatus(first.id, 'approved', 'review')).toThrow(
      ChapterVersionStatusTransitionError,
    )
  })

  test('loads legacy fact-check findings without a suggestion field', () => {
    const { workbench, projectId } = createWorkbench(database)
    const chapter = workbench.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      title: 'Legacy Chapter',
    })
    const version = workbench.chapterVersions.create({
      chapter_id: chapter.id,
      content: '旧正文',
      summary: '旧摘要',
      fact_check: {
        passed: true,
        summary: '旧格式核查',
        findings: [{
          claim: '旧事实',
          status: 'supported',
          severity: 'info',
          evidence: '旧证据',
        }],
      },
    })

    expect(workbench.chapterVersions.getById(version.id)?.fact_check.findings[0]).toEqual({
      claim: '旧事实',
      status: 'supported',
      severity: 'info',
      evidence: '旧证据',
      suggestion: undefined,
    })
  })

  test('rejects confirmation when fact check contains an error finding', () => {
    const { workbench, projectId } = createWorkbench(database)
    const chapter = workbench.chapters.create({
      project_id: projectId,
      chapter_number: 1,
      title: 'Blocked Chapter',
    })
    const version = workbench.chapterVersions.create({
      chapter_id: chapter.id,
      content: '正文包含与设定冲突的事实。',
      summary: '存在阻塞事实。',
      fact_check: {
        passed: false,
        summary: '发现阻塞错误',
        findings: [{
          claim: '角色在本章出现',
          status: 'contradicted',
          severity: 'error',
          evidence: '角色此前已经死亡',
          suggestion: '修订正文后重新执行事实核查',
        }],
      },
    })

    expect(() => workbench.chapterGeneration.confirmVersion(projectId, version.id)).toThrow(
      ChapterGenerationBoundaryError,
    )
    expect(workbench.chapterVersions.getById(version.id)?.status).toBe('review')
    expect(workbench.chapters.getById(chapter.id)?.status).toBe('planned')
  })

  test('requires confirmed volume and chapter outlines before body generation', () => {
    const { workbench, projectId, chapterOutlineId } = createWorkbench(database, false)
    const volume = workbench.volumes.listByProject(projectId)[0]
    const volumeOutline = workbench.volumeOutlines.getByVolumeId(volume.id)
    expect(volumeOutline).not.toBeNull()
    workbench.confirmVolumeOutline(projectId, volumeOutline!.id, volumeOutline!.version)
    expect(() => workbench.chapterGeneration.prepare({
      project_id: projectId,
      chapter_outline_id: chapterOutlineId,
    })).toThrow('Chapter outline must be confirmed or locked')
  })

  test('streams body stages, saves a review version, and requires manual confirmation', async () => {
    const { workbench, projectId, chapterOutlineId } = createWorkbench(database)
    const stages: string[] = []
    const chunks: string[] = []
    const checkpoints: string[] = []
    const generator = new ScriptedGenerator({
      body: ['正文第一段', '正文第二段'],
      summary: ['章节摘要'],
      fact_check: [JSON.stringify(factCheck(true))],
    })
    const request: ChapterGenerationRequest = {
      project_id: projectId,
      chapter_outline_id: chapterOutlineId,
    }
    const result = await workbench.chapterGeneration.generate(request, generator, {
      signal: new AbortController().signal,
      callbacks: {
        on_stage: (stage) => stages.push(stage),
        on_chunk: (_stage, chunk) => chunks.push(chunk),
        on_checkpoint: (checkpoint) => checkpoints.push(checkpoint.stage),
      },
    })

    expect(result.status).toBe('completed')
    expect(result.auto_confirmed).toBe(false)
    expect(result.version?.status).toBe('review')
    expect(result.version?.content).toBe('正文第一段正文第二段')
    expect(result.version?.fact_check.passed).toBe(true)
    expect(result.version?.fact_check.findings[0].suggestion).toBe('保持当前表述')
    expect(stages).toEqual(['body', 'summary', 'fact_check', 'saving', 'review'])
    expect(chunks).toContain('正文第一段')
    expect(checkpoints).toContain('review')
    expect(workbench.chapters.getById(result.chapter.id)?.status).toBe('review')

    const confirmed = workbench.chapterGeneration.confirmVersion(projectId, result.version!.id)
    expect(confirmed.status).toBe('approved')
    expect(workbench.chapters.getById(result.chapter.id)).toEqual(
      expect.objectContaining({ status: 'completed', content: result.version!.content }),
    )
    expect(() => workbench.chapterGeneration.confirmVersion(projectId, result.version!.id)).toThrow(
      ChapterVersionStatusTransitionError,
    )
  })

  test('compiles prompts via ContextCompiler and persists stage traces without final_prompt by default', async () => {
    const workbench = new WorkbenchService(database)
    const project = workbench.createProject({ slug: 'compiler-project', name: 'Compiler Project' })
    const projectId = project.id
    workbench.createCharacter({
      project_id: projectId,
      name: '林澈',
      role: '主角',
      notes: '冷静',
      profile: { skill: '夜航' },
    })
    const material = workbench.createSourceMaterial({
      project_id: projectId,
      title: 'Discovery notes',
      material_type: 'setting',
      content: 'Opening Chapter discovery material about the situation and decision',
    })
    const volume = workbench.createVolume({
      project_id: projectId,
      volume_number: 1,
      title: 'Volume One',
    })
    const volumeOutline = workbench.createVolumeOutline({
      project_id: projectId,
      volume_id: volume.id,
      summary: 'Volume summary',
      main_conflict: 'A controlled conflict',
      source_material_ids: [material.id],
    })
    const chapterOutline = workbench.createChapterOutline({
      project_id: projectId,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'Opening Chapter',
      summary: 'Chapter summary',
      purpose: 'Establish the situation',
      opening: 'The chapter opens quietly',
      conflict: 'The characters face a choice',
      key_events: ['A discovery', 'A decision'],
      ending: 'The choice is made',
      ending_hook: 'A new question remains',
      source_material_ids: [material.id],
    })
    workbench.confirmVolumeOutline(projectId, volumeOutline.id, volumeOutline.version)
    workbench.confirmChapterOutline(projectId, chapterOutline.id, chapterOutline.version)
    const chapterOutlineId = chapterOutline.id

    workbench.narrativeMemories.create({
      project_id: projectId,
      memory_type: 'fact',
      title: 'Approved memory',
      content: 'The discovery in Opening Chapter remains unresolved for the characters',
      importance: 80,
      status: 'approved',
    })
    workbench.narrativeMemories.create({
      project_id: projectId,
      memory_type: 'fact',
      title: 'Proposed memory',
      content: 'Must not enter context until approved',
      importance: 90,
      status: 'proposed',
    })
    workbench.foreshadows.create({
      project_id: projectId,
      title: 'Open foreshadow',
      description: 'A new question remains after the decision in Opening Chapter',
      status: 'active',
      importance: 70,
    })
    workbench.foreshadows.create({
      project_id: projectId,
      title: 'Closed foreshadow',
      description: 'Must not enter context',
      status: 'resolved',
      importance: 99,
    })

    const checkpoints: Array<import('@/shared/chapterGeneration').ChapterGenerationCheckpoint> = []
    const generator = new ScriptedGenerator({
      body: ['正文段落'],
      summary: ['摘要段落'],
      fact_check: [JSON.stringify(factCheck(true))],
    })
    const result = await workbench.chapterGeneration.generate(
      {
        project_id: projectId,
        chapter_outline_id: chapterOutlineId,
        model_params: {
          model: 'budget-model',
          temperature: 0.2,
          max_output_tokens: 2_048,
          context_budget: 32_000,
        },
      },
      generator,
      {
        signal: new AbortController().signal,
        callbacks: {
          on_checkpoint: (checkpoint) => checkpoints.push(checkpoint),
        },
      },
    )

    expect(generator.calls).toHaveLength(3)
    expect(generator.calls[0].stage).toBe('body')
    expect(generator.calls[0].prompt).toContain('任务指令')
    expect(generator.calls[0].prompt).toContain('Opening Chapter')
    expect(generator.calls[0].prompt).toContain('Discovery notes')
    expect(generator.calls[0].prompt).toContain('Approved memory')
    expect(generator.calls[0].prompt).not.toContain('Proposed memory')
    expect(generator.calls[0].prompt).not.toContain('Must not enter context until approved')
    expect(generator.calls[0].prompt).toContain('Open foreshadow')
    expect(generator.calls[0].prompt).not.toContain('Closed foreshadow')
    expect(generator.calls[1].prompt).toContain('正文段落')
    expect(generator.calls[2].prompt).toContain('passed')

    const last = checkpoints[checkpoints.length - 1]
    expect(last.stage_compiles?.body?.prompt_version).toBe('context-compiler/v1')
    expect(last.stage_compiles?.body?.model_params).toEqual({
      model: 'budget-model',
      temperature: 0.2,
      max_output_tokens: 2_048,
      context_budget: 32_000,
    })
    expect(last.stage_compiles?.body?.trace.final_prompt).toBeUndefined()
    expect(last.stage_compiles?.summary?.trace.selected.length).toBeGreaterThan(0)
    expect(last.stage_compiles?.fact_check?.trace.metadata.strategy_id).toBe('fact_check/v1')
    expect(result.checkpoint.stage_compiles?.body?.trace.budget.available_for_prompt).toBe(
      32_000 - last.stage_compiles!.body!.trace.budget.system_reserved - 2_048,
    )

    const roundTrip = checkpointFromJson(checkpointToJson(result.checkpoint))
    expect(roundTrip.stage_compiles?.body?.trace.selected.map((item) => item.id)).toEqual(
      result.checkpoint.stage_compiles?.body?.trace.selected.map((item) => item.id),
    )
  })

  test('debug=true stores final_prompt on stage traces; over-budget saves failure stage_compiles then throws', async () => {
    const { workbench, projectId, chapterOutlineId } = createWorkbench(database, true, 'debug-budget')
    const generator = new ScriptedGenerator({
      body: ['x'],
      summary: ['y'],
      fact_check: [JSON.stringify(factCheck(true))],
    })
    const result = await workbench.chapterGeneration.generate(
      {
        project_id: projectId,
        chapter_outline_id: chapterOutlineId,
        debug: true,
      },
      generator,
      { signal: new AbortController().signal },
    )
    expect(result.checkpoint.stage_compiles?.body?.trace.final_prompt).toEqual(
      expect.stringContaining('任务指令'),
    )

    const checkpoints: Array<import('@/shared/chapterGeneration').ChapterGenerationCheckpoint> = []
    await expect(
      workbench.chapterGeneration.generate(
        {
          project_id: projectId,
          chapter_outline_id: chapterOutlineId,
          model_params: {
            context_budget: 80,
            max_output_tokens: 60,
          },
        },
        generator,
        {
          signal: new AbortController().signal,
          callbacks: {
            on_checkpoint: (checkpoint) => checkpoints.push(checkpoint),
          },
        },
      ),
    ).rejects.toThrow(ContextBudgetExceededError)

    const last = checkpoints[checkpoints.length - 1]
    expect(last).toBeDefined()
    expect(last.stage_compiles?.body).toBeDefined()
    expect(last.stage_compiles?.body?.trace.errors.length).toBeGreaterThan(0)
    expect(last.stage_compiles?.body?.trace.errors[0]).toContain('超过可用预算')
    expect(last.stage_compiles?.body?.trace.discarded.length).toBeGreaterThan(0)
    expect(last.stage_compiles?.body?.trace.metadata.strategy_id).toBe('chapter_body/v1')
    expect(last.stage_compiles?.body?.trace.final_prompt).toBeUndefined()
    expect(last.stage_compiles?.body?.model_params.context_budget).toBe(80)
  })

  test('fact_check 上下文包含已批准记忆 evidence，proposed 记忆不进入 prompt', async () => {
    const { workbench, projectId, chapterOutlineId } = createWorkbench(
      database,
      true,
      'memory-evidence',
    )
    workbench.narrativeMemories.create({
      project_id: projectId,
      memory_type: 'fact',
      title: 'Approved discovery fact',
      content: 'Opening Chapter discovery confirms the controlled conflict choice',
      importance: 85,
      status: 'approved',
      evidence: ['Opening Chapter conflict paragraph', 'Volume summary decision note'],
    })
    workbench.narrativeMemories.create({
      project_id: projectId,
      memory_type: 'fact',
      title: 'Proposed memory',
      content: 'Must not enter context draft',
      importance: 99,
      status: 'proposed',
      evidence: ['Proposed evidence must not appear'],
    })
    const generator = new ScriptedGenerator({
      body: ['正文含 Opening Chapter discovery'],
      summary: ['摘要'],
      fact_check: [JSON.stringify(factCheck(true))],
    })
    await workbench.chapterGeneration.generate(
      {
        project_id: projectId,
        chapter_outline_id: chapterOutlineId,
        model_params: {
          model: 'm',
          max_output_tokens: 2_048,
          context_budget: 32_000,
        },
      },
      generator,
      { signal: new AbortController().signal },
    )
    const factCheckCall = generator.calls.find((call) => call.stage === 'fact_check')
    expect(factCheckCall).toBeDefined()
    expect(factCheckCall!.prompt).toContain('Opening Chapter conflict paragraph')
    expect(factCheckCall!.prompt).toContain('Volume summary decision note')
    expect(factCheckCall!.prompt).toContain('证据：')
    expect(factCheckCall!.prompt).not.toContain('Proposed evidence must not appear')
    expect(factCheckCall!.prompt).not.toContain('Must not enter context draft')
  })

  test('mapPriorChapters 仅保留 completed 章节，review/drafting 不进入 prior', () => {
    const base = {
      project_id: 'p',
      arc_id: null,
      title: 't',
      synopsis: 's',
      content: '正文内容足够长',
      target_words: null,
      actual_words: null,
      version: 1,
      created_at: '',
      updated_at: '',
    }
    const chapters: Chapter[] = [
      { ...base, id: 'c1', chapter_number: 1, status: 'completed' },
      { ...base, id: 'c2', chapter_number: 2, status: 'review', content: '审核中正文' },
      { ...base, id: 'c3', chapter_number: 3, status: 'drafting', content: '草稿正文' },
      { ...base, id: 'c4', chapter_number: 4, status: 'planned', content: '' },
    ]
    const priors = mapPriorChapters(chapters, 5)
    expect(priors.map((item) => item.id)).toEqual(['c1'])
    expect(priors.every((item) => item.status === 'completed')).toBe(true)
  })

  test('only auto-confirms when fact check passes', async () => {
    const first = createWorkbench(database)
    const firstResult = await first.workbench.chapterGeneration.generate(
      {
        project_id: first.projectId,
        chapter_outline_id: first.chapterOutlineId,
        auto_confirm: true,
      },
      new ScriptedGenerator({
        body: ['正文'],
        summary: ['摘要'],
        fact_check: [JSON.stringify(factCheck(true))],
      }),
      { signal: new AbortController().signal },
    )
    expect(firstResult.auto_confirmed).toBe(true)
    expect(firstResult.version?.status).toBe('approved')
    expect(first.workbench.chapters.getById(firstResult.chapter.id)?.status).toBe('completed')

    const second = createWorkbench(database, true, 'generation-project-second')
    const secondResult = await second.workbench.chapterGeneration.generate(
      {
        project_id: second.projectId,
        chapter_outline_id: second.chapterOutlineId,
        auto_confirm: true,
      },
      new ScriptedGenerator({
        body: ['正文'],
        summary: ['摘要'],
        fact_check: [JSON.stringify(factCheck(false))],
      }),
      { signal: new AbortController().signal },
    )
    expect(secondResult.auto_confirmed).toBe(false)
    expect(secondResult.version?.status).toBe('review')
    expect(second.workbench.chapters.getById(secondResult.chapter.id)?.status).toBe('review')
  })
})
