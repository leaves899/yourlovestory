import { create } from 'zustand'
import crushService from '../services/crushService'

interface Crush {
  slug: string
  name: string
  nickname: string
  created_at: string
  updated_at: string
}

interface AppState {
  /** 当前选中的角色 slug */
  activeSlug: string | null
  /** 所有角色列表 */
  crushes: Crush[]
  /** 是否正在加载角色列表 */
  loading: boolean
  /** 是否已完成首次列表加载 */
  hasFetchedCrushes: boolean
  /** 错误信息 */
  error: string | null
  /** 设置当前角色 */
  setActiveSlug: (slug: string | null) => void
  /** 获取角色列表 */
  fetchCrushes: () => Promise<void>
  /** 获取真实角色列表 */
  getRealCrushes: () => Crush[]
  /** 检查是否首次使用（无任何角色） */
  isFirstTime: () => boolean
  /** 是否需要进入首次上手流程 */
  needsOnboarding: () => boolean
  /** 是否已经完成首次上手基础设置 */
  hasCompletedOnboarding: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSlug: null,
  crushes: [],
  loading: false,
  hasFetchedCrushes: false,
  error: null,

  setActiveSlug: (slug: string | null) => {
    set({ activeSlug: slug })
  },

  fetchCrushes: async () => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.list()
      if (response.success) {
        const crushes = response.data as Crush[]
        const realCrushes = crushes.filter((c) => c.slug !== 'TEMPLATE')
        const { activeSlug } = get()
        let nextActiveSlug: string | null = activeSlug

        if (realCrushes.length === 0) {
          nextActiveSlug = null
        } else if (!activeSlug || !realCrushes.some((c) => c.slug === activeSlug)) {
          const defaultCrush = realCrushes.find((c) => c.slug === 'default')
          nextActiveSlug = defaultCrush?.slug ?? realCrushes[0].slug
        }

        set({
          crushes,
          activeSlug: nextActiveSlug,
          loading: false,
          hasFetchedCrushes: true,
        })
      } else {
        set({
          error: response.errors?.[0] ?? '获取角色列表失败',
          loading: false,
          hasFetchedCrushes: true,
        })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false, hasFetchedCrushes: true })
    }
  },

  getRealCrushes: () => {
    const { crushes } = get()
    return crushes.filter((c) => c.slug !== 'TEMPLATE')
  },

  isFirstTime: () => {
    return get().getRealCrushes().length === 0
  },

  needsOnboarding: () => {
    const { loading, hasFetchedCrushes } = get()
    return hasFetchedCrushes && !loading && get().isFirstTime()
  },

  hasCompletedOnboarding: () => {
    const { loading, hasFetchedCrushes } = get()
    return hasFetchedCrushes && !loading && !get().isFirstTime()
  },
}))
