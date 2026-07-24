/**
 * 备份、回滚与撤销模块。
 */
import { recordFragment } from './crud'
import { loadFragmentDay, saveFragmentDay } from './storage'
import { canUndoIntegration, undoIntegration } from './state_machine'
import { isWithinRetroactiveRange, RETROACTIVE_DAYS } from './utils'
import type { Fragment } from './models'
import { isSafeDate } from '../security/pathSafety'

/** 补录历史碎片 */
export function retroactivelyRecord(
  projectRoot: string,
  crushSlug: string,
  date: string,
  fragmentData: Record<string, any>
): { fragment: Fragment | null; error: string } {
  if (!isSafeDate(date)) {
    return { fragment: null, error: `Invalid fragment date: ${date}` }
  }
  if (!isWithinRetroactiveRange(date)) {
    return { fragment: null, error: `只能补录最近 ${RETROACTIVE_DAYS} 天的碎片` }
  }

  const day = loadFragmentDay(projectRoot, crushSlug, date)

  if (day.completed) {
    return { fragment: null, error: '该日期已完成写作，无法补录碎片' }
  }

  return recordFragment(projectRoot, crushSlug, fragmentData, date, day)
}

/** 撤销跨天整合 */
export function undoCrossDayIntegration(
  projectRoot: string,
  crushSlug: string,
  date: string,
  currentDate?: string | null
): { success: boolean; error: string } {
  const day = loadFragmentDay(projectRoot, crushSlug, date)

  if (!canUndoIntegration(day, currentDate)) {
    return { success: false, error: '当前状态下不可撤销整合' }
  }

  const undone = undoIntegration(day)
  const { success, error } = saveFragmentDay(projectRoot, undone)

  if (!success) return { success: false, error }
  return { success: true, error: '' }
}
