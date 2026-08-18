import type { JsonObject, JsonValue } from '../novelProject'
import {
  CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION,
  CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION,
} from './types'

export type GenerationCheckpointStage = 'body' | 'summary' | 'fact_check' | 'saving' | 'review'

export interface StrictGenerationCheckpoint {
  schema_version: number
  stage: GenerationCheckpointStage
  body: string
  summary: string
  fact_check_text: string
  fact_check: JsonObject | null
  version_id: string | null
  source_content?: string
  updated_at?: string
}

export interface StrictPolishCheckpoint {
  schema_version: number
  operation: 'paragraph_revision' | 'chapter_polish'
  source_content: string
  generated_content: string
  revision_id: string | null
  status: 'running' | 'completed' | 'fallback' | 'cancelled'
  error: string | null
  applied: boolean
  updated_at?: string
}

const GENERATION_STAGES = new Set<GenerationCheckpointStage>([
  'body',
  'summary',
  'fact_check',
  'saving',
  'review',
])

function isRecord(value: JsonValue | undefined | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: JsonValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Strict generation checkpoint parser shared by classifier and runner.
 * Returns null when the payload is missing required fields or has invalid enums/schema.
 */
export function parseStrictGenerationCheckpoint(
  value: JsonObject | null | undefined,
): StrictGenerationCheckpoint | null {
  if (!value || !isRecord(value)) return null
  if (typeof value.schema_version !== 'number' || !Number.isFinite(value.schema_version)) {
    return null
  }
  if (value.schema_version !== CHAPTER_GENERATION_CHECKPOINT_SCHEMA_VERSION) {
    return null
  }
  if (typeof value.stage !== 'string' || !GENERATION_STAGES.has(value.stage as GenerationCheckpointStage)) {
    return null
  }
  if (value.body !== undefined && typeof value.body !== 'string') return null
  if (value.summary !== undefined && typeof value.summary !== 'string') return null
  if (value.fact_check_text !== undefined && typeof value.fact_check_text !== 'string') return null
  if (value.source_content !== undefined && typeof value.source_content !== 'string') return null
  if (
    value.version_id !== undefined
    && value.version_id !== null
    && typeof value.version_id !== 'string'
  ) {
    return null
  }
  if (
    value.fact_check !== undefined
    && value.fact_check !== null
    && !isRecord(value.fact_check)
  ) {
    return null
  }
  return {
    schema_version: value.schema_version,
    stage: value.stage as GenerationCheckpointStage,
    body: readString(value.body),
    summary: readString(value.summary),
    fact_check_text: readString(value.fact_check_text),
    fact_check: isRecord(value.fact_check) ? value.fact_check : null,
    version_id: typeof value.version_id === 'string' ? value.version_id : null,
    ...(typeof value.source_content === 'string' ? { source_content: value.source_content } : {}),
    ...(typeof value.updated_at === 'string' ? { updated_at: value.updated_at } : {}),
  }
}

/**
 * Strict polish checkpoint parser shared by classifier and runner.
 * Mirrors runner requirements: schema, operation, status, and typed fields.
 */
export function parseStrictPolishCheckpoint(
  value: JsonObject | null | undefined,
): StrictPolishCheckpoint | null {
  if (!value || !isRecord(value)) return null
  if (typeof value.schema_version !== 'number' || !Number.isFinite(value.schema_version)) {
    return null
  }
  if (value.schema_version !== CHAPTER_POLISH_CHECKPOINT_SCHEMA_VERSION) {
    return null
  }
  const operation = value.operation
  const status = value.status
  if (
    (operation !== 'paragraph_revision' && operation !== 'chapter_polish')
    || (status !== 'running' && status !== 'completed' && status !== 'fallback' && status !== 'cancelled')
  ) {
    return null
  }
  if (
    value.revision_id !== undefined
    && value.revision_id !== null
    && typeof value.revision_id !== 'string'
  ) {
    return null
  }
  if (value.error !== undefined && value.error !== null && typeof value.error !== 'string') {
    return null
  }
  if (value.source_content !== undefined && typeof value.source_content !== 'string') return null
  if (value.generated_content !== undefined && typeof value.generated_content !== 'string') return null
  return {
    schema_version: value.schema_version,
    operation,
    source_content: typeof value.source_content === 'string' ? value.source_content : '',
    generated_content: typeof value.generated_content === 'string' ? value.generated_content : '',
    revision_id: typeof value.revision_id === 'string' ? value.revision_id : null,
    status,
    error: typeof value.error === 'string' ? value.error : null,
    applied: value.applied === true,
    ...(typeof value.updated_at === 'string' ? { updated_at: value.updated_at } : {}),
  }
}

export function generationCheckpointToJson(checkpoint: StrictGenerationCheckpoint): JsonObject {
  return {
    schema_version: checkpoint.schema_version,
    stage: checkpoint.stage,
    body: checkpoint.body,
    summary: checkpoint.summary,
    fact_check_text: checkpoint.fact_check_text,
    fact_check: checkpoint.fact_check,
    version_id: checkpoint.version_id,
    ...(checkpoint.updated_at ? { updated_at: checkpoint.updated_at } : {}),
  }
}

export function polishCheckpointToJson(checkpoint: StrictPolishCheckpoint): JsonObject {
  return {
    schema_version: checkpoint.schema_version,
    operation: checkpoint.operation,
    source_content: checkpoint.source_content,
    generated_content: checkpoint.generated_content,
    revision_id: checkpoint.revision_id,
    status: checkpoint.status,
    error: checkpoint.error,
    applied: checkpoint.applied,
    ...(checkpoint.updated_at ? { updated_at: checkpoint.updated_at } : {}),
  }
}
