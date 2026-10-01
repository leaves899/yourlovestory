import { describe, expect, test } from '@jest/globals'
import { compileTraceToJson } from '@/shared/chapterGeneration'
import { compileContext, CONTEXT_PROMPT_VERSION, type ContextCompilerInput } from '@/shared/contextCompiler'
import { parseOutlineCheckpoint, type OutlineCheckpoint } from '@/shared/outlineGeneration'
import type { JsonObject } from '@/shared/novelProject'
import { classifyTaskRecovery, RECOVERY_METADATA_VERSION } from '@/shared/taskRecovery'
import type { ClassifyTaskInput } from '@/shared/taskRecovery/classify'

const projectId = 'project-outline-recovery'
const outlineId = 'volume-outline-recovery'
const proposal = {
  summary: '卷纲提案', theme: '选择', main_conflict: '目标冲突',
  key_turning_points: ['发现问题'], ending: '形成共同目标',
}
const params = { model: 'test-model', temperature: 0.4, max_output_tokens: 1_000, context_budget: 48_000 }

function checkpoint(stage: OutlineCheckpoint['stage'] = 'ready'): OutlineCheckpoint {
  const input: ContextCompilerInput = {
    task_kind: 'outline',
    project: { id: projectId, name: '恢复项目', genre: '故事', tone: '克制', target_words: 20_000 },
    volume: { id: 'volume-1', title: '第一卷', synopsis: '起点', volume_number: 1 },
    volume_outline: { id: outlineId, summary: '原卷纲', theme: '', main_conflict: '', ending: '', key_turning_points: [] },
    budget: { total: 48_000, max_output_tokens: 1_000, system_reserved_tokens: 300 },
    model_params: params,
    debug: false,
  }
  const compiled = compileContext(input)
  const base = {
    schema_version: 1 as const, project_id: projectId, outline_id: outlineId,
    source_snapshot: JSON.stringify({ prompt_version: CONTEXT_PROMPT_VERSION, input,
      target: { id: outlineId, version: 1, status: 'draft' }, project_version: 1, config_version: 1, volume_version: 1 }),
    stage_compiles: { outline: { prompt_version: CONTEXT_PROMPT_VERSION,
      model_params: params, trace: compileTraceToJson(compiled.trace) } },
  }
  if (stage === 'applied') return { ...base, stage, proposal, applied_version: 2 }
  return { ...base, stage, proposal: stage === 'ready' ? proposal : null }
}

function input(overrides: Partial<ClassifyTaskInput> = {}): ClassifyTaskInput {
  return {
    id: 'outline-task', project_id: projectId, chapter_id: null, task_type: 'outline-generation',
    status: 'running', stage: 'outline', progress: 0.2,
    input: { sessionId: 'session', taskType: 'outline-generation', prompt: '',
      llm: { baseUrl: 'https://example.invalid/v1', model: params.model },
      request: { project_id: projectId, outline_id: outlineId, debug: false } },
    checkpoint: null, result: null, error_message: null, cancel_requested: false,
    execution_phase: 'queued', recovery_attempt_count: 0, max_recovery_attempts: 3,
    recovery_metadata_version: RECOVERY_METADATA_VERSION, checkpoint_schema_version: 1,
    shutdown_kind: 'crash', timeout_at: null, nowIso: '2026-10-01T00:00:00.000Z',
    projectExists: true, targetExists: true, hasChapterVersionForTask: false,
    hasChapterRevisionForTask: false, credentialAvailable: true, recoveryGateOpen: true,
    ...overrides,
  }
}

describe('outline recovery safety classification', () => {
  test.each(['queued', 'preparing'] as const)('pre-model %s is restartable with the complete request', (phase) => {
    const decision = classifyTaskRecovery(input({ execution_phase: phase }))
    expect(decision).toEqual(expect.objectContaining({ classification: 'restartable',
      action: 'auto-restart', autoAllowed: true }))
  })

  test('a persisted prepared compile is restartable only before the model window', () => {
    expect(parseOutlineCheckpoint(checkpoint('prepared'))).not.toBeNull()
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint('prepared'), execution_phase: 'preparing' }))
    expect(decision.classification).toBe('restartable')
  })

  test.each(['awaiting_model', 'model_in_flight'] as const)('uncertain %s never automatically replays a model request', (phase) => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint('model'), execution_phase: phase,
      timeout_at: '2000-01-01T00:00:00.000Z' }))
    expect(decision).toEqual(expect.objectContaining({ classification: 'manual-retry-required',
      action: 'manual-confirm', autoAllowed: false, manualRetryAllowed: true }))
  })

  test('a persisted model stage stays manual even if its phase was accidentally set to preparing', () => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint('model'), execution_phase: 'preparing' }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.classification).toBe('manual-retry-required')
  })

  test.each(['ready', 'applied'] as const)('%s safely resumes without credentials despite an old deadline', (stage) => {
    const saved = checkpoint(stage)
    expect(parseOutlineCheckpoint(saved)).not.toBeNull()
    const decision = classifyTaskRecovery(input({ checkpoint: saved, execution_phase: 'persisting_result',
      credentialAvailable: false, timeout_at: '2000-01-01T00:00:00.000Z' }))
    expect(decision).toEqual(expect.objectContaining({ classification: 'resumable',
      action: 'auto-resume', autoAllowed: true }))
  })

  test('pre-model restart requires a resolvable current project credential', () => {
    const decision = classifyTaskRecovery(input({ credentialAvailable: false }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.classification).toBe('manual-retry-required')
  })

  const invalidRequests: JsonObject[] = [
    { project_id: projectId },
    { outline_id: outlineId },
    { project_id: 'other-project', outline_id: outlineId },
  ]
  test.each(invalidRequests)('an incomplete or cross-project persisted request fails closed (%j)', (request) => {
    const decision = classifyTaskRecovery(input({ input: { request } }))
    expect(decision.classification).toBe('non-recoverable')
    expect(decision.autoAllowed).toBe(false)
  })

  test('a valid checkpoint cannot override a different persisted outline target', () => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint(),
      input: { request: { project_id: projectId, outline_id: 'other-outline' } } }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test.each(['projectExists', 'targetExists', 'recoveryGateOpen'] as const)('missing %s prevents ready recovery', (field) => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint(), [field]: false }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test.each([
    { checkpoint_schema_version: null },
    { checkpoint_schema_version: 2 },
    { recovery_metadata_version: RECOVERY_METADATA_VERSION + 1 },
  ])('future or missing schema metadata fails closed (%j)', (overrides) => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint(), ...overrides }))
    expect(decision.classification).toBe('non-recoverable')
  })

  test.each(['bad snapshot', 'bad compiler metadata', 'incomplete proposal', 'forged applied version'])('semantic corruption fails closed: %s', (kind) => {
    const saved: JsonObject = { ...checkpoint(kind === 'forged applied version' ? 'applied' : 'ready') }
    if (kind === 'bad snapshot') saved.source_snapshot = '{broken'
    if (kind === 'bad compiler metadata') saved.stage_compiles = { outline: { prompt_version: 'broken' } }
    if (kind === 'incomplete proposal') saved.proposal = { summary: 'incomplete' }
    if (kind === 'forged applied version') saved.applied_version = 99
    expect(parseOutlineCheckpoint(saved)).toBeNull()
    expect(classifyTaskRecovery(input({ checkpoint: saved })).classification).toBe('non-recoverable')
  })

  test('cancellation still requires explicit human retry even with a complete result', () => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint(), cancel_requested: true }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.classification).toBe('manual-retry-required')
  })

  test('graceful exit is not misclassified as a crash restart', () => {
    const decision = classifyTaskRecovery(input({ shutdown_kind: 'graceful', checkpoint: checkpoint('prepared') }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.classification).toBe('manual-retry-required')
  })

  test('completed outline tasks never replay or resume', () => {
    const decision = classifyTaskRecovery(input({ status: 'completed', checkpoint: checkpoint('applied') }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(false)
  })

  test('automatic or manual model retries cannot bypass the recovery attempt ceiling', () => {
    const decision = classifyTaskRecovery(input({ checkpoint: checkpoint('model'),
      execution_phase: 'model_in_flight', recovery_attempt_count: 3 }))
    expect(decision.autoAllowed).toBe(false)
    expect(decision.manualRetryAllowed).toBe(false)
  })
})
