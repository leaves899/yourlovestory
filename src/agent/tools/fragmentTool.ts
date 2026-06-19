import { Type } from 'typebox'
import {
  managerRecordFragment,
  getFragmentsByDate,
  getFragment,
  managerUpdateFragment,
  managerDeleteFragment,
  managerIntegrateFragments,
  recommendTags,
} from '../../shared/fragment/manager'
import { getCurrentDate } from '../../shared/fragment/utils'

/**
 * 碎片日记工具 - 支持 CRUD + integrate + recommend 操作
 *
 * 直接调用 TS fragment 模块（不再 spawn Python）。
 */
export const fragmentTool = {
  name: 'fragment_manager',
  label: 'Fragment Manager',
  description: '管理碎片日记：记录、查看、更新、删除、整合碎片、推荐标签',
  parameters: Type.Object({
    action: Type.Union(
      [
        Type.Literal('record'),
        Type.Literal('list'),
        Type.Literal('get'),
        Type.Literal('update'),
        Type.Literal('delete'),
        Type.Literal('integrate'),
        Type.Literal('recommend'),
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
    date: Type.Optional(Type.String({ description: '日期 YYYY-MM-DD（record/list/integrate 可选）' })),
    expected_version: Type.Optional(Type.Number({ description: '乐观锁版本号（update/delete 可选，不传则跳过锁检查）' })),
    session_id: Type.Optional(Type.String({ description: '会话 ID（recommend 操作需要）' })),
  }),
  execute: async (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: any) => {
    try {
      const projectRoot = process.cwd()
      let result: any

      switch (params.action) {
        case 'record':
          result = managerRecordFragment(projectRoot, params.slug, {
            origin: params.origin,
            mood: params.mood,
            content: params.content,
            env_tags: params.env_tags,
            behavior_tags: params.behavior_tags,
            writing_mode: 'raw',
          }, params.date)
          break
        case 'list':
          result = { success: true, data: getFragmentsByDate(projectRoot, params.slug, params.date ?? getCurrentDate()) }
          break
        case 'get':
          result = getFragment(projectRoot, params.fragment_id)
          result = result ? { success: true, data: result } : { success: false, errors: ['碎片不存在'] }
          break
        case 'update':
          result = managerUpdateFragment(projectRoot, params.fragment_id, {
            content: params.content,
            origin: params.origin,
            mood: params.mood,
            env_tags: params.env_tags,
            behavior_tags: params.behavior_tags,
          }, params.expected_version)
          break
        case 'delete':
          result = managerDeleteFragment(projectRoot, params.fragment_id, params.expected_version)
          break
        case 'integrate':
          result = { success: true, data: { prompt: managerIntegrateFragments(projectRoot, params.slug, params.date ?? getCurrentDate()) } }
          break
        case 'recommend': {
          const sessionId = params.session_id ?? `agent_${toolCallId}`
          const tags = recommendTags(projectRoot, params.slug, params.content ?? '', sessionId)
          result = { success: true, data: tags }
          break
        }
        default:
          result = { success: false, errors: [`Unknown action: ${params.action}`] }
      }

      const isSuccess =
        result.success === true ||
        (result.fragment !== null && result.fragment !== undefined)

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        details: { success: isSuccess },
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text' as const, text: `错误: ${error.message}` }],
        details: { success: false, error: error.message },
      }
    }
  },
}
