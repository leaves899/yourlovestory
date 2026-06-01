import { Type } from 'typebox'
import { spawn } from 'child_process'
import path from 'path'

/**
 * 角色管理工具 - 支持创建、查看、列表操作
 *
 * 使用 spawn 替代 exec 防止命令注入
 */
export const crushTool = {
  name: 'crush_manager',
  label: 'Crush Manager',
  description: '管理 crush 角色：创建、查看、列表',
  parameters: Type.Object({
    action: Type.Union(
      [Type.Literal('create'), Type.Literal('get'), Type.Literal('list')],
      { description: '操作类型' }
    ),
    name: Type.Optional(Type.String({ description: '角色真实姓名（create 必需）' })),
    nickname: Type.Optional(Type.String({ description: '角色昵称（create 必需）' })),
    slug: Type.Optional(
      Type.String({
        description: 'URL slug（仅允许小写字母、数字、连字符）',
        pattern: '^[a-z0-9-]+$',
      })
    ),
  }),
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      const scriptPath = path.join(process.cwd(), 'src', 'scripts', 'init_template.py')
      const args = [scriptPath, '--action', params.action]

      if (params.name) args.push('--name', params.name)
      if (params.nickname) args.push('--nickname', params.nickname)
      if (params.slug) args.push('--slug', params.slug)

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
        console.warn('Crush tool warning:', result.stderr)
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
