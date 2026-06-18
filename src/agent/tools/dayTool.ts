import { Type } from 'typebox'
import { runPython, buildArgs } from '@/shared/pythonRunner'

/**
 * 日常写作工具 - 运行日常写作流水线
 *
 * 调用 src.scripts.day.service 的 generate action（与 IPC 的 day:generate 入口一致）。
 * 底层 spawn 逻辑见 src/shared/pythonRunner.ts（全项目唯一实现）。
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
      const result = await runPython(
        'src.scripts.day.service',
        buildArgs({
          action: 'generate',
          slug: params.slug,
          day_number: params.day_number,
          summary: params.summary,
          sex_count: params.sex_count,
          sex_details: params.sex_details,
          handwriting: params.handwriting,
          ycm_pill: params.ycm_pill,
        }),
        { signal }
      )

      if (result.stderr) {
        console.warn('Day tool warning:', result.stderr)
      }

      return {
        content: [{ type: 'text', text: result.stdout }],
        details: { success: result.exitCode === 0 },
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `错误: ${error.message}` }],
        details: { success: false, error: error.message },
      }
    }
  },
}
