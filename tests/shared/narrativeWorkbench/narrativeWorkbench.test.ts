import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { initializeDatabase, type SqliteDatabase } from '@/main/database'
import { WorkbenchService } from '@/main/workbench'
import type {
  NarrativeTextGenerationRequest,
  NarrativeTextGenerationResult,
  NarrativeTextGenerator,
} from '@/shared/narrativeWorkbench'
import {
  assignStableBlockIds,
  diffChapterBlocks,
  type ChapterBlock,
} from '@/shared/narrativeWorkbench'

class FixedGenerator implements NarrativeTextGenerator {
  public readonly requests: NarrativeTextGenerationRequest[] = []

  public constructor(
    private readonly text: string,
    private readonly failure?: Error,
  ) {}

  public async generate(
    request: NarrativeTextGenerationRequest,
  ): Promise<NarrativeTextGenerationResult> {
    this.requests.push(request)
    if (this.failure) throw this.failure
    request.on_chunk?.(this.text)
    return { text: this.text }
  }
}

function createChapter(workbench: WorkbenchService): { projectId: string; chapterId: string } {
  const project = workbench.createProject({ slug: 'narrative-workbench', name: 'Narrative Workbench' })
  const chapter = workbench.chapters.create({
    project_id: project.id,
    chapter_number: 1,
    title: 'Opening',
    synopsis: 'A quiet beginning',
    content: 'The first event becomes clear.\n\nA question remains unresolved.',
  })
  return { projectId: project.id, chapterId: chapter.id }
}

describe('narrative workbench', () => {
  let tempRoot: string
  let database: SqliteDatabase
  let workbench: WorkbenchService

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-narrative-'))
    database = initializeDatabase(tempRoot)
    workbench = new WorkbenchService(database)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  test('keeps stable block ids for unchanged and same-position revised paragraphs', () => {
    const before = assignStableBlockIds(
      'chapter-1',
      'First paragraph.\n\nSecond paragraph.',
    )
    const after = assignStableBlockIds(
      'chapter-1',
      'First paragraph.\n\nRevised second paragraph.',
      before,
    )

    expect(after[0].id).toBe(before[0].id)
    expect(after[1].id).toBe(before[1].id)
    const diff = diffChapterBlocks(before, after)
    expect(diff.unchanged_count).toBe(1)
    expect(diff.modified_count).toBe(1)
  })

  test('extracts fallback memory proposals and supports approval', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const result = await workbench.narrative.extractMemoryProposals(projectId, chapterId)

    expect(result.used_fallback).toBe(false)
    expect(result.proposals).toHaveLength(2)
    const memory = workbench.narrative.approveMemoryProposal(projectId, result.proposals[0].id)
    expect(memory.content).toBe(result.proposals[0].content)
    expect(workbench.narrative.listMemories(projectId)).toHaveLength(1)
  })

  test('uses deterministic fallback when memory extraction fails', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const result = await workbench.narrative.extractMemoryProposals(projectId, chapterId, {
      generator: new FixedGenerator('', new Error('provider unavailable')),
    })

    expect(result.used_fallback).toBe(true)
    expect(result.error).toContain('provider unavailable')
    expect(result.proposals.length).toBeGreaterThan(0)
  })

  test('persists foreshadow suggestions and enforces the state machine', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const result = await workbench.narrative.suggestForeshadows(projectId, chapterId, {
      ending_hook: 'A hidden clue is still waiting.',
    })
    const suggestion = result.suggestions[0]
    expect(suggestion.status).toBe('suggested')

    const planned = workbench.narrative.transitionForeshadow(
      projectId,
      suggestion.id,
      'planned',
    )
    expect(planned.status).toBe('planned')
    expect(() =>
      workbench.narrative.transitionForeshadow(projectId, suggestion.id, 'paid_off'),
    ).toThrow('Invalid Foreshadow status transition')
    expect(workbench.narrative.listForeshadowEvents(projectId, suggestion.id)).toHaveLength(2)
  })

  test('toggles skills and creates a revision with a block diff', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const skills = workbench.narrative.listSkills(projectId)
    expect(skills.length).toBeGreaterThan(0)
    const disabled = workbench.narrative.setSkillEnabled(projectId, 'style', false)
    expect(disabled.enabled).toBe(false)

    const generator = new FixedGenerator('The first event is written with more clarity.\n\nA question remains unresolved.')
    const result = await workbench.narrative.polishChapter(projectId, chapterId, generator)

    expect(result.status).toBe('completed')
    expect(result.revision?.operation).toBe('polish')
    expect(result.diff.modified_count).toBe(1)
    expect(result.report?.status).toBe('completed')
    expect(generator.requests[0].prompt).toContain('clarity')

    const chapter = workbench.narrative.applyRevision(projectId, result.revision!.id)
    expect(chapter.content).toContain('more clarity')
    expect(chapter.status).toBe('completed')
  })

  test('returns original content on polish failure and does not create a revision', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const before = workbench.chapters.getById(chapterId)!
    const result = await workbench.narrative.polishChapter(
      projectId,
      chapterId,
      new FixedGenerator('', new Error('temporary failure')),
    )

    expect(result.status).toBe('fallback')
    expect(result.content).toBe(before.content)
    expect(result.revision).toBeNull()
    expect(workbench.narrative.listRevisions(projectId, chapterId)).toHaveLength(0)
  })

  test('revises a quoted paragraph while preserving its stable id', async () => {
    const { projectId, chapterId } = createChapter(workbench)
    const blocks: ChapterBlock[] = workbench.narrative.getChapterBlocks(projectId, chapterId)
    const result = await workbench.narrative.reviseParagraph(
      projectId,
      chapterId,
      blocks[0].id,
      'Make the sentence more concise.',
      new FixedGenerator('The first event is clear.'),
    )

    expect(result.status).toBe('completed')
    expect(result.revision?.blocks[0].id).toBe(blocks[0].id)
    expect(result.revision?.content).toContain('The first event is clear.')
  })
})
