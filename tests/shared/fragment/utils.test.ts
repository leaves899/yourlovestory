/**
 * fragment utils 单元测试（TS 等价验证）。
 *
 * 覆盖碎片工具函数的内容校验、日期处理和格式化规则。
 */
import {
  generateFragmentId,
  calculateDaysBetween,
  isExpired,
  isToday,
  isWithinRetroactiveRange,
  validateContent,
  isEmojiOnly,
  formatFragmentSummary,
  getOriginDisplay,
  getMoodEmoji,
  getMoodDisplay,
  getWritingModeDisplay,
  ARCHIVE_DAYS,
  RETROACTIVE_DAYS,
  MAX_CONTENT_LENGTH,
  MIN_CONTENT_LENGTH_DEFAULT,
  MIN_CONTENT_LENGTH_BLIND,
  MAX_FRAGMENTS_PER_DAY,
} from '@/shared/fragment/utils'

describe('generateFragmentId', () => {
  test('格式：frag_{YYYYMMDD}_{HHMMSS}_{4位hex}', () => {
    const fid = generateFragmentId('2026-05-30', '14:30')
    expect(fid.startsWith('frag_20260530_143000_')).toBe(true)
    const suffix = fid.split('_').pop()!
    expect(suffix.length).toBe(4)
    expect(/^[0-9a-f]{4}$/.test(suffix)).toBe(true)
  })

  test('无 time 时使用当前秒数', () => {
    const fid = generateFragmentId('2026-05-30', null)
    expect(fid.startsWith('frag_20260530_')).toBe(true)
    const parts = fid.split('_')
    expect(parts.length).toBe(4)
    expect(parts[2].length).toBe(6)
  })

  test('多次调用 ID 几乎不重复', () => {
    const ids = new Set(
      Array.from({ length: 20 }, () => generateFragmentId('2026-05-30', '14:30'))
    )
    expect(ids.size).toBeGreaterThanOrEqual(19)
  })
})

describe('日期计算', () => {
  test('同一天相差 0', () => {
    expect(calculateDaysBetween('2026-05-30', '2026-05-30')).toBe(0)
  })

  test('跨天计算', () => {
    expect(calculateDaysBetween('2026-05-29', '2026-05-30')).toBe(1)
    expect(calculateDaysBetween('2026-05-23', '2026-05-30')).toBe(7)
  })

  test('isToday', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isToday(today)).toBe(true)
    expect(isToday('2020-01-01', '2026-05-30')).toBe(false)
  })

  test('isExpired 严格大于 7 天', () => {
    expect(isExpired('2026-05-22', '2026-05-30')).toBe(true)   // 8 天
    expect(isExpired('2026-05-23', '2026-05-30')).toBe(false)  // 7 天
    expect(isExpired('2026-05-24', '2026-05-30')).toBe(false)  // 6 天
  })

  test('isWithinRetroactiveRange', () => {
    expect(isWithinRetroactiveRange('2026-05-30', '2026-05-30')).toBe(true)
    expect(isWithinRetroactiveRange('2026-04-30', '2026-05-30')).toBe(true)  // 30 天
    expect(isWithinRetroactiveRange('2026-04-29', '2026-05-30')).toBe(false) // 31 天
    expect(isWithinRetroactiveRange('2026-06-01', '2026-05-30')).toBe(false) // 未来
  })
})

describe('validateContent', () => {
  test('空内容允许但有建议', () => {
    const r = validateContent('', 'raw')
    expect(r.valid).toBe(true)
    expect(r.message).toContain('建议')
  })

  test('过短内容拒绝（raw 模式）', () => {
    const r = validateContent('你好', 'raw')
    expect(r.valid).toBe(false)
    expect(r.message).toContain(`${MIN_CONTENT_LENGTH_DEFAULT}`)
  })

  test('过短内容拒绝（blind 模式）', () => {
    const r = validateContent('只有九个字哈哈哈', 'blind')
    expect(r.valid).toBe(false)
    expect(r.message).toContain(`${MIN_CONTENT_LENGTH_BLIND}`)
  })

  test('blind 最低字数满足时通过', () => {
    const r = validateContent('正好十个字啦哈哈哈嘿', 'blind')
    expect(r.valid).toBe(true)
  })

  test('超长内容拒绝', () => {
    const content = 'x'.repeat(MAX_CONTENT_LENGTH + 1)
    const r = validateContent(content, 'raw')
    expect(r.valid).toBe(false)
    expect(r.message).toContain(`${MAX_CONTENT_LENGTH}`)
  })

  test('无效写作模式', () => {
    const r = validateContent('hello', 'invalid_mode' as any)
    expect(r.valid).toBe(false)
    expect(r.message).toContain('无效的写作模式')
  })

  test('纯表情拒绝', () => {
    const r = validateContent('😊😊😊', 'raw')
    expect(r.valid).toBe(false)
    expect(r.message).toContain('表情')
  })
})

describe('isEmojiOnly', () => {
  test('单个 emoji → true', () => {
    expect(isEmojiOnly('😊')).toBe(true)
  })

  test('文字 + emoji → false', () => {
    expect(isEmojiOnly('你好😊')).toBe(false)
  })

  test('纯中文 → false', () => {
    expect(isEmojiOnly('今天天气真好')).toBe(false)
  })

  test('空字符串 → false', () => {
    expect(isEmojiOnly('')).toBe(false)
  })

  test('纯标点 → true', () => {
    expect(isEmojiOnly('...')).toBe(true)
  })

  test('纯符号 → true', () => {
    expect(isEmojiOnly('★★★★★')).toBe(true)
  })
})

describe('formatFragmentSummary', () => {
  test('空内容', () => {
    expect(formatFragmentSummary('')).toBe('（空内容）')
    expect(formatFragmentSummary(null)).toBe('（空内容）')
  })

  test('短内容不截断', () => {
    expect(formatFragmentSummary('hello')).toBe('hello')
  })

  test('长内容截断', () => {
    const result = formatFragmentSummary('x'.repeat(60))
    expect(result.endsWith('...')).toBe(true)
    expect(result.length).toBe(53) // 50 + '...'
  })
})

describe('显示函数', () => {
  test('getOriginDisplay', () => {
    expect(getOriginDisplay('user')).toBe('用户')
    expect(getOriginDisplay('crush')).toBe('Crush')
    expect(getOriginDisplay('ambient')).toBe('环境')
    expect(getOriginDisplay('unknown')).toBe('unknown')
  })

  test('getMoodEmoji', () => {
    expect(getMoodEmoji('positive')).toBe('😊')
    expect(getMoodEmoji(null)).toBe('⬜')
    expect(getMoodEmoji('unknown')).toBe('⬜')
  })

  test('getMoodDisplay', () => {
    expect(getMoodDisplay('positive')).toBe('开心')
    expect(getMoodDisplay(null)).toBe('未选择')
  })

  test('getWritingModeDisplay', () => {
    expect(getWritingModeDisplay('raw')).toBe('Raw')
    expect(getWritingModeDisplay('guided')).toBe('Guided')
    expect(getWritingModeDisplay('unknown')).toBe('unknown')
  })
})

describe('常量', () => {
  test('ARCHIVE_DAYS = 7', () => expect(ARCHIVE_DAYS).toBe(7))
  test('RETROACTIVE_DAYS = 30', () => expect(RETROACTIVE_DAYS).toBe(30))
  test('MAX_CONTENT_LENGTH = 500', () => expect(MAX_CONTENT_LENGTH).toBe(500))
  test('MIN_CONTENT_LENGTH_DEFAULT = 5', () => expect(MIN_CONTENT_LENGTH_DEFAULT).toBe(5))
  test('MIN_CONTENT_LENGTH_BLIND = 10', () => expect(MIN_CONTENT_LENGTH_BLIND).toBe(10))
  test('MAX_FRAGMENTS_PER_DAY = 10', () => expect(MAX_FRAGMENTS_PER_DAY).toBe(10))
})
