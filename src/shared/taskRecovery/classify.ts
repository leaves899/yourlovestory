import type { JsonObject, JsonValue } from '../novelProject'
import {
  parseStrictGenerationCheckpoint,
  parseStrictPolishCheckpoint,
} from './checkpoints'
import {
  RECOVERY_METADATA_VERSION,
  type ExecutionPhase,
  type RecoveryDecision,
  type ShutdownKind,
  type TaskRuntimeStatus,
} from './types'

export interface ClassifyTaskInput {
  id: string
  project_id: string
  chapter_id: string | null
  task_type: string
  status: TaskRuntimeStatus
  stage: string
  progress: number
  input: JsonObject
  checkpoint: JsonObject | null
  result: JsonObject | null
  error_message: string | null
  cancel_requested: boolean
  execution_phase: ExecutionPhase
  recovery_attempt_count: number
  max_recovery_attempts: number
  recovery_metadata_version: number
  checkpoint_schema_version: number | null
  shutdown_kind: ShutdownKind | null
  timeout_at: string | null
  nowIso: string
  /** Whether the target project still exists. */
  projectExists: boolean
  /** Whether required target entities still exist (chapter/outline/revision). */
  targetExists: boolean
  /** Whether a chapter version already exists for this task id. */
  hasChapterVersionForTask: boolean
  /** Whether a chapter revision already exists for this task id. */
  hasChapterRevisionForTask: boolean
  /** Whether credential can be resolved from current project config. */
  credentialAvailable: boolean
  /** Whether recovery gate allows any recovery (db ready, not quitting). */
  recoveryGateOpen: boolean
}

function isRecord(value: JsonValue | undefined | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function decision(
  classification: RecoveryDecision['classification'],
  reason: string,
  action: RecoveryDecision['action'],
  autoAllowed: boolean,
  manualRetryAllowed: boolean,
): RecoveryDecision {
  return { classification, reason, action, autoAllowed, manualRetryAllowed }
}

function unsupportedTaskType(taskType: string): RecoveryDecision {
  return decision(
    'manual-retry-required',
    `任务类型 ${taskType} 没有安全的自动恢复契约，需要人工确认后重试。`,
    'manual-confirm',
    false,
    true,
  )
}

function nonRecoverable(reason: string): RecoveryDecision {
  return decision('non-recoverable', reason, 'none', false, false)
}

function manualRequired(reason: string, allowRetry = true): RecoveryDecision {
  return decision(
    'manual-retry-required',
    reason,
    allowRetry ? 'manual-confirm' : 'none',
    false,
    allowRetry,
  )
}

function resumable(reason: string): RecoveryDecision {
  return decision('resumable', reason, 'auto-resume', true, true)
}

function restartable(reason: string): RecoveryDecision {
  return decision('restartable', reason, 'auto-restart', true, true)
}

function corruptCheckpoint(kind: string): RecoveryDecision {
  return nonRecoverable(`${kind}检查点语义损坏或字段不合法，已拒绝自动恢复。`)
}

/**
 * Final durable entities finish without model calls. Priority path after ownership
 * of project/target is confirmed: not blocked by credential, old deadline, or attempt cap.
 */
function classifyFinalEntity(input: ClassifyTaskInput): RecoveryDecision | null {
  if (input.task_type === 'chapter-generation' && input.hasChapterVersionForTask) {
    return resumable('章节版本已按 task_id 持久化，可安全收尾而无需重放模型请求。')
  }
  if (input.task_type === 'chapter-polish' && input.hasChapterRevisionForTask) {
    return resumable('修订结果已按 task_id 持久化，可安全收尾（含幂等 auto_apply）。')
  }
  return null
}

function classifyChapterGeneration(input: ClassifyTaskInput): RecoveryDecision {
  if (input.checkpoint !== null) {
    const parsed = parseStrictGenerationCheckpoint(input.checkpoint)
    if (!parsed) {
      return corruptCheckpoint('章节生成')
    }
  }

  const finalEntity = classifyFinalEntity(input)
  if (finalEntity) return finalEntity

  const parsed = input.checkpoint ? parseStrictGenerationCheckpoint(input.checkpoint) : null
  const stage = parsed?.stage ?? null

  if (stage === 'review' && typeof parsed?.version_id === 'string' && parsed.version_id.trim() !== '') {
    return resumable('检查点已进入 review 且包含 version_id，可幂等收尾。')
  }

  if (
    stage === 'saving'
    && readString(parsed?.body).trim() !== ''
    && readString(parsed?.summary).trim() !== ''
  ) {
    return resumable('正文与摘要已就绪，可幂等写入章节版本而无需重放模型请求。')
  }

  if (
    input.execution_phase === 'queued'
    || input.execution_phase === 'preparing'
  ) {
    const body = readString(parsed?.body)
    if (!parsed || body.trim() === '') {
      return restartable('模型调用尚未开始，可用稳定幂等键安全从头重启。')
    }
  }

  if (
    input.execution_phase === 'model_in_flight'
    || input.execution_phase === 'awaiting_model'
    || stage === 'body'
    || stage === 'summary'
    || stage === 'fact_check'
  ) {
    return manualRequired(
      '模型请求处于不确定窗口（请求中或结果未确认持久化），禁止自动重放以免重复计费或副作用。',
    )
  }

  if (input.execution_phase === 'persisting_result') {
    return manualRequired(
      '结果持久化过程中断，外部副作用状态不确定，需要人工确认后重试。',
    )
  }

  return manualRequired('章节生成任务缺少可证明安全的检查点，需要人工确认。')
}

function classifyChapterPolish(input: ClassifyTaskInput): RecoveryDecision {
  if (input.checkpoint !== null) {
    const parsed = parseStrictPolishCheckpoint(input.checkpoint)
    if (!parsed) {
      return corruptCheckpoint('章节润色')
    }
  }

  const finalEntity = classifyFinalEntity(input)
  if (finalEntity) return finalEntity

  const parsed = input.checkpoint ? parseStrictPolishCheckpoint(input.checkpoint) : null
  const status = parsed?.status ?? null

  if (status === 'completed' && typeof parsed?.revision_id === 'string' && parsed.revision_id.trim() !== '') {
    return resumable('检查点已完成并包含 revision_id，可幂等收尾。')
  }

  if (
    input.execution_phase === 'queued'
    || input.execution_phase === 'preparing'
  ) {
    if (!parsed || status === null) {
      return restartable('润色模型调用尚未开始，可用稳定幂等键安全从头重启。')
    }
  }

  if (
    input.execution_phase === 'model_in_flight'
    || input.execution_phase === 'awaiting_model'
    || status === 'running'
  ) {
    return manualRequired(
      '润色模型请求处于不确定窗口，禁止自动重放，避免重复 revision/report 或 auto_apply。',
    )
  }

  if (input.execution_phase === 'persisting_result') {
    return manualRequired(
      '润色结果持久化中断，副作用状态不确定，需要人工确认。',
    )
  }

  return manualRequired('章节润色任务缺少可证明安全的检查点，需要人工确认。')
}

/**
 * Pure recovery classifier. Safe to unit-test without SQLite or Electron.
 */
export function classifyTaskRecovery(input: ClassifyTaskInput): RecoveryDecision {
  if (!input.recoveryGateOpen) {
    return nonRecoverable('恢复门禁未打开（数据库未就绪、凭据迁移未完成或应用正在退出）。')
  }

  if (input.status === 'completed') {
    return decision('non-recoverable', '任务已完成，无需恢复。', 'none', false, false)
  }

  if (input.cancel_requested || input.status === 'cancelled') {
    return manualRequired('任务已取消，禁止自动恢复；如需继续请人工确认后重试。')
  }

  if (!input.projectExists) {
    return nonRecoverable('所属项目已删除，任务不可恢复。')
  }

  if (!input.targetExists) {
    return nonRecoverable('目标章节、大纲或源修订已删除，任务不可恢复。')
  }

  // Zero-model final-entity finish: not blocked by credential, deadline, or attempt cap.
  const finalEntity = classifyFinalEntity(input)
  if (finalEntity) return finalEntity

  if (input.recovery_attempt_count >= input.max_recovery_attempts) {
    return manualRequired(
      `恢复尝试次数已达上限（${input.max_recovery_attempts}），停止自动与人工重试以免启动循环。`,
      false,
    )
  }

  if (input.recovery_metadata_version < RECOVERY_METADATA_VERSION) {
    return manualRequired(
      '旧任务缺少 Phase D 恢复元数据，默认 fail closed，禁止批量自动重放。',
    )
  }

  if (input.shutdown_kind === 'graceful') {
    return manualRequired(
      '任务在优雅退出中停止，不得误判为崩溃后的安全自动 resume。',
    )
  }

  // Type-specific classification first so queued/preparing and strict checkpoint
  // semantics are not demoted solely by a stale pre-crash deadline.
  let typed: RecoveryDecision
  switch (input.task_type) {
    case 'chapter-generation':
      typed = classifyChapterGeneration(input)
      break
    case 'chapter-polish':
      typed = classifyChapterPolish(input)
      break
    case 'assistant':
      typed = unsupportedTaskType('assistant')
      break
    case 'outline-generation':
      typed = nonRecoverable('大纲生成当前没有持久化 runner，不可自动恢复。')
      break
    case 'memory-extraction':
      typed = nonRecoverable('叙事记忆提取是直接 service/IPC 流程，不是可恢复任务。')
      break
    case 'foreshadow-suggestion':
      typed = nonRecoverable('伏笔建议是直接 service/IPC 流程，不是可恢复任务。')
      break
    default:
      typed = unsupportedTaskType(input.task_type)
      break
  }

  // Uncertain model windows stay manual even if the old deadline expired.
  // Proven restartable/resumable paths keep auto allowance; claim refreshes deadline.
  if (
    typed.autoAllowed
    && input.timeout_at
    && input.timeout_at <= input.nowIso
    && typed.action !== 'auto-restart'
    && typed.action !== 'auto-resume'
  ) {
    return manualRequired('任务已超过执行期限，需要人工确认后重试。')
  }

  // Credential only required when we might call the model again.
  if (typed.autoAllowed && typed.action === 'auto-restart' && !input.credentialAvailable) {
    return manualRequired(
      '当前项目凭据不可用或已重新绑定后无法解析，请修复凭据后再人工重试。',
      true,
    )
  }
  if (!typed.autoAllowed && typed.manualRetryAllowed && !input.credentialAvailable) {
    // Keep manual classification; reason can note credentials when already manual.
    return typed
  }
  if (typed.autoAllowed && typed.action === 'auto-resume') {
    // Zero-model resume paths do not require credentials.
    return typed
  }
  if (typed.autoAllowed && !input.credentialAvailable) {
    return manualRequired(
      '当前项目凭据不可用或已重新绑定后无法解析，请修复凭据后再人工重试。',
      true,
    )
  }

  return typed
}

export function buildIdempotencyKey(
  taskType: string,
  projectId: string,
  logicalTarget: string,
  rootTaskId: string,
): string {
  return `${taskType}:${projectId}:${logicalTarget}:${rootTaskId}`
}

export function readRequestField(
  input: JsonObject,
  field: string,
): string | null {
  const request = input.request
  if (!isRecord(request)) return null
  const value = request[field]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}
