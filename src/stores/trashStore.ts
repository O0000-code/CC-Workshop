import { create } from 'zustand';
import type { TrashedItems } from '@/types';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { useSettingsStore } from './settingsStore';

// ============================================================================
// Trash Store
// ============================================================================
// Manages trash/recycle bin state for deleted Skills, MCPs, CLAUDE.md files,
// Rules, Scenes, and Projects. Provides restore functionality for recovering
// each entity type.
//
// Restore keying: Skills / MCPs / CLAUDE.md / Rules are identified by their
// trash path (live on disk inside `~/.cc-workshop/trash/<kind>/`). Scenes and
// Projects are identified by `id` because their trash records live in
// `data.json::trashed_scenes` / `trashed_projects` and have no on-disk path.

/**
 * Trash kind for `deleteTrashedItemPermanently` (R2-9). String discriminator
 * is intentionally spelt to match the Rust `parse_trash_kind` accepts.
 */
export type TrashKind = 'skill' | 'mcp' | 'claudeMd' | 'rule' | 'scene' | 'project';

interface TrashState {
  trashedItems: TrashedItems | null;
  isLoading: boolean;
  isRestoring: boolean;
  /** R2-9 — separate from `isRestoring` so the UI can show distinct affordances. */
  isPermanentlyDeleting: boolean;
  error: string | null;

  // Actions
  loadTrashedItems: () => Promise<void>;
  restoreSkill: (path: string) => Promise<boolean>;
  restoreMcp: (path: string) => Promise<boolean>;
  restoreClaudeMd: (path: string) => Promise<boolean>;
  /** Restore a deleted Rule (A4). Backend handles `is_global=false` reset. */
  restoreRule: (path: string) => Promise<boolean>;
  /** Restore a deleted Scene (A5). Filters dangling refs on the backend. */
  restoreScene: (id: string) => Promise<boolean>;
  /**
   * Restore a deleted Project (A5). When the referenced Scene is also gone,
   * the backend resets `scene_id` to empty so the user can rebind.
   */
  restoreProject: (id: string) => Promise<boolean>;
  /**
   * Permanently remove a single trashed entry (R2-9). Idempotent: removing
   * an entry that no longer exists returns true. Callers MUST present a
   * confirm modal before invoking — the backend commits immediately.
   *
   * `pathOrId` is the trash path for skill/mcp/claudeMd/rule kinds, and the
   * record id for scene/project kinds.
   */
  deleteTrashedItemPermanently: (kind: TrashKind, pathOrId: string) => Promise<boolean>;
  /**
   * Empty all trash (R2-9). Best-effort: per-item failures are returned as
   * a list so the UI can show "Emptied N, M errors". Callers MUST present
   * a confirm modal first.
   */
  emptyTrash: () => Promise<{ success: boolean; errors: string[] }>;
  clearError: () => void;
}

export const useTrashStore = create<TrashState>((set, get) => ({
  // Initial state
  trashedItems: null,
  isLoading: false,
  isRestoring: false,
  isPermanentlyDeleting: false,
  error: null,

  // Actions
  loadTrashedItems: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot load trashed items in browser mode');
      set({ isLoading: false });
      return;
    }

    const { skillSourceDir } = useSettingsStore.getState();
    // Extract ensemble dir from skillSourceDir (e.g., "~/.cc-workshop/skills" -> "~/.cc-workshop")
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isLoading: true, error: null });

    try {
      const items = await safeInvoke<TrashedItems>('list_trashed_items', {
        ensembleDir,
      });
      set({ trashedItems: items, isLoading: false });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isLoading: false });
    }
  },

  restoreSkill: async (path: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore skill in browser mode');
      return false;
    }

    const { skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_skill', {
        trashPath: path,
        ensembleDir,
      });
      // Reload trashed items after successful restore
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  restoreMcp: async (path: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore MCP in browser mode');
      return false;
    }

    const { skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_mcp', {
        trashPath: path,
        ensembleDir,
      });
      // Reload trashed items after successful restore
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  restoreClaudeMd: async (path: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore CLAUDE.md in browser mode');
      return false;
    }

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_claude_md', {
        trashPath: path,
      });
      // Reload trashed items after successful restore
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  restoreRule: async (path: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore Rule in browser mode');
      return false;
    }

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_rule', {
        trashPath: path,
      });
      // Reload trashed items after successful restore
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  restoreScene: async (id: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore Scene in browser mode');
      return false;
    }

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_scene', { id });
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  restoreProject: async (id: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('TrashStore: Cannot restore Project in browser mode');
      return false;
    }

    set({ isRestoring: true, error: null });

    try {
      await safeInvoke('restore_project', { id });
      await get().loadTrashedItems();
      set({ isRestoring: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isRestoring: false });
      return false;
    }
  },

  // R2-9 — permanent single-item delete. Confirm modal is the frontend's
  // responsibility; this action commits the delete immediately on call.
  deleteTrashedItemPermanently: async (kind: TrashKind, pathOrId: string) => {
    if (!isTauri()) {
      console.warn('TrashStore: Cannot permanently delete in browser mode');
      return false;
    }

    set({ isPermanentlyDeleting: true, error: null });

    try {
      await safeInvoke('delete_trashed_item_permanently', {
        kind,
        trashPathOrId: pathOrId,
      });
      await get().loadTrashedItems();
      set({ isPermanentlyDeleting: false });
      return true;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isPermanentlyDeleting: false });
      return false;
    }
  },

  // R2-9 — empty all trash. Best-effort: per-item errors are surfaced as a
  // string list so the UI can display them as "Emptied N, M errors".
  emptyTrash: async () => {
    if (!isTauri()) {
      console.warn('TrashStore: Cannot empty trash in browser mode');
      return { success: false, errors: ['Not available in browser mode'] };
    }

    const { skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    set({ isPermanentlyDeleting: true, error: null });

    try {
      const errors = (await safeInvoke<string[]>('empty_trash', { ensembleDir })) || [];
      await get().loadTrashedItems();
      set({ isPermanentlyDeleting: false });
      return { success: true, errors };
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isPermanentlyDeleting: false });
      return { success: false, errors: [message] };
    }
  },

  clearError: () => set({ error: null }),
}));
