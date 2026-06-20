/**
 * 关系进度系统管理器。
 *
 * 提供统一的对外接口，整合阶段检测、进度存储、Prompt 模板等功能。
 */

import {
  type RelationshipPhase,
  type ProgressData,
  type PhaseSignal,
  type PhaseTransitionResult,
} from './models'
import { detectPhaseSignals, checkPhaseTransition } from './phase_detector'
import {
  loadProgress,
  saveProgress,
  recordSignals,
  advancePhase,
  incrementNarrativeCount,
  setPhase,
} from './progress_store'
import { getPhaseWritingRules, buildPhaseAwareSystemPrompt } from './phase_prompts'

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
): {
  signals: PhaseSignal[]
  shouldTransition: boolean
  transitionMessage?: string
  progress: ProgressData
} {
  // 检测信号
  const { signals, transitionResult, progress } = detectNarrativeSignals(
    projectRoot,
    crushSlug,
    narrativeText
  )

  // 记录信号
  if (signals.length > 0) {
    recordSignals(projectRoot, crushSlug, signals)
  }

  // 增加叙事计数
  incrementNarrativeCount(projectRoot, crushSlug)

  return {
    signals,
    shouldTransition: transitionResult.shouldTransition,
    transitionMessage: transitionResult.message,
    progress: loadProgress(projectRoot, crushSlug), // 重新加载最新进度
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
