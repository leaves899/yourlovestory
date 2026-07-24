/**
 * 日常写作服务，TS 等价实现。
 *
 * 主要行为与历史实现保持一致：
 * - 文件存储在 `<projectRoot>/crushes/<slug>/memories/chats/day<day_number>.md`
 * - list 按 `day_number` 排序，`content` 截前 200 字符，支持分页
 * - get/update/delete 在文件不存在时返回 `Day file not found`
 * - generate 调用 AI 生成叙事并写入 Day 文件
 */
import * as fs from 'fs'
import * as path from 'path'
import { getSettings } from '../persistence/settingsStore'
import { loadCrushContext } from '../crush/contextLoader'
import { buildSystemPrompt, buildUserPrompt, type CustomPrompts } from '../ai/promptBuilder'
import { generateNarrative } from '../ai/aiClient'
import {
  handleNarrativeComplete,
  type NarrativeCompleteResult,
} from '../relationship/manager'
import { loadProgress } from '../relationship/progress_store'
import { PHASE_PROMPT_CONFIG } from '../relationship/phase_prompts'
import { assertIntimateContentAllowed, getIntimatePolicy } from '../intimate/policy'
import { assertPhaseRulesAllowed } from '../intimate/policy'
import { assertSafeDayNumber, safeCrushPath } from '../security/pathSafety'

export type DayResult =
  | { success: true; data: any; total?: number }
  | { success: false; errors: string[] }

export interface GeneratedDayData {
  slug: string
  day_number: number
  content: string
  summary: string
  relationship?: NarrativeCompleteResult
}

export interface DayPromptPreviewData {
  slug: string
  day_number: number
  summary: string
  system_prompt: string
  user_prompt: string
}

export type GenerateDayResponse =
  | {
      success: true
      data: GeneratedDayData | DayPromptPreviewData
      warnings?: string[]
    }
  | { success: false; errors: string[] }

function chatsDir(projectRoot: string, slug: string): string {
  return safeCrushPath(projectRoot, slug, 'memories', 'chats')
}

function dayPath(projectRoot: string, slug: string, dayNumber: number): string {
  assertSafeDayNumber(dayNumber)
  return safeCrushPath(projectRoot, slug, 'memories', 'chats', `day${dayNumber}.md`)
}

function formatNotFound(filePath: string): DayResult {
  return { success: false, errors: [`Day file not found: ${filePath}`] }
}

function buildPhaseAwareSystemPrompt(
  projectRoot: string,
  slug: string,
  context: Parameters<typeof buildSystemPrompt>[0],
  params: Parameters<typeof buildSystemPrompt>[1],
  customPrompts?: CustomPrompts,
): string {
  const progress = loadProgress(projectRoot, slug)
  const policy = getIntimatePolicy(projectRoot, slug)
  assertPhaseRulesAllowed(policy, progress.current_phase)
  const phasePrompt = PHASE_PROMPT_CONFIG[progress.current_phase]
  const basePrompt = buildSystemPrompt(context, params, customPrompts)
  return `${basePrompt}\n\n---\n\n${phasePrompt.rules}`
}

/**
 * 运行日常写作流水线。
 *
 * 1. 加载 AI 设置
 * 2. 加载角色上下文
 * 3. 构建 system/user prompt
 * 4. 调用 AI 生成叙事
 * 5. 写入 Day 文件
 * 6. 文件写入成功后尝试更新关系进度
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
): Promise<GenerateDayResponse> {
  try {
    dayPath(projectRoot, params.slug, params.day_number)
    const intimatePolicy = getIntimatePolicy(projectRoot, params.slug)
    assertIntimateContentAllowed(intimatePolicy, {
      sexCount: params.sex_count,
      sexDetails: params.sex_details,
    })

    const settings = getSettings(projectRoot)
    const apiKey = settings.apiKey as string | undefined
    if (!apiKey) {
      return {
        success: false,
        errors: ['请先在设置中配置 AI API Key（打开设置页面，选择 Provider 并填写 API Key）'],
      }
    }

    const provider = (settings.provider as string) || 'anthropic'
    const modelId = (settings.model as string) || 'claude-sonnet-4-20250514'
    const temperature = (settings.temperature as number) ?? 0.8
    const maxTokens = (settings.maxTokens as number) ?? 4096

    console.log('[DayService] AI settings:', {
      provider,
      modelId,
      temperature,
      maxTokens,
      apiKeyConfigured: Boolean(apiKey),
    })

    const customPrompts: CustomPrompts = {
      customSystemPrompt: settings.customSystemPrompt as string | undefined,
      customUserPromptTemplate: settings.customUserPromptTemplate as string | undefined,
    }

    const ctx = loadCrushContext(projectRoot, params.slug)

    const systemPrompt = buildPhaseAwareSystemPrompt(
      projectRoot,
      params.slug,
      ctx,
      {
        dayNumber: params.day_number,
        summary: params.summary,
        sexCount: params.sex_count,
        sexDetails: params.sex_details,
        ycmPill: params.ycm_pill,
      },
      customPrompts,
    )
    const userPrompt = buildUserPrompt(
      params.slug,
      {
        dayNumber: params.day_number,
        summary: params.summary,
        sexCount: params.sex_count,
        sexDetails: params.sex_details,
        ycmPill: params.ycm_pill,
      },
      customPrompts
    )

    const narrative = await generateNarrative({
      systemPrompt,
      userPrompt,
      provider,
      modelId,
      apiKey,
      temperature,
      maxTokens,
    })

    const filePath = dayPath(projectRoot, params.slug, params.day_number)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, narrative, 'utf-8')

    const data: GeneratedDayData = {
      slug: params.slug,
      day_number: params.day_number,
      content: narrative,
      summary: params.summary ?? '',
    }

    const warnings: string[] = []
    try {
      data.relationship = handleNarrativeComplete(
        projectRoot,
        params.slug,
        narrative
      )
    } catch (error: any) {
      warnings.push(`关系进度更新失败: ${String(error?.message ?? error)}`)
    }

    return warnings.length > 0
      ? { success: true, data, warnings }
      : { success: true, data }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/**
 * 生成日常写作，流水线入口。
 */
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
): Promise<GenerateDayResponse> {
  try {
    dayPath(projectRoot, params.slug, params.day_number)
    const intimatePolicy = getIntimatePolicy(projectRoot, params.slug)
    assertIntimateContentAllowed(intimatePolicy, {
      sexCount: params.sex_count,
      sexDetails: params.sex_details,
    })

    if (params.dry_run) {
      const ctx = loadCrushContext(projectRoot, params.slug)
      const systemPrompt = buildPhaseAwareSystemPrompt(projectRoot, params.slug, ctx, {
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

/**
 * 获取日常写作列表。
 */
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

    const files = fs
      .readdirSync(dir)
      .filter((f) => {
        if (!/^day\d+\.md$/.test(f)) return false
        const dayNumber = Number(f.replace(/^day(\d+)\.md$/, '$1'))
        return Number.isSafeInteger(dayNumber) && dayNumber >= 1
      })
      .sort((a, b) => {
        const na = parseInt(a.replace(/^day(\d+)\.md$/, '$1'), 10)
        const nb = parseInt(b.replace(/^day(\d+)\.md$/, '$1'), 10)
        return na - nb
      })

    const days = files.map((f) => {
      const dayNumber = parseInt(f.replace(/^day(\d+)\.md$/, '$1'), 10)
      const fullPath = safeCrushPath(projectRoot, params.slug, 'memories', 'chats', f)
      const content = fs.readFileSync(fullPath, 'utf-8')
      return {
        slug: params.slug,
        day_number: dayNumber,
        content: content.slice(0, 200),
        file_path: fullPath,
      }
    })

    const start = (page - 1) * pageSize
    const end = start + pageSize
    const paginated = days.slice(start, end)

    return { success: true, data: paginated, total: days.length }
  } catch (e: any) {
    return { success: false, errors: [String(e?.message ?? e)] }
  }
}

/**
 * 获取日常写作详情。
 */
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

/**
 * 更新日常写作。
 */
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

/**
 * 删除日常写作。
 */
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
