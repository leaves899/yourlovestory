/**
 * 日常写作服务（TS 等价实现，取代 src/scripts/day/service.py + pipeline.py）。
 *
 * 行为与原 Python 实现保持一致：
 * - 文件存储在 <projectRoot>/crushes/<slug>/memories/chats/day<day_number>.md。
 * - list 按 day_number 排序，content 截前 200 字符，支持分页。
 * - get/update/delete 在文件不存在时返回 {success:false, errors:["Day file not found: <path>"]}。
 * - generate 调用 runPipeline（空壳，返回固定 dict）。
 * - update 整体覆盖写入 content；delete 删文件。
 *
 * projectRoot 由调用方传入（ipc.ts 传 app.getAppPath()）。
 */
import * as fs from 'fs'
import * as path from 'path'

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
 * 运行日常写作流水线（空壳，等价 Python pipeline.py 的 run_pipeline）。
 * 目前返回固定成功 dict，不执行任何实际逻辑。
 */
export function runPipeline(params: {
  slug: string
}): { success: true; data: { slug: string } } {
  return {
    success: true,
    data: { slug: params.slug },
  }
}

/** 生成日常写作（流水线入口，等价 Python DayService.generate）。 */
export function generateDay(
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
): DayResult {
  try {
    const filePath = dayPath(projectRoot, params.slug, params.day_number)

    if (!fs.existsSync(filePath)) {
      return formatNotFound(filePath)
    }

    runPipeline({ slug: params.slug })

    return {
      success: true,
      data: {
        slug: params.slug,
        day_number: params.day_number,
        summary: params.summary ?? '',
      },
    }
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
        content: content.slice(0, 200), // 只返回前 200 字符
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
