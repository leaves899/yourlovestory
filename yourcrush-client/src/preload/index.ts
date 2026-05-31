import { contextBridge, ipcRenderer } from 'electron';
import type { Fragment, FragmentInput, AgentConfig } from '../shared/types';

// 明确定义 API 白名单边界
interface ElectronAPI {
  // 角色管理（只读操作）
  switchCrush: (slug: string) => Promise<{ success: boolean }>;

  // 碎片管理（CRUD 操作）
  sendFragment: (fragment: FragmentInput) => Promise<Fragment>;
  getFragments: (date: string) => Promise<Fragment[]>;

  // 叙事生成（流式操作）
  generateNarrative: (date: string) => Promise<{ success: boolean; error?: string }>;
  onNarrativeDelta: (callback: (delta: string) => void) => () => void;
  onStreamEnd: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => () => void;

  // 桥接状态（监控操作）
  onBridgeDisconnect: (callback: (data: { code: number }) => void) => () => void;

  // Agent 配置
  getConfig: () => Promise<AgentConfig>;
  saveConfig: (config: AgentConfig) => Promise<{ success: boolean }>;

  // 用户档案
  saveUserProfile: (profile: Record<string, unknown>) => Promise<{ success: boolean }>;

  // 角色创建
  createCrush: (data: Record<string, unknown>) => Promise<{ success: boolean; slug: string }>;

  // 角色列表
  listCrushes: () => Promise<Array<{ slug: string; name: string }>>;
}

const api: ElectronAPI = {
  switchCrush: (slug) => ipcRenderer.invoke('crush:switch', slug),
  sendFragment: (fragment) => ipcRenderer.invoke('fragment:create', fragment),
  getFragments: (date) => ipcRenderer.invoke('fragment:list', date),
  generateNarrative: (date) => ipcRenderer.invoke('narrative:generate', date),
  onNarrativeDelta: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, delta: string) => cb(delta);
    ipcRenderer.on('stream:delta', listener);
    return () => { ipcRenderer.removeListener('stream:delta', listener); };
  },
  onStreamEnd: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('stream:end', listener);
    return () => { ipcRenderer.removeListener('stream:end', listener); };
  },
  onStreamError: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, error: string) => cb(error);
    ipcRenderer.on('stream:error', listener);
    return () => { ipcRenderer.removeListener('stream:error', listener); };
  },
  onBridgeDisconnect: (cb) => {
    const listener = (_: Electron.IpcRendererEvent, data: { code: number }) => cb(data);
    ipcRenderer.on('bridge:disconnected', listener);
    return () => { ipcRenderer.removeListener('bridge:disconnected', listener); };
  },
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  saveUserProfile: (profile) => ipcRenderer.invoke('user:save', profile),
  createCrush: (data) => ipcRenderer.invoke('crush:create', data),
  listCrushes: () => ipcRenderer.invoke('crush:list'),
};

contextBridge.exposeInMainWorld('electron', api);