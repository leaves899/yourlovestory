/**
 * 关系进度系统管理器。
 *
 * 提供统一的对外接口，整合阶段检测、进度存储、Prompt 模板等功能。
 */

import {
  type ProgressData,
  type PhaseSignal,
  type PhaseTransitionResult,
} from './models'
import { detectPhaseSignals, checkPhaseTransition } from './phase_detector'
import {
  loadProgress,
  saveProgress,
  advancePhase,
  setPhase,
} from './progress_store'
import { getPhaseWritingRules, buildPhaseAwareSystemPrompt } from './phase_prompts'

const INTERACTION_SIGNAL_TYPES = new Set([
  'has_dialogue',
  'knows_name',
  'has_contact',
])

const FLIRTING_SIGNAL_TYPES = new Set([
  'physical_contact',
  'late_night_chat',
  'alone_time',
  'gift_exchange',
])

export interface NarrativeCompleteResult {
  signals: PhaseSignal[]
  shouldTransition: boolean
  transitionMessage?: string
  progress: ProgressData
}

/**
 * 检测叙事文本的阶段信号。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param narrativeText - 叙事文本
 * @returns 检测结果（信号、推进判断、进度数据）
 */
export function detectNarrativeSignals(
  projectRoot: string,
  crushSlug: string,
  narrativeText: string
): {
  signals: PhaseSignal[]
  transitionResult: PhaseTransitionResult
  progress: ProgressData
} {
  const progress = loadProgress(projectRoot, crushSlug)
  const signals = detectPhaseSignals(narrativeText, progress.current_phase)
  const transitionResult = checkPhaseTransition(
    progress.current_phase,
    progress.accumulated_score,
    signals
  )

  return {
    signals,
    transitionResult,
    progress,
  }
}

function applyNarrativeProgress(progress: ProgressData, signals: PhaseSignal[]): void {
  progress.total_narratives += 1

  const currentHistory = progress.phase_history[progress.phase_history.length - 1]
  if (currentHistory) {
    currentHistory.narrative_count += 1
  }

  if (signals.length === 0) {
    return
  }

  progress.signals.push(...signals)
  progress.accumulated_score += signals.reduce((sum, signal) => sum + signal.score, 0)

  if (signals.some((signal) => INTERACTION_SIGNAL_TYPES.has(signal.type))) {
    progress.interaction_narratives += 1
  }

  if (signals.some((signal) => FLIRTING_SIGNAL_TYPES.has(signal.type))) {
    progress.flirting_signals += 1
  }
}

/**
 * 处理叙事完成事件。
 *
 * 在叙事完成后调用，自动检测信号并更新进度。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param narrativeText - 叙事文本
 * @returns 处理结果（是否触发阶段推进）
 */
export function handleNarrativeComplete(
  projectRoot: string,
  crushSlug: string,
  narrativeText: string
): NarrativeCompleteResult {
  const { signals, transitionResult, progress } = detectNarrativeSignals(
    projectRoot,
    crushSlug,
    narrativeText
  )

  applyNarrativeProgress(progress, signals)

  const saveResult = saveProgress(projectRoot, progress)
  if (!saveResult.success) {
    throw new Error(saveResult.error)
  }

  return {
    signals,
    shouldTransition: transitionResult.shouldTransition,
    transitionMessage: transitionResult.message,
    progress,
  }
}

/**
 * 确认阶段推进。
 *
 * 用户确认后调用，将阶段推进到下一阶段。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param reason - 推进原因（可选）
 * @returns 推进后的进度数据
 */
export function confirmPhaseAdvance(
  projectRoot: string,
  crushSlug: string,
  reason?: string
): ProgressData {
  return advancePhase(projectRoot, crushSlug, reason)
}

/**
 * 获取阶段专属写作规则。
 *
 * @param phase - 关系阶段
 * @returns 写作规则
 */
export { getPhaseWritingRules }

/**
 * 构建包含阶段规则的系统 Prompt。
 *
 * @param basePrompt - 基础 Prompt
 * @param phase - 关系阶段
 * @returns 包含阶段规则的系统 Prompt
 */
export { buildPhaseAwareSystemPrompt }

/**
 * 加载进度数据。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @returns 进度数据
 */
export { loadProgress }

/**
 * 手动设置阶段。
 *
 * @param projectRoot - 项目根目录
 * @param crushSlug - 角色标识
 * @param targetPhase - 目标阶段
 * @returns 更新后的进度数据
 */
export { setPhase }
