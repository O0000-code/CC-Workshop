import { create } from 'zustand';
import { Scene, Skill, McpServer, ClaudeMdFile, AppData } from '@/types';
import { useSkillsStore } from './skillsStore';
import { useMcpsStore } from './mcpsStore';
import { useClaudeMdStore } from './claudeMdStore';
import { isTauri, safeInvoke } from '@/utils/tauri';

// ============================================================================
// Types
// ============================================================================

export interface CreateModalState {
  isOpen: boolean;
  name: string;
  description: string;
  selectedSkillIds: string[];
  selectedMcpIds: string[];
  selectedClaudeMdId: string | null;
  activeTab: 'skills' | 'mcps' | 'claudeMd';
  search: string;
  categoryFilter: string;
  tagFilter: string[];
}

interface ScenesState {
  scenes: Scene[];
  selectedSceneId: string | null;
  /**
   * Most recently created or edited Scene id. Drives the Marketplace
   * "Add to active Scene" short-cut (D-Imp-6 / spec §13). Mirrors
   * `AppData.lastEditedSceneId` on the backend; both sides stay in sync via
   * `loadScenes` (read-back) and `createScene` / `updateScene` /
   * `deleteScene` (write-through). `null` until the user creates or
   * updates a Scene at least once.
   */
  lastEditedSceneId: string | null;
  filter: {
    search: string;
  };
  isLoading: boolean;
  error: string | null;

  // Modal state
  createModal: CreateModalState;

  // Actions
  setScenes: (scenes: Scene[]) => void;
  selectScene: (id: string | null) => void;
  setFilter: (filter: Partial<ScenesState['filter']>) => void;

  // Tauri Actions
  loadScenes: () => Promise<void>;
  createScene: () => Promise<Scene | null>;
  deleteScene: (id: string) => Promise<void>;
  updateScene: (id: string, updates: Partial<Scene>) => Promise<void>;

  // Create Modal Actions
  openCreateModal: () => void;
  closeCreateModal: () => void;
  updateCreateModal: (data: Partial<CreateModalState>) => void;
  toggleSkillSelection: (skillId: string) => void;
  toggleMcpSelection: (mcpId: string) => void;
  selectAllSkills: (skillIds: string[]) => void;
  selectAllMcps: (mcpIds: string[]) => void;
  clearAllSelections: () => void;

  // CLAUDE.md selection (single select only)
  toggleClaudeMdSelection: (id: string) => void;
  setClaudeMdSelection: (id: string | null) => void;

  // Getters for available skills/mcps/claudeMd
  getAvailableSkills: () => Skill[];
  getAvailableMcps: () => McpServer[];
  getDistributableClaudeMd: () => ClaudeMdFile[];

  /**
   * Resolve the current "active" Scene from `lastEditedSceneId`. Returns
   * `undefined` when no Scene has ever been created/edited or when the
   * tracked id has been removed (e.g. user deleted the last Scene). Used
   * by the Marketplace ShortcutBanner to render the "Add to active
   * Scene: <name>" short-cut when present.
   */
  getActiveScene: () => Scene | undefined;
}

// ============================================================================
// Initial State
// ============================================================================

const initialCreateModalState: CreateModalState = {
  isOpen: false,
  name: '',
  description: '',
  selectedSkillIds: [],
  selectedMcpIds: [],
  selectedClaudeMdId: null,
  activeTab: 'skills',
  search: '',
  categoryFilter: '',
  tagFilter: [],
};

// ============================================================================
// Store
// ============================================================================

export const useScenesStore = create<ScenesState>((set, get) => ({
  scenes: [],
  selectedSceneId: null,
  lastEditedSceneId: null,
  filter: {
    search: '',
  },
  isLoading: false,
  error: null,
  createModal: initialCreateModalState,

  // Basic Actions
  setScenes: (scenes) => set({ scenes }),

  selectScene: (id) => set({ selectedSceneId: id }),

  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  // Tauri Actions
  loadScenes: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ScenesStore: Cannot load scenes in browser mode');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const scenes = await safeInvoke<Scene[]>('get_scenes');
      // Read-back lastEditedSceneId from AppData. Backend is the source of
      // truth (maintained by add_scene / update_scene / delete_scene); the
      // frontend mirrors it so a fresh app session picks up the persisted
      // value without waiting for the next mutation. (D-Imp-6 / spec §13)
      const appData = await safeInvoke<AppData>('read_app_data');
      const persistedActiveId = appData?.lastEditedSceneId ?? null;
      // Defensive: if the persisted id no longer points at a real Scene
      // (e.g. data migration edge case), drop it rather than carry a
      // stale pointer.
      const validatedActiveId =
        persistedActiveId && (scenes ?? []).some((s) => s.id === persistedActiveId)
          ? persistedActiveId
          : null;
      set({
        scenes: scenes || [],
        lastEditedSceneId: validatedActiveId,
        isLoading: false,
      });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  createScene: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ScenesStore: Cannot create scene in browser mode');
      return null;
    }

    const { createModal } = get();

    if (!createModal.name.trim()) {
      return null;
    }

    try {
      // Tauri command parameters use camelCase
      const scene = await safeInvoke<Scene>('add_scene', {
        name: createModal.name.trim(),
        description: createModal.description.trim(),
        icon: 'layers',
        skillIds: createModal.selectedSkillIds,
        mcpIds: createModal.selectedMcpIds,
        claudeMdIds: createModal.selectedClaudeMdId ? [createModal.selectedClaudeMdId] : [],
      });

      if (!scene) {
        set({ error: 'Failed to create scene' });
        return null;
      }

      // Backend `add_scene` already persists `last_edited_scene_id =
      // Some(scene.id)` (data.rs:877). Mirror that here so the
      // Marketplace short-cut sees the fresh active Scene without
      // waiting for the next `loadScenes` call. (spec §13 / D-Imp-6)
      set((state) => ({
        scenes: [...state.scenes, scene],
        createModal: {
          ...initialCreateModalState,
          isOpen: false,
        },
        selectedSceneId: scene.id,
        lastEditedSceneId: scene.id,
        error: null,
      }));

      return scene;
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  deleteScene: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ScenesStore: Cannot delete scene in browser mode');
      return;
    }

    try {
      await safeInvoke('delete_scene', { id });
      // Mirror backend `delete_scene` (data.rs:957-963): when the deleted
      // scene was active, fall back to the most recently used remaining
      // Scene (or null if none remain). The backend computes the same
      // fallback against `last_used`; we replicate it client-side so the
      // active-scene short-cut updates without waiting for the next
      // `loadScenes`. (spec §13 / D-Imp-6)
      set((state) => {
        const remaining = state.scenes.filter((scene) => scene.id !== id);
        let nextActiveId: string | null = state.lastEditedSceneId;
        if (state.lastEditedSceneId === id) {
          if (remaining.length === 0) {
            nextActiveId = null;
          } else {
            // Pick the most recently used (or fall back to the most recently
            // created) remaining Scene as the new active anchor.
            const sorted = [...remaining].sort((a, b) => {
              const aKey = a.lastUsed ?? a.createdAt;
              const bKey = b.lastUsed ?? b.createdAt;
              return bKey.localeCompare(aKey);
            });
            nextActiveId = sorted[0]?.id ?? null;
          }
        }
        return {
          scenes: remaining,
          selectedSceneId: state.selectedSceneId === id ? null : state.selectedSceneId,
          lastEditedSceneId: nextActiveId,
          error: null,
        };
      });
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  updateScene: async (id, updates) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('ScenesStore: Cannot update scene in browser mode');
      return;
    }

    try {
      await safeInvoke('update_scene', { id, ...updates });
      // Backend `update_scene` (data.rs:918) bumps
      // `last_edited_scene_id = Some(id)`. Mirror it so subsequent reads
      // reflect the change without a `loadScenes` round-trip.
      set((state) => ({
        scenes: state.scenes.map((scene) => (scene.id === id ? { ...scene, ...updates } : scene)),
        lastEditedSceneId: id,
        error: null,
      }));
    } catch (error) {
      set({ error: String(error) });
      throw error;
    }
  },

  // Create Modal Actions
  openCreateModal: () =>
    set(() => ({
      createModal: {
        ...initialCreateModalState,
        isOpen: true,
      },
    })),

  closeCreateModal: () =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        isOpen: false,
      },
    })),

  updateCreateModal: (data) =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        ...data,
      },
    })),

  toggleSkillSelection: (skillId) =>
    set((state) => {
      const { selectedSkillIds } = state.createModal;
      const newIds = selectedSkillIds.includes(skillId)
        ? selectedSkillIds.filter((id) => id !== skillId)
        : [...selectedSkillIds, skillId];
      return {
        createModal: {
          ...state.createModal,
          selectedSkillIds: newIds,
        },
      };
    }),

  toggleMcpSelection: (mcpId) =>
    set((state) => {
      const { selectedMcpIds } = state.createModal;
      const newIds = selectedMcpIds.includes(mcpId)
        ? selectedMcpIds.filter((id) => id !== mcpId)
        : [...selectedMcpIds, mcpId];
      return {
        createModal: {
          ...state.createModal,
          selectedMcpIds: newIds,
        },
      };
    }),

  selectAllSkills: (skillIds) =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        selectedSkillIds: skillIds,
      },
    })),

  selectAllMcps: (mcpIds) =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        selectedMcpIds: mcpIds,
      },
    })),

  clearAllSelections: () =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        selectedSkillIds: [],
        selectedMcpIds: [],
        selectedClaudeMdId: null,
      },
    })),

  // CLAUDE.md selection (single select only - a Scene can have at most one CLAUDE.md)
  toggleClaudeMdSelection: (id) =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        // Toggle: if already selected, deselect; otherwise select the new one
        selectedClaudeMdId: state.createModal.selectedClaudeMdId === id ? null : id,
      },
    })),

  setClaudeMdSelection: (id) =>
    set((state) => ({
      createModal: {
        ...state.createModal,
        selectedClaudeMdId: id,
      },
    })),

  // Getters for available skills/mcps/claudeMd from other stores
  getAvailableSkills: () => {
    return useSkillsStore.getState().skills;
  },

  getAvailableMcps: () => {
    return useMcpsStore.getState().mcpServers;
  },

  // Get distributable CLAUDE.md files (exclude global files)
  getDistributableClaudeMd: () => {
    const files = useClaudeMdStore.getState().files;
    // Exclude isGlobal=true files - they don't need to be added to Scene
    return files.filter((file) => !file.isGlobal);
  },

  // Resolve the active Scene from `lastEditedSceneId` against the current
  // `scenes` list. Returns `undefined` when no Scene is tracked or the
  // tracked id no longer points at a real Scene. (spec §13 / D-Imp-6)
  getActiveScene: () => {
    const { scenes, lastEditedSceneId } = get();
    if (!lastEditedSceneId) return undefined;
    return scenes.find((scene) => scene.id === lastEditedSceneId);
  },
}));

export default useScenesStore;
