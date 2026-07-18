/**
 * 阶段检测算法。
 *
 * 分析叙事文本，检测阶段推进信号，判断是否应该推进阶段。
 */

import {
  type RelationshipPhase,
  type PhaseSignal,
  type PhaseTransitionResult,
  SIGNAL_CONFIGS,
  PHASE_THRESHOLDS,
  PHASE_NAMES,
} from './models'

/**
 * 分析叙事文本，检测阶段推进信号。
 *
 * @param narrativeText - 叙事文本
 * @param currentPhase - 当前阶段
 * @returns 检测到的信号列表
 */
export function detectPhaseSignals(
  narrativeText: string,
  currentPhase: RelationshipPhase
): PhaseSignal[] {
  const signals: PhaseSignal[] = []
  const now = new Date().toISOString()

  // 获取当前阶段适用的信号配置
  const applicableSignals = SIGNAL_CONFIGS.filter(config => config.phase === currentPhase)

  for (const config of applicableSignals) {
    const matchedKeywords = findMatchingKeywords(narrativeText, config.keywords)

    if (matchedKeywords.length > 0) {
      signals.push({
        type: config.type,
        description: config.description,
        score: config.score,
        detected_at: now,
        narrative_excerpt: extractExcerpt(narrativeText, matchedKeywords[0]),
      })
    }
  }

  return signals
}

/**
 * 在文本中查找匹配的关键词。
 *
 * @param text - 文本
 * @param keywords - 关键词列表
 * @returns 匹配的关键词列表
 */
function findMatchingKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter(keyword => text.includes(keyword))
}

/**
 * 提取关键词周围的上下文摘录。
 *
 * @param text - 文本
 * @param keyword - 关键词
 * @param contextLength - 上下文长度（默认 50）
 * @returns 上下文摘录
 */
function extractExcerpt(text: string, keyword: string, contextLength: number = 50): string {
  const index = text.indexOf(keyword)
  if (index === -1) return ''

  const start = Math.max(0, index - contextLength)
  const end = Math.min(text.length, index + keyword.length + contextLength)

  let excerpt = text.slice(start, end)
  if (start > 0) excerpt = '...' + excerpt
  if (end < text.length) excerpt = excerpt + '...'

  return excerpt
}

/**
 * 检查是否应该推进阶段。
 *
 * @param currentPhase - 当前阶段
 * @param accumulatedScore - 当前累积分数
 * @param newSignals - 本次检测到的信号
 * @returns 推进检测结果
 */
export function checkPhaseTransition(
  currentPhase: RelationshipPhase,
  accumulatedScore: number,
  newSignals: PhaseSignal[]
): PhaseTransitionResult {
  // 已是最高阶段
  if (currentPhase >= 4) {
    return {
      shouldTransition: false,
      currentPhase,
      nextPhase: null,
      currentScore: accumulatedScore,
      threshold: -1,
      signals: newSignals,
    }
  }

  // Phase 2 -> 3 和 Phase 3 -> 4 需要手动触发
  if (currentPhase >= 2) {
    return {
      shouldTransition: false,
      currentPhase,
      nextPhase: (currentPhase + 1) as RelationshipPhase,
      currentScore: accumulatedScore,
      threshold: -1,
      signals: newSignals,
      message: currentPhase === 2 ? '表白阶段需要手动触发' : '热恋阶段需要手动触发',
    }
  }

  // 计算新分数
  const newScore = newSignals.reduce((sum, signal) => sum + signal.score, 0)
  const totalScore = accumulatedScore + newScore
  const threshold = PHASE_THRESHOLDS[currentPhase]

  // 检查是否达到阈值
  if (totalScore >= threshold) {
    const nextPhase = (currentPhase + 1) as RelationshipPhase
    return {
      shouldTransition: true,
      currentPhase,
      nextPhase,
      currentScore: totalScore,
      threshold,
      signals: newSignals,
      message: generateTransitionMessage(currentPhase, nextPhase, newSignals),
    }
  }

  return {
    shouldTransition: false,
    currentPhase,
    nextPhase: (currentPhase + 1) as RelationshipPhase,
    currentScore: totalScore,
    threshold,
    signals: newSignals,
  }
}

/**
 * 生成阶段推进提示消息。
 *
 * @param currentPhase - 当前阶段
 * @param nextPhase - 下一阶段
 * @param signals - 检测到的信号
 * @returns 提示消息
 */
function generateTransitionMessage(
  currentPhase: RelationshipPhase,
  nextPhase: RelationshipPhase,
  signals: PhaseSignal[]
): string {
  const signalDescriptions = signals.map(s => `- ${s.description}`).join('\n')

  return `你们的关系似乎从「${PHASE_NAMES[currentPhase]}」进入了「${PHASE_NAMES[nextPhase]}」阶段

基于最近的叙事内容：
${signalDescriptions}

是否确认推进？`
}
