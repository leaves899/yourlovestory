/**
 * 碎片日记工具函数。
 *
 * 包含：ID 生成、时间处理、内容验证、emoji 检测、文件路径、摘要格式化。
 */
import * as crypto from 'crypto'
import * as path from 'path'
import {
  ORIGIN_DISPLAY,
  MOOD_EMOJI,
  MOOD_DISPLAY,
  WRITING_MODE_DISPLAY,
} from './models'

// ============================================================
// 常量
// ============================================================

export const FRAGMENT_ID_PREFIX = 'frag_'
export const FRAGMENT_ID_RANDOM_LENGTH = 4

export const MIN_CONTENT_LENGTH_DEFAULT = 5
export const MIN_CONTENT_LENGTH_BLIND = 10
export const MAX_CONTENT_LENGTH = 500

export const MAX_FRAGMENTS_PER_DAY = 10

export const ARCHIVE_DAYS = 7
export const RETROACTIVE_DAYS = 30

// ============================================================
// ID 生成
// ============================================================

/** 生成碎片唯一标识：frag_{YYYYMMDD}_{HHMMSS}_{4位随机十六进制} */
export function generateFragmentId(date: string, time?: string | null): string {
  const dateObj = new Date(date + 'T00:00:00')
  const dateStr =
    dateObj.getFullYear().toString() +
    String(dateObj.getMonth() + 1).padStart(2, '0') +
    String(dateObj.getDate()).padStart(2, '0')

  let timeStr: string
  if (time) {
    const [h, m] = time.split(':')
    timeStr = h.padStart(2, '0') + m.padStart(2, '0') + '00'
  } else {
    const now = new Date()
    timeStr =
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0')
  }

  // 4 位随机十六进制
  const randomHex = crypto
    .randomBytes(2)
    .toString('hex')
    .slice(0, FRAGMENT_ID_RANDOM_LENGTH)

  return `${FRAGMENT_ID_PREFIX}${dateStr}_${timeStr}_${randomHex}`
}

// ============================================================
// 时间处理
// ============================================================

export function getCurrentDatetime(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '')
}

export function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getCurrentTime(): string {
  const now = new Date()
  return (
    String(now.getHours()).padStart(2, '0') +
    ':' +
    String(now.getMinutes()).padStart(2, '0')
  )
}

export function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

export function calculateDaysBetween(date1: string, date2: string): number {
  const d1 = parseDate(date1)
  const d2 = parseDate(date2)
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
}

export function isExpired(date: string, currentDate?: string | null): boolean {
  const cur = currentDate ?? getCurrentDate()
  const days = calculateDaysBetween(date, cur)
  return days > ARCHIVE_DAYS
}

export function isToday(date: string, currentDate?: string | null): boolean {
  return date === (currentDate ?? getCurrentDate())
}

export function isWithinRetroactiveRange(
  date: string,
  currentDate?: string | null
): boolean {
  const cur = currentDate ?? getCurrentDate()
  const days = calculateDaysBetween(date, cur)
  return days >= 0 && days <= RETROACTIVE_DAYS
}

// ============================================================
// 内容验证
// ============================================================

const VALID_MODES = new Set(['raw', 'guided', 'themed', 'blind'])

export function validateContent(
  content: string,
  writingMode: string
): { valid: boolean; message: string } {
  if (!VALID_MODES.has(writingMode)) {
    return {
      valid: false,
      message: `无效的写作模式: ${writingMode}，有效值: ${[...VALID_MODES].join(', ')}`,
    }
  }

  if (!content || content.trim() === '') {
    return { valid: true, message: '建议补充一些描述，让叙事更丰富' }
  }

  if (isEmojiOnly(content)) {
    return { valid: false, message: '请补充文字描述，表情符号无法单独生成叙事' }
  }

  const contentLength = content.trim().length

  if (writingMode === 'blind') {
    if (contentLength < MIN_CONTENT_LENGTH_BLIND) {
      return {
        valid: false,
        message: `盲写模式至少需要 ${MIN_CONTENT_LENGTH_BLIND} 字`,
      }
    }
  } else {
    if (contentLength < MIN_CONTENT_LENGTH_DEFAULT) {
      return {
        valid: false,
        message: `内容太短，请补充描述（至少 ${MIN_CONTENT_LENGTH_DEFAULT} 字）`,
      }
    }
  }

  if (contentLength > MAX_CONTENT_LENGTH) {
    return {
      valid: false,
      message: `内容过长，请精简到 ${MAX_CONTENT_LENGTH} 字以内`,
    }
  }

  return { valid: true, message: '' }
}

// ============================================================
// Emoji 检测（Unicode property escape）。
// ============================================================

/** 判断是否只有表情/符号（无字母、数字字符） */
export function isEmojiOnly(content: string): boolean {
  if (!content) return false

  // 使用 Unicode 属性判断内容是否包含字母或数字。
  const hasLetterOrNumber = /\p{L}|\p{N}/u.test(content)
  return !hasLetterOrNumber
}

// ============================================================
// 文件路径
// ============================================================

export function getFragmentDatePath(
  projectRoot: string,
  crushSlug: string,
  date: string
): string {
  return path.join(projectRoot, 'crushes', crushSlug, 'fragments', `${date}.json`)
}

// ============================================================
// 摘要格式化
// ============================================================

export function formatFragmentSummary(
  content: string | null,
  maxLength: number = 50
): string {
  if (!content) return '（空内容）'

  if (content.length <= maxLength) return content

  return content.slice(0, maxLength) + '...'
}

// ============================================================
// 显示文本
// ============================================================

export function getOriginDisplay(origin: string): string {
  return ORIGIN_DISPLAY[origin] ?? origin
}

export function getMoodEmoji(mood: string | null): string {
  if (mood === null) return '⬜'
  return MOOD_EMOJI[mood] ?? '⬜'
}

export function getMoodDisplay(mood: string | null): string {
  if (mood === null) return '未选择'
  return MOOD_DISPLAY[mood] ?? '未选择'
}

export function getWritingModeDisplay(mode: string): string {
  return WRITING_MODE_DISPLAY[mode] ?? mode
}
