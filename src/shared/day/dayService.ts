/**
 * 日常写作服务（TS 等价实现，取代 src/scripts/day/service.py + pipeline.py）。
 *
 * 行为与原 Python 实现保持一致：
 * - 文件存储在 <projectRoot>/crushes/<slug>/memories/chats/day<day_number>.md。
 * - list 按 day_number 排序，content 截前 200 字符，支持分页。
 * - get/update/delete 在文件不存在时返回 {success:false, errors:["Day file not found: <path>"]}。
 * - generate 调用 runPipeline 生成叙事（使用 pi-ai 的 complete API）。
 * - update 整体覆盖写入 content；delete 删文件。
 *
 * projectRoot 由调用方传入（ipc.ts 传 app.getAppPath()）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { getSettings } from '../persistence/settingsStore'
import { loadCrushContext } from '../crush/contextLoader'
import { buildSystemPrompt, buildUserPrompt, type CustomPrompts } from '../ai/promptBuilder'
import { generateNarrative } from '../ai/aiClient'

/** 统一返回契约（对齐 Python DayService）。 */
export type DayResult =
  | { success: true; data: any; total?: number }
  | { success: false; errors: string[] }

function chatsDir(projectRoot: string, slug: string): string {
  return path.join(projectRoot, 'crushes', slug, 'memories', 'chats')
}

function dayPath(projectRoot: string, slug: string, dayNumber: number): string {
  return path.join(chatsDir(projectRoot, slug), `day${dayNumber}.md`)
}

function formatNotFound(filePath: string): DayResult {
  return { success: false, errors: [`Day file not found: ${filePath}`] }
}

/**
 * 运行日常写作流水线 —— 叙事生成核心。
 *
 * 1. 加载 AI 设置（settings.json）
 * 2. 加载角色上下文（persona / memory / WEEKDAY / intimate knowledge）
 * 3. 构建 system + user prompt
 * 4. 调用 pi-ai complete 生成叙事
 * 5. 写入 Day 文件
 *
 * @returns 包含生成内容的 DayResult
 */
export async function runPipeline(
  projectRoot: string,
  params: {
    slug: string
    day_number: number
    summary?: string
    sex_count?: number
    sex_details?: string
    handwriting?: string
    ycm_pill?: number
  }
): Promise<DayResult> {
  try {
    // 1. 加载 AI 设置
    const settings = getSettings(projectRoot)
    console.log('[DayService] 加载的设置:', JSON.stringify(settings, null, 2))

    const apiKey = settings.apiKey as string | undefined
    if (!apiKey) {
      return {
        success: false,
        errors: ['请先在设置中配置 AI API Key（打开设置页面，选择 Provider 并填入 API Key）'],
      }
    }

    const provider = (settings.provider as string) || 'anthropic'
    const modelId = (settings.model as string) || 'claude-sonnet-4-20250514'
    const temperature = (settings.temperature as number) ?? 0.8
    const maxTokens = (settings.maxTokens as number) ?? 4096

    console.log('[DayService] AI 配置:', { provider, modelId, temperature, maxTokens })

    // 读取自定义提示词配置
    const customPrompts: CustomPrompts = {
      customSystemPrompt: settings.customSystemPrompt as string | undefined,
      customUserPromptTemplate: settings.customUserPromptTemplate as string | undefined,
    }

    // 2. 加载角色上下文
    const ctx = loadCrushContext(projectRoot, params.slug)

    // 3. 构建 prompt
    const systemPrompt = buildSystemPrompt(ctx, {
      dayNumber: params.day_number,
      summary: params.summary,
      sexCount: params.sex_count,
      sexDetails: params.sex_details,
      ycmPill: params.ycm_pill,
    }, customPrompts)
    const userPrompt = buildUserPrompt(params.slug, {
      dayNumber: params.day_number,
      summary: params.summary,
      sexCount: params.sex_count,
      sexDetails: params.sex_details,
      ycmPill: params.ycm_pill,
    }, customPrompts)

    // 4. 调用 AI 生成叙事
    const narrative = await generateNarrative({
      systemPrompt,
      userPrompt,
      provider,
      modelId,
      apiKey,
      temperature,
      maxTokens,
    })

    // 5. 写入文件
    const filePath = dayPath(projectRoot, params.slug, params.day_number)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, narrative, 'utf-8')

    return {
      success: true,
      data: {
        slug: params.slug,
        day_number: params.day_number,
        content: narrative,
        summary: params.summary ?? '',
      },
    }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 生成日常写作（流水线入口，等价 Python DayService.generate）。
 *  异步：等待 AI 生成完成后返回结果。 */
export async function generateDay(
  projectRoot: string,
  params: {
    slug: string
    day_number: number
    summary?: string
    sex_count?: number
    sex_details?: string
    handwriting?: string
    ycm_pill?: number
    dry_run?: boolean
    skip_skill?: boolean
    skip_check?: boolean
  }
): Promise<DayResult> {
  try {
    const filePath = dayPath(projectRoot, params.slug, params.day_number)

    // 已存在时允许覆盖（重新生成场景）
    const isOverwrite = fs.existsSync(filePath)

    // dry_run：只构建 prompt 不实际生成
    if (params.dry_run) {
      const ctx = loadCrushContext(projectRoot, params.slug)
      const systemPrompt = buildSystemPrompt(ctx, {
        dayNumber: params.day_number,
        summary: params.summary,
        sexCount: params.sex_count,
        sexDetails: params.sex_details,
        ycmPill: params.ycm_pill,
      })
      const userPrompt = buildUserPrompt(params.slug, {
        dayNumber: params.day_number,
        summary: params.summary,
        sexCount: params.sex_count,
        sexDetails: params.sex_details,
        ycmPill: params.ycm_pill,
      })
      return {
        success: true,
        data: {
          slug: params.slug,
          day_number: params.day_number,
          summary: params.summary ?? '',
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
        },
      }
    }

    return await runPipeline(projectRoot, params)
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 获取日常写作列表（等价 Python DayService.list）。 */
export function listDays(
  projectRoot: string,
  params: { slug: string; page?: number; page_size?: number }
): DayResult {
  try {
    const dir = chatsDir(projectRoot, params.slug)
    const page = params.page ?? 1
    const pageSize = params.page_size ?? 20

    if (!fs.existsSync(dir)) {
      return { success: true, data: [], total: 0 }
    }

    // 对齐 Python sorted(chats_dir.glob('day*.md'))
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^day\d+\.md$/.test(f))
      .sort((a, b) => {
        const na = parseInt(a.replace(/^day(\d+)\.md$/, '$1'), 10)
        const nb = parseInt(b.replace(/^day(\d+)\.md$/, '$1'), 10)
        return na - nb
      })

    const days = files.map((f) => {
      // 对齐 Python day_file.stem.replace('day', '')
      const dayNumber = parseInt(f.replace(/^day(\d+)\.md$/, '$1'), 10)
      const fullPath = path.join(dir, f)
      const content = fs.readFileSync(fullPath, 'utf-8')
      return {
        slug: params.slug,
        day_number: dayNumber,
        content: content.slice(0, 200), // 列表只返回前 200 字符作为预览
        file_path: fullPath,
      }
    })

    // 分页
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paginated = days.slice(start, end)

    return { success: true, data: paginated, total: days.length }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 获取日常写作详情（等价 Python DayService.get）。 */
export function getDay(
  projectRoot: string,
  params: { slug: string; day_number: number }
): DayResult {
  try {
    const filePath = dayPath(projectRoot, params.slug, params.day_number)

    if (!fs.existsSync(filePath)) {
      return formatNotFound(filePath)
    }

    const content = fs.readFileSync(filePath, 'utf-8')

    return {
      success: true,
      data: {
        slug: params.slug,
        day_number: params.day_number,
        content,
        file_path: filePath,
      },
    }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 更新日常写作（等价 Python DayService.update）。 */
export function updateDay(
  projectRoot: string,
  params: { slug: string; day_number: number; content: string }
): DayResult {
  try {
    const filePath = dayPath(projectRoot, params.slug, params.day_number)

    if (!fs.existsSync(filePath)) {
      return formatNotFound(filePath)
    }

    fs.writeFileSync(filePath, params.content, 'utf-8')

    return {
      success: true,
      data: {
        slug: params.slug,
        day_number: params.day_number,
        content: params.content,
      },
    }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/** 删除日常写作（等价 Python DayService.delete）。 */
export function deleteDay(
  projectRoot: string,
  params: { slug: string; day_number: number }
): DayResult {
  try {
    const filePath = dayPath(projectRoot, params.slug, params.day_number)

    if (!fs.existsSync(filePath)) {
      return formatNotFound(filePath)
    }

    fs.unlinkSync(filePath)

    return {
      success: true,
      data: {
        slug: params.slug,
        day_number: params.day_number,
      },
    }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}
