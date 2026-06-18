/**
 * fragment prompt_generator 单元测试（TS 等价验证）。
 */
import {
  generateSingleFragmentPrompt,
  generateMultiFragmentPrompt,
  mergeOrigins,
  mergeMoods,
  concatContents,
} from '@/shared/fragment/prompt_generator'
import type { Fragment } from '@/shared/fragment/models'

function f(overrides: Partial<Fragment> = {}): Fragment {
  return {
    id: 'frag_test', date: '2026-05-30', time: '14:30',
    origin: 'user', mood: 'positive', content: '测试',
    env_tags: [], behavior_tags: [], custom_tags: [],
    writing_mode: 'raw', theme: null,
    crush_slug: 'example',
    created_at: '2026-05-30T14:30:00', updated_at: '2026-05-30T14:30:00',
    ...overrides,
  }
}

describe('generateSingleFragmentPrompt', () => {
  test('13 种组合都非空', () => {
    const origins = ['user', 'crush', 'ambient']
    const moods = ['positive', 'negative', 'neutral', 'mixed', null]
    for (const origin of origins) {
      for (const mood of moods) {
        const prompt = generateSingleFragmentPrompt(f({ origin, mood: mood as any }))
        expect(prompt.length).toBeGreaterThan(0)
      }
    }
  })

  test('raw 模式', () => {
    const prompt = generateSingleFragmentPrompt(f({ writing_mode: 'raw' }))
    expect(prompt.length).toBeGreaterThan(0)
  })

  test('guided 模式有方向', () => {
    const prompt = generateSingleFragmentPrompt(
      f({ writing_mode: 'guided', mood: 'positive' }),
      '轻松的'
    )
    expect(prompt).toContain('日常小事')
  })

  test('themed 模式', () => {
    const prompt = generateSingleFragmentPrompt(
      f({ writing_mode: 'themed', theme: '约会/出行' })
    )
    expect(prompt).toContain('约会')
  })

  test('blind 模式', () => {
    const prompt = generateSingleFragmentPrompt(f({ writing_mode: 'blind' }))
    expect(prompt).toContain('盲写模式')
  })
})

describe('mergeMoods', () => {
  test('相同情绪返回该情绪', () => {
    expect(mergeMoods([f({ mood: 'positive' }), f({ mood: 'positive' })])).toBe('positive')
  })

  test('不同情绪返回 mixed', () => {
    expect(mergeMoods([f({ mood: 'positive' }), f({ mood: 'negative' })])).toBe('mixed')
  })

  test('全跳过返回 null', () => {
    expect(mergeMoods([f({ mood: null }), f({ mood: null })])).toBeNull()
  })

  test('单个有效情绪', () => {
    expect(mergeMoods([f({ mood: 'positive' }), f({ mood: null })])).toBe('positive')
  })
})

describe('concatContents', () => {
  test('单内容', () => {
    expect(concatContents([f({ content: 'A' })])).toBe('A')
  })

  test('多内容使用连接符', () => {
    const result = concatContents([f({ content: '第一段' }), f({ content: '第二段' })])
    expect(result).toContain('第一段')
    expect(result).toContain('第二段')
  })

  test('空内容跳过', () => {
    const result = concatContents([f({ content: '有效' }), f({ content: '' })])
    expect(result).toBe('有效')
  })
})

describe('mergeOrigins', () => {
  test('去重保留顺序', () => {
    const origins = mergeOrigins([
      f({ origin: 'user' }), f({ origin: 'crush' }), f({ origin: 'user' }),
    ])
    expect(origins).toEqual(['user', 'crush'])
  })
})

describe('generateMultiFragmentPrompt', () => {
  test('空数组返回空字符串', () => {
    expect(generateMultiFragmentPrompt([])).toBe('')
  })

  test('单碎片委派给单碎片生成', () => {
    const prompt = generateMultiFragmentPrompt([f()])
    expect(prompt.length).toBeGreaterThan(0)
  })

  test('多碎片包含内容', () => {
    const prompt = generateMultiFragmentPrompt([
      f({ content: '我发了一个表情包', origin: 'user' }),
      f({ content: 'ta回了一个嗯', origin: 'crush' }),
    ])
    expect(prompt).toContain('表情包')
    expect(prompt).toContain('嗯')
  })
})
