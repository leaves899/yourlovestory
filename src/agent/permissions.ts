import type {
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from '@earendil-works/pi-agent-core'
import type { TSchema } from 'typebox'

export type ToolRisk = 'read' | 'write' | 'destructive'

export type ToolConfirmationPolicy = 'never' | 'destructive' | 'always'

export interface ToolSecurityPolicy {
  defaultRisk: ToolRisk
  scopes: readonly string[]
  confirmation: ToolConfirmationPolicy
  executionMode?: 'parallel' | 'sequential'
  resolveRisk?: (args: unknown) => ToolRisk
}

export type RegisteredAgentTool<P extends TSchema = TSchema, D = unknown> =
  AgentTool<P, D> & {
    security: ToolSecurityPolicy
  }

export interface DangerousOperationRequest {
  projectId: string
  sessionId: string
  toolCallId: string
  toolName: string
  args: unknown
}

export type DangerousOperationConfirmation = (
  request: DangerousOperationRequest,
  signal?: AbortSignal,
) => Promise<boolean> | boolean

export interface ToolPermissionOptions {
  projectId: string
  sessionId: string
  toolPolicies?: ReadonlyMap<string, ToolSecurityPolicy>
  confirm?: DangerousOperationConfirmation
}

const FAIL_CLOSED_TOOL_POLICY: ToolSecurityPolicy = Object.freeze({
  defaultRisk: 'destructive',
  scopes: Object.freeze([]) as readonly string[],
  confirmation: 'always',
  executionMode: 'sequential',
})

const TOOL_CONFIRMATION_POLICIES = ['never', 'destructive', 'always'] as const
const TOOL_EXECUTION_MODES = ['parallel', 'sequential'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isToolRisk(value: unknown): value is ToolRisk {
  return value === 'read' || value === 'write' || value === 'destructive'
}

function isToolConfirmationPolicy(value: unknown): value is ToolConfirmationPolicy {
  return TOOL_CONFIRMATION_POLICIES.includes(value as ToolConfirmationPolicy)
}

function isToolExecutionMode(value: unknown): value is NonNullable<ToolSecurityPolicy['executionMode']> {
  return TOOL_EXECUTION_MODES.includes(value as NonNullable<ToolSecurityPolicy['executionMode']>)
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(
    (item): item is string => typeof item === 'string' && item.trim() !== '',
  )
}

function assertToolName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('Agent 工具名称不能为空')
  }
}

function normalizeToolSecurityPolicy(toolName: string, value: unknown): ToolSecurityPolicy {
  if (!isRecord(value)) {
    throw new Error(`Agent 工具 ${toolName} 缺少有效的安全元数据`)
  }

  if (!isToolRisk(value.defaultRisk)) {
    throw new Error(`Agent 工具 ${toolName} 的 defaultRisk 无效`)
  }

  if (!isNonEmptyStringArray(value.scopes)) {
    throw new Error(`Agent 工具 ${toolName} 的 scopes 必须包含至少一个非空范围`)
  }

  if (!isToolConfirmationPolicy(value.confirmation)) {
    throw new Error(`Agent 工具 ${toolName} 的 confirmation policy 无效`)
  }

  const executionMode = value.executionMode
  if (executionMode !== undefined && !isToolExecutionMode(executionMode)) {
    throw new Error(`Agent 工具 ${toolName} 的 executionMode 无效`)
  }

  const resolver = value.resolveRisk
  if (resolver !== undefined && typeof resolver !== 'function') {
    throw new Error(`Agent 工具 ${toolName} 的 resolveRisk 必须是函数`)
  }

  const typedResolver = resolver === undefined
    ? undefined
    : (resolver as (args: unknown) => unknown)

  return {
    defaultRisk: value.defaultRisk,
    scopes: Object.freeze([...value.scopes]) as readonly string[],
    confirmation: value.confirmation,
    ...(executionMode === undefined ? {} : { executionMode }),
    ...(typedResolver === undefined
      ? {}
      : {
          resolveRisk: (args: unknown): ToolRisk => {
            const risk = typedResolver(args)
            if (!isToolRisk(risk)) {
              throw new Error(`Agent 工具 ${toolName} 的 resolveRisk 返回了无效风险等级`)
            }
            return risk
          },
        }),
  }
}

function declaredSecurity(tool: AgentTool): unknown | undefined {
  if (!Object.prototype.hasOwnProperty.call(tool, 'security')) return undefined
  return (tool as AgentTool & { security?: unknown }).security
}

/**
 * 为工具绑定并校验安全元数据。安全策略由工具注册者声明，而不是由权限模块猜测工具名称。
 */
export function defineAgentTool<P extends TSchema, D>(
  tool: AgentTool<P, D>,
  security: ToolSecurityPolicy,
): RegisteredAgentTool<P, D> {
  assertToolName(tool.name)
  const normalizedSecurity = normalizeToolSecurityPolicy(tool.name, security)
  const executionMode = resolveToolExecutionMode(tool, normalizedSecurity)
  return {
    ...tool,
    executionMode,
    security: { ...normalizedSecurity, executionMode },
  }
}

/**
 * 将本次 Agent 可用的工具转换为只读策略索引。
 * 没有 metadata 的历史或外部工具进入保守 fallback，不会静默获得低风险权限。
 */
export function createToolPolicyRegistry(
  tools: readonly AgentTool[],
): ReadonlyMap<string, ToolSecurityPolicy> {
  const registry = new Map<string, ToolSecurityPolicy>()

  for (const tool of tools) {
    assertToolName(tool.name)
    if (registry.has(tool.name)) {
      throw new Error(`Agent 工具名称重复注册: ${tool.name}`)
    }

    const security = declaredSecurity(tool)
    registry.set(
      tool.name,
      security === undefined
        ? FAIL_CLOSED_TOOL_POLICY
        : normalizeToolSecurityPolicy(tool.name, security),
    )
  }

  return registry
}

/**
 * 解析单次调用风险。参数结构、策略或 resolver 发生异常时一律回退到 destructive。
 */
export function resolveToolCallRisk(
  policy: ToolSecurityPolicy | undefined,
  args: unknown,
): ToolRisk {
  if (!isRecord(args) || policy === undefined) return 'destructive'

  try {
    const risk = policy.resolveRisk === undefined
      ? policy.defaultRisk
      : policy.resolveRisk(args)
    return isToolRisk(risk) ? risk : 'destructive'
  } catch {
    return 'destructive'
  }
}

export function requiresToolConfirmation(
  risk: ToolRisk,
  policy: ToolSecurityPolicy,
): boolean {
  if (risk === 'destructive') return true
  if (policy.confirmation === 'always') return true
  return false
}

function policyMayMutate(policy: ToolSecurityPolicy): boolean {
  return policy.defaultRisk !== 'read' || policy.resolveRisk !== undefined
}

function resolveToolExecutionMode(
  tool: AgentTool,
  policy: ToolSecurityPolicy,
): 'parallel' | 'sequential' {
  const requestedMode = policy.executionMode ?? tool.executionMode
  if (requestedMode === 'parallel' && policyMayMutate(policy)) {
    throw new Error(`Agent 工具 ${tool.name} 可能修改数据，不能配置为 parallel`)
  }
  if (requestedMode !== undefined) return requestedMode
  return policyMayMutate(policy) ? 'sequential' : 'parallel'
}

export function configureToolExecution(
  tools: readonly AgentTool[],
  registry: ReadonlyMap<string, ToolSecurityPolicy> = createToolPolicyRegistry(tools),
): AgentTool[] {
  return tools.map((tool) => {
    const policy = registry.get(tool.name) ?? FAIL_CLOSED_TOOL_POLICY
    return {
      ...tool,
      executionMode: resolveToolExecutionMode(tool, policy),
    }
  })
}

export function createDangerousOperationHook(
  options: ToolPermissionOptions,
): (
  context: BeforeToolCallContext,
  signal?: AbortSignal,
) => Promise<BeforeToolCallResult | undefined> {
  return async (context, signal) => {
    if (signal?.aborted) return { block: true, reason: '危险操作已取消' }

    const policy = options.toolPolicies?.get(context.toolCall.name) ?? FAIL_CLOSED_TOOL_POLICY
    const risk = resolveToolCallRisk(policy, context.args)
    if (!requiresToolConfirmation(risk, policy)) return undefined
    if (signal?.aborted) return { block: true, reason: '危险操作已取消' }

    if (!options.confirm) {
      return { block: true, reason: '危险操作需要明确确认' }
    }

    const request: DangerousOperationRequest = {
      projectId: options.projectId,
      sessionId: options.sessionId,
      toolCallId: context.toolCall.id,
      toolName: context.toolCall.name,
      args: context.args,
    }

    let confirmed = false
    try {
      confirmed = await options.confirm(request, signal)
    } catch {
      return { block: true, reason: '危险操作确认失败，已阻止调用' }
    }

    if (signal?.aborted) return { block: true, reason: '危险操作已取消' }
    return confirmed ? undefined : { block: true, reason: '危险操作需要明确确认' }
  }
}
