import { create } from 'zustand';
import type {
  Skill,
  SkillUsage,
  UsageStats,
  ClassifyItem,
  ClassifyResult,
  ClassifyScope,
} from '../types';
import { useSettingsStore } from './settingsStore';
import { useAppStore } from './appStore';
import { usePluginsStore } from './pluginsStore';
import { isTauri, safeInvoke } from '@/utils/tauri';
import {
  applyClassifyResultsToCategories,
  buildExistingCategoriesPayload,
} from '@/utils/classifyHelpers';
import { ICON_NAMES } from '@/components/common/IconPicker';

// ============================================================================
// Types
// ============================================================================

interface SkillsFilter {
  search: string;
  category: string | null;
  tags: string[];
}

interface SkillsState {
  // Data
  skills: Skill[];

  // Selection
  selectedSkillId: string | null;

  // Filter
  filter: SkillsFilter;

  // Loading state
  isLoading: boolean;

  // Error state
  error: string | null;

  // Classification state
  isClassifying: boolean;
  classifySuccess: boolean;
  isFadingOut: boolean;
  showRestoreAnimation: boolean;

  // Usage stats
  usageStats: Record<string, SkillUsage>;
  isLoadingUsage: boolean;

  // Actions
  loadSkills: () => Promise<void>;
  setSkills: (skills: Skill[]) => void;
  selectSkill: (id: string | null) => void;
  deleteSkill: (id: string) => Promise<void>;
  updateSkillCategory: (id: string, category: string) => Promise<void>;
  updateSkillTags: (id: string, tags: string[]) => Promise<void>;
  updateSkillIcon: (id: string, icon: string) => Promise<void>;
  updateSkillScope: (id: string, scope: 'global' | 'project') => Promise<void>;
  setFilter: (filter: Partial<SkillsFilter>) => void;
  clearFilter: () => void;
  clearError: () => void;
  autoClassify: (scope?: ClassifyScope) => Promise<void>;
  loadUsageStats: () => Promise<void>;

  // Computed
  getFilteredSkills: () => Skill[];
  getEnabledCount: () => number;
  getSelectedSkill: () => Skill | undefined;
}

// ============================================================================
// Store
// ============================================================================

const initialFilter: SkillsFilter = {
  search: '',
  category: null,
  tags: [],
};

export const useSkillsStore = create<SkillsState>((set, get) => ({
  // Initial state
  skills: [],
  selectedSkillId: null,
  filter: initialFilter,
  isLoading: false,
  isClassifying: false,
  classifySuccess: false,
  isFadingOut: false,
  showRestoreAnimation: false,
  error: null,
  usageStats: {},
  isLoadingUsage: false,

  // Actions
  loadSkills: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot load skills in browser mode');
      set({ isLoading: false });
      return;
    }

    const { skillSourceDir, claudeConfigDir } = useSettingsStore.getState();
    set({ isLoading: true, error: null });
    try {
      // claudeConfigDir is passed so the backend can derive each Skill's
      // scope by checking `<claudeConfigDir>/skills/<name>` existence —
      // see commands/skills.rs::derive_skill_scope.
      const skills = await safeInvoke<Skill[]>('scan_skills', {
        sourceDir: skillSourceDir,
        claudeConfigDir,
      });
      set({ skills: skills || [], isLoading: false });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isLoading: false });
    }
  },

  setSkills: (skills) => set({ skills }),

  selectSkill: (id) => set({ selectedSkillId: id }),

  deleteSkill: async (id) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot delete skill in browser mode');
      return;
    }

    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    // If this is a plugin-imported skill, clean up the import record
    if (skill.pluginId) {
      const pluginsStore = usePluginsStore.getState();
      const importKey = `${skill.pluginId}|${skill.name}`;
      const newImported = pluginsStore.importedPluginSkills.filter((s) => s !== importKey);
      pluginsStore.setImportedPluginSkills(newImported);
    }

    // Optimistic update - remove from list
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
      selectedSkillId: state.selectedSkillId === id ? null : state.selectedSkillId,
    }));

    const { skillSourceDir } = useSettingsStore.getState();
    const ensembleDir = skillSourceDir.replace('/skills', '');

    try {
      await safeInvoke('delete_skill', {
        skillId: id,
        ensembleDir,
      });
    } catch (error) {
      // Rollback on error - reload skills
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      await get().loadSkills();
    }
  },

  updateSkillCategory: async (id, category) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot update skill category in browser mode');
      return;
    }

    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    const oldCategory = skill.category;
    const oldCategoryId = skill.categoryId;

    // Resolve name → id from current categories (V2 §4.6 dual-write).
    // `category === ''` means "Uncategorized" → newCategoryId stays undefined.
    const cats = useAppStore.getState().categories;
    const newCategoryId = category ? cats.find((c) => c.name === category)?.id : undefined;

    // Optimistic update — write both fields locally (UI sees fresh state
    // immediately; backend confirms via the IPC below).
    set((state) => ({
      skills: state.skills.map((s) =>
        s.id === id ? { ...s, category, categoryId: newCategoryId } : s,
      ),
    }));

    try {
      // V2 [P1-6] Option<Option<T>> mapping: `null` = clear, omit = no-op,
      // string = set. Frontend always sends an outer `Some(_)` here so the
      // backend mirrors the optimistic state exactly (no "leave it alone"
      // ambiguity). When category lookup fails (e.g. a stale cache or a
      // freshly-renamed root), `null` clears the id and the user sees the
      // dropdown's selected name as the cached display fallback until the
      // next scan resolves it.
      await safeInvoke('update_skill_metadata', {
        skillId: id,
        category,
        categoryId: newCategoryId === undefined ? null : newCategoryId,
      });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        skills: state.skills.map((s) =>
          s.id === id ? { ...s, category: oldCategory, categoryId: oldCategoryId } : s,
        ),
        error: message,
      }));
    }
  },

  updateSkillTags: async (id, tags) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot update skill tags in browser mode');
      return;
    }

    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    const oldTags = skill.tags;

    // Optimistic update
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, tags } : s)),
    }));

    try {
      await safeInvoke('update_skill_metadata', {
        skillId: id,
        tags,
      });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        skills: state.skills.map((s) => (s.id === id ? { ...s, tags: oldTags } : s)),
        error: message,
      }));
    }
  },

  updateSkillIcon: async (id, icon) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot update skill icon in browser mode');
      return;
    }

    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    const oldIcon = skill.icon;

    // Optimistic update
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, icon } : s)),
    }));

    try {
      await safeInvoke('update_skill_metadata', {
        skillId: id,
        icon,
      });
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        skills: state.skills.map((s) => (s.id === id ? { ...s, icon: oldIcon } : s)),
        error: message,
      }));
    }
  },

  updateSkillScope: async (id, scope) => {
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot update skill scope in browser mode');
      return;
    }

    const skill = get().skills.find((s) => s.id === id);
    if (!skill) return;

    const oldScope = skill.scope;

    // Optimistic update
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, scope } : s)),
    }));

    const { skillSourceDir, claudeConfigDir } = useSettingsStore.getState();

    try {
      await safeInvoke('update_skill_scope', {
        skillId: id,
        scope,
        ensembleDir: skillSourceDir.replace('/skills', ''),
        claudeConfigDir,
      });
      // Re-scan so the displayed scope reflects derived filesystem state
      // rather than just the optimistic value. Without this, a switch
      // that hit a backend edge case (e.g. ~/.claude/skills/<name>
      // already exists as a non-symlink directory — see import.rs
      // "Target path exists and is not a symlink") would show success
      // in the UI while the filesystem disagrees on the next scan.
      await get().loadSkills();
    } catch (error) {
      // Rollback on error
      const message = typeof error === 'string' ? error : String(error);
      set((state) => ({
        skills: state.skills.map((s) => (s.id === id ? { ...s, scope: oldScope } : s)),
        error: message,
      }));
    }
  },

  setFilter: (filter) => {
    const currentFilter = get().filter;
    set({ filter: { ...currentFilter, ...filter } });
  },

  clearFilter: () => set({ filter: initialFilter }),

  clearError: () => set({ error: null }),

  autoClassify: async (scope?: ClassifyScope) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot auto-classify in browser mode');
      set({ error: 'Auto-classification is not available in browser mode' });
      return;
    }

    const { skills } = get();
    const { categories, tags } = useAppStore.getState();

    // Apply scope filter when provided. `categoryIds` is a Set of id strings
    // (caller has already expanded descendants for hierarchical categories);
    // `tagId` matches against the skill's tags array. Items must satisfy
    // every provided field. Dual-read on category: prefer `categoryId`,
    // fall back to the legacy name match against `category` (same logic
    // as `CategoryPage`'s filteredData).
    const tagNameById = new Map(tags.map((t) => [t.id, t.name]));
    const targetTagName = scope?.tagId ? tagNameById.get(scope.tagId) : undefined;
    const categoryNameSet = scope?.categoryIds
      ? new Set(categories.filter((c) => scope.categoryIds!.has(c.id)).map((c) => c.name))
      : undefined;
    const skillsToClassify = skills.filter((s) => {
      if (scope?.categoryIds) {
        const match = s.categoryId
          ? scope.categoryIds.has(s.categoryId)
          : (categoryNameSet?.has(s.category) ?? false);
        if (!match) return false;
      }
      if (targetTagName !== undefined && !s.tags.includes(targetTagName)) {
        return false;
      }
      return true;
    });

    if (skillsToClassify.length === 0) {
      set({ error: scope ? 'No skills to classify in this scope.' : 'No skills to classify.' });
      return;
    }

    set({ isClassifying: true, classifySuccess: false, error: null });

    try {
      // Prepare skills for classification.
      //
      // `instructions` (the SKILL.md body) is intentionally omitted. Sending
      // the body for every skill in a single prompt pushes the request past
      // Sonnet's 200K context window on libraries of ~50+ skills (the user
      // reported a real `Prompt is too long` failure). The frontmatter
      // `description` already encodes the trigger words a classifier needs;
      // empirical comparison on a 20-skill panel showed description-only
      // produces equal-or-better category accuracy than the full body.
      // See `.dev/auto-classify-context-overflow/05_recommendation.md`.
      const items: ClassifyItem[] = skillsToClassify.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      }));

      // Existing categories carry hierarchy (parentName) so the model
      // can see which roots already have sub-categories and propose new
      // ones intelligently — see classify.rs build_classification_prompt.
      const existingCategories = buildExistingCategoriesPayload(categories);
      const existingTags = tags.map((t) => t.name);

      // Call backend with available icons
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

      // Create the new categories and tags the results imply. Sub-cats
      // (results with `suggested_parent_category`) are created with the
      // proper parentId so they appear nested in the sidebar without
      // any manual move. Returns name → id map for the dual-write below.
      const { addCategory, addTag, loadCategories, loadTags } = useAppStore.getState();
      const categoryIdByName = await applyClassifyResultsToCategories(
        results,
        categories,
        tags,
        addCategory,
        addTag,
      );

      // Apply classification results
      for (const result of results) {
        const skill = skills.find((s) => s.id === result.id);
        if (skill) {
          const resolvedCategoryId = categoryIdByName.get(result.suggested_category) ?? null;
          // Update category, tags, and icon. Pass categoryId as a wrapped
          // option so the backend's three-state Option<Option<String>>
          // mutator interprets it as "set this field" (outer Some, inner
          // value), not "do not modify" (outer None).
          await safeInvoke('update_skill_metadata', {
            skillId: result.id,
            category: result.suggested_category,
            categoryId: resolvedCategoryId,
            tags: result.suggested_tags,
            icon: result.suggested_icon,
          });
        }
      }

      // Reload categories, tags, and skills to get updated data
      await Promise.all([loadCategories(), loadTags(), get().loadSkills()]);
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

  loadUsageStats: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('SkillsStore: Cannot load usage stats in browser mode');
      return;
    }

    const { claudeConfigDir } = useSettingsStore.getState();
    set({ isLoadingUsage: true });

    try {
      const stats = await safeInvoke<UsageStats>('scan_usage_stats', {
        claudeDir: claudeConfigDir || '~/.claude',
      });

      if (stats && stats.skills) {
        set({ usageStats: stats.skills, isLoadingUsage: false });
      } else {
        set({ usageStats: {}, isLoadingUsage: false });
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to load usage stats:', error);
      set({ usageStats: {}, isLoadingUsage: false, error: message });
    }
  },

  // Computed
  getFilteredSkills: () => {
    const { skills, filter } = get();
    let filtered = [...skills];

    // Search filter
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      filtered = filtered.filter(
        (skill) =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description.toLowerCase().includes(searchLower),
      );
    }

    // Category filter
    if (filter.category) {
      filtered = filtered.filter((skill) => skill.category === filter.category);
    }

    // Tags filter
    if (filter.tags.length > 0) {
      filtered = filtered.filter((skill) => filter.tags.some((tag) => skill.tags.includes(tag)));
    }

    // Sort: plugin-imported skills at the bottom
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
    const { skills } = get();
    return skills.filter((skill) => skill.enabled).length;
  },

  getSelectedSkill: () => {
    const { skills, selectedSkillId } = get();
    return skills.find((skill) => skill.id === selectedSkillId);
  },
}));
