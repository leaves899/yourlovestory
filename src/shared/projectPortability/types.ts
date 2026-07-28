import type { JsonValue } from '../novelProject'

export const PROJECT_ARCHIVE_FORMAT = 'yourcrush-project' as const
export const PROJECT_ARCHIVE_VERSION = 1 as const
export const PROJECT_ARCHIVE_EXTENSION = '.yourcrush-project.json'
export const PROJECT_ARCHIVE_MAX_BYTES = 50 * 1024 * 1024
export const PROJECT_IMPORT_TOKEN_TTL_MS = 10 * 60 * 1000

export type ProjectPortabilityErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_EXPORT_FAILED'
  | 'PROJECT_IMPORT_INVALID'
  | 'PROJECT_IMPORT_TOO_LARGE'
  | 'PROJECT_IMPORT_UNSUPPORTED_VERSION'
  | 'PROJECT_IMPORT_CHECKSUM_MISMATCH'
  | 'PROJECT_IMPORT_EXPIRED'
  | 'PROJECT_IMPORT_ALREADY_USED'
  | 'PROJECT_IMPORT_CONFLICT'
  | 'PROJECT_IMPORT_FAILED'
  | 'DATABASE_RECOVERY_REQUIRED'
  | 'LOCAL_IO_ERROR'

export type ProjectArchiveWarningCode =
  | 'legacy-crush-links-removed'
  | 'legacy-fragment-links-removed'
  | 'local-source-path-omitted'
  | 'credentials-excluded'
  | 'runtime-history-excluded'

export interface ProjectArchiveWarning {
  code: ProjectArchiveWarningCode
  count: number
  message: string
}

export interface ExportedProjectSkillBinding {
  skillName: string
  enabled: boolean
  config: JsonValue
}

export type ProjectArchiveRecord = Record<string, JsonValue>

export interface ProjectArchivePayloadV1 {
  projects: ProjectArchiveRecord[]
  project_configs: ProjectArchiveRecord[]
  llm_configs: ProjectArchiveRecord[]
  characters: ProjectArchiveRecord[]
  worldview_entries: ProjectArchiveRecord[]
  organizations: ProjectArchiveRecord[]
  relations: ProjectArchiveRecord[]
  source_materials: ProjectArchiveRecord[]
  arcs: ProjectArchiveRecord[]
  volumes: ProjectArchiveRecord[]
  volume_outlines: ProjectArchiveRecord[]
  chapter_outlines: ProjectArchiveRecord[]
  chapters: ProjectArchiveRecord[]
  chapter_revisions: ProjectArchiveRecord[]
  chapter_versions: ProjectArchiveRecord[]
  foreshadows: ProjectArchiveRecord[]
  foreshadow_events: ProjectArchiveRecord[]
  narrative_memories: ProjectArchiveRecord[]
  narrative_memory_proposals: ProjectArchiveRecord[]
  roadmap_items: ProjectArchiveRecord[]
  project_skills: ExportedProjectSkillBinding[]
}

export type ProjectArchiveCollection = keyof ProjectArchivePayloadV1
export type ProjectArchiveRecordCounts = Record<ProjectArchiveCollection, number>

export interface ProjectArchiveV1 {
  manifest: {
    format: typeof PROJECT_ARCHIVE_FORMAT
    formatVersion: typeof PROJECT_ARCHIVE_VERSION
    exportedAt: string
    appVersion: string
    databaseSchemaVersion: number
    sourceProjectId: string
    projectName: string
    payloadSha256: string
    exclusions: string[]
    warnings: ProjectArchiveWarning[]
  }
  payload: ProjectArchivePayloadV1
}

export interface ProjectExportResult {
  canceled: boolean
  fileName?: string
  size?: number
  sha256?: string
  recordCounts?: ProjectArchiveRecordCounts
  warnings?: ProjectArchiveWarning[]
}

export interface ProjectImportPreview {
  importToken: string
  projectName: string
  formatVersion: number
  exportedAt: string
  appVersion: string
  schemaVersion: number
  recordCounts: ProjectArchiveRecordCounts
  warnings: ProjectArchiveWarning[]
  credentialsExcluded: true
  runtimeHistoryExcluded: true
  expiresAt: string
}

export interface ProjectImportResult {
  projectId: string
  projectName: string
  projectSlug: string
  recordCounts: ProjectArchiveRecordCounts
  missingSkills: string[]
  credentialsRequireRebinding: true
}

export interface ProjectPortabilityError {
  code: ProjectPortabilityErrorCode
  message: string
}

export type ProjectPortabilityResponse<T> =
  | { success: true; data: T }
  | { success: false; error: ProjectPortabilityError }
