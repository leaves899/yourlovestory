/**
 * 角色 CRUD。
 *
 * 行为约定：
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
import { readJson, writeJson } from '../persistence/settingsStore'
import type { RelationshipPhase } from '../relationship/models'
import { initializeProgress } from '../relationship/progress_store'
import { safeCrushPath, safeJoinUnder, isSafeSlug } from '../security/pathSafety'
import { buildDefaultCrushSlug, sanitizeCrushSlug } from './slug'

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

/** 统一返回契约（{success, data?/errors?}）。
 * delete 成功时不包含 data 字段。 */
export type CrushResult =
  | { success: true; data: CrushMeta | CrushMeta[] }
  | { success: true }
  | { success: false; errors: string[] }

function crushDir(projectRoot: string, slug: string): string {
  return safeCrushPath(projectRoot, slug)
}

function nowISO(): string {
  // 使用 ISO 时间戳，保持数据格式稳定。
  return new Date().toISOString()
}

/**
 * 从 TEMPLATE 目录复制文件到新角色目录，替换占位符。
 * 保持模板复制的幂等行为。
 */
function copyTemplateFile(
  templateDir: string,
  targetDir: string,
  filename: string,
  replacements: Record<string, string>,
  overwrite: boolean = false
): void {
  const src = safeJoinUnder(templateDir, filename)
  const dst = safeJoinUnder(targetDir, filename)
  if (!fs.existsSync(src)) return
  if (!overwrite && fs.existsSync(dst)) return
  let content = fs.readFileSync(src, 'utf-8')
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }
  fs.writeFileSync(dst, content, 'utf-8')
}

/**
 * 创建新的 crush 角色（幂等）。
 * 缺 name/nickname/slug 时返回 {success:false, errors}。
 * 从 TEMPLATE/ 复制完整文件集（9 文件），替换占位符。
 *
 * @param projectRoot - 用户数据目录（可读写）
 * @param params - 角色参数
 * @param templateRoot - 模板所在目录（可选，默认与 projectRoot 相同）
 */
export function createCrush(
  projectRoot: string,
  params: {
    name: string
    nickname: string
    slug?: string
    description?: string
    gender?: string
    initialPhase?: RelationshipPhase
  },
  templateRoot?: string
): CrushResult {
  const { name, nickname } = params
  if (!name || !nickname) {
    return { success: false, errors: ['--name and --nickname are required for create'] }
  }
  try {
    const resolvedSlug =
      sanitizeCrushSlug(params.slug) || buildDefaultCrushSlug(name, nickname)
    const dir = crushDir(projectRoot, resolvedSlug)
    const metaFile = safeJoinUnder(dir, 'meta.json')
    const existingMeta = readJson<CrushMeta>(metaFile)
    const now = nowISO()

    // 创建角色目录与子目录（幂等）
    fs.mkdirSync(safeJoinUnder(dir, 'memories', 'chats'), { recursive: true })
    fs.mkdirSync(safeJoinUnder(dir, 'fragments'), { recursive: true })
    fs.mkdirSync(safeJoinUnder(dir, 'plans'), { recursive: true })

    // 模板目录：优先使用 templateRoot，否则使用 projectRoot
    const templateDir = templateRoot
      ? safeJoinUnder(templateRoot, 'crushes', 'TEMPLATE')
      : safeJoinUnder(projectRoot, 'crushes', 'TEMPLATE')
    const templateExists = fs.existsSync(templateDir)
    const replacements: Record<string, string> = {
      CHARACTER_NAME: name,
      CHARACTER_NICKNAME: nickname,
      SLUG: resolvedSlug,
      TIMESTAMP: now,
    }

    if (templateExists) {
      // 从 TEMPLATE 复制所有模板文件并替换占位符
      const templateFiles = [
        { filename: 'meta.json', overwrite: true },
        { filename: 'persona.md', overwrite: false },
        { filename: 'memory.md', overwrite: false },
        { filename: 'INTIMATE_KNOWLEDGE.md', overwrite: false },
        { filename: 'WEEKDAY.md', overwrite: false },
        { filename: 'CONTEXT.md', overwrite: false },
        { filename: 'PROMPT.md', overwrite: false },
      ]
      for (const { filename, overwrite } of templateFiles) {
        copyTemplateFile(templateDir, dir, filename, replacements, overwrite)
      }
    }

    const fallbackContextFiles: Record<string, string> = {
      'persona.md': `# ${nickname} 的性格\n\n待补充角色性格、语言习惯与行为边界。\n`,
      'memory.md': `# ${nickname} 的记忆\n\n暂无已确认的长期记忆。\n`,
      'WEEKDAY.md': '# 星期与日程\n\n根据当前日期动态计算星期，不在角色资料中硬编码日期。\n',
      'CONTEXT.md': `# ${nickname} 的上下文\n\n角色名称：${name}\n角色昵称：${nickname}\n`,
      'INTIMATE_KNOWLEDGE.md': '# 亲密内容知识\n\n亲密内容默认关闭，仅在显式启用后使用。\n',
      'PROMPT.md': `# ${nickname} 的叙事提示\n\n保持角色设定一致，并优先使用已确认的上下文与记忆。\n`,
    }
    for (const [filename, content] of Object.entries(fallbackContextFiles)) {
      const targetFile = safeJoinUnder(dir, filename)
      if (!fs.existsSync(targetFile)) {
        fs.writeFileSync(targetFile, content, 'utf-8')
      }
    }

    const meta: CrushMeta = {
      name,
      nickname,
      slug: resolvedSlug,
      gender: params.gender || existingMeta?.gender || 'unknown',
      description: params.description || existingMeta?.description || '',
      intimate_enabled: existingMeta?.intimate_enabled ?? false,
      version: existingMeta?.version || 'v1',
      created_at: existingMeta?.created_at || now,
      updated_at: now,
    }
    writeJson(metaFile, meta)

    // .intimate_config：明确设为 false（用户安装后自行决定是否开启）
    const intimateFile = safeJoinUnder(dir, '.intimate_config')
    if (!fs.existsSync(intimateFile)) {
      fs.writeFileSync(intimateFile, 'intimate=false\n', 'utf-8')
    }

    const progressInit = initializeProgress(
      projectRoot,
      resolvedSlug,
      params.initialPhase ?? 0
    )
    if (!progressInit.success) {
      return { success: false, errors: [progressInit.error] }
    }

    return { success: true, data: meta }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 列出所有 crush 角色（排序，无 meta.json 的目录只列 {slug}）。 */
export function listCrushes(projectRoot: string): CrushResult {
  try {
    const crushesDir = safeJoinUnder(projectRoot, 'crushes')
    if (!fs.existsSync(crushesDir)) {
      return { success: true, data: [] }
    }
    const results: CrushMeta[] = []
    // 按目录名排序，保证列表顺序稳定。
    const entries = fs.readdirSync(crushesDir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0
    )
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // 跳过模板目录（模板文件含 {{VAR}} 占位符，不应作为角色列出）
      if (entry.name === 'TEMPLATE') continue
      if (!isSafeSlug(entry.name)) continue
      const meta = readJson<CrushMeta>(safeJoinUnder(crushesDir, entry.name, 'meta.json'))
      if (meta) {
        results.push(meta)
      } else {
        // 无 meta.json 的目录仍列出 slug，便于发现残留数据。
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
    const metaFile = safeJoinUnder(dir, 'meta.json')
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
    const metaFile = safeJoinUnder(dir, 'meta.json')
    if (!fs.existsSync(dir) || !fs.existsSync(metaFile)) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    const meta = readJson<CrushMeta>(metaFile)
    if (!meta) {
      return { success: false, errors: [`Crush '${slug}' not found`] }
    }
    // 仅更新调用方传入的字段。
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
