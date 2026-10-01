import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from '@jest/globals'
import { initializeDatabase, type SqliteDatabase } from '@/main/database'
import { WorkbenchService } from '@/main/workbench'
import { compileTraceToJson } from '@/shared/chapterGeneration'
import {
  compileContext, ContextBudgetExceededError, CONTEXT_PROMPT_VERSION,
  estimateTextTokens, type ContextCompilerInput,
} from '@/shared/contextCompiler'
import {
  OutlineGenerationBoundaryError, OutlineGenerationService, OUTLINE_GENERATION_SYSTEM_PROMPT,
  parseOutlineCheckpoint, parseOutlineProposal,
  type OutlineCheckpoint, type OutlineGenerationRequest, type OutlineProposal,
} from '@/shared/outlineGeneration'
import type { JsonObject } from '@/shared/novelProject'

const proposal: OutlineProposal = {
  summary: '雾港船长调查导航芯片失踪案。',
  theme: '雾港航线中的信任与选择',
  main_conflict: '雾港航线控制权争夺',
  key_turning_points: ['航线芯片出现', '雾港船长识破交易'],
  ending: '雾港航线重开，芯片来源仍待查明。',
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function record(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected JSON object in fixed fixture')
  }
  return value as JsonObject
}

describe('standalone outline generation with the shared context compiler', () => {
  let tempRoot: string
  let database: SqliteDatabase
  let workbench: WorkbenchService
  let service: OutlineGenerationService
  let request: OutlineGenerationRequest

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-outline-compiler-'))
    database = initializeDatabase(tempRoot)
    workbench = new WorkbenchService(database)
    const project = workbench.createProject({ id: 'outline-project', slug: 'outline-compiler', name: '雾港航线' })
    workbench.updateProjectConfig(project.id, { genre: '雾港航线科幻', tone: '雾港航线调查', target_words: 80_000 })
    workbench.createCharacter({ id: 'captain', project_id: project.id, name: '雾港船长', role: '雾港航线调查者',
      profile: { skill: '雾港航线导航' }, notes: '雾港航线芯片' })
    workbench.createCharacter({ id: 'guide', project_id: project.id, name: '雾港引路人', role: '雾港航线线人' })
    workbench.createRelation({ id: 'alliance', project_id: project.id,
      source: { type: 'character', id: 'captain' }, target: { type: 'character', id: 'guide' },
      relation_type: '雾港航线合作', description: '调查雾港航线芯片', strength: 75 })
    workbench.createWorldviewEntry({ id: 'harbor', project_id: project.id,
      category: '地理', title: '雾港航线', content: '雾港航线经过边境港口。' })
    workbench.createSourceMaterial({ id: 'selected-material', project_id: project.id,
      title: '雾港航线芯片', content: 'SELECTED_CHIP_EVIDENCE：雾港航线芯片只能开启第三航道。' })
    workbench.createSourceMaterial({ id: 'unselected-material', project_id: project.id,
      title: '不选中的记录', content: 'UNSELECTED_BODY_MUST_NOT_ENTER_PROMPT' })
    workbench.createVolume({ id: 'prior-volume', project_id: project.id, volume_number: 1,
      title: '雾港航线前卷', synopsis: '雾港航线芯片入港' })
    workbench.createVolume({ id: 'current-volume', project_id: project.id, volume_number: 2,
      title: '雾港航线调查', synopsis: '追查雾港航线芯片' })
    workbench.createChapterOutline({ id: 'prior-chapter-outline', project_id: project.id,
      volume_id: 'prior-volume', chapter_number: 1, title: '雾港航线入港' })
    workbench.createChapterOutline({ id: 'current-chapter-outline', project_id: project.id,
      volume_id: 'current-volume', chapter_number: 2, title: '雾港航线待生成卷' })
    workbench.chapters.create({ id: 'prior-chapter', project_id: project.id, chapter_number: 1,
      status: 'completed', title: '雾港航线入港', synopsis: '雾港航线芯片已经入港。', content: '雾港航线前卷正文。' })
    workbench.chapters.create({ id: 'current-chapter', project_id: project.id, chapter_number: 2,
      status: 'completed', content: 'CURRENT_VOLUME_BODY_MUST_NOT_ENTER_PROMPT' })
    workbench.chapters.create({ id: 'review-chapter', project_id: project.id, chapter_number: 3,
      status: 'review', content: 'UNAPPROVED_CHAPTER_BODY_MUST_NOT_ENTER_PROMPT' })
    workbench.narrativeMemories.create({ id: 'approved-memory', project_id: project.id,
      memory_type: 'fact', title: '雾港航线芯片来源', content: '雾港航线芯片来自科考船。',
      status: 'approved', importance: 80, evidence: ['雾港航线芯片登记册'] })
    workbench.narrativeMemories.create({ id: 'unapproved-memory', project_id: project.id,
      memory_type: 'fact', title: '未确认事实', content: 'UNAPPROVED_MEMORY_MUST_NOT_ENTER_PROMPT', status: 'proposed' })
    workbench.foreshadows.create({ id: 'active-foreshadow', project_id: project.id,
      title: '雾港航线追踪信号', description: '雾港航线芯片携带追踪器。', status: 'active', importance: 80 })
    workbench.foreshadows.create({ id: 'resolved-foreshadow', project_id: project.id,
      title: '已结束线索', description: 'RESOLVED_FORESHADOW_MUST_NOT_ENTER_PROMPT', status: 'resolved' })
    workbench.createVolumeOutline({ id: 'target-outline', project_id: project.id, volume_id: 'current-volume',
      summary: '雾港航线调查草稿', theme: '雾港航线信任', main_conflict: '雾港航线争夺',
      source_material_ids: ['selected-material'], metadata: { user_note: 'preserve this metadata' } })
    service = new OutlineGenerationService({ project: workbench, chapters: workbench.chapters,
      memories: workbench.narrativeMemories, foreshadows: workbench.foreshadows })
    request = { projectId: project.id, outlineId: 'target-outline', debug: false,
      modelParams: { model: 'fixed-outline-model', temperature: 0.4, max_output_tokens: 1_024, context_budget: 12_000 } }
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  function ready(): OutlineCheckpoint {
    return { ...service.prepare(request, null).checkpoint, stage: 'ready', proposal: copy(proposal) }
  }

  function applyAndCheckpoint(checkpoint: OutlineCheckpoint): OutlineCheckpoint {
    return database.transaction(() => {
      const updated = service.apply(request, checkpoint, 'outline-task')
      return { ...checkpoint, stage: 'applied' as const, applied_version: updated.version }
    })()
  }

  test('fixed prompt, provenance, budget, parameters and prompt version are identical to compileContext', () => {
    const first = service.prepare(request, null)
    const second = service.prepare(request, null)
    expect(second).toEqual(first)
    expect(parseOutlineCheckpoint(copy(first.checkpoint))).toEqual(first.checkpoint)
    const source = JSON.parse(first.checkpoint.source_snapshot) as { input: ContextCompilerInput }
    const compiled = compileContext(source.input)
    expect(first.prompt).toBe(compiled.prompt)
    const stage = record(first.checkpoint.stage_compiles.outline)
    expect(stage.prompt_version).toBe(CONTEXT_PROMPT_VERSION)
    expect(stage.model_params).toEqual(request.modelParams)
    expect(stage.trace).toEqual(compileTraceToJson(compiled.trace))
    expect(compiled.budget.total_budget).toBe(12_000)
    expect(compiled.budget.max_output_reserved).toBe(1_024)
    expect(compiled.budget.available_for_prompt).toBe(12_000 - 1_024 - estimateTextTokens(OUTLINE_GENERATION_SYSTEM_PROMPT))
    expect(compiled.budget.selected_tokens).toBe(estimateTextTokens(first.prompt ?? ''))
    expect(compiled.budget.selected_tokens).toBeLessThanOrEqual(compiled.budget.available_for_prompt)
    expect(compiled.selected.map((item) => item.id)).toEqual(expect.arrayContaining([
      'source_material:selected-material', 'character:captain', 'relation:alliance',
      'worldview:harbor', 'prior_chapter_summary:prior-chapter',
      'narrative_memory:approved-memory', 'foreshadow:active-foreshadow',
    ]))
    expect(first.prompt).toContain('SELECTED_CHIP_EVIDENCE')
    for (const forbidden of ['UNSELECTED_BODY', 'CURRENT_VOLUME_BODY', 'UNAPPROVED_CHAPTER_BODY',
      'UNAPPROVED_MEMORY', 'RESOLVED_FORESHADOW']) expect(first.prompt).not.toContain(forbidden)
    expect(record(stage.trace).final_prompt).toBeUndefined()
  })

  test('debug requires explicit opt-in and survives checkpoint round trips', () => {
    request = { ...request, debug: true }
    const prepared = service.prepare(request, null)
    expect(record(record(prepared.checkpoint.stage_compiles.outline).trace).final_prompt).toBe(prepared.prompt)
    expect(service.prepare(request, copy(prepared.checkpoint))).toEqual(prepared)
    expect(() => service.prepare({ ...request, debug: false }, prepared.checkpoint)).toThrow(OutlineGenerationBoundaryError)
  })

  test('independent chapter ids associate through unique chapter numbers and only previous volumes enter context', () => {
    workbench.createVolume({ id: 'future-volume', project_id: request.projectId, volume_number: 3,
      title: '雾港航线后卷' })
    workbench.createChapterOutline({ id: 'future-chapter-outline', project_id: request.projectId,
      volume_id: 'future-volume', chapter_number: 4, title: '雾港航线后卷章节' })
    workbench.chapters.create({ id: 'future-chapter', project_id: request.projectId, chapter_number: 4,
      status: 'completed', synopsis: 'FUTURE_CHAPTER_MUST_NOT_ENTER_PROMPT', content: '雾港航线后卷正文' })
    workbench.chapters.create({ id: 'unassociated-chapter', project_id: request.projectId, chapter_number: 5,
      status: 'completed', synopsis: 'UNASSOCIATED_CHAPTER_MUST_NOT_ENTER_PROMPT', content: '雾港航线未关联章节正文' })
    const prepared = service.prepare(request, null)
    const source = JSON.parse(prepared.checkpoint.source_snapshot) as { input: ContextCompilerInput }
    expect(source.input.prior_chapters?.map((chapter) => chapter.id)).toEqual(['prior-chapter'])
    expect(prepared.prompt).not.toContain('CURRENT_VOLUME_BODY')
    expect(prepared.prompt).not.toContain('FUTURE_CHAPTER_MUST_NOT_ENTER_PROMPT')
    expect(prepared.prompt).not.toContain('UNASSOCIATED_CHAPTER_MUST_NOT_ENTER_PROMPT')
    expect(() => workbench.createChapterOutline({ project_id: request.projectId,
      volume_id: 'future-volume', chapter_number: 1, title: 'Duplicate project chapter number' })).toThrow()
  })

  test('optional oversized sources are discarded with a trace and mandatory budget failure stays closed', () => {
    workbench.updateSourceMaterial(request.projectId, 'selected-material', { content: '雾港航线'.repeat(2_000) })
    const constrained = { ...request, modelParams: { ...request.modelParams, context_budget: 800, max_output_tokens: 100 } }
    const prepared = service.prepare(constrained, null)
    const trace = record(record(prepared.checkpoint.stage_compiles.outline).trace)
    expect(trace.discarded).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'source_material:selected-material', reason: expect.objectContaining({ code: 'budget_exhausted' }) }),
    ]))
    expect(prepared.prompt).not.toContain('雾港航线'.repeat(2_000))
    const tooSmall = { ...request, modelParams: { ...request.modelParams, context_budget: 1 } }
    let error: unknown
    try { service.prepare(tooSmall, null) } catch (caught) { error = caught }
    expect(error).toBeInstanceOf(ContextBudgetExceededError)
    if (!(error instanceof ContextBudgetExceededError)) throw new Error('Expected mandatory budget failure')
    const failed = service.failedBudgetCheckpoint(tooSmall, error)
    expect(parseOutlineCheckpoint(failed)).not.toBeNull()
    expect(record(record(failed.stage_compiles.outline).trace).errors).not.toEqual([])
    expect(record(record(failed.stage_compiles.outline).trace).final_prompt).toBeUndefined()
    expect(workbench.getVolumeOutline(request.projectId, request.outlineId).version).toBe(1)
  })

  test('prepared and model checkpoints recover the same prompt; ready recovers without a model prompt', () => {
    const prepared = service.prepare(request, null)
    expect(service.prepare(request, prepared.checkpoint).prompt).toBe(prepared.prompt)
    const model: OutlineCheckpoint = { ...prepared.checkpoint, stage: 'model' }
    expect(parseOutlineCheckpoint(model)).toEqual(model)
    expect(service.prepare(request, model).prompt).toBe(prepared.prompt)
    const completed = ready()
    expect(service.prepare(request, completed)).toEqual({ checkpoint: completed, prompt: null })
    expect(workbench.getVolumeOutline(request.projectId, request.outlineId).version).toBe(1)
  })

  test.each(['edit', 'confirm', 'lock'] as const)('ready recovery rejects a user %s and preserves SQLite state', (action) => {
    const checkpoint = ready()
    if (action === 'edit') workbench.updateVolumeOutline(request.projectId, request.outlineId, { summary: 'User newer draft' })
    if (action !== 'edit') workbench.confirmVolumeOutline(request.projectId, request.outlineId)
    if (action === 'lock') workbench.lockVolumeOutline(request.projectId, request.outlineId)
    const newer = workbench.getVolumeOutline(request.projectId, request.outlineId)
    expect(() => service.prepare(request, checkpoint)).toThrow()
    expect(() => service.apply(request, checkpoint, 'outline-task')).toThrow()
    expect(workbench.getVolumeOutline(request.projectId, request.outlineId)).toEqual(newer)
  })

  test.each(['material', 'character', 'worldview', 'relation', 'chapter', 'memory', 'foreshadow', 'config', 'project', 'volume'] as const)(
    'ready recovery rejects a changed %s source before applying', (source) => {
      const checkpoint = ready()
      changeSource(source)
      const current = workbench.getVolumeOutline(request.projectId, request.outlineId)
      expect(() => service.prepare(request, checkpoint)).toThrow(OutlineGenerationBoundaryError)
      expect(() => service.apply(request, checkpoint, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
      expect(workbench.getVolumeOutline(request.projectId, request.outlineId)).toEqual(current)
    },
  )

  function changeSource(source: string): void {
    if (source === 'material') workbench.updateSourceMaterial(request.projectId, 'selected-material', { content: 'New source evidence' })
    if (source === 'character') workbench.updateCharacter(request.projectId, 'captain', { notes: 'New source note' })
    if (source === 'worldview') workbench.updateWorldviewEntry(request.projectId, 'harbor', { content: 'New setting' })
    if (source === 'relation') workbench.updateRelation(request.projectId, 'alliance', { strength: 20 })
    if (source === 'chapter') workbench.chapters.update('prior-chapter', { synopsis: 'New adopted synopsis' })
    if (source === 'memory') workbench.narrativeMemories.create({ project_id: request.projectId,
      memory_type: 'fact', title: 'New approved fact', content: 'New source', status: 'approved' })
    if (source === 'foreshadow') workbench.foreshadows.updateStatus('active-foreshadow', 'revealed')
    if (source === 'config') workbench.updateProjectConfig(request.projectId, { settings: { changed: true } })
    if (source === 'project') workbench.updateProject(request.projectId, { description: 'New project description' })
    if (source === 'volume') workbench.updateVolume(request.projectId, 'current-volume', { synopsis: 'New volume goal' })
  }

  test.each(['model', 'temperature', 'max_output_tokens', 'context_budget', 'debug'] as const)(
    'ready recovery fences changed %s parameters', (field) => {
      const checkpoint = ready()
      const changed = copy(request)
      if (field === 'debug') changed.debug = true
      if (field === 'model') changed.modelParams.model = 'another-outline-model'
      if (field === 'temperature') changed.modelParams.temperature = 0.8
      if (field === 'max_output_tokens') changed.modelParams.max_output_tokens = 2_048
      if (field === 'context_budget') changed.modelParams.context_budget = 16_000
      expect(() => service.prepare(changed, checkpoint)).toThrow(OutlineGenerationBoundaryError)
    },
  )

  test('bad compiler metadata and a valid-shaped but forged trace both fail closed', () => {
    const checkpoint = ready()
    const corrupt = copy(checkpoint)
    record(corrupt.stage_compiles.outline).model_params = { ...request.modelParams, model: 'corrupt-model' }
    expect(parseOutlineCheckpoint(corrupt)).toBeNull()
    expect(() => service.prepare(request, corrupt)).toThrow(OutlineGenerationBoundaryError)
    const forged = copy(checkpoint)
    const trace = record(record(forged.stage_compiles.outline).trace)
    trace.warnings = ['syntactically valid but not compiled from these sources']
    expect(parseOutlineCheckpoint(forged)).not.toBeNull()
    expect(() => service.prepare(request, forged)).toThrow(OutlineGenerationBoundaryError)
    const badSnapshot = copy(checkpoint)
    badSnapshot.source_snapshot = '{}'
    expect(parseOutlineCheckpoint(badSnapshot)).toBeNull()
    expect(() => service.apply(request, badSnapshot, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
    const wrongPrompt = copy(checkpoint)
    const source = record(JSON.parse(wrongPrompt.source_snapshot))
    source.prompt_version = 'different-prompt-version'
    wrongPrompt.source_snapshot = JSON.stringify(source)
    expect(() => service.prepare(request, wrongPrompt)).toThrow(OutlineGenerationBoundaryError)
  })

  test('applied checkpoint recovers idempotently without reapplying, confirming or locking', () => {
    const checkpoint = applyAndCheckpoint(ready())
    const applied = workbench.getVolumeOutline(request.projectId, request.outlineId)
    expect(checkpoint.applied_version).toBe(2)
    expect(applied).toMatchObject({ ...proposal, status: 'draft', version: 2,
      metadata: { user_note: 'preserve this metadata', generated_outline_task_id: 'outline-task' } })
    expect(parseOutlineCheckpoint(copy(checkpoint))).toEqual(checkpoint)
    expect(service.prepare(request, copy(checkpoint), 'outline-task')).toEqual({ checkpoint, prompt: null })
    expect(service.prepare(request, copy(checkpoint), 'outline-task')).toEqual({ checkpoint, prompt: null })
    expect(workbench.getVolumeOutline(request.projectId, request.outlineId)).toEqual(applied)
    expect(() => service.apply(request, checkpoint, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
    expect(() => service.prepare(request, checkpoint)).toThrow(OutlineGenerationBoundaryError)
    expect(() => service.prepare(request, checkpoint, 'another-task')).toThrow(OutlineGenerationBoundaryError)
  })

  test.each(['edit', 'confirm', 'lock'] as const)('applied recovery rejects a later user %s and never overwrites it', (action) => {
    const checkpoint = applyAndCheckpoint(ready())
    if (action === 'edit') workbench.updateVolumeOutline(request.projectId, request.outlineId, { ending: 'User revised ending' })
    if (action !== 'edit') workbench.confirmVolumeOutline(request.projectId, request.outlineId)
    if (action === 'lock') workbench.lockVolumeOutline(request.projectId, request.outlineId)
    const current = workbench.getVolumeOutline(request.projectId, request.outlineId)
    expect(() => service.prepare(request, checkpoint, 'outline-task')).toThrow()
    expect(workbench.getVolumeOutline(request.projectId, request.outlineId)).toEqual(current)
  })

  test.each(['material', 'character', 'worldview', 'relation', 'chapter', 'memory', 'foreshadow', 'config', 'project', 'volume'] as const)(
    'applied recovery restores only generated fields and rejects changed %s inputs', (source) => {
      const checkpoint = applyAndCheckpoint(ready())
      changeSource(source)
      const current = workbench.getVolumeOutline(request.projectId, request.outlineId)
      expect(() => service.prepare(request, checkpoint, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
      expect(workbench.getVolumeOutline(request.projectId, request.outlineId)).toEqual(current)
    },
  )

  test('applied version, task marker and all five generated fields must match durable state', () => {
    const checkpoint = applyAndCheckpoint(ready())
    const wrongVersion = { ...checkpoint, applied_version: 3 }
    expect(parseOutlineCheckpoint(wrongVersion)).toBeNull()
    expect(() => service.prepare(request, wrongVersion, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
    const noVersion = copy(checkpoint)
    delete noVersion.applied_version
    expect(parseOutlineCheckpoint(noVersion)).toBeNull()
    const forgedProposal = copy(checkpoint)
    if (!forgedProposal.proposal) throw new Error('Expected applied proposal')
    forgedProposal.proposal.ending = 'Forged ending'
    expect(() => service.prepare(request, forgedProposal, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
    database.prepare('UPDATE volume_outlines SET metadata_json = ? WHERE id = ?')
      .run(JSON.stringify({ generated_outline_task_id: 'unrelated-task' }), request.outlineId)
    expect(() => service.prepare(request, checkpoint, 'outline-task')).toThrow(OutlineGenerationBoundaryError)
  })

  test('checkpoint stages enforce proposal and applied_version placement', () => {
    const prepared = service.prepare(request, null).checkpoint
    expect(parseOutlineCheckpoint({ ...prepared, applied_version: 2 })).toBeNull()
    expect(parseOutlineCheckpoint({ ...prepared, stage: 'ready' })).toBeNull()
    expect(parseOutlineCheckpoint({ ...prepared, proposal: copy(proposal) })).toBeNull()
    expect(parseOutlineCheckpoint({ ...ready(), stage: 'model' })).toBeNull()
    expect(parseOutlineProposal({ ...proposal, key_turning_points: [false] })).toBeNull()
    expect(parseOutlineProposal({ ...proposal, summary: ' ' })).toBeNull()
    expect(parseOutlineProposal({ ...proposal, key_turning_points: Array.from({ length: 101 }, () => 'event') })).toBeNull()
  })
})
