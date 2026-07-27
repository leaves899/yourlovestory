import type { LlmConfigInput } from '../../agent/llm'
import { normalizeLlmBaseUrl } from '../../agent/llm/config'
import type { JsonObject } from '../database'
import type { StartTaskInput, TaskManager } from '../tasks'
import { isRecord, readString, type IpcRegistry } from './shared'

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
    baseUrl: normalizeLlmBaseUrl(readString(value.baseUrl, 'llm.baseUrl')),
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

function requireTaskManager(taskManager?: TaskManager): TaskManager {
  if (!taskManager) throw new Error('TaskManager is not initialized')
  return taskManager
}

function parseTaskId(
  value: unknown,
  inputName: string,
): string {
  if (!isRecord(value)) throw new Error(`${inputName} input is required`)
  return readString(value.taskId, 'taskId')
}

function parseProjectId(
  value: unknown,
  inputName: string,
): string {
  if (!isRecord(value)) throw new Error(`${inputName} input is required`)
  return readString(value.projectId, 'projectId')
}

export function registerTaskIPC(ipc: IpcRegistry, taskManager?: TaskManager): void {
  ipc.register('task:run', async (_, input: {
    taskManager: TaskManager
    params: StartTaskInput
  }) => {
    const handle = input.taskManager.start(input.params)
    return { success: true, data: { taskId: handle.taskId } }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      params: parseTaskStartInput(value),
    }),
  })

  ipc.register('task:cancel', async (_, input: {
    taskManager: TaskManager
    taskId: string
  }) => {
    return { success: input.taskManager.cancel(input.taskId) }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      taskId: parseTaskId(value, 'task cancel'),
    }),
  })

  ipc.register('task:get', async (_, input: {
    taskManager: TaskManager
    taskId: string
  }) => {
    return { success: true, data: input.taskManager.get(input.taskId) }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      taskId: parseTaskId(value, 'task get'),
    }),
  })

  ipc.register('task:list', async (_, input: {
    taskManager: TaskManager
    projectId: string
  }) => {
    return { success: true, data: input.taskManager.listByProject(input.projectId) }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      projectId: parseProjectId(value, 'task list'),
    }),
  })

  ipc.register('task:resume', async (_, input: {
    taskManager: TaskManager
    taskId: string
  }) => {
    const handle = input.taskManager.resume(input.taskId)
    return {
      success: handle !== null,
      ...(handle ? { data: { taskId: handle.taskId } } : {}),
    }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      taskId: parseTaskId(value, 'task resume'),
    }),
  })

  ipc.register('task:recoverable', async (_, input: {
    taskManager: TaskManager
    projectId: string
  }) => {
    return {
      success: true,
      data: input.taskManager.listRecoverable(input.projectId),
    }
  }, {
    parse: (value) => ({
      taskManager: requireTaskManager(taskManager),
      projectId: parseProjectId(value, 'task recoverable'),
    }),
  })
}
