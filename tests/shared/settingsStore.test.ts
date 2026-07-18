/**
 * settingsStore + intimateToggle 单元测试。
 *
 * 用 os.tmpdir() 隔离，避免污染真实 settings.json / crushes 目录。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  readJson,
  writeJson,
  getSettings,
  updateSettings,
} from '@/shared/persistence/settingsStore'
import {
  readIntimateConfig,
  writeIntimateConfig,
  getIntimateStatus,
  setIntimate,
} from '@/shared/persistence/intimateToggle'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yc-settings-'))
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('settingsStore - readJson / writeJson', () => {
  it('写入后能读回，中文不转义', () => {
    const file = path.join(tmpRoot, 'a.json')
    expect(writeJson(file, { name: '示例记录', n: 1 })).toBe(true)
    expect(readJson(file)).toEqual({ name: '示例记录', n: 1 })
    // 验证文件内容中文未转义。
    const raw = fs.readFileSync(file, 'utf-8')
    expect(raw).toContain('示例记录')
    expect(raw).not.toContain('\\u')
  })

  it('缩进为 2 空格', () => {
    const file = path.join(tmpRoot, 'b.json')
    writeJson(file, { a: 1 })
    const raw = fs.readFileSync(file, 'utf-8')
    expect(raw).toContain('\n  "a"')
  })

  it('文件不存在时 readJson 返回 null', () => {
    expect(readJson(path.join(tmpRoot, 'nope.json'))).toBeNull()
  })

  it('损坏 JSON 时 readJson 返回 null（不抛错）', () => {
    const file = path.join(tmpRoot, 'bad.json')
    fs.writeFileSync(file, '{ not valid json', 'utf-8')
    expect(readJson(file)).toBeNull()
  })

  it('writeJson 自动创建父目录', () => {
    const file = path.join(tmpRoot, 'nested', 'deep', 'c.json')
    expect(writeJson(file, { ok: true })).toBe(true)
    expect(readJson(file)).toEqual({ ok: true })
  })
})

describe('settingsStore - getSettings / updateSettings', () => {
  it('settings.json 不存在时返回 {}', () => {
    expect(getSettings(tmpRoot)).toEqual({})
  })

  it('updateSettings 后 getSettings 读回', () => {
    const settings = { theme: 'dark', language: 'zh', apiKey: 'sk-xxx' }
    expect(updateSettings(tmpRoot, settings)).toBe(true)
    expect(getSettings(tmpRoot)).toEqual(settings)
  })

  it('updateSettings 整体覆盖（非合并）', () => {
    updateSettings(tmpRoot, { a: 1, b: 2 })
    updateSettings(tmpRoot, { a: 99 }) // 不含 b
    const result = getSettings(tmpRoot)
    expect(result).toEqual({ a: 99 })
    expect(result).not.toHaveProperty('b')
  })
})

describe('intimateToggle', () => {
  const slug = 'test-crush'
  const crushesDir = () => path.join(tmpRoot, 'crushes')
  const configPath = () => path.join(crushesDir(), slug, '.intimate_config')

  beforeEach(() => {
    fs.mkdirSync(path.join(crushesDir(), slug), { recursive: true })
  })

  it('文件不存在时 readIntimateConfig 返回 false', () => {
    expect(readIntimateConfig(configPath())).toBe(false)
  })

  it('写入 true 后读取为 true', () => {
    writeIntimateConfig(configPath(), true)
    expect(readIntimateConfig(configPath())).toBe(true)
    // 验证文件格式。
    expect(fs.readFileSync(configPath(), 'utf-8')).toBe('intimate=true\n')
  })

  it('写入 false 后读取为 false', () => {
    writeIntimateConfig(configPath(), false)
    expect(readIntimateConfig(configPath())).toBe(false)
    expect(fs.readFileSync(configPath(), 'utf-8')).toBe('intimate=false\n')
  })

  it('兼容旧格式 "enabled: true"', () => {
    fs.writeFileSync(configPath(), 'enabled: true\n', 'utf-8')
    expect(readIntimateConfig(configPath())).toBe(true)
  })

  it('getIntimateStatus 角色目录不存在返回 null', () => {
    expect(getIntimateStatus(crushesDir(), 'no-such-slug')).toBeNull()
  })

  it('getIntimateStatus 返回当前状态', () => {
    writeIntimateConfig(configPath(), true)
    expect(getIntimateStatus(crushesDir(), slug)).toEqual({ enabled: true })
  })

  it('setIntimate 切换状态', () => {
    expect(setIntimate(crushesDir(), slug, true)).toEqual({ enabled: true })
    expect(readIntimateConfig(configPath())).toBe(true)
    expect(setIntimate(crushesDir(), slug, false)).toEqual({ enabled: false })
    expect(readIntimateConfig(configPath())).toBe(false)
  })

  it('setIntimate 已是目标状态时不重复写入', () => {
    writeIntimateConfig(configPath(), true)
    const before = fs.statSync(configPath()).mtimeMs
    // 等待确保 mtime 可区分
    const result = setIntimate(crushesDir(), slug, true)
    expect(result).toEqual({ enabled: true })
    const after = fs.statSync(configPath()).mtimeMs
    expect(after).toBe(before) // 未重写
  })

  it('setIntimate 角色目录不存在返回 null', () => {
    expect(setIntimate(crushesDir(), 'no-such-slug', true)).toBeNull()
  })
})
