// src/stores/claudeMdStore.ts

import { create } from 'zustand';
import {
  ClaudeMdFile,
  ClaudeMdScanResult,
  ClaudeMdScanItem,
  ClaudeMdImportOptions,
  ClaudeMdImportResult,
  ClaudeMdDistributionOptions,
  ClaudeMdDistributionResult,
  SetGlobalResult,
} from '@/types/claudeMd';
import { ClassifyItem, ClassifyResult } from '@/types';
import { ICON_NAMES } from '@/components/common/IconPicker';
import { isTauri, safeInvoke } from '@/utils/tauri';
import {
  applyClassifyResultsToCategories,
  buildExistingCategoriesPayload,
} from '@/utils/classifyHelpers';
import { useAppStore } from './appStore';

// ============================================================================
// Types
// ============================================================================

interface ClaudeMdFilter {
  search: string;
  categoryId: string | null;
  tagIds: string[];
  showGlobalOnly: boolean;
}

interface ClaudeMdState {
  // Data
  files: ClaudeMdFile[];
  globalFileId: string | null;

  // Scan state
  scanResult: ClaudeMdScanResult | null;
  isScanning: boolean;

  // Selection
  selectedFileId: string | null;

  // Filter
  filter: ClaudeMdFilter;

  // Loading states
  isLoading: boolean;
  isImporting: boolean;
  isSetting: boolean;
  isDistributing: boolean;
  isAutoClassifying: boolean;
  classifySuccess: boolean;
  isFadingOut: boolean;
  showRestoreAnimation: boolean;

  // Error state
  error: string | null;

  // Actions
  loadFiles: () => Promise<void>;
  setFiles: (files: ClaudeMdFile[]) => void;
  selectFile: (id: string | null) => void;

  // Scan actions
  scanFiles: (scanPaths?: string[], includeHome?: boolean) => Promise<void>;
  clearScanResult: () => void;

  // Import actions
  importFile: (options: ClaudeMdImportOptions) => Promise<ClaudeMdImportResult | null>;

  // CRUD actions
  updateFile: (id: string, updates: Partial<ClaudeMdFile>) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;

  // Global actions
  setGlobal: (id: string) => Promise<SetGlobalResult | null>;
  unsetGlobal: () => Promise<void>;

  // Distribution actions
  distributeToProject: (
    options: ClaudeMdDistributionOptions,
  ) => Promise<ClaudeMdDistributionResult | null>;

  // Auto-classify actions
  autoClassify: () => Promise<void>;

  // Filter actions
  setFilter: (filter: Partial<ClaudeMdFilter>) => void;
  clearFilter: () => void;

  // Error handling
  clearError: () => void;

  // Computed
  getFilteredFiles: () => ClaudeMdFile[];
  getGlobalFile: () => ClaudeMdFile | undefined;
  getNonGlobalFiles: () => ClaudeMdFile[];
  getSelectedFile: () => ClaudeMdFile | undefined;
  getUnimportedScanItems: () => ClaudeMdScanItem[];
}

// ============================================================================
// Initial State
// ============================================================================

const initialFilter: ClaudeMdFilter = {
  search: '',
  categoryId: null,
  tagIds: [],
  showGlobalOnly: false,
};

// ============================================================================
// Store
// ============================================================================

export const useClaudeMdStore = create<ClaudeMdState>((set, get) => ({
  // Initial state
  files: [],
  globalFileId: null,
  scanResult: null,
  isScanning: false,
  selectedFileId: null,
  filter: initialFilter,
  isLoading: false,
  isImporting: false,
  isSetting: false,
  isDistributing: false,
  isAutoClassifying: false,
  classifySuccess: false,
  isFadingOut: false,
  showRestoreAnimation: false,
  error: null,

  // ========================================================================
  // Load files
  // ========================================================================
  loadFiles: async () => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot load files in browser mode');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const files = await safeInvoke<ClaudeMdFile[]>('get_claude_md_files');
      const globalFile = files?.find((f) => f.isGlobal);

      set({
        files: files || [],
        globalFileId: globalFile?.id || null,
        isLoading: false,
      });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('[ClaudeMdStore] loadFiles error:', message);
      set({ error: message, isLoading: false });
    }
  },

  setFiles: (files) => {
    const globalFile = files.find((f) => f.isGlobal);
    set({ files, globalFileId: globalFile?.id || null });
  },

  selectFile: (id) => set({ selectedFileId: id }),

  // ========================================================================
  // Scan files
  // ========================================================================
  scanFiles: async (scanPaths, includeHome = true) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot scan files in browser mode');
      return;
    }

    set({ isScanning: true, error: null });

    try {
      const result = await safeInvoke<ClaudeMdScanResult>('scan_claude_md_files', {
        scanPaths,
        includeHome,
      });

      set({ scanResult: result || null, isScanning: false });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isScanning: false });
    }
  },

  clearScanResult: () => set({ scanResult: null }),

  // ========================================================================
  // Import file
  // ========================================================================
  importFile: async (options) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot import file in browser mode');
      return null;
    }

    set({ isImporting: true, error: null });

    try {
      const result = await safeInvoke<ClaudeMdImportResult>('import_claude_md', {
        options: options,
      });

      if (result?.success && result.file) {
        set((state) => {
          const newFiles = [...state.files, result.file!];
          return {
            files: newFiles,
            isImporting: false,
          };
        });
      } else {
        set({
          error: result?.error || 'Import failed',
          isImporting: false,
        });
      }

      return result || null;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('[ClaudeMdStore] Import error:', message);
      set({ error: message, isImporting: false });
      return null;
    }
  },

  // ========================================================================
  // Update file
  // ========================================================================
  updateFile: async (id, updates) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot update file in browser mode');
      return;
    }

    const file = get().files.find((f) => f.id === id);
    if (!file) return;

    // Optimistic update
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));

    try {
      await safeInvoke('update_claude_md', {
        id,
        content: updates.content,
        name: updates.name,
        description: updates.description,
        categoryId: updates.categoryId,
        tagIds: updates.tagIds,
        icon: updates.icon,
      });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        files: state.files.map((f) => (f.id === id ? file : f)),
        error: message,
      }));
    }
  },

  // ========================================================================
  // Delete file
  // ========================================================================
  deleteFile: async (id) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot delete file in browser mode');
      return;
    }

    const file = get().files.find((f) => f.id === id);
    if (!file) return;

    // Note: Global files can be deleted - backend will unset global status
    // and move to trash without touching ~/.claude/CLAUDE.md

    // Optimistic update
    // If deleting global file, also clear globalFileId
    const isGlobal = file.isGlobal;
    set((state) => ({
      files: state.files.filter((f) => f.id !== id),
      selectedFileId: state.selectedFileId === id ? null : state.selectedFileId,
      globalFileId: isGlobal ? null : state.globalFileId,
    }));

    try {
      await safeInvoke('delete_claude_md', { id });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        files: [...state.files, file],
        error: message,
        globalFileId: isGlobal ? id : state.globalFileId,
      }));
    }
  },

  // ========================================================================
  // Set global
  // ========================================================================
  setGlobal: async (id) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot set global in browser mode');
      return null;
    }

    set({ isSetting: true, error: null });

    try {
      const result = await safeInvoke<SetGlobalResult>('set_global_claude_md', { id });

      if (result?.success) {
        // Reload files from backend to get any auto-imported files
        // (e.g., "Original Global" when replacing unmanaged global)
        await get().loadFiles();
        set({ isSetting: false });
      } else {
        set({
          error: result?.error || 'Failed to set global',
          isSetting: false,
        });
      }

      return result || null;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isSetting: false });
      return null;
    }
  },

  // ========================================================================
  // Unset global
  // ========================================================================
  unsetGlobal: async () => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot unset global in browser mode');
      return;
    }

    const { globalFileId } = get();
    if (!globalFileId) return;

    set({ isSetting: true, error: null });

    try {
      await safeInvoke('unset_global_claude_md');

      // Update local state
      set((state) => ({
        files: state.files.map((f) => ({
          ...f,
          isGlobal: false,
        })),
        globalFileId: null,
        isSetting: false,
      }));
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isSetting: false });
    }
  },

  // ========================================================================
  // Distribute to project
  // ========================================================================
  distributeToProject: async (options) => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot distribute in browser mode');
      return null;
    }

    set({ isDistributing: true, error: null });

    try {
      const result = await safeInvoke<ClaudeMdDistributionResult>('distribute_claude_md', {
        options: options,
      });

      set({ isDistributing: false });

      if (!result?.success) {
        set({ error: result?.error || 'Distribution failed' });
      }

      return result || null;
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isDistributing: false });
      return null;
    }
  },

  // ========================================================================
  // Auto-classify
  // ========================================================================
  autoClassify: async () => {
    if (!isTauri()) {
      console.warn('ClaudeMdStore: Cannot auto-classify in browser mode');
      set({ error: 'Auto-classification is not available in browser mode' });
      return;
    }

    const { files } = get();
    const { categories, tags } = useAppStore.getState();

    if (files.length === 0) {
      set({ error: 'No CLAUDE.md files to classify.' });
      return;
    }

    set({ isAutoClassifying: true, classifySuccess: false, error: null });

    try {
      // Prepare all files for classification
      // Use content summary (first 500 chars) to avoid too large prompts
      const items: ClassifyItem[] = files.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        content: f.content.substring(0, 500),
      }));

      // Existing categories carry hierarchy (parentName) so the model
      // can see which roots already have sub-categories and propose new
      // ones intelligently — see classify.rs build_classification_prompt.
      const existingCategories = buildExistingCategoriesPayload(categories);
      const existingTags = tags.map((t) => t.name);

      const results = await safeInvoke<ClassifyResult[]>('auto_classify', {
        items,
        existingCategories,
        existingTags,
        availableIcons: ICON_NAMES,
      });

      if (!results) {
        set({ error: 'Classification failed', isAutoClassifying: false });
        return;
      }

      // Create the new categories and tags the results imply. Sub-cats
      // (results with `suggested_parent_category`) are created with the
      // proper parentId so they appear nested in the sidebar without
      // any manual move. Returns name → id map for category resolution
      // below; tag IDs are read from the updated appStore state.
      const { addCategory, addTag } = useAppStore.getState();
      const categoryIdByName = await applyClassifyResultsToCategories(
        results,
        categories,
        tags,
        addCategory,
        addTag,
      );
      const tagIdByName = new Map<string, string>(
        useAppStore.getState().tags.map((t) => [t.name, t.id]),
      );

      // Apply results - use the helper-produced map for category id and
      // updated tag state for tag ids.
      for (const result of results) {
        const file = files.find((f) => f.id === result.id);
        if (file) {
          const categoryId = categoryIdByName.get(result.suggested_category);
          const tagIds = result.suggested_tags
            .map((tagName) => tagIdByName.get(tagName))
            .filter((id): id is string => id !== undefined);

          await safeInvoke('update_claude_md', {
            id: file.id,
            categoryId: categoryId,
            tagIds: tagIds,
            icon: result.suggested_icon,
          });
        }
      }

      // Reload files
      await get().loadFiles();
      set({ classifySuccess: true, isAutoClassifying: false });
      // Show success for 1.5s, then fade out for 200ms
      setTimeout(() => {
        set({ isFadingOut: true });
        setTimeout(() => {
          set({ classifySuccess: false, isFadingOut: false, showRestoreAnimation: true });
          // Reset showRestoreAnimation after the fade-in animation completes
          setTimeout(() => {
            set({ showRestoreAnimation: false });
          }, 200);
        }, 200);
      }, 1500);
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isAutoClassifying: false, classifySuccess: false });
    }
  },

  // ========================================================================
  // Filter actions
  // ========================================================================
  setFilter: (filter) => {
    const currentFilter = get().filter;
    set({ filter: { ...currentFilter, ...filter } });
  },

  clearFilter: () => set({ filter: initialFilter }),

  clearError: () => set({ error: null }),

  // ========================================================================
  // Computed
  // ========================================================================
  getFilteredFiles: () => {
    const { files, filter } = get();
    let filtered = [...files];

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (file) =>
          file.name.toLowerCase().includes(searchLower) ||
          file.description.toLowerCase().includes(searchLower) ||
          file.content.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filter.categoryId) {
      filtered = filtered.filter((file) => file.categoryId === filter.categoryId);
    }

    // Tags filter
    if (filter.tagIds.length > 0) {
      filtered = filtered.filter((file) => filter.tagIds.some((tag) => file.tagIds.includes(tag)));
    }

    // Global only filter
    if (filter.showGlobalOnly) {
      filtered = filtered.filter((file) => file.isGlobal);
    }

    // Sort: global first, then by name
    filtered.sort((a, b) => {
      if (a.isGlobal !== b.isGlobal) {
        return a.isGlobal ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return filtered;
  },

  getGlobalFile: () => {
    const { files, globalFileId } = get();
    return files.find((f) => f.id === globalFileId);
  },

  getNonGlobalFiles: () => {
    const { files } = get();
    return files.filter((f) => !f.isGlobal);
  },

  getSelectedFile: () => {
    const { files, selectedFileId } = get();
    return files.find((f) => f.id === selectedFileId);
  },

  getUnimportedScanItems: () => {
    const { scanResult } = get();
    if (!scanResult) return [];
    return scanResult.items.filter((item) => !item.isImported);
  },
}));

export default useClaudeMdStore;
