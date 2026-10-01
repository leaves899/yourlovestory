import { expect, test } from '@playwright/test'

interface RuntimeWindow {
  electronAPI: Record<string, unknown>
  __manualRetryCalls?: number
  __resumeCalls?: number
  confirm?: (message?: string) => boolean
}

async function injectRecoveryMock(
  page: import('@playwright/test').Page,
  options: { confirmResult: boolean },
): Promise<void> {
  await page.addInitScript((confirmResult) => {
    const runtime = window as unknown as RuntimeWindow
    runtime.__manualRetryCalls = 0
    runtime.__resumeCalls = 0
    runtime.confirm = () => confirmResult

    const now = new Date().toISOString()
    const project = {
      id: 'project-1',
      slug: 'recovery-project',
      name: '恢复测试项目',
      description: '',
      status: 'active',
      version: 1,
      created_at: now,
      updated_at: now,
    }
    const session = {
      id: 'session-1',
      project_id: project.id,
      title: '创作助手',
      session_type: 'assistant',
      status: 'active',
      agent_config: {},
      created_at: now,
      updated_at: now,
    }
    const chapter = {
      id: 'chapter-outline-1',
      project_id: project.id,
      volume_id: 'volume-1',
      chapter_number: 1,
      sort_order: 0,
      title: '第一章',
      summary: 'summary',
      purpose: '',
      opening: '',
      conflict: '',
      key_events: [],
      ending: '',
      ending_hook: '',
      status: 'locked',
      outline: {},
      source_material_ids: [],
      metadata: {},
      version: 1,
      created_at: now,
      updated_at: now,
    }

    const recoverable = [
      {
        id: 'task-resumable',
        project_id: project.id,
        chapter_id: null,
        parent_task_id: null,
        recovery_root_task_id: 'task-resumable',
        task_type: 'chapter-generation',
        status: 'running',
        stage: 'review',
        progress: 0.9,
        execution_phase: 'finalizing',
        recovery_classification: 'resumable',
        recovery_reason: '章节版本已按 task_id 持久化',
        recovery_action: 'auto-resume',
        recovery_attempt_count: 0,
        max_recovery_attempts: 3,
        last_recovery_attempt_at: null,
        last_recovery_error: null,
        idempotency_key: null,
        checkpoint_schema_version: 1,
        lease_owner: null,
        lease_expires_at: null,
        timeout_at: null,
        shutdown_kind: 'crash',
        cancel_requested: false,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
        updated_at: now,
        auto_allowed: true,
        manual_retry_allowed: true,
      },
      {
        id: 'task-restartable',
        project_id: project.id,
        chapter_id: null,
        parent_task_id: null,
        recovery_root_task_id: 'task-restartable',
        task_type: 'chapter-generation',
        status: 'failed',
        stage: '',
        progress: 0,
        execution_phase: 'queued',
        recovery_classification: 'restartable',
        recovery_reason: '模型调用尚未开始',
        recovery_action: 'auto-restart',
        recovery_attempt_count: 0,
        max_recovery_attempts: 3,
        last_recovery_attempt_at: null,
        last_recovery_error: null,
        idempotency_key: null,
        checkpoint_schema_version: 1,
        lease_owner: null,
        lease_expires_at: null,
        timeout_at: null,
        shutdown_kind: 'crash',
        cancel_requested: false,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
        updated_at: now,
        auto_allowed: true,
        manual_retry_allowed: true,
      },
      {
        id: 'task-manual',
        project_id: project.id,
        chapter_id: null,
        parent_task_id: null,
        recovery_root_task_id: 'task-manual',
        task_type: 'chapter-generation',
        status: 'failed',
        stage: 'body',
        progress: 0.3,
        execution_phase: 'model_in_flight',
        recovery_classification: 'manual-retry-required',
        recovery_reason: '模型请求处于不确定窗口',
        recovery_action: 'manual-confirm',
        recovery_attempt_count: 1,
        max_recovery_attempts: 3,
        last_recovery_attempt_at: null,
        last_recovery_error: null,
        idempotency_key: null,
        checkpoint_schema_version: 1,
        lease_owner: null,
        lease_expires_at: null,
        timeout_at: null,
        shutdown_kind: 'crash',
        cancel_requested: false,
        error_message: null,
        started_at: now,
        finished_at: null,
        created_at: now,
        updated_at: now,
        auto_allowed: false,
        manual_retry_allowed: true,
      },
      {
        id: 'task-nonrec',
        project_id: project.id,
        chapter_id: null,
        parent_task_id: null,
        recovery_root_task_id: 'task-nonrec',
        task_type: 'chapter-generation',
        status: 'failed',
        stage: 'failed',
        progress: 1,
        execution_phase: 'failed',
        recovery_classification: 'non-recoverable',
        recovery_reason: '所属项目已删除，任务不可恢复。',
        recovery_action: 'none',
        recovery_attempt_count: 0,
        max_recovery_attempts: 3,
        last_recovery_attempt_at: null,
        last_recovery_error: null,
        idempotency_key: null,
        checkpoint_schema_version: 1,
        lease_owner: null,
        lease_expires_at: null,
        timeout_at: null,
        shutdown_kind: 'crash',
        cancel_requested: false,
        error_message: null,
        started_at: now,
        finished_at: now,
        created_at: now,
        updated_at: now,
        auto_allowed: false,
        manual_retry_allowed: false,
      },
    ]

    const success = (data: unknown) => ({ success: true, data })
    const emptyList = async () => success([])
    const unsubscribe = () => undefined

    runtime.electronAPI = {
      getDatabaseStatus: async () => success({
        state: 'ready',
        integrity: 'ok',
        schemaVersion: 9,
        message: null,
        lastBackupAt: null,
        backupAllowed: true,
        backupEligibility: 'safe',
        backupBlockedReason: null,
      }),
      onDatabaseStatusChanged: () => () => undefined,
      getCrushes: async () => success([]),
      listNovelProjects: async () => success([project]),
      getCurrentNovelProject: async () => success(project),
      selectNovelProject: async () => success(project),
      getNovelProjectConfig: async () => success({
        project_id: project.id,
        default_llm_config_id: null,
        genre: '',
        tone: '',
        target_words: null,
        context_budget: null,
        settings: {},
        version: 1,
        created_at: now,
        updated_at: now,
      }),
      getLlmCredentialStatus: async () => success({
        configured: true,
        storageAvailable: true,
        backend: 'test',
        error: null,
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
      listRecoverableTasks: async () => success(recoverable),
      listAssistantSessions: async () => success([session]),
      getAssistantSession: async () => success({ session, messages: [] }),
      createAssistantSession: async () => success({ session, messages: [] }),
      onAssistantEvent: () => unsubscribe,
      startChapterGeneration: async () => success({ taskId: 'task-new' }),
      startChapterPolish: async () => success({ taskId: 'task-polish' }),
      listChapterVersions: emptyList,
      confirmChapterVersion: async () => success({}),
      rejectChapterVersion: async () => success({}),
      cancelTask: async () => ({ success: true }),
      resumeTask: async () => {
        runtime.__resumeCalls = (runtime.__resumeCalls ?? 0) + 1
        return success({ taskId: 'task-resumable' })
      },
      manualRetryTask: async () => {
        runtime.__manualRetryCalls = (runtime.__manualRetryCalls ?? 0) + 1
        return success({ taskId: 'task-manual' })
      },
      listNarrativeMemories: emptyList,
      listNarrativeMemoryProposals: emptyList,
      listForeshadows: emptyList,
      listNarrativeSkills: emptyList,
    }
  }, options.confirmResult)
}

test.describe('任务崩溃恢复 UI', () => {
  test('展示四分类且仅正确按钮可用；取消确认不调用 IPC', async ({ page }) => {
    await injectRecoveryMock(page, { confirmResult: false })
    await page.goto('/#/workbench/write')

    await expect(page.getByTestId('recovery-task-task-resumable')).toBeVisible()
    await expect(page.getByTestId('recovery-task-task-restartable')).toBeVisible()
    await expect(page.getByTestId('recovery-task-task-manual')).toBeVisible()
    await expect(page.getByTestId('recovery-task-task-nonrec')).toBeVisible()

    await expect(page.getByTestId('auto-resume-task-resumable')).toBeVisible()
    await expect(page.getByTestId('auto-resume-task-restartable')).toBeVisible()
    await expect(page.getByTestId('manual-retry-task-manual')).toBeVisible()

    await expect(page.getByTestId('manual-retry-task-resumable')).toHaveCount(0)
    await expect(page.getByTestId('auto-resume-task-manual')).toHaveCount(0)
    await expect(page.getByTestId('auto-resume-task-nonrec')).toHaveCount(0)
    await expect(page.getByTestId('manual-retry-task-nonrec')).toHaveCount(0)

    await page.getByTestId('manual-retry-task-manual').click()
    const manualCalls = await page.evaluate(() => (window as unknown as RuntimeWindow).__manualRetryCalls ?? 0)
    expect(manualCalls).toBe(0)
  })

  test('确认人工重试后才调用 manualRetry IPC', async ({ page }) => {
    await injectRecoveryMock(page, { confirmResult: true })
    await page.goto('/#/workbench/write')
    await expect(page.getByTestId('manual-retry-task-manual')).toBeVisible()
    await page.getByTestId('manual-retry-task-manual').click()
    await expect.poll(async () => page.evaluate(
      () => (window as unknown as RuntimeWindow).__manualRetryCalls ?? 0,
    )).toBe(1)
  })
})
