import { create } from 'zustand'
import type {
  ChapterBlock,
  ChapterDiff,
  ChapterRevision,
  Foreshadow,
  ForeshadowEvent,
  NarrativeMemory,
  NarrativeMemoryProposal,
  ProjectSkillState,
} from '../../shared/narrativeWorkbench'
import narrativeService from '../services/narrativeService'

interface NarrativeStoreState {
  projectId: string | null
  memories: NarrativeMemory[]
  proposals: NarrativeMemoryProposal[]
  foreshadows: Foreshadow[]
  foreshadowEvents: ForeshadowEvent[]
  skills: ProjectSkillState[]
  blocks: ChapterBlock[]
  revisions: ChapterRevision[]
  diff: ChapterDiff | null
  loading: boolean
  saving: boolean
  error: string | null
  proposalFailures: Array<'memory' | 'foreshadow'>
  load: (projectId: string) => Promise<void>
  setProposalFailures: (failures: Array<'memory' | 'foreshadow'>) => void
  extractMemories: (chapterId: string, content?: string, sourceVersionId?: string | null) => Promise<void>
  approveProposal: (proposalId: string) => Promise<void>
  rejectProposal: (proposalId: string) => Promise<void>
  suggestForeshadows: (chapterId: string, endingHook?: string) => Promise<void>
  loadForeshadowEvents: (foreshadowId: string) => Promise<void>
  transitionForeshadow: (foreshadowId: string, status: Foreshadow['status'], note?: string) => Promise<void>
  toggleSkill: (skillName: string, enabled: boolean) => Promise<void>
  loadChapter: (projectId: string, chapterId: string) => Promise<void>
  compareRevisions: (fromRevisionId: string, toRevisionId: string) => Promise<void>
  applyRevision: (revisionId: string) => Promise<void>
}

function readError(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : '叙事工作台操作失败'
}

export const useNarrativeStore = create<NarrativeStoreState>((set, get) => ({
  projectId: null,
  memories: [],
  proposals: [],
  foreshadows: [],
  foreshadowEvents: [],
  skills: [],
  blocks: [],
  revisions: [],
  diff: null,
  loading: false,
  saving: false,
  error: null,
  proposalFailures: [],

  load: async (projectId) => {
    const projectChanged = get().projectId !== projectId
    set({
      projectId,
      loading: true,
      error: null,
      ...(projectChanged ? {
        memories: [],
        proposals: [],
        foreshadows: [],
        skills: [],
        proposalFailures: [],
      } : {}),
    })
    try {
      const [memories, proposals, foreshadows, skills] = await Promise.all([
        narrativeService.listMemories(projectId),
        narrativeService.listProposals(projectId),
        narrativeService.listForeshadows(projectId),
        narrativeService.listSkills(projectId),
      ])
      if (get().projectId !== projectId) return
      set({ memories, proposals, foreshadows, skills, loading: false })
    } catch (error) {
      if (get().projectId !== projectId) return
      set({ loading: false, error: readError(error) })
    }
  },

  setProposalFailures: (proposalFailures) => set({ proposalFailures }),

  extractMemories: async (chapterId, content, sourceVersionId) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      await narrativeService.extractMemories(projectId, chapterId, content, sourceVersionId)
      await get().load(projectId)
      set({ saving: false })
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  approveProposal: async (proposalId) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      await narrativeService.approveProposal(projectId, proposalId)
      set((state) => ({
        proposals: state.proposals.filter((proposal) => proposal.id !== proposalId),
        saving: false,
      }))
      await get().load(projectId)
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  rejectProposal: async (proposalId) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      await narrativeService.rejectProposal(projectId, proposalId)
      set((state) => ({
        proposals: state.proposals.filter((proposal) => proposal.id !== proposalId),
        saving: false,
      }))
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  suggestForeshadows: async (chapterId, endingHook) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      const result = await narrativeService.suggestForeshadows(projectId, chapterId, endingHook)
      set((state) => ({ foreshadows: [...result.suggestions, ...state.foreshadows], saving: false }))
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  loadForeshadowEvents: async (foreshadowId) => {
    const projectId = get().projectId
    if (!projectId) return
    try {
      const foreshadowEvents = await narrativeService.listForeshadowEvents(projectId, foreshadowId)
      set({ foreshadowEvents, error: null })
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  transitionForeshadow: async (foreshadowId, status, note) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      const updated = await narrativeService.transitionForeshadow(projectId, foreshadowId, status, note)
      set((state) => ({
        foreshadows: state.foreshadows.map((item) => item.id === updated.id ? updated : item),
        saving: false,
      }))
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  toggleSkill: async (skillName, enabled) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      await narrativeService.toggleSkill(projectId, skillName, enabled)
      set((state) => ({
        skills: state.skills.map((skill) => skill.name === skillName ? { ...skill, enabled } : skill),
        saving: false,
      }))
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },

  loadChapter: async (projectId, chapterId) => {
    set({ loading: true, error: null })
    try {
      const [blocks, revisions] = await Promise.all([
        narrativeService.listBlocks(projectId, chapterId),
        narrativeService.listRevisions(projectId, chapterId),
      ])
      set({ projectId, blocks, revisions, diff: null, loading: false })
    } catch (error) {
      set({ loading: false, error: readError(error) })
    }
  },

  compareRevisions: async (fromRevisionId, toRevisionId) => {
    const projectId = get().projectId
    if (!projectId) return
    try {
      const result = await narrativeService.diffRevisions(projectId, fromRevisionId, toRevisionId)
      set({ diff: result.diff, error: null })
    } catch (error) {
      set({ error: readError(error) })
    }
  },

  applyRevision: async (revisionId) => {
    const projectId = get().projectId
    if (!projectId) return
    set({ saving: true, error: null })
    try {
      await narrativeService.applyRevision(projectId, revisionId)
      set({ saving: false })
    } catch (error) {
      set({ saving: false, error: readError(error) })
    }
  },
}))

export type { NarrativeStoreState }
