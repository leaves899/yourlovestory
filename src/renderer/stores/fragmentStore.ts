import { create } from 'zustand'
import fragmentService from '../services/fragmentService'

interface Fragment {
  id: string
  slug: string
  origin: string
  mood: string
  content: string
  env_tags: string[]
  behavior_tags: string[]
  created_at: string
  updated_at: string
}

interface FragmentStore {
  fragments: Fragment[]
  loading: boolean
  error: string | null
  fetchFragments: (slug: string) => Promise<void>
  recordFragment: (slug: string, origin: string, mood: string, content: string, envTags?: string[], behaviorTags?: string[]) => Promise<void>
  updateFragment: (slug: string, fragmentId: string, content: string, envTags?: string[], behaviorTags?: string[]) => Promise<void>
  deleteFragment: (slug: string, fragmentId: string) => Promise<void>
}

export const useFragmentStore = create<FragmentStore>((set) => ({
  fragments: [],
  loading: false,
  error: null,

  fetchFragments: async (slug: string) => {
    set({ loading: true, error: null })
    try {
      const response = await fragmentService.list(slug)
      if (response.success) {
        set({ fragments: response.data, loading: false })
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  recordFragment: async (slug: string, origin: string, mood: string, content: string, envTags?: string[], behaviorTags?: string[]) => {
    set({ loading: true, error: null })
    try {
      const response = await fragmentService.record(slug, origin, mood, content, envTags, behaviorTags)
      if (response.success) {
        // 重新获取列表
        const listResponse = await fragmentService.list(slug)
        if (listResponse.success) {
          set({ fragments: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  updateFragment: async (slug: string, fragmentId: string, content: string, envTags?: string[], behaviorTags?: string[]) => {
    set({ loading: true, error: null })
    try {
      const response = await fragmentService.update(slug, fragmentId, content, envTags, behaviorTags)
      if (response.success) {
        // 重新获取列表
        const listResponse = await fragmentService.list(slug)
        if (listResponse.success) {
          set({ fragments: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  deleteFragment: async (slug: string, fragmentId: string) => {
    set({ loading: true, error: null })
    try {
      const response = await fragmentService.delete(slug, fragmentId)
      if (response.success) {
        // 重新获取列表
        const listResponse = await fragmentService.list(slug)
        if (listResponse.success) {
          set({ fragments: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
}))
