import { classifyTaskRecovery, RECOVERY_METADATA_VERSION } from '@/shared/taskRecovery'
import type { ClassifyTaskInput } from '@/shared/taskRecovery/classify'

function base(overrides: Partial<ClassifyTaskInput> = {}): ClassifyTaskInput {
  return {
    id: 'task-1',
    project_id: 'project-1',
    chapter_id: 'chapter-1',
    task_type: 'chapter-generation',
    status: 'running',
    stage: 'body',
    progress: 0.1,
    input: {
      sessionId: 's',
      taskType: 'chapter-generation',
      prompt: '',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'm' },
      request: { project_id: 'project-1', chapter_outline_id: 'outline-1' },
    },
    checkpoint: null,
    result: null,
    error_message: null,
    cancel_requested: false,
    execution_phase: 'queued',
    recovery_attempt_count: 0,
    max_recovery_attempts: 3,
    recovery_metadata_version: RECOVERY_METADATA_VERSION,
    checkpoint_schema_version: 1,
    shutdown_kind: null,
    timeout_at: null,
    nowIso: '2026-01-01T00:00:00.000Z',
    projectExists: true,
    targetExists: true,
    hasChapterVersionForTask: false,
    hasChapterRevisionForTask: false,
    credentialAvailable: true,
    recoveryGateOpen: true,
    ...overrides,
  }
}

describe('classifyTaskRecovery', () => {
  test('marks pre-model queued generation as restartable', () => {
    const decision = classifyTaskRecovery(base({ execution_phase: 'queued', checkpoint: null }))
    expect(decision.classification).toBe('restartable')
    expect(decision.autoAllowed).toBe(true)
  })

  test('marks model-in-flight generation as manual-retry-required', () => {
    const decision = classifyTaskRecovery(base({
      execution_phase: 'model_in_flight',
      checkpoint: { schema_version: 1, stage: 'body', body: 'partial' },
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(true)
  })

  test('marks version-already-persisted as resumable', () => {
    const decision = classifyTaskRecovery(base({
      hasChapterVersionForTask: true,
      execution_phase: 'persisting_result',
    }))
    expect(decision.classification).toBe('resumable')
    expect(decision.autoAllowed).toBe(true)
  })

  test('fails closed on corrupt / missing checkpoint schema version', () => {
    const decision = classifyTaskRecovery(base({
      checkpoint: { stage: 'body', body: 'x' },
      checkpoint_schema_version: null,
    }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test('task-level checkpoint schema cannot legitimize missing embedded schema', () => {
    const decision = classifyTaskRecovery(base({
      checkpoint: { stage: 'body', body: 'x' },
      checkpoint_schema_version: 1,
    }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test('fails closed on future checkpoint schema version', () => {
    const decision = classifyTaskRecovery(base({
      checkpoint: { schema_version: 99, stage: 'body', body: 'x' },
    }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test('legacy tasks without recovery metadata require manual retry', () => {
    const decision = classifyTaskRecovery(base({ recovery_metadata_version: 0 }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
  })

  test('future recovery metadata fails closed as non-recoverable', () => {
    const decision = classifyTaskRecovery(base({
      recovery_metadata_version: RECOVERY_METADATA_VERSION + 1,
    }))
    expect(decision.classification).toBe('non-recoverable')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(false)
  })

  test('task-level and embedded checkpoint schemas must match the current type', () => {
    const missingTaskLevel = classifyTaskRecovery(base({
      checkpoint: { schema_version: 1, stage: 'body', body: 'x' },
      checkpoint_schema_version: null,
    }))
    const mismatched = classifyTaskRecovery(base({
      checkpoint: { schema_version: 1, stage: 'body', body: 'x' },
      checkpoint_schema_version: 2,
    }))
    expect(missingTaskLevel.classification).toBe('non-recoverable')
    expect(mismatched.classification).toBe('non-recoverable')
  })

  test('graceful shutdown is not treated as safe auto resume without persisted result', () => {
    const decision = classifyTaskRecovery(base({
      shutdown_kind: 'graceful',
      execution_phase: 'model_in_flight',
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
  })

  test('cancelled tasks are not auto-recoverable but allow manual retry', () => {
    const decision = classifyTaskRecovery(base({
      status: 'cancelled',
      cancel_requested: true,
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(true)
  })

  test('deleted project is non-recoverable', () => {
    const decision = classifyTaskRecovery(base({ projectExists: false }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test('assistant tasks cannot be recovered from minimized empty prompts', () => {
    const decision = classifyTaskRecovery(base({ task_type: 'assistant' }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.classification).toBe('non-recoverable')
    expect(decision.manualRetryAllowed).toBe(false)
  })

  test('cancelled assistant and unknown tasks still cannot be manually replayed', () => {
    const cancelledAssistant = classifyTaskRecovery(base({
      task_type: 'assistant',
      status: 'cancelled',
      cancel_requested: true,
    }))
    const unknown = classifyTaskRecovery(base({ task_type: 'future-task' }))
    expect(cancelledAssistant.manualRetryAllowed).toBe(false)
    expect(cancelledAssistant.classification).toBe('non-recoverable')
    expect(unknown.manualRetryAllowed).toBe(false)
    expect(unknown.classification).toBe('non-recoverable')
  })

  test('attempt limit blocks automatic and manual recovery', () => {
    const decision = classifyTaskRecovery(base({
      recovery_attempt_count: 3,
      max_recovery_attempts: 3,
      execution_phase: 'queued',
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(false)
  })

  test('final entity is resumable despite missing credential, expired deadline, and attempt cap', () => {
    const decision = classifyTaskRecovery(base({
      hasChapterVersionForTask: true,
      credentialAvailable: false,
      timeout_at: '2020-01-01T00:00:00.000Z',
      recovery_attempt_count: 99,
      max_recovery_attempts: 3,
      execution_phase: 'persisting_result',
    }))
    expect(decision.classification).toBe('resumable')
    expect(decision.autoAllowed).toBe(true)
  })

  test('legacy final entities still require manual review before recovery', () => {
    const decision = classifyTaskRecovery(base({
      hasChapterVersionForTask: true,
      recovery_metadata_version: 0,
      credentialAvailable: false,
      execution_phase: 'persisting_result',
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(true)
  })

  test('future metadata cannot be bypassed by a durable final entity', () => {
    const decision = classifyTaskRecovery(base({
      hasChapterVersionForTask: true,
      recovery_metadata_version: RECOVERY_METADATA_VERSION + 1,
      execution_phase: 'persisting_result',
    }))
    expect(decision.classification).toBe('non-recoverable')
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(false)
  })

  test('old deadline does not demote queued restartable generation', () => {
    const decision = classifyTaskRecovery(base({
      execution_phase: 'queued',
      checkpoint: null,
      timeout_at: '2020-01-01T00:00:00.000Z',
    }))
    expect(decision.classification).toBe('restartable')
    expect(decision.autoAllowed).toBe(true)
  })

  test('model_in_flight stays manual even with expired deadline', () => {
    const decision = classifyTaskRecovery(base({
      execution_phase: 'model_in_flight',
      checkpoint: { schema_version: 1, stage: 'body', body: 'partial' },
      timeout_at: '2020-01-01T00:00:00.000Z',
    }))
    expect(decision.classification).toBe('manual-retry-required')
    expect(decision.autoAllowed).toBe(false)
  })

  test('semantically corrupt polish checkpoint is non-recoverable', () => {
    const decision = classifyTaskRecovery(base({
      task_type: 'chapter-polish',
      checkpoint: {
        schema_version: 1,
        status: 'completed',
        revision_id: 'x',
        operation: 'bad',
      },
    }))
    expect(decision.classification).toBe('non-recoverable')
    expect(decision.autoAllowed).toBe(false)
  })

  test('semantically corrupt generation checkpoint is non-recoverable', () => {
    const decision = classifyTaskRecovery(base({
      checkpoint: {
        schema_version: 1,
        stage: 'not-a-stage',
        body: 'x',
      },
    }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test('recovery gate closed blocks recovery', () => {
    const decision = classifyTaskRecovery(base({ recoveryGateOpen: false }))
    expect(decision.classification).toBe('non-recoverable')
  })
})
