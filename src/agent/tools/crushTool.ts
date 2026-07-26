import type { Static } from 'typebox'
import { app } from 'electron'
import {
  createCrush,
  deleteCrush,
  getCrush,
  listCrushes,
  updateCrush,
  type CrushResult,
} from '../../shared/crush/crushStore'
import type { TypeBoxBuilder } from '../runtime'
import { defineAgentTool, type RegisteredAgentTool, type ToolRisk } from '../permissions'

/**
 * 角色管理工具 - 支持创建、查看、列表、更新、删除操作。
 *
 * 直接调用 TS crushStore。
 * 返回结构保持工具契约（raw JSON 字符串进 content[0].text）。
 *
 * projectRoot 用 app.getPath('userData')，打包后指向 userData 目录（可读写）。
 */
const PROJECT_ROOT = app.getPath('userData')

function createCrushParameters(Type: TypeBoxBuilder) {
  return Type.Object({
  action: Type.Union([
    Type.Literal('create'),
    Type.Literal('get'),
    Type.Literal('list'),
    Type.Literal('update'),
    Type.Literal('delete'),
  ]),
  name: Type.Optional(Type.String({ description: '角色姓名（create 必需）' })),
  nickname: Type.Optional(Type.String({ description: '角色昵称（create 必需）' })),
  slug: Type.Optional(Type.String({ pattern: '^[a-z0-9-]+$' })),
  description: Type.Optional(Type.String({ description: '角色描述' })),
  gender: Type.Optional(Type.Union([
    Type.Literal('male'),
    Type.Literal('female'),
    Type.Literal('unknown'),
  ])),
  })
}
type CrushParameters = Static<ReturnType<typeof createCrushParameters>>

export function resolveCrushToolRisk(args: unknown): ToolRisk {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'destructive'
  const action = (args as { action?: unknown }).action
  if (typeof action !== 'string') return 'destructive'
  switch (action) {
    case 'list':
    case 'get':
      return 'read'
    case 'create':
    case 'update':
      return 'write'
    case 'delete':
      return 'destructive'
    default:
      return 'destructive'
  }
}

function requiredString(value: string | undefined, field: string): string {
  if (!value || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createCrushTool(
  Type: TypeBoxBuilder,
): RegisteredAgentTool<ReturnType<typeof createCrushParameters>, { success: boolean; error?: string }> {
  const crushParameters = createCrushParameters(Type)
  return defineAgentTool<ReturnType<typeof createCrushParameters>, { success: boolean; error?: string }>({
    name: 'crush_manager',
    label: 'Crush Manager',
    description: '管理 crush 角色：创建、查看、列表、更新、删除',
    parameters: crushParameters,
    execute: async (_toolCallId: string, params: CrushParameters) => {
      try {
        let result: CrushResult
        switch (params.action) {
          case 'create':
            result = createCrush(PROJECT_ROOT, {
              name: requiredString(params.name, 'name'),
              nickname: requiredString(params.nickname, 'nickname'),
              slug: params.slug,
              description: params.description,
              gender: params.gender,
            })
            break
          case 'list':
            result = listCrushes(PROJECT_ROOT)
            break
          case 'get':
            result = getCrush(PROJECT_ROOT, requiredString(params.slug, 'slug'))
            break
          case 'update':
            result = updateCrush(PROJECT_ROOT, {
              slug: requiredString(params.slug, 'slug'),
              name: params.name,
              nickname: params.nickname,
              description: params.description,
              gender: params.gender,
            })
            break
          case 'delete':
            result = deleteCrush(PROJECT_ROOT, requiredString(params.slug, 'slug'))
            break
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          details: { success: result.success === true },
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
    scopes: ['crush:read', 'crush:write', 'crush:delete'],
    confirmation: 'destructive',
    executionMode: 'sequential',
    resolveRisk: resolveCrushToolRisk,
  })
}
