import type {
  ChapterOutline,
  OutlineContext,
  Project,
  ProjectConfig,
  Volume,
  VolumeOutline,
} from '../novelProject'
import type { Foreshadow, NarrativeMemory } from '../narrativeWorkbench'
import type {
  Chapter,
  ChapterVersion,
  CreateChapterInput,
  CreateChapterVersionInput,
  UpdateChapterInput,
  ChapterVersionStatus,
} from './models'

export interface ChapterGenerationProjectPort {
  getProject(projectId: string): Project
  getProjectConfig(projectId: string): ProjectConfig
  getVolume(projectId: string, volumeId: string): Volume
  getVolumeOutlineByVolume(projectId: string, volumeId: string): VolumeOutline | null
  getChapterOutline(projectId: string, outlineId: string): ChapterOutline
  getOutlineContext(projectId: string, sourceMaterialIds?: readonly string[]): OutlineContext
}

/** Optional narrative stores for compiler context assembly (main injects real repositories). */
export interface ChapterGenerationMemoryPort {
  listByProject(projectId: string): NarrativeMemory[]
}

export interface ChapterGenerationForeshadowPort {
  listByProject(projectId: string): Foreshadow[]
}

export interface ChapterStore {
  create(input: CreateChapterInput): Chapter
  getById(id: string): Chapter | null
  getByProjectAndNumber(projectId: string, chapterNumber: number): Chapter | null
  listByProject(projectId: string): Chapter[]
  update(id: string, input: UpdateChapterInput, expectedVersion?: number): Chapter | null
}

export interface ChapterVersionStore {
  create(input: CreateChapterVersionInput): ChapterVersion
  getById(id: string): ChapterVersion | null
  getByTaskId(taskId: string): ChapterVersion | null
  listByChapter(chapterId: string): ChapterVersion[]
  setStatus(
    id: string,
    status: ChapterVersionStatus,
    expectedStatus?: ChapterVersionStatus,
  ): ChapterVersion | null
}
