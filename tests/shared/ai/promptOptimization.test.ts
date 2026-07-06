/**
 * 提示词系统收尾验证
 */
import {
  buildSystemPrompt,
  DEFAULT_SYSTEM_PROMPT_RULES,
  DEFAULT_USER_PROMPT_TEMPLATE,
} from '@/shared/ai/promptBuilder'
import {
  PHASE_PROMPT_CONFIG,
  PHASE_PROMPT_ORDER,
  getPhaseWritingRules,
  buildPhaseAwareSystemPrompt,
} from '@/shared/relationship/phase_prompts'
import type { CrushContext } from '@/shared/crush/contextLoader'

describe('提示词系统收尾验证', () => {
  const fullContext: CrushContext = {
    persona: '# 角色档案\n\n姓名：小雨\n性格：温柔内向，喜欢看书',
    memory: '## 关系记忆\n\n第一次相遇在图书馆，她坐在窗边看书',
    weekday: '周一：图书馆自习\n周二：没课',
    contextSummary: '最近经常在图书馆遇到她',
    intimateKnowledge: null,
    intimateEnabled: false,
  }

  test('默认系统规则导出为共享来源', () => {
    expect(DEFAULT_SYSTEM_PROMPT_RULES).toContain('## 写作规则')
    expect(DEFAULT_SYSTEM_PROMPT_RULES).toContain('### 三维描写原则')
    expect(DEFAULT_SYSTEM_PROMPT_RULES).toContain('### 文学性指导')
    expect(DEFAULT_SYSTEM_PROMPT_RULES).toContain('### 情感渲染指导')
    expect(DEFAULT_SYSTEM_PROMPT_RULES).toContain('### 禁止事项')
  })

  test('默认用户模板导出为共享来源', () => {
    expect(DEFAULT_USER_PROMPT_TEMPLATE).toContain('{slug}')
    expect(DEFAULT_USER_PROMPT_TEMPLATE).toContain('{dayNumber}')
    expect(DEFAULT_USER_PROMPT_TEMPLATE).toContain('{summary}')
  })

  test('阶段配置与运行时规则共享同一来源', () => {
    expect(PHASE_PROMPT_ORDER).toEqual([0, 1, 2, 3, 4])

    PHASE_PROMPT_ORDER.forEach((phase) => {
      const config = PHASE_PROMPT_CONFIG[phase]
      const rules = getPhaseWritingRules(phase)

      expect(rules).toBe(config.rules)
      expect(rules).toContain('风格定位')
      expect(rules).toContain('写作技巧')
      expect(rules).toContain('禁止事项')
      expect(rules).toContain('风格参考')
    })
  })

  test('亲密规则仅在显式启用且存在知识库时拼接', () => {
    const disabledContext: CrushContext = {
      ...fullContext,
      intimateKnowledge: '亲密知识库内容',
      intimateEnabled: false,
    }
    const enabledContext: CrushContext = {
      ...fullContext,
      intimateKnowledge: '亲密知识库内容',
      intimateEnabled: true,
    }

    const disabledResult = buildSystemPrompt(disabledContext)
    const enabledResult = buildSystemPrompt(enabledContext)

    expect(disabledResult).not.toContain('## 亲密知识库')
    expect(disabledResult).not.toContain('## 亲密写作规则')
    expect(enabledResult).toContain('## 亲密知识库')
    expect(enabledResult).toContain('## 亲密写作规则')
  })

  test('亲密规则保留文学化边界且不含硬编码角色名', () => {
    const enabledContext: CrushContext = {
      ...fullContext,
      intimateKnowledge: '亲密知识库内容',
      intimateEnabled: true,
    }

    const result = buildSystemPrompt(enabledContext)

    expect(result).toContain('彼此的信任、回应和余韵')
    expect(result).toContain('使用“对方”“彼此”等通用称呼')
    expect(result).not.toContain('夏夏')
    expect(result).not.toContain('抽插')
    expect(result).not.toContain('插入')
    expect(result).not.toContain('口交')
  })

  test('系统 Prompt 维持稳定的 section 顺序', () => {
    const enabledContext: CrushContext = {
      ...fullContext,
      intimateKnowledge: '亲密知识库内容',
      intimateEnabled: true,
    }

    const result = buildSystemPrompt(enabledContext)

    expect(result.indexOf('## 角色身份')).toBeLessThan(result.indexOf('## 关系记忆'))
    expect(result.indexOf('## 关系记忆')).toBeLessThan(result.indexOf('## 当天日程参考'))
    expect(result.indexOf('## 当天日程参考')).toBeLessThan(result.indexOf('## 上下文摘要'))
    expect(result.indexOf('## 上下文摘要')).toBeLessThan(result.indexOf('## 亲密知识库'))
    expect(result.indexOf('## 亲密知识库')).toBeLessThan(result.indexOf('## 写作规则'))
  })

  test('阶段规则按当前阶段叠加到基础系统 Prompt', () => {
    const basePrompt = buildSystemPrompt(fullContext)
    const result = buildPhaseAwareSystemPrompt(basePrompt, 2)

    expect(result).toContain('## 写作规则')
    expect(result).toContain(PHASE_PROMPT_CONFIG[2].rules)
    expect(result.startsWith(basePrompt)).toBe(true)
  })
})
