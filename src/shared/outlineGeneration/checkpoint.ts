import type { JsonObject, JsonValue } from '../novelProject'
import { hasValidContextStageCompile } from '../chapterGeneration/service'
import type { ContextVolumeOutlineSnapshot } from '../contextCompiler'

export interface OutlineProposal extends JsonObject {
  summary: string
  theme: string
  main_conflict: string
  key_turning_points: string[]
  ending: string
}

export interface OutlineCheckpoint extends JsonObject {
  schema_version: 1
  stage: 'prepared' | 'model' | 'ready' | 'applied'
  project_id: string
  outline_id: string
  source_snapshot: string
  stage_compiles: JsonObject
  proposal: OutlineProposal | null
}

export interface OutlineSourceBoundary {
  targetVersion: number
  volumeOutline: ContextVolumeOutlineSnapshot
}

function isRecord(value: JsonValue | undefined | null): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isVersion(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/** Only the fields changed by applying a proposal may be restored for idempotent recovery. */
export function parseOutlineSourceBoundary(
  snapshot: string,
  projectId: string,
  outlineId: string,
): OutlineSourceBoundary | null {
  try {
    const source: JsonValue = JSON.parse(snapshot)
    if (!isRecord(source) || !isRecord(source.input) || source.input.task_kind !== 'outline'
      || !isRecord(source.target) || source.target.id !== outlineId || source.target.status !== 'draft'
      || !isVersion(source.target.version) || !isVersion(source.project_version)
      || !isVersion(source.config_version) || !isVersion(source.volume_version)
      || !isRecord(source.input.project) || source.input.project.id !== projectId
      || typeof source.prompt_version !== 'string' || !source.prompt_version.trim()) return null
    const outline = source.input.volume_outline
    if (!isRecord(outline) || outline.id !== outlineId
      || typeof outline.summary !== 'string' || typeof outline.theme !== 'string'
      || typeof outline.main_conflict !== 'string' || typeof outline.ending !== 'string'
      || !Array.isArray(outline.key_turning_points)
      || !outline.key_turning_points.every((item) => typeof item === 'string')) return null
    return {
      targetVersion: source.target.version,
      volumeOutline: {
        id: outlineId,
        summary: outline.summary,
        theme: outline.theme,
        main_conflict: outline.main_conflict,
        key_turning_points: outline.key_turning_points as string[],
        ending: outline.ending,
      },
    }
  } catch {
    return null
  }
}

export function parseOutlineProposal(value: JsonValue | undefined): OutlineProposal | null {
  if (!isRecord(value)) return null
  const fields = ['summary', 'theme', 'main_conflict', 'ending'] as const
  if (fields.some((key) => typeof value[key] !== 'string' || !value[key].trim())) return null
  if (!Array.isArray(value.key_turning_points) || value.key_turning_points.length > 100
    || !value.key_turning_points.every((item) => typeof item === 'string' && item.trim())) return null
  return {
    summary: value.summary as string, theme: value.theme as string,
    main_conflict: value.main_conflict as string, ending: value.ending as string,
    key_turning_points: value.key_turning_points as string[],
  }
}

export function parseOutlineCheckpoint(value: JsonObject | null | undefined): OutlineCheckpoint | null {
  if (!value || value.schema_version !== 1 || !['prepared', 'model', 'ready', 'applied'].includes(String(value.stage))) return null
  if (typeof value.project_id !== 'string' || !value.project_id.trim()
    || typeof value.outline_id !== 'string' || !value.outline_id.trim()
    || typeof value.source_snapshot !== 'string' || !value.source_snapshot.trim() || !isRecord(value.stage_compiles)
    || Object.keys(value.stage_compiles).length !== 1
    || !hasValidContextStageCompile(value.stage_compiles.outline, 'outline')) return null
  const source = parseOutlineSourceBoundary(value.source_snapshot, value.project_id, value.outline_id)
  if (!source) return null
  const proposal = value.proposal === null ? null : parseOutlineProposal(value.proposal)
  const resultStage = value.stage === 'ready' || value.stage === 'applied'
  if (resultStage ? !proposal : value.proposal !== null) return null
  const base: OutlineCheckpoint = {
    schema_version: 1, stage: value.stage as OutlineCheckpoint['stage'],
    project_id: value.project_id, outline_id: value.outline_id,
    source_snapshot: value.source_snapshot, stage_compiles: value.stage_compiles, proposal,
  }
  if (value.stage === 'applied') {
    if (!isVersion(value.applied_version) || value.applied_version !== source.targetVersion + 1) return null
    return { ...base, stage: 'applied', applied_version: value.applied_version }
  }
  if (Object.prototype.hasOwnProperty.call(value, 'applied_version')) return null
  return { ...base, stage: value.stage as 'prepared' | 'model' | 'ready' }
}
