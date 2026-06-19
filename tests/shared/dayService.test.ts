/**
 * dayService 单元测试（取代 tests/unit/test_day.py +
 *   tests/integration/test_day_integration.py +
 *   tests/cli/day.contract.test.ts）。
 *
 * 用临时目录隔离，不污染真实 crushes/。
 * 断言对齐原 Python DayService 行为。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  generateDay,
  listDays,
  getDay,
  updateDay,
  deleteDay,
  runPipeline,
} from '@/shared/day/dayService'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-day-'))
  fs.mkdirSync(path.join(tmpRoot, 'crushes'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

/** 创建测试用角色和 day 文件。 */
function setupCrushWithDay(
  slug: string,
  dayNumber: number,
  content: string = '# Day 1\n\n今天是第一天，我们相遇了。'
): string {
  const chatsDir = path.join(tmpRoot, 'crushes', slug, 'memories', 'chats')
  fs.mkdirSync(chatsDir, { recursive: true })
  const dayFile = path.join(chatsDir, `day${dayNumber}.md`)
  fs.writeFileSync(dayFile, content, 'utf-8')
  return dayFile
}

// ============================================================
// runPipeline（叙事生成核心）
// ============================================================
describe('runPipeline', () => {
  test('无 settings/apiKey 时返回错误', async () => {
    const result = await runPipeline(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('API Key')
  })

  test('dry_run 模式返回 prompt 不实际生成', async () => {
    // 创建最小角色目录结构（dry_run 也需要加载上下文，但不需要 apiKey）
    const personFile = path.join(tmpRoot, 'crushes', 'test', 'persona.md')
    fs.mkdirSync(path.dirname(personFile), { recursive: true })
    fs.writeFileSync(personFile, '# Test Persona\n\n测试角色。\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: 'dry run 测试',
      dry_run: true,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.system_prompt).toBeTruthy()
    expect(result.data.user_prompt).toBeTruthy()
    expect(result.data.user_prompt).toContain('dry run 测试')
  })
})

// ============================================================
// listDays
// ============================================================
describe('listDays', () => {
  test('空列表（slug 目录不存在 chats）', () => {
    // 只创建 crushes/<slug>/ 目录，不创建 memories/chats
    fs.mkdirSync(path.join(tmpRoot, 'crushes', 'empty'), { recursive: true })
    const result = listDays(tmpRoot, { slug: 'empty' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  test('空列表（chats 目录存在但无 day 文件）', () => {
    const chatsDir = path.join(tmpRoot, 'crushes', 'empty2', 'memories', 'chats')
    fs.mkdirSync(chatsDir, { recursive: true })
    const result = listDays(tmpRoot, { slug: 'empty2' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  test('列出 day 文件，按 day_number 排序', () => {
    setupCrushWithDay('test', 3, 'day3 content')
    setupCrushWithDay('test', 1, 'day1 content')
    setupCrushWithDay('test', 2, 'day2 content')

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.total).toBe(3)
    expect(result.data[0].day_number).toBe(1)
    expect(result.data[1].day_number).toBe(2)
    expect(result.data[2].day_number).toBe(3)
  })

  test('content 截前 200 字符', () => {
    const longContent = 'x'.repeat(500)
    setupCrushWithDay('test', 1, longContent)

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0].content.length).toBe(200)
    expect(result.data[0].content).toBe('x'.repeat(200))
  })

  test('分页：page 和 page_size', () => {
    for (let i = 1; i <= 5; i++) {
      setupCrushWithDay('test', i, `day${i}`)
    }

    const page1 = listDays(tmpRoot, { slug: 'test', page: 1, page_size: 2 })
    expect(page1.success).toBe(true)
    if (!page1.success) return
    expect(page1.data.length).toBe(2)
    expect(page1.data[0].day_number).toBe(1)
    expect(page1.data[1].day_number).toBe(2)
    expect(page1.total).toBe(5)

    const page3 = listDays(tmpRoot, { slug: 'test', page: 3, page_size: 2 })
    expect(page3.success).toBe(true)
    if (!page3.success) return
    expect(page3.data.length).toBe(1)
    expect(page3.data[0].day_number).toBe(5)
  })

  test('默认 page=1, page_size=20', () => {
    setupCrushWithDay('test', 1)

    const result = listDays(tmpRoot, { slug: 'test' })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.length).toBe(1)
  })
})

// ============================================================
// getDay
// ============================================================
describe('getDay', () => {
  test('获取存在的 day 详情', () => {
    setupCrushWithDay('test', 1, '# Day 1\n\n今天相遇了。')

    const result = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.content).toContain('Day 1')
    expect(result.data.content).toContain('今天相遇了')
    expect(result.data.slug).toBe('test')
    expect(result.data.day_number).toBe(1)
    expect(result.data.file_path).toContain('day1.md')
  })

  test('不存在的 day 返回错误', () => {
    setupCrushWithDay('test', 1)

    const result = getDay(tmpRoot, { slug: 'test', day_number: 999 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]).toContain('Day file not found')
  })

  test('slug 目录不存在也返回错误', () => {
    const result = getDay(tmpRoot, { slug: 'nonexistent', day_number: 1 })
    expect(result.success).toBe(false)
  })
})

// ============================================================
// updateDay
// ============================================================
describe('updateDay', () => {
  test('更新已存在的 day 内容（整体覆盖写入）', () => {
    setupCrushWithDay('test', 1, 'original')

    const result = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      content: '# Day 1\n\n更新后的内容',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.content).toBe('# Day 1\n\n更新后的内容')
    expect(result.data.slug).toBe('test')
    expect(result.data.day_number).toBe(1)

    // 验证文件内容已更新
    const dayFile = path.join(
      tmpRoot, 'crushes', 'test', 'memories', 'chats', 'day1.md'
    )
    const fileContent = fs.readFileSync(dayFile, 'utf-8')
    expect(fileContent).toBe('# Day 1\n\n更新后的内容')
  })

  test('更新不存在的 day 返回错误', () => {
    const result = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 999,
      content: 'new',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('Day file not found')
  })
})

// ============================================================
// deleteDay
// ============================================================
describe('deleteDay', () => {
  test('删除已存在的 day', () => {
    const dayFile = setupCrushWithDay('test', 1, 'content')

    const result = deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.slug).toBe('test')
    expect(result.data.day_number).toBe(1)

    // 验证文件已删除
    expect(fs.existsSync(dayFile)).toBe(false)
  })

  test('删除后 get 返回错误', () => {
    setupCrushWithDay('test', 1, 'content')

    deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    const getResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(getResult.success).toBe(false)
  })

  test('删除不存在的 day 返回错误', () => {
    const result = deleteDay(tmpRoot, { slug: 'test', day_number: 999 })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('Day file not found')
  })
})

// ============================================================
// generateDay
// ============================================================
describe('generateDay', () => {
  test('generate 已存在的 day 文件允许覆盖（不再报错"已存在"）', async () => {
    setupCrushWithDay('test', 1, '# Day 1\n\n旧内容')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: '新摘要',
    })
    // 不应返回"已存在"错误（旧行为），而是尝试生成（会因无 apiKey 失败）
    if (!result.success) {
      expect(result.errors[0]).not.toContain('已存在')
    }
  })

  test('generate 新 day 需 apiKey（无设置时返回错误）', async () => {
    // 创建角色文件让上下文加载不报错
    const crushDir = path.join(tmpRoot, 'crushes', 'test')
    fs.mkdirSync(crushDir, { recursive: true })
    fs.writeFileSync(path.join(crushDir, 'persona.md'), '# test\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      summary: '测试',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.errors[0]).toContain('API Key')
  })

  test('dry_run 模式无需 apiKey，返回 prompt 预览', async () => {
    const crushDir = path.join(tmpRoot, 'crushes', 'test')
    fs.mkdirSync(crushDir, { recursive: true })
    fs.writeFileSync(path.join(crushDir, 'persona.md'), '# test\n', 'utf-8')

    const result = await generateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      dry_run: true,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.summary).toBe('')
    expect(result.data.system_prompt).toBeTruthy()
    expect(result.data.user_prompt).toBeTruthy()
  })
})

// ============================================================
// 完整工作流（对齐 test_day_workflow 集成测试）
// ============================================================
describe('day 完整工作流', () => {
  test('list → get → update → verify → delete → verify', () => {
    setupCrushWithDay('test', 1, '# Day 1\n\n今天是第一天，我们相遇了。')

    // 1. 列表
    const listResult = listDays(tmpRoot, { slug: 'test' })
    expect(listResult.success).toBe(true)
    if (!listResult.success) return
    expect(listResult.data.length).toBeGreaterThanOrEqual(1)

    // 2. 获取详情
    const getResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(getResult.success).toBe(true)
    if (!getResult.success) return
    expect(getResult.data.content).toContain('Day 1')

    // 3. 更新
    const updateResult = updateDay(tmpRoot, {
      slug: 'test',
      day_number: 1,
      content: '# Day 1\n\n更新后的内容',
    })
    expect(updateResult.success).toBe(true)

    // 4. 验证更新
    const verifyResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(verifyResult.success).toBe(true)
    if (!verifyResult.success) return
    expect(verifyResult.data.content).toBe('# Day 1\n\n更新后的内容')

    // 5. 删除
    const deleteResult = deleteDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(deleteResult.success).toBe(true)

    // 6. 验证删除
    const deletedResult = getDay(tmpRoot, { slug: 'test', day_number: 1 })
    expect(deletedResult.success).toBe(false)
  })
})
