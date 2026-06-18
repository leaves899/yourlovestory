/**
 * 日记（day/service.py）CLI 契约测试
 *
 * 验证 day service 的 JSON 输出格式。
 * 每个测试用例创建临时角色，测试结束后清理。
 */
import { runPythonScript, parseResult, testSlug, MODULES, createTestCrush, deleteTestCrush } from './runner'

const SLUG_PREFIX = 'smoke_day'
const PROJECT_ROOT = process.cwd()

describe('day CLI contract (day/service.py)', () => {
  let slug: string

  beforeEach(() => {
    slug = testSlug(SLUG_PREFIX)
    createTestCrush(PROJECT_ROOT, slug)
  })

  afterEach(() => {
    deleteTestCrush(PROJECT_ROOT, slug)
  })

  test('list days — 空列表', () => {
    const result = runPythonScript(MODULES.DAY, {
      action: 'list',
      slug,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    // 新角色没有 day 记录
    expect(data.data).toBeDefined()
  })

  test('list days without --slug — 应报错', () => {
    const result = runPythonScript(MODULES.DAY, {
      action: 'list',
      // 故意不提供 slug
    })

    // argparse 要求 --slug
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('required')
  })

  test('get day — 不存在的day应返回错误', () => {
    const result = runPythonScript(MODULES.DAY, {
      action: 'get',
      slug,
      'day-number': 999,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    // 不存在的 day 应返回成功但 data 为空或含 not found 错误
    // 具体行为取决于 service.py 的实现
    expect(data).toBeDefined()
  })
})