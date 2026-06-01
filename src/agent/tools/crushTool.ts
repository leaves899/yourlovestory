import { Type } from 'typebox'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const crushTool = {
  name: 'create_crush',
  label: 'Create Crush',
  description: '创建一个新的 crush 角色',
  parameters: Type.Object({
    name: Type.String({ description: '角色真实姓名' }),
    nickname: Type.String({ description: '角色昵称' }),
    slug: Type.String({ description: 'URL slug（唯一标识）' }),
  }),
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      const { name, nickname, slug } = params

      const command = `python src/scripts/init_template.py --name "${name}" --nickname "${nickname}" --slug ${slug}`

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
