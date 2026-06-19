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
  /** 错误信息 */
  error: string | null
  /** 设置当前角色 */
  setActiveSlug: (slug: string) => void
  /** 获取角色列表 */
  fetchCrushes: () => Promise<void>
  /** 检查是否首次使用（无任何角色） */
  isFirstTime: () => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  activeSlug: null,
  crushes: [],
  loading: false,
  error: null,

  setActiveSlug: (slug: string) => {
    set({ activeSlug: slug })
  },

  fetchCrushes: async () => {
    set({ loading: true, error: null })
    try {
      const response = await crushService.list()
      if (response.success) {
        const crushes = response.data as Crush[]
        set({ crushes, loading: false })

        // 自动选中默认角色
        const { activeSlug } = get()
        if (!activeSlug && crushes.length > 0) {
          // 优先选 default，否则选第一个
          const defaultCrush = crushes.find((c) => c.slug === 'default')
          set({ activeSlug: defaultCrush?.slug ?? crushes[0].slug })
        }
      } else {
        set({ error: response.errors?.[0] ?? '获取角色列表失败', loading: false })
      }
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  isFirstTime: () => {
    const { crushes } = get()
    // 没有任何角色 或 只有 TEMPLATE（不算真正的角色）
    const realCrushes = crushes.filter((c) => c.slug !== 'TEMPLATE')
    return realCrushes.length === 0
  },
}))
