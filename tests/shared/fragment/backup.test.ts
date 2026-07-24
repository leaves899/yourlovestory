import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  retroactivelyRecord,
  undoCrossDayIntegration,
} from '@/shared/fragment/backup'
import { loadFragmentDay, saveFragmentDay } from '@/shared/fragment/storage'
import { RETROACTIVE_DAYS } from '@/shared/fragment/utils'
import type { FragmentDay } from '@/shared/fragment/models'

let tmpRoot: string

function dateWithOffset(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
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
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-frag-backup-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('retroactivelyRecord', () => {
  test('补录范围内的未完成日期可以保存碎片', () => {
    const date = dateWithOffset(-1)

    const result = retroactivelyRecord(tmpRoot, 'demo', date, {
      origin: 'user',
      content: '昨天补录的内容足够长',
      writing_mode: 'raw',
    })
    const saved = loadFragmentDay(tmpRoot, 'demo', date)

    expect(result.error).toBe('')
    expect(result.fragment?.date).toBe(date)
    expect(saved.fragments).toHaveLength(1)
    expect(saved.fragments[0].content).toBe('昨天补录的内容足够长')
  })

  test.each([
    ['未来日期', 1],
    ['超出补录范围', -(RETROACTIVE_DAYS + 1)],
  ])('补录%s时拒绝操作', (_label, offset) => {
    const date = dateWithOffset(offset)

    const result = retroactivelyRecord(tmpRoot, 'demo', date, {
      origin: 'user',
      content: '不应被保存的内容',
      writing_mode: 'raw',
    })

    expect(result.fragment).toBeNull()
    expect(result.error).toContain('补录')
  })

  test('已完成日期拒绝补录', () => {
    const date = dateWithOffset(-1)
    persist(makeDay(date, {
      completed: true,
      writing_context: '已完成的叙事',
    }))

    const result = retroactivelyRecord(tmpRoot, 'demo', date, {
      origin: 'user',
      content: '不应追加到已完成日期',
      writing_mode: 'raw',
    })

    expect(result.fragment).toBeNull()
    expect(result.error).toContain('已完成')
  })
})

describe('undoCrossDayIntegration', () => {
  test('当天完成的跨天整合可以撤销并恢复可编辑状态', () => {
    const date = dateWithOffset(-1)
    const currentDate = dateWithOffset(0)
    const initial = makeDay(date, {
      completed: true,
      writing_context: '跨天整合生成的叙事',
      integration_date: currentDate,
      version: 4,
    })
    persist(initial)

    const result = undoCrossDayIntegration(tmpRoot, 'demo', date, currentDate)
    const saved = loadFragmentDay(tmpRoot, 'demo', date)

    expect(result.success).toBe(true)
    expect(result.error).toBe('')
    expect(saved.completed).toBe(false)
    expect(saved.writing_context).toBeNull()
    expect(saved.integration_date).toBeNull()
    expect(saved.version).toBe(initial.version + 1)
  })

  test('非当天的整合不能撤销', () => {
    const date = dateWithOffset(-1)
    const currentDate = dateWithOffset(0)
    const initial = makeDay(date, {
      completed: true,
      writing_context: '已经过时的整合叙事',
      integration_date: dateWithOffset(-2),
      version: 4,
    })
    persist(initial)

    const result = undoCrossDayIntegration(tmpRoot, 'demo', date, currentDate)
    const saved = loadFragmentDay(tmpRoot, 'demo', date)

    expect(result.success).toBe(false)
    expect(result.error).toContain('不可撤销')
    expect(saved.completed).toBe(initial.completed)
    expect(saved.writing_context).toBe(initial.writing_context)
    expect(saved.integration_date).toBe(initial.integration_date)
    expect(saved.version).toBe(initial.version)
  })
})
