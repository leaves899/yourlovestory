import type {
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from '@earendil-works/pi-agent-core'

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
  mutatingToolNames?: readonly string[]
  dangerousToolNames?: readonly string[]
  isDangerous?: (context: BeforeToolCallContext) => boolean
  confirm?: DangerousOperationConfirmation
}

const DEFAULT_MUTATING_TOOLS = ['day_writer', 'fragment_manager', 'crush_manager'] as const
const DEFAULT_DANGEROUS_TOOLS = ['fragment_manager', 'crush_manager'] as const
const DEFAULT_DANGEROUS_ACTIONS = new Set([
  'delete',
  'overwrite',
  'publish',
  'lock',
  'confirm',
])

function readAction(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null || !('action' in args)) return undefined
  const action = args.action
  return typeof action === 'string' ? action : undefined
}

export function configureToolExecution(
  tools: readonly AgentTool[],
  mutatingToolNames: readonly string[] = DEFAULT_MUTATING_TOOLS,
): AgentTool[] {
  const mutating = new Set(mutatingToolNames)
  return tools.map((tool) =>
    mutating.has(tool.name)
      ? { ...tool, executionMode: 'sequential' as const }
      : { ...tool, executionMode: tool.executionMode ?? 'parallel' },
  )
}

export function createDangerousOperationHook(
  options: ToolPermissionOptions,
): (
  context: BeforeToolCallContext,
  signal?: AbortSignal,
) => Promise<BeforeToolCallResult | undefined> {
  const dangerousTools = new Set(options.dangerousToolNames ?? DEFAULT_DANGEROUS_TOOLS)
  const isDangerous =
    options.isDangerous ??
    ((context: BeforeToolCallContext): boolean => {
      const action = readAction(context.args)
      return dangerousTools.has(context.toolCall.name) && action !== undefined
        ? DEFAULT_DANGEROUS_ACTIONS.has(action)
        : false
    })

  return async (context, signal) => {
    if (!isDangerous(context)) return undefined
    if (signal?.aborted) return { block: true, reason: '危险操作已取消' }

    const request: DangerousOperationRequest = {
      projectId: options.projectId,
      sessionId: options.sessionId,
      toolCallId: context.toolCall.id,
      toolName: context.toolCall.name,
      args: context.args,
    }
    const confirmed = options.confirm ? await options.confirm(request, signal) : false
    return confirmed
      ? undefined
      : { block: true, reason: '危险操作需要明确确认' }
  }
}
