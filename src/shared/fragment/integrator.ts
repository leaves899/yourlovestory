/**
 * 碎片整合模块（TS 等价实现，取代 src/scripts/fragment/integrator.py）。
 */
import { loadFragmentDay, saveFragmentDay } from './storage'
import { canIntegrate, canRegenerate, getEditState, getStatus } from './state_machine'
import { generateMultiFragmentPrompt } from './prompt_generator'
import { getCurrentDatetime } from './utils'
import type { FragmentDay } from './models'

/** 整合当天碎片为写作上下文（生成 Prompt） */
export function integrateFragments(
  projectRoot: string,
  crushSlug: string,
  date: string
): string {
  const day = loadFragmentDay(projectRoot, crushSlug, date)
  const status = getStatus(date, day.completed)
  if (!canIntegrate(status)) {
    return ''
  }
  return generateMultiFragmentPrompt(day.fragments)
}

/** 预览跨天整合 */
export function previewCrossDay(
  projectRoot: string,
  crushSlug: string,
  dates: string[]
): string {
  const allFragments = dates.flatMap((d) =>
    loadFragmentDay(projectRoot, crushSlug, d).fragments
  )
  return generateMultiFragmentPrompt(allFragments)
}

/** 重新生成叙事 */
export function regenerate(
  projectRoot: string,
  crushSlug: string,
  date: string,
  writingContext: string
): { success: boolean; error: string; day?: FragmentDay } {
  const day = loadFragmentDay(projectRoot, crushSlug, date)
  const editState = getEditState(day.completed, day.writing_context)

  if (!canRegenerate(editState)) {
    return { success: false, error: '当前状态下不可重新生成叙事' }
  }

  const updated = {
    ...day,
    writing_context: writingContext,
    updated_at: getCurrentDatetime(),
    version: day.version + 1,
  }

  const { success, error } = saveFragmentDay(projectRoot, updated)
  if (!success) return { success: false, error }

  return { success: true, error: '', day: updated }
}
