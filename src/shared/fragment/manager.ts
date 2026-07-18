/**
 * 碎片管理器（外观模式）。
 *
 * 作为 Fragment 模块的统一入口，委托给子模块处理具体逻辑。
 * projectRoot 由调用方传入。
 */
import {
  recordFragment,
  updateFragment,
  deleteFragment,
  getFragment,
  getFragmentsByDate,
} from './crud'
import {
  getFragmentDay,
  completeDay,
  getDayStatus,
  getDayEditState,
} from './locker'
import { integrateFragments, previewCrossDay, regenerate } from './integrator'
import { retroactivelyRecord, undoCrossDayIntegration } from './backup'
import { TagRecommender } from './tag_recommender'
import { BlindMatcher } from './blind_matcher'
import type { Fragment } from './models'

// ============================================================
// 标签推荐
// ============================================================

const recommenders = new Map<string, TagRecommender>()

function getRecommender(projectRoot: string): TagRecommender {
  let r = recommenders.get(projectRoot)
  if (!r) {
    r = new TagRecommender(projectRoot)
    recommenders.set(projectRoot, r)
  }
  return r
}

export function recommendTags(
  projectRoot: string,
  crushSlug: string,
  content: string,
  sessionId: string
) {
  return getRecommender(projectRoot).recommend(content, crushSlug, sessionId)
}

export function recordTagSkip(projectRoot: string, sessionId: string): void {
  getRecommender(projectRoot).recordSkip(sessionId)
}

export function recordTagAccept(projectRoot: string, sessionId: string): void {
  getRecommender(projectRoot).recordAccept(sessionId)
}

// ============================================================
// 碎片 CRUD（委托给 crud + locker）
// ============================================================

export function managerRecordFragment(
  projectRoot: string,
  crushSlug: string,
  fragmentData: Record<string, any>,
  currentDate?: string | null
): { fragment: Fragment | null; error: string } {
  return recordFragment(projectRoot, crushSlug, fragmentData, currentDate)
}

export function managerUpdateFragment(
  projectRoot: string,
  fragmentId: string,
  updates: Record<string, any>,
  expectedVersion?: number
): { fragment: Fragment | null; error: string } {
  return updateFragment(projectRoot, fragmentId, updates, expectedVersion)
}

export function managerDeleteFragment(
  projectRoot: string,
  fragmentId: string,
  expectedVersion?: number
): { success: boolean; error: string } {
  return deleteFragment(projectRoot, fragmentId, expectedVersion)
}

export { getFragment, getFragmentsByDate }

// ============================================================
// 状态查询（委托给 locker）
// ============================================================

export { getFragmentDay, completeDay, getDayStatus, getDayEditState }

// ============================================================
// 整合（委托给 integrator）
// ============================================================

export function managerIntegrateFragments(
  projectRoot: string,
  crushSlug: string,
  date: string
): string {
  return integrateFragments(projectRoot, crushSlug, date)
}

export function managerPreviewCrossDay(
  projectRoot: string,
  crushSlug: string,
  dates: string[]
): string {
  return previewCrossDay(projectRoot, crushSlug, dates)
}

export function managerRegenerate(
  projectRoot: string,
  crushSlug: string,
  date: string,
  writingContext: string
): { success: boolean; error: string } {
  return regenerate(projectRoot, crushSlug, date, writingContext)
}

// ============================================================
// 备份/撤销（委托给 backup）
// ============================================================

export { retroactivelyRecord, undoCrossDayIntegration }

// ============================================================
// Blind 匹配
// ============================================================

export function createBlindMatcher(
  crushSlug: string,
  projectRoot?: string | null
): BlindMatcher {
  return new BlindMatcher(crushSlug, projectRoot)
}
