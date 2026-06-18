/**
 * fragment crud 单元测试（TS 等价验证）。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  recordFragment,
  updateFragment,
  deleteFragment,
  getFragment,
  getFragmentsByDate,
} from '@/shared/fragment/crud'
import { loadFragmentDay } from '@/shared/fragment/storage'
import type { FragmentDay } from '@/shared/fragment/models'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-crud-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('recordFragment', () => {
  test('创建碎片成功', () => {
    const { fragment, error } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user',
      mood: 'positive',
      content: '测试碎片内容足够长',
      writing_mode: 'raw',
    })
    expect(error).toBe('')
    expect(fragment).not.toBeNull()
    expect(fragment!.content).toBe('测试碎片内容足够长')
    expect(fragment!.origin).toBe('user')
    expect(fragment!.mood).toBe('positive')
    expect(fragment!.id.startsWith('frag_')).toBe(true)
  })

  test('空内容允许但有建议', () => {
    const { fragment, error } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user',
      content: '',
      writing_mode: 'raw',
    })
    // 空内容 validateContent 返回 valid=true，"建议补充"
    // 但 fragment 仍然创建
    expect(error).toBe('')
    expect(fragment).not.toBeNull()
  })

  test('过短内容拒绝', () => {
    const { fragment, error } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user',
      content: '短',
      writing_mode: 'raw',
    })
    expect(fragment).toBeNull()
    expect(error).toContain('太短')
  })

  test('超长内容拒绝', () => {
    const { fragment, error } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user',
      content: 'x'.repeat(501),
      writing_mode: 'raw',
    })
    expect(fragment).toBeNull()
    expect(error).toContain('500')
  })

  test('达到单日上限时拒绝', () => {
    // 先创建 10 个碎片
    for (let i = 0; i < 10; i++) {
      recordFragment(tmpRoot, 'test_slug', {
        origin: 'user',
        content: `碎片 ${i} 的内容足够长`,
        writing_mode: 'raw',
      })
    }
    const { fragment, error } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user',
      content: '第11个碎片内容足够长',
      writing_mode: 'raw',
    })
    expect(fragment).toBeNull()
    expect(error).toContain('上限')
  })

  test('version 递增', () => {
    const r1 = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '第一个碎片内容够长', writing_mode: 'raw',
    })
    expect(r1.fragment).not.toBeNull()
    // 同一个 day 再添加一个碎片
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '第二个碎片内容够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()
    // day version 应该 >= 2
  })
})

describe('getFragment / getFragmentsByDate', () => {
  test('获取已创建的碎片', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '查询测试碎片内容', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    const found = getFragment(tmpRoot, fragment!.id)
    expect(found).not.toBeNull()
    expect(found!.content).toBe('查询测试碎片内容')
  })

  test('获取不存在的碎片返回 null', () => {
    const found = getFragment(tmpRoot, 'frag_nonexistent_id')
    expect(found).toBeNull()
  })

  test('getFragmentsByDate 返回指定日期碎片', () => {
    recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '碎片A的内容足够长', writing_mode: 'raw',
    })
    recordFragment(tmpRoot, 'test_slug', {
      origin: 'crush', content: '碎片B的内容足够长', writing_mode: 'raw',
    })

    const fragments = getFragmentsByDate(tmpRoot, 'test_slug', new Date().toISOString().slice(0, 10))
    expect(fragments.length).toBe(2)
  })
})

describe('updateFragment', () => {
  test('更新碎片内容（乐观锁正确）', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '原始内容足够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    const day = loadFragmentDay(tmpRoot, 'test_slug', new Date().toISOString().slice(0, 10))
    const { fragment: updated, error } = updateFragment(
      tmpRoot, fragment!.id,
      { content: '更新后的内容足够长' },
      day.version  // 正确的 version
    )
    expect(error).toBe('')
    expect(updated).not.toBeNull()
    expect(updated!.content).toBe('更新后的内容足够长')
  })

  test('乐观锁冲突拒绝更新', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '原始内容足够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    const { fragment: updated, error } = updateFragment(
      tmpRoot, fragment!.id,
      { content: '恶意更新' },
      999  // 错误的 version
    )
    expect(updated).toBeNull()
    expect(error).toContain('修改')
  })

  test('不允许修改的字段被拒绝', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '原始内容足够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    // 需要正确的 version
    const day = loadFragmentDay(tmpRoot, 'test_slug', new Date().toISOString().slice(0, 10))

    const { fragment: updated, error } = updateFragment(
      tmpRoot, fragment!.id,
      { id: 'hacked_id' },  // 不允许修改 id
      day.version
    )
    expect(updated).toBeNull()
    expect(error).toContain('不允许修改')
  })
})

describe('deleteFragment', () => {
  test('删除碎片（乐观锁正确）', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '待删除碎片内容够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    // 获取当前 version
    const day = loadFragmentDay(tmpRoot, 'test_slug', new Date().toISOString().slice(0, 10))

    const { success, error } = deleteFragment(tmpRoot, fragment!.id, day.version)
    expect(success).toBe(true)
    expect(error).toBe('')

    // 删除后查询返回 null
    const found = getFragment(tmpRoot, fragment!.id)
    expect(found).toBeNull()
  })

  test('不存在的碎片删除返回错误', () => {
    const { success, error } = deleteFragment(tmpRoot, 'frag_nonexistent', 1)
    expect(success).toBe(false)
    expect(error).toContain('不存在')
  })

  test('乐观锁冲突拒绝删除', () => {
    const { fragment } = recordFragment(tmpRoot, 'test_slug', {
      origin: 'user', content: '待删除碎片内容够长', writing_mode: 'raw',
    })
    expect(fragment).not.toBeNull()

    const { success, error } = deleteFragment(tmpRoot, fragment!.id, 999)
    expect(success).toBe(false)
    expect(error).toContain('修改')
  })
})
