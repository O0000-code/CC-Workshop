import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// ============================================================================
// SortPreferencesStore (a.k.a. view preferences)
// ============================================================================
// Persists per-page view configuration — currently `sort` and `group` —
// across sessions via localStorage, mirroring the persist+createJSONStorage
// pattern already established in `marketplaceStore.ts`. Backend
// `AppSettings` (Rust) is intentionally untouched: this is a pure UI
// preference and going through the Tauri settings round-trip would couple a
// frontend visual choice to a backend schema migration.
//
// Schema versions:
//   v1 → v2 (2026-05-11): the per-page "Default" sort option was removed
//     (UX cleanup); persisted `'default'` is rewritten to `'name'`.
//   v2 → v3 (2026-05-11): added `group` slot per page (defaults to `'none'`).
//     Old shape `{ preferences: Record<page, sortValue> }` is unfolded into
//     `{ sort: Record<page, sortValue>, group: Record<page, 'none'> }`.
// ============================================================================

export type SortPage = 'skills' | 'mcps' | 'claudeMd' | 'rules' | 'scenes' | 'projects';

interface SortPreferencesState {
  sort: Record<SortPage, string>;
  group: Record<SortPage, string>;
  setSortFor: (page: SortPage, value: string) => void;
  setGroupFor: (page: SortPage, value: string) => void;
}

const SORT_DEFAULTS: Record<SortPage, string> = {
  skills: 'name',
  mcps: 'name',
  claudeMd: 'name',
  rules: 'name',
  scenes: 'name',
  projects: 'name',
};

const GROUP_DEFAULTS: Record<SortPage, string> = {
  skills: 'none',
  mcps: 'none',
  claudeMd: 'none',
  rules: 'none',
  scenes: 'none',
  projects: 'none',
};

export const useSortPreferencesStore = create<SortPreferencesState>()(
  persist(
    (set) => ({
      sort: { ...SORT_DEFAULTS },
      group: { ...GROUP_DEFAULTS },
      setSortFor: (page, value) =>
        set((state) => ({
          sort: { ...state.sort, [page]: value },
        })),
      setGroupFor: (page, value) =>
        set((state) => ({
          group: { ...state.group, [page]: value },
        })),
    }),
    {
      name: 'ensemble-sort-preferences',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, fromVersion) => {
        if (!persistedState || typeof persistedState !== 'object') {
          return { sort: { ...SORT_DEFAULTS }, group: { ...GROUP_DEFAULTS } };
        }
        // v1 (had `preferences: Record<page, value>` with possible `'default'`)
        // → v2 normalised `'default'` to `'name'`. Both pre-v3 shapes get
        // handled here by reading `preferences` if present.
        if (fromVersion < 3) {
          const legacy = persistedState as { preferences?: Record<string, string> };
          const sort: Record<string, string> = { ...SORT_DEFAULTS };
          if (legacy.preferences) {
            for (const [page, value] of Object.entries(legacy.preferences)) {
              sort[page] = value === 'default' ? 'name' : value;
            }
          }
          return {
            sort,
            group: { ...GROUP_DEFAULTS },
          } as SortPreferencesState;
        }
        return persistedState as SortPreferencesState;
      },
    },
  ),
);
