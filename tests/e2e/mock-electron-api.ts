/**
 * Playwright 辅助：在页面中注入 mock electronAPI
 *
 * 拦截所有 window.electronAPI 调用，记录到 window.__mockCalls，
 * 返回符合真实 API 格式的假数据。
 * 这样 E2E 测试可以在不启动 Electron 的情况下验证 UI 交互。
 */

interface MockCall {
  channel: string
  params: any
  timestamp: number
}

interface FragmentRecord {
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

// 在浏览器上下文中运行的注入脚本
function mockElectronAPIScript() {
  const mockCalls: MockCall[] = []
  const fragmentStore: FragmentRecord[] = []

  function track(channel: string, params: any) {
    mockCalls.push({ channel, params, timestamp: Date.now() })
  }

  function nextId(): string {
    return `frag_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(Date.now()).slice(-6)}_${Math.random().toString(16).slice(2, 6)}`
  }

  ;(window as any).electronAPI = {
    // 碎片日记
    recordFragment: async (params: any) => {
      track('fragment:record', params)
      const record: FragmentRecord = {
        id: nextId(),
        slug: params.slug,
        origin: params.origin || 'user',
        mood: params.mood || 'positive',
        content: params.content || '',
        env_tags: params.env_tags || [],
        behavior_tags: params.behavior_tags || [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      fragmentStore.push(record)
      return { success: true, data: record }
    },

    getFragments: async (params: any) => {
      track('fragment:list', params)
      let filtered = fragmentStore
      if (params?.slug) {
        filtered = filtered.filter((f: FragmentRecord) => f.slug === params.slug)
      }
      return { success: true, data: filtered }
    },

    getFragment: async (params: any) => {
      track('fragment:get', params)
      const found = fragmentStore.find((f: FragmentRecord) => f.id === params.fragment_id)
      if (found) {
        return { success: true, data: found }
      }
      return { success: false, errors: ['Fragment not found'] }
    },

    updateFragment: async (params: any) => {
      track('fragment:update', params)
      const idx = fragmentStore.findIndex((f: FragmentRecord) => f.id === params.fragment_id)
      if (idx >= 0) {
        if (params.content) fragmentStore[idx].content = params.content
        fragmentStore[idx].updated_at = new Date().toISOString()
        return { success: true, data: fragmentStore[idx] }
      }
      return { success: false, errors: ['Fragment not found'] }
    },

    deleteFragment: async (params: any) => {
      track('fragment:delete', params)
      const idx = fragmentStore.findIndex((f: FragmentRecord) => f.id === params.fragment_id)
      if (idx >= 0) {
        fragmentStore.splice(idx, 1)
        return { success: true }
      }
      return { success: false, errors: ['Fragment not found'] }
    },

    integrateFragments: async (params: any) => {
      track('fragment:integrate', params)
      return { success: true, data: { prompt: 'Mock integrated prompt' } }
    },

    // 角色管理
    createCrush: async (params: any) => {
      track('crush:create', params)
      return {
        success: true,
        data: {
          name: params.name,
          nickname: params.nickname,
          slug: params.slug,
          gender: params.gender || 'unknown',
          created_at: new Date().toISOString(),
        },
      }
    },

    getCrushes: async () => {
      track('crush:list', {})
      return { success: true, data: [] }
    },

    getCrush: async (params: any) => {
      track('crush:get', params)
      return {
        success: true,
        data: { slug: params.slug, name: 'Mock Crush', nickname: 'Mock' },
      }
    },

    updateCrush: async (params: any) => {
      track('crush:update', params)
      return { success: true, data: params }
    },

    deleteCrush: async (params: any) => {
      track('crush:delete', params)
      return { success: true }
    },

    // 日常写作
    generateDay: async (params: any) => {
      track('day:generate', params)
      return { success: true, data: { day_number: params.day_number, content: 'Mock day content' } }
    },

    getDays: async (params: any) => {
      track('day:list', params)
      return { success: true, data: [] }
    },

    getDay: async (params: any) => {
      track('day:get', params)
      return { success: true, data: null }
    },

    updateDay: async (params: any) => {
      track('day:update', params)
      return { success: true, data: params }
    },

    deleteDay: async (params: any) => {
      track('day:delete', params)
      return { success: true }
    },

    // 设置
    getSettings: async () => {
      track('settings:get', {})
      return { success: true, data: {} }
    },

    updateSettings: async (params: any) => {
      track('settings:update', params)
      return { success: true, data: params }
    },

    // 应用
    getAppInfo: async () => {
      return { name: 'yourcrush', version: '0.3.0', platform: 'test', arch: 'x64' }
    },

    checkUpdate: async () => {
      return { hasUpdate: false, version: '0.3.0' }
    },

    quitApp: async () => {
      // 不做任何事
    },
  }

  ;(window as any).__mockCalls = mockCalls
  ;(window as any).__mockStore = fragmentStore
}

/**
 * 在 Playwright page 中注入 mock electronAPI。
 * 必须在 page.goto() 之前调用。
 */
export async function injectMockElectronAPI(page: import('@playwright/test').Page) {
  await page.addInitScript(mockElectronAPIScript)
}