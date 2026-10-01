import { expect, test, type Page } from '@playwright/test'

interface OutlineRuntimeWindow {
  electronAPI: Record<string, unknown>
  __outlineCalls: Array<{ channel: string; input: Record<string, unknown> }>
  __finishOutline: () => void
  __outlineSnapshot: () => Record<string, unknown>
}

async function injectOutlineMock(page: Page, recovery = false): Promise<void> {
  await page.addInitScript((withRecovery) => {
    type Entity = Record<string, unknown>
    const runtime = window as unknown as OutlineRuntimeWindow
    const now = new Date().toISOString()
    const project = { id: 'project-outline', slug: 'outline-test', name: '卷大纲测试', description: '', status: 'active', version: 1, created_at: now, updated_at: now }
    let volume: Entity = { id: 'volume-1', project_id: project.id, title: '第一卷', synopsis: '原卷简介', volume_number: 1, sort_order: 0, status: 'draft', metadata: {}, version: 1, created_at: now, updated_at: now }
    let outline: Entity = { id: 'outline-1', project_id: project.id, volume_id: 'volume-1', summary: '原卷简介', theme: '原主题', main_conflict: '原冲突', ending: '原结尾', status: 'draft', outline: {}, metadata: {}, source_material_ids: [], version: 1, created_at: now, updated_at: now }
    let config: Entity = { project_id: project.id, default_llm_config_id: null, genre: '', tone: '', target_words: null, context_budget: 32000, settings: { llmProvider: 'openai-compatible', llmBaseUrl: 'https://example.invalid/v1', llmModel: 'outline-test-model', llmMaxOutputTokens: 2048, llmTemperature: 0.2, llmCredentialId: 'project:project-outline' }, version: 1, created_at: now, updated_at: now }
    const session = { id: 'outline-session', project_id: project.id, title: '大纲生成', session_type: 'writer', status: 'active', agent_config: {}, created_at: now, updated_at: now }
    const calls: OutlineRuntimeWindow['__outlineCalls'] = []
    const listeners: Record<string, Array<(event: unknown) => void>> = {}
    const subscribe = (kind: string) => (listener: (event: unknown) => void) => {
      listeners[kind] = [...(listeners[kind] ?? []), listener]
      return () => { listeners[kind] = listeners[kind].filter((item) => item !== listener) }
    }
    const emit = (kind: string, event: unknown) => listeners[kind]?.forEach((listener) => listener(event))
    const success = (data: unknown) => ({ success: true, data })
    const emptyList = async () => success([])
    const track = (channel: string, input: Entity = {}) => calls.push({ channel, input })
    const makeTask = (id: string, classification: string, auto: boolean, manual: boolean): Entity => ({
      id, project_id: project.id, chapter_id: null, parent_task_id: null, task_type: 'outline-generation', status: 'failed', stage: 'outline', progress: 0.5,
      input: { request: { project_id: project.id, outline_id: outline.id, debug: false } }, checkpoint: null, result: null, error_message: null, cancel_requested: false,
      started_at: now, finished_at: now, created_at: now, updated_at: now, execution_phase: 'failed', recovery_classification: classification,
      recovery_reason: classification === 'non-recoverable' ? '上下文来源改变或 metadata 损坏，请新建任务。' : '按当前项目模型配置处理。', recovery_action: 'none',
      recovery_attempt_count: 0, max_recovery_attempts: 3, auto_allowed: auto, manual_retry_allowed: manual,
    })
    let tasks: Entity[] = withRecovery ? [
      makeTask('outline-safe', 'resumable', true, true),
      { ...makeTask('outline-manual', 'manual-retry-required', false, true), status: 'running', finished_at: null },
      makeTask('outline-invalid', 'non-recoverable', false, false),
    ] : []
    const compile = (debug: boolean) => ({
      prompt_version: 'context-compiler/v1', model_params: { model: 'outline-test-model', temperature: 0.2, max_output_tokens: 2048, context_budget: 32000 },
      trace: {
        selected: [{ id: 'project:project-outline', source: 'project', title: '项目设置', estimated_tokens: 22, reason: { code: 'required_by_strategy', message: '大纲策略必选' } }],
        discarded: [{ id: 'source_material:unused', source: 'source_material', title: '未选素材', estimated_tokens: 14, reason: { code: 'budget_exceeded', message: '预算裁剪' } }],
        budget: { total_budget: 32000, selected_tokens: 22, max_output_reserved: 2048, system_reserved: 100, available_for_prompt: 29852, remaining_tokens: 29830 },
        ...(debug ? { final_prompt: '仅本机显式 Debug 的大纲提示' } : {}),
      },
    })
    const retry = (id: string, channel: string, input: Entity) => {
      track(channel, input)
      tasks = tasks.map((task) => task.id === id ? { ...task, status: 'running' } : task)
      emit('start', { type: 'task:start', task: tasks.find((task) => task.id === id) })
      return success({ taskId: id })
    }
    runtime.electronAPI = {
      getDatabaseStatus: async () => success({ state: 'ready', integrity: 'ok', schemaVersion: 9, backupAllowed: true, backupEligibility: 'safe', message: null }),
      onDatabaseStatusChanged: () => () => undefined,
      getCrushes: emptyList,
      listNovelProjects: async () => success([project]),
      getCurrentNovelProject: async () => success(project),
      getNovelProjectConfig: async () => success(config),
      updateNovelProjectConfig: async (params: Entity) => {
        track('config:update', params)
        config = { ...config, ...(params.input as Entity), version: Number(config.version) + 1 }
        return success(config)
      },
      listNovelVolumes: async () => success([volume]),
      listNovelVolumeOutlines: async () => success([outline]),
      updateNovelVolume: async (params: Entity) => {
        volume = { ...volume, ...(params.input as Entity), version: Number(volume.version) + 1 }
        return success(volume)
      },
      updateNovelVolumeOutline: async (params: Entity) => {
        outline = { ...outline, ...(params.input as Entity), version: Number(outline.version) + 1 }
        return success(outline)
      },
      confirmNovelVolumeOutline: async () => { track('outline:confirm'); return success(outline) },
      lockNovelVolumeOutline: async () => { track('outline:lock'); return success(outline) },
      listNovelChapterOutlines: emptyList,
      listNovelCharacters: emptyList,
      listNovelWorldviewEntries: emptyList,
      listNovelOrganizations: emptyList,
      listNovelRelations: emptyList,
      listSourceMaterials: emptyList,
      getLlmCredentialStatus: async () => success({ configured: true, storageAvailable: true, backend: 'test', error: null }),
      listTasks: async () => success(tasks),
      listRecoverableTasks: async () => success(tasks.filter((task) => task.status === 'failed'
        || task.id === 'outline-manual' && task.status === 'running' && task.execution_phase === 'failed')),
      listAssistantSessions: async () => success([session]),
      getAssistantSession: async () => success({ session, messages: [] }),
      createAssistantSession: async () => success({ session, messages: [] }),
      onAssistantEvent: () => () => undefined,
      onTaskStart: subscribe('start'), onTaskStage: subscribe('stage'), onTaskChunk: subscribe('chunk'),
      onTaskCheckpoint: subscribe('checkpoint'), onTaskReview: subscribe('review'), onTaskEnd: subscribe('end'), onTaskError: subscribe('error'),
      startTask: async (params: Entity) => {
        track('task:run', params)
        const request = params.input as Entity
        const task = { ...makeTask('outline-generated', 'manual-retry-required', false, true), status: 'running', input: { request }, checkpoint: { stage_compiles: { outline: compile(request.debug === true) } } }
        tasks = [task, ...tasks]
        emit('start', { type: 'task:start', task })
        emit('stage', { type: 'task:stage', taskId: task.id, stage: 'outline', progress: 0.5 })
        emit('chunk', { type: 'task:chunk', taskId: task.id, stage: 'outline', chunk: '大纲流式片段' })
        return success({ taskId: task.id })
      },
      cancelTask: async (taskId: string) => {
        track('task:cancel', { taskId })
        tasks = tasks.map((task) => task.id === taskId ? { ...task, status: 'cancelled' } : task)
        emit('end', { type: 'task:end', taskId, status: 'cancelled' })
        return { success: true }
      },
      resumeTask: async (taskId: string) => retry(taskId, 'task:resume', { taskId }),
      manualRetryTask: async (taskId: string, confirmed: boolean) => retry(taskId, 'task:manual-retry', { taskId, confirmed }),
    }
    runtime.__outlineCalls = calls
    runtime.__outlineSnapshot = () => outline
    runtime.__finishOutline = () => {
      const task = tasks.find((item) => item.id === 'outline-generated')
      if (!task) return
      outline = { ...outline, summary: '生成的卷简介', theme: '生成的主题', version: Number(outline.version) + 1 }
      tasks = tasks.map((item) => item.id === task.id ? { ...item, status: 'completed', progress: 1, result: task.checkpoint } : item)
      emit('end', { type: 'task:end', taskId: task.id, status: 'completed' })
    }
  }, recovery)
  await page.goto('/#/workbench/outline')
  await expect(page.getByTestId('outline-generation-panel')).toBeVisible()
}

async function callsFor(page: Page, channel: string) {
  return page.evaluate((kind) => (window as unknown as OutlineRuntimeWindow).__outlineCalls.filter((call) => call.channel === kind), channel)
}

test('卷大纲使用当前项目模型并共享来源面板，生成后保持草稿', async ({ page }) => {
  await injectOutlineMock(page)
  await expect(page.getByLabel('大纲模型')).toHaveValue('outline-test-model')
  await page.getByLabel('大纲模型').fill('saved-outline-model')
  await expect(page.getByTestId('start-outline-generation')).toBeDisabled()
  await page.getByRole('button', { name: '保存模型参数', exact: true }).click()
  await expect(page.getByTestId('start-outline-generation')).toBeEnabled()
  await page.getByTestId('start-outline-generation').click()
  await expect(page.getByTestId('outline-task-progress')).toContainText('大纲流式片段')
  const calls = await callsFor(page, 'task:run')
  expect(calls).toHaveLength(1)
  expect(calls[0].input).toMatchObject({ taskType: 'outline-generation', projectId: 'project-outline', sessionId: 'outline-session', prompt: '生成卷大纲草稿', input: { project_id: 'project-outline', outline_id: 'outline-1', debug: false }, llm: { model: 'saved-outline-model', contextBudget: 32000, maxOutputTokens: 2048, temperature: 0.2 } })
  expect(calls[0].input.llm).not.toHaveProperty('credentialId')
  expect(calls[0].input.llm).not.toHaveProperty('apiKey')
  await expect(page.getByTestId('context-stage-outline')).toBeVisible()
  await expect(page.getByTestId('context-selected-table')).toContainText('project-outline')
  await expect(page.getByTestId('context-discarded-table')).toContainText('budget_exceeded')
  await expect(page.getByTestId('context-budget-summary')).toContainText('32000')
  await expect(page.getByTestId('context-final-prompt')).toHaveCount(0)
  await page.evaluate(() => (window as unknown as OutlineRuntimeWindow).__finishOutline())
  await expect(page.getByTestId('volume-outline-summary')).toHaveValue('生成的卷简介')
  expect(await page.evaluate(() => (window as unknown as OutlineRuntimeWindow).__outlineSnapshot().status)).toBe('draft')
  expect(await callsFor(page, 'outline:confirm')).toHaveLength(0)
  expect(await callsFor(page, 'outline:lock')).toHaveLength(0)
})

test('大纲 Debug 默认关闭，显式开启生成后可查看和隐藏最终提示', async ({ page }) => {
  await injectOutlineMock(page)
  const debug = page.getByRole('checkbox', { name: 'Debug' })
  await expect(debug).not.toBeChecked()
  await debug.locator('..').click()
  await page.getByTestId('start-outline-generation').click()
  expect((await callsFor(page, 'task:run'))[0].input.input).toMatchObject({ debug: true })
  await expect(page.getByTestId('context-final-prompt')).toContainText('仅本机显式 Debug 的大纲提示')
  await debug.locator('..').click()
  await expect(page.getByTestId('context-final-prompt')).toHaveCount(0)
})

test('未保存大纲禁用生成，顺序保存与完成刷新不覆盖本地编辑', async ({ page }) => {
  await injectOutlineMock(page)
  await page.getByTestId('volume-outline-summary').fill('保存的新简介')
  await page.getByTestId('volume-outline-theme').fill('保存的新主题')
  await expect(page.getByTestId('start-outline-generation')).toBeDisabled()
  expect(await callsFor(page, 'task:run')).toHaveLength(0)
  await page.getByRole('button', { name: '保存卷大纲', exact: true }).click()
  await expect(page.getByTestId('volume-outline-theme')).toHaveValue('保存的新主题')
  await expect(page.getByTestId('start-outline-generation')).toBeEnabled()
  await page.getByTestId('start-outline-generation').click()
  await page.getByTestId('volume-outline-theme').fill('正在编辑的本地主题')
  await page.evaluate(() => (window as unknown as OutlineRuntimeWindow).__finishOutline())
  await expect(page.getByTestId('outline-task-progress')).toContainText('completed')
  await expect(page.getByTestId('volume-outline-theme')).toHaveValue('正在编辑的本地主题')
  await expect(page.getByTestId('volume-outline-summary')).toHaveValue('保存的新简介')
  await expect(page.getByTestId('start-outline-generation')).toBeDisabled()
})

test('保存卷大纲引起配置刷新时保留未保存的模型参数', async ({ page }) => {
  await injectOutlineMock(page)
  await page.getByLabel('大纲模型').fill('unsaved-local-model')
  await page.getByLabel('温度', { exact: true }).fill('0.4')
  await page.getByTestId('volume-outline-theme').fill('卷大纲新主题')
  await page.getByRole('button', { name: '保存卷大纲', exact: true }).click()
  await expect(page.getByTestId('volume-outline-theme')).toHaveValue('卷大纲新主题')
  await expect(page.getByLabel('大纲模型')).toHaveValue('unsaved-local-model')
  await expect(page.getByLabel('温度', { exact: true })).toHaveValue('0.4')
  await expect(page.getByTestId('start-outline-generation')).toBeDisabled()
  await expect(page.getByRole('button', { name: '保存模型参数', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '保存模型参数', exact: true }).click()
  await expect(page.getByTestId('start-outline-generation')).toBeEnabled()
  await page.getByTestId('start-outline-generation').click()
  expect((await callsFor(page, 'task:run'))[0].input.llm).toMatchObject({ model: 'unsaved-local-model', temperature: 0.4 })
})

test('大纲任务支持取消，取消后不自动确认', async ({ page }) => {
  await injectOutlineMock(page)
  await page.getByTestId('start-outline-generation').click()
  await expect(page.getByTestId('cancel-outline-generation')).toBeEnabled()
  await page.getByTestId('cancel-outline-generation').click()
  expect(await callsFor(page, 'task:cancel')).toEqual([{ channel: 'task:cancel', input: { taskId: 'outline-generated' } }])
  await expect(page.getByTestId('outline-task-progress')).toContainText('cancelled')
  expect(await callsFor(page, 'outline:confirm')).toHaveLength(0)
})

test('大纲恢复按分类与确认授权执行，损坏来源没有恢复按钮', async ({ page }) => {
  await injectOutlineMock(page, true)
  await expect(page.getByTestId('outline-resume-outline-safe')).toBeVisible()
  await expect(page.getByTestId('outline-retry-outline-manual')).toBeVisible()
  await expect(page.getByTestId('outline-task-recovery')).toContainText('上下文来源改变或 metadata 损坏')
  await expect(page.getByTestId('outline-resume-outline-invalid')).toHaveCount(0)
  await page.getByTestId('volume-outline-theme').fill('未保存内容')
  await expect(page.getByTestId('outline-resume-outline-safe')).toBeDisabled()
  await expect(page.getByTestId('outline-retry-outline-manual')).toBeDisabled()
  await page.getByRole('button', { name: '保存卷大纲', exact: true }).click()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByTestId('outline-retry-outline-manual').click()
  expect(await callsFor(page, 'task:manual-retry')).toHaveLength(0)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByTestId('outline-retry-outline-manual').click()
  expect(await callsFor(page, 'task:manual-retry')).toEqual([{ channel: 'task:manual-retry', input: { taskId: 'outline-manual', confirmed: true } }])
})

test('安全大纲恢复使用已有 task:resume 接口', async ({ page }) => {
  await injectOutlineMock(page, true)
  await page.getByTestId('outline-resume-outline-safe').click()
  expect(await callsFor(page, 'task:resume')).toEqual([{ channel: 'task:resume', input: { taskId: 'outline-safe' } }])
})
