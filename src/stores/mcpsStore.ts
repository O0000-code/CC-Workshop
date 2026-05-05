import { create } from 'zustand';
import {
  McpServer,
  FetchMcpToolsResult,
  McpUsage,
  UsageStats,
  ClassifyItem,
  ClassifyResult,
} from '@/types';
import { useSettingsStore } from './settingsStore';
import { usePluginsStore } from './pluginsStore';
import { useAppStore } from './appStore';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { ICON_NAMES } from '@/components/common/IconPicker';

interface McpsFilter {
  search: string;
  category: string | null;
  tags: string[];
}

interface McpsState {
  mcpServers: McpServer[];
  selectedMcpId: string | null;
  filter: McpsFilter;
  isLoading: boolean;
  error: string | null;
  fetchingToolsForMcp: string | null; // Track which MCP is currently fetching tools
  fetchToolsSuccessMcp: string | null; // Track which MCP just succeeded fetching tools
  mcpFetchErrors: Record<string, string>; // Per-MCP fetch error messages

  // Usage stats
  usageStats: Record<string, McpUsage>;
  isLoadingUsage: boolean;

  // Classification
  isClassifying: boolean;
  classifySuccess: boolean;
  isFadingOut: boolean;
  showRestoreAnimation: boolean;

  // Actions
  setMcpServers: (servers: McpServer[]) => void;
  selectMcp: (id: string | null) => void;
  deleteMcp: (id: string) => Promise<void>;
  setFilter: (filter: Partial<McpsFilter>) => void;
  loadMcps: () => Promise<void>;
  updateMcpCategory: (id: string, category: string) => Promise<void>;
  updateMcpTags: (id: string, tags: string[]) => Promise<void>;
  updateMcpIcon: (id: string, icon: string) => Promise<void>;
  updateMcpScope: (id: string, scope: 'global' | 'project') => Promise<void>;
  clearError: () => void;
  fetchMcpTools: (mcpId: string, showSuccessAnimation?: boolean) => Promise<FetchMcpToolsResult>;
  loadUsageStats: () => Promise<void>;
  autoClassify: () => Promise<void>;

  // Computed getters (via selectors)
  getFilteredMcps: () => McpServer[];
  getEnabledCount: () => number;
  getSelectedMcp: () => McpServer | undefined;
}

export const useMcpsStore = create<McpsState>((set, get) => ({
  mcpServers: [],
  selectedMcpId: null,
  filter: {
    search: '',
    category: null,
    tags: [],
  },
  isLoading: false,
  error: null,
  fetchingToolsForMcp: null,
  fetchToolsSuccessMcp: null,
  mcpFetchErrors: {},
  usageStats: {},
  isLoadingUsage: false,
  isClassifying: false,
  classifySuccess: false,
  isFadingOut: false,
  showRestoreAnimation: false,

  setMcpServers: (servers) => set({ mcpServers: servers }),

  clearError: () => set({ error: null }),

  selectMcp: (id) => set({ selectedMcpId: id }),

  loadMcps: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot load MCPs in browser mode');
      set({ isLoading: false });
      return;
    }

    const { mcpSourceDir } = useSettingsStore.getState();
    set({ isLoading: true, error: null });
    try {
      const mcpServers = await safeInvoke<McpServer[]>('scan_mcps', {
        sourceDir: mcpSourceDir,
      });
      set({ mcpServers: mcpServers || [], isLoading: false, mcpFetchErrors: {} });
    } catch (error) {
      set({ error: String(error), isLoading: false });
    }
  },

  deleteMcp: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot delete MCP in browser mode');
      return;
    }

    const mcp = get().mcpServers.find((m) => m.id === id);
    if (!mcp) return;

    // If this is a plugin-imported MCP, clean up the import record
    if (mcp.pluginId) {
      const pluginsStore = usePluginsStore.getState();
      const importKey = `${mcp.pluginId}|${mcp.name}`;
      const newImported = pluginsStore.importedPluginMcps.filter((s) => s !== importKey);
      pluginsStore.setImportedPluginMcps(newImported);
    }

    // Optimistic update - remove from list
    set((state) => ({
      mcpServers: state.mcpServers.filter((m) => m.id !== id),
      selectedMcpId: state.selectedMcpId === id ? null : state.selectedMcpId,
    }));

    const { mcpSourceDir } = useSettingsStore.getState();
    const ensembleDir = mcpSourceDir.replace('/mcps', '');

    try {
      await safeInvoke('delete_mcp', {
        mcpId: id,
        ensembleDir,
      });
    } catch (error) {
      // Rollback on error - reload mcps
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      await get().loadMcps();
    }
  },

  updateMcpCategory: async (id, category) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot update MCP category in browser mode');
      return;
    }

    const mcp = get().mcpServers.find((m) => m.id === id);
    if (!mcp) return;

    const oldCategory = mcp.category;
    const oldCategoryId = mcp.categoryId;

    // Resolve name → id from current categories (V2 §4.6 dual-write).
    // `category === ''` means "Uncategorized" → newCategoryId stays undefined.
    const cats = useAppStore.getState().categories;
    const newCategoryId = category ? cats.find((c) => c.name === category)?.id : undefined;

    // Optimistic update — write both fields locally (UI sees fresh state
    // immediately; backend confirms via the IPC below).
    set((state) => ({
      mcpServers: state.mcpServers.map((m) =>
        m.id === id ? { ...m, category, categoryId: newCategoryId } : m,
      ),
    }));

    try {
      // V2 [P1-6] Option<Option<T>> mapping: `null` = clear, omit = no-op,
      // string = set. Frontend always sends an outer `Some(_)` here so the
      // backend mirrors the optimistic state exactly.
      await safeInvoke('update_mcp_metadata', {
        mcpId: id,
        category,
        categoryId: newCategoryId === undefined ? null : newCategoryId,
      });
    } catch (error) {
      // Rollback on error
      set((state) => ({
        mcpServers: state.mcpServers.map((m) =>
          m.id === id ? { ...m, category: oldCategory, categoryId: oldCategoryId } : m,
        ),
        error: String(error),
      }));
    }
  },

  updateMcpTags: async (id, tags) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot update MCP tags in browser mode');
      return;
    }

    try {
      await safeInvoke('update_mcp_metadata', {
        mcpId: id,
        tags,
      });
      set((state) => ({
        mcpServers: state.mcpServers.map((m) => (m.id === id ? { ...m, tags } : m)),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateMcpIcon: async (id, icon) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot update MCP icon in browser mode');
      // Still update local state for development/testing
      set((state) => ({
        mcpServers: state.mcpServers.map((m) => (m.id === id ? { ...m, icon } : m)),
      }));
      return;
    }

    try {
      await safeInvoke('update_mcp_metadata', {
        mcpId: id,
        icon,
      });
      set((state) => ({
        mcpServers: state.mcpServers.map((m) => (m.id === id ? { ...m, icon } : m)),
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },

  updateMcpScope: async (id, scope) => {
    if (!isTauri()) {
      console.warn('McpsStore: Cannot update MCP scope in browser mode');
      return;
    }

    const mcp = get().mcpServers.find((m) => m.id === id);
    if (!mcp) return;

    const oldScope = mcp.scope;

    // Optimistic update
    set((state) => ({
      mcpServers: state.mcpServers.map((m) => (m.id === id ? { ...m, scope } : m)),
    }));

    const { mcpSourceDir, claudeConfigDir } = useSettingsStore.getState();

    try {
      await safeInvoke('update_mcp_scope', {
        mcpId: id,
        scope,
        ensembleDir: mcpSourceDir.replace('/mcps', ''),
        claudeConfigDir,
      });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        mcpServers: state.mcpServers.map((m) => (m.id === id ? { ...m, scope: oldScope } : m)),
        error: message,
      }));
    }
  },

  fetchMcpTools: async (mcpId, showSuccessAnimation = true) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot fetch MCP tools in browser mode');
      return { success: false, tools: [], error: 'Not in Tauri environment' };
    }

    const mcp = get().mcpServers.find((m) => m.id === mcpId);
    if (!mcp) {
      return { success: false, tools: [], error: 'MCP not found' };
    }

    // HTTP MCPs don't support stdio-based tool discovery
    if (mcp.mcpType === 'http') {
      return { success: false, tools: [], error: 'HTTP MCPs do not support tool fetching' };
    }

    // Set loading state
    set({ fetchingToolsForMcp: mcpId });

    try {
      const result = await safeInvoke<FetchMcpToolsResult>('fetch_mcp_tools', {
        command: mcp.command,
        args: mcp.args,
        env: mcp.env || null,
        timeoutMs: 15000,
      });

      if (result && result.success) {
        // Update MCP's providedTools with the fetched tools
        set((state) => {
          const { [mcpId]: _, ...remainingErrors } = state.mcpFetchErrors;
          return {
            mcpServers: state.mcpServers.map((m) =>
              m.id === mcpId
                ? {
                    ...m,
                    providedTools: result.tools.map((t) => ({
                      name: t.name,
                      description: t.description || '',
                    })),
                  }
                : m,
            ),
            fetchingToolsForMcp: null,
            mcpFetchErrors: remainingErrors,
            // Only show success animation if explicitly requested (manual click)
            fetchToolsSuccessMcp: showSuccessAnimation ? mcpId : null,
          };
        });
        // Clear success state after 2 seconds (only if showing animation)
        if (showSuccessAnimation) {
          setTimeout(() => {
            set({ fetchToolsSuccessMcp: null });
          }, 2000);
        }
        return result;
      } else {
        // Clear loading state on failure, record per-MCP error
        const errorMsg = result?.error || 'Failed to fetch tools';
        set((state) => ({
          fetchingToolsForMcp: null,
          mcpFetchErrors: { ...state.mcpFetchErrors, [mcpId]: errorMsg },
        }));
        return result || { success: false, tools: [], error: 'No result returned' };
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to fetch MCP tools:', error);
      set((state) => ({
        fetchingToolsForMcp: null,
        mcpFetchErrors: { ...state.mcpFetchErrors, [mcpId]: message },
      }));
      return { success: false, tools: [], error: message };
    }
  },

  loadUsageStats: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('McpsStore: Cannot load usage stats in browser mode');
      return;
    }

    const { claudeConfigDir } = useSettingsStore.getState();
    set({ isLoadingUsage: true });

    try {
      const stats = await safeInvoke<UsageStats>('scan_usage_stats', {
        claudeDir: claudeConfigDir || '~/.claude',
      });

      if (stats && stats.mcps) {
        set({ usageStats: stats.mcps, isLoadingUsage: false });
      } else {
        set({ usageStats: {}, isLoadingUsage: false });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to load MCP usage stats:', error);
      set({ usageStats: {}, isLoadingUsage: false, error: message });
    }
  },

  autoClassify: async () => {
    if (!isTauri()) {
      console.warn('McpsStore: Cannot auto-classify in browser mode');
      set({ error: 'Auto-classification is not available in browser mode' });
      return;
    }

    const { mcpServers } = get();
    const { categories, tags } = useAppStore.getState();

    if (mcpServers.length === 0) {
      set({ error: 'No MCP servers to classify.' });
      return;
    }

    set({ isClassifying: true, classifySuccess: false, error: null });

    try {
      // Prepare all MCPs for classification
      const items: ClassifyItem[] = mcpServers.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        tools: m.providedTools.map((t) => t.name),
      }));

      const existingCategories = categories.map((c) => c.name);
      const existingTags = tags.map((t) => t.name);

      const results = await safeInvoke<ClassifyResult[]>('auto_classify', {
        items,
        existingCategories,
        existingTags,
        availableIcons: ICON_NAMES,
      });

      if (!results) {
        set({ error: 'Classification failed', isClassifying: false });
        return;
      }

      // Collect new categories and tags that need to be created
      const { addCategory, addTag, loadCategories, loadTags } = useAppStore.getState();
      const existingCategoryNames = new Set(categories.map((c) => c.name));
      const existingTagNames = new Set(tags.map((t) => t.name));

      const newCategories = new Set<string>();
      const newTags = new Set<string>();

      for (const result of results) {
        if (result.suggested_category && !existingCategoryNames.has(result.suggested_category)) {
          newCategories.add(result.suggested_category);
        }
        for (const tag of result.suggested_tags) {
          if (!existingTagNames.has(tag)) {
            newTags.add(tag);
          }
        }
      }

      // Create new categories (using predefined colors)
      const categoryColors = [
        '#3B82F6',
        '#10B981',
        '#F59E0B',
        '#EF4444',
        '#8B5CF6',
        '#EC4899',
        '#14B8A6',
        '#F97316',
      ];
      let colorIndex = categories.length;
      for (const categoryName of newCategories) {
        await addCategory(
          categoryName,
          categoryColors[colorIndex % categoryColors.length],
          undefined, // D14=A: new categories from autoClassify always land at root
        );
        colorIndex++;
      }

      // Create new tags
      for (const tagName of newTags) {
        await addTag(tagName);
      }

      // P1-2: dual-write `categoryId` alongside `category` so the entry is
      // canonical post-migration. Snapshot the latest categories AFTER
      // addCategory above so we can resolve the freshly-created category's
      // id by name. Without this, autoClassify-created entries stay
      // "orphaned" forever (category_id stays None even after the migration
      // flag advances) — see final_audit P1-2.
      const updatedCategories = useAppStore.getState().categories;
      const categoryIdByName = new Map<string, string>(
        updatedCategories.map((c) => [c.name, c.id]),
      );

      // Apply results
      for (const result of results) {
        const mcp = mcpServers.find((m) => m.id === result.id);
        if (mcp) {
          const resolvedCategoryId = categoryIdByName.get(result.suggested_category) ?? null;
          await safeInvoke('update_mcp_metadata', {
            mcpId: result.id,
            category: result.suggested_category,
            categoryId: resolvedCategoryId,
            tags: result.suggested_tags,
            icon: result.suggested_icon,
          });
        }
      }

      // Reload categories, tags, and MCPs
      await Promise.all([loadCategories(), loadTags(), get().loadMcps()]);
      set({ classifySuccess: true, isClassifying: false });
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
      set({ error: message, isClassifying: false, classifySuccess: false });
    }
  },

  setFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter },
    })),

  getFilteredMcps: () => {
    const state = get();
    let filtered = [...state.mcpServers];

    // Filter by search
    if (state.filter.search) {
      const searchLower = state.filter.search.toLowerCase();
      filtered = filtered.filter(
        (mcp) =>
          mcp.name.toLowerCase().includes(searchLower) ||
          mcp.description.toLowerCase().includes(searchLower),
      );
    }

    // Filter by category
    if (state.filter.category) {
      filtered = filtered.filter((mcp) => mcp.category === state.filter.category);
    }

    // Filter by tags
    if (state.filter.tags.length > 0) {
      filtered = filtered.filter((mcp) => state.filter.tags.some((tag) => mcp.tags.includes(tag)));
    }

    // Sort: plugin-imported MCPs at the bottom
    filtered.sort((a, b) => {
      const aIsPlugin = a.installSource === 'plugin';
      const bIsPlugin = b.installSource === 'plugin';
      if (aIsPlugin === bIsPlugin) {
        // Same source type, sort by name
        return a.name.localeCompare(b.name);
      }
      return aIsPlugin ? 1 : -1;
    });

    return filtered;
  },

  getEnabledCount: () => {
    return get().mcpServers.filter((mcp) => mcp.enabled).length;
  },

  getSelectedMcp: () => {
    const state = get();
    return state.mcpServers.find((mcp) => mcp.id === state.selectedMcpId);
  },
}));
