interface ElectronAPI {
  // 日常写作
  generateDay: (params: any) => Promise<any>
  getDays: (params: any) => Promise<any>
  getDay: (params: any) => Promise<any>
  updateDay: (params: any) => Promise<any>
  deleteDay: (params: any) => Promise<any>

  // 碎片日记
  recordFragment: (params: any) => Promise<any>
  getFragments: (params: any) => Promise<any>
  getFragment: (params: any) => Promise<any>
  updateFragment: (params: any) => Promise<any>
  deleteFragment: (params: any) => Promise<any>
  integrateFragments: (params: any) => Promise<any>

  // 角色管理
  createCrush: (params: any) => Promise<any>
  getCrushes: (params: any) => Promise<any>
  getCrush: (params: any) => Promise<any>
  updateCrush: (params: any) => Promise<any>
  deleteCrush: (params: any) => Promise<any>

  // 关系进度
  relationshipProgress: (slug: string) => Promise<any>
  relationshipDetectSignals: (slug: string, narrativeText: string) => Promise<any>
  relationshipAdvancePhase: (slug: string, reason?: string) => Promise<any>
  relationshipSetPhase: (slug: string, phase: number) => Promise<any>

  // 设置
  getSettings: () => Promise<any>
  updateSettings: (params: any) => Promise<any>

  // 应用
  getAppInfo: () => Promise<any>
  checkUpdate: () => Promise<any>
  quitApp: () => Promise<any>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
