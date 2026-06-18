/**
 * pythonRunner 单元测试
 *
 * 覆盖 buildArgs 连字符转换、parsePythonJSON 边界、runPythonSync 真实调用。
 */
import { buildArgs, parsePythonJSON, runPythonSync } from '@/shared/pythonRunner'

describe('buildArgs', () => {
  it('下划线 key 转为连字符 flag', () => {
    expect(buildArgs({ env_tags: ['工作'] })).toEqual(['--env-tags', '["工作"]'])
    expect(buildArgs({ day_number: 3 })).toEqual(['--day-number', '3'])
    expect(buildArgs({ fragment_id: 'frag_001' })).toEqual(['--fragment-id', 'frag_001'])
  })

  it('数组值 JSON.stringify', () => {
    expect(buildArgs({ behavior_tags: ['聊天', '约会'] })).toEqual([
      '--behavior-tags',
      '["聊天","约会"]',
    ])
  })

  it('标量值 String()', () => {
    expect(buildArgs({ action: 'record', slug: 'demo' })).toEqual([
      '--action',
      'record',
      '--slug',
      'demo',
    ])
  })

  it('undefined / null 被跳过', () => {
    expect(buildArgs({ a: undefined, b: null, c: 1 })).toEqual(['--c', '1'])
  })

  it('保留无下划线的 key 原样', () => {
    expect(buildArgs({ action: 'create', name: '小明' })).toEqual([
      '--action',
      'create',
      '--name',
      '小明',
    ])
  })
})

describe('parsePythonJSON', () => {
  it('直接解析纯 JSON', () => {
    expect(parsePythonJSON('{"success": true, "data": []}')).toEqual({
      success: true,
      data: [],
    })
  })

  it('跳过 RuntimeWarning 前缀行', () => {
    const stdout =
      "<frozen runpy>:128: RuntimeWarning: 'src.scripts.day.service' found in sys.modules...\n" +
      '{"success": true, "data": [], "total": 0}'
    expect(parsePythonJSON(stdout)).toEqual({ success: true, data: [], total: 0 })
  })

  it('stdout 不含 { 时抛带原始输出的清晰错误', () => {
    const stdout = 'something went wrong, no json here'
    expect(() => parsePythonJSON(stdout)).toThrow(/非 JSON/)
    expect(() => parsePythonJSON(stdout)).toThrow('something went wrong')
  })

  it('空输出抛清晰错误（不因 slice(-1) 切坏）', () => {
    expect(() => parsePythonJSON('   ')).toThrow(/非 JSON/)
  })
})

describe('runPythonSync', () => {
  it('调用真实 day.service list 返回 JSON（验证 python -m 可用，无 ImportError）', () => {
    const result = runPythonSync(
      'src.scripts.day.service',
      buildArgs({ action: 'list', slug: 'nonexistent_test_slug' })
    )
    // service.py 对不存在的 crush 返回 success:true 空列表
    expect(result.exitCode).toBe(0)
    const parsed = parsePythonJSON(result.stdout)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual([])
  })

  it('调用 fragment.manager list 同样走 -m 无 ImportError', () => {
    const result = runPythonSync(
      'src.scripts.fragment.manager',
      buildArgs({ action: 'list', slug: 'nonexistent_test_slug' })
    )
    expect(result.exitCode).toBe(0)
    const parsed = parsePythonJSON(result.stdout)
    expect(parsed.success).toBe(true)
  })

  it('缺失必需参数时 exitCode≠0 且结果携带 stderr', () => {
    // 不传 --action，argparse 必报错退出
    const result = runPythonSync('src.scripts.day.service', [])
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.length).toBeGreaterThan(0)
  })
})
