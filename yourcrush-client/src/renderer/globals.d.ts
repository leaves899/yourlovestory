import type { Fragment, FragmentInput } from '../shared/types';

interface ElectronAPI {
  switchCrush: (slug: string) => Promise<{ success: boolean }>;
  sendFragment: (fragment: FragmentInput) => Promise<Fragment>;
  getFragments: (date: string) => Promise<Fragment[]>;
  generateNarrative: (date: string) => Promise<{ success: boolean; error?: string }>;
  onNarrativeDelta: (callback: (delta: string) => void) => () => void;
  onStreamEnd: (callback: () => void) => () => void;
  onStreamError: (callback: (error: string) => void) => () => void;
  onBridgeDisconnect: (callback: (data: { code: number }) => void) => () => void;
  getConfig: () => Promise<Record<string, unknown>>;
  saveConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>;
  saveUserProfile: (profile: Record<string, unknown>) => Promise<{ success: boolean }>;
  createCrush: (data: Record<string, unknown>) => Promise<{ success: boolean; slug: string }>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};