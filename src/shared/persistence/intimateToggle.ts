/**
 * 亲密内容开关（TS 等价实现，取代 src/scripts/toggle_intimate.py 的核心逻辑）。
 *
 * 行为与原 Python 实现保持一致：
 * - 配置文件路径：<crushesDir>/<slug>/.intimate_config
 * - 读取：文件不存在返回 false；内容含 "intimate=true" 或旧格式 "enabled: true" 返回 true。
 * - 写入：新格式 "intimate=true\n" 或 "intimate=false\n"。
 *
 * 注意：原 Python 是独立 CLI 工具（支持 --enable/--disable/--status），
 * 此处仅迁移核心读写逻辑供 TS 调用；CLI 入口不再需要（应用内通过 UI 触发）。
 */
import * as fs from 'fs'
import * as path from 'path'

/** 亲密配置文件名（对齐 Python）。 */
const CONFIG_FILENAME = '.intimate_config'

/** 读取亲密配置：文件不存在返回 false，兼容新旧格式。 */
export function readIntimateConfig(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false
  const content = fs.readFileSync(configPath, 'utf-8').trim()
  return content.includes('intimate=true') || content.includes('enabled: true')
}

/** 写入亲密配置（新格式 intimate=true/false）。 */
export function writeIntimateConfig(configPath: string, enabled: boolean): void {
  fs.writeFileSync(configPath, `intimate=${enabled ? 'true' : 'false'}\n`, 'utf-8')
}

/** 亲密内容状态结果。 */
export interface IntimateStatus {
  enabled: boolean
}

/**
 * 查询指定角色的亲密内容状态。
 * @param crushesDir crushes 目录绝对路径
 * @param slug 角色 slug
 */
export function getIntimateStatus(
  crushesDir: string,
  slug: string
): IntimateStatus | null {
  const targetDir = path.join(crushesDir, slug)
  if (!fs.existsSync(targetDir)) return null
  const configPath = path.join(targetDir, CONFIG_FILENAME)
  return { enabled: readIntimateConfig(configPath) }
}

/**
 * 设置指定角色的亲密内容开关。
 * @returns 新状态；角色目录不存在时返回 null。
 */
export function setIntimate(
  crushesDir: string,
  slug: string,
  enabled: boolean
): IntimateStatus | null {
  const targetDir = path.join(crushesDir, slug)
  if (!fs.existsSync(targetDir)) return null
  const configPath = path.join(targetDir, CONFIG_FILENAME)
  const current = readIntimateConfig(configPath)
  if (current !== enabled) {
    writeIntimateConfig(configPath, enabled)
  }
  return { enabled }
}
