/**
 * 碎片日记（manager.py）CLI 契约测试
 *
 * 验证碎片记录、列表、获取、更新、删除的 JSON 输出格式。
 * 每个测试用例创建临时角色，测试结束后清理。
 */
import { runPythonScript, parseResult, testSlug, MODULES, createTestCrush, deleteTestCrush } from './runner'

const SLUG_PREFIX = 'smoke_frag'
const PROJECT_ROOT = process.cwd()

describe('fragment CLI contract (manager.py)', () => {
  let slug: string

  beforeEach(() => {
    slug = testSlug(SLUG_PREFIX)
    createTestCrush(PROJECT_ROOT, slug)
  })

  afterEach(() => {
    deleteTestCrush(PROJECT_ROOT, slug)
  })

  const today = new Date().toISOString().slice(0, 10)

  test('record fragment - success', () => {
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'positive',
      content: 'This is a smoke test fragment with enough characters to pass',
      date: today,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(data.data).toBeDefined()
    expect(data.data.id).toMatch(/^frag_\d{8}_\d{6}_\w{4}$/)
    expect(data.data.content).toContain('smoke test fragment')
    expect(data.data.origin).toBe('user')
    expect(data.data.mood).toBe('positive')
    expect(data.data.crush_slug).toBe(slug)
  })

  test('record fragment with tags', () => {
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'crush',
      mood: 'mixed',
      content: 'Fragment with tags test content must be long enough',
      'env-tags': JSON.stringify(['work', 'cafe']),
      'behavior-tags': JSON.stringify(['chat']),
      date: today,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(data.data.env_tags).toEqual(['work', 'cafe'])
    expect(data.data.behavior_tags).toEqual(['chat'])
  })

  test('list fragments by date', () => {
    runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'neutral',
      content: 'List test fragment content with enough characters',
      date: today,
    })

    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'list',
      slug,
      date: today,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data.length).toBeGreaterThan(0)
  })

  test('list fragments without date - returns empty list', () => {
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'list',
      slug,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(data.data).toEqual([])
  })

  test('record fragment with short content - returns error', () => {
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'positive',
      content: 'x',
      date: today,
    })

    const data = parseResult(result)
    expect(data.success).toBe(false)
    expect(data.errors).toBeDefined()
    expect(data.errors.length).toBeGreaterThan(0)
  })

  test('get fragment by ID', () => {
    const recordResult = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'positive',
      content: 'Get test fragment content with sufficient length',
      date: today,
    })
    const recordData = parseResult(recordResult)
    const fragmentId = recordData.data.id

    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'get',
      slug,
      'fragment-id': fragmentId,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe(fragmentId)
    expect(data.data.content).toContain('Get test fragment')
  })

  test('get fragment without --fragment-id - returns error', () => {
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'get',
      slug,
    })

    const data = parseResult(result)
    expect(data.success).toBe(false)
    expect(data.errors).toBeDefined()
  })

  test('update fragment content with correct version', () => {
    // Record a fragment
    const recordResult = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'positive',
      content: 'Update test fragment content with sufficient length',
      date: today,
    })
    const recordData = parseResult(recordResult)
    const fragmentId = recordData.data.id

    // Get the current day version from list
    const listResult = runPythonScript(MODULES.FRAGMENT, {
      action: 'list',
      slug,
      date: today,
    })
    // The version is in the FragmentDay, not in the fragment data.
    // After record, version should be 2 (initial = 1, record bumps to 2).
    // Use --expected-version 2 to match.
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'update',
      slug,
      'fragment-id': fragmentId,
      'expected-version': 2,
      content: 'Updated fragment content with sufficient length now',
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
    expect(data.data.content).toContain('Updated fragment')
  })

  test('delete fragment with correct version', () => {
    // Record a fragment
    const recordResult = runPythonScript(MODULES.FRAGMENT, {
      action: 'record',
      slug,
      origin: 'user',
      mood: 'positive',
      content: 'Delete test fragment content with sufficient length',
      date: today,
    })
    const recordData = parseResult(recordResult)
    const fragmentId = recordData.data.id

    // After record, version should be 2
    const result = runPythonScript(MODULES.FRAGMENT, {
      action: 'delete',
      slug,
      'fragment-id': fragmentId,
      'expected-version': 2,
    })

    expect(result.exitCode).toBe(0)
    const data = parseResult(result)
    expect(data.success).toBe(true)
  })
})