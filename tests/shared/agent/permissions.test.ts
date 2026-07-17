import type {
  AgentTool,
  BeforeToolCallContext,
} from '@earendil-works/pi-agent-core'
import {
  configureToolExecution,
  createDangerousOperationHook,
} from '@/agent/permissions'

function tool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: name,
    parameters: { type: 'object' },
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: {} }),
  }
}

function context(name: string, args: unknown): BeforeToolCallContext {
  return {
    toolCall: { id: 'call-1', name, arguments: {} },
    args,
    assistantMessage: {} as BeforeToolCallContext['assistantMessage'],
    context: {} as BeforeToolCallContext['context'],
  }
}

describe('工具执行与危险操作确认', () => {
  test('marks mutating tools as sequential while leaving read tools parallel', () => {
    const configured = configureToolExecution([tool('reader'), tool('fragment_manager')])
    expect(configured[0].executionMode).toBe('parallel')
    expect(configured[1].executionMode).toBe('sequential')
  })

  test('blocks dangerous operations without explicit confirmation', async () => {
    const hook = createDangerousOperationHook({ projectId: 'project', sessionId: 'session' })
    await expect(hook(context('crush_manager', { action: 'delete' }))).resolves.toEqual({
      block: true,
      reason: '危险操作需要明确确认',
    })
  })

  test('passes the complete confirmation request to an injected confirmer', async () => {
    const requests: unknown[] = []
    const hook = createDangerousOperationHook({
      projectId: 'project',
      sessionId: 'session',
      confirm: async (request) => {
        requests.push(request)
        return true
      },
    })
    await expect(hook(context('fragment_manager', { action: 'delete', id: 'fragment' }))).resolves.toBeUndefined()
    expect(requests).toEqual([
      expect.objectContaining({
        projectId: 'project',
        sessionId: 'session',
        toolName: 'fragment_manager',
        args: { action: 'delete', id: 'fragment' },
      }),
    ])
  })
})
