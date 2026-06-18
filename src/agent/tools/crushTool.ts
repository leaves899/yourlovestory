import { Type } from 'typebox'
import { createCrush, getCrush, listCrushes, updateCrush, deleteCrush } from '@/shared/crush/crushStore'

/**
 * 角色管理工具 - 支持创建、查看、列表、更新、删除操作。
 *
 * 已迁移到 TS crushStore，不再 spawn Python 子进程。
 * 返回结构与原 Python 一致（raw JSON 字符串进 content[0].text）。
 *
 * projectRoot 用 process.cwd()（agent 运行在 electron 主进程，cwd 为项目根）。
 */
const PROJECT_ROOT = process.cwd()

export const crushTool = {
  name: 'crush_manager',
  label: 'Crush Manager',
  description: '管理 crush 角色：创建、查看、列表、更新、删除',
  parameters: Type.Object({
    action: Type.Union(
      [Type.Literal('create'), Type.Literal('get'), Type.Literal('list'),
       Type.Literal('update'), Type.Literal('delete')],
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
    description: Type.Optional(Type.String({ description: '角色描述' })),
    gender: Type.Optional(
      Type.Union(
        [Type.Literal('male'), Type.Literal('female'), Type.Literal('unknown')],
        { description: '性别' }
      )
    ),
  }),
  execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
    try {
      let result: any
      switch (params.action) {
        case 'create':
          result = createCrush(PROJECT_ROOT, params)
          break
        case 'list':
          result = listCrushes(PROJECT_ROOT)
          break
        case 'get':
          result = getCrush(PROJECT_ROOT, params.slug)
          break
        case 'update':
          result = updateCrush(PROJECT_ROOT, params)
          break
        case 'delete':
          result = deleteCrush(PROJECT_ROOT, params.slug)
          break
        default:
          result = { success: false, errors: [`未知 action: ${params.action}`] }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        details: { success: result.success === true },
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `错误: ${error.message}` }],
        details: { success: false, error: error.message },
      }
    }
  },
}
