import type { Static } from 'typebox'
import { app } from 'electron'
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
import type { Mood, Origin } from '../../shared/fragment/models'
import { defineAgentTool, type RegisteredAgentTool, type ToolRisk } from '../permissions'
import type { TypeBoxBuilder } from '../runtime'

/**
 * 碎片日记工具 - 支持 CRUD + integrate + recommend 操作
 *
 * 直接调用 shared fragment 模块。
 */
function createFragmentParameters(Type: TypeBoxBuilder) {
  return Type.Object({
  action: Type.Union([
    Type.Literal('record'),
    Type.Literal('list'),
    Type.Literal('get'),
    Type.Literal('update'),
    Type.Literal('delete'),
    Type.Literal('integrate'),
    Type.Literal('recommend'),
  ]),
  slug: Type.String({ pattern: '^[a-z0-9-]+$' }),
  fragment_id: Type.Optional(Type.String()),
  origin: Type.Optional(Type.Union([
    Type.Literal('user'),
    Type.Literal('crush'),
    Type.Literal('ambient'),
  ])),
  mood: Type.Optional(Type.Union([
    Type.Literal('positive'),
    Type.Literal('negative'),
    Type.Literal('neutral'),
    Type.Literal('mixed'),
  ])),
  content: Type.Optional(Type.String()),
  env_tags: Type.Optional(Type.Array(Type.String())),
  behavior_tags: Type.Optional(Type.Array(Type.String())),
  date: Type.Optional(Type.String()),
  expected_version: Type.Optional(Type.Number()),
  session_id: Type.Optional(Type.String()),
  })
}
type FragmentParameters = Static<ReturnType<typeof createFragmentParameters>>
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function resolveFragmentToolRisk(args: unknown): ToolRisk {
  if (!isRecord(args) || typeof args.action !== 'string') return 'destructive'
  switch (args.action) {
    case 'list':
    case 'get':
    case 'integrate':
    case 'recommend':
      return 'read'
    case 'record':
    case 'update':
      return 'write'
    case 'delete':
      return 'destructive'
    default:
      return 'destructive'
  }
}

export function createFragmentTool(
  Type: TypeBoxBuilder,
): RegisteredAgentTool<ReturnType<typeof createFragmentParameters>, { success: boolean; error?: string }> {
  const fragmentParameters = createFragmentParameters(Type)
  return defineAgentTool<ReturnType<typeof createFragmentParameters>, { success: boolean; error?: string }>({
    name: 'fragment_manager',
    label: 'Fragment Manager',
    description: '管理碎片日记：记录、查看、更新、删除、整合碎片、推荐标签',
    parameters: fragmentParameters,
    execute: async (toolCallId: string, params: FragmentParameters) => {
      try {
        const projectRoot = app.getPath('userData')
        let result: unknown

        switch (params.action) {
          case 'record':
            result = managerRecordFragment(projectRoot, params.slug, {
              origin: params.origin as Origin | undefined,
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
            {
              const fragment = getFragment(projectRoot, params.fragment_id ?? '')
              result = fragment ? { success: true, data: fragment } : { success: false, errors: ['碎片不存在'] }
            }
            break
          case 'update':
            result = managerUpdateFragment(projectRoot, params.fragment_id ?? '', {
              content: params.content,
              origin: params.origin as Origin | undefined,
              mood: params.mood as Mood | undefined,
              env_tags: params.env_tags,
              behavior_tags: params.behavior_tags,
            }, params.expected_version)
            break
          case 'delete':
            result = managerDeleteFragment(projectRoot, params.fragment_id ?? '', params.expected_version)
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
            result = { success: false, error: `Unknown action: ${params.action}` }
        }

        const isSuccess = isRecord(result) && (
          result.success === true ||
          ('fragment' in result && result.fragment !== null && result.fragment !== undefined)
        )

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          details: { success: isSuccess },
        }
      } catch (error: unknown) {
        const message = errorText(error)
        return {
          content: [{ type: 'text' as const, text: `错误: ${message}` }],
          details: { success: false, error: message },
        }
      }
    },
  }, {
    defaultRisk: 'write',
    scopes: ['fragment:read', 'fragment:write', 'fragment:delete'],
    confirmation: 'destructive',
    executionMode: 'sequential',
    resolveRisk: resolveFragmentToolRisk,
  })
}
