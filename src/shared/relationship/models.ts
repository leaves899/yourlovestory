/**
 * 关系进度系统数据模型。
 *
 * 定义关系阶段、信号、进度数据等类型。
 */

/** 关系阶段枚举 */
export type RelationshipPhase = 0 | 1 | 2 | 3 | 4

/** 阶段名称映射 */
export const PHASE_NAMES: Record<RelationshipPhase, string> = {
  0: '陌生人',
  1: '认识',
  2: '暧昧',
  3: '表白',
  4: '热恋',
}

/** 阶段英文标识 */
export const PHASE_IDENTIFIERS: Record<RelationshipPhase, string> = {
  0: 'stranger',
  1: 'acquaintance',
  2: 'flirting',
  3: 'confession',
  4: 'passion',
}

/** 阶段推进信号 */
export interface PhaseSignal {
  type: string          // 信号类型（如 'has_dialogue', 'physical_contact'）
  description: string   // 信号描述（如 '有对话', '身体接触'）
  score: number         // 信号分数
  detected_at: string   // 检测时间
  narrative_excerpt?: string // 触发信号的叙事摘录
}

/** 阶段历史记录 */
export interface PhaseHistory {
  phase: RelationshipPhase
  phase_name: string
  started_at: string
  ended_at?: string
  duration_days?: number
  narrative_count: number
  transition_reason?: string
}

/** 进度数据结构 */
export interface ProgressData {
  crush_slug: string
  current_phase: RelationshipPhase
  phase_name: string
  total_narratives: number
  interaction_narratives: number
  flirting_signals: number
  accumulated_score: number        // 当前阶段累积分数
  threshold: number                // 当前阶段推进阈值
  signals: PhaseSignal[]           // 已检测到的信号列表
  phase_history: PhaseHistory[]    // 阶段历史
  created_at: string
  updated_at: string
}

/** 阶段推进检测结果 */
export interface PhaseTransitionResult {
  shouldTransition: boolean        // 是否应该推进
  currentPhase: RelationshipPhase
  nextPhase: RelationshipPhase | null
  currentScore: number
  threshold: number
  signals: PhaseSignal[]           // 本次检测到的信号
  message?: string                 // 推进提示消息
}

/** 阶段推进阈值配置 */
export const PHASE_THRESHOLDS: Record<number, number> = {
  0: 60,   // Phase 0 -> 1: 60分
  1: 70,   // Phase 1 -> 2: 70分
  2: -1,   // Phase 2 -> 3: 手动触发（不自动）
  3: -1,   // Phase 3 -> 4: 手动触发（不自动）
}

/** 信号配置 */
export interface SignalConfig {
  type: string
  description: string
  score: number
  keywords: string[]               // 关键词列表
  phase: RelationshipPhase         // 适用的阶段转换
}

/** 信号配置表 */
export const SIGNAL_CONFIGS: SignalConfig[] = [
  // Phase 0 -> 1 信号
  { type: 'has_dialogue', description: '有对话', score: 20, keywords: ['聊天', '对话', '说了', '问了', '回答'], phase: 0 },
  { type: 'knows_name', description: '知道名字', score: 20, keywords: ['名字', '叫', '称呼', '知道ta叫'], phase: 0 },
  { type: 'has_contact', description: '有联系方式', score: 20, keywords: ['微信', '手机号', '加了', '联系'], phase: 0 },

  // Phase 1 -> 2 信号
  { type: 'physical_contact', description: '身体接触', score: 25, keywords: ['碰', '摸', '握手', '拥抱', '靠肩'], phase: 1 },
  { type: 'late_night_chat', description: '深夜聊天', score: 25, keywords: ['深夜', '凌晨', '半夜', '聊到很晚'], phase: 1 },
  { type: 'alone_time', description: '单独相处', score: 25, keywords: ['单独', '两个人', '只有我们', '约会'], phase: 1 },
  { type: 'gift_exchange', description: '送礼物', score: 25, keywords: ['礼物', '送了', '收到', '惊喜'], phase: 1 },

  // Phase 2 -> 3 信号（仅用于统计，不自动触发）
  { type: 'confession_hint', description: '表白暗示', score: 30, keywords: ['喜欢', '爱', '在一起', '交往'], phase: 2 },
  { type: 'emotional_confession', description: '情感表白', score: 30, keywords: ['表白', '告白', '说出心意'], phase: 2 },
  { type: 'intimate_behavior', description: '亲密行为', score: 30, keywords: ['亲', '接吻', '牵手', '恋人'], phase: 2 },

  // Phase 3 -> 4 信号（仅用于统计，不自动触发）
  { type: 'constant_kiss', description: '随时随地接吻', score: 35, keywords: ['亲吻', '接吻', '吻', '亲'], phase: 3 },
  { type: 'constant_intimacy', description: '时时刻刻亲密', score: 35, keywords: ['做爱', '亲密', '缠绵', '要你'], phase: 3 },
  { type: 'inseparable', description: '形影不离', score: 35, keywords: ['形影不离', '时时刻刻', '每时每刻', '离不开'], phase: 3 },
]
