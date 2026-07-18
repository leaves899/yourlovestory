export class EntityNotFoundError extends Error {
  public readonly code = 'ENTITY_NOT_FOUND'

  public constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`)
    this.name = 'EntityNotFoundError'
  }
}

export class VersionConflictError extends Error {
  public readonly code = 'VERSION_CONFLICT'

  public constructor(entity: string, id: string, expectedVersion: number, actualVersion: number) {
    super(
      `${entity} version conflict for ${id}: expected ${expectedVersion}, actual ${actualVersion}`,
    )
    this.name = 'VersionConflictError'
  }
}

export class CurrentProjectDeletionError extends Error {
  public readonly code = 'CURRENT_PROJECT_DELETE_PROTECTED'

  public constructor(projectId: string) {
    super(`Current project cannot be deleted: ${projectId}`)
    this.name = 'CurrentProjectDeletionError'
  }
}

export class InvalidRelationEndpointError extends Error {
  public readonly code = 'INVALID_RELATION_ENDPOINT'

  public constructor(message: string) {
    super(message)
    this.name = 'InvalidRelationEndpointError'
  }
}

export class VolumeDeletionProtectedError extends Error {
  public readonly code = 'VOLUME_DELETE_PROTECTED'

  public constructor(volumeId: string) {
    super(`Volume cannot be deleted while it has outline data: ${volumeId}`)
    this.name = 'VolumeDeletionProtectedError'
  }
}

export class OutlineNotEditableError extends Error {
  public readonly code = 'OUTLINE_NOT_EDITABLE'

  public constructor(entity: string, id: string, status: string) {
    super(`${entity} cannot be edited in status ${status}: ${id}`)
    this.name = 'OutlineNotEditableError'
  }
}

export class OutlineStatusTransitionError extends Error {
  public readonly code = 'INVALID_OUTLINE_STATUS_TRANSITION'

  public constructor(entity: string, id: string, from: string, to: string) {
    super(`Invalid ${entity} status transition for ${id}: ${from} -> ${to}`)
    this.name = 'OutlineStatusTransitionError'
  }
}

export class OutlineStoreNotConfiguredError extends Error {
  public readonly code = 'OUTLINE_STORE_NOT_CONFIGURED'

  public constructor() {
    super('Outline stores are not configured')
    this.name = 'OutlineStoreNotConfiguredError'
  }
}

export class ChapterGenerationBoundaryError extends Error {
  public readonly code = 'CHAPTER_GENERATION_BOUNDARY'

  public constructor(message: string) {
    super(message)
    this.name = 'ChapterGenerationBoundaryError'
  }
}

export class ChapterVersionStatusTransitionError extends Error {
  public readonly code = 'INVALID_CHAPTER_VERSION_STATUS_TRANSITION'

  public constructor(id: string, from: string, to: string) {
    super(`Invalid chapter version status transition for ${id}: ${from} -> ${to}`)
    this.name = 'ChapterVersionStatusTransitionError'
  }
}
