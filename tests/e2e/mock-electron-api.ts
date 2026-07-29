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

interface MockElectronOptions {
  databaseState?:
    | 'ready'
    | 'credential-migration-required'
    | 'restoring'
    | 'recovery-required'
  backups?: Array<{
    id: string
    filename: string
    createdAt: string
    reason: 'scheduled' | 'manual' | 'pre-migration' | 'pre-restore'
    appVersion: string
    schemaVersion: number
    size: number
    sha256: string
  }>
  backupPolicy?: {
    maxBackups: number
    maxAgeDays: number
  }
  diagnosticsExport?:
    | { canceled: true }
    | { canceled: false; fileName: string; size: number; sha256: string }
    | { error: { code: string; message: string } }
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

interface CrushRecord {
  slug: string
  name: string
  nickname: string
  gender?: string
  description?: string
  created_at: string
  updated_at: string
}

interface ProgressRecord {
  crush_slug: string
  current_phase: number
  phase_name: string
  total_narratives: number
  interaction_narratives: number
  flirting_signals: number
  accumulated_score: number
  threshold: number
  signals: any[]
  phase_history: Array<{
    phase: number
    phase_name: string
    started_at: string
    ended_at?: string
    duration_days?: number
    narrative_count: number
    transition_reason?: string
  }>
  created_at: string
  updated_at: string
}

// 在浏览器上下文中运行的注入脚本
function mockElectronAPIScript(options: MockElectronOptions = {}) {
  const mockCalls: MockCall[] = []
  const fragmentStore: FragmentRecord[] = []
  const crushStore: CrushRecord[] = []
  const progressStore: Record<string, ProgressRecord> = {}
  const projectStore: Array<Record<string, unknown>> = []
  let databaseState = options.databaseState ?? 'ready'
  let backupPolicy = options.backupPolicy ?? { maxBackups: 10, maxAgeDays: 30 }
  const diagnosticsExport = options.diagnosticsExport ?? {
    canceled: false,
    fileName: 'diag.yourcrush-diagnostics.json',
    size: 256,
    sha256: 'd'.repeat(64),
  }
  const databaseStatusListeners = new Set<(status: {
    state: NonNullable<MockElectronOptions['databaseState']>
    integrity: 'ok' | 'unknown'
    schemaVersion: number | null
    message: string | null
    lastBackupAt: null
    backupAllowed: boolean
    backupEligibility: 'safe' | 'database-unavailable'
    backupBlockedReason: string | null
  }) => void>()
  const PHASE_NAMES = ['陌生人', '认识', '暧昧', '表白', '热恋']
  const PHASE_THRESHOLDS = [60, 70, -1, -1, -1]

  function track(channel: string, params: any) {
    mockCalls.push({ channel, params, timestamp: Date.now() })
  }

  function nextId(): string {
    return `frag_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${String(Date.now()).slice(-6)}_${Math.random().toString(16).slice(2, 6)}`
  }

  function sanitizeSlug(value: string) {
    return value
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/\.+$/g, '')
  }

  function buildSlug(params: any) {
    return sanitizeSlug(params.slug || params.nickname || params.name || '') || `crush-${Date.now().toString(36)}`
  }

  function createProgress(slug: string, initialPhase: number = 0): ProgressRecord {
    const now = new Date().toISOString()
    return {
      crush_slug: slug,
      current_phase: initialPhase,
      phase_name: PHASE_NAMES[initialPhase],
      total_narratives: 0,
      interaction_narratives: 0,
      flirting_signals: 0,
      accumulated_score: 0,
      threshold: PHASE_THRESHOLDS[initialPhase],
      signals: [],
      phase_history: [
        {
          phase: initialPhase,
          phase_name: PHASE_NAMES[initialPhase],
          started_at: now,
          narrative_count: 0,
        },
      ],
      created_at: now,
      updated_at: now,
    }
  }

  function currentDatabaseStatus() {
    const ready = databaseState === 'ready'
    return {
      state: databaseState,
      integrity: ready ? 'ok' as const : 'unknown' as const,
      schemaVersion: ready ? 8 : null,
      message: ready
        ? null
        : databaseState === 'restoring'
          ? '数据库正在恢复，业务功能已暂停。'
          : '数据库需要恢复后才能继续使用。',
      lastBackupAt: null,
      backupAllowed: ready,
      backupEligibility: ready ? 'safe' as const : 'database-unavailable' as const,
      backupBlockedReason: ready ? null : '数据库当前不可用。',
    }
  }

  ;(window as any).electronAPI = {
    getDatabaseStatus: async () => {
      track('backup:get-status', undefined)
      return {
        success: true,
        data: currentDatabaseStatus(),
      }
    },
    onDatabaseStatusChanged: (listener: (status: ReturnType<typeof currentDatabaseStatus>) => void) => {
      databaseStatusListeners.add(listener)
      return () => databaseStatusListeners.delete(listener)
    },
    listBackups: async () => {
      track('backup:list', undefined)
      return { success: true, data: options.backups ?? [] }
    },
    createBackup: async () => ({ success: true }),
    verifyBackup: async (id: string) => {
      track('backup:verify', { id })
      return {
        success: true,
        data: { id, valid: true, checkedAt: new Date().toISOString() },
      }
    },
    restoreBackup: async (id: string, confirm: true) => {
      track('backup:restore', { id, confirm })
      return {
        success: true,
        data: {
          outcome: 'restored',
          backupId: id,
          preRestoreBackupId: null,
          relaunching: true,
        },
      }
    },
    getBackupPolicy: async () => {
      track('backup:get-policy', undefined)
      return {
        success: true,
        data: {
          policy: backupPolicy,
          source: 'file' as const,
          fallbackReason: null,
        },
      }
    },
    updateBackupPolicy: async (policy: { maxBackups: number; maxAgeDays: number }) => {
      track('backup:update-policy', policy)
      backupPolicy = {
        maxBackups: policy.maxBackups,
        maxAgeDays: policy.maxAgeDays,
      }
      return {
        success: true,
        data: {
          policy: backupPolicy,
          prune: {
            deleted: [],
            failed: [],
            retained: [],
            policyExceeded: false,
          },
          prunePartialFailure: false,
        },
      }
    },
    exportDiagnostics: async () => {
      track('diagnostics:export', undefined)
      if ('error' in diagnosticsExport) {
        return { success: false, error: diagnosticsExport.error }
      }
      return { success: true, data: diagnosticsExport }
    },
    listNovelProjects: async () => {
      track('workbench:projects:list', undefined)
      return { success: true, data: [...projectStore] }
    },
    getCurrentNovelProject: async () => ({ success: true, data: null }),
    onTaskStart: () => () => undefined,
    onTaskStage: () => () => undefined,
    onTaskChunk: () => () => undefined,
    onTaskCheckpoint: () => () => undefined,
    onTaskReview: () => () => undefined,
    onTaskEnd: () => () => undefined,
    onTaskError: () => () => undefined,
    onAssistantEvent: () => () => undefined,
    listTasks: async () => {
      track('task:list', undefined)
      return { success: true, data: [] }
    },
    listRecoverableTasks: async () => {
      track('task:recoverable', undefined)
      return { success: true, data: [] }
    },
    listAssistantSessions: async () => {
      track('assistant:session:list', undefined)
      return { success: true, data: [] }
    },
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
      const now = new Date().toISOString()
      const slug = buildSlug(params)
      const record: CrushRecord = {
        name: params.name,
        nickname: params.nickname,
        slug,
        gender: params.gender || 'unknown',
        description: params.description || '',
        created_at: now,
        updated_at: now,
      }
      const existingIndex = crushStore.findIndex((item) => item.slug === slug)
      if (existingIndex >= 0) {
        crushStore[existingIndex] = { ...crushStore[existingIndex], ...record }
      } else {
        crushStore.push(record)
      }

      if (!progressStore[slug]) {
        progressStore[slug] = createProgress(slug, params.initialPhase || 0)
      }

      return { success: true, data: record }
    },

    getCrushes: async () => {
      track('crush:list', {})
      return { success: true, data: [...crushStore] }
    },

    getCrush: async (params: any) => {
      track('crush:get', params)
      const found = crushStore.find((item) => item.slug === params.slug)
      if (found) {
        return { success: true, data: found }
      }
      return { success: false, errors: ['Crush not found'] }
    },

    updateCrush: async (params: any) => {
      track('crush:update', params)
      const idx = crushStore.findIndex((item) => item.slug === params.slug)
      if (idx >= 0) {
        crushStore[idx] = {
          ...crushStore[idx],
          ...params,
          updated_at: new Date().toISOString(),
        }
        return { success: true, data: crushStore[idx] }
      }
      return { success: false, errors: ['Crush not found'] }
    },

    deleteCrush: async (params: any) => {
      track('crush:delete', params)
      const idx = crushStore.findIndex((item) => item.slug === params.slug)
      if (idx >= 0) {
        crushStore.splice(idx, 1)
      }
      delete progressStore[params.slug]
      return { success: true }
    },

    // 日常写作
    generateDay: async (params: any) => {
      track('day:generate', params)
      const override = (window as any).__mockGenerateDayResponse
      if (typeof override === 'function') {
        return override(params)
      }
      if (override) {
        return override
      }
      return {
        success: true,
        data: {
          slug: params.slug,
          day_number: params.day_number,
          content: 'Mock day content',
          summary: params.summary || '',
        },
      }
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

    getLlmCredentialStatus: async (target: unknown) => {
      track('llmCredential:status', target)
      return {
        success: true,
        data: {
          configured: false,
          storageAvailable: true,
          backend: 'mock',
          error: null,
        },
      }
    },
    saveLlmCredential: async () => ({ success: true, data: { configured: true } }),
    deleteLlmCredential: async () => ({
      success: true,
      data: { deleted: true, referencesCleared: true, remaining: 0 },
    }),
    testLlmCredential: async () => ({ success: true, data: { message: 'ok' } }),
    deleteAllLlmCredentials: async () => ({
      success: true,
      data: { deleted: 0, failed: 0, referencesCleared: true, remaining: 0 },
    }),

    // 关系进度
    relationshipProgress: async (slug: string) => {
      track('relationship:progress', { slug })
      if (!progressStore[slug]) {
        progressStore[slug] = createProgress(slug, 0)
      }
      return { success: true, data: progressStore[slug] }
    },

    relationshipDetectSignals: async (slug: string, narrativeText: string) => {
      track('relationship:detectSignals', { slug, narrativeText })
      const progress = progressStore[slug] || createProgress(slug, 0)
      progressStore[slug] = progress
      return {
        success: true,
        data: {
          signals: [],
          transitionResult: {
            shouldTransition: false,
            currentPhase: progress.current_phase,
            nextPhase: progress.current_phase < 4 ? progress.current_phase + 1 : null,
            currentScore: progress.accumulated_score,
            threshold: progress.threshold,
            signals: [],
          },
          progress,
        },
      }
    },

    relationshipAdvancePhase: async (slug: string, reason?: string) => {
      track('relationship:advancePhase', { slug, reason })
      const progress = progressStore[slug] || createProgress(slug, 0)
      if (progress.current_phase < 4) {
        const now = new Date().toISOString()
        const currentHistory = progress.phase_history[progress.phase_history.length - 1]
        if (currentHistory && !currentHistory.ended_at) {
          currentHistory.ended_at = now
          currentHistory.transition_reason = reason || '用户手动推进'
        }
        progress.current_phase += 1
        progress.phase_name = PHASE_NAMES[progress.current_phase]
        progress.accumulated_score = 0
        progress.threshold = PHASE_THRESHOLDS[progress.current_phase]
        progress.phase_history.push({
          phase: progress.current_phase,
          phase_name: progress.phase_name,
          started_at: now,
          narrative_count: 0,
        })
        progress.updated_at = now
      }
      progressStore[slug] = progress
      return { success: true, data: progress }
    },

    relationshipSetPhase: async (slug: string, phase: number) => {
      track('relationship:setPhase', { slug, phase })
      const progress = createProgress(slug, phase)
      progressStore[slug] = progress
      return { success: true, data: progress }
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
  ;(window as any).__mockCrushStore = crushStore
  ;(window as any).__mockProgressStore = progressStore
  ;(window as any).__mockGenerateDayResponse = null
  const databaseStatusControls = window as typeof window & {
    __emitDatabaseStatus: (
      state: NonNullable<MockElectronOptions['databaseState']>,
    ) => void
    __databaseStatusSubscriberCount: () => number
  }
  databaseStatusControls.__emitDatabaseStatus = (
    state: NonNullable<MockElectronOptions['databaseState']>,
  ) => {
    databaseState = state
    const status = currentDatabaseStatus()
    databaseStatusListeners.forEach((listener) => listener(status))
  }
  databaseStatusControls.__databaseStatusSubscriberCount = () => databaseStatusListeners.size
}

/**
 * 在 Playwright page 中注入 mock electronAPI。
 * 必须在 page.goto() 之前调用。
 */
export async function injectMockElectronAPI(
  page: import('@playwright/test').Page,
  options: MockElectronOptions = {},
) {
  await page.addInitScript(mockElectronAPIScript, options)
}
