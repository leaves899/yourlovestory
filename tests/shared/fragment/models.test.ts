/**
 * fragment models 单元测试（TS 等价验证）。
 */
import {
  fragmentFromDict,
  fragmentToDict,
  fragmentDayFromDict,
  fragmentDayToDict,
  getFragmentCount,
  getNonEmptyFragments,
  hasContent,
  ORIGIN_DISPLAY,
  MOOD_EMOJI,
  MOOD_DISPLAY,
  MOOD_MODIFIERS,
  WRITING_MODE_DISPLAY,
  DIRECTION_OPTIONS,
  DIRECTION_PROMPTS,
  DIRECTION_MOOD_MAP,
  THEME_OPTIONS,
  THEME_PROMPTS,
  type Fragment,
  type FragmentDay,
} from '@/shared/fragment/models'

function makeFragment(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: 'frag_20260530_143000_a1b2',
    date: '2026-05-30',
    time: '14:30',
    origin: 'crush',
    mood: 'positive',
    content: 'ta发了一个表情包',
    env_tags: ['工作'],
    behavior_tags: [],
    custom_tags: ['可爱'],
    writing_mode: 'guided',
    theme: null,
    crush_slug: 'example',
    created_at: '2026-05-30T14:30:00',
    updated_at: '2026-05-30T14:30:00',
    ...overrides,
  }
}

function makeFragmentDay(overrides: Partial<FragmentDay> = {}): FragmentDay {
  return {
    date: '2026-05-30',
    crush_slug: 'example',
    fragments: [makeFragment()],
    completed: false,
    direction: '轻松的',
    writing_context: null,
    version: 1,
    integration_date: null,
    created_at: '2026-05-30T14:30:00',
    updated_at: '2026-05-30T14:30:00',
    ...overrides,
  }
}

describe('Fragment 序列化/反序列化', () => {
  test('toDict → fromDict 往返', () => {
    const f = makeFragment()
    const dict = fragmentToDict(f)
    const restored = fragmentFromDict(dict)
    expect(restored.id).toBe(f.id)
    expect(restored.date).toBe(f.date)
    expect(restored.origin).toBe(f.origin)
    expect(restored.mood).toBe(f.mood)
    expect(restored.content).toBe(f.content)
    expect(restored.env_tags).toEqual(f.env_tags)
    expect(restored.custom_tags).toEqual(f.custom_tags)
  })

  test('fromDict 缺省字段用默认值', () => {
    const restored = fragmentFromDict({
      id: 'test',
      date: '2026-01-01',
      origin: 'user',
      writing_mode: 'raw',
      crush_slug: 'test',
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    })
    expect(restored.mood).toBeNull()
    expect(restored.content).toBe('')
    expect(restored.env_tags).toEqual([])
    expect(restored.behavior_tags).toEqual([])
    expect(restored.custom_tags).toEqual([])
    expect(restored.theme).toBeNull()
    expect(restored.time).toBeNull()
  })

  test('mood 为 null 的 Fragment 序列化保留 null', () => {
    const f = makeFragment({ mood: null })
    const dict = fragmentToDict(f)
    expect(dict.mood).toBeNull()
  })
})

describe('FragmentDay 序列化/反序列化', () => {
  test('toDict → fromDict 往返', () => {
    const day = makeFragmentDay()
    const dict = fragmentDayToDict(day)
    const restored = fragmentDayFromDict(dict)
    expect(restored.date).toBe(day.date)
    expect(restored.crush_slug).toBe(day.crush_slug)
    expect(restored.completed).toBe(day.completed)
    expect(restored.direction).toBe(day.direction)
    expect(restored.version).toBe(day.version)
    expect(restored.fragments.length).toBe(1)
  })

  test('fromDict 缺省字段用默认值', () => {
    const restored = fragmentDayFromDict({
      date: '2026-01-01',
      crush_slug: 'test',
      fragments: [],
      created_at: '2026-01-01T00:00:00',
      updated_at: '2026-01-01T00:00:00',
    })
    expect(restored.completed).toBe(false)
    expect(restored.version).toBe(1)
    expect(restored.direction).toBeNull()
    expect(restored.writing_context).toBeNull()
    expect(restored.integration_date).toBeNull()
  })
})

describe('FragmentDay 方法', () => {
  test('getFragmentCount', () => {
    const day = makeFragmentDay({ fragments: [makeFragment(), makeFragment()] })
    expect(getFragmentCount(day)).toBe(2)
  })

  test('getNonEmptyFragments 过滤空内容', () => {
    const day = makeFragmentDay({
      fragments: [
        makeFragment({ content: '有效' }),
        makeFragment({ content: '' }),
        makeFragment({ content: '   ' }),
      ],
    })
    const nonEmpty = getNonEmptyFragments(day)
    expect(nonEmpty.length).toBe(1)
    expect(nonEmpty[0].content).toBe('有效')
  })

  test('hasContent 检查是否有有效碎片', () => {
    const empty = makeFragmentDay({ fragments: [makeFragment({ content: '' })] })
    expect(hasContent(empty)).toBe(false)

    const full = makeFragmentDay({ fragments: [makeFragment({ content: '有内容' })] })
    expect(hasContent(full)).toBe(true)
  })
})

describe('常量', () => {
  test('ORIGIN_DISPLAY', () => {
    expect(ORIGIN_DISPLAY['user']).toBe('用户')
    expect(ORIGIN_DISPLAY['crush']).toBe('Crush')
    expect(ORIGIN_DISPLAY['ambient']).toBe('环境')
  })

  test('MOOD_EMOJI', () => {
    expect(MOOD_EMOJI['positive']).toBe('😊')
    expect(MOOD_EMOJI['negative']).toBe('😢')
    expect(MOOD_EMOJI['neutral']).toBe('😐')
    expect(MOOD_EMOJI['mixed']).toBe('😶')
  })

  test('MOOD_DISPLAY', () => {
    expect(MOOD_DISPLAY['positive']).toBe('开心')
    expect(MOOD_DISPLAY['negative']).toBe('在意')
  })

  test('MOOD_MODIFIERS', () => {
    expect(MOOD_MODIFIERS['positive']).toBe('开心')
    expect(MOOD_MODIFIERS['mixed']).toBe('心情复杂')
  })

  test('DIRECTION_OPTIONS has 3 entries', () => {
    expect(DIRECTION_OPTIONS).toHaveLength(3)
    expect(DIRECTION_OPTIONS[0].id).toBe('casual')
  })

  test('DIRECTION_MOOD_MAP', () => {
    expect(DIRECTION_MOOD_MAP['轻松的']).toBe('positive')
    expect(DIRECTION_MOOD_MAP['有些在意的']).toBe('negative')
    expect(DIRECTION_MOOD_MAP['想深入的']).toBe('mixed')
  })

  test('THEME_OPTIONS has 8 entries', () => {
    expect(THEME_OPTIONS).toHaveLength(8)
  })

  test('THEME_PROMPTS', () => {
    expect(THEME_PROMPTS['工作/学习']).toContain('工作')
    expect(THEME_PROMPTS['约会/出行']).toContain('约会')
  })
})
