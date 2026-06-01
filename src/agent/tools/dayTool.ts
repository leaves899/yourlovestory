import { Type } from 'typebox'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const dayTool = {
  name: 'run_day_pipeline',
  label: 'Run Day Pipeline',
  description: '运行日常写作流水线，生成一天的生活叙事',
  parameters: Type.Object({
    slug: Type.String({ description: '角色标识' }),
    day_number: Type.Number({ description: 'Day 编号' }),
    summary: Type.Optional(Type.String({ description: '当天摘要' })),
    sex_count: Type.Optional(Type.Number({ description: '性爱次数' })),
    sex_details: Type.Optional(Type.String({ description: '性爱详情' })),
    handwriting: Type.Optional(Type.String({ description: '手心写字' })),
    ycm_pill: Type.Optional(Type.Number({ description: '优思明颗数' })),
  }),
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      const { slug, day_number, summary, sex_count, sex_details, handwriting, ycm_pill } = params

      const args = [
        `--slug ${slug}`,
        `--day-number ${day_number}`,
      ]

      if (summary) args.push(`--summary "${summary}"`)
      if (sex_count) args.push(`--sex-count ${sex_count}`)
      if (sex_details) args.push(`--sex-details "${sex_details}"`)
      if (handwriting) args.push(`--handwriting "${handwriting}"`)
      if (ycm_pill) args.push(`--ycm-pill ${ycm_pill}`)

      const command = `python src/scripts/day/pipeline.py ${args.join(' ')}`
      const { stdout, stderr } = await execAsync(command)

      if (stderr) {
        throw new Error(stderr)
      }

      return {
        content: [{ type: 'text', text: stdout }],
        details: { success: true },
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `错误: ${error.message}` }],
        details: { success: false, error: error.message },
      }
    }
  },
}
