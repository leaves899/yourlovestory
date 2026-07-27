import type {
  ChapterOutline,
  Character,
  Organization,
  Project,
  ProjectConfig,
  Relation,
  SourceMaterial,
  Volume,
  VolumeOutline,
  WorldviewEntry,
} from '../novelProject'
import type { ChapterVersion, FactCheckFinding } from '../chapterGeneration'

export type FirstChapterStepId =
  | 'project'
  | 'concept'
  | 'characters'
  | 'relationship'
  | 'worldview'
  | 'volume-outline'
  | 'chapter-outline'
  | 'generation'
  | 'review'
  | 'narrative-update'

export type WorkflowCheckSeverity = 'error' | 'warning' | 'suggestion'

export interface WorkflowCheck {
  id: string
  severity: WorkflowCheckSeverity
  title: string
  message: string
  blocking: boolean
  actionLabel?: string
  actionRoute?: string
  autoFixKind?: 'suggest-project-slug' | 'create-first-volume' | 'create-first-chapter-outline'
}

export interface FirstChapterWorkflowStep {
  id: FirstChapterStepId
  title: string
  completed: boolean
  current: boolean
  actionRoute: string
  actionLabel: string
}

export interface FirstChapterWorkflowSnapshot {
  steps: FirstChapterWorkflowStep[]
  checks: WorkflowCheck[]
  completedStepCount: number
  totalStepCount: number
  canGenerate: boolean
  canConfirmChapter: boolean
}

export interface FirstChapterWorkflowInput {
  project: Project | null
  config: ProjectConfig | null
  characters: Character[]
  relations: Relation[]
  worldviewEntries: WorldviewEntry[]
  organizations: Organization[]
  sourceMaterials: SourceMaterial[]
  volumes: Volume[]
  volumeOutlines: VolumeOutline[]
  chapterOutlines: ChapterOutline[]
  chapterVersions: ChapterVersion[]
  modelCredentialConfigured: boolean
  modelEndpointValid: boolean
  generationTaskRunning: boolean
  factCheckFindings?: FactCheckFinding[]
  narrativeProposalFailures?: Array<'memory' | 'foreshadow'>
  memoryProposalCount?: number
  foreshadowProposalCount?: number
}
