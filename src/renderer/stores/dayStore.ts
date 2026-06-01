import { create } from 'zustand'
import dayService from '../services/dayService'

interface Day {
  slug: string
  day_number: number
  content: string
  file_path?: string
}

interface DayStore {
  days: Day[]
  loading: boolean
  error: string | null
  fetchDays: (slug: string) => Promise<void>
  generateDay: (slug: string, dayNumber: number, summary?: string) => Promise<void>
  updateDay: (slug: string, dayNumber: number, content: string) => Promise<void>
  deleteDay: (slug: string, dayNumber: number) => Promise<void>
}

export const useDayStore = create<DayStore>((set) => ({
  days: [],
  loading: false,
  error: null,

  fetchDays: async (slug: string) => {
    set({ loading: true, error: null })
    try {
      const response = await dayService.list(slug)
      if (response.success) {
        set({ days: response.data, loading: false })
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  generateDay: async (slug: string, dayNumber: number, summary?: string) => {
    set({ loading: true, error: null })
    try {
      const response = await dayService.generate(slug, dayNumber, summary)
      if (response.success) {
        // 重新获取列表
        const listResponse = await dayService.list(slug)
        if (listResponse.success) {
          set({ days: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  updateDay: async (slug: string, dayNumber: number, content: string) => {
    set({ loading: true, error: null })
    try {
      const response = await dayService.update(slug, dayNumber, content)
      if (response.success) {
        // 重新获取列表
        const listResponse = await dayService.list(slug)
        if (listResponse.success) {
          set({ days: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  deleteDay: async (slug: string, dayNumber: number) => {
    set({ loading: true, error: null })
    try {
      const response = await dayService.delete(slug, dayNumber)
      if (response.success) {
        // 重新获取列表
        const listResponse = await dayService.list(slug)
        if (listResponse.success) {
          set({ days: listResponse.data, loading: false })
        }
      } else {
        set({ error: response.errors?.[0], loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },
}))
