/**
 * 角色 CRUD（TS 等价实现，取代 src/scripts/init_template.py）。
 *
 * 行为与原 Python 实现保持一致：
 * - 数据存储在 <projectRoot>/crushes/<slug>/。
 * - create 幂等：目录已存在仅补齐缺失子目录/文件，不报错；meta.json 总是覆盖写入。
 *   memory.md / persona.md / .intimate_config 已存在则保留。
 * - list 遍历 crushes 目录并排序；有 meta.json 读它，无则只列 {slug}。
 * - get/update/delete 在目录或 meta.json 不存在时返回 {success:false, errors:["Crush 'x' not found"]}。
 * - meta 字段：name/nickname/slug/gender/description/intimate_enabled/version/created_at/updated_at。
 *   create 与 update 都刷新 updated_at；create 同时写 created_at。
 *
 * projectRoot 由调用方传入（ipc.ts 传 app.getAppPath()）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { readJson, writeJson } from '../persistence/settingsStore'

/** 角色元数据结构。 */
export interface CrushMeta {
  name: string
  nickname: string
  slug: string
  gender: string
  description: string
  intimate_enabled: boolean
  version: string
  created_at: string
  updated_at: string
}

/** 统一返回契约（对齐 Python {success, data?/errors?}）。
 *  delete 成功时无 data 字段（对齐 Python delete_crush 只返回 {success:true}）。 */
export type CrushResult =
  | { success: true; data: CrushMeta | CrushMeta[] }
  | { success: true }
  | { success: false; errors: string[] }

function crushDir(projectRoot: string, slug: string): string {
  return path.join(projectRoot, 'crushes', slug)
}

function nowISO(): string {
  // 对齐 Python datetime.now().isoformat()（本地时间，含微秒）
  return new Date().toISOString()
}

/**
 * 从 TEMPLATE 目录复制文件到新角色目录，替换占位符。
 * 对齐 Python init_template.py 的 copy_template 行为。
 */
function copyTemplateFile(
  templateDir: string,
  targetDir: string,
  filename: string,
  replacements: Record<string, string>
): void {
  const src = path.join(templateDir, filename)
  const dst = path.join(targetDir, filename)
  if (!fs.existsSync(src)) return
  let content = fs.readFileSync(src, 'utf-8')
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  fs.writeFileSync(dst, content, 'utf-8')
}

/**
 * 创建新的 crush 角色（幂等）。
 * 缺 name/nickname/slug 时返回 {success:false, errors}（对齐 Python CLI 校验）。
 * 从 TEMPLATE/ 复制完整文件集（9 文件），替换占位符。
 */
export function createCrush(
  projectRoot: string,
  params: { name: string; nickname: string; slug: string; description?: string; gender?: string }
): CrushResult {
  const { name, nickname, slug } = params
  if (!name || !nickname || !slug) {
    return { success: false, errors: ['--name, --nickname, --slug are required for create'] }
  }
  try {
    const dir = crushDir(projectRoot, slug)
    // 创建角色目录与子目录（幂等）
    fs.mkdirSync(path.join(dir, 'memories', 'chats'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'fragments'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'plans'), { recursive: true })

    const templateDir = path.join(projectRoot, 'crushes', 'TEMPLATE')
    const templateExists = fs.existsSync(templateDir)
    const now = nowISO()
    const replacements: Record<string, string> = {
      CHARACTER_NAME: name,
      CHARACTER_NICKNAME: nickname,
      SLUG: slug,
      TIMESTAMP: now,
    }

    if (templateExists) {
      // 从 TEMPLATE 复制所有模板文件并替换占位符
      const templateFiles = [
        'meta.json',
        'persona.md',
        'memory.md',
        'INTIMATE_KNOWLEDGE.md',
        'WEEKDAY.md',
        'CONTEXT.md',
        'SKILL.md',
        'PROMPT.md',
      ]
      for (const file of templateFiles) {
        copyTemplateFile(templateDir, dir, file, replacements)
      }
    } else {
      // TEMPLATE 不存在时回退到裸骨架（测试环境等场景）
      const meta: CrushMeta = {
        name,
        nickname,
        slug,
        gender: params.gender || 'unknown',
        description: params.description || '',
        intimate_enabled: false,
        version: 'v1',
        created_at: now,
        updated_at: now,
      }
      writeJson(path.join(dir, 'meta.json'), meta)
      const memoryFile = path.join(dir, 'memory.md')
      if (!fs.existsSync(memoryFile)) {
        fs.writeFileSync(memoryFile, `# ${nickname} 的记忆\n\n`, 'utf-8')
      }
      const personaFile = path.join(dir, 'persona.md')
      if (!fs.existsSync(personaFile)) {
        fs.writeFileSync(personaFile, `# ${nickname} 的性格\n\n`, 'utf-8')
      }
    }

    // .intimate_config：明确设为 false（用户安装后自行决定是否开启）
    const intimateFile = path.join(dir, '.intimate_config')
    if (!fs.existsSync(intimateFile)) {
      fs.writeFileSync(intimateFile, 'intimate=false\n', 'utf-8')
    }

    // 返回创建后的 meta
    const meta = readJson<CrushMeta>(path.join(dir, 'meta.json'))
    return { success: true, data: meta ?? { name, nickname, slug } as CrushMeta }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 列出所有 crush 角色（排序，无 meta.json 的目录只列 {slug}）。 */
export function listCrushes(projectRoot: string): CrushResult {
  try {
    const crushesDir = path.join(projectRoot, 'crushes')
    if (!fs.existsSync(crushesDir)) {
      return { success: true, data: [] }
    }
    const results: CrushMeta[] = []
    // 对齐 Python sorted(crushes_dir.iterdir())
    const entries = fs.readdirSync(crushesDir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    )
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // 跳过模板目录（模板文件含 {{VAR}} 占位符，不应作为角色列出）
      if (entry.name === 'TEMPLATE') continue
      const meta = readJson<CrushMeta>(path.join(crushesDir, entry.name, 'meta.json'))
      if (meta) {
        results.push(meta)
      } else {
        // 无 meta.json 的目录仍列出 slug（对齐 Python）
        results.push({ slug: entry.name } as CrushMeta)
      }
    }
    return { success: true, data: results }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 获取单个 crush 角色详情。 */
export function getCrush(projectRoot: string, slug: string): CrushResult {
  if (!slug) {
    return { success: false, errors: ['--slug is required for get'] }
  }
  try {
    const dir = crushDir(projectRoot, slug)
    const metaFile = path.join(dir, 'meta.json')
    if (!fs.existsSync(dir) || !fs.existsSync(metaFile)) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    const meta = readJson<CrushMeta>(metaFile)
    if (!meta) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    return { success: true, data: meta }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 更新 crush 角色信息（仅更新传入的字段，刷新 updated_at）。 */
export function updateCrush(
  projectRoot: string,
  params: {
    slug: string
    name?: string
    nickname?: string
    description?: string
    gender?: string
  }
): CrushResult {
  const { slug } = params
  if (!slug) {
    return { success: false, errors: ['--slug is required for update'] }
  }
  try {
    const dir = crushDir(projectRoot, slug)
    const metaFile = path.join(dir, 'meta.json')
    if (!fs.existsSync(dir) || !fs.existsSync(metaFile)) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    const meta = readJson<CrushMeta>(metaFile)
    if (!meta) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    // 仅更新传入的字段（对齐 Python: if x is not None）
    if (params.name !== undefined) meta.name = params.name
    if (params.nickname !== undefined) meta.nickname = params.nickname
    if (params.description !== undefined) meta.description = params.description
    if (params.gender !== undefined) meta.gender = params.gender
    meta.updated_at = nowISO()
    writeJson(metaFile, meta)
    return { success: true, data: meta }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 删除 crush 角色（删除整个目录）。 */
export function deleteCrush(projectRoot: string, slug: string): CrushResult {
  if (!slug) {
    return { success: false, errors: ['--slug is required for delete'] }
  }
  try {
    const dir = crushDir(projectRoot, slug)
    if (!fs.existsSync(dir)) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    fs.rmSync(dir, { recursive: true, force: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}
