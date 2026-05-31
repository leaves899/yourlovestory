import { create } from 'zustand';
import type { Fragment } from '../../shared/types';

type Page = 'startup' | 'writing' | 'agent-config' | 'create-user' | 'create-crush';

interface AppState {
  currentPage: Page;
  crushSlug: string;
  fragments: Fragment[];
  narrativeText: string;
  isGenerating: boolean;
  error: string | null;

  setPage: (page: Page) => void;
  setCrush: (slug: string) => void;
  setFragments: (fragments: Fragment[]) => void;
  addFragment: (fragment: Fragment) => void;
  appendNarrative: (delta: string) => void;
  resetNarrative: () => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentPage: 'startup',
  crushSlug: 'example',
  fragments: [],
  narrativeText: '',
  isGenerating: false,
  error: null,

  setPage: (page) => set({ currentPage: page }),
  setCrush: (slug) => set({
    crushSlug: slug,
    fragments: [],
    narrativeText: '',
    isGenerating: false,
    error: null,
  }),
  setFragments: (fragments) => set({ fragments }),
  addFragment: (fragment) =>
    set((state) => ({ fragments: [...state.fragments, fragment] })),
  appendNarrative: (delta) =>
    set((state) => ({ narrativeText: state.narrativeText + delta })),
  resetNarrative: () => set({ narrativeText: '', isGenerating: false }),
  setError: (error) => set({ error }),
}));
