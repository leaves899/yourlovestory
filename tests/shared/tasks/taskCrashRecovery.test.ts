import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { AgentFactory, AgentRunResult, ProjectSessionAgent } from '@/agent/agent'
import { emptyTokenUsage } from '@/agent/llm'
import {
  ChapterRepository,
  ChapterRevisionRepository,
  ChapterVersionRepository,
  initializeDatabase,
  migrations,
  ProjectRepository,
  RecoveryAttemptRepository,
  runMigrations,
  RuntimeSessionRepository,
  TaskRepository,
  type Migration,
  type SqliteDatabase,
} from '@/main/database'
import { shutdownDatabaseResources } from '@/main/database/shutdown'
import {
  createChapterGenerationTaskRunner,
  createChapterPolishTaskRunner,
  TaskManager,
} from '@/main/tasks'
import { assertNoSensitiveTaskInput } from '@/main/tasks/sensitiveInput'
import { WorkbenchService } from '@/main/workbench'
import {
  RECOVERY_METADATA_VERSION,
  TASK_CORRUPTION_REASON,
  TIMEOUT_RECOVERY_REASON,
} from '@/shared/taskRecovery'

function successfulResult(text = 'done'): AgentRunResult {
  return {
    text,
    finishReason: 'stop',
    usage: { ...emptyTokenUsage() },
    assistantMessage: {
      role: 'assistant',
      content: [{ type: 'text', text }],
      api: 'openai-completions',
      provider: 'openai-compatible',
      model: 'test-model',
      usage: { ...emptyTokenUsage() },
      stopReason: 'stop',
      timestamp: Date.now(),
    },
  }
}

function createBlockingAgent(): {
  agentFactory: AgentFactory
  release: (result?: AgentRunResult) => void
  createCount: () => number
  promptCount: () => number
} {
  let resolvePrompt: ((result: AgentRunResult) => void) | null = null
  let creates = 0
  let prompts = 0
  const agentFactory: AgentFactory = {
    create: async (input) => {
      creates += 1
      const agent: ProjectSessionAgent = {
        projectId: input.projectId,
        sessionId: input.sessionId,
        prompt: async (_prompt, options = {}) => {
          prompts += 1
          if (options.signal?.aborted) {
            return { ...successfulResult(), finishReason: 'aborted' }
          }
          return new Promise<AgentRunResult>((resolve) => {
            resolvePrompt = resolve
            options.signal?.addEventListener('abort', () => {
              resolve({ ...successfulResult(), finishReason: 'aborted' })
            }, { once: true })
          })
        },
        abort: jest.fn(),
        dispose: jest.fn(),
      }
      return agent
    },
  }
  return {
    agentFactory,
    release: (result = successfulResult()) => {
      resolvePrompt?.(result)
      resolvePrompt = null
    },
    createCount: () => creates,
    promptCount: () => prompts,
  }
}

describe('task crash recovery fault matrix', () => {
  let tempRoot: string
  let database: SqliteDatabase

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-crash-recovery-'))
    database = initializeDatabase(tempRoot)
  })

  afterEach(() => {
    database.close()
    fs.rmSync(tempRoot, { recursive: true, force: true })
  })

  function createManager(overrides: {
    agentFactory?: AgentFactory
    ownerId?: string
    leaseMs?: number
    leaseRenewMs?: number
    taskTimeoutMs?: number
    startupConcurrency?: number
    now?: () => string
    setTimeoutFn?: typeof setTimeout
    clearTimeoutFn?: typeof clearTimeout
    setIntervalFn?: typeof setInterval
    clearIntervalFn?: typeof clearInterval
    resolveLlmConfig?: (projectId: string, input: { baseUrl: string; model: string; credentialId?: string }) => {
      baseUrl: string
      model: string
      credentialId?: string
    }
    runners?: ConstructorParameters<typeof TaskManager>[0]['runners']
  } = {}): TaskManager {
    const workbench = new WorkbenchService(database)
    const agentFactory = overrides.agentFactory ?? {
      create: async (input) => ({
        projectId: input.projectId,
        sessionId: input.sessionId,
        prompt: async () => successfulResult('生成正文'),
        abort: jest.fn(),
        dispose: jest.fn(),
      }),
    }
    return new TaskManager({
      store: new TaskRepository(database),
      agentFactory,
      events: { publish: () => undefined },
      ownerId: overrides.ownerId ?? 'owner-a',
      runtimeSessions: new RuntimeSessionRepository(database),
      recoveryAttempts: new RecoveryAttemptRepository(database),
      leaseMs: overrides.leaseMs,
      leaseRenewMs: overrides.leaseRenewMs,
      taskTimeoutMs: overrides.taskTimeoutMs,
      startupConcurrency: overrides.startupConcurrency,
      now: overrides.now,
      setTimeoutFn: overrides.setTimeoutFn,
      clearTimeoutFn: overrides.clearTimeoutFn,
      setIntervalFn: overrides.setIntervalFn,
      clearIntervalFn: overrides.clearIntervalFn,
      resolveLlmConfig: overrides.resolveLlmConfig,
      runners: overrides.runners ?? {
        'chapter-generation': createChapterGenerationTaskRunner({
          service: workbench.chapterGeneration,
          agentFactory,
        }),
        'chapter-polish': createChapterPolishTaskRunner({
          service: workbench.narrative,
          agentFactory,
        }),
      },
      recoveryLookups: {
        projectExists: (projectId) => new ProjectRepository(database).getById(projectId) !== null,
        targetExists: () => true,
        hasChapterVersionForTask: (taskId) =>
          new ChapterVersionRepository(database).getByTaskId(taskId) !== null,
        hasChapterRevisionForTask: (taskId) =>
          new ChapterRevisionRepository(database).getByTaskId(taskId) !== null,
        credentialAvailable: () => true,
      },
    })
  }

  function seedProject(slug = 'crash-p'): { projectId: string; outlineId: string; chapterId: string } {
    const workbench = new WorkbenchService(database)
    const project = workbench.createProject({ slug, name: 'Crash Project' })
    const volume = workbench.createVolume({
      project_id: project.id,
      volume_number: 1,
      title: 'V1',
    })
    const volumeOutline = workbench.createVolumeOutline({
      project_id: project.id,
      volume_id: volume.id,
      summary: 'Volume summary',
    })
    const outline = workbench.createChapterOutline({
      project_id: project.id,
      volume_id: volume.id,
      chapter_number: 1,
      title: 'C1',
      summary: 'Chapter summary',
      key_events: ['Event'],
    })
    workbench.confirmVolumeOutline(project.id, volumeOutline.id, volumeOutline.version)
    workbench.confirmChapterOutline(project.id, outline.id, outline.version)
    const chapter = workbench.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      title: 'C1',
      content: 'Original text for polish.',
    })
    return { projectId: project.id, outlineId: outline.id, chapterId: chapter.id }
  }

  test('P1-3 migration 9 normalizes duplicate v8 reports and rolls back on failure', () => {
    database.close()
    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yourcrush-mig9-'))
    const legacy = initializeDatabase(legacyRoot, {
      migrations: migrations.filter((migration) => migration.version < 9),
    })
    const project = new ProjectRepository(legacy).create({ slug: 'mig', name: 'Mig' })
    // Insert a v8 task row without recovery columns.
    legacy.prepare(
      `INSERT INTO tasks (
        id, project_id, chapter_id, parent_task_id, task_type, status, stage, progress,
        input_json, checkpoint_json, created_at, updated_at
      ) VALUES (?, ?, NULL, NULL, 'chapter-polish', 'completed', '', 1, '{}', NULL, ?, ?)`,
    ).run('task-v8-dup', project.id, '2020-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z')
    // v8 allowed multiple reports for the same non-null task_id
    legacy.prepare(
      `INSERT INTO postprocess_reports (
        id, project_id, chapter_id, task_id, report_type, status, summary, details_json, created_at
      ) VALUES (?, ?, NULL, ?, 'chapter-polish', 'completed', 'old', '{}', ?)`,
    ).run('report-old', project.id, 'task-v8-dup', '2020-01-01T00:00:00.000Z')
    legacy.prepare(
      `INSERT INTO postprocess_reports (
        id, project_id, chapter_id, task_id, report_type, status, summary, details_json, created_at
      ) VALUES (?, ?, NULL, ?, 'chapter-polish', 'completed', 'new', '{}', ?)`,
    ).run('report-new', project.id, 'task-v8-dup', '2020-01-02T00:00:00.000Z')

    runMigrations(legacy)
    const linked = legacy
      .prepare<{ id: string; task_id: string | null }>('SELECT id, task_id FROM postprocess_reports ORDER BY id')
      .all()
    expect(linked).toHaveLength(2)
    expect(linked.filter((row) => row.task_id === 'task-v8-dup')).toHaveLength(1)
    expect(linked.some((row) => row.task_id === null)).toBe(true)
    expect(
      legacy.prepare<{ count: number }>(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'recovery_attempts'",
      ).get()?.count,
    ).toBe(1)

    const failing: readonly Migration[] = [
      {
        version: 10,
        name: 'should_fail',
        up: 'ALTER TABLE tasks ADD COLUMN ok TEXT; INSERT INTO missing_table (id) VALUES (1);',
      },
    ]
    expect(() => runMigrations(legacy, failing)).toThrow()
    const columnsAfterFail = legacy
      .prepare<{ name: string }>('PRAGMA table_info(tasks)')
      .all()
      .map((row) => row.name)
    expect(columnsAfterFail).not.toContain('ok')

    legacy.close()
    fs.rmSync(legacyRoot, { recursive: true, force: true })
  })

  test('P1-1 credential invalidation does not permanently disable TaskManager', async () => {
    const { projectId } = seedProject()
    let credential = 'cred-1'
    const manager = createManager({
      resolveLlmConfig: (_projectId, input) => ({
        ...input,
        credentialId: credential,
      }),
      agentFactory: {
        create: async (input) => ({
          projectId: input.projectId,
          sessionId: input.sessionId,
          prompt: async () => successfulResult(input.llm.credentialId ?? ''),
          abort: jest.fn(),
          dispose: jest.fn(),
        }),
      },
    })
    manager.beginRuntimeSession()
    const first = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'a',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    await first.completion

    manager.invalidateActiveRuntimes()
    credential = 'cred-2'
    const second = manager.start({
      projectId,
      sessionId: 's2',
      taskType: 'assistant',
      prompt: 'b',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    const completed = await second.completion
    expect(completed.status).toBe('completed')
    expect((completed.result as { text?: string } | null)?.text).toBe('cred-2')
    expect(manager.isQuitting()).toBe(false)
  })

  test('P1-2 polish revision exists without completed checkpoint finishes without model', async () => {
    const { projectId, chapterId } = seedProject('polish-entity')
    const workbench = new WorkbenchService(database)
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    const task = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-polish',
      input: {
        sessionId: 's',
        taskType: 'chapter-polish',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: {
          project_id: projectId,
          chapter_id: chapterId,
          mode: 'chapter',
          auto_apply: true,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const revision = new ChapterRevisionRepository(database).create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'Polished without checkpoint.',
      summary: 'summary',
      reason: 'polish',
      operation: 'polish',
      blocks: [],
    })
    new ChapterRevisionRepository(database).setCurrent(revision.id)
    // Crash window: revision durable, completed checkpoint missing
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
      checkpoint: null,
      finished_at: null,
    })

    const scan = await manager.scanAndRecoverOnStartup()
    expect(scan.autoStarted).toBe(1)
    const finished = await manager.wait(task.id)
    expect(finished?.status).toBe('completed')
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
    expect(
      database.prepare<{ count: number }>(
        'SELECT COUNT(*) AS count FROM chapter_revisions WHERE task_id = ?',
      ).get(task.id)?.count,
    ).toBe(1)
    expect(
      database.prepare<{ count: number }>(
        'SELECT COUNT(*) AS count FROM postprocess_reports WHERE task_id = ?',
      ).get(task.id)?.count,
    ).toBe(1)
    const chapter = new ChapterRepository(database).getById(chapterId)!
    expect(chapter.content).toBe('Polished without checkpoint.')
    void workbench
  })

  test('P1-2 generation version exists without completed checkpoint finishes without model', async () => {
    const { projectId, outlineId, chapterId } = seedProject('gen-entity')
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    const task = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: {
          project_id: projectId,
          chapter_outline_id: outlineId,
          chapter_id: chapterId,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    new ChapterVersionRepository(database).create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'Saved body',
      summary: 'Saved summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'finalizing',
      checkpoint: null,
    })
    const handle = manager.resume(task.id)
    expect(handle).not.toBeNull()
    const finished = await handle!.completion
    expect(finished.status).toBe('completed')
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
    expect(
      database.prepare<{ count: number }>(
        'SELECT COUNT(*) AS count FROM chapter_versions WHERE task_id = ?',
      ).get(task.id)?.count,
    ).toBe(1)
  })

  test('P1-4 corrupt JSON fails closed without blocking healthy candidates', async () => {
    const { projectId, outlineId } = seedProject('corrupt-mix')
    const tasks = new TaskRepository(database)
    const healthy = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      execution_phase: 'queued',
    })
    tasks.update(healthy.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
    })

    const corrupt = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    database.prepare(
      `UPDATE tasks SET status = 'running', checkpoint_json = '{bad', execution_phase = 'model_in_flight' WHERE id = ?`,
    ).run(corrupt.id)

    const unknownPhase = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    database.prepare(
      `UPDATE tasks SET status = 'running', execution_phase = 'future_phase_v9' WHERE id = ?`,
    ).run(unknownPhase.id)

    const manager = createManager({
      agentFactory: {
        create: async (input) => ({
          projectId: input.projectId,
          sessionId: input.sessionId,
          prompt: async () => successfulResult('recovered'),
          abort: jest.fn(),
          dispose: jest.fn(),
        }),
      },
    })
    manager.beginRuntimeSession()
    const scan = await manager.scanAndRecoverOnStartup()
    expect(scan.scanned).toBeGreaterThanOrEqual(1)

    const corruptAfter = tasks.getById(corrupt.id)!
    expect(corruptAfter.recovery_classification).toBe('non-recoverable')
    expect(corruptAfter.status).toBe('failed')
    expect(corruptAfter.recovery_reason).toBe(TASK_CORRUPTION_REASON)
    expect(corruptAfter.checkpoint).toBeNull()
    expect(JSON.stringify(corruptAfter)).not.toContain('{bad')

    const unknownAfter = tasks.getById(unknownPhase.id)!
    expect(unknownAfter.recovery_classification).toBe('non-recoverable')
    expect(unknownAfter.status).toBe('failed')

    // Healthy restartable candidate was still processed
    expect(scan.autoStarted).toBeGreaterThanOrEqual(1)
  })

  test('P1-5 startup concurrency is enforced with blocking runners', async () => {
    const { projectId, outlineId } = seedProject('concurrency')
    const tasks = new TaskRepository(database)
    let inFlight = 0
    let peak = 0
    const releases: Array<() => void> = []
    const agentFactory: AgentFactory = {
      create: async (input) => ({
        projectId: input.projectId,
        sessionId: input.sessionId,
        prompt: async (_prompt, options = {}) => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          await new Promise<void>((resolve) => {
            releases.push(() => {
              inFlight -= 1
              resolve()
            })
            options.signal?.addEventListener('abort', () => {
              inFlight -= 1
              resolve()
            }, { once: true })
          })
          return successfulResult('ok')
        },
        abort: jest.fn(),
        dispose: jest.fn(),
      }),
    }
    const manager = createManager({
      agentFactory,
      startupConcurrency: 2,
      runners: {
        'chapter-generation': {
          execute: async (context) => {
            await agentFactory.create({
              projectId: context.input.projectId,
              sessionId: context.input.sessionId,
              llm: context.input.llm,
            }).then((agent) => agent.prompt('x', { signal: context.signal }))
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    manager.beginRuntimeSession()

    for (let i = 0; i < 5; i += 1) {
      const task = tasks.create({
        project_id: projectId,
        task_type: 'chapter-generation',
        input: {
          sessionId: `s-${i}`,
          taskType: 'chapter-generation',
          prompt: '',
          llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
          request: { project_id: projectId, chapter_outline_id: outlineId },
        },
        recovery_metadata_version: RECOVERY_METADATA_VERSION,
        execution_phase: 'queued',
      })
      tasks.update(task.id, {
        status: 'failed',
        execution_phase: 'queued',
        recovery_classification: 'restartable',
      })
    }

    const scanPromise = manager.scanAndRecoverOnStartup()
    // Allow workers to start
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(peak).toBeLessThanOrEqual(2)
    // Release in waves
    while (releases.length > 0) {
      const batch = releases.splice(0, releases.length)
      for (const release of batch) release()
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    const scan = await scanPromise
    expect(scan.autoStarted).toBe(5)
    expect(peak).toBeLessThanOrEqual(2)
    expect(peak).toBeGreaterThanOrEqual(1)
  })

  test('P1-6 crash lease is reclaimed immediately and active session is not forced', () => {
    const { projectId } = seedProject('lease')
    const sessions = new RuntimeSessionRepository(database)
    const tasks = new TaskRepository(database)
    const crashed = sessions.start({
      owner: 'old-owner',
      appInstanceId: 'app-old',
      startedAt: new Date().toISOString(),
    })
    const task = tasks.create({
      project_id: projectId,
      task_type: 'assistant',
      input: {
        sessionId: 's',
        taskType: 'assistant',
        prompt: 'x',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: {},
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      runtime_session_id: crashed.id,
    })
    const future = new Date(Date.now() + 5 * 60_000).toISOString()
    tasks.update(task.id, {
      status: 'running',
      lease_owner: 'old-owner',
      lease_token: 'old-token',
      lease_expires_at: future,
      runtime_session_id: crashed.id,
    })

    const manager = createManager({ ownerId: 'new-owner' })
    const session = manager.beginRuntimeSession()
    expect(session).not.toBeNull()
    const open = sessions.listOpen()
    expect(open).toHaveLength(1)
    expect(open[0]?.id).toBe(session!.id)
    expect(sessions.getById(crashed.id)?.end_reason).toBe('forced')

    const refreshed = tasks.getById(task.id)!
    expect(refreshed.lease_token).toBeNull()
    // Fresh claim succeeds immediately despite previous unexpired crash lease
    const claim = tasks.claimForRecovery({
      taskId: task.id,
      owner: 'new-owner',
      leaseToken: 'new-token',
      leaseExpiresAt: future,
      nowIso: new Date().toISOString(),
      kind: 'auto',
      allowedClassifications: undefined,
    })
    expect(claim.claimed).toBe(true)
  })

  test('P1-6 lease renewal and lost-lease abort', async () => {
    const { projectId } = seedProject('renew')
    const intervals: Array<{ cb: () => void }> = []
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
    const manager = createManager({
      agentFactory: blocking.agentFactory,
      ownerId: 'lease-owner',
      leaseMs: 1000,
      leaseRenewMs: 10,
      setIntervalFn: ((cb: () => void) => {
        const handle = { cb }
        intervals.push(handle)
        return handle as unknown as ReturnType<typeof setInterval>
      }) as typeof setInterval,
      clearIntervalFn: ((handle: { cb: () => void }) => {
        const index = intervals.indexOf(handle)
        if (index >= 0) intervals.splice(index, 1)
      }) as typeof clearInterval,
    })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'long',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    // Successful renew path
    const before = tasks.getById(handle.taskId)!
    expect(before.lease_token).toBeTruthy()
    intervals[0]?.cb()
    const renewed = tasks.getById(handle.taskId)!
    expect(renewed.lease_token).toBe(before.lease_token)

    // Steal lease then renew fails -> abort
    tasks.update(handle.taskId, {
      lease_owner: 'thief',
      lease_token: 'stolen',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    intervals[0]?.cb()
    const finished = await handle.completion
    expect(finished.status).toBe('failed')
    expect(finished.stage).toBe('lost-lease')
  })

  test('P1-7 timeout aborts runner and writes timeout terminal state', async () => {
    const { projectId } = seedProject('timeout')
    const timeoutCallbacks: Array<() => void> = []
    const blocking = createBlockingAgent()
    const manager = createManager({
      agentFactory: blocking.agentFactory,
      taskTimeoutMs: 1000,
      setTimeoutFn: ((cb: () => void) => {
        timeoutCallbacks.push(cb)
        return timeoutCallbacks.length as unknown as ReturnType<typeof setTimeout>
      }) as typeof setTimeout,
      clearTimeoutFn: jest.fn() as unknown as typeof clearTimeout,
      now: () => '2026-01-01T00:00:00.000Z',
    })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'hang',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    expect(timeoutCallbacks.length).toBeGreaterThanOrEqual(1)
    timeoutCallbacks[0]!()
    const finished = await handle.completion
    expect(finished.status).toBe('failed')
    expect(finished.stage).toBe('timeout')
    expect(finished.recovery_classification).toBe('manual-retry-required')
    expect(finished.recovery_reason).toBe(TIMEOUT_RECOVERY_REASON)
    expect(finished.cancel_requested).toBe(false)
  })

  test('P1-8 manual retry loser does not mutate safety evidence', async () => {
    const { projectId, outlineId } = seedProject('manual-race')
    const tasksA = new TaskRepository(database)
    const tasksB = new TaskRepository(database)
    const task = tasksA.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasksA.update(task.id, {
      status: 'failed',
      execution_phase: 'model_in_flight',
      recovery_classification: 'manual-retry-required',
      recovery_action: 'manual-confirm',
      recovery_attempt_count: 1,
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
    })
    const snapshot = tasksA.getById(task.id)!

    const managerA = createManager({ ownerId: 'scanner-a' })
    const managerB = createManager({ ownerId: 'manual-b' })
    managerA.beginRuntimeSession()
    managerB.beginRuntimeSession()

    // Scanner holds lease + model_in_flight evidence
    const auto = tasksA.claimForRecovery({
      taskId: task.id,
      owner: 'scanner-a',
      leaseToken: 'lease-a',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      nowIso: new Date().toISOString(),
      kind: 'auto',
      allowedClassifications: ['manual-retry-required', 'restartable', 'resumable'],
    })
    expect(auto.claimed).toBe(true)
    tasksA.update(task.id, {
      recovery_classification: 'manual-retry-required',
      recovery_action: 'manual-confirm',
      recovery_reason: '模型请求处于不确定窗口',
      execution_phase: 'model_in_flight',
    })
    const beforeManual = tasksA.getById(task.id)!
    const loser = managerB.manualRetry(task.id, true)
    expect(loser).toBeNull()
    const after = tasksB.getById(task.id)!
    expect(after.execution_phase).toBe('model_in_flight')
    expect(after.lease_owner).toBe('scanner-a')
    expect(after.lease_token).toBe('lease-a')
    expect(after.recovery_attempt_count).toBe(beforeManual.recovery_attempt_count)
    expect(after.status).toBe('running')
    // No orphan attempts beyond the successful auto claim
    const attempts = new RecoveryAttemptRepository(database).listByTask(task.id)
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.kind).toBe('auto')
    void snapshot
  })

  test('P1-9 rejects nested secret fields and never persists markers', () => {
    const { projectId } = seedProject('secrets')
    const manager = createManager()
    manager.beginRuntimeSession()
    const payloads = [
      { apiKey: 'sk-secret-marker-AAA' },
      { credential_secret: 'marker-BBB' },
      { nested: { authorization: 'Bearer marker-CCC' } },
      { list: [{ Token: 'marker-DDD' }] },
      { userPassword: 'marker-EEE' },
      { COOKIE: 'marker-FFF' },
    ]
    for (const payload of payloads) {
      expect(() => assertNoSensitiveTaskInput(payload, 'request')).toThrow(/敏感字段/)
      expect(() => manager.start({
        projectId,
        sessionId: 's',
        taskType: 'assistant',
        prompt: 'x',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        input: payload,
      })).toThrow(/敏感字段/)
    }
    const bytes = database.prepare<{ input_json: string }>('SELECT input_json FROM tasks').all()
      .map((row) => row.input_json)
      .join('\n')
    expect(bytes).not.toContain('marker-')
    expect(bytes).not.toContain('sk-secret')
    expect(bytes).not.toContain('Bearer marker')
  })

  test('P1-10 quiesce waits for completion before DB close; no writes after close', async () => {
    const { projectId } = seedProject('quiesce')
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'long',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    let closed = false
    const originalPrepare = database.prepare.bind(database)
    let writesAfterClose = 0
    // Wrap prepare to count mutating SQL after close flag
    ;(database as { prepare: typeof database.prepare }).prepare = ((sql: string) => {
      const stmt = originalPrepare(sql)
      const originalRun = stmt.run.bind(stmt)
      stmt.run = ((...args: unknown[]) => {
        if (closed && /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) {
          writesAfterClose += 1
        }
        return originalRun(...args)
      }) as typeof stmt.run
      return stmt
    }) as typeof database.prepare

    const quiescePromise = manager.quiesceForShutdown(5_000)
    // Completion still active until release
    await new Promise((resolve) => setTimeout(resolve, 20))
    blocking.release({ ...successfulResult(), finishReason: 'aborted' })
    await quiescePromise
    await handle.completion
    closed = true
    const result = await shutdownDatabaseResources({
      taskManager: null,
      assistantService: null,
      database,
      awaitQuiesce: false,
    })
    expect(result.databaseClosed).toBe(true)
    expect(writesAfterClose).toBe(0)
    // reopen fresh for afterEach close
    database = initializeDatabase(tempRoot)
  })

  test('P1-11 sanitizeErrorMessage strips paths and tokens', () => {
    const { sanitizeErrorMessage } = require('@/shared/security/sanitizeSensitiveData') as {
      sanitizeErrorMessage: (error: unknown) => string
    }
    const windows = sanitizeErrorMessage(new Error('open C:\\Users\\admin\\secret\\db.sqlite failed'))
    expect(windows).not.toContain('C:\\Users\\admin')
    expect(windows).toContain('[LOCAL_PATH]')
    const unix = sanitizeErrorMessage(new Error('ENOENT /home/alice/.config/app.db'))
    expect(unix).not.toContain('/home/alice')
    const bearer = sanitizeErrorMessage(new Error('Bearer sk-ant-abcdefghijklmnop'))
    expect(bearer).not.toMatch(/sk-ant-abcdefghijklmnop/)
    expect(bearer).toContain('[REDACTED]')
  })

  test('P2-1 non-recoverable becomes stable terminal and does not block new chapter tasks', async () => {
    const { projectId, outlineId } = seedProject('nonrec')
    const tasks = new TaskRepository(database)
    const stuck = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: 'missing-outline' },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(stuck.id, {
      status: 'running',
      execution_phase: 'queued',
    })
    const manager = new TaskManager({
      store: tasks,
      agentFactory: {
        create: async (input) => ({
          projectId: input.projectId,
          sessionId: input.sessionId,
          prompt: async () => successfulResult(),
          abort: jest.fn(),
          dispose: jest.fn(),
        }),
      },
      events: { publish: () => undefined },
      recoveryLookups: {
        projectExists: () => true,
        targetExists: () => false,
        hasChapterVersionForTask: () => false,
        hasChapterRevisionForTask: () => false,
        credentialAvailable: () => true,
      },
      runtimeSessions: new RuntimeSessionRepository(database),
      recoveryAttempts: new RecoveryAttemptRepository(database),
    })
    manager.beginRuntimeSession()
    const first = await manager.scanAndRecoverOnStartup()
    expect(first.terminated).toBeGreaterThanOrEqual(1)
    const after = tasks.getById(stuck.id)!
    expect(after.status).toBe('failed')
    expect(after.recovery_classification).toBe('non-recoverable')
    expect(after.finished_at).toBeTruthy()
    expect(after.lease_token).toBeNull()

    const second = await manager.scanAndRecoverOnStartup()
    expect(second.autoStarted).toBe(0)
    expect(second.terminated).toBe(0)

    // New chapter generation is not blocked by the terminated row
    const fresh = createManager()
    fresh.beginRuntimeSession()
    const handle = fresh.startChapterGeneration({
      projectId,
      sessionId: 's2',
      chapterOutlineId: outlineId,
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    expect(handle.taskId).toBeTruthy()
    await handle.completion
  })

  test('P2-2 recovery attempt history records auto and manual outcomes without orphans', async () => {
    const { projectId, outlineId } = seedProject('history')
    const tasks = new TaskRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    const task = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      max_recovery_attempts: 3,
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
    })
    const manager = createManager({
      agentFactory: {
        create: async (input) => ({
          projectId: input.projectId,
          sessionId: input.sessionId,
          prompt: async () => successfulResult('ok'),
          abort: jest.fn(),
          dispose: jest.fn(),
        }),
      },
    })
    manager.beginRuntimeSession()
    const scan = await manager.scanAndRecoverOnStartup()
    expect(scan.autoStarted).toBe(1)
    await manager.wait(task.id)

    // Force another recovery via manual after fail
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
      finished_at: null,
      recovery_classification: 'manual-retry-required',
      recovery_action: 'manual-confirm',
    })
    const retried = manager.manualRetry(task.id, true)
    expect(retried).not.toBeNull()
    await retried!.completion

    const history = attempts.listByTask(task.id)
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history.some((item) => item.kind === 'auto')).toBe(true)
    expect(history.some((item) => item.kind === 'manual')).toBe(true)
    expect(history.every((item) => item.finished_at !== null)).toBe(true)
    expect(attempts.countOpen()).toBe(0)

    // Failed claim creates no orphan
    const openBefore = attempts.countOpen()
    const failedClaim = tasks.claimForRecovery({
      taskId: task.id,
      owner: 'x',
      leaseToken: 'y',
      leaseExpiresAt: new Date(Date.now() + 1000).toISOString(),
      nowIso: new Date().toISOString(),
      kind: 'auto',
      allowedClassifications: ['restartable'],
    })
    // task completed so claim may fail
    expect(failedClaim.claimed).toBe(false)
    expect(attempts.countOpen()).toBe(openBefore)
  })

  test('two scanners claim the same task at most once', () => {
    const { projectId } = seedProject()
    const tasks = new TaskRepository(database)
    const task = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 's',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: 'o' },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
    })
    const nowIso = new Date().toISOString()
    const first = tasks.claimForRecovery({
      taskId: task.id,
      owner: 'scanner-a',
      leaseToken: 'token-a',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      nowIso,
      kind: 'auto',
      allowedClassifications: ['restartable'],
    })
    const second = tasks.claimForRecovery({
      taskId: task.id,
      owner: 'scanner-b',
      leaseToken: 'token-b',
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      nowIso,
      kind: 'auto',
      allowedClassifications: ['restartable'],
    })
    expect(first.claimed).toBe(true)
    expect(second.claimed).toBe(false)
    expect(tasks.getById(task.id)?.lease_owner).toBe('scanner-a')
  })

  test('graceful shutdown marks tasks and blocks crash-safe auto resume misclassification', () => {
    const { projectId } = seedProject()
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'long',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    manager.beginGracefulShutdown()
    const task = new TaskRepository(database).getById(handle.taskId)
    expect(task?.shutdown_kind).toBe('graceful')
    blocking.release({ ...successfulResult(), finishReason: 'aborted' })
  })

  test('does not persist credentialId in task input', async () => {
    const { projectId } = seedProject()
    const manager = createManager()
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'x',
      llm: {
        baseUrl: 'https://example.invalid/v1',
        model: 'm',
        credentialId: 'secret-id',
      },
    })
    await handle.completion
    const stored = new TaskRepository(database).getById(handle.taskId)
    const llm = stored?.input.llm as Record<string, unknown>
    expect(llm.credentialId).toBeUndefined()
    expect(llm.apiKey).toBeUndefined()
  })
})
