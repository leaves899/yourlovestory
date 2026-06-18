/**
 * fragment storage 单元测试（TS 等价验证）。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  loadFragmentDay,
  saveFragmentDay,
  findFragment,
} from '@/shared/fragment/storage'
import type { FragmentDay } from '@/shared/fragment/models'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-frag-storage-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('loadFragmentDay', () => {
  test('文件不存在时返回空 FragmentDay', () => {
    const day = loadFragmentDay(tmpRoot, 'test_slug', '2026-05-30')
    expect(day.date).toBe('2026-05-30')
    expect(day.crush_slug).toBe('test_slug')
    expect(day.fragments).toEqual([])
    expect(day.completed).toBe(false)
    expect(day.version).toBe(1)
    expect(day.direction).toBeNull()
    expect(day.writing_context).toBeNull()
    expect(day.integration_date).toBeNull()
    expect(day.created_at).toBeTruthy()
    expect(day.updated_at).toBeTruthy()
  })

  test('文件存在时正确加载', () => {
    const fragmentsDir = path.join(tmpRoot, 'crushes', 'test_slug', 'fragments')
    fs.mkdirSync(fragmentsDir, { recursive: true })
    const testData = {
      date: '2026-05-30',
      crush_slug: 'test_slug',
      fragments: [
        {
          id: 'frag_test', date: '2026-05-30', time: '14:30',
          origin: 'user', mood: 'positive', content: '测试',
          env_tags: [], behavior_tags: [], custom_tags: [],
          writing_mode: 'raw', theme: null, crush_slug: 'test_slug',
          created_at: '2026-05-30T14:30:00', updated_at: '2026-05-30T14:30:00',
        },
      ],
      completed: false, direction: null, writing_context: null,
      version: 3, integration_date: null,
      created_at: '2026-05-30T00:00:00', updated_at: '2026-05-30T00:00:00',
    }
    fs.writeFileSync(
      path.join(fragmentsDir, '2026-05-30.json'),
      JSON.stringify(testData, null, 2),
      'utf-8'
    )

    const day = loadFragmentDay(tmpRoot, 'test_slug', '2026-05-30')
    expect(day.version).toBe(3)
    expect(day.fragments.length).toBe(1)
    expect(day.fragments[0].content).toBe('测试')
  })
})

describe('saveFragmentDay', () => {
  test('保存并重新加载', () => {
    const day: FragmentDay = {
      date: '2026-05-30', crush_slug: 'test_slug',
      fragments: [], completed: false, direction: null,
      writing_context: null, version: 1, integration_date: null,
      created_at: '2026-05-30T00:00:00', updated_at: '2026-05-30T00:00:00',
    }

    const result = saveFragmentDay(tmpRoot, day)
    expect(result.success).toBe(true)
    expect(result.error).toBe('')

    // 验证文件存在
    const filePath = path.join(tmpRoot, 'crushes', 'test_slug', 'fragments', '2026-05-30.json')
    expect(fs.existsSync(filePath)).toBe(true)

    // 验证内容正确
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    expect(content.date).toBe('2026-05-30')
    expect(content.version).toBe(1)
  })

  test('自动创建目录', () => {
    const day: FragmentDay = {
      date: '2026-05-30', crush_slug: 'new_crush',
      fragments: [], completed: false, direction: null,
      writing_context: null, version: 1, integration_date: null,
      created_at: '2026-05-30T00:00:00', updated_at: '2026-05-30T00:00:00',
    }

    const result = saveFragmentDay(tmpRoot, day)
    expect(result.success).toBe(true)

    const dir = path.join(tmpRoot, 'crushes', 'new_crush', 'fragments')
    expect(fs.existsSync(dir)).toBe(true)
  })
})

describe('findFragment', () => {
  test('不存在的 ID 返回 null', () => {
    const result = findFragment(tmpRoot, 'frag_20260530_143000_abcd')
    expect(result.fragment).toBeNull()
    expect(result.day).toBeNull()
  })

  test('无效 ID 格式返回 null', () => {
    const result = findFragment(tmpRoot, 'invalid_id')
    expect(result.fragment).toBeNull()
    expect(result.day).toBeNull()
  })

  test('找到已存在的碎片', () => {
    const day: FragmentDay = {
      date: '2026-05-30', crush_slug: 'test_slug',
      fragments: [
        {
          id: 'frag_20260530_143000_abcd', date: '2026-05-30', time: '14:30',
          origin: 'user', mood: 'positive', content: '测试碎片',
          env_tags: [], behavior_tags: [], custom_tags: [],
          writing_mode: 'raw', theme: null, crush_slug: 'test_slug',
          created_at: '2026-05-30T14:30:00', updated_at: '2026-05-30T14:30:00',
        },
      ],
      completed: false, direction: null, writing_context: null,
      version: 1, integration_date: null,
      created_at: '2026-05-30T00:00:00', updated_at: '2026-05-30T00:00:00',
    }
    saveFragmentDay(tmpRoot, day)

    const result = findFragment(tmpRoot, 'frag_20260530_143000_abcd')
    expect(result.fragment).not.toBeNull()
    expect(result.fragment!.content).toBe('测试碎片')
    expect(result.day).not.toBeNull()
  })
})
