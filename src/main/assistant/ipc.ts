import { ipcMain } from 'electron'
import type { LlmConfigInput } from '../../agent/llm'
import { isJsonValue, type JsonObject } from '../database'
import type { ChatSessionType } from '../database'
import type { AssistantService } from './service'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value.trim()
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined
}

function optionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

function parseLlmConfig(value: unknown): LlmConfigInput {
  if (!isRecord(value)) throw new Error('llm config is required')
  return {
    provider: optionalString(value.provider),
    baseUrl: requiredString(value.baseUrl, 'llm.baseUrl'),
    model: requiredString(value.model, 'llm.model'),
    credentialId: optionalString(value.credentialId),
    contextBudget: optionalPositiveInteger(value.contextBudget),
    maxOutputTokens: optionalPositiveInteger(value.maxOutputTokens),
    temperature: typeof value.temperature === 'number' ? value.temperature : undefined,
    streamingEnabled: typeof value.streamingEnabled === 'boolean' ? value.streamingEnabled : undefined,
    maxRetries: optionalNonNegativeInteger(value.maxRetries),
    retryDelayMs: optionalNonNegativeInteger(value.retryDelayMs),
    maxRetryDelayMs: optionalNonNegativeInteger(value.maxRetryDelayMs),
    timeoutMs: optionalPositiveInteger(value.timeoutMs),
  }
}

function parseAgentConfig(value: unknown): JsonObject | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value) || !Object.values(value).every(isJsonValue)) {
    throw new Error('agentConfig must be a JSON object')
  }
  return value as JsonObject
}

function parseSessionType(value: unknown): ChatSessionType | undefined {
  if (value === undefined) return undefined
  if (value !== 'assistant' && value !== 'writer' && value !== 'reviewer') {
    throw new Error('sessionType is invalid')
  }
  return value
}

export function registerAssistantIPC(service: AssistantService | undefined): void {
  if (!service) return

  ipcMain.handle('assistant:session:create', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant session input is required')
    return {
      success: true,
      data: service.createSession({
        projectId: requiredString(value.projectId, 'projectId'),
        title: optionalString(value.title),
        sessionType: parseSessionType(value.sessionType),
        agentConfig: parseAgentConfig(value.agentConfig),
      }),
    }
  })

  ipcMain.handle('assistant:session:list', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant session list input is required')
    return {
      success: true,
      data: service.listSessions(requiredString(value.projectId, 'projectId')),
    }
  })

  ipcMain.handle('assistant:session:get', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant session get input is required')
    return {
      success: true,
      data: service.getSession(requiredString(value.sessionId, 'sessionId')),
    }
  })

  ipcMain.handle('assistant:session:archive', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant session archive input is required')
    return {
      success: true,
      data: service.archiveSession(requiredString(value.sessionId, 'sessionId')),
    }
  })

  ipcMain.handle('assistant:prompt', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant prompt input is required')
    return {
      success: true,
      data: await service.prompt({
        sessionId: requiredString(value.sessionId, 'sessionId'),
        prompt: requiredString(value.prompt, 'prompt'),
        llm: parseLlmConfig(value.llm),
        systemPrompt: optionalString(value.systemPrompt),
      }),
    }
  })

  ipcMain.handle('assistant:cancel', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant cancel input is required')
    return {
      success: service.cancel(requiredString(value.sessionId, 'sessionId')),
    }
  })

  ipcMain.handle('assistant:steer', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant steer input is required')
    service.steer(
      requiredString(value.sessionId, 'sessionId'),
      requiredString(value.prompt, 'prompt'),
    )
    return { success: true }
  })

  ipcMain.handle('assistant:followUp', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant follow-up input is required')
    service.followUp(
      requiredString(value.sessionId, 'sessionId'),
      requiredString(value.prompt, 'prompt'),
    )
    return { success: true }
  })

  ipcMain.handle('assistant:confirmation', async (_, value: unknown) => {
    if (!isRecord(value)) throw new Error('assistant confirmation input is required')
    if (typeof value.approved !== 'boolean') throw new Error('approved must be a boolean')
    return {
      success: service.confirmOperation(
        requiredString(value.requestId, 'requestId'),
        value.approved,
      ),
    }
  })
}
