import { readIntimateConfig } from '../persistence/intimateToggle'
import { safeCrushPath } from '../security/pathSafety'

export interface IntimatePolicy {
  enabled: boolean
}

export interface IntimateNarrativeInput {
  sexCount?: number
  sexDetails?: string
}

export class IntimateContentDisabledError extends Error {
  readonly code = 'INTIMATE_CONTENT_DISABLED'

  constructor() {
    super('Intimate content is disabled for this crush')
    this.name = 'IntimateContentDisabledError'
  }
}

/** Resolve the single source of truth for a crush's intimate mode. */
export function getIntimatePolicy(projectRoot: string, slug: string): IntimatePolicy {
  const configPath = safeCrushPath(projectRoot, slug, '.intimate_config')
  return { enabled: readIntimateConfig(configPath) }
}

function requestsIntimateContent(input: IntimateNarrativeInput): boolean {
  return (
    (input.sexCount !== undefined && input.sexCount > 0) ||
    (input.sexDetails !== undefined && input.sexDetails.trim().length > 0)
  )
}

/**
 * Reject explicit intimate generation parameters when the per-crush switch is
 * disabled. This is intended for main-process and agent entry points.
 */
export function assertIntimateContentAllowed(
  policy: IntimatePolicy,
  input: IntimateNarrativeInput
): void {
  if (!policy.enabled && requestsIntimateContent(input)) {
    throw new IntimateContentDisabledError()
  }
}

/** Remove intimate fields for callers that prefer sanitising over rejection. */
export function stripIntimateContent<T extends IntimateNarrativeInput>(
  policy: IntimatePolicy,
  input: T
): T {
  if (policy.enabled) return { ...input }
  return { ...input, sexCount: undefined, sexDetails: undefined }
}

/**
 * Phase 4 rules describe intimate behaviour. They must never be applied while
 * intimate mode is disabled; earlier phases remain available for ordinary
 * relationship progression.
 */
export function assertPhaseRulesAllowed(policy: IntimatePolicy, phase: number): void {
  if (!policy.enabled && phase >= 4) {
    throw new IntimateContentDisabledError()
  }
}
