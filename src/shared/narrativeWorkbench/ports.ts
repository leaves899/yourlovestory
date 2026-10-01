import type { Chapter, ChapterStore } from '../chapterGeneration'
import type { ChapterVersion } from '../chapterGeneration'
import type { EntityNotFoundError } from '../novelProject'
import type {
  ChapterRevision,
  CreateChapterRevisionInput,
  CreateForeshadowInput,
  CreateNarrativeMemoryInput,
  CreateNarrativeMemoryProposalInput,
  CreatePostprocessReportInput,
  Foreshadow,
  ForeshadowEvent,
  ForeshadowStatus,
  MemoryProposalStatus,
  NarrativeMemory,
  NarrativeMemoryProposal,
  PostprocessReport,
  ProjectSkill,
  ProjectSkillState,
  SkillDefinition,
} from './models'

export interface NarrativeProjectPort {
  getProject(projectId: string): { id: string; status: string }
}

export interface NarrativeChapterStore extends ChapterStore {
  getById(id: string): Chapter | null
  update(id: string, input: Parameters<ChapterStore['update']>[1], expectedVersion?: number): Chapter | null
}

export interface NarrativeChapterVersionStore {
  getById(id: string): ChapterVersion | null
}

export interface NarrativeMemoryStore {
  create(input: CreateNarrativeMemoryInput): NarrativeMemory
  getById(id: string): NarrativeMemory | null
  listByProject(projectId: string): NarrativeMemory[]
  createProposal(input: CreateNarrativeMemoryProposalInput): NarrativeMemoryProposal
  getProposalById(id: string): NarrativeMemoryProposal | null
  listProposalsByProject(projectId: string): NarrativeMemoryProposal[]
  listProposalsByChapter(projectId: string, chapterId: string): NarrativeMemoryProposal[]
  setProposalStatus(id: string, status: MemoryProposalStatus): NarrativeMemoryProposal | null
  approveProposal(id: string): NarrativeMemory | null
}

export interface ForeshadowStore {
  create(input: CreateForeshadowInput): Foreshadow
  getById(id: string): Foreshadow | null
  listByProject(projectId: string): Foreshadow[]
  updateStatus(
    id: string,
    status: ForeshadowStatus,
    actualPayoffChapterId?: string | null,
  ): Foreshadow | null
  addEvent(
    foreshadowId: string,
    chapterId: string | null,
    eventType: ForeshadowEvent['event_type'],
    note?: string,
  ): ForeshadowEvent
  listEvents(foreshadowId: string): ForeshadowEvent[]
}

export interface ChapterRevisionStore {
  create(input: CreateChapterRevisionInput): ChapterRevision
  getById(id: string): ChapterRevision | null
  getByTaskId?(taskId: string): ChapterRevision | null
  getCurrentByChapter(chapterId: string): ChapterRevision | null
  listByChapter(chapterId: string): ChapterRevision[]
  setCurrent(id: string): ChapterRevision | null
}

export interface SkillStore {
  create(input: Omit<SkillDefinition, 'id' | 'created_at' | 'updated_at'> & { id?: string }): SkillDefinition
  getByName(name: string): SkillDefinition | null
  list(): SkillDefinition[]
  listByProject(projectId: string): ProjectSkillState[]
  setProjectSkill(
    projectId: string,
    skillId: string,
    enabled: boolean,
    config?: ProjectSkill['config'],
  ): ProjectSkill
}

export interface PostprocessReportStore {
  create(input: CreatePostprocessReportInput): PostprocessReport
  getByTaskId?(taskId: string): PostprocessReport | null
  listByChapter(projectId: string, chapterId: string): PostprocessReport[]
}

export interface NarrativeWorkbenchStores {
  project: NarrativeProjectPort
  chapters: NarrativeChapterStore
  versions: NarrativeChapterVersionStore
  memories: NarrativeMemoryStore
  foreshadows: ForeshadowStore
  revisions: ChapterRevisionStore
  skills: SkillStore
  reports: PostprocessReportStore
}

export type NarrativeEntityNotFound = EntityNotFoundError
