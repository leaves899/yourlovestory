import { Type } from 'typebox'
import { generateDay } from '@/shared/day/dayService'

/**
 * 日常写作工具 - 运行日常写作流水线
 *
 * 直接调用 TS dayService.generateDay（不再 spawn Python）。
 */
export const dayTool = {
  name: 'day_writer',
  label: 'Day Writer',
  description: '运行日常写作流水线，生成一天的生活叙事',
  parameters: Type.Object({
    slug: Type.String({
      description: '角色标识（仅允许小写字母、数字、连字符）',
      pattern: '^[a-z0-9-]+$',
    }),
    day_number: Type.Number({ description: 'Day 编号' }),
    summary: Type.Optional(Type.String({ description: '当天摘要' })),
    sex_count: Type.Optional(Type.Number({ description: '性爱次数' })),
    sex_details: Type.Optional(Type.String({ description: '性爱详情' })),
    handwriting: Type.Optional(Type.String({ description: '手心写字' })),
    ycm_pill: Type.Optional(Type.Number({ description: '优思明颗数' })),
  }),
  execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
    try {
      const projectRoot = process.cwd()
      const result = generateDay(projectRoot, params)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: { success: result.success },
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: `错误: ${error.message}` }],
        details: { success: false, error: error.message },
      }
    }
  },
}
