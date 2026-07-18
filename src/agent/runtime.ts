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

export type TypeBoxRuntime = typeof import('typebox')
export type TypeBoxBuilder = TypeBoxRuntime['Type']

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
let typeBoxRuntimePromise: Promise<TypeBoxRuntime> | undefined

export function loadTypeBoxRuntime(): Promise<TypeBoxRuntime> {
  typeBoxRuntimePromise ??= dynamicImport('typebox').then((module) => {
    getExport<TypeBoxRuntime['Type']>(module, 'Type')
    return module as TypeBoxRuntime
  })
  return typeBoxRuntimePromise
}

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
  dayTool: (Type: TypeBoxBuilder) => AgentTool
  fragmentTool: (Type: TypeBoxBuilder) => AgentTool
  crushTool: (Type: TypeBoxBuilder) => AgentTool
}

function localModuleSpecifier(fileName: string): string {
  return pathToFileURL(path.join(__dirname, 'tools', `${fileName}.js`)).href
}

export async function loadDefaultAgentTools(): Promise<readonly AgentTool[]> {
  const [typeBox, dayModule, fragmentModule, crushModule] = await Promise.all([
    loadTypeBoxRuntime(),
    dynamicImport(localModuleSpecifier('dayTool')),
    dynamicImport(localModuleSpecifier('fragmentTool')),
    dynamicImport(localModuleSpecifier('crushTool')),
  ])
  const modules = [dayModule, fragmentModule, crushModule] as const
  const tools: DefaultToolModules = {
    dayTool: getExport<DefaultToolModules['dayTool']>(modules[0], 'createDayTool'),
    fragmentTool: getExport<DefaultToolModules['fragmentTool']>(modules[1], 'createFragmentTool'),
    crushTool: getExport<DefaultToolModules['crushTool']>(modules[2], 'createCrushTool'),
  }
  return [
    tools.dayTool(typeBox.Type),
    tools.fragmentTool(typeBox.Type),
    tools.crushTool(typeBox.Type),
  ]
}
