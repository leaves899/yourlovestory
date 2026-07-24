import type { LlmConfigInput } from '../../agent/llm'
import type { StartChapterGenerationInput, StartChapterPolishInput } from './taskManager'
import { normalizeLlmBaseUrl } from '../../agent/llm/config'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is required`)
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

function positiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`)
  }
  return value
}

function nonNegativeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`)
  }
  return value
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number`)
  }
  return value
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`)
  return value
}

function parseLlmConfig(value: unknown): LlmConfigInput {
  if (!isRecord(value)) throw new Error('llm config is required')
  return {
    provider: optionalString(value.provider, 'llm.provider'),
    baseUrl: normalizeLlmBaseUrl(readString(value.baseUrl, 'llm.baseUrl')),
    model: readString(value.model, 'llm.model'),
    apiKey: optionalString(value.apiKey, 'llm.apiKey'),
    contextBudget: positiveInteger(value.contextBudget, 'llm.contextBudget'),
    maxOutputTokens: positiveInteger(value.maxOutputTokens, 'llm.maxOutputTokens'),
    temperature: optionalNumber(value.temperature, 'llm.temperature'),
    streamingEnabled: optionalBoolean(value.streamingEnabled, 'llm.streamingEnabled'),
    maxRetries: nonNegativeInteger(value.maxRetries, 'llm.maxRetries'),
    retryDelayMs: nonNegativeInteger(value.retryDelayMs, 'llm.retryDelayMs'),
    maxRetryDelayMs: nonNegativeInteger(value.maxRetryDelayMs, 'llm.maxRetryDelayMs'),
    timeoutMs: positiveInteger(value.timeoutMs, 'llm.timeoutMs'),
  }
}

export function parseChapterGenerationStartParams(value: unknown): StartChapterGenerationInput {
  if (!isRecord(value)) throw new Error('chapter generation input is required')
  const chapterId = value.chapter_id
  if (chapterId !== undefined && chapterId !== null) {
    if (typeof chapterId !== 'string' || chapterId.trim() === '') {
      throw new Error('chapter_id must be a non-empty string')
    }
  }
  const autoConfirm = value.auto_confirm
  if (autoConfirm !== undefined && typeof autoConfirm !== 'boolean') {
    throw new Error('auto_confirm must be a boolean')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    sessionId: readString(value.session_id, 'session_id'),
    chapterOutlineId: readString(value.chapter_outline_id, 'chapter_outline_id'),
    chapterId: typeof chapterId === 'string' ? chapterId : undefined,
    autoConfirm,
    llm: parseLlmConfig(value.llm),
  }
}

export function parseChapterPolishStartParams(value: unknown): StartChapterPolishInput {
  if (!isRecord(value)) throw new Error('chapter polish input is required')
  const mode = value.mode
  if (mode !== undefined && mode !== 'chapter' && mode !== 'paragraph') {
    throw new Error('mode must be chapter or paragraph')
  }
  const blockId = value.block_id
  if (blockId !== undefined && blockId !== null && (typeof blockId !== 'string' || blockId.trim() === '')) {
    throw new Error('block_id must be a non-empty string')
  }
  if (mode === 'paragraph' && typeof blockId !== 'string') {
    throw new Error('block_id is required for paragraph mode')
  }
  const sourceRevisionId = value.source_revision_id
  if (
    sourceRevisionId !== undefined &&
    sourceRevisionId !== null &&
    (typeof sourceRevisionId !== 'string' || sourceRevisionId.trim() === '')
  ) {
    throw new Error('source_revision_id must be a non-empty string or null')
  }
  const autoApply = value.auto_apply
  if (autoApply !== undefined && typeof autoApply !== 'boolean') {
    throw new Error('auto_apply must be a boolean')
  }
  return {
    projectId: readString(value.project_id, 'project_id'),
    sessionId: readString(value.session_id, 'session_id'),
    chapterId: readString(value.chapter_id, 'chapter_id'),
    mode,
    blockId: typeof blockId === 'string' ? blockId : undefined,
    instruction: optionalString(value.instruction, 'instruction'),
    sourceRevisionId: typeof sourceRevisionId === 'string' ? sourceRevisionId : null,
    autoApply,
    llm: parseLlmConfig(value.llm),
  }
}
