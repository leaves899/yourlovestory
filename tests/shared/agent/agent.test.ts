import type { AgentOptions, AgentTool } from '@earendil-works/pi-agent-core'
import { createProjectSessionAgentFactory } from '@/agent/agent'
import {
  defineAgentTool,
  type ToolSecurityPolicy,
} from '@/agent/permissions'
import type { PiRuntime } from '@/agent/runtime'

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

const readerPolicy: ToolSecurityPolicy = {
  defaultRisk: 'read',
  scopes: ['test:read'],
  confirmation: 'never',
}

class CapturingAgent {
  public static options: AgentOptions | undefined

  public constructor(options?: AgentOptions) {
    CapturingAgent.options = options
  }
}

function runtime(): PiRuntime {
  return {
    Agent: CapturingAgent as unknown as PiRuntime['Agent'],
    streamSimple: (() => { throw new Error('stream should not be called') }) as unknown as PiRuntime['streamSimple'],
    createStream: (() => { throw new Error('stream should not be created') }) as unknown as PiRuntime['createStream'],
  }
}

describe('Agent factory security registration compatibility', () => {
  test('keeps options.tools and additionalTools while configuring fallback execution', async () => {
    const declaredReader = defineAgentTool(tool('declared_reader'), readerPolicy)
    const legacyAdditional = tool('legacy_additional', 'parallel')
    const factory = createProjectSessionAgentFactory({
      loadRuntime: async () => runtime(),
      loadTools: async () => [declaredReader],
    })

    await factory.create({
      projectId: 'project',
      sessionId: 'session',
      llm: { baseUrl: 'https://example.invalid/v1', model: 'test-model' },
      tools: [declaredReader],
      additionalTools: [legacyAdditional],
    })

    const configuredTools = CapturingAgent.options?.initialState?.tools ?? []
    expect(configuredTools.map((item) => [item.name, item.executionMode])).toEqual([
      ['declared_reader', 'parallel'],
      ['legacy_additional', 'sequential'],
    ])
  })
})
