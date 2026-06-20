/**
 * 进度数据存储。
 *
 * 管理关系进度数据的读写，包括进度文件的创建、加载、保存等。
 */

import * as fs from 'fs'
import * as path from 'path'
import {
  type ProgressData,
  type RelationshipPhase,
  type PhaseSignal,
  type PhaseHistory,
  PHASE_NAMES,
} from './models'

/** 获取进度文件路径 */
function getProgressFilePath(projectRoot: string, crushSlug: string): string {
  return path.join(projectRoot, 'crushes', crushSlug, 'progress.json')
}

/**
 * 加载进度数据，不存在时返回默认值。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @returns 进度数据
 */
export function loadProgress(projectRoot: string, crushSlug: string): ProgressData {
  const filePath = getProgressFilePath(projectRoot, crushSlug)

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      // JSON 损坏则返回默认值
    }
  }

  // 返回默认进度数据
  return createDefaultProgress(crushSlug)
}

/**
 * 保存进度数据。
 *
 * @param projectRoot - 项目根目录
 * @param progress - 进度数据
 * @returns 保存结果
 */
export function saveProgress(projectRoot: string, progress: ProgressData): { success: boolean; error: string } {
  const filePath = getProgressFilePath(projectRoot, progress.crush_slug)

  try {
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })

    progress.updated_at = new Date().toISOString()
    const json = JSON.stringify(progress, null, 2)
    fs.writeFileSync(filePath, json, 'utf-8')

    return { success: true, error: '' }
  } catch (e: any) {
    return { success: false, error: `保存进度数据失败: ${e?.message ?? e}` }
  }
}

/**
 * 创建默认进度数据。
 *
 * @param crushSlug - 角色标识
 * @returns 默认进度数据
 */
function createDefaultProgress(crushSlug: string): ProgressData {
  const now = new Date().toISOString()

  return {
    crush_slug: crushSlug,
    current_phase: 0,
    phase_name: PHASE_NAMES[0],
    total_narratives: 0,
    interaction_narratives: 0,
    flirting_signals: 0,
    accumulated_score: 0,
    threshold: 60,
    signals: [],
    phase_history: [{
      phase: 0,
      phase_name: PHASE_NAMES[0],
      started_at: now,
      narrative_count: 0,
    }],
    created_at: now,
    updated_at: now,
  }
}

/**
 * 记录阶段信号。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param signals - 信号列表
 * @returns 更新后的进度数据
 */
export function recordSignals(
  projectRoot: string,
  crushSlug: string,
  signals: PhaseSignal[]
): ProgressData {
  const progress = loadProgress(projectRoot, crushSlug)

  // 添加新信号
  progress.signals.push(...signals)

  // 更新累积分数
  const newScore = signals.reduce((sum, s) => sum + s.score, 0)
  progress.accumulated_score += newScore

  // 更新统计
  if (signals.some(s => ['has_dialogue', 'knows_name', 'has_contact'].includes(s.type))) {
    progress.interaction_narratives += 1
  }
  if (signals.some(s => ['physical_contact', 'late_night_chat', 'alone_time', 'gift_exchange'].includes(s.type))) {
    progress.flirting_signals += 1
  }

  saveProgress(projectRoot, progress)
  return progress
}

/**
 * 推进到下一阶段。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param reason - 推进原因（可选）
 * @returns 更新后的进度数据
 */
export function advancePhase(
  projectRoot: string,
  crushSlug: string,
  reason?: string
): ProgressData {
  const progress = loadProgress(projectRoot, crushSlug)

  if (progress.current_phase >= 3) {
    return progress // 已是最高阶段
  }

  const now = new Date().toISOString()

  // 结束当前阶段历史
  const currentHistory = progress.phase_history[progress.phase_history.length - 1]
  if (currentHistory && !currentHistory.ended_at) {
    currentHistory.ended_at = now
    currentHistory.duration_days = calculateDays(currentHistory.started_at, now)
    currentHistory.transition_reason = reason
  }

  // 推进到下一阶段
  progress.current_phase = (progress.current_phase + 1) as RelationshipPhase
  progress.phase_name = PHASE_NAMES[progress.current_phase]
  progress.accumulated_score = 0
  progress.threshold = getThresholdForPhase(progress.current_phase)

  // 添加新阶段历史
  progress.phase_history.push({
    phase: progress.current_phase,
    phase_name: progress.phase_name,
    started_at: now,
    narrative_count: 0,
  })

  saveProgress(projectRoot, progress)
  return progress
}

/**
 * 增加叙事计数。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @returns 更新后的进度数据
 */
export function incrementNarrativeCount(
  projectRoot: string,
  crushSlug: string
): ProgressData {
  const progress = loadProgress(projectRoot, crushSlug)

  progress.total_narratives += 1

  // 更新当前阶段历史的叙事计数
  const currentHistory = progress.phase_history[progress.phase_history.length - 1]
  if (currentHistory) {
    currentHistory.narrative_count += 1
  }

  saveProgress(projectRoot, progress)
  return progress
}

/**
 * 手动设置阶段。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param targetPhase - 目标阶段
 * @returns 更新后的进度数据
 */
export function setPhase(
  projectRoot: string,
  crushSlug: string,
  targetPhase: RelationshipPhase
): ProgressData {
  const progress = loadProgress(projectRoot, crushSlug)

  if (targetPhase === progress.current_phase) {
    return progress
  }

  const now = new Date().toISOString()

  // 结束当前阶段历史
  const currentHistory = progress.phase_history[progress.phase_history.length - 1]
  if (currentHistory && !currentHistory.ended_at) {
    currentHistory.ended_at = now
    currentHistory.duration_days = calculateDays(currentHistory.started_at, now)
    currentHistory.transition_reason = '手动调整'
  }

  // 设置目标阶段
  progress.current_phase = targetPhase
  progress.phase_name = PHASE_NAMES[targetPhase]
  progress.accumulated_score = 0
  progress.threshold = getThresholdForPhase(targetPhase)

  // 添加新阶段历史
  progress.phase_history.push({
    phase: targetPhase,
    phase_name: PHASE_NAMES[targetPhase],
    started_at: now,
    narrative_count: 0,
    transition_reason: '手动调整',
  })

  saveProgress(projectRoot, progress)
  return progress
}

// 辅助函数

function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

function getThresholdForPhase(phase: RelationshipPhase): number {
  const thresholds: Record<number, number> = {
    0: 60,
    1: 70,
    2: -1,
    3: -1,
    4: -1,
  }
  return thresholds[phase] ?? -1
}
