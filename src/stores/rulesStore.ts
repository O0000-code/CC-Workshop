// src/stores/rulesStore.ts
//
// Mirrors `claudeMdStore.ts` for the Rule domain. Differences from the
// CLAUDE.md store (see `.dev/rule-management/01_design.md`):
//   * Per-rule `isGlobal` flag — multiple rules may be global simultaneously,
//     so there is no `globalFileId: string | null` singleton field.
//   * `setGlobal(id)` and `unsetGlobal(id)` both take an id; neither touches
//     the `isGlobal` flag of any OTHER rule.
//   * `Rule.filename` is immutable; the store exposes no rename action for it.

import { create } from 'zustand';
import {
  Rule,
  RuleScanResult,
  RuleScanItem,
  RuleImportOptions,
  RuleImportResult,
  RuleDistributionOptions,
  RuleDistributionResult,
  SetGlobalRuleResult,
} from '@/types/rule';
import { ClassifyItem, ClassifyResult, ClassifyScope } from '@/types';
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

interface RulesFilter {
  search: string;
  categoryId: string | null;
  tagIds: string[];
  showGlobalOnly: boolean;
}

interface RulesState {
  // Data
  rules: Rule[];

  // Scan state
  scanResult: RuleScanResult | null;
  isScanning: boolean;

  // Selection
  selectedRuleId: string | null;

  // Filter
  filter: RulesFilter;

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
  loadRules: () => Promise<void>;
  setRules: (rules: Rule[]) => void;
  selectRule: (id: string | null) => void;

  // Scan actions
  scanRules: (scanPaths?: string[], includeHome?: boolean) => Promise<void>;
  clearScanResult: () => void;

  // Import actions
  importRule: (options: RuleImportOptions) => Promise<RuleImportResult | null>;

  // CRUD actions
  updateRule: (id: string, updates: Partial<Rule>) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;

  // Global actions — each rule independently toggleable.
  setGlobal: (id: string) => Promise<SetGlobalRuleResult | null>;
  unsetGlobal: (id: string) => Promise<void>;

  // Distribution actions
  distributeToProject: (options: RuleDistributionOptions) => Promise<RuleDistributionResult | null>;

  // Auto-classify actions
  autoClassify: (scope?: ClassifyScope) => Promise<void>;

  // Filter actions
  setFilter: (filter: Partial<RulesFilter>) => void;
  clearFilter: () => void;

  // Error handling
  clearError: () => void;

  // Computed
  getFilteredRules: () => Rule[];
  getGlobalRules: () => Rule[];
  getNonGlobalRules: () => Rule[];
  getSelectedRule: () => Rule | undefined;
  getUnimportedScanItems: () => RuleScanItem[];
}

// ============================================================================
// Initial State
// ============================================================================

const initialFilter: RulesFilter = {
  search: '',
  categoryId: null,
  tagIds: [],
  showGlobalOnly: false,
};

// ============================================================================
// Store
// ============================================================================

export const useRulesStore = create<RulesState>((set, get) => ({
  // Initial state
  rules: [],
  scanResult: null,
  isScanning: false,
  selectedRuleId: null,
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
  // Load rules
  // ========================================================================
  loadRules: async () => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot load rules in browser mode');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const rules = await safeInvoke<Rule[]>('get_rules');

      set({
        rules: rules || [],
        isLoading: false,
      });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('[RulesStore] loadRules error:', message);
      set({ error: message, isLoading: false });
    }
  },

  setRules: (rules) => {
    set({ rules });
  },

  selectRule: (id) => set({ selectedRuleId: id }),

  // ========================================================================
  // Scan rules
  // ========================================================================
  scanRules: async (scanPaths, includeHome = true) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot scan rules in browser mode');
      return;
    }

    set({ isScanning: true, error: null });

    try {
      const result = await safeInvoke<RuleScanResult>('scan_rules', {
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
  // Import rule
  // ========================================================================
  importRule: async (options) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot import rule in browser mode');
      return null;
    }

    set({ isImporting: true, error: null });

    try {
      const result = await safeInvoke<RuleImportResult>('import_rule', {
        options: options,
      });

      if (result?.success && result.file) {
        set((state) => {
          const newRules = [...state.rules, result.file!];
          return {
            rules: newRules,
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
      console.error('[RulesStore] Import error:', message);
      set({ error: message, isImporting: false });
      return null;
    }
  },

  // ========================================================================
  // Update rule
  // ========================================================================
  updateRule: async (id, updates) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot update rule in browser mode');
      return;
    }

    const rule = get().rules.find((r) => r.id === id);
    if (!rule) return;

    // Optimistic update
    set((state) => ({
      rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }));

    try {
      // Note: `filename` is intentionally NOT forwarded — backend rejects any
      // change to it (Claude Code indexes Rules by filename).
      //
      // `categoryId` is three-state on the backend (`Option<Option<String>>`):
      //   - key omitted              → "do not modify"
      //   - key with literal `null`  → "clear (Uncategorized)"
      //   - key with string id       → "set"
      // Detect intent by whether the caller's `updates` object carries the
      // key at all: `'categoryId' in updates`. If yes, normalise `undefined`
      // → `null` so JSON.stringify emits the explicit `null` clear-signal
      // (it would otherwise drop the key entirely, collapsing "clear" into
      // "no-op"). If the key isn't present we omit it from the payload.
      // Bug Audit 2026-05-15 finding A8.
      const payload: Record<string, unknown> = { id };
      if ('content' in updates) payload.content = updates.content;
      if ('name' in updates) payload.name = updates.name;
      if ('description' in updates) payload.description = updates.description;
      if ('categoryId' in updates) {
        payload.categoryId = updates.categoryId === undefined ? null : updates.categoryId;
      }
      if ('tagIds' in updates) payload.tagIds = updates.tagIds;
      if ('icon' in updates) payload.icon = updates.icon;

      await safeInvoke('update_rule', payload);
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        rules: state.rules.map((r) => (r.id === id ? rule : r)),
        error: message,
      }));
    }
  },

  // ========================================================================
  // Delete rule
  // ========================================================================
  deleteRule: async (id) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot delete rule in browser mode');
      return;
    }

    const rule = get().rules.find((r) => r.id === id);
    if (!rule) return;

    // Optimistic update
    set((state) => ({
      rules: state.rules.filter((r) => r.id !== id),
      selectedRuleId: state.selectedRuleId === id ? null : state.selectedRuleId,
    }));

    try {
      await safeInvoke('delete_rule', { id });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        rules: [...state.rules, rule],
        error: message,
      }));
    }
  },

  // ========================================================================
  // Set global (per-rule; does NOT unset other rules)
  // ========================================================================
  setGlobal: async (id) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot set global in browser mode');
      return null;
    }

    set({ isSetting: true, error: null });

    try {
      const result = await safeInvoke<SetGlobalRuleResult>('set_global_rule', { id });

      if (result?.success) {
        // Reload rules from backend to pick up any auto-imported "Original"
        // rule preserved when an unmanaged `~/.claude/rules/<filename>.md`
        // was overwritten.
        await get().loadRules();
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
  // Unset global (per-rule)
  // ========================================================================
  unsetGlobal: async (id) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot unset global in browser mode');
      return;
    }

    set({ isSetting: true, error: null });

    try {
      await safeInvoke('unset_global_rule', { id });

      // Only flip the target rule's flag — leave others alone.
      set((state) => ({
        rules: state.rules.map((r) => (r.id === id ? { ...r, isGlobal: false } : r)),
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
      console.warn('RulesStore: Cannot distribute in browser mode');
      return null;
    }

    set({ isDistributing: true, error: null });

    try {
      const result = await safeInvoke<RuleDistributionResult>('distribute_rule', {
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
  autoClassify: async (scope?: ClassifyScope) => {
    if (!isTauri()) {
      console.warn('RulesStore: Cannot auto-classify in browser mode');
      set({ error: 'Auto-classification is not available in browser mode' });
      return;
    }

    const { rules } = get();
    const { categories, tags } = useAppStore.getState();

    // Apply scope filter when provided.
    const rulesToClassify = rules.filter((r) => {
      if (scope?.categoryIds) {
        if (!r.categoryId || !scope.categoryIds.has(r.categoryId)) return false;
      }
      if (scope?.tagId && !(r.tagIds?.includes(scope.tagId) ?? false)) {
        return false;
      }
      return true;
    });

    if (rulesToClassify.length === 0) {
      set({
        error: scope ? 'No Rules to classify in this scope.' : 'No Rules to classify.',
      });
      return;
    }

    set({ isAutoClassifying: true, classifySuccess: false, error: null });

    try {
      // Prepare rules for classification — use a 500-char content preview to
      // keep prompts bounded.
      const items: ClassifyItem[] = rulesToClassify.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        content: r.content.substring(0, 500),
      }));

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

      for (const result of results) {
        const rule = rules.find((r) => r.id === result.id);
        if (rule) {
          const categoryId = categoryIdByName.get(result.suggested_category);
          const tagIds = result.suggested_tags
            .map((tagName) => tagIdByName.get(tagName))
            .filter((id): id is string => id !== undefined);

          await safeInvoke('update_rule', {
            id: rule.id,
            categoryId: categoryId,
            tagIds: tagIds,
            icon: result.suggested_icon,
          });
        }
      }

      // Reload rules
      await get().loadRules();
      set({ classifySuccess: true, isAutoClassifying: false });
      // Show success for 1.5s, then fade out for 200ms
      setTimeout(() => {
        set({ isFadingOut: true });
        setTimeout(() => {
          set({ classifySuccess: false, isFadingOut: false, showRestoreAnimation: true });
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
  getFilteredRules: () => {
    const { rules, filter } = get();
    let filtered = [...rules];

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (rule) =>
          rule.name.toLowerCase().includes(searchLower) ||
          rule.description.toLowerCase().includes(searchLower) ||
          rule.content.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filter.categoryId) {
      filtered = filtered.filter((rule) => rule.categoryId === filter.categoryId);
    }

    // Tags filter
    if (filter.tagIds.length > 0) {
      filtered = filtered.filter((rule) => filter.tagIds.some((tag) => rule.tagIds.includes(tag)));
    }

    // Global only filter
    if (filter.showGlobalOnly) {
      filtered = filtered.filter((rule) => rule.isGlobal);
    }

    // Sort by name (no "global first" pin — multiple rules can be global).
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    return filtered;
  },

  getGlobalRules: () => {
    const { rules } = get();
    return rules.filter((r) => r.isGlobal);
  },

  getNonGlobalRules: () => {
    const { rules } = get();
    return rules.filter((r) => !r.isGlobal);
  },

  getSelectedRule: () => {
    const { rules, selectedRuleId } = get();
    return rules.find((r) => r.id === selectedRuleId);
  },

  getUnimportedScanItems: () => {
    const { scanResult } = get();
    if (!scanResult) return [];
    return scanResult.items.filter((item) => !item.isImported);
  },
}));

export default useRulesStore;
