import { Type } from 'typebox'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const fragmentTool = {
  name: 'record_fragment',
  label: 'Record Fragment',
  description: '记录一个碎片日记',
  parameters: Type.Object({
    slug: Type.String({ description: '角色标识' }),
    origin: Type.String({ description: '来源：user/crush/ambient' }),
    mood: Type.String({ description: '情绪：positive/negative/neutral/mixed' }),
    content: Type.String({ description: '碎片内容' }),
    env_tags: Type.Optional(Type.Array(Type.String(), { description: '环境标签' })),
    behavior_tags: Type.Optional(Type.Array(Type.String(), { description: '行为标签' })),
  }),
  execute: async (toolCallId: string, params: any, signal: AbortSignal, onUpdate: any) => {
    try {
      const { slug, origin, mood, content, env_tags, behavior_tags } = params

      const command = `python src/scripts/fragment/manager.py --action record --slug ${slug} --origin ${origin} --mood ${mood} --content "${content}"${env_tags ? ` --env-tags ${JSON.stringify(env_tags)}` : ''}${behavior_tags ? ` --behavior-tags ${JSON.stringify(behavior_tags)}` : ''}`

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
