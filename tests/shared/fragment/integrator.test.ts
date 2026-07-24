import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  integrateFragments,
  previewCrossDay,
  regenerate,
} from '@/shared/fragment/integrator'
import { loadFragmentDay, saveFragmentDay } from '@/shared/fragment/storage'
import type { Fragment, FragmentDay } from '@/shared/fragment/models'

let tmpRoot: string

function dateWithOffset(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function makeFragment(date: string, content: string, overrides: Partial<Fragment> = {}): Fragment {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '')
  return {
    id: `frag_${date.replace(/-/g, '')}_120000_test`,
    date,
    time: '12:00',
    origin: 'user',
    mood: 'positive',
    content,
    env_tags: [],
    behavior_tags: [],
    custom_tags: [],
    writing_mode: 'raw',
    theme: null,
    crush_slug: 'demo',
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function makeDay(date: string, overrides: Partial<FragmentDay> = {}): FragmentDay {
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, '')
  return {
    date,
    crush_slug: 'demo',
    fragments: [],
    completed: false,
    direction: null,
    writing_context: null,
    version: 1,
    integration_date: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  }
}

function persist(day: FragmentDay): void {
  expect(saveFragmentDay(tmpRoot, day).success).toBe(true)
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-frag-integrator-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('integrateFragments', () => {
  test('当日未完成碎片可生成来源和情绪对应的 Prompt', () => {
    const date = dateWithOffset(0)
    persist(makeDay(date, {
      fragments: [makeFragment(date, 'ta今天分享了一首歌')],
    }))

    const prompt = integrateFragments(tmpRoot, 'demo', date)

    expect(prompt).toContain('记录一下')
  })

  test('已过期日期不可整合', () => {
    const date = dateWithOffset(-8)
    persist(makeDay(date, {
      fragments: [makeFragment(date, '这条内容已经过期')],
    }))

    expect(integrateFragments(tmpRoot, 'demo', date)).toBe('')
  })
})

describe('previewCrossDay', () => {
  test('按传入日期顺序合并跨天碎片', () => {
    const earlierDate = dateWithOffset(-1)
    const today = dateWithOffset(0)
    persist(makeDay(earlierDate, {
      fragments: [makeFragment(earlierDate, '较早发生的片段')],
    }))
    persist(makeDay(today, {
      fragments: [makeFragment(today, '今天发生的片段')],
    }))

    const prompt = previewCrossDay(tmpRoot, 'demo', [earlierDate, today])

    expect(prompt).toContain('较早发生的片段')
    expect(prompt).toContain('今天发生的片段')
    expect(prompt.indexOf('较早发生的片段')).toBeLessThan(prompt.indexOf('今天发生的片段'))
  })
})

describe('regenerate', () => {
  test('未完成但已有叙事的日期可以重新生成并持久化新版本', () => {
    const date = dateWithOffset(0)
    const initial = makeDay(date, {
      fragments: [makeFragment(date, '用于重新生成的片段')],
      writing_context: '旧叙事',
      version: 3,
    })
    persist(initial)

    const result = regenerate(tmpRoot, 'demo', date, '新的叙事')
    const saved = loadFragmentDay(tmpRoot, 'demo', date)

    expect(result.success).toBe(true)
    expect(result.error).toBe('')
    expect(result.day?.writing_context).toBe('新的叙事')
    expect(result.day?.version).toBe(initial.version + 1)
    expect(saved.writing_context).toBe('新的叙事')
    expect(saved.version).toBe(initial.version + 1)
  })

  test('已完成日期拒绝重新生成', () => {
    const date = dateWithOffset(0)
    persist(makeDay(date, {
      completed: true,
      writing_context: '最终叙事',
    }))

    const result = regenerate(tmpRoot, 'demo', date, '不应覆盖的叙事')

    expect(result.success).toBe(false)
    expect(result.error).toContain('不可重新生成')
  })
})
