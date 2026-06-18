import { Type } from 'typebox'
import { runPython, buildArgs } from '@/shared/pythonRunner'

/**
 * 碎片日记工具 - 支持 CRUD 操作
 *
 * 底层 spawn 逻辑见 src/shared/pythonRunner.ts（全项目唯一实现）。
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
  execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
    try {
      const result = await runPython(
        'src.scripts.fragment.manager',
        buildArgs({
          action: params.action,
          slug: params.slug,
          fragment_id: params.fragment_id,
          origin: params.origin,
          mood: params.mood,
          content: params.content,
          env_tags: params.env_tags,
          behavior_tags: params.behavior_tags,
        }),
        { signal }
      )

      if (result.stderr) {
        console.warn('Fragment tool warning:', result.stderr)
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
