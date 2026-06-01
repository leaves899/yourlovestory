import { Type } from 'typebox'
import { spawn } from 'child_process'
import path from 'path'

/**
 * 碎片日记工具 - 支持 CRUD 操作
 *
 * 使用 spawn 替代 exec 防止命令注入
 */
export const fragmentTool = {
  name: 'fragment_manager',
  label: 'Fragment Manager',
  description: '管理碎片日记：记录、查看、更新、删除碎片',
  parameters: Type.Object({
    action: Type.Union(
      [
        Type.Literal('record'),
        Type.Literal('list'),
        Type.Literal('get'),
        Type.Literal('update'),
        Type.Literal('delete'),
      ],
      { description: '操作类型' }
    ),
    slug: Type.String({
      description: '角色标识（仅允许小写字母、数字、连字符）',
      pattern: '^[a-z0-9-]+$',
    }),
    fragment_id: Type.Optional(Type.String({ description: '碎片 ID（get/update/delete 必需）' })),
    origin: Type.Optional(
      Type.Union(
        [Type.Literal('user'), Type.Literal('crush'), Type.Literal('ambient')],
        { description: '来源' }
      )
    ),
    mood: Type.Optional(
      Type.Union(
        [
          Type.Literal('positive'),
          Type.Literal('negative'),
          Type.Literal('neutral'),
          Type.Literal('mixed'),
        ],
        { description: '情绪' }
      )
    ),
    content: Type.Optional(Type.String({ description: '碎片内容（record/update 必需）' })),
    env_tags: Type.Optional(Type.Array(Type.String(), { description: '环境标签' })),
    behavior_tags: Type.Optional(Type.Array(Type.String(), { description: '行为标签' })),
  }),
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      // 使用 spawn 替代 exec，防止命令注入
      const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'fragment', 'manager.py')
      const args = [scriptPath, '--action', params.action, '--slug', params.slug]

      if (params.fragment_id) args.push('--fragment-id', params.fragment_id)
      if (params.origin) args.push('--origin', params.origin)
      if (params.mood) args.push('--mood', params.mood)
      if (params.content) args.push('--content', params.content)
      if (params.env_tags) args.push('--env-tags', JSON.stringify(params.env_tags))
      if (params.behavior_tags) args.push('--behavior-tags', JSON.stringify(params.behavior_tags))

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
        console.warn('Fragment tool warning:', result.stderr)
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
