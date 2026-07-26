import type { LlmConfigInput } from '../../agent/llm'
import type { JsonObject } from '../database'
import type { StartTaskInput, TaskManager } from '../tasks'
import { isRecord, readString, type IpcRegistrar } from './shared'

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function isJsonValue(value: unknown): value is JsonObject[string] {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true
  }
  if (Array.isArray(value)) return value.every(isJsonValue)
  return isRecord(value) && Object.values(value).every(isJsonValue)
}

function parseLlmConfig(value: unknown): LlmConfigInput {
  if (!isRecord(value)) throw new Error('llm config is required')
  return {
    provider: readOptionalString(value.provider),
    baseUrl: readString(value.baseUrl, 'llm.baseUrl'),
    model: readString(value.model, 'llm.model'),
    contextBudget: readOptionalPositiveInteger(value.contextBudget),
    maxOutputTokens: readOptionalPositiveInteger(value.maxOutputTokens),
    temperature: typeof value.temperature === 'number' ? value.temperature : undefined,
    streamingEnabled: typeof value.streamingEnabled === 'boolean'
      ? value.streamingEnabled
      : undefined,
    maxRetries: readOptionalNonNegativeInteger(value.maxRetries),
    retryDelayMs: readOptionalNonNegativeInteger(value.retryDelayMs),
    maxRetryDelayMs: readOptionalNonNegativeInteger(value.maxRetryDelayMs),
    timeoutMs: readOptionalPositiveInteger(value.timeoutMs),
  }
}

function parseTaskStartInput(value: unknown): StartTaskInput {
  if (!isRecord(value)) throw new Error('task input is required')
  const rawInput = value.input
  const input: JsonObject | undefined = isRecord(rawInput)
    && Object.values(rawInput).every(isJsonValue)
    ? rawInput as JsonObject
    : undefined
  return {
    projectId: readString(value.projectId, 'projectId'),
    sessionId: readString(value.sessionId, 'sessionId'),
    taskType: readString(value.taskType, 'taskType'),
    prompt: readString(value.prompt, 'prompt'),
    llm: parseLlmConfig(value.llm),
    chapterId: typeof value.chapterId === 'string' ? value.chapterId : undefined,
    parentTaskId: typeof value.parentTaskId === 'string' ? value.parentTaskId : undefined,
    input,
    systemPrompt: typeof value.systemPrompt === 'string' ? value.systemPrompt : undefined,
  }
}

export function registerTaskIPC(ipc: IpcRegistrar, taskManager?: TaskManager): void {
  ipc.handle('task:run', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    const handle = taskManager.start(parseTaskStartInput(params))
    return { success: true, data: { taskId: handle.taskId } }
  })

  ipc.handle('task:cancel', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task cancel input is required')
    const taskId = readString(params.taskId, 'taskId')
    return { success: taskManager.cancel(taskId) }
  })

  ipc.handle('task:get', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task get input is required')
    const taskId = readString(params.taskId, 'taskId')
    return { success: true, data: taskManager.get(taskId) }
  })

  ipc.handle('task:list', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task list input is required')
    const projectId = readString(params.projectId, 'projectId')
    return { success: true, data: taskManager.listByProject(projectId) }
  })

  ipc.handle('task:resume', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task resume input is required')
    const taskId = readString(params.taskId, 'taskId')
    const handle = taskManager.resume(taskId)
    return {
      success: handle !== null,
      ...(handle ? { data: { taskId: handle.taskId } } : {}),
    }
  })

  ipc.handle('task:recoverable', async (_, params: unknown) => {
    if (!taskManager) throw new Error('TaskManager is not initialized')
    if (!isRecord(params)) throw new Error('task recoverable input is required')
    const projectId = readString(params.projectId, 'projectId')
    return { success: true, data: taskManager.listRecoverable(projectId) }
  })
}
