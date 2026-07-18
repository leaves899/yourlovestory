/**
 * 碎片状态机（TS 等价实现，取代 src/scripts/fragment/state_machine.py）。
 *
 * 状态转换规则：
 * - 进行中 → 已完成（用户触发写作）
 * - 未完成 → 已过期（超过 7 天自动转换）
 * - 已完成 → 不可逆
 */
import { getCurrentDate, getCurrentDatetime, calculateDaysBetween, ARCHIVE_DAYS } from './utils'
import type { FragmentDay, FragmentStatus, EditState } from './models'

// ============================================================
// 状态判断
// ============================================================

/** 根据日期和完成状态判断当前状态 */
export function getStatus(
  date: string,
  completed: boolean,
  currentDate?: string | null
): FragmentStatus {
  if (completed) return 'completed'

  const cur = currentDate ?? getCurrentDate()

  if (date === cur) return 'in_progress'

  const days = calculateDaysBetween(date, cur)

  if (days > ARCHIVE_DAYS) return 'expired'
  return 'unfinished'
}

/** 获取编辑状态 */
export function getEditState(
  completed: boolean,
  writingContext: string | null
): EditState {
  if (completed) return 'readonly_final'

  if (writingContext !== null && writingContext.trim().length > 0) {
    return 'readonly_regenerable'
  }

  return 'editable'
}

// ============================================================
// 权限检查
// ============================================================

export function canEdit(editState: EditState): boolean {
  return editState === 'editable'
}

export function canGenerate(editState: EditState): boolean {
  return editState === 'editable'
}

export function canRegenerate(editState: EditState): boolean {
  return editState === 'readonly_regenerable'
}

export function canDelete(_status: FragmentStatus, completed: boolean): boolean {
  if (completed) return false
  return true
}

export function canIntegrate(status: FragmentStatus): boolean {
  return status === 'in_progress' || status === 'unfinished'
}

export function canAddFragment(status: FragmentStatus): boolean {
  return status === 'in_progress'
}

// ============================================================
// 状态转换
// ============================================================

/** 转换为已完成状态 */
export function transitionToCompleted(
  day: FragmentDay,
  writingContext: string,
  _currentDate?: string | null
): FragmentDay {
  return {
    ...day,
    completed: true,
    writing_context: writingContext,
    updated_at: getCurrentDatetime(),
    version: day.version + 1,
  }
}

/** 标记过期（更新元数据，状态由 getStatus 自动计算） */
export function transitionToExpired(day: FragmentDay): FragmentDay {
  return {
    ...day,
    updated_at: getCurrentDatetime(),
    version: day.version + 1,
  }
}

// ============================================================
// 撤销跨天整合
// ============================================================

export function canUndoIntegration(
  day: FragmentDay,
  currentDate?: string | null
): boolean {
  if (!day.completed) return false
  if (!day.integration_date) return false

  const cur = currentDate ?? getCurrentDate()
  return day.integration_date === cur
}

export function undoIntegration(day: FragmentDay): FragmentDay {
  return {
    ...day,
    completed: false,
    writing_context: null,
    integration_date: null,
    updated_at: getCurrentDatetime(),
    version: day.version + 1,
  }
}
