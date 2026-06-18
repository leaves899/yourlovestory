/**
 * fragment locker 单元测试（TS 等价验证）。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  getFragmentDay,
  completeDay,
  getDayStatus,
  getDayEditState,
} from '@/shared/fragment/locker'
import { recordFragment } from '@/shared/fragment/crud'
import { loadFragmentDay } from '@/shared/fragment/storage'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-locker-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('getFragmentDay', () => {
  test('新日期返回空 FragmentDay', () => {
    const day = getFragmentDay(tmpRoot, 'test', '2026-05-30')
    expect(day.date).toBe('2026-05-30')
    expect(day.version).toBe(1)
  })
})

describe('completeDay', () => {
  test('乐观锁冲突拒绝', () => {
    const day = getFragmentDay(tmpRoot, 'test', '2026-05-30')
    const { success, error } = completeDay(
      tmpRoot, 'test', '2026-05-30', '叙事', 999, null, day
    )
    expect(success).toBe(false)
    expect(error).toContain('修改')
  })

  test('正确 version 标记完成', () => {
    const today = new Date().toISOString().slice(0, 10)
    // 先添加有内容的碎片
    recordFragment(tmpRoot, 'test', {
      origin: 'user', content: '有效碎片内容足够长', writing_mode: 'raw',
    })
    const day = loadFragmentDay(tmpRoot, 'test', today)

    const { success, error } = completeDay(
      tmpRoot, 'test', today, '叙事内容', day.version
    )
    expect(success).toBe(true)
    expect(error).toBe('')
  })

  test('空碎片拒绝完成', () => {
    const day = getFragmentDay(tmpRoot, 'test', '2026-05-30')
    const { success, error } = completeDay(
      tmpRoot, 'test', '2026-05-30', '叙事', day.version, null, day
    )
    expect(success).toBe(false)
    expect(error).toContain('空')
  })
})

describe('getDayStatus / getDayEditState', () => {
  test('新日期状态为 in_progress', () => {
    const status = getDayStatus(tmpRoot, 'test', new Date().toISOString().slice(0, 10))
    expect(status).toBe('in_progress')
  })

  test('新日期编辑状态为 editable', () => {
    const state = getDayEditState(tmpRoot, 'test', new Date().toISOString().slice(0, 10))
    expect(state).toBe('editable')
  })
})
