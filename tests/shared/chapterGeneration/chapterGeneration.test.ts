import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  initializeDatabase,
  type SqliteDatabase,
} from '@/main/database'
import { WorkbenchService } from '@/main/workbench'
import {
  ChapterVersionStatusTransitionError,
  VersionConflictError,
} from '@/shared/novelProject'
import type {
  ChapterGenerationRequest,
  FactCheckReport,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerator,
} from '@/shared/chapterGeneration'

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
