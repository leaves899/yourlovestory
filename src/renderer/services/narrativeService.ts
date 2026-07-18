import type {
  ChapterBlock,
  ChapterDiff,
  ChapterRevision,
  Foreshadow,
  ForeshadowEvent,
  MemoryExtractionResult,
  NarrativeMemory,
  NarrativeMemoryProposal,
  ProjectSkill,
  ProjectSkillState,
} from '../../shared/narrativeWorkbench'

interface NarrativeResponse<T> {
  success: boolean
  data?: T
  errors?: string[]
}

async function unwrap<T>(request: () => Promise<NarrativeResponse<T>>): Promise<T> {
  const response = await request()
  if (!response.success || response.data === undefined) {
    throw new Error(response.errors?.[0] ?? '叙事工作台请求失败')
  }
  return response.data
}

const narrativeService = {
  listMemories: (projectId: string): Promise<NarrativeMemory[]> =>
    unwrap(() => window.electronAPI.listNarrativeMemories(projectId)),
  listProposals: (projectId: string): Promise<NarrativeMemoryProposal[]> =>
    unwrap(() => window.electronAPI.listNarrativeMemoryProposals(projectId)),
  extractMemories: (
    projectId: string,
    chapterId: string,
    content?: string,
    sourceVersionId?: string | null,
  ): Promise<MemoryExtractionResult> =>
    unwrap(() =>
      window.electronAPI.extractNarrativeMemories(projectId, chapterId, content, sourceVersionId),
    ),
  approveProposal: (projectId: string, proposalId: string): Promise<NarrativeMemory> =>
    unwrap(() => window.electronAPI.approveNarrativeMemoryProposal(projectId, proposalId)),
  rejectProposal: (projectId: string, proposalId: string): Promise<NarrativeMemoryProposal> =>
    unwrap(() => window.electronAPI.rejectNarrativeMemoryProposal(projectId, proposalId)),
  listForeshadows: (projectId: string): Promise<Foreshadow[]> =>
    unwrap(() => window.electronAPI.listForeshadows(projectId)),
  listForeshadowEvents: (projectId: string, foreshadowId: string): Promise<ForeshadowEvent[]> =>
    unwrap(() => window.electronAPI.listForeshadowEvents(projectId, foreshadowId)),
  suggestForeshadows: (projectId: string, chapterId: string, endingHook?: string) =>
    unwrap(() => window.electronAPI.suggestForeshadows(projectId, chapterId, endingHook)),
  transitionForeshadow: (
    projectId: string,
    foreshadowId: string,
    status: Foreshadow['status'],
    note?: string,
    chapterId?: string | null,
  ): Promise<Foreshadow> =>
    unwrap(() =>
      window.electronAPI.transitionForeshadow(
        projectId,
        foreshadowId,
        status,
        note,
        chapterId,
      ),
    ),
  listSkills: (projectId: string): Promise<ProjectSkillState[]> =>
    unwrap(() => window.electronAPI.listNarrativeSkills(projectId)),
  toggleSkill: (projectId: string, skillName: string, enabled: boolean): Promise<ProjectSkill> =>
    unwrap(() => window.electronAPI.setNarrativeSkillEnabled(projectId, skillName, enabled)),
  listBlocks: (projectId: string, chapterId: string): Promise<ChapterBlock[]> =>
    unwrap(() => window.electronAPI.getChapterBlocks(projectId, chapterId)),
  listRevisions: (projectId: string, chapterId: string): Promise<ChapterRevision[]> =>
    unwrap(() => window.electronAPI.listChapterRevisions(projectId, chapterId)),
  getRevision: (projectId: string, revisionId: string): Promise<ChapterRevision> =>
    unwrap(() => window.electronAPI.getChapterRevision(projectId, revisionId)),
  applyRevision: (projectId: string, revisionId: string) =>
    unwrap(() => window.electronAPI.applyChapterRevision(projectId, revisionId)),
  diffRevisions: (
    projectId: string,
    fromRevisionId: string,
    toRevisionId: string,
  ): Promise<{ from_revision_id: string | null; to_revision_id: string | null; diff: ChapterDiff }> =>
    unwrap(() => window.electronAPI.diffChapterRevisions(projectId, fromRevisionId, toRevisionId)),
}

export default narrativeService
