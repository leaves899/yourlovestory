/**
 * 碎片 CRUD 模块。
 *
 * 职责：碎片创建/读取/更新/删除、内容验证、乐观锁。
 * projectRoot 由调用方传入。
 */
import {
  loadFragmentDay,
  saveFragmentDay,
  findFragment,
} from './storage'
import { getStatus, getEditState, canAddFragment, canEdit, canDelete } from './state_machine'
import {
  generateFragmentId,
  getCurrentDate,
  getCurrentDatetime,
  getCurrentTime,
  validateContent,
  MAX_FRAGMENTS_PER_DAY,
} from './utils'
import type { Fragment, FragmentDay } from './models'

// ============================================================
// 创建碎片
// ============================================================

export function recordFragment(
  projectRoot: string,
  crushSlug: string,
  fragmentData: Record<string, any>,
  currentDate?: string | null,
  existingDay?: FragmentDay | null
): { fragment: Fragment | null; error: string } {
  const curDate = currentDate ?? getCurrentDate()

  const day = existingDay ?? loadFragmentDay(projectRoot, crushSlug, curDate)

  const status = getStatus(curDate, day.completed, curDate)
  if (!canAddFragment(status)) {
    return { fragment: null, error: '该日期已完成写作，无法添加新碎片' }
  }

  if (day.fragments.length >= MAX_FRAGMENTS_PER_DAY) {
    return {
      fragment: null,
      error: `今天的碎片已达上限（${MAX_FRAGMENTS_PER_DAY}个），建议先完成写作`,
    }
  }

  const writingMode = fragmentData['writing_mode'] ?? 'raw'
  const content = fragmentData['content'] ?? ''
  const { valid, message } = validateContent(content, writingMode)
  if (!valid) {
    return { fragment: null, error: message }
  }

  const date = fragmentData['date'] ?? curDate
  const time = fragmentData['time'] ?? null
  const fragmentId = generateFragmentId(date, time)

  const now = getCurrentDatetime()
  const fragment: Fragment = {
    id: fragmentId,
    date,
    time: time || getCurrentTime(),
    origin: fragmentData['origin'] ?? 'user',
    mood: fragmentData['mood'] ?? null,
    content,
    env_tags: fragmentData['env_tags'] ?? [],
    behavior_tags: fragmentData['behavior_tags'] ?? [],
    custom_tags: fragmentData['custom_tags'] ?? [],
    writing_mode: writingMode,
    theme: fragmentData['theme'] ?? null,
    crush_slug: crushSlug,
    created_at: now,
    updated_at: now,
  }

  day.fragments.push(fragment)
  day.updated_at = now
  day.version += 1

  const { success, error } = saveFragmentDay(projectRoot, day)
  if (!success) {
    day.fragments.pop()
    day.version -= 1
    return { fragment: null, error }
  }

  return { fragment, error: '' }
}

// ============================================================
// 更新碎片
// ============================================================

const UPDATABLE_FIELDS = new Set([
  'content', 'origin', 'mood', 'env_tags', 'behavior_tags', 'writing_mode',
])

export function updateFragment(
  projectRoot: string,
  fragmentId: string,
  updates: Record<string, any>,
  expectedVersion?: number,
  existingFragment?: Fragment | null,
  existingDay?: FragmentDay | null
): { fragment: Fragment | null; error: string } {
  const found =
    existingFragment && existingDay
      ? { fragment: existingFragment, day: existingDay }
      : findFragment(projectRoot, fragmentId)

  const fragment = found.fragment
  const day = found.day

  if (!fragment || !day) {
    return { fragment: null, error: '碎片不存在或已被删除' }
  }

  const editState = getEditState(day.completed, day.writing_context)
  if (!canEdit(editState)) {
    if (editState === 'readonly_final') {
      return { fragment: null, error: '该日期已完成写作，碎片不可编辑' }
    }
    return { fragment: null, error: '已触发写作，碎片内容只读，仅可重新生成叙事' }
  }

  if (expectedVersion !== undefined && expectedVersion !== day.version) {
    return { fragment: null, error: '碎片已被其他客户端修改，请重新加载' }
  }

  const invalidFields = Object.keys(updates).filter((k) => !UPDATABLE_FIELDS.has(k))
  if (invalidFields.length > 0) {
    return { fragment: null, error: `不允许修改字段: ${invalidFields.join(', ')}` }
  }

  if ('content' in updates) {
    const wm = updates['writing_mode'] ?? fragment.writing_mode
    const { valid, message } = validateContent(updates['content'], wm)
    if (!valid) {
      return { fragment: null, error: message }
    }
  }

  // 保存旧值用于回滚
  const oldValues: Record<string, any> = {}
  for (const key of Object.keys(updates)) {
    if (key in fragment) {
      oldValues[key] = (fragment as any)[key]
    }
  }

  // 更新
  for (const [key, value] of Object.entries(updates)) {
    if (key in fragment) {
      (fragment as any)[key] = value
    }
  }
  fragment.updated_at = getCurrentDatetime()

  day.updated_at = getCurrentDatetime()
  day.version += 1

  const { success, error } = saveFragmentDay(projectRoot, day)
  if (!success) {
    // 回滚
    for (const [key, value] of Object.entries(oldValues)) {
      (fragment as any)[key] = value
    }
    day.version -= 1
    return { fragment: null, error }
  }

  return { fragment, error: '' }
}

// ============================================================
// 删除碎片
// ============================================================

export function deleteFragment(
  projectRoot: string,
  fragmentId: string,
  expectedVersion?: number,
  existingFragment?: Fragment | null,
  existingDay?: FragmentDay | null
): { success: boolean; error: string } {
  const found =
    existingFragment && existingDay
      ? { fragment: existingFragment, day: existingDay }
      : findFragment(projectRoot, fragmentId)

  const fragment = found.fragment
  const day = found.day

  if (!fragment || !day) {
    return { success: false, error: '碎片不存在或已被删除' }
  }

  const status = getStatus(day.date, day.completed)
  if (!canDelete(status, day.completed)) {
    return { success: false, error: '该日期已完成写作，碎片不可删除' }
  }

  if (expectedVersion !== undefined && expectedVersion !== day.version) {
    return { success: false, error: '碎片已被其他客户端修改，请重新加载' }
  }

  const idx = day.fragments.findIndex((f) => f.id === fragmentId)
  if (idx === -1) {
    return { success: false, error: '碎片不存在或已被删除' }
  }

  const removed = day.fragments.splice(idx, 1)[0]
  day.updated_at = getCurrentDatetime()
  day.version += 1

  const { success, error } = saveFragmentDay(projectRoot, day)
  if (!success) {
    // 回滚
    day.fragments.splice(idx, 0, removed)
    day.version -= 1
    return { success: false, error }
  }

  return { success: true, error: '' }
}

// ============================================================
// 查询
// ============================================================

export function getFragment(
  projectRoot: string,
  fragmentId: string
): Fragment | null {
  const { fragment } = findFragment(projectRoot, fragmentId)
  return fragment
}

export function getFragmentsByDate(
  projectRoot: string,
  crushSlug: string,
  date: string,
  existingDay?: FragmentDay | null
): Fragment[] {
  const day = existingDay ?? loadFragmentDay(projectRoot, crushSlug, date)
  return day.fragments
}
