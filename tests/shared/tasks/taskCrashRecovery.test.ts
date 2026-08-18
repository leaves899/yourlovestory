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
  PostprocessReportRepository,
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
  UNKNOWN_PHASE_REASON,
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
    database?: SqliteDatabase
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
    const managerDatabase = overrides.database ?? database
    const workbench = new WorkbenchService(managerDatabase)
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
      store: new TaskRepository(managerDatabase),
      agentFactory,
      events: { publish: () => undefined },
      ownerId: overrides.ownerId ?? 'owner-a',
      runtimeSessions: new RuntimeSessionRepository(managerDatabase),
      recoveryAttempts: new RecoveryAttemptRepository(managerDatabase),
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
        projectExists: (projectId) =>
          new ProjectRepository(managerDatabase).getById(projectId) !== null,
        targetExists: () => true,
        hasChapterVersionForTask: (taskId) =>
          new ChapterVersionRepository(managerDatabase).getByTaskId(taskId) !== null,
        hasChapterRevisionForTask: (taskId) =>
          new ChapterRevisionRepository(managerDatabase).getByTaskId(taskId) !== null,
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

  test('P1-0 stable idempotency key rejects a duplicate active business target', async () => {
    const { projectId } = seedProject('idempotency')
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    const tasks = new TaskRepository(database)
    manager.beginRuntimeSession()
    const input = {
      projectId,
      sessionId: 'same-session',
      taskType: 'assistant',
      prompt: 'same request',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    }

    const first = manager.start(input)
    const completions = [first.completion]
    let duplicateError: unknown = null
    try {
      completions.push(manager.start(input).completion)
    } catch (error) {
      duplicateError = error
    }

    const activeTasks = tasks.listByProject(projectId).filter((task) =>
      task.status === 'pending' || task.status === 'running',
    )
    manager.invalidateActiveRuntimes()
    await Promise.all(completions)

    expect(duplicateError).not.toBeNull()
    expect(activeTasks).toHaveLength(1)
    expect(blocking.createCount()).toBe(1)
  })

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
    // Insert business-newer first so rowid order is opposite of created_at order.
    // Authoritative selection must follow created_at DESC, id DESC — not MAX(rowid).
    legacy.prepare(
      `INSERT INTO postprocess_reports (
        id, project_id, chapter_id, task_id, report_type, status, summary, details_json, created_at
      ) VALUES (?, ?, NULL, ?, 'chapter-polish', 'completed', 'new', '{}', ?)`,
    ).run('report-new', project.id, 'task-v8-dup', '2020-01-02T00:00:00.000Z')
    legacy.prepare(
      `INSERT INTO postprocess_reports (
        id, project_id, chapter_id, task_id, report_type, status, summary, details_json, created_at
      ) VALUES (?, ?, NULL, ?, 'chapter-polish', 'completed', 'old', '{}', ?)`,
    ).run('report-old', project.id, 'task-v8-dup', '2020-01-01T00:00:00.000Z')

    runMigrations(legacy)
    const linked = legacy
      .prepare<{ id: string; task_id: string | null; summary: string }>(
        'SELECT id, task_id, summary FROM postprocess_reports ORDER BY id',
      )
      .all()
    expect(linked).toHaveLength(2)
    expect(linked.filter((row) => row.task_id === 'task-v8-dup')).toHaveLength(1)
    const kept = linked.find((row) => row.task_id === 'task-v8-dup')
    expect(kept?.id).toBe('report-new')
    expect(kept?.summary).toBe('new')
    expect(linked.some((row) => row.task_id === null && row.id === 'report-old')).toBe(true)
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
    const sourceContent = new ChapterRepository(database).getById(chapterId)!.content

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
      checkpoint: {
        schema_version: 1,
        operation: 'chapter_polish',
        source_content: sourceContent,
        generated_content: revision.content,
        revision_id: null,
        status: 'running',
        error: null,
        applied: false,
      },
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

  test('P1-2 stale task revision cannot auto-apply over a newer current revision', async () => {
    const { projectId, chapterId } = seedProject('polish-stale-current')
    const workbench = new WorkbenchService(database)
    const tasks = new TaskRepository(database)
    const revisions = new ChapterRevisionRepository(database)
    const blocking = createBlockingAgent()
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
    const stale = revisions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'stale task revision',
      summary: 'stale',
      reason: 'task',
      operation: 'polish',
      blocks: [],
    })
    revisions.setCurrent(stale.id)
    const newer = revisions.create({
      chapter_id: chapterId,
      content: 'newer adopted revision',
      summary: 'newer',
      reason: 'manual',
      operation: 'manual',
      blocks: [],
    })
    revisions.setCurrent(newer.id)
    workbench.narrative.applyRevision(projectId, newer.id)
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
      checkpoint: null,
    })
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)
    const failed = tasks.getById(task.id)!
    expect(failed.status).toBe('failed')
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(revisions.getById(newer.id)?.is_current).toBe(true)
    expect(new ChapterRepository(database).getById(chapterId)?.content)
      .toBe('newer adopted revision')
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-2 recovered auto-apply fails closed when chapter changed after source checkpoint', async () => {
    const { projectId, chapterId } = seedProject('polish-source-fence')
    const tasks = new TaskRepository(database)
    const chapters = new ChapterRepository(database)
    const revisions = new ChapterRevisionRepository(database)
    const reports = new PostprocessReportRepository(database)
    const blocking = createBlockingAgent()
    const source = chapters.getById(chapterId)!
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
    const revision = revisions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'recovered polished content',
      summary: 'polished',
      reason: 'task',
      operation: 'polish',
      blocks: [],
    })
    revisions.setCurrent(revision.id)
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
      checkpoint: {
        schema_version: 1,
        operation: 'chapter_polish',
        source_content: source.content,
        generated_content: revision.content,
        revision_id: revision.id,
        status: 'completed',
        error: null,
        applied: false,
      },
    })
    chapters.update(chapterId, {
      content: 'manual edit after crash',
    }, source.version)
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)
    expect(tasks.getById(task.id)).toMatchObject({
      status: 'failed',
      recovery_classification: 'non-recoverable',
    })
    expect(chapters.getById(chapterId)?.content).toBe('manual edit after crash')
    expect(revisions.getById(revision.id)?.is_current).toBe(true)
    expect(reports.getByTaskId(task.id)).toBeNull()
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
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

    const corruptInput = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'bad-input',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    database.prepare(
      `UPDATE tasks SET status = 'running', input_json = '{bad-input', execution_phase = 'queued' WHERE id = ?`,
    ).run(corruptInput.id)

    const corruptResult = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'bad-result',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    database.prepare(
      `UPDATE tasks SET status = 'running', result_json = '{bad-result', execution_phase = 'persisting_result' WHERE id = ?`,
    ).run(corruptResult.id)

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
      `UPDATE tasks
       SET status = 'running',
           execution_phase = 'future_phase_v9',
           checkpoint_json = '{"future":"checkpoint-evidence"}',
           result_json = '{"future":"result-evidence"}'
       WHERE id = ?`,
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
    expect(corruptAfter.input.sessionId).toBe('s')
    expect(JSON.stringify(corruptAfter)).not.toContain('{bad')

    const normalizedInput = tasks.getById(corruptInput.id)!
    expect(normalizedInput.status).toBe('failed')
    expect(normalizedInput.recovery_classification).toBe('non-recoverable')
    expect(normalizedInput.recovery_reason).toBe(TASK_CORRUPTION_REASON)
    expect(normalizedInput.input).toEqual({})
    expect(normalizedInput.checkpoint).toBeNull()
    expect(normalizedInput.result).toBeNull()
    expect(manager.listRecoverable(projectId).some((item) => item.id === corruptInput.id)).toBe(true)

    const normalizedResult = tasks.getById(corruptResult.id)!
    expect(normalizedResult.status).toBe('failed')
    expect(normalizedResult.recovery_classification).toBe('non-recoverable')
    expect(normalizedResult.recovery_reason).toBe(TASK_CORRUPTION_REASON)
    expect(normalizedResult.input.sessionId).toBe('bad-result')
    expect(normalizedResult.checkpoint).toBeNull()
    expect(normalizedResult.result).toBeNull()
    expect(manager.listRecoverable(projectId).some((item) => item.id === corruptResult.id)).toBe(true)
    const normalizedBytes = database
      .prepare<{ input_json: string; checkpoint_json: string | null; result_json: string | null }>(
        'SELECT input_json, checkpoint_json, result_json FROM tasks WHERE id = ?',
      )
      .get(corruptResult.id)
    expect(normalizedBytes?.input_json).toContain('"sessionId":"bad-result"')
    expect(normalizedBytes?.checkpoint_json).toBeNull()
    expect(normalizedBytes?.result_json).toBeNull()

    const unknownAfter = tasks.getById(unknownPhase.id)!
    expect(unknownAfter.recovery_classification).toBe('non-recoverable')
    expect(unknownAfter.status).toBe('failed')
    expect(unknownAfter.recovery_reason).toBe(UNKNOWN_PHASE_REASON)
    expect(unknownAfter.input.sessionId).toBe('s')
    expect(unknownAfter.checkpoint).toEqual({ future: 'checkpoint-evidence' })
    expect(unknownAfter.result).toEqual({ future: 'result-evidence' })

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

    // Steal lease then renew fails -> old owner must not overwrite task row
    tasks.update(handle.taskId, {
      status: 'running',
      stage: 'owned-by-b',
      progress: 0.42,
      lease_owner: 'thief',
      lease_token: 'stolen',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      execution_phase: 'model_in_flight',
    })
    const stolenSnapshot = JSON.stringify(tasks.getById(handle.taskId))
    intervals[0]?.cb()
    const finished = await handle.completion
    // New owner state bytes unchanged; lost-lease only closes attempt history
    expect(JSON.stringify(tasks.getById(handle.taskId))).toBe(stolenSnapshot)
    expect(finished.lease_token).toBe('stolen')
    expect(finished.stage).toBe('owned-by-b')
    expect(finished.status).toBe('running')
    const attempts = new RecoveryAttemptRepository(database).listByTask(handle.taskId)
    // start() does not always create attempt rows; lost_lease flag path still safe
    void attempts
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

  test('P1-9 rejects nested secret fields, string values, prompt, baseUrl query and never persists markers', () => {
    const { projectId } = seedProject('secrets')
    const manager = createManager()
    manager.beginRuntimeSession()
    const keyPayloads = [
      { apiKey: 'sk-secret-marker-AAA' },
      { credential_secret: 'marker-BBB' },
      { nested: { authorization: 'Bearer marker-CCC' } },
      { list: [{ Token: 'marker-DDD' }] },
      { userPassword: 'marker-EEE' },
      { COOKIE: 'marker-FFF' },
    ]
    for (const payload of keyPayloads) {
      expect(() => assertNoSensitiveTaskInput(payload, 'request')).toThrow(/敏感字段/)
      expect(() => manager.start({
        projectId,
        sessionId: 's',
        taskType: 'assistant',
        prompt: 'x',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        input: payload,
      })).toThrow(/敏感/)
    }

    const valueCases: Array<{ label: string; start: () => void }> = [
      {
        label: 'prompt-bearer',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'assistant',
            prompt: 'Bearer sk-secret-marker',
            llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
          })
        },
      },
      {
        label: 'request-notes',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'assistant',
            prompt: 'safe',
            llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
            input: { notes: 'sk-secret-marker' },
          })
        },
      },
      {
        label: 'baseurl-query',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'assistant',
            prompt: 'safe',
            llm: {
              baseUrl: 'https://host.example/v1?api_key=secret-marker',
              model: 'm',
            },
          })
        },
      },
      {
        label: 'model',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'assistant',
            prompt: 'safe',
            llm: { baseUrl: 'https://example.invalid/v1', model: 'sk-secret-marker-model' },
          })
        },
      },
      {
        label: 'provider',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'assistant',
            prompt: 'safe',
            llm: {
              provider: 'sk-secret-marker-provider',
              baseUrl: 'https://example.invalid/v1',
              model: 'm',
            },
          })
        },
      },
      {
        label: 'session-id',
        start: () => {
          manager.start({
            projectId,
            sessionId: 'sk-secret-marker-session',
            taskType: 'assistant',
            prompt: 'safe',
            llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
          })
        },
      },
      {
        label: 'task-type',
        start: () => {
          manager.start({
            projectId,
            sessionId: 's',
            taskType: 'sk-secret-marker-task',
            prompt: 'safe',
            llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
          })
        },
      },
    ]
    for (const item of valueCases) {
      expect(item.start).toThrow(/敏感|模型端点|不受支持/)
    }

    const rows = database.prepare<{ input_json: string }>('SELECT input_json FROM tasks').all()
    const joined = rows.map((row) => row.input_json).join('\n')
    expect(joined).not.toContain('marker-')
    expect(joined).not.toContain('sk-secret')
    expect(joined).not.toContain('Bearer')
    expect(joined).not.toContain('secret-marker')
    expect(joined).not.toContain('api_key=')

    // Scan SQLite file bytes as well as rows.
    const dbPath = path.join(tempRoot, 'data', 'yourcrush.sqlite')
    if (fs.existsSync(dbPath)) {
      const fileBytes = fs.readFileSync(dbPath)
      expect(fileBytes.includes(Buffer.from('sk-secret-marker'))).toBe(false)
      expect(fileBytes.includes(Buffer.from('secret-marker'))).toBe(false)
      expect(fileBytes.includes(Buffer.from('Bearer sk-secret'))).toBe(false)
    }
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
    const quiesceResult = await quiescePromise
    expect(quiesceResult.drained).toBe(true)
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

  test('P1-10b abort-ignoring runner: quiesce timeout never closes DB; later drain can close', async () => {
    const { projectId, outlineId } = seedProject('quiesce-timeout')
    let resolveBlock: (() => void) | null = null
    const block = new Promise<void>((resolve) => {
      resolveBlock = resolve
    })
    let closeCount = 0
    const manager = createManager({
      runners: {
        'chapter-generation': {
          execute: async (context) => {
            // Ignore AbortSignal completely (simulates bad runner / stuck I/O).
            await block
            void context
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      sessionId: 's',
      taskType: 'chapter-generation',
      prompt: '',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
      input: { project_id: projectId, chapter_outline_id: outlineId },
    })

    const firstShutdown = await shutdownDatabaseResources({
      taskManager: manager,
      assistantService: null,
      database: {
        close: () => {
          closeCount += 1
        },
      },
      awaitQuiesce: true,
      quiesceTimeoutMs: 30,
    })
    expect(firstShutdown.databaseClosed).toBe(false)
    expect(firstShutdown.drained).toBe(false)
    expect(closeCount).toBe(0)
    expect(manager.isQuitting()).toBe(false)

    const fresh = manager.start({
      projectId,
      sessionId: 'after-aborted-shutdown',
      taskType: 'assistant',
      prompt: 'still available',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    expect((await fresh.completion).status).toBe('completed')

    resolveBlock?.()
    await handle.completion
    // Mock close only: do not close the live test database handle here.
    const secondShutdown = await shutdownDatabaseResources({
      taskManager: manager,
      assistantService: null,
      database: {
        close: () => {
          closeCount += 1
        },
      },
      awaitQuiesce: true,
      quiesceTimeoutMs: 1_000,
    })
    expect(secondShutdown.databaseClosed).toBe(true)
    expect(secondShutdown.drained).toBe(true)
    expect(closeCount).toBe(1)
  })

  test('P1-10c database close failure starts a fresh runtime session and restores admission', async () => {
    const { projectId } = seedProject('close-failure-resume')
    const sessions = new RuntimeSessionRepository(database)
    const manager = createManager()
    const firstRuntime = manager.beginRuntimeSession()!

    const result = await shutdownDatabaseResources({
      taskManager: manager,
      assistantService: { dispose: jest.fn() },
      database: {
        close: () => {
          throw new Error('injected close failure')
        },
      },
      awaitQuiesce: true,
    })

    expect(result).toEqual({
      databaseClosed: false,
      serviceCleanupFailed: false,
      drained: true,
    })
    expect(sessions.getById(firstRuntime.id)?.end_reason).toBe('graceful')
    const openSessions = sessions.listOpen()
    expect(openSessions).toHaveLength(1)
    expect(openSessions[0]?.id).not.toBe(firstRuntime.id)
    expect(manager.isQuitting()).toBe(false)

    const fresh = manager.start({
      projectId,
      sessionId: 'after-close-failure',
      taskType: 'assistant',
      prompt: 'still available',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    expect((await fresh.completion).status).toBe('completed')
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
    // Generic task prompt is minimized and not durable.
    expect(stored?.input.prompt).toBe('')
  })

  test('P1-1 concurrent lease fencing: old owner cannot overwrite new owner task bytes', async () => {
    const { projectId } = seedProject('fence')
    const tasks = new TaskRepository(database)
    const intervals: Array<{ cb: () => void }> = []
    const blocking = createBlockingAgent()
    const ownerA = createManager({
      agentFactory: blocking.agentFactory,
      ownerId: 'owner-a',
      leaseMs: 60_000,
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
    ownerA.beginRuntimeSession()
    const handleA = ownerA.start({
      projectId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: 'long',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })

    // B steals lease (simulates claim after crash recovery replaced owner).
    const nowIso = new Date().toISOString()
    const tokenB = 'token-b'
    tasks.update(handleA.taskId, {
      lease_owner: 'owner-b',
      lease_token: tokenB,
      lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
      stage: 'b-running',
      progress: 0.77,
      execution_phase: 'model_in_flight',
      recovery_classification: 'restartable',
      recovery_reason: 'owned-by-b',
    })
    const beforeBytes = database
      .prepare<{ row: string }>(
        `SELECT id || '|' || status || '|' || stage || '|' || progress || '|' ||
                COALESCE(lease_owner,'') || '|' || COALESCE(lease_token,'') || '|' ||
                COALESCE(execution_phase,'') || '|' || COALESCE(checkpoint_json,'') || '|' ||
                COALESCE(result_json,'') AS row
         FROM tasks WHERE id = ?`,
      )
      .get(handleA.taskId)?.row

    // A renew fails and subsequent stage/checkpoint/complete/fail writes are fenced out.
    intervals[0]?.cb()
    const finishedA = await handleA.completion
    const afterBytes = database
      .prepare<{ row: string }>(
        `SELECT id || '|' || status || '|' || stage || '|' || progress || '|' ||
                COALESCE(lease_owner,'') || '|' || COALESCE(lease_token,'') || '|' ||
                COALESCE(execution_phase,'') || '|' || COALESCE(checkpoint_json,'') || '|' ||
                COALESCE(result_json,'') AS row
         FROM tasks WHERE id = ?`,
      )
      .get(handleA.taskId)?.row
    expect(afterBytes).toBe(beforeBytes)
    expect(finishedA.lease_owner).toBe('owner-b')
    expect(finishedA.stage).toBe('b-running')
    expect(tasks.updateOwned(handleA.taskId, { owner: 'owner-a', leaseToken: 'old' }, {
      stage: 'should-not-apply',
    })).toBeNull()
    expect(tasks.getById(handleA.taskId)?.stage).toBe('b-running')
    void nowIso
  })

  test('P1-1 lease fence guards durable business writes in the same transaction', () => {
    const { projectId, chapterId } = seedProject('fenced-side-effect')
    const tasks = new TaskRepository(database)
    const versions = new ChapterVersionRepository(database)
    const task = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-generation',
      input: {},
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    tasks.update(task.id, {
      status: 'running',
      lease_owner: 'owner-b',
      lease_token: 'token-b',
      lease_expires_at: expiresAt,
    })
    const createVersion = () => versions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'fenced content',
      summary: 'fenced summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })

    expect(() =>
      tasks.runOwnedTransaction(
        task.id,
        { owner: 'owner-a', leaseToken: 'token-a' },
        new Date().toISOString(),
        createVersion,
      ),
    ).toThrow(/lease/i)
    expect(versions.getByTaskId(task.id)).toBeNull()

    expect(() =>
      tasks.runOwnedTransaction(
        task.id,
        { owner: 'owner-b', leaseToken: 'token-b' },
        new Date().toISOString(),
        () => {
          createVersion()
          throw new Error('inject rollback after business write')
        },
      ),
    ).toThrow(/inject rollback/)
    expect(versions.getByTaskId(task.id)).toBeNull()

    const committed = tasks.runOwnedTransaction(
      task.id,
      { owner: 'owner-b', leaseToken: 'token-b' },
      new Date().toISOString(),
      createVersion,
    )
    expect(committed.task_id).toBe(task.id)
    expect(versions.getByTaskId(task.id)?.id).toBe(committed.id)
  })

  test('P1-1 lease fence atomically guards revision, report, and auto-apply writes', () => {
    const { projectId, chapterId } = seedProject('fenced-polish-side-effects')
    const ownerADatabase = database
    const ownerBDatabase = initializeDatabase(tempRoot)
    const tasksA = new TaskRepository(ownerADatabase)
    const tasksB = new TaskRepository(ownerBDatabase)
    const revisions = new ChapterRevisionRepository(ownerBDatabase)
    const reports = new PostprocessReportRepository(ownerBDatabase)
    const workbench = new WorkbenchService(ownerBDatabase)
    const task = tasksA.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-polish',
      input: {},
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasksB.update(task.id, {
      status: 'running',
      lease_owner: 'owner-b',
      lease_token: 'token-b',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    const originalContent = new ChapterRepository(ownerADatabase).getById(chapterId)!.content
    const createAllSideEffects = () => {
      const revision = revisions.create({
        chapter_id: chapterId,
        task_id: task.id,
        content: 'fenced polished content',
        summary: 'fenced polished summary',
        reason: 'test',
        operation: 'polish',
        blocks: [],
      })
      const report = reports.create({
        project_id: projectId,
        chapter_id: chapterId,
        task_id: task.id,
        report_type: 'chapter-polish',
        status: 'completed',
        summary: 'completed',
        details: { revision_id: revision.id },
      })
      workbench.narrative.applyRevision(projectId, revision.id)
      return { revision, report }
    }

    try {
      expect(() =>
        tasksA.runOwnedTransaction(
          task.id,
          { owner: 'owner-a', leaseToken: 'token-a' },
          new Date().toISOString(),
          createAllSideEffects,
        ),
      ).toThrow(/lease/i)
      expect(revisions.getByTaskId(task.id)).toBeNull()
      expect(reports.getByTaskId(task.id)).toBeNull()

      expect(() =>
        tasksB.runOwnedTransaction(
          task.id,
          { owner: 'owner-b', leaseToken: 'token-b' },
          new Date().toISOString(),
          () => {
            createAllSideEffects()
            throw new Error('inject rollback after polish side effects')
          },
        ),
      ).toThrow(/inject rollback/)
      expect(revisions.getByTaskId(task.id)).toBeNull()
      expect(reports.getByTaskId(task.id)).toBeNull()
      expect(new ChapterRepository(ownerADatabase).getById(chapterId)?.content)
        .toBe(originalContent)

      const committed = tasksB.runOwnedTransaction(
        task.id,
        { owner: 'owner-b', leaseToken: 'token-b' },
        new Date().toISOString(),
        createAllSideEffects,
      )
      expect(revisions.getByTaskId(task.id)?.id).toBe(committed.revision.id)
      expect(reports.getByTaskId(task.id)?.id).toBe(committed.report.id)
      expect(new ChapterRepository(ownerADatabase).getById(chapterId)?.content)
        .toBe('fenced polished content')
    } finally {
      ownerBDatabase.close()
    }
  })

  test('P1-1 stale runner cannot persist a business entity after another owner takes the lease', async () => {
    const { projectId, chapterId } = seedProject('stale-business-runner')
    const tasks = new TaskRepository(database)
    const versions = new ChapterVersionRepository(database)
    let releaseRunner: (() => void) | null = null
    let markStarted: (() => void) | null = null
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    const manager = createManager({
      ownerId: 'owner-a',
      runners: {
        assistant: {
          execute: async (context) => {
            markStarted?.()
            await new Promise<void>((resolve) => {
              releaseRunner = resolve
            })
            context.runOwnedSideEffect(() => {
              versions.create({
                chapter_id: chapterId,
                task_id: context.task.id,
                content: 'stale content',
                summary: 'stale summary',
                fact_check: { passed: true, summary: 'ok', findings: [] },
              })
            })
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    manager.beginRuntimeSession()
    const handle = manager.start({
      projectId,
      chapterId,
      sessionId: 's',
      taskType: 'assistant',
      prompt: '',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    await started
    tasks.update(handle.taskId, {
      lease_owner: 'owner-b',
      lease_token: 'token-b',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
      stage: 'owned-by-b',
    })
    releaseRunner?.()
    const finished = await handle.completion

    expect(versions.getByTaskId(handle.taskId)).toBeNull()
    expect(finished.lease_owner).toBe('owner-b')
    expect(tasks.getById(handle.taskId)?.stage).toBe('owned-by-b')
  })

  test('P1-1 two managers real concurrent claim fencing', async () => {
    const { projectId, outlineId } = seedProject('two-mgr')
    const tasks = new TaskRepository(database)
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
      execution_phase: 'queued',
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
    })
    const releases: Array<() => void> = []
    const makeRunner = () => ({
      execute: async () => {
        await new Promise<void>((resolve) => {
          releases.push(resolve)
        })
        return { status: 'completed' as const, result: { ok: true } }
      },
    })
    const managerA = createManager({
      ownerId: 'mgr-a',
      runners: { 'chapter-generation': makeRunner() },
    })
    const managerBDatabase = initializeDatabase(tempRoot)
    const managerB = createManager({
      database: managerBDatabase,
      ownerId: 'mgr-b',
      runners: { 'chapter-generation': makeRunner() },
    })
    try {
      const started = await Promise.all([
        Promise.resolve().then(() => managerA.resume(task.id)),
        Promise.resolve().then(() => managerB.resume(task.id)),
      ])
      const claimed = started.filter((item) => item !== null)
      expect(claimed.length).toBe(1)
      const owner = tasks.getById(task.id)!
      expect(['mgr-a', 'mgr-b']).toContain(owner.lease_owner)
      // Only one runner should be blocked waiting across two SQLite connections.
      expect(releases.length).toBe(1)
      releases[0]!()
      await claimed[0]!.completion
      expect(tasks.getById(task.id)?.status).toBe('completed')
    } finally {
      managerBDatabase.close()
    }
  })

  test('P1-3 final entity finishes with zero model under credential/timeout/attempt caps', async () => {
    const { projectId, outlineId, chapterId } = seedProject('final-zero')
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
    const cases: Array<'credential' | 'timeout' | 'attempts'> = ['credential', 'timeout', 'attempts']
    for (const kind of cases) {
      const task = tasks.create({
        project_id: projectId,
        chapter_id: chapterId,
        task_type: 'chapter-generation',
        input: {
          sessionId: `s-${kind}`,
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
        max_recovery_attempts: 1,
      })
      new ChapterVersionRepository(database).create({
        chapter_id: chapterId,
        task_id: task.id,
        content: `body-${kind}`,
        summary: `summary-${kind}`,
        fact_check: { passed: true, summary: 'ok', findings: [] },
      })
      tasks.update(task.id, {
        status: 'running',
        execution_phase: 'persisting_result',
        timeout_at: kind === 'timeout' ? '2000-01-01T00:00:00.000Z' : null,
        recovery_attempt_count: kind === 'attempts' ? 9 : 0,
        checkpoint: null,
      })
      const manager = new TaskManager({
        store: tasks,
        agentFactory: blocking.agentFactory,
        events: { publish: () => undefined },
        ownerId: `owner-${kind}`,
        runtimeSessions: new RuntimeSessionRepository(database),
        recoveryAttempts: new RecoveryAttemptRepository(database),
        resolveLlmConfig: () => {
          throw new Error('credential unavailable')
        },
        runners: {
          'chapter-generation': createChapterGenerationTaskRunner({
            service: new WorkbenchService(database).chapterGeneration,
            agentFactory: blocking.agentFactory,
          }),
        },
        recoveryLookups: {
          projectExists: () => true,
          targetExists: () => true,
          hasChapterVersionForTask: (taskId) =>
            new ChapterVersionRepository(database).getByTaskId(taskId) !== null,
          hasChapterRevisionForTask: () => false,
          credentialAvailable: () => kind !== 'credential',
        },
      })
      manager.beginRuntimeSession()
      const beforeCreates = blocking.createCount()
      const beforePrompts = blocking.promptCount()
      const scan = await manager.scanAndRecoverOnStartup()
      expect(scan.autoStarted).toBe(1)
      const finished = await manager.wait(task.id)
      expect(finished?.status).toBe('completed')
      expect(blocking.createCount()).toBe(beforeCreates)
      expect(blocking.promptCount()).toBe(beforePrompts)
      expect(
        database.prepare<{ count: number }>(
          'SELECT COUNT(*) AS count FROM chapter_versions WHERE task_id = ?',
        ).get(task.id)?.count,
      ).toBe(1)
    }
  })

  test('P1-3 final version repairs chapter state and auto-confirms without a model', async () => {
    const { projectId, outlineId, chapterId } = seedProject('final-side-effects')
    const tasks = new TaskRepository(database)
    const chapters = new ChapterRepository(database)
    const versions = new ChapterVersionRepository(database)
    const blocking = createBlockingAgent()
    const chapter = chapters.getById(chapterId)!
    const sourceContent = chapter.content
    chapters.update(chapterId, { status: 'drafting' }, chapter.version)
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
          auto_confirm: true,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const version = versions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'durable final body',
      summary: 'durable final summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
      checkpoint: {
        schema_version: 1,
        stage: 'review',
        body: version.content,
        summary: version.summary,
        fact_check_text: '',
        fact_check: version.fact_check,
        version_id: version.id,
        source_content: sourceContent,
      },
    })
    const manager = createManager({
      agentFactory: blocking.agentFactory,
      resolveLlmConfig: () => {
        throw new Error('credential unavailable')
      },
    })
    manager.beginRuntimeSession()

    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)
    const finished = await manager.wait(task.id)
    expect(finished?.status).toBe('completed')
    expect(versions.getById(version.id)?.status).toBe('approved')
    expect(chapters.getById(chapterId)).toMatchObject({
      status: 'completed',
      content: 'durable final body',
      synopsis: 'durable final summary',
      actual_words: 'durable final body'.length,
    })
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-3 review version cannot auto-confirm after a later chapter edit', async () => {
    const { projectId, outlineId, chapterId } = seedProject('review-manual-edit')
    const tasks = new TaskRepository(database)
    const chapters = new ChapterRepository(database)
    const versions = new ChapterVersionRepository(database)
    const blocking = createBlockingAgent()
    const source = chapters.getById(chapterId)!
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
          auto_confirm: true,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const version = versions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'recovered review body',
      summary: 'recovered review summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
      checkpoint: {
        schema_version: 1,
        stage: 'review',
        body: version.content,
        summary: version.summary,
        fact_check_text: '',
        fact_check: version.fact_check,
        version_id: version.id,
        source_content: source.content,
      },
    })
    chapters.update(chapterId, { content: 'manual edit after generation crash' }, source.version)

    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)
    await manager.wait(task.id)

    expect(tasks.getById(task.id)).toMatchObject({
      status: 'failed',
      recovery_classification: 'non-recoverable',
    })
    expect(versions.getById(version.id)).toMatchObject({
      status: 'review',
      is_current: false,
    })
    expect(chapters.getById(chapterId)?.content).toBe('manual edit after generation crash')
    expect(blocking.createCount()).toBe(0)
  })

  test('P1-3 auto-confirm fails closed when generation source evidence is missing', async () => {
    const { projectId, outlineId, chapterId } = seedProject('missing-generation-source')
    const tasks = new TaskRepository(database)
    const versions = new ChapterVersionRepository(database)
    const blocking = createBlockingAgent()
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
          auto_confirm: true,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const version = versions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'missing-source body',
      summary: 'missing-source summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
    })

    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)
    await manager.wait(task.id)

    expect(tasks.getById(task.id)).toMatchObject({
      status: 'failed',
      recovery_classification: 'non-recoverable',
    })
    expect(versions.getById(version.id)).toMatchObject({
      status: 'review',
      is_current: false,
    })
    expect(blocking.createCount()).toBe(0)
  })

  test('P1-3 stale approved version cannot overwrite a newer adopted chapter version', async () => {
    const { projectId, outlineId, chapterId } = seedProject('stale-approved-version')
    const workbench = new WorkbenchService(database)
    const tasks = new TaskRepository(database)
    const versions = new ChapterVersionRepository(database)
    const blocking = createBlockingAgent()
    const persistedInput = {
      sessionId: 's',
      taskType: 'chapter-generation',
      prompt: '',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
      request: {
        project_id: projectId,
        chapter_outline_id: outlineId,
        chapter_id: chapterId,
        auto_confirm: true,
      },
    }
    const staleTask = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-generation',
      input: persistedInput,
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const staleVersion = versions.create({
      chapter_id: chapterId,
      task_id: staleTask.id,
      content: 'stale approved body',
      summary: 'stale approved summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    workbench.chapterGeneration.confirmVersion(projectId, staleVersion.id)

    const newerTask = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-generation',
      input: persistedInput,
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const newerVersion = versions.create({
      chapter_id: chapterId,
      task_id: newerTask.id,
      content: 'newer adopted body',
      summary: 'newer adopted summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    workbench.chapterGeneration.confirmVersion(projectId, newerVersion.id)
    tasks.update(newerTask.id, {
      status: 'completed',
      execution_phase: 'completed',
      finished_at: new Date().toISOString(),
    })
    tasks.update(staleTask.id, {
      status: 'running',
      execution_phase: 'persisting_result',
    })
    expect(versions.getById(staleVersion.id)?.is_current).toBe(false)

    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)

    const failed = tasks.getById(staleTask.id)!
    expect(failed.status).toBe('failed')
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(new ChapterRepository(database).getById(chapterId)).toMatchObject({
      status: 'completed',
      content: 'newer adopted body',
      synopsis: 'newer adopted summary',
    })
    expect(versions.getById(newerVersion.id)?.is_current).toBe(true)
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-3 current approved version cannot overwrite later manual chapter edits', async () => {
    const { projectId, outlineId, chapterId } = seedProject('approved-manual-edit')
    const workbench = new WorkbenchService(database)
    const tasks = new TaskRepository(database)
    const chapters = new ChapterRepository(database)
    const versions = new ChapterVersionRepository(database)
    const blocking = createBlockingAgent()
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
          auto_confirm: true,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    const version = versions.create({
      chapter_id: chapterId,
      task_id: task.id,
      content: 'approved body',
      summary: 'approved summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    workbench.chapterGeneration.confirmVersion(projectId, version.id)
    const adopted = chapters.getById(chapterId)!
    chapters.update(chapterId, {
      content: 'manual edit after approval',
      synopsis: 'manual synopsis',
    }, adopted.version)
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
    })

    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()
    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(1)

    expect(tasks.getById(task.id)).toMatchObject({
      status: 'failed',
      recovery_classification: 'non-recoverable',
    })
    expect(versions.getById(version.id)).toMatchObject({
      status: 'approved',
      is_current: true,
    })
    expect(chapters.getById(chapterId)).toMatchObject({
      content: 'manual edit after approval',
      synopsis: 'manual synopsis',
    })
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-3 mismatched final entity becomes stable non-recoverable without loops', async () => {
    const { projectId, outlineId, chapterId } = seedProject('final-mismatch')
    const workbench = new WorkbenchService(database)
    const wrongChapter = workbench.chapters.create({
      project_id: projectId,
      chapter_number: 2,
      title: 'Wrong target',
      content: '',
    })
    const tasks = new TaskRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    const blocking = createBlockingAgent()
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
      chapter_id: wrongChapter.id,
      task_id: task.id,
      content: 'wrong body',
      summary: 'wrong summary',
      fact_check: { passed: true, summary: 'ok', findings: [] },
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'persisting_result',
    })
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    const first = await manager.scanAndRecoverOnStartup()
    expect(first.autoStarted).toBe(1)
    const failed = tasks.getById(task.id)!
    expect(failed.status).toBe('failed')
    expect(failed.recovery_classification).toBe('non-recoverable')
    expect(failed.recovery_action).toBe('none')
    expect(manager.classify(failed).classification).toBe('non-recoverable')
    const attemptCount = attempts.listByTask(task.id).length
    expect((await manager.scanAndRecoverOnStartup()).autoStarted).toBe(0)
    expect(attempts.listByTask(task.id)).toHaveLength(attemptCount)
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-3 completed polish checkpoint without a task-bound revision is terminal', async () => {
    const { projectId, chapterId } = seedProject('polish-missing-entity')
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
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
          auto_apply: false,
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      checkpoint_schema_version: 1,
    })
    tasks.update(task.id, {
      status: 'running',
      execution_phase: 'finalizing',
      checkpoint: {
        schema_version: 1,
        operation: 'chapter_polish',
        source_content: 'source',
        generated_content: 'generated',
        revision_id: 'missing-revision',
        status: 'completed',
        error: null,
        applied: false,
      },
    })
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    const scan = await manager.scanAndRecoverOnStartup()
    expect(scan.autoStarted).toBe(0)
    expect(tasks.getById(task.id)).toMatchObject({
      status: 'failed',
      recovery_classification: 'non-recoverable',
      recovery_action: 'none',
    })
    expect(blocking.createCount()).toBe(0)
    expect(blocking.promptCount()).toBe(0)
  })

  test('P1-5 manual retry at attempt ceiling is rejected without DB mutation', () => {
    const { projectId, outlineId } = seedProject('manual-cap')
    const tasks = new TaskRepository(database)
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
      max_recovery_attempts: 2,
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'manual-retry-required',
      recovery_action: 'manual-confirm',
      recovery_attempt_count: 2,
      finished_at: '2026-01-01T00:00:00.000Z',
    })
    const before = database
      .prepare<{ dump: string }>(
        `SELECT status || '|' || recovery_attempt_count || '|' || COALESCE(lease_token,'') || '|' ||
                COALESCE(finished_at,'') AS dump FROM tasks WHERE id = ?`,
      )
      .get(task.id)?.dump
    const manager = createManager()
    manager.beginRuntimeSession()
    expect(() => manager.manualRetry(task.id, true)).toThrow(/上限|不可重试/)
    const after = database
      .prepare<{ dump: string }>(
        `SELECT status || '|' || recovery_attempt_count || '|' || COALESCE(lease_token,'') || '|' ||
                COALESCE(finished_at,'') AS dump FROM tasks WHERE id = ?`,
      )
      .get(task.id)?.dump
    expect(after).toBe(before)
    expect(new RecoveryAttemptRepository(database).listByTask(task.id)).toHaveLength(0)
    const view = manager.listRecoverable(projectId).find((item) => item.id === task.id)
    expect(view?.manual_retry_allowed).toBe(false)
  })

  test('P1-4 unusable credential does not claim or consume an attempt, then retries after repair', async () => {
    const { projectId, outlineId } = seedProject('credential-repair')
    const tasks = new TaskRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    let credentialAvailable = false
    let runs = 0
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
      checkpoint_schema_version: 1,
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'queued',
    })
    const manager = new TaskManager({
      store: tasks,
      agentFactory: {
        create: async () => {
          throw new Error('runner should be used')
        },
      },
      events: { publish: () => undefined },
      runtimeSessions: new RuntimeSessionRepository(database),
      recoveryAttempts: attempts,
      runners: {
        'chapter-generation': {
          execute: async () => {
            runs += 1
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
      recoveryLookups: {
        projectExists: () => true,
        targetExists: () => true,
        hasChapterVersionForTask: () => false,
        hasChapterRevisionForTask: () => false,
        credentialAvailable: () => credentialAvailable,
      },
    })
    manager.beginRuntimeSession()

    const blocked = await manager.scanAndRecoverOnStartup()
    expect(blocked.autoStarted).toBe(0)
    expect(tasks.getById(task.id)?.recovery_attempt_count).toBe(0)
    expect(attempts.listByTask(task.id)).toHaveLength(0)
    expect(runs).toBe(0)

    credentialAvailable = true
    const retried = manager.manualRetry(task.id, true)
    expect(retried).not.toBeNull()
    expect((await retried!.completion).status).toBe('completed')
    expect(tasks.getById(task.id)?.recovery_attempt_count).toBe(1)
    expect(attempts.listByTask(task.id)).toHaveLength(1)
    expect(runs).toBe(1)
  })

  test('P1-6 old deadline + queued is auto scanned with refreshed timer; model_in_flight is not', async () => {
    const { projectId, outlineId } = seedProject('deadline')
    const tasks = new TaskRepository(database)
    const now = '2026-06-01T12:00:00.000Z'
    let resolveRun: (() => void) | null = null
    let ran = 0
    const manager = createManager({
      now: () => now,
      taskTimeoutMs: 30 * 60 * 1000,
      runners: {
        'chapter-generation': {
          execute: async () => {
            ran += 1
            await new Promise<void>((resolve) => {
              resolveRun = resolve
            })
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    manager.beginRuntimeSession()

    const queued = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'queued',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      execution_phase: 'queued',
    })
    tasks.update(queued.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
      timeout_at: '2020-01-01T00:00:00.000Z',
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
    })

    const inFlight = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'inflight',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(inFlight.id, {
      status: 'running',
      execution_phase: 'model_in_flight',
      timeout_at: '2020-01-01T00:00:00.000Z',
      checkpoint: { schema_version: 1, stage: 'body', body: 'partial' },
    })

    const scanPromise = manager.scanAndRecoverOnStartup()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const claimedQueued = tasks.getById(queued.id)!
    expect(claimedQueued.lease_owner).toBeTruthy()
    expect(claimedQueued.timeout_at).toBe('2026-06-01T12:30:00.000Z')
    expect(ran).toBe(1)
    resolveRun?.()
    const scan = await scanPromise
    expect(scan.autoStarted).toBe(1)
    expect(tasks.getById(inFlight.id)?.lease_owner).toBeNull()
    expect(manager.classify(tasks.getById(inFlight.id)!).autoAllowed).toBe(false)
  })

  test('P1-7 semantic-corrupt checkpoints terminate with zero model calls', async () => {
    const { projectId, outlineId, chapterId } = seedProject('corrupt-cp')
    const tasks = new TaskRepository(database)
    const blocking = createBlockingAgent()
    const manager = createManager({ agentFactory: blocking.agentFactory })
    manager.beginRuntimeSession()

    const gen = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'g',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(gen.id, {
      status: 'running',
      execution_phase: 'queued',
      checkpoint: {
        schema_version: 1,
        stage: 'body',
        body: 123,
      },
    })

    const polish = tasks.create({
      project_id: projectId,
      chapter_id: chapterId,
      task_type: 'chapter-polish',
      input: {
        sessionId: 'p',
        taskType: 'chapter-polish',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: {
          project_id: projectId,
          chapter_id: chapterId,
          mode: 'chapter',
        },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(polish.id, {
      status: 'running',
      execution_phase: 'queued',
      checkpoint: {
        schema_version: 1,
        status: 'completed',
        revision_id: 'x',
        operation: 'bad',
      },
    })

    const beforeCreate = blocking.createCount()
    const beforePrompt = blocking.promptCount()
    const scan = await manager.scanAndRecoverOnStartup()
    expect(scan.autoStarted).toBe(0)
    expect(tasks.getById(gen.id)?.recovery_classification).toBe('non-recoverable')
    expect(tasks.getById(polish.id)?.recovery_classification).toBe('non-recoverable')
    expect(blocking.createCount()).toBe(beforeCreate)
    expect(blocking.promptCount()).toBe(beforePrompt)
  })

  test('P2-1 crashed session close/reopen leaves no permanent open attempts', () => {
    const { projectId } = seedProject('crash-attempt')
    const sessions = new RuntimeSessionRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    const tasks = new TaskRepository(database)
    const crashed = sessions.start({
      owner: 'old',
      appInstanceId: 'app-old',
      startedAt: new Date().toISOString(),
    })
    const task = tasks.create({
      project_id: projectId,
      task_type: 'assistant',
      input: {
        sessionId: 's',
        taskType: 'assistant',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: {},
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
      runtime_session_id: crashed.id,
    })
    attempts.create({
      taskId: task.id,
      recoveryRootTaskId: task.id,
      attemptNumber: 1,
      kind: 'auto',
      owner: 'old',
      runtimeSessionId: crashed.id,
      leaseToken: 't',
      claimedAt: new Date().toISOString(),
    })
    expect(attempts.countOpen()).toBe(1)

    database.close()
    database = initializeDatabase(tempRoot)
    // Re-bind repositories to reopened connection
    const sessions2 = new RuntimeSessionRepository(database)
    const attempts2 = new RecoveryAttemptRepository(database)
    const manager = new TaskManager({
      store: new TaskRepository(database),
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
      runtimeSessions: sessions2,
      recoveryAttempts: attempts2,
      ownerId: 'new-owner',
    })
    manager.beginRuntimeSession()
    expect(sessions2.getById(crashed.id)?.end_reason).toBe('forced')
    expect(attempts2.countOpen()).toBe(0)
    const finished = attempts2.listByTask(task.id)
    expect(finished).toHaveLength(1)
    expect(finished[0]?.finished_at).toBeTruthy()
    expect(finished[0]?.outcome).toBe('crashed')
  })

  test('P2-1 runtime session reconciliation rolls back as one transaction', () => {
    const { projectId } = seedProject('session-atomic')
    const sessions = new RuntimeSessionRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    const tasks = new TaskRepository(database)
    const crashed = sessions.start({
      owner: 'old-owner',
      appInstanceId: 'old-app',
    })
    const task = tasks.create({
      project_id: projectId,
      task_type: 'assistant',
      input: {},
      runtime_session_id: crashed.id,
    })
    tasks.update(task.id, {
      status: 'running',
      lease_owner: 'old-owner',
      lease_token: 'old-token',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    attempts.create({
      taskId: task.id,
      recoveryRootTaskId: task.id,
      attemptNumber: 1,
      kind: 'auto',
      owner: 'old-owner',
      runtimeSessionId: crashed.id,
      leaseToken: 'old-token',
      claimedAt: new Date().toISOString(),
    })
    const manager = new TaskManager({
      store: tasks,
      agentFactory: {
        create: async () => {
          throw new Error('not used')
        },
      },
      events: { publish: () => undefined },
      runtimeSessions: sessions,
      recoveryAttempts: attempts,
      ownerId: 'new-owner',
    })

    const failureTriggers = [
      `BEFORE UPDATE ON runtime_sessions
       WHEN OLD.id = '${crashed.id}' AND NEW.end_reason = 'forced'`,
      `BEFORE UPDATE ON tasks
       WHEN OLD.id = '${task.id}' AND OLD.lease_token = 'old-token'
         AND NEW.lease_token IS NULL`,
      `BEFORE UPDATE ON recovery_attempts
       WHEN OLD.task_id = '${task.id}' AND OLD.finished_at IS NULL
         AND NEW.outcome = 'crashed'`,
      `BEFORE INSERT ON runtime_sessions
       WHEN NEW.owner = 'new-owner'`,
    ]
    for (const triggerClause of failureTriggers) {
      database.exec(
        `CREATE TRIGGER fail_runtime_reconciliation
         ${triggerClause}
         BEGIN
           SELECT RAISE(ABORT, 'injected runtime reconciliation failure');
         END`,
      )

      expect(() => manager.beginRuntimeSession())
        .toThrow(/injected runtime reconciliation failure/)
      expect(sessions.getById(crashed.id)?.ended_at).toBeNull()
      expect(sessions.listOpen().map((session) => session.id)).toEqual([crashed.id])
      expect(tasks.getById(task.id)?.lease_token).toBe('old-token')
      expect(attempts.countOpen()).toBe(1)

      database.exec('DROP TRIGGER fail_runtime_reconciliation')
    }
    manager.beginRuntimeSession()
    expect(sessions.getById(crashed.id)?.end_reason).toBe('forced')
    expect(tasks.getById(task.id)?.lease_token).toBeNull()
    expect(attempts.countOpen()).toBe(0)
  })

  test('P2-1 graceful session remains open on timeout and ends only after drain', async () => {
    const { projectId, outlineId } = seedProject('session-drain')
    const tasks = new TaskRepository(database)
    const attempts = new RecoveryAttemptRepository(database)
    let releaseRunner: (() => void) | null = null
    const manager = createManager({
      runners: {
        'chapter-generation': {
          execute: async () => {
            await new Promise<void>((resolve) => {
              releaseRunner = resolve
            })
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    const runtime = manager.beginRuntimeSession()!
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
      runtime_session_id: runtime.id,
    })
    tasks.update(task.id, {
      status: 'failed',
      execution_phase: 'model_in_flight',
      recovery_classification: 'manual-retry-required',
      recovery_action: 'manual-confirm',
    })
    const handle = manager.manualRetry(task.id, true)!
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect((await manager.quiesceForShutdown(20)).drained).toBe(false)
    expect(new RuntimeSessionRepository(database).getById(runtime.id)?.ended_at).toBeNull()
    expect(attempts.countOpen()).toBe(1)

    releaseRunner?.()
    await handle.completion
    expect((await manager.quiesceForShutdown(1_000)).drained).toBe(true)
    expect(new RuntimeSessionRepository(database).getById(runtime.id)?.end_reason).toBe('graceful')
    expect(attempts.countOpen()).toBe(0)
  })

  test('P2-3 recovery UI excludes active current-session tasks and shows crash candidates', async () => {
    const { projectId, outlineId } = seedProject('ui-filter')
    const tasks = new TaskRepository(database)
    let resolveRun: (() => void) | null = null
    const manager = createManager({
      runners: {
        assistant: {
          execute: async () => {
            await new Promise<void>((resolve) => {
              resolveRun = resolve
            })
            return { status: 'completed', result: { ok: true } }
          },
        },
      },
    })
    manager.beginRuntimeSession()
    const active = manager.start({
      projectId,
      sessionId: 'active',
      taskType: 'assistant',
      prompt: 'live',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    // Force model_in_flight on active task while still owned by this manager.
    const token = tasks.getById(active.taskId)?.lease_token
    if (token) {
      tasks.updateOwned(active.taskId, { owner: 'owner-a', leaseToken: token }, {
        execution_phase: 'model_in_flight',
      })
    }

    const crashed = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'crash',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(crashed.id, {
      status: 'failed',
      execution_phase: 'queued',
      recovery_classification: 'restartable',
      lease_owner: null,
      lease_token: null,
      lease_expires_at: null,
      shutdown_kind: 'crash',
    })

    const foreign = tasks.create({
      project_id: projectId,
      task_type: 'chapter-generation',
      input: {
        sessionId: 'foreign',
        taskType: 'chapter-generation',
        prompt: '',
        llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
        request: { project_id: projectId, chapter_outline_id: outlineId },
      },
      recovery_metadata_version: RECOVERY_METADATA_VERSION,
    })
    tasks.update(foreign.id, {
      status: 'running',
      execution_phase: 'queued',
      lease_owner: 'other-owner',
      lease_token: 'other-token',
      lease_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })

    const views = manager.listRecoverable(projectId)
    expect(views.some((item) => item.id === active.taskId)).toBe(false)
    expect(views.some((item) => item.id === crashed.id)).toBe(true)
    expect(views.some((item) => item.id === foreign.id)).toBe(false)

    tasks.update(foreign.id, {
      lease_expires_at: '2000-01-01T00:00:00.000Z',
    })
    expect(manager.listRecoverable(projectId).some((item) => item.id === foreign.id)).toBe(true)

    resolveRun?.()
    await active.completion
  })
})
