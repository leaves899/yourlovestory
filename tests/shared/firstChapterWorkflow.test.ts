import {
  evaluateFirstChapterWorkflow,
  type FirstChapterWorkflowInput,
} from '@/shared/firstChapterWorkflow'
import type {
  ChapterOutline,
  Character,
  Project,
  ProjectConfig,
  Relation,
  Volume,
  VolumeOutline,
  WorldviewEntry,
} from '@/shared/novelProject'

const now = '2026-01-01T00:00:00.000Z'

function baseInput(): FirstChapterWorkflowInput {
  const project: Project = { id: 'project-1', slug: 'story', name: '故事', description: '一名旅人寻找失落的归途。', status: 'active', version: 1, created_at: now, updated_at: now }
  const config: ProjectConfig = { project_id: project.id, default_llm_config_id: null, genre: '奇幻', tone: '克制', target_words: null, context_budget: null, settings: {}, version: 1, created_at: now, updated_at: now }
  const protagonist: Character = { id: 'character-1', project_id: project.id, name: '主角', role: 'protagonist', crush_slug: null, profile: {}, notes: '', sort_order: 0, version: 1, created_at: now, updated_at: now }
  const companion: Character = { ...protagonist, id: 'character-2', name: '同伴', role: 'core' }
  const relation: Relation = { id: 'relation-1', project_id: project.id, source_entity_type: 'character', source_entity_id: protagonist.id, target_entity_type: 'character', target_entity_id: companion.id, source_character_id: protagonist.id, target_character_id: companion.id, relation_type: '盟友', description: '', strength: null, metadata: {}, version: 1, created_at: now, updated_at: now }
  const worldview: WorldviewEntry = { id: 'worldview-1', project_id: project.id, category: '世界规则', title: '迷雾', content: '迷雾会改变道路。', metadata: {}, sort_order: 0, version: 1, created_at: now, updated_at: now }
  const volume: Volume = { id: 'volume-1', project_id: project.id, volume_number: 1, title: '第一卷', synopsis: '', status: 'planned', sort_order: 0, target_words: null, version: 1, created_at: now, updated_at: now }
  const volumeOutline: VolumeOutline = { id: 'volume-outline-1', project_id: project.id, volume_id: volume.id, status: 'confirmed', summary: '启程', theme: '', main_conflict: '', key_turning_points: [], ending: '', outline: {}, source_material_ids: [], metadata: {}, version: 1, created_at: now, updated_at: now }
  const chapterOutline: ChapterOutline = { id: 'chapter-outline-1', project_id: project.id, volume_id: volume.id, chapter_number: 1, sort_order: 0, title: '迷雾来信', summary: '', purpose: '让主角启程', opening: '来信抵达', conflict: '道路封闭', key_events: ['收到来信'], ending: '主角出发', ending_hook: '', status: 'confirmed', outline: {}, source_material_ids: [], metadata: {}, version: 1, created_at: now, updated_at: now }
  return {
    project,
    config,
    characters: [protagonist, companion],
    relations: [relation],
    worldviewEntries: [worldview],
    organizations: [],
    sourceMaterials: [],
    volumes: [volume],
    volumeOutlines: [volumeOutline],
    chapterOutlines: [chapterOutline],
    chapterVersions: [],
    modelCredentialConfigured: true,
    modelEndpointValid: true,
    generationTaskRunning: false,
  }
}

function expectBlocked(input: FirstChapterWorkflowInput, checkId: string): void {
  const snapshot = evaluateFirstChapterWorkflow(input)
  const item = snapshot.checks.find((candidate) => candidate.id === checkId)
  expect(snapshot.canGenerate).toBe(false)
  expect(item).toMatchObject({ blocking: true })
  expect(item?.actionRoute).toMatch(/^\/workbench\//)
}

describe('first chapter workflow evaluator', () => {
  test('blocks without a project', () => expectBlocked({ ...baseInput(), project: null }, 'project-missing'))
  test('blocks without a concept', () => expectBlocked({ ...baseInput(), project: { ...baseInput().project!, description: '' } }, 'concept-missing'))
  test('blocks without a protagonist', () => expectBlocked({ ...baseInput(), characters: [] }, 'protagonist-missing'))
  test('blocks without a core relationship', () => expectBlocked({ ...baseInput(), relations: [] }, 'core-relation-missing'))
  test('blocks without worldview', () => expectBlocked({ ...baseInput(), worldviewEntries: [] }, 'worldview-missing'))
  test('blocks without a volume outline', () => expectBlocked({ ...baseInput(), volumeOutlines: [] }, 'volume-outline-missing'))
  test('blocks with a draft volume outline', () => expectBlocked({ ...baseInput(), volumeOutlines: [{ ...baseInput().volumeOutlines[0], status: 'draft' }] }, 'volume-outline-draft'))
  test('blocks with a draft chapter outline', () => expectBlocked({ ...baseInput(), chapterOutlines: [{ ...baseInput().chapterOutlines[0], status: 'draft' }] }, 'chapter-outline-draft'))

  test('allows generation when all blocking requirements are satisfied', () => {
    const snapshot = evaluateFirstChapterWorkflow(baseInput())
    expect(snapshot.canGenerate).toBe(true)
  })

  test('warnings and suggestions do not block generation', () => {
    const input = baseInput()
    const snapshot = evaluateFirstChapterWorkflow({
      ...input,
      config: { ...input.config!, genre: '', tone: '' },
      organizations: [],
      sourceMaterials: [],
    })
    expect(snapshot.checks.some((item) => item.severity !== 'error')).toBe(true)
    expect(snapshot.canGenerate).toBe(true)
  })

  test('every blocking error provides a recovery route', () => {
    const input = baseInput()
    const snapshot = evaluateFirstChapterWorkflow({
      ...input,
      project: { ...input.project!, status: 'archived', description: '' },
      characters: [],
      relations: [],
      worldviewEntries: [],
      volumes: [],
      volumeOutlines: [],
      chapterOutlines: [],
      modelCredentialConfigured: false,
      modelEndpointValid: false,
      generationTaskRunning: true,
    })
    const errors = snapshot.checks.filter((item) => item.blocking)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((item) => item.actionRoute?.startsWith('/workbench/'))).toBe(true)
  })
})
