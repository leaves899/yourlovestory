/**
 * 角色上下文加载器 —— 读取 crush 角色的全部文本文件。
 *
 * 负责从 crushes/<slug>/ 目录读取角色定义文件，
 * 并根据 .intimate_config 决定是否加载亲密知识库。
 */
import * as fs from 'fs'
import * as path from 'path'
import { readIntimateConfig } from '../persistence/intimateToggle'

/** 角色上下文数据结构 */
export interface CrushContext {
  /** 角色性格档案（persona.md 全文） */
  persona: string
  /** 关系记忆（memory.md 全文） */
  memory: string
  /** 星期速查表（WEEKDAY.md 全文） */
  weekday: string
  /** 压缩上下文（CONTEXT.md 全文） */
  contextSummary: string
  /** 亲密知识库（INTIMATE_KNOWLEDGE.md 全文），仅 intimate=true 时非 null */
  intimateKnowledge: string | null
  /** 是否启用亲密模式 */
  intimateEnabled: boolean
}

/**
 * 安全读取文本文件，不存在时返回空字符串。
 */
function readTextFile(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim()
    }
  } catch {
    // 读取失败静默返回空
  }
  return ''
}

/**
 * 加载指定角色的完整上下文。
 *
 * @param projectRoot - 项目根目录
 * @param slug - 角色标识符
 * @returns CrushContext 包含所有可用文本
 */
export function loadCrushContext(projectRoot: string, slug: string): CrushContext {
  const crushDir = path.join(projectRoot, 'crushes', slug)

  const intimateConfigPath = path.join(crushDir, '.intimate_config')
  const intimateEnabled = readIntimateConfig(intimateConfigPath)

  const persona = readTextFile(path.join(crushDir, 'persona.md'))
  const memory = readTextFile(path.join(crushDir, 'memory.md'))
  const weekday = readTextFile(path.join(crushDir, 'WEEKDAY.md'))
  const contextSummary = readTextFile(path.join(crushDir, 'CONTEXT.md'))

  let intimateKnowledge: string | null = null
  if (intimateEnabled) {
    const ik = readTextFile(path.join(crushDir, 'INTIMATE_KNOWLEDGE.md'))
    if (ik) {
      intimateKnowledge = ik
    }
  }

  return {
    persona,
    memory,
    weekday,
    contextSummary,
    intimateKnowledge,
    intimateEnabled,
  }
}
