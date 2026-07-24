/**
 * 碎片存储模块。
 *
 * 职责：文件系统操作（读写 JSON）、碎片查找、目录管理。
 * projectRoot 由调用方传入（不依赖 __file__ 或 cwd）。
 */
import * as fs from 'fs'
import {
  fragmentDayFromDict,
  fragmentDayToDict,
  type Fragment,
  type FragmentDay,
} from './models'
import { getCurrentDatetime } from './utils'
import { assertSafeDate, safeCrushPath, safeJoinUnder, isSafeSlug } from '../security/pathSafety'

/** 获取碎片日期文件路径 */
function fragmentDatePath(
  projectRoot: string,
  crushSlug: string,
  date: string
): string {
  assertSafeDate(date)
  return safeCrushPath(projectRoot, crushSlug, 'fragments', `${date}.json`)
}

/** 确保碎片目录存在 */
function ensureFragmentDir(projectRoot: string, crushSlug: string): void {
  const dir = safeCrushPath(projectRoot, crushSlug, 'fragments')
  fs.mkdirSync(dir, { recursive: true })
}

/** 加载日期级别碎片数据，文件不存在时返回空 FragmentDay */
export function loadFragmentDay(
  projectRoot: string,
  crushSlug: string,
  date: string
): FragmentDay {
  const filePath = fragmentDatePath(projectRoot, crushSlug, date)

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      return fragmentDayFromDict(data)
    } catch {
      // JSON 损坏则回退到新建
    }
  }

  const now = getCurrentDatetime()
  return {
    date,
    crush_slug: crushSlug,
    fragments: [],
    completed: false,
    direction: null,
    writing_context: null,
    version: 1,
    integration_date: null,
    created_at: now,
    updated_at: now,
  }
}

/** 保存日期级别碎片数据（ensure_ascii=False, indent=2） */
export function saveFragmentDay(
  projectRoot: string,
  day: FragmentDay
): { success: boolean; error: string } {
  try {
    const filePath = fragmentDatePath(projectRoot, day.crush_slug, day.date)
    ensureFragmentDir(projectRoot, day.crush_slug)
    const json = JSON.stringify(fragmentDayToDict(day), null, 2)
    fs.writeFileSync(filePath, json, 'utf-8')
    return { success: true, error: '' }
  } catch (e: any) {
    return { success: false, error: `保存碎片数据失败: ${e?.message ?? e}` }
  }
}

/** 根据 ID 查找碎片（遍历所有 crush），返回 [Fragment, FragmentDay] 或 [null, null] */
/** List all valid date-scoped fragment files for one crush. */
export function listFragmentDays(
  projectRoot: string,
  crushSlug: string
): FragmentDay[] {
  const fragmentsDir = safeCrushPath(projectRoot, crushSlug, 'fragments')
  if (!fs.existsSync(fragmentsDir)) return []

  return fs
    .readdirSync(fragmentsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter((date) => {
      try {
        assertSafeDate(date)
        return true
      } catch {
        return false
      }
    })
    .sort()
    .map((date) => loadFragmentDay(projectRoot, crushSlug, date))
}

/** Alias used by one-time legacy import callers. */
export const listLegacyFragments = listFragmentDays

export function findFragment(
  projectRoot: string,
  fragmentId: string
): { fragment: Fragment | null; day: FragmentDay | null } {
  // ID 格式：frag_{YYYYMMDD}_{HHMMSS}_{4位随机}
  const parts = fragmentId.split('_')
  if (parts.length < 4) {
    return { fragment: null, day: null }
  }

  const dateStr = parts[1]
  if (!/^\d{8}$/.test(dateStr)) {
    return { fragment: null, day: null }
  }
  const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`
  try {
    assertSafeDate(date)
  } catch {
    return { fragment: null, day: null }
  }

  const crushesDir = safeJoinUnder(projectRoot, 'crushes')
  if (!fs.existsSync(crushesDir)) {
    return { fragment: null, day: null }
  }

  const entries = fs.readdirSync(crushesDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const crushSlug = entry.name
    if (!isSafeSlug(crushSlug)) continue
    const day = loadFragmentDay(projectRoot, crushSlug, date)
    for (const fragment of day.fragments) {
      if (fragment.id === fragmentId) {
        return { fragment, day }
      }
    }
  }

  return { fragment: null, day: null }
}
