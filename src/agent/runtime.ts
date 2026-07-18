import type { Agent, AgentOptions, AgentTool } from '@earendil-works/pi-agent-core'
import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export interface PiRuntime {
  Agent: new (options?: AgentOptions) => Agent
  streamSimple: StreamFn
  createStream: () => AssistantMessageEventStream
}

type DynamicImporter = (specifier: string) => Promise<unknown>

const dynamicImport = new Function('specifier', 'return import(specifier)') as unknown as DynamicImporter

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getExport<T>(module: unknown, name: string): T {
  if (!isRecord(module) || !(name in module)) {
    throw new Error(`Pi runtime export is missing: ${name}`)
  }
  return module[name] as T
}

let defaultRuntimePromise: Promise<PiRuntime> | undefined

export function loadDefaultPiRuntime(): Promise<PiRuntime> {
  defaultRuntimePromise ??= Promise.all([
    dynamicImport('@earendil-works/pi-agent-core'),
    dynamicImport('@earendil-works/pi-ai'),
  ]).then(([agentModule, aiModule]) => ({
    Agent: getExport<PiRuntime['Agent']>(agentModule, 'Agent'),
    streamSimple: getExport<PiRuntime['streamSimple']>(aiModule, 'streamSimple'),
    createStream: getExport<PiRuntime['createStream']>(
      aiModule,
      'createAssistantMessageEventStream',
    ),
  }))
  return defaultRuntimePromise
}

export interface DefaultToolModules {
  dayTool: AgentTool
  fragmentTool: AgentTool
  crushTool: AgentTool
}

function localModuleSpecifier(fileName: string): string {
  return pathToFileURL(path.join(__dirname, 'tools', `${fileName}.js`)).href
}

export async function loadDefaultAgentTools(): Promise<readonly AgentTool[]> {
  const modules = await Promise.all([
    dynamicImport(localModuleSpecifier('dayTool')),
    dynamicImport(localModuleSpecifier('fragmentTool')),
    dynamicImport(localModuleSpecifier('crushTool')),
  ])
  const tools: DefaultToolModules = {
    dayTool: getExport<AgentTool>(modules[0], 'dayTool'),
    fragmentTool: getExport<AgentTool>(modules[1], 'fragmentTool'),
    crushTool: getExport<AgentTool>(modules[2], 'crushTool'),
  }
  return [tools.dayTool, tools.fragmentTool, tools.crushTool]
}
