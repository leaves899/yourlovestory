import { Type } from 'typebox'
import { spawn } from 'child_process'
import path from 'path'

/**
 * 日常写作工具 - 运行日常写作流水线
 *
 * 使用 spawn 替代 exec 防止命令注入
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
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'day', 'pipeline.py')
      const args = [
        scriptPath,
        '--slug',
        params.slug,
        '--day-number',
        String(params.day_number),
      ]

      if (params.summary) args.push('--summary', params.summary)
      if (params.sex_count) args.push('--sex-count', String(params.sex_count))
      if (params.sex_details) args.push('--sex-details', params.sex_details)
      if (params.handwriting) args.push('--handwriting', params.handwriting)
      if (params.ycm_pill) args.push('--ycm-pill', String(params.ycm_pill))

      // 使用 spawn 替代 exec，防止命令注入
      const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn('python', args, { shell: false, signal })
        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
          stderr += data.toString()
        })

        child.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(stderr || `Process exited with code ${code}`))
          } else {
            resolve({ stdout, stderr })
          }
        })

        child.on('error', reject)
      })

      if (result.stderr) {
        console.warn('Day tool warning:', result.stderr)
      }

      return {
        content: [{ type: 'text', text: result.stdout }],
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
