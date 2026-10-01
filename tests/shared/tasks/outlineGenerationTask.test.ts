import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import type { AgentFactory, AgentRunResult, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import { initializeDatabase, TaskRepository, type SqliteDatabase } from '@/main/database'
import {
  createOutlineGenerationTaskRunner, TaskManager, type TaskEvent, type TaskManagerOptions,
} from '@/main/tasks'
import { assertNoSensitiveTaskInput } from '@/main/tasks/sensitiveInput'
import { WorkbenchService } from '@/main/workbench'
import { parseOutlineCheckpoint, type OutlineCheckpoint } from '@/shared/outlineGeneration'
import type { JsonObject } from '@/shared/novelProject'

const llm = {
  baseUrl: 'https://example.invalid/v1', model: 'test-model',
  contextBudget: 48_000, maxOutputTokens: 1_000, temperature: 0.4,
}
const proposal = {
  summary: '生成的卷纲', theme: '信任', main_conflict: '误会与共同目标',
  key_turning_points: ['发现线索', '解决误会'], ending: '共同做出选择',
}

function response(text = JSON.stringify(proposal), aborted = false): AgentRunResult {
  return {
    text, finishReason: aborted ? 'aborted' : 'stop', usage: emptyTokenUsage(),
    assistantMessage: {
      role: 'assistant', content: [{ type: 'text', text }], api: 'openai-completions',
      provider: 'openai-compatible', model: llm.model, usage: emptyTokenUsage(),
      stopReason: aborted ? 'aborted' : 'stop', timestamp: Date.now(),
    },
  }
}

function agentFactory(prompt: ProjectSessionAgent['prompt']) {
  const dispose = jest.fn()
  const create = jest.fn(async (input: Parameters<AgentFactory['create']>[0]) => ({
    projectId: input.projectId, sessionId: input.sessionId, prompt, abort: jest.fn(), dispose,
  }))
  return { factory: { create } satisfies AgentFactory, create, dispose }
}

function blockingAgent() {
  let release: (result: AgentRunResult) => void = () => undefined
  let began: () => void = () => undefined
  const started = new Promise<void>((resolve) => { began = resolve })
  const prompt = jest.fn(async (_text: string, options: Parameters<ProjectSessionAgent['prompt']>[1] = {}) => {
    began()
    return new Promise<AgentRunResult>((resolve) => {
      release = resolve
      options?.signal?.addEventListener('abort', () => resolve(response('', true)), { once: true })
    })
  })
  return { ...agentFactory(prompt), prompt, started, release: () => release(response()) }
}

describe('outline generation task pipeline with real SQLite', () => {
  let root: string
  let database: SqliteDatabase
  let workbench: WorkbenchService
  let store: TaskRepository
  let projectId: string
  let outlineId: string
  let managers: TaskManager[]

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-outline-task-'))
    database = initializeDatabase(root)
    workbench = new WorkbenchService(database)
    store = new TaskRepository(database)
    const project = workbench.createProject({ slug: 'outline-pipeline', name: '卷纲任务项目' })
    const volume = workbench.createVolume({ project_id: project.id, volume_number: 1, title: '第一卷' })
    const outline = workbench.createVolumeOutline({
      project_id: project.id, volume_id: volume.id, summary: '用户的原卷纲',
    })
    projectId = project.id
    outlineId = outline.id
    managers = []
  })

  afterEach(() => {
    managers.forEach((manager) => manager.dispose())
    database.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  function manager(factory: AgentFactory, overrides: Partial<TaskManagerOptions> = {}) {
    const instance = new TaskManager({
      store, agentFactory: factory, events: { publish: () => undefined },
      runners: { 'outline-generation': createOutlineGenerationTaskRunner({
        service: workbench.outlineGeneration, agentFactory: factory,
      }) },
      ...overrides,
    })
    managers.push(instance)
    return instance
  }

  function start(instance: TaskManager, debug?: boolean) {
    return instance.startOutlineGeneration({ projectId, outlineId, sessionId: 'outline-session', llm, debug })
  }

  function readyCheckpoint(debug = false): OutlineCheckpoint {
    const prepared = workbench.outlineGeneration.prepare({
      projectId, outlineId, debug, modelParams: {
        model: llm.model, temperature: llm.temperature,
        max_output_tokens: llm.maxOutputTokens, context_budget: llm.contextBudget,
      },
    }, null)
    const { applied_version: appliedVersion, ...checkpoint } = prepared.checkpoint
    void appliedVersion
    return { ...checkpoint, stage: 'ready', proposal }
  }

  function crashed(checkpoint: JsonObject) {
    const task = store.create({
      project_id: projectId, task_type: 'outline-generation', checkpoint_schema_version: 1,
      idempotency_key: `outline-generation:${projectId}:${outlineId}`,
      input: { sessionId: 'outline-session', taskType: 'outline-generation', prompt: '', llm,
        request: { project_id: projectId, outline_id: outlineId, debug: false } },
    })
    store.update(task.id, { status: 'running', execution_phase: 'persisting_result', checkpoint })
    return task.id
  }

  function credentialless(factory: AgentFactory) {
    const resolve = jest.fn(() => { throw new Error('凭据不可用，禁止请求模型') })
    return { instance: manager(factory, {
      resolveLlmConfig: resolve,
      recoveryLookups: {
        projectExists: () => true, targetExists: () => true,
        hasChapterVersionForTask: () => false, hasChapterRevisionForTask: () => false,
        credentialAvailable: () => false,
      },
    }), resolve }
  }

  test.each([undefined, false, true])('persists compiler provenance and keeps drafts for review (debug=%s)', async (debug) => {
    const prompt = jest.fn(async (_text: string) => response())
    const agent = agentFactory(prompt)
    const events: TaskEvent[] = []
    const instance = manager(agent.factory, { events: { publish: (event) => events.push(event) } })
    const task = await start(instance, debug).completion
    expect(task.status).toBe('completed')
    const updated = workbench.getVolumeOutline(projectId, outlineId)
    expect(updated).toEqual(expect.objectContaining({ ...proposal, status: 'draft', version: 2 }))
    expect(updated.metadata.generated_outline_task_id).toBe(task.id)
    const checkpoint = parseOutlineCheckpoint(task.checkpoint)
    expect(checkpoint).not.toBeNull()
    expect(checkpoint).toEqual(expect.objectContaining({ stage: 'applied', applied_version: updated.version }))
    expect(task.result?.stage_compiles).toEqual(checkpoint?.stage_compiles)
    expect(task.result?.review_required).toBe(true)
    expect(checkpoint?.stage_compiles).toEqual(expect.objectContaining({ outline: expect.objectContaining({
      prompt_version: 'context-compiler/v1',
      model_params: { model: llm.model, temperature: llm.temperature,
        max_output_tokens: llm.maxOutputTokens, context_budget: llm.contextBudget },
      trace: expect.objectContaining({ selected: expect.any(Array), discarded: expect.any(Array) }),
    }) }))
    const compile = checkpoint?.stage_compiles.outline
    const trace = typeof compile === 'object' && compile && !Array.isArray(compile) ? compile.trace : null
    const finalPrompt = typeof trace === 'object' && trace && !Array.isArray(trace) ? trace.final_prompt : undefined
    if (debug === true) expect(finalPrompt).toBe(prompt.mock.calls[0]?.[0])
    else expect(finalPrompt).toBeUndefined()
    expect(task.input.request).toEqual({ project_id: projectId, outline_id: outlineId, debug: debug === true })
    expect(() => assertNoSensitiveTaskInput(task.input)).not.toThrow()
    expect(agent.create).toHaveBeenCalledTimes(1)
    expect(agent.create.mock.calls[0]?.[0].tools).toEqual([])
    expect(agent.dispose).toHaveBeenCalledTimes(1)
    expect(events.some((event) => event.type === 'task:checkpoint')).toBe(true)
  })

  test('generic start persists only the complete non-secret outline request', async () => {
    const agent = agentFactory(jest.fn(async () => response()))
    const instance = manager(agent.factory, {
      resolveLlmConfig: (_id, input) => ({ ...input, credentialId: 'runtime-only-reference' }),
    })
    const task = await instance.start({ projectId, sessionId: 'generic-outline',
      taskType: 'outline-generation', prompt: 'non-persisted caller prompt', llm,
      input: { project_id: projectId, outline_id: outlineId, debug: false, ignored: 'not required' },
    }).completion
    expect(task.status).toBe('completed')
    expect(task.input.request).toEqual({ project_id: projectId, outline_id: outlineId, debug: false })
    expect(task.input.prompt).toBe('')
    expect(JSON.stringify(task.input)).not.toContain('runtime-only-reference')
    expect(JSON.stringify(task.input)).not.toContain('ignored')
    expect(task.idempotency_key).toBe(`outline-generation:${projectId}:${outlineId}`)
  })

  test('rejects a duplicate active outline even if the second session differs', async () => {
    const agent = blockingAgent()
    const instance = manager(agent.factory)
    const handle = start(instance)
    await agent.started
    expect(() => instance.startOutlineGeneration({ projectId, outlineId, sessionId: 'other-session', llm }))
      .toThrow()
    expect(store.listByProject(projectId)).toHaveLength(1)
    instance.cancel(handle.taskId)
    await handle.completion
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
  })

  test('cancel during the model window never writes the proposal or automatically replays', async () => {
    const before = workbench.getVolumeOutline(projectId, outlineId)
    const agent = blockingAgent()
    const instance = manager(agent.factory)
    const handle = start(instance)
    await agent.started
    expect(instance.cancel(handle.taskId)).toBe(true)
    const cancelled = await handle.completion
    expect(cancelled.status).toBe('cancelled')
    expect(workbench.getVolumeOutline(projectId, outlineId)).toEqual(before)
    expect(instance.classify(cancelled).autoAllowed).toBe(false)
    expect(() => instance.resume(handle.taskId)).toThrow()
    expect(agent.prompt).toHaveBeenCalledTimes(1)
  })

  test('cancellation while the Agent is being prepared does not start a model request', async () => {
    let releaseFactory: (agent: ProjectSessionAgent) => void = () => undefined
    let enteredFactory: () => void = () => undefined
    const started = new Promise<void>((resolve) => { enteredFactory = resolve })
    const prompt = jest.fn(async () => response())
    const dispose = jest.fn()
    const factory: AgentFactory = { create: async () => {
      enteredFactory()
      return new Promise<ProjectSessionAgent>((resolve) => { releaseFactory = resolve })
    } }
    const instance = manager(factory)
    const handle = start(instance)
    await started
    instance.cancel(handle.taskId)
    releaseFactory({ projectId, sessionId: 'outline-session', prompt, abort: jest.fn(), dispose })
    const task = await handle.completion
    expect(task.status).toBe('cancelled')
    expect(prompt).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
  })

  test('timeout aborts the model and leaves the original outline intact', async () => {
    const callbacks: Array<() => void> = []
    const agent = blockingAgent()
    const instance = manager(agent.factory, {
      taskTimeoutMs: 1_000,
      setTimeoutFn: ((callback: () => void) => {
        callbacks.push(callback)
        return callbacks.length as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clearTimeoutFn: jest.fn() as unknown as typeof clearTimeout,
    })
    const handle = start(instance)
    await agent.started
    callbacks[0]()
    const failed = await handle.completion
    expect(failed.status).toBe('failed')
    expect(failed.stage).toBe('timeout')
    expect(failed.recovery_classification).toBe('manual-retry-required')
    expect(workbench.getVolumeOutline(projectId, outlineId).summary).toBe('用户的原卷纲')
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
  })

  test('a late model result cannot write after another owner steals the SQLite lease', async () => {
    const agent = blockingAgent()
    const instance = manager(agent.factory)
    const handle = start(instance)
    await agent.started
    store.update(handle.taskId, { lease_owner: 'new-owner', lease_token: 'new-token',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(), stage: 'new-owner-stage' })
    const taskBytes = JSON.stringify(store.getById(handle.taskId))
    agent.release()
    const finished = await handle.completion
    expect(finished.lease_owner).toBe('new-owner')
    expect(JSON.stringify(store.getById(handle.taskId))).toBe(taskBytes)
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
  })

  test('a model result cannot overwrite an outline edit made while the model was running', async () => {
    const agent = blockingAgent()
    const instance = manager(agent.factory)
    const handle = start(instance)
    await agent.started
    const current = workbench.getVolumeOutline(projectId, outlineId)
    const edited = workbench.updateVolumeOutline(projectId, outlineId, { summary: '生成期间用户的新卷纲' }, current.version)
    agent.release()
    const failed = await handle.completion
    expect(failed.status).toBe('failed')
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId)).toEqual(edited)
  })

  test('ready crash recovery applies once without resolving credentials or calling a model', async () => {
    const taskId = crashed(readyCheckpoint())
    const agent = agentFactory(jest.fn(async () => response()))
    const { instance, resolve } = credentialless(agent.factory)
    const handle = instance.resume(taskId)
    expect(handle).not.toBeNull()
    const task = await handle!.completion
    expect(task.status).toBe('completed')
    expect(task.checkpoint?.stage).toBe('applied')
    expect(task.result?.outline_version).toBe(2)
    expect(workbench.getVolumeOutline(projectId, outlineId).summary).toBe(proposal.summary)
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(2)
    expect(instance.resume(taskId)).toBeNull()
    expect(agent.create).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  test('applied crash recovery preserves trace and does not apply the outline twice', async () => {
    const agent = agentFactory(jest.fn(async () => response()))
    const completed = await start(manager(agent.factory)).completion
    const original = workbench.getVolumeOutline(projectId, outlineId)
    store.update(completed.id, { status: 'running', execution_phase: 'persisting_result', result: null,
      finished_at: null, timeout_at: '2000-01-01T00:00:00.000Z' })
    const recoveredAgent = agentFactory(jest.fn(async () => response()))
    const { instance, resolve } = credentialless(recoveredAgent.factory)
    const handle = instance.resume(completed.id)
    expect(handle).not.toBeNull()
    const recovered = await handle!.completion
    expect(recovered.error_message).toBeNull()
    expect(recovered.status).toBe('completed')
    expect(recovered.checkpoint).toEqual(completed.checkpoint)
    expect(recovered.result?.stage_compiles).toEqual(completed.result?.stage_compiles)
    expect(workbench.getVolumeOutline(projectId, outlineId)).toEqual(original)
    expect(recoveredAgent.create).not.toHaveBeenCalled()
    expect(resolve).not.toHaveBeenCalled()
  })

  test('outline write and applied checkpoint roll back together when checkpoint persistence fails', async () => {
    const taskId = crashed(readyCheckpoint())
    database.exec(`CREATE TRIGGER reject_applied_outline BEFORE UPDATE OF checkpoint_json ON tasks
      WHEN NEW.id = '${taskId}' AND json_extract(NEW.checkpoint_json, '$.stage') = 'applied'
      BEGIN SELECT RAISE(ABORT, 'injected applied checkpoint failure'); END;`)
    const agent = agentFactory(jest.fn(async () => response()))
    const { instance } = credentialless(agent.factory)
    const handle = instance.resume(taskId)
    expect(handle).not.toBeNull()
    const failed = await handle!.completion
    expect(failed.status).toBe('failed')
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
    expect(workbench.getVolumeOutline(projectId, outlineId).metadata.generated_outline_task_id).toBeUndefined()
    expect(store.getById(taskId)?.checkpoint?.stage).toBe('ready')
    expect(agent.create).not.toHaveBeenCalled()
  })

  test.each(['outline edit', 'project edit', 'confirmed', 'locked'])('ready recovery fails closed after %s', async (change) => {
    const taskId = crashed(readyCheckpoint())
    const current = workbench.getVolumeOutline(projectId, outlineId)
    if (change === 'outline edit') workbench.updateVolumeOutline(projectId, outlineId, { summary: '后来用户更新' }, current.version)
    if (change === 'project edit') {
      const project = workbench.getProject(projectId)
      workbench.updateProject(projectId, { name: '后来项目更新' }, project.version)
    }
    if (change === 'confirmed') workbench.confirmVolumeOutline(projectId, outlineId, current.version)
    if (change === 'locked') {
      const confirmed = workbench.confirmVolumeOutline(projectId, outlineId, current.version)
      workbench.lockVolumeOutline(projectId, outlineId, confirmed.version)
    }
    const edited = workbench.getVolumeOutline(projectId, outlineId)
    const agent = agentFactory(jest.fn(async () => response()))
    const { instance } = credentialless(agent.factory)
    const handle = instance.resume(taskId)
    expect(handle).not.toBeNull()
    const failed = await handle!.completion
    expect(failed.status).toBe('failed')
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId)).toEqual(edited)
    expect(agent.create).not.toHaveBeenCalled()
  })

  test('applied checkpoint cannot resurrect an old result after later user editing', async () => {
    const agent = agentFactory(jest.fn(async () => response()))
    const completed = await start(manager(agent.factory)).completion
    const current = workbench.getVolumeOutline(projectId, outlineId)
    const edited = workbench.updateVolumeOutline(projectId, outlineId, { ending: '用户自己的新结尾' }, current.version)
    store.update(completed.id, { status: 'running', execution_phase: 'persisting_result', result: null, finished_at: null })
    const { instance } = credentialless(agent.factory)
    const handle = instance.resume(completed.id)
    expect(handle).not.toBeNull()
    expect((await handle!.completion).recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId)).toEqual(edited)
    expect(agent.create).toHaveBeenCalledTimes(1)
  })

  test('ready recovery rejects changed persisted model parameters without a new model call', async () => {
    const taskId = crashed(readyCheckpoint())
    const input = store.getById(taskId)!.input
    database.prepare('UPDATE tasks SET input_json = ? WHERE id = ?').run(
      JSON.stringify({ ...input, llm: { ...llm, temperature: 0.9 } }), taskId,
    )
    const agent = agentFactory(jest.fn(async () => response()))
    const { instance } = credentialless(agent.factory)
    const handle = instance.resume(taskId)
    expect(handle).not.toBeNull()
    const failed = await handle!.completion
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
    expect(agent.create).not.toHaveBeenCalled()
  })

  test.each(['invalid snapshot', 'invalid trace', 'invalid proposal'])('corrupt %s is terminal before any model or write', async (corruption) => {
    const checkpoint: JsonObject = { ...readyCheckpoint() }
    if (corruption === 'invalid snapshot') checkpoint.source_snapshot = '{broken'
    if (corruption === 'invalid trace') checkpoint.stage_compiles = { outline: { prompt_version: 'broken' } }
    if (corruption === 'invalid proposal') checkpoint.proposal = { ...proposal, summary: '' }
    const taskId = crashed(checkpoint)
    const agent = agentFactory(jest.fn(async () => response()))
    const { instance } = credentialless(agent.factory)
    expect(instance.resume(taskId)).toBeNull()
    expect(store.getById(taskId)?.recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
    expect(agent.create).not.toHaveBeenCalled()
  })

  test('explicitly exceeded budget persists failure trace without calling the model', async () => {
    const agent = agentFactory(jest.fn(async () => response()))
    const instance = manager(agent.factory)
    const task = await instance.startOutlineGeneration({ projectId, outlineId, sessionId: 'budget',
      llm: { ...llm, contextBudget: 80, maxOutputTokens: 60 } }).completion
    expect(task.status).toBe('failed')
    expect(task.checkpoint?.stage_compiles).toEqual(expect.objectContaining({ outline: expect.objectContaining({
      trace: expect.objectContaining({ errors: expect.arrayContaining([expect.stringContaining('超过可用预算')]) }),
    }) }))
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
    expect(agent.create).not.toHaveBeenCalled()
  })

  test('outline provenance includes prior-volume prose and excludes completed prose from the current volume', async () => {
    const original = workbench.getVolumeOutline(projectId, outlineId)
    workbench.createChapterOutline({ project_id: projectId, volume_id: original.volume_id,
      chapter_number: 1, title: '前卷章节', summary: '前卷章纲' })
    const prior = workbench.chapters.create({ project_id: projectId, chapter_number: 1,
      title: '前卷章节', content: '前卷已经完成的正文', synopsis: '前卷摘要', status: 'completed' })
    const volume = workbench.createVolume({ project_id: projectId, volume_number: 2, title: '第二卷' })
    const outline = workbench.createVolumeOutline({ project_id: projectId, volume_id: volume.id, summary: '第二卷草稿' })
    outlineId = outline.id
    workbench.createChapterOutline({ project_id: projectId, volume_id: volume.id,
      chapter_number: 2, title: '本卷章节', summary: '本卷章纲' })
    const current = workbench.chapters.create({ project_id: projectId, chapter_number: 2,
      title: '本卷章节', content: '本卷已经完成的正文', synopsis: '本卷摘要', status: 'completed' })
    const agent = agentFactory(jest.fn(async () => response()))
    const task = await start(manager(agent.factory)).completion
    expect(task.status).toBe('completed')
    const saved = parseOutlineCheckpoint(task.checkpoint)
    expect(saved).not.toBeNull()
    const source: { input: { prior_chapters: Array<{ id: string }> } } = JSON.parse(saved!.source_snapshot)
    const ids = source.input.prior_chapters.map((chapter) => chapter.id)
    expect(ids).toContain(prior.id)
    expect(ids).not.toContain(current.id)
  })

  test.each(['non-json model output', JSON.stringify({ ...proposal, ending: '' })])('invalid model proposal does not modify the outline (%s)', async (text) => {
    const agent = agentFactory(jest.fn(async () => response(text)))
    const task = await start(manager(agent.factory)).completion
    expect(task.status).toBe('failed')
    expect(task.recovery_classification).toBe('non-recoverable')
    expect(workbench.getVolumeOutline(projectId, outlineId).version).toBe(1)
    expect(task.error_message).not.toContain(text)
  })
})
