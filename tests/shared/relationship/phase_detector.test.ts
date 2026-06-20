import { detectPhaseSignals, checkPhaseTransition } from '@/shared/relationship/phase_detector'
import type { PhaseSignal } from '@/shared/relationship/models'

describe('Phase Detector', () => {
  describe('detectPhaseSignals', () => {
    test('检测 Phase 0 信号', () => {
      const text = '今天和她聊天了，知道她叫小美'
      const signals = detectPhaseSignals(text, 0)

      expect(signals).toHaveLength(2)
      expect(signals.map(s => s.type)).toContain('has_dialogue')
      expect(signals.map(s => s.type)).toContain('knows_name')
    })

    test('检测 Phase 1 信号', () => {
      const text = '我们拥抱了一下，聊到深夜'
      const signals = detectPhaseSignals(text, 1)

      expect(signals).toHaveLength(2)
      expect(signals.map(s => s.type)).toContain('physical_contact')
      expect(signals.map(s => s.type)).toContain('late_night_chat')
    })

    test('检测 Phase 2 信号', () => {
      const text = '我向她表白了，我们接吻了'
      const signals = detectPhaseSignals(text, 2)

      expect(signals).toHaveLength(2)
      expect(signals.map(s => s.type)).toContain('emotional_confession')
      expect(signals.map(s => s.type)).toContain('intimate_behavior')
    })

    test('无信号时返回空数组', () => {
      const text = '今天天气真好'
      const signals = detectPhaseSignals(text, 0)

      expect(signals).toHaveLength(0)
    })

    test('信号包含摘录', () => {
      const text = '今天和她聊天了，知道她叫小美'
      const signals = detectPhaseSignals(text, 0)

      const dialogueSignal = signals.find(s => s.type === 'has_dialogue')
      expect(dialogueSignal?.narrative_excerpt).toContain('聊天')
    })
  })

  describe('checkPhaseTransition', () => {
    test('达到阈值时返回 shouldTransition: true', () => {
      const signals: PhaseSignal[] = [
        { type: 'has_dialogue', description: '有对话', score: 20, detected_at: '' },
        { type: 'knows_name', description: '知道名字', score: 20, detected_at: '' },
        { type: 'has_contact', description: '有联系方式', score: 20, detected_at: '' },
      ]

      const result = checkPhaseTransition(0, 0, signals)
      expect(result.shouldTransition).toBe(true)
      expect(result.nextPhase).toBe(1)
    })

    test('未达到阈值时返回 shouldTransition: false', () => {
      const signals: PhaseSignal[] = [
        { type: 'has_dialogue', description: '有对话', score: 20, detected_at: '' },
      ]

      const result = checkPhaseTransition(0, 0, signals)
      expect(result.shouldTransition).toBe(false)
      expect(result.nextPhase).toBe(1)
      expect(result.currentScore).toBe(20)
      expect(result.threshold).toBe(60)
    })

    test('Phase 2 -> 3 不自动触发', () => {
      const result = checkPhaseTransition(2, 100, [])
      expect(result.shouldTransition).toBe(false)
      expect(result.message).toContain('手动触发')
    })

    test('Phase 3 -> 4 不自动触发', () => {
      const result = checkPhaseTransition(3, 100, [])
      expect(result.shouldTransition).toBe(false)
      expect(result.message).toContain('手动触发')
    })

    test('已是最高阶段时返回 shouldTransition: false', () => {
      const result = checkPhaseTransition(4, 0, [])
      expect(result.shouldTransition).toBe(false)
      expect(result.nextPhase).toBeNull()
    })

    test('累积分数计算正确', () => {
      const signals: PhaseSignal[] = [
        { type: 'has_dialogue', description: '有对话', score: 20, detected_at: '' },
      ]

      const result = checkPhaseTransition(0, 40, signals)
      expect(result.currentScore).toBe(60)
      expect(result.shouldTransition).toBe(true)
    })
  })
})
