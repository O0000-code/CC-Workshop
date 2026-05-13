import { useState, useEffect, useMemo, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import ContextMenu from '../common/ContextMenu';
import { LauncherModal } from '../launcher';
import { MarketplaceShortcutBanner } from '../marketplace/MarketplaceShortcutBanner';
import { AddToScenePopover } from '../marketplace/AddToScenePopover';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSkillsStore } from '@/stores/skillsStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useClaudeMdStore } from '@/stores/claudeMdStore';
import { useRulesStore } from '@/stores/rulesStore';
import { useScenesStore } from '@/stores/scenesStore';
import { useProjectsStore } from '@/stores/projectsStore';
import { useImportStore } from '@/stores/importStore';
import { useLauncherStore } from '@/stores/launcherStore';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { Pencil, Trash2, Loader2, ArrowUp } from 'lucide-react';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import type { Category, Tag } from '@/types';
import { collectDescendantIds } from '@/utils/categoryTree';

// Module-level flags to prevent duplicate launch processing
// These persist across React component remounts (unlike refs which can be reset by StrictMode)
let hasProcessedLaunchArgsGlobal = false;
// Track the last processed event to prevent duplicate handling from multiple listeners
let lastProcessedEventTime = 0;
const EVENT_DEBOUNCE_MS = 1000; // Ignore duplicate events within 1 second

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    activeCategory,
    activeTags,
    categories,
    tags,
    setActiveCategory,
    toggleActiveTag,
    initApp,
    // Editing state
    editingCategoryId,
    isAddingCategory,
    editingTagId,
    isAddingTag,
    // Editing actions
    startEditingCategory,
    stopEditingCategory,
    startAddingCategory,
    stopAddingCategory,
    startEditingTag,
    stopEditingTag,
    startAddingTag,
    stopAddingTag,
    // CRUD actions
    addCategory,
    updateCategory,
    deleteCategory,
    addTag,
    updateTag,
    deleteTag,
    // Reorder actions
    reorderCategories,
    reorderTags,
    // Hierarchy: move a Category to a new parent (or root via null).
    // Used by SortableCategoriesList drop-into to commit parent_id changes
    // before the follow-up reorder is computed (per 03 V2 §5.7 / P0-ARCH-3).
    moveCategoryToParent,
    // V2.2 D4 (2026-05-08): atomic merge of setCategoryParent + reorder.
    // Used by promote-with-position (child→root) to avoid the intermediate
    // React frame that violates useSortable's 50 ms cascade window
    // (sortable.esm.js:565-579) — see _synthesis_decisions D4.
    moveCategoryToParentAtPosition,
  } = useAppStore();

  const { loadSettings, hasCompletedImport } = useSettingsStore();
  const { skills, loadSkills, setFilter: setSkillsFilter } = useSkillsStore();
  const { mcpServers, loadMcps, setFilter: setMcpsFilter } = useMcpsStore();
  const { files: claudeMdFiles, loadFiles: loadClaudeMdFiles } = useClaudeMdStore();
  const { rules, loadRules } = useRulesStore();
  const { scenes, loadScenes } = useScenesStore();
  const { projects, loadProjects } = useProjectsStore();
  const { detectExistingConfig } = useImportStore();
  const {
    isOpen: isLauncherOpen,
    folderPath: launcherFolderPath,
    closeLauncher,
  } = useLauncherStore();

  // Track banner visibility at the layout level so we can conditionally
  // render the padded wrapper. Subscribing here only re-renders MainLayout
  // when the boolean flips — much cheaper than subscribing inside the
  // banner component and re-rendering the layout for unrelated state.
  const isShortcutBannerVisible = useMarketplaceStore((s) => s.shortcutBannerState.visible);

  // Dynamically calculate navigation counts
  const navCounts = useMemo(
    () => ({
      skills: skills.length,
      mcpServers: mcpServers.length,
      claudeMd: claudeMdFiles.length,
      rules: rules.length,
      scenes: scenes.length,
      projects: projects.length,
    }),
    [
      skills.length,
      mcpServers.length,
      claudeMdFiles.length,
      rules.length,
      scenes.length,
      projects.length,
    ],
  );

  // Dynamically calculate category counts from skills, mcps, and claudeMd files.
  // D8=B (per `.dev/category-hierarchy/01_research/_synthesis_decisions.md` §2.1):
  // a parent category's count = self-count + sum of every descendant's self-count.
  // Leaf categories continue to count only their own items.
  // dual-read aggregation: prefer `categoryId` (canonical SoT post-migration),
  // fall back to `category` name during the V1 hierarchy migration window so
  // unmigrated entries still show up under their cached category name.
  const categoriesWithCounts = useMemo(() => {
    return categories.map((cat) => {
      const idSet = collectDescendantIds(cat.id, categories);
      const nameSet = new Set(categories.filter((c) => idSet.has(c.id)).map((c) => c.name));
      return {
        ...cat,
        count:
          skills.filter((s) => (s.categoryId ? idSet.has(s.categoryId) : nameSet.has(s.category)))
            .length +
          mcpServers.filter((m) =>
            m.categoryId ? idSet.has(m.categoryId) : nameSet.has(m.category),
          ).length +
          claudeMdFiles.filter((f) => f.categoryId !== undefined && idSet.has(f.categoryId))
            .length +
          rules.filter((r) => r.categoryId !== undefined && idSet.has(r.categoryId)).length,
      };
    });
  }, [categories, skills, mcpServers, claudeMdFiles, rules]);

  // Dynamically calculate tag counts from skills, mcps, claudeMd, and rules
  const tagsWithCounts = useMemo(() => {
    return tags.map((tag) => ({
      ...tag,
      count:
        skills.filter((s) => s.tags?.includes(tag.name)).length +
        mcpServers.filter((m) => m.tags?.includes(tag.name)).length +
        claudeMdFiles.filter((f) => f.tagIds?.includes(tag.id)).length +
        rules.filter((r) => r.tagIds?.includes(tag.id)).length,
    }));
  }, [tags, skills, mcpServers, claudeMdFiles, rules]);

  // Smart launch path handler - checks if project exists and has scene
  const handleLaunchPath = useCallback(async (path: string) => {
    // Normalize path by removing trailing slash
    const normalizedPath = path.replace(/\/$/, '');

    // Get current projects from store
    const currentProjects = useProjectsStore.getState().projects;
    const existingProject = currentProjects.find(
      (p) => p.path.replace(/\/$/, '') === normalizedPath,
    );

    // Check if project exists AND has a non-empty sceneId
    const hasScene =
      existingProject && existingProject.sceneId && existingProject.sceneId.trim() !== '';

    if (hasScene) {
      // Project exists and has scene - sync config and launch terminal directly (no UI needed)
      try {
        // Get terminal settings
        const { terminalApp, claudeCommand, warpOpenMode } = useSettingsStore.getState();

        // Sync project configuration first
        await useProjectsStore.getState().syncProject(existingProject.id);

        // Launch terminal with Claude
        await safeInvoke('launch_claude_for_folder', {
          folderPath: normalizedPath,
          terminalApp: terminalApp || 'Terminal',
          claudeCommand: claudeCommand || 'claude',
          warpOpenMode: warpOpenMode || 'window',
        });
      } catch (error) {
        const errorStr = String(error);
        console.error('[handleLaunchPath] Error:', errorStr);

        // Check if it's an accessibility permission error
        if (errorStr.includes('ACCESSIBILITY_PERMISSION_REQUIRED')) {
          await focusWindow();
          // Show permission alert and open System Settings
          const shouldOpen = window.confirm(
            'To open terminal sessions with automation, please grant Accessibility permission to Ensemble.\n\n' +
              'Steps:\n' +
              '1. Click OK to open System Settings → Accessibility\n' +
              '2. Click the "+" button\n' +
              '3. Navigate to /Applications and select Ensemble.app\n' +
              '4. Enable the checkbox for Ensemble\n\n' +
              'This is needed when Ensemble asks a terminal app to open a tab/window and run the launch command.',
          );
          if (shouldOpen) {
            await safeInvoke('open_accessibility_settings', {});
          }
        } else {
          // Fall back to opening launcher on error - need to show window
          await focusWindow();
          useLauncherStore.getState().openLauncher(normalizedPath);
        }
      }
    } else {
      // Project doesn't exist or has no scene - need to show launcher modal
      await focusWindow();
      useLauncherStore.getState().openLauncher(normalizedPath);
    }
  }, []);

  // Helper to focus the main window when UI needs to be shown
  // Uses Rust command for more reliable window activation on macOS
  const focusWindow = async () => {
    if (!isTauri()) return;
    try {
      // Use Rust command which is more reliable for bringing background apps to front on macOS
      await safeInvoke('bring_window_to_front', {});
    } catch (e) {
      console.error('Failed to focus window:', e);
    }
  };

  // Initialize app data on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        setIsInitializing(true);
        setInitError(null);

        // In browser mode, skip data loading but allow UI preview
        if (!isTauri()) {
          console.warn(
            'Running in browser mode - Tauri API not available. Using empty data for UI preview.',
          );
          setIsInitializing(false);
          return;
        }

        // Load settings first (needed by other stores)
        await loadSettings();

        // Initialize app data (categories, tags)
        await initApp();

        // Load all data in parallel
        await Promise.all([
          loadSkills(),
          loadMcps(),
          loadClaudeMdFiles(),
          loadRules(),
          loadScenes(),
          loadProjects(),
        ]);

        setIsInitializing(false);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setInitError(String(error));
        setIsInitializing(false);
      }
    };

    initialize();
  }, []);

  // Sync Category/Tag filter state from appStore to skillsStore and mcpsStore
  useEffect(() => {
    setSkillsFilter({ category: activeCategory, tags: activeTags });
    setMcpsFilter({ category: activeCategory, tags: activeTags });
  }, [activeCategory, activeTags, setSkillsFilter, setMcpsFilter]);

  // First-time import detection - only run after initialization is complete
  useEffect(() => {
    // Skip in non-Tauri environment or if still initializing
    if (!isTauri() || isInitializing) return;

    // If import has not been completed, detect existing config
    if (!hasCompletedImport) {
      detectExistingConfig();
    }
  }, [hasCompletedImport, isInitializing, detectExistingConfig]);

  // Check for launch arguments (from Finder Quick Action)
  useEffect(() => {
    if (!isTauri() || isInitializing) return;

    // Prevent duplicate execution (React StrictMode causes effects to run twice in dev mode)
    // Using module-level variable because it persists across component remounts
    if (hasProcessedLaunchArgsGlobal) return;
    hasProcessedLaunchArgsGlobal = true;

    const checkLaunchArgs = async () => {
      try {
        const args = await safeInvoke<string[]>('get_launch_args');

        if (args && args.length > 0) {
          const launchIndex = args.indexOf('--launch');
          if (launchIndex !== -1 && args[launchIndex + 1]) {
            const path = args[launchIndex + 1];
            // Use smart launch handler instead of directly opening launcher
            await handleLaunchPath(path);
          }
        }
      } catch (e) {
        // Expected when no launch args provided
      }
    };

    checkLaunchArgs();
  }, [isInitializing, handleLaunchPath]);

  // Listen for second instance launch events (when app is already running)
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      unlisten = await listen<string>('second-instance-launch', async (event) => {
        const path = event.payload;
        const now = Date.now();

        // Debounce: ignore duplicate events within the debounce window
        // This handles the case where StrictMode registers multiple listeners in dev mode
        if (now - lastProcessedEventTime < EVENT_DEBOUNCE_MS) {
          return;
        }
        lastProcessedEventTime = now;

        await handleLaunchPath(path);
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [handleLaunchPath]);

  // Register Marketplace Tauri event listeners exactly once. The store's
  // `initEventListeners` returns a single composite unlisten which we hold
  // across the lifecycle; on unmount the registered backend listeners are
  // released (subsequent mounts re-register, which is correct under
  // StrictMode because the in-flight Promise short-circuits to a no-op).
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;
    useMarketplaceStore
      .getState()
      .initEventListeners()
      .then((fn) => {
        if (cancelled) {
          // Already unmounted — invoke the unlisten immediately so we
          // don't leave orphan listeners registered.
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((err) => {
        console.error('Failed to register marketplace event listeners:', err);
      });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Context menu state - Category
  const [contextMenu, setContextMenu] = useState<{
    category: Category;
    position: { x: number; y: number };
  } | null>(null);

  // Context menu state - Tag
  const [tagContextMenu, setTagContextMenu] = useState<{
    tag: Tag;
    position: { x: number; y: number };
  } | null>(null);

  // Parse Category/Tag from URL path
  const categoryMatch = location.pathname.match(/^\/category\/(.+)$/);
  const tagMatch = location.pathname.match(/^\/tag\/(.+)$/);

  const currentCategoryId = categoryMatch ? decodeURIComponent(categoryMatch[1]) : null;
  const currentTagId = tagMatch ? decodeURIComponent(tagMatch[1]) : null;

  // Determine active nav from current route
  // Category/Tag pages don't highlight any main nav item (return null equivalent by using 'skills' but Sidebar won't highlight it)
  const getActiveNav = ():
    | 'skills'
    | 'mcp-servers'
    | 'claude-md'
    | 'rules'
    | 'scenes'
    | 'projects'
    | 'settings'
    | 'marketplace-skills'
    | 'marketplace-mcps'
    | null => {
    const path = location.pathname;
    // Category/Tag pages - don't highlight main nav
    if (path.startsWith('/category/') || path.startsWith('/tag/')) return null;
    // Marketplace pages — match BEFORE the generic skills / mcp-servers
    // checks below, since their paths share no overlap but the ordering
    // here mirrors the Sidebar's own visual ordering (Marketplace above
    // Navigation, Navigation above Settings).
    if (path.startsWith('/marketplace-skills')) return 'marketplace-skills';
    if (path.startsWith('/marketplace-mcps')) return 'marketplace-mcps';
    if (path.startsWith('/skills')) return 'skills';
    if (path.startsWith('/mcp-servers')) return 'mcp-servers';
    if (path.startsWith('/claude-md')) return 'claude-md';
    if (path.startsWith('/rules')) return 'rules';
    if (path.startsWith('/scenes')) return 'scenes';
    if (path.startsWith('/projects')) return 'projects';
    if (path.startsWith('/settings')) return 'settings';
    return 'skills';
  };

  const handleNavChange = (nav: string) => {
    navigate(`/${nav}`);
  };

  const handleCategoryContextMenu = (category: Category, position: { x: number; y: number }) => {
    setContextMenu({ category, position });
  };

  // Category handlers
  const handleAddCategory = () => {
    startAddingCategory();
  };

  const handleCategoryDoubleClick = (categoryId: string) => {
    startEditingCategory(categoryId);
  };

  const handleCategorySave = async (id: string | null, name: string) => {
    try {
      if (id) {
        // Edit mode
        await updateCategory(id, name);
      } else {
        // Add mode - use default color
        await addCategory(name, '#A1A1AA');
      }
      stopEditingCategory();
      stopAddingCategory();
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleCategoryEditCancel = () => {
    stopEditingCategory();
    stopAddingCategory();
  };

  // 处理分类颜色变更
  const handleCategoryColorChange = async (categoryId: string, color: string) => {
    try {
      await updateCategory(categoryId, undefined, color);
    } catch (error) {
      console.error('Failed to update category color:', error);
    }
  };

  const handleRenameCategory = () => {
    if (contextMenu?.category) {
      startEditingCategory(contextMenu.category.id);
    }
    setContextMenu(null);
  };

  // P0-2 (per 02 V2 §2.20 + 03 V2 §6.3.4): Promote-to-root via ContextMenu.
  // Equivalent to keyboard `Space + ←` while a child row is lifted, or to a
  // mouse drag with `dragOffset.x ≤ -12` + 80 ms dwell. Only meaningful when
  // the right-clicked category is a child (parentId set).
  const handlePromoteToRoot = useCallback(async () => {
    if (contextMenu?.category?.parentId) {
      try {
        await moveCategoryToParent(contextMenu.category.id, null);
      } catch (e) {
        console.error('Failed to promote category to root:', e);
      }
    }
    setContextMenu(null);
  }, [contextMenu, moveCategoryToParent]);

  // P0-3 (per 02 V2 §2.21 + acceptance #26): when deleting a parent that
  // currently has ≥ 1 children, surface a confirmation dialog before the
  // backend cascade-promotes the children. The dialog text is locked by
  // _v2_patch_plan §3.6 — keep verbatim. No-children categories delete
  // directly (V3-compatible behaviour, no UX regression).
  //
  // Dialog channel: `window.confirm` (macOS-friendly, single-shot, blocking).
  // Spec §2.21 line 617 explicitly accepts this as the fallback when a
  // Tauri-native NSAlert is not wired up. The Cancel button maps to `false`
  // and short-circuits without touching backend state.
  const handleDeleteCategory = async () => {
    if (!contextMenu?.category) return;
    const cat = contextMenu.category;

    const childCount = categories.filter((c) => c.parentId === cat.id).length;
    if (childCount > 0) {
      const word = childCount === 1 ? 'sub-category' : 'sub-categories';
      const ok = window.confirm(
        `Delete '${cat.name}'?\n\n` +
          `${cat.name} contains ${childCount} ${word}. Sub-categories will be promoted to root level. This cannot be undone.`,
      );
      if (!ok) {
        setContextMenu(null);
        return;
      }
    }

    try {
      await deleteCategory(cat.id);
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
    setContextMenu(null);
  };

  // Tag handlers
  const handleAddTag = () => {
    startAddingTag();
  };

  const handleTagDoubleClick = (tagId: string) => {
    startEditingTag(tagId);
  };

  const handleTagContextMenu = (tag: Tag, position: { x: number; y: number }) => {
    setTagContextMenu({ tag, position });
  };

  const handleRenameTag = () => {
    if (tagContextMenu?.tag) {
      startEditingTag(tagContextMenu.tag.id);
    }
    setTagContextMenu(null);
  };

  const handleDeleteTag = async () => {
    if (tagContextMenu?.tag) {
      try {
        await deleteTag(tagContextMenu.tag.id);
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    }
    setTagContextMenu(null);
  };

  const handleTagSave = async (id: string | null, name: string) => {
    try {
      if (id) {
        // Edit mode
        await updateTag(id, name);
      } else {
        // Add mode
        await addTag(name);
      }
      stopEditingTag();
      stopAddingTag();
    } catch (error) {
      console.error('Failed to save tag:', error);
    }
  };

  const handleTagEditCancel = () => {
    stopEditingTag();
    stopAddingTag();
  };

  // Handle refresh - reload all data
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || !isTauri()) return;

    setIsRefreshing(true);
    try {
      await Promise.all([
        initApp(),
        loadSkills(),
        loadMcps(),
        loadClaudeMdFiles(),
        loadRules(),
        loadScenes(),
        loadProjects(),
      ]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    isRefreshing,
    initApp,
    loadSkills,
    loadMcps,
    loadClaudeMdFiles,
    loadRules,
    loadScenes,
    loadProjects,
  ]);

  // Reorder handlers - delegate to store actions (which perform optimistic update + IPC + fallback)
  // 2026-05-04: pass through directly so the caller's try/catch can observe
  // rejections. The store's Stage-2 catch already handles fallback; the
  // outer try/catch in handleDragEnd uses the rejection only as a signal to
  // skip downstream work.
  const handleReorderCategories = useCallback(
    (orderedIds: string[]) => reorderCategories(orderedIds),
    [reorderCategories],
  );

  const handleReorderTags = useCallback(
    (orderedIds: string[]) => reorderTags(orderedIds),
    [reorderTags],
  );

  // Hierarchy drop-into handler: commits a parent_id change for a Category and
  // returns a Promise so SortableCategoriesList.handleDragEnd can `await` it
  // before re-reading fresh `categories` state to compute the follow-up
  // reorder payload (per 03 V2 §5.7 / P0-ARCH-3 — serial double-IPC).
  //
  // 2026-05-04 fix: do NOT swallow the rejection via try/catch — propagate
  // the Promise rejection so SortableCategoriesList.handleDragEnd's own
  // try/catch can react (skip the follow-up reorder). The previous swallow
  // hid IPC failures from the caller while the appStore had already reverted
  // the optimistic state, producing the "弹回" (snap-back) symptom.
  const handleSetCategoryParent = useCallback(
    (id: string, newParentId: string | null) => moveCategoryToParent(id, newParentId),
    [moveCategoryToParent],
  );

  // V2.2 D4: promote-with-position handler. SortableCategoriesList's
  // handleDragEnd dispatches here when an old child crosses out of its
  // original parent's subtree AND a target slot is known (localOverId !==
  // null). Wraps the store action so the outer try/catch in handleDragEnd
  // can react to rejection (skip downstream work). Atomic optimistic +
  // queued double-IPC fallback live inside `appStore.moveCategoryToParentAtPosition`.
  const handleMoveCategoryToParentAtPosition = useCallback(
    (id: string, newParentId: string | null, newOrderedIds: string[]) =>
      moveCategoryToParentAtPosition(id, newParentId, newOrderedIds),
    [moveCategoryToParentAtPosition],
  );

  // V3 R-P0-2: when editing/adding, return early without clearing input state.
  // Read editing flags via getState() so callback identity stays stable across renders.
  const handleDragStart = useCallback(() => {
    const s = useAppStore.getState();
    if (s.editingCategoryId || s.isAddingCategory || s.editingTagId || s.isAddingTag) {
      return;
    }
    setContextMenu(null);
    setTagContextMenu(null);
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Show loading state during initialization
  if (isInitializing) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-500">Loading Ensemble...</p>
        </div>
      </div>
    );
  }

  // Show error state if initialization failed
  if (initError) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-red-500 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-zinc-900">Failed to Load</h2>
          <p className="text-sm text-zinc-500">{initError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-zinc-900 rounded-md hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-screen w-screen overflow-hidden bg-white">
      {/* Browser Preview Mode Banner */}
      {!isTauri() && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center flex-shrink-0">
          <p className="text-xs text-amber-700">
            Browser Preview Mode — Run{' '}
            <code className="bg-amber-100 px-1 rounded">npm run tauri dev</code> for full
            functionality
          </p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeNav={getActiveNav()}
          activeCategory={currentCategoryId || activeCategory}
          activeTags={currentTagId ? [currentTagId] : activeTags}
          categories={categoriesWithCounts}
          tags={tagsWithCounts}
          counts={navCounts}
          onNavChange={handleNavChange}
          onCategoryChange={setActiveCategory}
          onTagToggle={toggleActiveTag}
          onCategoryContextMenu={handleCategoryContextMenu}
          onCategoryColorChange={handleCategoryColorChange}
          // Add/Edit handlers
          onAddCategory={handleAddCategory}
          onAddTag={handleAddTag}
          editingCategoryId={editingCategoryId}
          isAddingCategory={isAddingCategory}
          editingTagId={editingTagId}
          isAddingTag={isAddingTag}
          onCategoryDoubleClick={handleCategoryDoubleClick}
          onCategorySave={handleCategorySave}
          onCategoryEditCancel={handleCategoryEditCancel}
          onTagDoubleClick={handleTagDoubleClick}
          onTagContextMenu={handleTagContextMenu}
          onTagSave={handleTagSave}
          onTagEditCancel={handleTagEditCancel}
          // Refresh
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          // Drag-and-drop reorder
          onReorderCategories={handleReorderCategories}
          onReorderTags={handleReorderTags}
          onSetCategoryParent={handleSetCategoryParent}
          onMoveCategoryToParentAtPosition={handleMoveCategoryToParentAtPosition}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          isDragging={isDragging}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Marketplace install short-cut banner — floating toast in the
          viewport's bottom-right corner. Originally rendered inline at the
          top of <main> as a horizontal banner, but inline rendering pushed
          the PageHeader down ~48px the moment it appeared (and snapped
          back when it dismissed), which was visually jarring whenever the
          user installed a Skill / MCP and returned to a Marketplace page.
          Floating fixed-position keeps the underlying page layout stable
          while still surfacing the install actions ("View in Skills →" /
          "Add to active Scene") prominently. Visibility is still driven by
          `marketplaceStore.shortcutBannerState.visible` — install actions
          raise it, `dismissShortcutBanner` / navigation tear down. */}
      {isShortcutBannerVisible && (
        <div
          className="fixed bottom-6 right-6 z-50 rounded-lg"
          style={{
            width: 'min(640px, calc(100vw - 48px))',
            boxShadow: 'var(--shadow-dropdown)',
          }}
        >
          <MarketplaceShortcutBanner />
        </div>
      )}

      {/* Add-to-Scene popover — portal-rendered, anchored to its triggerRect.
          Lives at the layout level so the popover survives mid-flow page
          navigation that originates inside it (currently none, but future
          additions inside the popover would benefit). */}
      <AddToScenePopover />

      {/* Category Context Menu — per 02 V2 §2.20: child rows additionally
          show "Promote to root" between Rename and Delete. Root rows
          (no parentId) only see Rename + Delete. */}
      {contextMenu && (
        <ContextMenu
          items={[
            ...(contextMenu.category.parentId
              ? [
                  {
                    label: 'Promote to Root',
                    icon: <ArrowUp size={14} />,
                    onClick: handlePromoteToRoot,
                  },
                ]
              : []),
            {
              label: 'Rename',
              icon: <Pencil size={14} />,
              onClick: handleRenameCategory,
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} />,
              onClick: handleDeleteCategory,
              danger: true,
            },
          ]}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Tag Context Menu */}
      {tagContextMenu && (
        <ContextMenu
          items={[
            {
              label: 'Rename',
              icon: <Pencil size={14} />,
              onClick: handleRenameTag,
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} />,
              onClick: handleDeleteTag,
              danger: true,
            },
          ]}
          position={tagContextMenu.position}
          onClose={() => setTagContextMenu(null)}
        />
      )}

      {/* Launcher Modal for Finder Quick Action */}
      <LauncherModal
        isOpen={isLauncherOpen}
        folderPath={launcherFolderPath}
        onClose={closeLauncher}
      />
    </div>
  );
}
