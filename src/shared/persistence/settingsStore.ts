/**
 * 应用设置持久化（TS 等价实现，取代 src/scripts/utils/file_utils.py）。
 *
 * 行为与原 Python 实现保持一致：
 * - settings 存储在 <projectRoot>/settings.json。
 * - 读取失败或文件不存在时返回空对象 {}。
 * - 写入时自动创建父目录，ensure_ascii=False（中文不转义），缩进 2 空格。
 *
 * projectRoot 由调用方传入（ipc.ts 传 app.getAppPath()），
 * 不在此处硬编码路径基准，避免依赖 __file__ 或 cwd。
 */
import * as fs from 'fs'
import * as path from 'path'

/** 读取 JSON 文件，失败或不存在返回 null（对齐 Python read_json）。 */
export function readJson<T = any>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/** 写入 JSON 文件（中文不转义、缩进 2），失败返回 false（对齐 Python write_json）。 */
export function writeJson(filePath: string, data: unknown): boolean {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch {
    return false
  }
}

/** 获取应用设置，文件缺失或读取失败时返回 {}（对齐 Python get_settings）。 */
export function getSettings(projectRoot: string): Record<string, any> {
  const settingsFile = path.join(projectRoot, 'settings.json')
  return readJson<Record<string, any>>(settingsFile) ?? {}
}

/**
 * 更新应用设置（整体覆盖写入，对齐 Python update_settings）。
 * 注意：原 Python 实现是整体覆盖而非合并——此处保持一致，调用方需先读后改再写。
 */
export function updateSettings(
  projectRoot: string,
  settings: Record<string, any>
): boolean {
  const settingsFile = path.join(projectRoot, 'settings.json')
  return writeJson(settingsFile, settings)
}
