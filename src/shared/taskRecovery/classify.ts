import type { JsonObject, JsonValue } from '../novelProject'
import {
  CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
  CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
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

function checkpointSchemaVersion(
  checkpoint: JsonObject | null,
  taskLevelVersion: number | null,
): number | null {
  if (checkpoint && typeof checkpoint.schema_version === 'number') {
    return checkpoint.schema_version
  }
  return taskLevelVersion
}

function generationStage(checkpoint: JsonObject | null): string | null {
  if (!checkpoint) return null
  const stage = checkpoint.stage
  return typeof stage === 'string' ? stage : null
}

function polishStatus(checkpoint: JsonObject | null): string | null {
  if (!checkpoint) return null
  const status = checkpoint.status
  return typeof status === 'string' ? status : null
}

function classifyChapterGeneration(input: ClassifyTaskInput): RecoveryDecision {
  const schemaVersion = checkpointSchemaVersion(
    input.checkpoint,
    input.checkpoint_schema_version,
  )
  if (input.checkpoint !== null) {
    if (schemaVersion === null) {
      return nonRecoverable('章节生成检查点缺少 schema version，已拒绝自动恢复。')
    }
    if (schemaVersion < CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION) {
      return nonRecoverable(
        `章节生成检查点 schema 过旧（${schemaVersion}），已拒绝自动恢复。`,
      )
    }
    if (schemaVersion > CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION) {
      return nonRecoverable(
        `章节生成检查点 schema 来自未来版本（${schemaVersion}），已拒绝自动恢复。`,
      )
    }
  }

  if (input.hasChapterVersionForTask) {
    return resumable('章节版本已按 task_id 持久化，可安全收尾而无需重放模型请求。')
  }

  const stage = generationStage(input.checkpoint)
  if (stage === 'review' && typeof input.checkpoint?.version_id === 'string') {
    return resumable('检查点已进入 review 且包含 version_id，可幂等收尾。')
  }

  if (
    stage === 'saving'
    && readString(input.checkpoint?.body).trim() !== ''
    && readString(input.checkpoint?.summary).trim() !== ''
  ) {
    return resumable('正文与摘要已就绪，可幂等写入章节版本而无需重放模型请求。')
  }

  if (
    input.execution_phase === 'queued'
    || input.execution_phase === 'preparing'
  ) {
    const body = readString(input.checkpoint?.body)
    if (!input.checkpoint || body.trim() === '') {
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
  const schemaVersion = checkpointSchemaVersion(
    input.checkpoint,
    input.checkpoint_schema_version,
  )
  if (input.checkpoint !== null) {
    if (schemaVersion === null) {
      return nonRecoverable('章节润色检查点缺少 schema version，已拒绝自动恢复。')
    }
    if (schemaVersion < CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION) {
      return nonRecoverable(
        `章节润色检查点 schema 过旧（${schemaVersion}），已拒绝自动恢复。`,
      )
    }
    if (schemaVersion > CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION) {
      return nonRecoverable(
        `章节润色检查点 schema 来自未来版本（${schemaVersion}），已拒绝自动恢复。`,
      )
    }
  }

  if (input.hasChapterRevisionForTask) {
    return resumable('修订结果已按 task_id 持久化，可安全收尾（含幂等 auto_apply）。')
  }

  const status = polishStatus(input.checkpoint)
  if (status === 'completed' && typeof input.checkpoint?.revision_id === 'string') {
    return resumable('检查点已完成并包含 revision_id，可幂等收尾。')
  }

  if (
    input.execution_phase === 'queued'
    || input.execution_phase === 'preparing'
  ) {
    if (!input.checkpoint || polishStatus(input.checkpoint) === null) {
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

  if (input.timeout_at && input.timeout_at <= input.nowIso) {
    return manualRequired('任务已超过执行期限，需要人工确认后重试。')
  }

  if (input.recovery_attempt_count >= input.max_recovery_attempts) {
    return manualRequired(
      `恢复尝试次数已达上限（${input.max_recovery_attempts}），停止自动恢复以免启动循环。`,
    )
  }

  if (input.recovery_metadata_version < RECOVERY_METADATA_VERSION) {
    return manualRequired(
      '旧任务缺少 Phase D 恢复元数据，默认 fail closed，禁止批量自动重放。',
    )
  }

  if (input.shutdown_kind === 'graceful') {
    // Graceful stop is never treated as a crash-safe automatic model replay.
    // Only pure side-effect-free finishing of already-persisted results is allowed.
    if (input.hasChapterVersionForTask || input.hasChapterRevisionForTask) {
      return resumable('优雅退出前结果已持久化，可安全收尾。')
    }
    return manualRequired(
      '任务在优雅退出中停止，不得误判为崩溃后的安全自动 resume。',
    )
  }

  if (!input.credentialAvailable) {
    return manualRequired(
      '当前项目凭据不可用或已重新绑定后无法解析，请修复凭据后再人工重试。',
      true,
    )
  }

  switch (input.task_type) {
    case 'chapter-generation':
      return classifyChapterGeneration(input)
    case 'chapter-polish':
      return classifyChapterPolish(input)
    case 'assistant':
      return unsupportedTaskType('assistant')
    case 'outline-generation':
      return nonRecoverable('大纲生成当前没有持久化 runner，不可自动恢复。')
    case 'memory-extraction':
      return nonRecoverable('叙事记忆提取是直接 service/IPC 流程，不是可恢复任务。')
    case 'foreshadow-suggestion':
      return nonRecoverable('伏笔建议是直接 service/IPC 流程，不是可恢复任务。')
    default:
      return unsupportedTaskType(input.task_type)
  }
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
