import { expect, test } from '@playwright/test'

interface WorkflowRuntimeWindow {
  electronAPI: Record<string, unknown>
  __workflowCalls: string[]
  __failNarrativeProposals: boolean
}

async function injectFirstChapterMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    type Entity = Record<string, unknown>
    const runtime = window as unknown as WorkflowRuntimeWindow
    const calls: string[] = []
    const now = new Date().toISOString()
    let project: Entity | null = null
    let config: Entity | null = null
    let characters: Entity[] = []
    let relations: Entity[] = []
    let worldview: Entity[] = []
    let volumes: Entity[] = []
    let volumeOutlines: Entity[] = []
    let chapterOutlines: Entity[] = []
    let tasks: Entity[] = []
    let versions: Entity[] = []
    let memoryProposals: Entity[] = []
    let foreshadows: Entity[] = []
    const organizations: Entity[] = []
    const materials: Entity[] = []

    const success = (data: unknown) => ({ success: true, data })
    const id = (prefix: string, length: number): string => `${prefix}-${length + 1}`
    const events = () => () => undefined
    const emptyList = async () => success([])
    const projectId = (): string => String(project?.id ?? '')

    const refreshVersion = (entity: Entity, status: string): Entity => ({
      ...entity,
      status,
      version: Number(entity.version ?? 1) + 1,
      updated_at: now,
    })

    runtime.electronAPI = {
      getCrushes: emptyList,
      listNovelProjects: async () => success(project ? [project] : []),
      getCurrentNovelProject: async () => success(project),
      createNovelProject: async (params: Entity) => {
        calls.push('project:create')
        project = {
          id: 'project-1',
          slug: params.slug,
          name: params.name,
          description: params.description,
          status: 'active',
          version: 1,
          created_at: now,
          updated_at: now,
        }
        config = {
          project_id: 'project-1',
          default_llm_config_id: null,
          genre: '',
          tone: '',
          target_words: null,
          context_budget: null,
          settings: {},
          version: 1,
          created_at: now,
          updated_at: now,
        }
        return success(project)
      },
      selectNovelProject: async () => success(project),
      getNovelProjectConfig: async () => success(config),
      updateNovelProjectConfig: async (params: Entity) => {
        config = { ...config, ...(params.input as Entity), version: Number(config?.version ?? 1) + 1 }
        return success(config)
      },
      listNovelVolumes: async () => success(volumes),
      listNovelVolumeOutlines: async () => success(volumeOutlines),
      listNovelChapterOutlines: async () => success(chapterOutlines),
      listNovelCharacters: async () => success(characters),
      listNovelWorldviewEntries: async () => success(worldview),
      listNovelOrganizations: async () => success(organizations),
      listNovelRelations: async () => success(relations),
      listSourceMaterials: async () => success(materials),
      createNovelCharacter: async (params: Entity) => {
        const character = {
          ...params,
          id: id('character', characters.length),
          version: 1,
          created_at: now,
          updated_at: now,
          profile: params.profile ?? {},
          notes: params.notes ?? '',
          sort_order: params.sort_order ?? characters.length,
          crush_slug: null,
        }
        characters = [...characters, character]
        return success(character)
      },
      createNovelRelation: async (params: Entity) => {
        calls.push('relation:create')
        const source = params.source as Entity
        const target = params.target as Entity
        const relation = {
          ...params,
          id: 'relation-1',
          source_entity_type: source.type,
          source_entity_id: source.id,
          target_entity_type: target.type,
          target_entity_id: target.id,
          source_character_id: source.id,
          target_character_id: target.id,
          strength: null,
          metadata: {},
          version: 1,
          created_at: now,
          updated_at: now,
        }
        relations = [relation]
        return success(relation)
      },
      createNovelWorldviewEntry: async (params: Entity) => {
        const entry = { ...params, id: 'worldview-1', version: 1, sort_order: 0, created_at: now, updated_at: now }
        worldview = [entry]
        return success(entry)
      },
      createNovelVolume: async (params: Entity) => {
        const volume = { ...params, id: 'volume-1', version: 1, created_at: now, updated_at: now, target_words: null }
        volumes = [volume]
        return success(volume)
      },
      createNovelVolumeOutline: async (params: Entity) => {
        const outline = {
          ...params,
          id: 'volume-outline-1',
          status: 'draft',
          outline: {},
          source_material_ids: [],
          metadata: params.metadata ?? {},
          version: 1,
          created_at: now,
          updated_at: now,
        }
        volumeOutlines = [outline]
        return success(outline)
      },
      createNovelChapterOutline: async (params: Entity) => {
        const outline = {
          ...params,
          id: 'chapter-outline-1',
          status: 'draft',
          outline: {},
          source_material_ids: [],
          metadata: params.metadata ?? {},
          version: 1,
          created_at: now,
          updated_at: now,
        }
        chapterOutlines = [outline]
        return success(outline)
      },
      confirmNovelVolumeOutline: async () => {
        volumeOutlines = volumeOutlines.map((item) => refreshVersion(item, 'confirmed'))
        return success(volumeOutlines[0])
      },
      confirmNovelChapterOutline: async () => {
        chapterOutlines = chapterOutlines.map((item) => refreshVersion(item, 'confirmed'))
        return success(chapterOutlines[0])
      },
      lockNovelVolumeOutline: async () => success(volumeOutlines[0]),
      lockNovelChapterOutline: async () => success(chapterOutlines[0]),
      getLlmCredentialStatus: async () => success({
        configured: true,
        storageAvailable: true,
        backend: 'test',
        error: null,
      }),
      listTasks: async () => success(tasks),
      listRecoverableTasks: emptyList,
      startChapterGeneration: async () => {
        calls.push('generation:start')
        tasks = [{
          id: 'task-1',
          project_id: projectId(),
          chapter_id: 'chapter-1',
          parent_task_id: null,
          task_type: 'chapter-generation',
          status: 'completed',
          stage: 'review',
          progress: 1,
          input: {
            request: {
              chapter_outline_id: 'chapter-outline-1',
            },
          },
          checkpoint: null,
          result: {},
          error_message: null,
          cancel_requested: false,
          started_at: now,
          finished_at: now,
          created_at: now,
          updated_at: now,
        }]
        versions = [{
          id: 'version-1',
          chapter_id: 'chapter-1',
          task_id: 'task-1',
          version_number: 1,
          content: '雨夜里，主角收到一封改变旅程的来信。',
          summary: '主角收到来信并决定启程。',
          fact_check: {
            passed: true,
            summary: '正文与章纲一致。',
            findings: [{
              claim: '主角收到来信',
              status: 'supported',
              severity: 'info',
              evidence: '正文第一段',
              suggestion: '保持当前表述',
            }],
          },
          status: 'review',
          is_current: false,
          created_at: now,
          reviewed_at: now,
          confirmed_at: null,
        }]
        return success({ taskId: 'task-1' })
      },
      listChapterVersions: async () => success(versions),
      confirmChapterVersion: async () => {
        calls.push('version:confirm')
        versions = versions.map((item) => ({ ...item, status: 'approved', is_current: true, confirmed_at: now }))
        return success(versions[0])
      },
      rejectChapterVersion: async () => success(versions[0]),
      extractNarrativeMemories: async (_projectId: string, chapterId: string, _content?: string, versionId?: string) => {
        calls.push('memory:extract')
        if (runtime.__failNarrativeProposals) throw new Error('记忆提案生成失败')
        memoryProposals = [{
          id: 'memory-proposal-1',
          project_id: projectId(),
          source_chapter_id: chapterId,
          source_version_id: versionId ?? null,
          memory_type: 'event',
          title: '收到来信',
          content: '主角收到来信。',
          confidence: 0.9,
          status: 'proposed',
          evidence: ['正文第一段'],
          metadata: {},
          created_at: now,
          updated_at: now,
        }]
        return success({ proposals: memoryProposals, used_fallback: false, error: null })
      },
      suggestForeshadows: async () => {
        calls.push('foreshadow:suggest')
        if (runtime.__failNarrativeProposals) throw new Error('伏笔提案生成失败')
        foreshadows = [{
          id: 'foreshadow-1',
          project_id: projectId(),
          title: '来信来源',
          description: '来信的真实来源仍未揭示。',
          status: 'suggested',
          planned_payoff_chapter_id: null,
          actual_payoff_chapter_id: null,
          importance: 3,
          metadata: { source_chapter_id: 'chapter-1' },
          created_at: now,
          updated_at: now,
        }]
        return success({ suggestions: foreshadows, used_fallback: false, error: null })
      },
      listNarrativeMemories: emptyList,
      listNarrativeMemoryProposals: async () => success(memoryProposals),
      listForeshadows: async () => success(foreshadows),
      listNarrativeSkills: emptyList,
      listAssistantSessions: emptyList,
      createAssistantSession: async () => success({
        session: {
          id: 'session-1',
          project_id: projectId(),
          title: '写作任务',
          session_type: 'writer',
          status: 'active',
          agent_config: {},
          created_at: now,
          updated_at: now,
        },
        messages: [],
      }),
      getAssistantSession: async () => success({
        session: {
          id: 'session-1',
          project_id: projectId(),
          title: '写作任务',
          session_type: 'writer',
          status: 'active',
          agent_config: {},
          created_at: now,
          updated_at: now,
        },
        messages: [],
      }),
      cancelTask: async () => ({ success: true }),
      onTaskStart: events,
      onTaskStage: events,
      onTaskChunk: events,
      onTaskCheckpoint: events,
      onTaskReview: events,
      onTaskEnd: events,
      onTaskError: events,
      onAssistantEvent: events,
    }
    runtime.__workflowCalls = calls
    runtime.__failNarrativeProposals = false
  })
}

async function completeToReview(page: import('@playwright/test').Page): Promise<void> {
  await expect(page).toHaveURL(/\/workbench\/first-chapter/)
  await expect(page.getByTestId('workflow-check-project-missing')).toBeVisible()
  await expect(page.getByTestId('wizard-go-write')).toBeDisabled()
  await page.getByTestId('wizard-project-name').fill('雨夜来信')
  await page.getByTestId('wizard-project-slug').fill('rain-letter')
  await page.getByTestId('wizard-concept').fill('一名旅人在雨夜收到一封指向失落故乡的来信。')
  await page.getByTestId('wizard-create-project').click()

  await page.getByTestId('wizard-protagonist').fill('旅人')
  await page.getByTestId('wizard-core-character').fill('送信人')
  await page.getByTestId('wizard-relation-type').fill('命运同盟')
  await page.getByTestId('wizard-create-characters').click()
  await page.getByTestId('wizard-create-draft').click()

  await expect(page.getByTestId('workflow-check-volume-outline-draft')).toBeVisible()
  await page.getByTestId('wizard-confirm-volume').click()
  await page.getByTestId('wizard-confirm-chapter').click()
  await expect(page.getByTestId('wizard-go-write')).toBeEnabled()
  await page.getByTestId('wizard-go-write').click()

  await expect(page.getByTestId('start-chapter-generation')).toBeEnabled()
  await expect(page.getByTestId('workflow-check-genre-missing')).toContainText('警告')
  await expect(page.getByTestId('workflow-check-materials-missing')).toContainText('建议')
  await page.getByTestId('start-chapter-generation').click()
  await expect(page.getByTestId('first-chapter-progress')).toContainText('审阅并确认')
  await page.getByTestId('first-chapter-next-action').click()
  await expect(page).toHaveURL(/\/workbench\/review/)

  await expect(page.getByTestId('review-chapter-content')).toContainText('主角收到一封改变旅程的来信')
  await expect(page.getByText('保持当前表述')).toBeVisible()
}

test('新用户可以完成第一章黄金路径并生成叙事提案', async ({ page }) => {
  await injectFirstChapterMock(page)
  await page.goto('/#/workbench')
  await completeToReview(page)

  await page.getByTestId('confirm-chapter-version').click()
  await expect(page.getByTestId('narrative-proposal-status')).toContainText('记忆提案 1 条')
  await expect(page.getByTestId('narrative-proposal-status')).toContainText('伏笔提案 1 条')

  const calls = await page.evaluate(() => (window as unknown as WorkflowRuntimeWindow).__workflowCalls)
  expect(calls).toContain('generation:start')
  expect(calls).toContain('version:confirm')
  expect(calls).toContain('memory:extract')
  expect(calls).toContain('foreshadow:suggest')

  await page.goto('/#/fragment')
  await expect(page.getByTestId('fragment-page')).toBeVisible()
})

test('提案失败不撤销章节确认并允许重试', async ({ page }) => {
  await injectFirstChapterMock(page)
  await page.goto('/#/workbench')
  await completeToReview(page)
  await page.evaluate(() => {
    (window as unknown as WorkflowRuntimeWindow).__failNarrativeProposals = true
  })

  await page.getByTestId('confirm-chapter-version').click()
  await expect(page.getByTestId('narrative-proposal-status')).toContainText('章节已确认')
  await expect(page.getByTestId('retry-narrative-proposals')).toBeVisible()
  await expect(page.getByText('approved')).toBeVisible()

  await page.evaluate(() => {
    (window as unknown as WorkflowRuntimeWindow).__failNarrativeProposals = false
  })
  await page.getByTestId('retry-narrative-proposals').click()
  await expect(page.getByTestId('narrative-proposal-status')).toContainText('记忆提案 1 条')
  await expect(page.getByTestId('narrative-proposal-status')).toContainText('伏笔提案 1 条')
})
