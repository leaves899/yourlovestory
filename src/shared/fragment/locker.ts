/**
 * 乐观锁与状态查询模块（TS 等价实现，取代 src/scripts/fragment/locker.py）。
 *
 * 职责：日期级别操作（获取、完成、状态查询）、乐观锁校验。
 * projectRoot 由调用方传入。
 */
import { loadFragmentDay, saveFragmentDay } from './storage'
import { getStatus, getEditState, transitionToCompleted } from './state_machine'
import { getCurrentDate } from './utils'
import type { FragmentDay, FragmentStatus, EditState } from './models'

/** 获取日期级别碎片数据 */
export function getFragmentDay(
  projectRoot: string,
  crushSlug: string,
  date: string
): FragmentDay {
  return loadFragmentDay(projectRoot, crushSlug, date)
}

/** 标记日期为已完成（含乐观锁校验） */
export function completeDay(
  projectRoot: string,
  crushSlug: string,
  date: string,
  writingContext: string,
  expectedVersion: number,
  integrationDate?: string | null,
  existingDay?: FragmentDay | null
): { success: boolean; error: string } {
  const day = existingDay ?? loadFragmentDay(projectRoot, crushSlug, date)

  if (expectedVersion !== day.version) {
    return { success: false, error: '数据已被其他客户端修改，请重新加载' }
  }

  if (!day.fragments.some((f) => f.content && f.content.trim().length > 0)) {
    return { success: false, error: '所有碎片均为空内容，无法生成叙事' }
  }

  const updated = transitionToCompleted(day, writingContext, getCurrentDate())
  if (integrationDate !== undefined && integrationDate !== null) {
    updated.integration_date = integrationDate
  }

  const { success, error } = saveFragmentDay(projectRoot, updated)
  if (!success) {
    return { success: false, error }
  }

  return { success: true, error: '' }
}

/** 获取日期状态 */
export function getDayStatus(
  projectRoot: string,
  crushSlug: string,
  date: string
): FragmentStatus {
  const day = loadFragmentDay(projectRoot, crushSlug, date)
  return getStatus(date, day.completed)
}

/** 获取编辑状态 */
export function getDayEditState(
  projectRoot: string,
  crushSlug: string,
  date: string
): EditState {
  const day = loadFragmentDay(projectRoot, crushSlug, date)
  return getEditState(day.completed, day.writing_context)
}
