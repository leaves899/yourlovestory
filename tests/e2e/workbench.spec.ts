import { expect, test } from '@playwright/test'

interface RuntimeWindow {
  electronAPI: Record<string, unknown>
}

async function injectWorkbenchMock(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const runtime = window as unknown as RuntimeWindow
    const now = new Date().toISOString()
    const projectOne = {
      id: 'project-1',
      slug: 'first-project',
      name: '第一部小说',
      description: '用于工作台测试的本地项目',
      status: 'active',
      version: 1,
      created_at: now,
      updated_at: now,
    }
    const projectTwo = { ...projectOne, id: 'project-2', slug: 'second-project', name: '第二部小说' }
    let projects = [projectOne, projectTwo]
    let currentProject = projectOne
    const chapter = {
      id: 'chapter-outline-1',
      project_id: projectOne.id,
      volume_id: 'volume-1',
      chapter_number: 1,
      sort_order: 0,
      title: '雾中的来信',
      summary: '测试章节',
      purpose: '',
      opening: '',
      conflict: '',
      key_events: [],
      ending: '',
      ending_hook: '',
      status: 'draft',
      outline: {},
      source_material_ids: [],
      metadata: {},
      version: 1,
      created_at: now,
      updated_at: now,
    }
    const session = {
      id: 'session-1',
      project_id: projectOne.id,
      title: '创作助手',
      session_type: 'assistant',
      status: 'active',
      agent_config: {},
      created_at: now,
      updated_at: now,
    }
    const success = (data: unknown) => ({ success: true, data })
    const emptyList = async () => success([])
    const unsubscribe = () => undefined

    runtime.electronAPI = {
      getDatabaseStatus: async () => success({
        state: 'ready',
        integrity: 'ok',
        schemaVersion: 8,
        message: null,
        lastBackupAt: null,
        backupAllowed: true,
        backupEligibility: 'safe',
        backupBlockedReason: null,
      }),
      getCrushes: async () => success([]),
      listNovelProjects: async () => success(projects),
      getCurrentNovelProject: async () => success(currentProject),
      selectNovelProject: async (params: { project_id: string }) => {
        currentProject = projects.find((project) => project.id === params.project_id) ?? currentProject
        return success(currentProject)
      },
      createNovelProject: async (params: { name: string; slug: string; description?: string }) => {
        const project = { ...projectOne, id: `project-${projects.length + 1}`, name: params.name, slug: params.slug, description: params.description ?? '' }
        projects = [...projects, project]
        currentProject = project
        return success(project)
      },
      deleteNovelProject: async (params: { project_id: string }) => {
        projects = projects.filter((project) => project.id !== params.project_id)
        return { success: true }
      },
      getNovelProjectConfig: async () => success({ project_id: currentProject.id, default_llm_config_id: null, genre: '', tone: '', target_words: null, context_budget: null, settings: {}, version: 1, created_at: now, updated_at: now }),
      getLlmCredentialStatus: async () => success({
        configured: true,
        storageAvailable: true,
        backend: 'test',
        error: null,
      }),
      saveLlmCredential: async () => success({ configured: true }),
      testLlmCredential: async () => success({ message: '连接测试成功。' }),
      deleteLlmCredential: async () => ({
        success: false,
        error: {
          code: 'STORAGE_WRITE_FAILED',
          message: '安全存储删除失败，请重试。',
          retryable: true,
        },
      }),
      listNovelVolumes: emptyList,
      listNovelVolumeOutlines: emptyList,
      listNovelChapterOutlines: async () => success([chapter]),
      listNovelCharacters: emptyList,
      listNovelWorldviewEntries: emptyList,
      listNovelOrganizations: emptyList,
      listNovelRelations: emptyList,
      listSourceMaterials: emptyList,
      onTaskStart: () => unsubscribe,
      onTaskStage: () => unsubscribe,
      onTaskChunk: () => unsubscribe,
      onTaskCheckpoint: () => unsubscribe,
      onTaskReview: () => unsubscribe,
      onTaskEnd: () => unsubscribe,
      onTaskError: () => unsubscribe,
      listTasks: emptyList,
      listRecoverableTasks: emptyList,
      listAssistantSessions: async () => success([session]),
      getAssistantSession: async () => success({ session, messages: [] }),
      createAssistantSession: async () => success({ session, messages: [] }),
      onAssistantEvent: () => unsubscribe,
      startChapterGeneration: async () => success({ taskId: 'task-1' }),
      startChapterPolish: async () => success({ taskId: 'task-2' }),
      listChapterVersions: emptyList,
      confirmChapterVersion: async () => success({}),
      rejectChapterVersion: async () => success({}),
      cancelTask: async () => ({ success: true }),
      resumeTask: async () => success({ taskId: 'task-1' }),
      listNarrativeMemories: emptyList,
      listNarrativeMemoryProposals: emptyList,
      listForeshadows: emptyList,
      listNarrativeSkills: emptyList,
    }
  })
}

test.describe('长篇创作工作台', () => {
  test.beforeEach(async ({ page }) => {
    await injectWorkbenchMock(page)
    await page.goto('/#/workbench/projects')
  })

  test('可以创建项目并保护当前项目删除', async ({ page }) => {
    await expect(page.getByTestId('workbench-shell')).toBeVisible()
    await expect(page.getByTestId('project-list').getByText('第一部小说', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '删除第一部小说' })).toBeDisabled()
    await page.getByTestId('project-name-input').fill('新长篇')
    await page.getByTestId('project-slug-input').fill('new-novel')
    await page.getByTestId('create-project-button').click()
    await expect(page.getByTestId('project-list').getByText('新长篇', { exact: true })).toBeVisible()
    await expect(page.getByTestId('workbench-project-switcher')).toHaveValue('project-3')
  })

  test('项目切换会阻止未保存修改并提供恢复入口', async ({ page }) => {
    await page.goto('/#/workbench/config')
    await page.getByLabel('题材').fill('悬疑')
    await page.getByTestId('workbench-project-switcher').selectOption('project-2')
    await expect(page.getByText('切换项目会丢失未保存内容')).toBeVisible()
    await page.getByRole('button', { name: '继续编辑' }).click()
    await expect(page.getByTestId('workbench-project-switcher')).toHaveValue('project-1')
    await page.getByTestId('workbench-project-switcher').selectOption('project-2')
    await page.getByRole('button', { name: '放弃并切换' }).click()
    await expect(page.getByTestId('workbench-project-switcher')).toHaveValue('project-2')
  })

  test('旧入口不阻塞工作台路由，草稿章节会禁用生成按钮', async ({ page }) => {
    await page.goto('/#/workbench/write')
    await expect(page.getByRole('heading', { name: '章节写作' })).toBeVisible()
    await expect(page.getByTestId('start-chapter-generation')).toBeDisabled()
    await page.goto('/#/fragment')
    await expect(page.getByTestId('fragment-page')).toBeVisible()
  })

  test('项目凭据删除失败时保持已配置状态并显示安全错误', async ({ page }) => {
    await page.goto('/#/workbench/config')
    await expect(page.getByText('已安全保存，不会回填或显示完整 API Key。')).toBeVisible()
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '删除凭据' }).click()
    await expect(page.getByText('安全存储删除失败，请重试。')).toBeVisible()
    await expect(page.getByText('已安全保存，不会回填或显示完整 API Key。')).toBeVisible()
  })
})
