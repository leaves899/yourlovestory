jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => 'C:\\tmp\\yourcrush-test') },
}))

import type {
  AgentTool,
  BeforeToolCallContext,
} from '@earendil-works/pi-agent-core'
import { resolveCrushToolRisk } from '@/agent/tools/crushTool'
import { resolveFragmentToolRisk } from '@/agent/tools/fragmentTool'
import {
  configureToolExecution,
  createDangerousOperationHook,
  createToolPolicyRegistry,
  defineAgentTool,
  resolveToolCallRisk,
  type ToolRisk,
  type ToolSecurityPolicy,
} from '@/agent/permissions'

function tool(name: string, executionMode?: 'parallel' | 'sequential'): AgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: { type: 'object' },
    ...(executionMode === undefined ? {} : { executionMode }),
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: {} }),
  }
}

function policy(overrides: Partial<ToolSecurityPolicy> = {}): ToolSecurityPolicy {
  return {
    defaultRisk: 'read',
    scopes: ['test:read'],
    confirmation: 'destructive',
    ...overrides,
  }
}

function registeredTool(name: string, security: ToolSecurityPolicy): AgentTool {
  return defineAgentTool(tool(name), security)
}

function context(name: string, args: unknown): BeforeToolCallContext {
  return {
    toolCall: { id: 'call-1', name, arguments: {} },
    args,
    assistantMessage: {} as BeforeToolCallContext['assistantMessage'],
    context: {} as BeforeToolCallContext['context'],
  }
}

function registryFor(toolName: string, security: ToolSecurityPolicy): ReadonlyMap<string, ToolSecurityPolicy> {
  return createToolPolicyRegistry([registeredTool(toolName, security)])
}

describe('工具安全策略注册', () => {
  test('registers metadata and rejects duplicate names', () => {
    const registry = createToolPolicyRegistry([
      registeredTool('reader', policy({ scopes: ['project:read'] })),
    ])

    expect(registry.get('reader')).toEqual(expect.objectContaining({
      defaultRisk: 'read',
      scopes: ['project:read'],
      confirmation: 'destructive',
    }))
    expect(() => createToolPolicyRegistry([tool('duplicate'), tool('duplicate')])).toThrow('重复注册')
  })

  test('rejects invalid policy metadata at registration time', () => {
    const invalidRisk = {
      defaultRisk: 'unsafe',
      scopes: ['test:read'],
      confirmation: 'destructive',
    } as unknown as ToolSecurityPolicy
    const invalidScopes = policy({ scopes: [] })
    const invalidResolver = policy({ resolveRisk: 'not-a-function' as unknown as (args: unknown) => ToolRisk })

    expect(() => defineAgentTool(tool('invalid-risk'), invalidRisk)).toThrow('defaultRisk')
    expect(() => defineAgentTool(tool('invalid-scopes'), invalidScopes)).toThrow('scopes')
    expect(() => defineAgentTool(tool('invalid-resolver'), invalidResolver)).toThrow('resolveRisk')
  })

  test('uses a destructive sequential fallback for tools without metadata', () => {
    const registry = createToolPolicyRegistry([tool('legacy', 'parallel')])
    const fallback = registry.get('legacy')

    expect(fallback).toEqual(expect.objectContaining({
      defaultRisk: 'destructive',
      confirmation: 'always',
      executionMode: 'sequential',
    }))
    expect(configureToolExecution([tool('legacy', 'parallel')], registry)[0].executionMode)
      .toBe('sequential')
  })
})
describe('调用级风险解析', () => {
  test('resolves fixed read, write and destructive policies', () => {
    expect(resolveToolCallRisk(policy({ defaultRisk: 'read' }), {})).toBe('read')
    expect(resolveToolCallRisk(policy({ defaultRisk: 'write' }), {})).toBe('write')
    expect(resolveToolCallRisk(policy({ defaultRisk: 'destructive' }), {})).toBe('destructive')
  })

  test('maps every fragment action and fails closed for invalid arguments', () => {
    const expected: Record<string, ToolRisk> = {
      list: 'read',
      get: 'read',
      integrate: 'read',
      recommend: 'read',
      record: 'write',
      update: 'write',
      delete: 'destructive',
      unknown: 'destructive',
    }

    for (const [action, risk] of Object.entries(expected)) {
      expect(resolveFragmentToolRisk({ action })).toBe(risk)
    }
    expect(resolveFragmentToolRisk({})).toBe('destructive')
    expect(resolveFragmentToolRisk('list')).toBe('destructive')
    expect(resolveFragmentToolRisk(null)).toBe('destructive')
  })

  test('maps every crush action and fails closed for invalid actions', () => {
    expect(resolveCrushToolRisk({ action: 'list' })).toBe('read')
    expect(resolveCrushToolRisk({ action: 'get' })).toBe('read')
    expect(resolveCrushToolRisk({ action: 'create' })).toBe('write')
    expect(resolveCrushToolRisk({ action: 'update' })).toBe('write')
    expect(resolveCrushToolRisk({ action: 'delete' })).toBe('destructive')
    expect(resolveCrushToolRisk({ action: 'unknown' })).toBe('destructive')
    expect(resolveCrushToolRisk({})).toBe('destructive')
    expect(resolveCrushToolRisk([])).toBe('destructive')
  })

  test('falls back to destructive when a resolver throws or returns an invalid risk', () => {
    const throws = policy({ resolveRisk: () => { throw new Error('resolver failed') } })
    const invalid = policy({ resolveRisk: () => 'unsafe' as unknown as ToolRisk })
    const missing = policy({ resolveRisk: () => undefined as unknown as ToolRisk })

    expect(resolveToolCallRisk(throws, {})).toBe('destructive')
    expect(resolveToolCallRisk(invalid, {})).toBe('destructive')
    expect(resolveToolCallRisk(missing, {})).toBe('destructive')
    expect(resolveToolCallRisk(undefined, {})).toBe('destructive')
    expect(resolveToolCallRisk(policy({ defaultRisk: 'read' }), 'not-an-object')).toBe('destructive')
  })
})

describe('工具调用确认', () => {
  test('does not confirm read or policy-permitted write calls', async () => {
    const confirm = jest.fn(() => true)
    const readHook = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('reader', policy({ defaultRisk: 'read' })),
      confirm,
    })
    const writeHook = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('writer', policy({ defaultRisk: 'write' })),
      confirm,
    })

    await expect(readHook(context('reader', {}))).resolves.toBeUndefined()
    await expect(writeHook(context('writer', {}))).resolves.toBeUndefined()
    expect(confirm).not.toHaveBeenCalled()
  })

  test('requires confirmation for destructive calls and passes the complete request', async () => {
    const requests: unknown[] = []
    const hook = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('deleter', policy({ defaultRisk: 'destructive' })),
      confirm: async (request) => {
        requests.push(request)
        return true
      },
    })

    await expect(hook(context('deleter', { action: 'delete', id: 'fragment' }))).resolves.toBeUndefined()
    expect(requests).toEqual([
      expect.objectContaining({
        projectId: 'project',
        sessionId: 'session',
        toolCallId: 'call-1',
        toolName: 'deleter',
        args: { action: 'delete', id: 'fragment' },
      }),
    ])
  })

  test('blocks rejected, missing and failed confirmations', async () => {
    const rejected = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('deleter', policy({ defaultRisk: 'destructive' })),
      confirm: () => false,
    })
    const missing = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('deleter', policy({ defaultRisk: 'destructive' })),
    })
    const failed = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('deleter', policy({ defaultRisk: 'destructive' })),
      confirm: () => { throw new Error('confirmation failed') },
    })

    await expect(rejected(context('deleter', {}))).resolves.toEqual({
      block: true,
      reason: '危险操作需要明确确认',
    })
    await expect(missing(context('deleter', {}))).resolves.toEqual({
      block: true,
      reason: '危险操作需要明确确认',
    })
    await expect(failed(context('deleter', {}))).resolves.toEqual({
      block: true,
      reason: '危险操作确认失败，已阻止调用',
    })
  })

  test('blocks aborted and unregistered calls, including unknown actions', async () => {
    const confirm = jest.fn(() => false)
    const hook = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      toolPolicies: registryFor('fragment_manager', policy({
        defaultRisk: 'write',
        resolveRisk: resolveFragmentToolRisk,
      })),
      confirm,
    })
    const controller = new AbortController()
    controller.abort()

    await expect(hook(context('fragment_manager', { action: 'unknown' }))).resolves.toEqual({
      block: true,
      reason: '危险操作需要明确确认',
    })
    await expect(hook(context('unregistered', {}))).resolves.toEqual({
      block: true,
      reason: '危险操作需要明确确认',
    })
    await expect(hook(context('fragment_manager', { action: 'delete' }), controller.signal)).resolves.toEqual({
      block: true,
      reason: '危险操作已取消',
    })
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})

describe('工具执行模式', () => {
  test('uses parallel for pure reads and sequential for mixed or mutating tools', () => {
    const read = registeredTool('reader', policy({ defaultRisk: 'read' }))
    const writer = registeredTool('writer', policy({ defaultRisk: 'write' }))
    const mixed = registeredTool('mixed', policy({
      defaultRisk: 'read',
      resolveRisk: () => 'write',
    }))
    const configured = configureToolExecution([read, writer, mixed])

    expect(configured.map((item) => item.executionMode)).toEqual([
      'parallel',
      'sequential',
      'sequential',
    ])
  })

  test('keeps fragment and crush managers sequential and rejects unsafe parallel configuration', () => {
    const fragment = registeredTool('fragment_manager', policy({
      defaultRisk: 'write',
      executionMode: 'sequential',
      resolveRisk: resolveFragmentToolRisk,
    }))
    const crush = registeredTool('crush_manager', policy({
      defaultRisk: 'write',
      executionMode: 'sequential',
      resolveRisk: resolveCrushToolRisk,
    }))

    expect(configureToolExecution([fragment, crush]).map((item) => item.executionMode)).toEqual([
      'sequential',
      'sequential',
    ])
    expect(() => registeredTool('unsafe', policy({
      defaultRisk: 'destructive',
      executionMode: 'parallel',
    }))).toThrow('不能配置为 parallel')
  })
})
