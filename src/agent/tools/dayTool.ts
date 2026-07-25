import type { Static } from 'typebox'
import { app } from 'electron'
import { generateDay } from '../../shared/day/dayService'
import { defineAgentTool, type RegisteredAgentTool } from '../permissions'
import type { TypeBoxBuilder } from '../runtime'

/**
 * 日常写作工具 - 运行日常写作流水线
 *
 * 直接调用 TS dayService.generateDay。
 */
function createDayParameters(Type: TypeBoxBuilder) {
  return Type.Object({
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
  })
}
type DayParameters = Static<ReturnType<typeof createDayParameters>>

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createDayTool(
  Type: TypeBoxBuilder,
): RegisteredAgentTool<ReturnType<typeof createDayParameters>, { success: boolean; error?: string }> {
  const dayParameters = createDayParameters(Type)
  return defineAgentTool<ReturnType<typeof createDayParameters>, { success: boolean; error?: string }>({
    name: 'day_writer',
    label: 'Day Writer',
    description: '运行日常写作流水线，生成一天的生活叙事',
    parameters: dayParameters,
    execute: async (_toolCallId: string, params: DayParameters) => {
      try {
        const projectRoot = app.getPath('userData')
        const result = await generateDay(projectRoot, params)

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: { success: result.success },
        }
      } catch (error: unknown) {
        const message = errorText(error)
        return {
          content: [{ type: 'text' as const, text: `错误: ${message}` }],
          details: { success: false, error: message },
        }
      }
    },
  }, {
    defaultRisk: 'write',
    scopes: ['day:write'],
    confirmation: 'destructive',
    executionMode: 'sequential',
  })
}
