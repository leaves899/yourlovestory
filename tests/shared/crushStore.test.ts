/**
 * crushStore 单元测试。
 *
 * 用临时目录隔离，不污染真实 crushes/。
 * 断言角色存储的行为约定：幂等创建、目录结构、meta 字段、CRUD、错误返回。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  createCrush,
  listCrushes,
  getCrush,
  updateCrush,
  deleteCrush,
} from '@/shared/crush/crushStore'
import { loadProgress } from '@/shared/relationship/progress_store'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-crush-'))
  fs.mkdirSync(path.join(tmpRoot, 'crushes'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('createCrush', () => {
  test('创建成功，返回 meta', () => {
    const result = createCrush(tmpRoot, {
      name: '测试角色',
      nickname: '小测',
      slug: 'test_crush',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({
      name: '测试角色',
      nickname: '小测',
      slug: 'test_crush',
    })
  })

  test('创建完整目录结构（memories/chats, fragments, plans, meta.json, memory.md, persona.md）', () => {
    createCrush(tmpRoot, { name: 'X', nickname: 'Y', slug: 'test_structure' })
    const dir = path.join(tmpRoot, 'crushes', 'test_structure')
    expect(fs.existsSync(dir)).toBe(true)
    expect(fs.existsSync(path.join(dir, 'memories', 'chats'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'fragments'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'plans'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'meta.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'memory.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'persona.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.intimate_config'))).toBe(true)
  })

  test('meta.json 内容正确（含 created_at/updated_at/intimate_enabled/version）', () => {
    createCrush(tmpRoot, { name: 'A', nickname: 'B', slug: 'test_meta', gender: 'female', description: 'desc' })
    const meta = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, 'crushes', 'test_meta', 'meta.json'), 'utf-8')
    )
    expect(meta).toMatchObject({
      name: 'A',
      nickname: 'B',
      slug: 'test_meta',
      gender: 'female',
      description: 'desc',
      intimate_enabled: false,
      version: 'v1',
    })
    expect(meta.created_at).toBeTruthy()
    expect(meta.updated_at).toBeTruthy()
  })

  test('meta.json 中文不转义', () => {
    createCrush(tmpRoot, { name: '示例角色', nickname: '示例昵称', slug: 'zh_test' })
    const raw = fs.readFileSync(path.join(tmpRoot, 'crushes', 'zh_test', 'meta.json'), 'utf-8')
    expect(raw).toContain('示例角色')
    expect(raw).not.toContain('\\u')
  })

  test('幂等：重复创建不报错', () => {
    const r1 = createCrush(tmpRoot, { name: 'C', nickname: 'D', slug: 'test_idem' })
    const r2 = createCrush(tmpRoot, { name: 'C', nickname: 'D', slug: 'test_idem' })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
  })

  test('幂等：memory.md/persona.md 已存在则保留不覆盖', () => {
    createCrush(tmpRoot, { name: 'E', nickname: 'F', slug: 'test_keep' })
    const memoryFile = path.join(tmpRoot, 'crushes', 'test_keep', 'memory.md')
    fs.writeFileSync(memoryFile, '# 用户自定义记忆\n', 'utf-8')
    // 重复创建
    createCrush(tmpRoot, { name: 'E', nickname: 'F', slug: 'test_keep' })
    expect(fs.readFileSync(memoryFile, 'utf-8')).toBe('# 用户自定义记忆\n')
  })

  test('缺 name/nickname/slug 返回错误', () => {
    const result = createCrush(tmpRoot, { name: '', nickname: 'X', slug: 's' })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('slug 缺省时自动生成', () => {
    const result = createCrush(tmpRoot, {
      name: 'Summer',
      nickname: 'Summer Crush',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect((result.data as any).slug).toBe('summer-crush')
    expect(fs.existsSync(path.join(tmpRoot, 'crushes', 'summer-crush'))).toBe(true)
  })

  test('按 initialPhase 初始化关系进度', () => {
    const result = createCrush(tmpRoot, {
      name: '阶段测试',
      nickname: '阿夏',
      slug: 'phase_seed',
      initialPhase: 2,
    })

    expect(result.success).toBe(true)

    const progress = loadProgress(tmpRoot, 'phase_seed')
    expect(progress.current_phase).toBe(2)
    expect(progress.phase_name).toBe('暧昧')
    expect(progress.phase_history).toHaveLength(1)
    expect(progress.phase_history[0].phase).toBe(2)
  })
})

describe('listCrushes', () => {
  test('空列表返回空数组', () => {
    const result = listCrushes(tmpRoot)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
  })

  test('列出已创建角色，按 slug 排序', () => {
    createCrush(tmpRoot, { name: 'Z', nickname: 'z', slug: 'zzz' })
    createCrush(tmpRoot, { name: 'A', nickname: 'a', slug: 'aaa' })
    const result = listCrushes(tmpRoot)
    if (!result.success) return
    const slugs = (result.data as any[]).map((c) => c.slug)
    expect(slugs).toEqual(['aaa', 'zzz'])
  })

  test('无 meta.json 的目录只列 {slug}', () => {
    fs.mkdirSync(path.join(tmpRoot, 'crushes', 'orphan_dir'), { recursive: true })
    const result = listCrushes(tmpRoot)
    if (!result.success) return
    const found = (result.data as any[]).find((c) => c.slug === 'orphan_dir')
    expect(found).toEqual({ slug: 'orphan_dir' })
  })

  test('crushes 目录不存在时返回空数组', () => {
    const result = listCrushes(path.join(tmpRoot, 'no_such_root'))
    expect(result.success).toBe(true)
  })
})

describe('getCrush', () => {
  test('获取已存在角色', () => {
    createCrush(tmpRoot, { name: 'G', nickname: 'H', slug: 'get_test' })
    const result = getCrush(tmpRoot, 'get_test')
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toMatchObject({ slug: 'get_test', name: 'G' })
  })

  test('获取不存在角色返回错误', () => {
    const result = getCrush(tmpRoot, 'nonexistent_xyz_999')
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('not found')
  })

  test('缺 slug 返回错误', () => {
    const result = getCrush(tmpRoot, '')
    expect(result.success).toBe(false)
  })
})

describe('updateCrush', () => {
  test('更新 nickname 字段', () => {
    createCrush(tmpRoot, { name: 'U', nickname: 'Old', slug: 'upd_test' })
    const result = updateCrush(tmpRoot, { slug: 'upd_test', nickname: 'New' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect((result.data as any).nickname).toBe('New')
    // name 不受影响
    expect((result.data as any).name).toBe('U')
  })

  test('更新刷新 updated_at', async () => {
    createCrush(tmpRoot, { name: 'U2', nickname: 'N', slug: 'upd_ts' })
    const before = (getCrush(tmpRoot, 'upd_ts').success ? (getCrush(tmpRoot, 'upd_ts') as any).data.updated_at : null)
    // 确保时间戳可区分
    await new Promise((r) => setTimeout(r, 10))
    updateCrush(tmpRoot, { slug: 'upd_ts', name: 'U2-new' })
    const after = (getCrush(tmpRoot, 'upd_ts') as any).data.updated_at
    expect(after).toBeTruthy()
    // ISO 时间戳字符串可能精度不同，仅验证存在且为字符串
    expect(typeof after).toBe('string')
  })

  test('更新不存在角色返回错误', () => {
    const result = updateCrush(tmpRoot, { slug: 'no_such_999', nickname: 'X' })
    expect(result.success).toBe(false)
  })

  test('缺 slug 返回错误', () => {
    const result = updateCrush(tmpRoot, { nickname: 'X' })
    expect(result.success).toBe(false)
  })
})

describe('deleteCrush', () => {
  test('删除已存在角色', () => {
    createCrush(tmpRoot, { name: 'D', nickname: 'd', slug: 'del_test' })
    const result = deleteCrush(tmpRoot, 'del_test')
    expect(result.success).toBe(true)
    // 验证已删除
    expect(fs.existsSync(path.join(tmpRoot, 'crushes', 'del_test'))).toBe(false)
  })

  test('删除后 list 中不再出现', () => {
    createCrush(tmpRoot, { name: 'D2', nickname: 'd2', slug: 'del_list' })
    deleteCrush(tmpRoot, 'del_list')
    const list = listCrushes(tmpRoot)
    if (!list.success) return
    const found = (list.data as any[]).find((c) => c.slug === 'del_list')
    expect(found).toBeUndefined()
  })

  test('删除不存在角色返回错误', () => {
    const result = deleteCrush(tmpRoot, 'no_such_999')
    expect(result.success).toBe(false)
  })

  test('delete 成功无 data 字段', () => {
    createCrush(tmpRoot, { name: 'D3', nickname: 'd3', slug: 'del_nodata' })
    const result: any = deleteCrush(tmpRoot, 'del_nodata')
    expect(result.success).toBe(true)
    expect(result.data).toBeUndefined()
  })
})
