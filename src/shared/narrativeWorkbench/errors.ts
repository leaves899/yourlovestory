export class NarrativeStatusTransitionError extends Error {
  public readonly code = 'INVALID_NARRATIVE_STATUS_TRANSITION'

  public constructor(entity: string, id: string, from: string, to: string) {
    super(`Invalid ${entity} status transition for ${id}: ${from} -> ${to}`)
    this.name = 'NarrativeStatusTransitionError'
  }
}

export class NarrativeBoundaryError extends Error {
  public readonly code = 'NARRATIVE_BOUNDARY'

  public constructor(message: string) {
    super(message)
    this.name = 'NarrativeBoundaryError'
  }
}
