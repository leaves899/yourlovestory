import {
  PHASE_NAMES,
  PHASE_IDENTIFIERS,
  PHASE_THRESHOLDS,
  SIGNAL_CONFIGS,
} from '@/shared/relationship/models'

describe('Relationship Models', () => {
  test('PHASE_NAMES 包含所有阶段', () => {
    expect(Object.keys(PHASE_NAMES)).toHaveLength(5)
    expect(PHASE_NAMES[0]).toBe('陌生人')
    expect(PHASE_NAMES[1]).toBe('认识')
    expect(PHASE_NAMES[2]).toBe('暧昧')
    expect(PHASE_NAMES[3]).toBe('表白')
    expect(PHASE_NAMES[4]).toBe('热恋')
  })

  test('PHASE_IDENTIFIERS 包含所有阶段', () => {
    expect(Object.keys(PHASE_IDENTIFIERS)).toHaveLength(5)
    expect(PHASE_IDENTIFIERS[0]).toBe('stranger')
    expect(PHASE_IDENTIFIERS[1]).toBe('acquaintance')
    expect(PHASE_IDENTIFIERS[2]).toBe('flirting')
    expect(PHASE_IDENTIFIERS[3]).toBe('confession')
    expect(PHASE_IDENTIFIERS[4]).toBe('passion')
  })

  test('PHASE_THRESHOLDS 包含所有阶段', () => {
    expect(PHASE_THRESHOLDS[0]).toBe(60)
    expect(PHASE_THRESHOLDS[1]).toBe(70)
    expect(PHASE_THRESHOLDS[2]).toBe(-1)
    expect(PHASE_THRESHOLDS[3]).toBe(-1)
    expect(PHASE_THRESHOLDS[4]).toBeUndefined()
  })

  test('SIGNAL_CONFIGS 包含所有阶段的信号', () => {
    const phase0Signals = SIGNAL_CONFIGS.filter(s => s.phase === 0)
    const phase1Signals = SIGNAL_CONFIGS.filter(s => s.phase === 1)
    const phase2Signals = SIGNAL_CONFIGS.filter(s => s.phase === 2)
    const phase3Signals = SIGNAL_CONFIGS.filter(s => s.phase === 3)

    expect(phase0Signals).toHaveLength(3)
    expect(phase1Signals).toHaveLength(4)
    expect(phase2Signals).toHaveLength(3)
    expect(phase3Signals).toHaveLength(3)
  })

  test('SIGNAL_CONFIGS 信号配置正确', () => {
    const hasDialogue = SIGNAL_CONFIGS.find(s => s.type === 'has_dialogue')
    expect(hasDialogue).toBeDefined()
    expect(hasDialogue?.description).toBe('有对话')
    expect(hasDialogue?.score).toBe(20)
    expect(hasDialogue?.keywords).toContain('聊天')
    expect(hasDialogue?.phase).toBe(0)
  })

  test('热恋阶段信号配置正确', () => {
    const constantKiss = SIGNAL_CONFIGS.find(s => s.type === 'constant_kiss')
    expect(constantKiss).toBeDefined()
    expect(constantKiss?.description).toBe('随时随地接吻')
    expect(constantKiss?.score).toBe(35)
    expect(constantKiss?.phase).toBe(3)
  })
})
