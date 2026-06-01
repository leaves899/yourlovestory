import { create } from 'zustand'
import crushService from '../services/crushService'

interface Crush {
  slug: string
  name: string
  nickname: string
  created_at: string
  updated_at: string
}

interface CrushStore {
  crushes: Crush[]
  loading: boolean
  error: string | null
  fetchCrushes: () => Promise<void>
  createCrush: (name: string, nickname: string, slug: string) => Promise<void>
  updateCrush: (slug: string, name: string, nickname: string) => Promise<void>
  deleteCrush: (slug: string) => Promise<void>
}

export const useCrushStore = create<CrushStore>((set) => ({
  crushes: [],
  loading: false,
  error: null,

  fetchCrushes: async () => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.list()
      if (response.success) {
        set({ crushes: response.data, loading: false })
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  createCrush: async (name: string, nickname: string, slug: string) => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.create(name, nickname, slug)
      if (response.success) {
        // 重新获取列表
        const listResponse = await crushService.list()
        if (listResponse.success) {
          set({ crushes: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  updateCrush: async (slug: string, name: string, nickname: string) => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.update(slug, name, nickname)
      if (response.success) {
        // 重新获取列表
        const listResponse = await crushService.list()
        if (listResponse.success) {
          set({ crushes: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  deleteCrush: async (slug: string) => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.delete(slug)
      if (response.success) {
        // 重新获取列表
        const listResponse = await crushService.list()
        if (listResponse.success) {
          set({ crushes: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
}))
