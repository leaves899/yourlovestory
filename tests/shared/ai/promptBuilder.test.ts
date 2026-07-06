import { buildSystemPrompt, buildUserPrompt } from '@/shared/ai/promptBuilder'
import type { CrushContext } from '@/shared/crush/contextLoader'
import type { NarrativeParams, CustomPrompts } from '@/shared/ai/promptBuilder'

describe('promptBuilder', () => {
  describe('buildSystemPrompt', () => {
    test('最小上下文（所有字段为空）', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('写作规则')
    })

    test('包含 persona', () => {
      const ctx: CrushContext = {
        persona: '# 角色\n\n夏夏',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 角色身份')
      expect(result).toContain('夏夏')
    })

    test('包含 memory', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '关系记忆内容',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 关系记忆')
      expect(result).toContain('关系记忆内容')
    })

    test('包含 weekday', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '周一安排',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 当天日程参考')
      expect(result).toContain('周一安排')
    })

    test('包含 contextSummary', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '上下文摘要',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 上下文摘要')
      expect(result).toContain('上下文摘要')
    })

    test('intimateEnabled=false 时无亲密规则', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).not.toContain('亲密写作规则')
    })

    test('intimateEnabled=false 即使有知识库也不拼接亲密规则', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: '亲密知识',
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).not.toContain('## 亲密知识库')
      expect(result).not.toContain('## 亲密写作规则')
    })

    test('intimateEnabled=true 且有知识库', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: '亲密知识',
        intimateEnabled: true,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 亲密知识库')
      expect(result).toContain('亲密知识')
      expect(result).toContain('## 亲密写作规则')
    })

    test('有 customSystemPrompt', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const customPrompts: CustomPrompts = {
        customSystemPrompt: '自定义规则',
      }
      const result = buildSystemPrompt(ctx, undefined, customPrompts)
      expect(result).toContain('## 自定义规则')
      expect(result).toContain('自定义规则')
    })

    test('无 customSystemPrompt', () => {
      const ctx: CrushContext = {
        persona: '',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).not.toContain('## 自定义规则')
    })

    test('所有字段都有完整上下文', () => {
      const ctx: CrushContext = {
        persona: '角色身份',
        memory: '关系记忆',
        weekday: '当天日程',
        contextSummary: '上下文摘要',
        intimateKnowledge: '亲密知识',
        intimateEnabled: true,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('## 角色身份')
      expect(result).toContain('## 关系记忆')
      expect(result).toContain('## 当天日程参考')
      expect(result).toContain('## 上下文摘要')
      expect(result).toContain('## 亲密知识库')
      expect(result).toContain('## 亲密写作规则')
    })

    test('section 之间用分隔符', () => {
      const ctx: CrushContext = {
        persona: '角色身份',
        memory: '',
        weekday: '',
        contextSummary: '',
        intimateKnowledge: null,
        intimateEnabled: false,
      }
      const result = buildSystemPrompt(ctx)
      expect(result).toContain('---')
    })
  })

  describe('buildUserPrompt', () => {
    test('默认模板（无 summary）', () => {
      const result = buildUserPrompt('test', { dayNumber: 1 })
      expect(result).toContain('第 1 天')
      expect(result).toContain('test')
    })

    test('有 summary', () => {
      const result = buildUserPrompt('test', { dayNumber: 5, summary: '今天约会了' })
      expect(result).toContain('第 5 天')
      expect(result).toContain('今天约会了')
    })

    test('summary 为空字符串', () => {
      const result = buildUserPrompt('test', { dayNumber: 1, summary: '' })
      expect(result).toBeDefined()
    })

    test('有 sexCount', () => {
      const result = buildUserPrompt('test', { dayNumber: 1, sexCount: 2 })
      expect(result).toContain('2 次亲密场景')
    })

    test('sexCount 为 0', () => {
      const result = buildUserPrompt('test', { dayNumber: 1, sexCount: 0 })
      expect(result).not.toContain('亲密场景')
    })

    test('有 sexDetails', () => {
      const result = buildUserPrompt('test', { dayNumber: 1, sexCount: 1, sexDetails: '细节' })
      expect(result).toContain('细节')
    })

    test('有 ycmPill', () => {
      const result = buildUserPrompt('test', { dayNumber: 1, ycmPill: 7 })
      expect(result).toContain('优思明第 7 天')
    })

    test('ycmPill 为 undefined', () => {
      const result = buildUserPrompt('test', { dayNumber: 1 })
      expect(result).not.toContain('优思明')
    })

    test('自定义用户提示词模板', () => {
      const customPrompts: CustomPrompts = {
        customUserPromptTemplate: '为{slug}写第{dayNumber}天',
      }
      const result = buildUserPrompt('test', { dayNumber: 1 }, customPrompts)
      expect(result).toContain('为test写第1天')
    })

    test('自定义模板占位符替换', () => {
      const customPrompts: CustomPrompts = {
        customUserPromptTemplate: '{slug} - {dayNumber} - {summary}',
      }
      const result = buildUserPrompt('test', { dayNumber: 5, summary: '今天' }, customPrompts)
      expect(result).toContain('test - 5 - 今天')
    })

    test('自定义模板 + 有 sexCount', () => {
      const customPrompts: CustomPrompts = {
        customUserPromptTemplate: '为{slug}写第{dayNumber}天',
      }
      const result = buildUserPrompt('test', { dayNumber: 1, sexCount: 1 }, customPrompts)
      expect(result).toContain('1 次亲密场景')
    })

    test('dayNumber 默认值', () => {
      const result = buildUserPrompt('test')
      expect(result).toContain('第 1 天')
    })
  })
})
