import { getPhaseWritingRules, buildPhaseAwareSystemPrompt } from '@/shared/relationship/phase_prompts'

describe('Phase Prompts', () => {
  describe('getPhaseWritingRules', () => {
    test('Phase 0 规则', () => {
      const rules = getPhaseWritingRules(0)
      expect(rules).toContain('Phase 0 陌生人阶段')
      expect(rules).toContain('观察者视角')
      expect(rules).toContain('外貌描写')
    })

    test('Phase 1 规则', () => {
      const rules = getPhaseWritingRules(1)
      expect(rules).toContain('Phase 1 认识阶段')
      expect(rules).toContain('互动视角')
      expect(rules).toContain('对话内容')
    })

    test('Phase 2 规则', () => {
      const rules = getPhaseWritingRules(2)
      expect(rules).toContain('Phase 2 暧昧阶段')
      expect(rules).toContain('情感视角')
      expect(rules).toContain('眼神交汇')
    })

    test('Phase 3 规则', () => {
      const rules = getPhaseWritingRules(3)
      expect(rules).toContain('Phase 3 表白阶段')
      expect(rules).toContain('结局视角')
      expect(rules).toContain('情感爆发')
    })
  })

  describe('buildPhaseAwareSystemPrompt', () => {
    test('包含阶段规则', () => {
      const basePrompt = '基础 Prompt'
      const result = buildPhaseAwareSystemPrompt(basePrompt, 0)

      expect(result).toContain('基础 Prompt')
      expect(result).toContain('Phase 0 陌生人阶段')
      expect(result).toContain('---')
    })

    test('不包含阶段规则时返回原 Prompt', () => {
      const basePrompt = '基础 Prompt'
      const result = buildPhaseAwareSystemPrompt(basePrompt, 0)

      expect(result).toContain('基础 Prompt')
    })
  })
})
