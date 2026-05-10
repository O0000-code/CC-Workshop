import { create } from 'zustand';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Scene } from '@/types';
import type {
  ConflictAction,
  InstallOutcome,
  MarketplaceCatalogEnhancedEvent,
  MarketplaceClassifyFailedEvent,
  MarketplaceClassifyResultEvent,
  MarketplaceMcpItem,
  MarketplaceScrapeDegradedEvent,
  MarketplaceSkillItem,
  MarketplaceStaleCacheEvent,
  MarketplaceUpstreamErrorEvent,
  TrashedItemBrief,
} from '@/types/marketplace';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { useSkillsStore } from './skillsStore';
import { useMcpsStore } from './mcpsStore';
import { useScenesStore } from './scenesStore';
import { useTrashStore } from './trashStore';

// ============================================================================
// Marketplace Store (V2.0)
// ============================================================================
// Centralizes catalog data + per-item progress + collision/short-cut UI state
// for the V2 Marketplace pages. Cross-store contract:
//
// - Catalog data: read from backend IPC `list_marketplace_skills` /
//   `list_marketplace_mcps`; cached locally in this store. The 24h cache
//   sits on the Rust side under `~/.ensemble/marketplace-cache/`.
// - Install completes → trigger `useSkillsStore.loadSkills()` /
//   `useMcpsStore.loadMcps()` to keep SSoT in sync (spec §6.4 / R4 §10.4).
// - "Already installed?" is computed by deriving from `useSkillsStore.skills` /
//   `useMcpsStore.mcpServers` (spec §6.3 / §11.2). Never cache an
//   `installedSet` here — the SSoT lives in the domain stores.
// - Tauri event listeners are registered exactly once via
//   `initEventListeners`, called from `MainLayout`.
//
// Conventions:
// - All Set<string> mutations create a new Set instance (`new Set([...prev, id])`)
//   so zustand picks up the change (mutating in place is silently dropped).
// - All install entry-points ensure `useTrashStore.trashedItems` is loaded
//   before colliding — otherwise a previously deleted item can be missed
//   on first install attempt (R4 §6.2).
// - Set defaults that are not user-interactive use the spec-mandated wire
//   format (camelCase) so the wire is the source of truth.

// ----- Filter / sort -------------------------------------------------------

type MarketplaceSort = 'popularity' | 'alphabet' | 'updated';

interface MarketplaceFilter {
  search: string;
  categoryId: string | null;
  tags: string[];
  sort: MarketplaceSort;
}

const initialFilter: MarketplaceFilter = {
  search: '',
  categoryId: null,
  tags: [],
  sort: 'popularity',
};

// ----- UI state shapes -----------------------------------------------------

export interface MarketplaceCollisionModalState {
  open: boolean;
  item: MarketplaceSkillItem | MarketplaceMcpItem | null;
  itemType: 'skill' | 'mcp' | null;
  hasLocal: boolean;
  hasTrashed?: TrashedItemBrief;
}

const initialCollisionModalState: MarketplaceCollisionModalState = {
  open: false,
  item: null,
  itemType: null,
  hasLocal: false,
  hasTrashed: undefined,
};

export interface MarketplaceShortcutBannerState {
  visible: boolean;
  itemType: 'skill' | 'mcp' | null;
  /** Local id (Skill.id / mcp id) of the just-installed resource. */
  targetItemId: string | null;
  /** Resolved active Scene at the moment the banner was raised. Captured
   * here (not derived live) so dismissing the banner is independent of
   * Scene changes that may have happened in the meantime. */
  activeSceneId: string | null;
  activeSceneName: string | null;
}

const initialShortcutBannerState: MarketplaceShortcutBannerState = {
  visible: false,
  itemType: null,
  targetItemId: null,
  activeSceneId: null,
  activeSceneName: null,
};

export interface MarketplaceAddToScenePopoverState {
  open: boolean;
  /** Local id of the resource being added; mirrors banner's `targetItemId`. */
  targetItemId: string | null;
  itemType: 'skill' | 'mcp' | null;
  /** Scene ids that already contain this resource at popover open time —
   * used to render initial checkbox state and to compute the diff on Save. */
  initialSelectedSceneIds: string[];
  /** Anchor rect for popover positioning (captured client-side, not
   * round-tripped). Optional because some triggers may not carry one. */
  triggerRect?: DOMRect;
}

const initialAddToScenePopoverState: MarketplaceAddToScenePopoverState = {
  open: false,
  targetItemId: null,
  itemType: null,
  initialSelectedSceneIds: [],
  triggerRect: undefined,
};

// ----- Store interface -----------------------------------------------------

export interface MarketplaceState {
  // Catalog data
  skillsCatalog: MarketplaceSkillItem[];
  mcpsCatalog: MarketplaceMcpItem[];
  /** ISO timestamp of the most recent successful catalog sync. */
  lastSyncedSkills?: string;
  lastSyncedMcps?: string;
  /** Set when the backend serves stale (>24h) cache as a fallback. The
   * Marketplace page renders an amber "Last synced N hours ago" hint. */
  staleCacheSkills?: { ageHours: number };
  staleCacheMcps?: { ageHours: number };

  // Loading / upstream errors
  isLoadingSkills: boolean;
  isLoadingMcps: boolean;
  upstreamErrorSkills: string | null;
  upstreamErrorMcps: string | null;

  // Per-item progress (cross-view persistence; keyed by upstream item id)
  installingItemIds: Set<string>;
  installFailedItems: Record<string, { error: string; attemptedAt: string }>;
  classifyingItemIds: Set<string>;
  classifyFailedItemIds: Set<string>;

  // Filters
  skillsFilter: MarketplaceFilter;
  mcpsFilter: MarketplaceFilter;

  // Selection (drives SlidePanel detail)
  selectedSkillItemId: string | null;
  selectedMcpItemId: string | null;

  // Collision Modal (single instance shared across both pages)
  collisionModalState: MarketplaceCollisionModalState;

  // Install short-cut banner (D-Imp-6)
  shortcutBannerState: MarketplaceShortcutBannerState;

  // Add-to-Scene popover (D-Imp-6 / spec §6.1)
  addToScenePopoverState: MarketplaceAddToScenePopoverState;

  // Onboarding banner dismissal (per-kind)
  onboardingDismissedSkills: boolean;
  onboardingDismissedMcps: boolean;

  // ---- Actions ----

  // Catalog
  loadSkillsCatalog: (refresh?: boolean) => Promise<void>;
  loadMcpsCatalog: (refresh?: boolean) => Promise<void>;
  refreshCatalog: (source: 'skills' | 'mcps') => Promise<void>;

  // Install
  installSkill: (item: MarketplaceSkillItem, conflictAction?: ConflictAction) => Promise<void>;
  installMcp: (item: MarketplaceMcpItem, conflictAction?: ConflictAction) => Promise<void>;

  // Filter / select
  setSkillsFilter: (filter: Partial<MarketplaceFilter>) => void;
  setMcpsFilter: (filter: Partial<MarketplaceFilter>) => void;
  selectSkillItem: (id: string | null) => void;
  selectMcpItem: (id: string | null) => void;

  // Collision modal
  openCollisionModal: (state: Omit<MarketplaceCollisionModalState, 'open'>) => void;
  closeCollisionModal: () => void;
  resolveCollision: (action: ConflictAction) => Promise<void>;

  // Failure / retry
  retryInstall: (itemId: string, itemType: 'skill' | 'mcp') => Promise<void>;
  clearInstallFailure: (itemId: string) => void;

  // Classify-failed inline acknowledgement — once the user has manually
  // assigned category/tags via the inline prompt (F-P0-5 / E3-4), clear the
  // row from the classify-failed set so the prompt disappears.
  clearClassifyFailed: (itemId: string) => void;

  // Onboarding
  dismissOnboarding: (kind: 'skills' | 'mcps') => void;

  // Short-cut banner
  showShortcutBanner: (targetItemId: string, itemType: 'skill' | 'mcp') => void;
  dismissShortcutBanner: () => void;
  addToActiveScene: () => Promise<void>;

  // Add-to-Scene popover
  openAddToScenePopover: (
    targetItemId: string,
    itemType: 'skill' | 'mcp',
    triggerRect?: DOMRect,
  ) => void;
  closeAddToScenePopover: () => void;
  saveSceneAssignments: (selectedSceneIds: string[]) => Promise<void>;

  // SSoT selectors (always derived from useSkillsStore / useMcpsStore)
  isSkillInstalled: (item: MarketplaceSkillItem) => boolean;
  isMcpInstalled: (item: MarketplaceMcpItem) => boolean;
  getFilteredSkills: () => MarketplaceSkillItem[];
  getFilteredMcps: () => MarketplaceMcpItem[];

  // Tauri event subscription (called once from MainLayout)
  initEventListeners: () => Promise<UnlistenFn>;
}

// ============================================================================
// Helpers
// ============================================================================

const normalizeName = (s: string): string => s.trim();

/**
 * Compute the initial Scene-id list for the AddToScenePopover. Reads the
 * domain-store skill/mcp ids, then walks `useScenesStore.scenes` filtering
 * for membership.
 */
function computeInitialSceneIds(
  scenes: Scene[],
  itemType: 'skill' | 'mcp',
  targetItemId: string,
): string[] {
  if (itemType === 'skill') {
    return scenes.filter((s) => s.skillIds.includes(targetItemId)).map((s) => s.id);
  }
  return scenes.filter((s) => s.mcpIds.includes(targetItemId)).map((s) => s.id);
}

/**
 * Apply the 4-axis filter (search / categoryId / tags / sort) to a
 * marketplace catalog. The category / tag filters compare against
 * upstream-declared classification (display-only, never imported into
 * Ensemble's own taxonomy per D-15 / R-33). When a filter row has no
 * upstream-side data, it is treated as a no-op rather than an exclusion
 * — this keeps the upstream-permissive default of D-15 intact.
 */
function applyFilter<
  T extends {
    name: string;
    description: string;
    categories: string[];
    tags: string[];
    stars: number;
    lastUpdatedAt: string;
  },
>(items: T[], filter: MarketplaceFilter): T[] {
  let result = items;

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    result = result.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle),
    );
  }

  if (filter.categoryId) {
    result = result.filter((item) => item.categories.includes(filter.categoryId as string));
  }

  if (filter.tags.length > 0) {
    result = result.filter((item) => filter.tags.some((tag) => item.tags.includes(tag)));
  }

  // Sort
  const sorted = [...result];
  switch (filter.sort) {
    case 'alphabet':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'updated':
      sorted.sort((a, b) => b.lastUpdatedAt.localeCompare(a.lastUpdatedAt));
      break;
    case 'popularity':
    default:
      sorted.sort((a, b) => b.stars - a.stars);
      break;
  }
  return sorted;
}

// ============================================================================
// Store
// ============================================================================

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  // Initial state
  skillsCatalog: [],
  mcpsCatalog: [],
  lastSyncedSkills: undefined,
  lastSyncedMcps: undefined,
  staleCacheSkills: undefined,
  staleCacheMcps: undefined,

  isLoadingSkills: false,
  isLoadingMcps: false,
  upstreamErrorSkills: null,
  upstreamErrorMcps: null,

  installingItemIds: new Set<string>(),
  installFailedItems: {},
  classifyingItemIds: new Set<string>(),
  classifyFailedItemIds: new Set<string>(),

  skillsFilter: initialFilter,
  mcpsFilter: initialFilter,

  selectedSkillItemId: null,
  selectedMcpItemId: null,

  collisionModalState: initialCollisionModalState,
  shortcutBannerState: initialShortcutBannerState,
  addToScenePopoverState: initialAddToScenePopoverState,

  onboardingDismissedSkills: false,
  onboardingDismissedMcps: false,

  // -- Catalog --

  loadSkillsCatalog: async (refresh = false) => {
    if (!isTauri()) {
      // Browser preview mode (vite-only without Tauri IPC). Set
      // upstreamError so the page renders the offline EmptyState
      // instead of a blank main pane.
      console.warn('MarketplaceStore: Cannot load skills catalog in browser mode');
      set({
        upstreamErrorSkills:
          'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
      });
      return;
    }

    set({ isLoadingSkills: true, upstreamErrorSkills: null });
    try {
      const items =
        (await safeInvoke<MarketplaceSkillItem[]>('list_marketplace_skills', {
          refresh,
        })) ?? [];
      set({
        skillsCatalog: items,
        lastSyncedSkills: new Date().toISOString(),
        isLoadingSkills: false,
      });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to load skills catalog:', error);
      set({
        upstreamErrorSkills: message,
        isLoadingSkills: false,
      });
    }
  },

  loadMcpsCatalog: async (refresh = false) => {
    if (!isTauri()) {
      console.warn('MarketplaceStore: Cannot load mcps catalog in browser mode');
      set({
        upstreamErrorMcps:
          'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
      });
      return;
    }

    set({ isLoadingMcps: true, upstreamErrorMcps: null });
    try {
      const items =
        (await safeInvoke<MarketplaceMcpItem[]>('list_marketplace_mcps', {
          refresh,
        })) ?? [];
      set({
        mcpsCatalog: items,
        lastSyncedMcps: new Date().toISOString(),
        isLoadingMcps: false,
      });
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('Failed to load mcps catalog:', error);
      set({
        upstreamErrorMcps: message,
        isLoadingMcps: false,
      });
    }
  },

  refreshCatalog: async (source) => {
    if (!isTauri()) {
      console.warn('MarketplaceStore: Cannot refresh catalog in browser mode');
      return;
    }
    try {
      await safeInvoke('refresh_marketplace_cache', { source });
    } catch (error) {
      console.error(`Failed to refresh ${source} marketplace cache:`, error);
      // Swallow — the underlying catalog reload below surfaces the error.
    }
    // Always trigger a fresh load to update lastSynced + listing.
    if (source === 'skills') {
      await get().loadSkillsCatalog(true);
    } else {
      await get().loadMcpsCatalog(true);
    }
  },

  // -- Install --

  installSkill: async (item, conflictAction) => {
    if (!isTauri()) {
      console.warn('MarketplaceStore: Cannot install skill in browser mode');
      return;
    }

    // Ensure trashedItems is loaded so the backend's collision detection
    // can return an accurate `hasTrashed` brief (R4 §6.2).
    if (useTrashStore.getState().trashedItems === null) {
      await useTrashStore.getState().loadTrashedItems();
    }

    // Mark installing (per-item, persists across page navigation).
    set((state) => ({
      installingItemIds: new Set([...state.installingItemIds, item.id]),
      installFailedItems: (() => {
        const next = { ...state.installFailedItems };
        delete next[item.id];
        return next;
      })(),
    }));

    try {
      const outcome = await safeInvoke<InstallOutcome>('install_marketplace_skill', {
        item,
        conflictAction: conflictAction ?? null,
      });

      if (!outcome) {
        throw new Error('Backend returned no install outcome');
      }

      switch (outcome.kind) {
        case 'installed': {
          // SSoT sync: pull the freshly-installed Skill into useSkillsStore.
          await useSkillsStore.getState().loadSkills();
          // Mark this item as classifying — backend `auto_classify` runs in
          // background and emits `marketplace:classify-result` /
          // `marketplace:classify-failed`. The event listeners below will
          // remove the id from `classifyingItemIds`.
          set((state) => {
            const installing = new Set([...state.installingItemIds]);
            installing.delete(item.id);
            const classifying = new Set([...state.classifyingItemIds, item.id]);
            const classifyFailed = new Set([...state.classifyFailedItemIds]);
            classifyFailed.delete(item.id);
            return {
              installingItemIds: installing,
              classifyingItemIds: classifying,
              classifyFailedItemIds: classifyFailed,
            };
          });
          // Raise the install short-cut banner (D-Imp-6).
          // `outcome.skillId` carries the local Skill.id for skill installs.
          get().showShortcutBanner(outcome.skillId, 'skill');
          break;
        }
        case 'nameCollision': {
          // Open Modal; keep `installingItemIds` so the button stays in
          // "Installing..." state until the user resolves. Cancelling the
          // Modal closes it AND clears the installing flag.
          get().openCollisionModal({
            item,
            itemType: 'skill',
            hasLocal: outcome.hasLocal,
            hasTrashed: outcome.hasTrashed,
          });
          break;
        }
        case 'failed': {
          set((state) => {
            const installing = new Set([...state.installingItemIds]);
            installing.delete(item.id);
            return {
              installingItemIds: installing,
              installFailedItems: {
                ...state.installFailedItems,
                [item.id]: {
                  error: outcome.reason,
                  attemptedAt: new Date().toISOString(),
                },
              },
            };
          });
          break;
        }
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('installSkill failed:', error);
      set((state) => {
        const installing = new Set([...state.installingItemIds]);
        installing.delete(item.id);
        return {
          installingItemIds: installing,
          installFailedItems: {
            ...state.installFailedItems,
            [item.id]: { error: message, attemptedAt: new Date().toISOString() },
          },
        };
      });
    }
  },

  installMcp: async (item, conflictAction) => {
    if (!isTauri()) {
      console.warn('MarketplaceStore: Cannot install MCP in browser mode');
      return;
    }

    if (useTrashStore.getState().trashedItems === null) {
      await useTrashStore.getState().loadTrashedItems();
    }

    set((state) => ({
      installingItemIds: new Set([...state.installingItemIds, item.id]),
      installFailedItems: (() => {
        const next = { ...state.installFailedItems };
        delete next[item.id];
        return next;
      })(),
    }));

    try {
      const outcome = await safeInvoke<InstallOutcome>('install_marketplace_mcp', {
        item,
        conflictAction: conflictAction ?? null,
      });

      if (!outcome) {
        throw new Error('Backend returned no install outcome');
      }

      switch (outcome.kind) {
        case 'installed': {
          // Backend reuses `skillId` field for both variants — for MCP
          // installs the value is the local mcp id (`~/.ensemble/mcps/<name>.json`
          // path). Phase A SubAgent note explicitly calls this out.
          await useMcpsStore.getState().loadMcps();
          set((state) => {
            const installing = new Set([...state.installingItemIds]);
            installing.delete(item.id);
            const classifying = new Set([...state.classifyingItemIds, item.id]);
            const classifyFailed = new Set([...state.classifyFailedItemIds]);
            classifyFailed.delete(item.id);
            return {
              installingItemIds: installing,
              classifyingItemIds: classifying,
              classifyFailedItemIds: classifyFailed,
            };
          });
          get().showShortcutBanner(outcome.skillId, 'mcp');
          break;
        }
        case 'nameCollision': {
          get().openCollisionModal({
            item,
            itemType: 'mcp',
            hasLocal: outcome.hasLocal,
            hasTrashed: outcome.hasTrashed,
          });
          break;
        }
        case 'failed': {
          set((state) => {
            const installing = new Set([...state.installingItemIds]);
            installing.delete(item.id);
            return {
              installingItemIds: installing,
              installFailedItems: {
                ...state.installFailedItems,
                [item.id]: {
                  error: outcome.reason,
                  attemptedAt: new Date().toISOString(),
                },
              },
            };
          });
          break;
        }
      }
    } catch (error) {
      const message = typeof error === 'string' ? error : String(error);
      console.error('installMcp failed:', error);
      set((state) => {
        const installing = new Set([...state.installingItemIds]);
        installing.delete(item.id);
        return {
          installingItemIds: installing,
          installFailedItems: {
            ...state.installFailedItems,
            [item.id]: { error: message, attemptedAt: new Date().toISOString() },
          },
        };
      });
    }
  },

  // -- Filter / select --

  setSkillsFilter: (filter) =>
    set((state) => ({ skillsFilter: { ...state.skillsFilter, ...filter } })),
  setMcpsFilter: (filter) => set((state) => ({ mcpsFilter: { ...state.mcpsFilter, ...filter } })),
  selectSkillItem: (id) => set({ selectedSkillItemId: id }),
  selectMcpItem: (id) => set({ selectedMcpItemId: id }),

  // -- Collision modal --

  openCollisionModal: (state) =>
    set({
      collisionModalState: { ...state, open: true },
    }),

  closeCollisionModal: () => {
    // Closing without resolving = cancel. Clear the installing flag for
    // the modal's underlying item so the button returns to `Install`.
    const { collisionModalState } = get();
    const itemId = collisionModalState.item?.id;
    set((state) => {
      const next = { ...state, collisionModalState: initialCollisionModalState };
      if (itemId) {
        const installing = new Set([...state.installingItemIds]);
        installing.delete(itemId);
        next.installingItemIds = installing;
      }
      return next;
    });
  },

  resolveCollision: async (action) => {
    const { collisionModalState } = get();
    const { item, itemType } = collisionModalState;
    if (!item || !itemType) return;

    // Close the modal optimistically; install action will manage progress
    // state on its own (button stays in `Installing...` from the original
    // entry point because `installingItemIds` still contains the id).
    set({ collisionModalState: initialCollisionModalState });

    if (itemType === 'skill') {
      await get().installSkill(item as MarketplaceSkillItem, action);
    } else {
      await get().installMcp(item as MarketplaceMcpItem, action);
    }
  },

  // -- Failure / retry --

  retryInstall: async (itemId, itemType) => {
    // Look up the item in the appropriate catalog. If absent, clear the
    // failure so the row no longer claims to be retryable.
    const { skillsCatalog, mcpsCatalog } = get();
    if (itemType === 'skill') {
      const item = skillsCatalog.find((i) => i.id === itemId);
      if (!item) {
        get().clearInstallFailure(itemId);
        return;
      }
      await get().installSkill(item);
    } else {
      const item = mcpsCatalog.find((i) => i.id === itemId);
      if (!item) {
        get().clearInstallFailure(itemId);
        return;
      }
      await get().installMcp(item);
    }
  },

  clearInstallFailure: (itemId) =>
    set((state) => {
      const next = { ...state.installFailedItems };
      delete next[itemId];
      return { installFailedItems: next };
    }),

  // Remove a row from the classify-failed set after the user has manually
  // assigned category/tags via the inline prompt (F-P0-5 / E3-4). Keyed by
  // local Skill.id / McpServer.id (matches `spawn_auto_classify` payload).
  clearClassifyFailed: (itemId) =>
    set((state) => {
      if (!state.classifyFailedItemIds.has(itemId)) return state;
      const next = new Set([...state.classifyFailedItemIds]);
      next.delete(itemId);
      return { classifyFailedItemIds: next };
    }),

  // -- Onboarding --

  dismissOnboarding: (kind) =>
    set(
      kind === 'skills' ? { onboardingDismissedSkills: true } : { onboardingDismissedMcps: true },
    ),

  // -- Short-cut banner --

  showShortcutBanner: (targetItemId, itemType) => {
    const activeScene = useScenesStore.getState().getActiveScene();
    set({
      shortcutBannerState: {
        visible: true,
        itemType,
        targetItemId,
        activeSceneId: activeScene?.id ?? null,
        activeSceneName: activeScene?.name ?? null,
      },
    });
  },

  dismissShortcutBanner: () => set({ shortcutBannerState: initialShortcutBannerState }),

  addToActiveScene: async () => {
    const { shortcutBannerState } = get();
    const { activeSceneId, targetItemId, itemType } = shortcutBannerState;
    if (!activeSceneId || !targetItemId || !itemType) return;

    const scenesStore = useScenesStore.getState();
    const scene = scenesStore.scenes.find((s) => s.id === activeSceneId);
    if (!scene) return;

    // Idempotent add: if already in the Scene, just dismiss the banner.
    const skillIds = itemType === 'skill' ? [...scene.skillIds] : scene.skillIds;
    const mcpIds = itemType === 'mcp' ? [...scene.mcpIds] : scene.mcpIds;
    if (itemType === 'skill' && !skillIds.includes(targetItemId)) {
      skillIds.push(targetItemId);
    }
    if (itemType === 'mcp' && !mcpIds.includes(targetItemId)) {
      mcpIds.push(targetItemId);
    }

    try {
      await scenesStore.updateScene(activeSceneId, { skillIds, mcpIds });
    } catch (error) {
      console.error('addToActiveScene failed:', error);
      // Leave the banner visible so the user can retry / pick a different path.
      return;
    }
    get().dismissShortcutBanner();
  },

  // -- Add-to-Scene popover --

  openAddToScenePopover: (targetItemId, itemType, triggerRect) => {
    const scenes = useScenesStore.getState().scenes;
    const initialSelectedSceneIds = computeInitialSceneIds(scenes, itemType, targetItemId);
    set({
      addToScenePopoverState: {
        open: true,
        targetItemId,
        itemType,
        initialSelectedSceneIds,
        triggerRect,
      },
    });
  },

  closeAddToScenePopover: () => set({ addToScenePopoverState: initialAddToScenePopoverState }),

  saveSceneAssignments: async (selectedSceneIds) => {
    const { addToScenePopoverState } = get();
    const { targetItemId, itemType, initialSelectedSceneIds } = addToScenePopoverState;
    if (!targetItemId || !itemType) return;

    const initialSet = new Set(initialSelectedSceneIds);
    const selectedSet = new Set(selectedSceneIds);

    // Diff: scenes that need ADD vs scenes that need REMOVE.
    const toAdd = selectedSceneIds.filter((id) => !initialSet.has(id));
    const toRemove = initialSelectedSceneIds.filter((id) => !selectedSet.has(id));

    const scenesStore = useScenesStore.getState();

    for (const sceneId of toAdd) {
      const scene = scenesStore.scenes.find((s) => s.id === sceneId);
      if (!scene) continue;
      const skillIds =
        itemType === 'skill' && !scene.skillIds.includes(targetItemId)
          ? [...scene.skillIds, targetItemId]
          : scene.skillIds;
      const mcpIds =
        itemType === 'mcp' && !scene.mcpIds.includes(targetItemId)
          ? [...scene.mcpIds, targetItemId]
          : scene.mcpIds;
      await scenesStore.updateScene(sceneId, { skillIds, mcpIds });
    }

    for (const sceneId of toRemove) {
      const scene = scenesStore.scenes.find((s) => s.id === sceneId);
      if (!scene) continue;
      const skillIds =
        itemType === 'skill' ? scene.skillIds.filter((id) => id !== targetItemId) : scene.skillIds;
      const mcpIds =
        itemType === 'mcp' ? scene.mcpIds.filter((id) => id !== targetItemId) : scene.mcpIds;
      await scenesStore.updateScene(sceneId, { skillIds, mcpIds });
    }

    // Reload Scenes to sync `lastEditedSceneId` (the last `updateScene`
    // call moved it). UI subscribers re-render with the fresh ids.
    await scenesStore.loadScenes();

    set({ addToScenePopoverState: initialAddToScenePopoverState });
    // The popover served as an explicit "pick scenes" action — the
    // shortcut banner has done its job.
    get().dismissShortcutBanner();
  },

  // -- SSoT selectors --

  isSkillInstalled: (item) => {
    const skills = useSkillsStore.getState().skills;
    // Triple match (preferred). Marketplace-installed Skills carry
    // `marketplaceSource = { owner, repo, name }`.
    const tripleMatch = skills.some(
      (s) =>
        s.marketplaceSource?.owner === item.owner &&
        s.marketplaceSource?.repo === item.repo &&
        s.marketplaceSource?.name === item.name,
    );
    if (tripleMatch) return true;
    // Name fallback for resources installed before the marketplace path
    // existed (or installed locally with a colliding name).
    const target = normalizeName(item.name);
    return skills.some((s) => normalizeName(s.name) === target);
  },

  isMcpInstalled: (item) => {
    const mcps = useMcpsStore.getState().mcpServers;
    const tripleMatch = mcps.some(
      (m) =>
        m.marketplaceSource?.owner === item.author &&
        // MCP catalog items don't carry the `(owner, repo)` triple in the
        // same shape as Skill items — author + name is the closest
        // upstream-stable identity. Backend writes
        // `marketplaceSource.name = item.name` and `.owner = item.author`,
        // so this comparison stays symmetric.
        m.marketplaceSource?.name === item.name,
    );
    if (tripleMatch) return true;
    const target = normalizeName(item.name);
    return mcps.some((m) => normalizeName(m.name) === target);
  },

  getFilteredSkills: () => {
    const { skillsCatalog, skillsFilter } = get();
    return applyFilter(skillsCatalog, skillsFilter);
  },

  getFilteredMcps: () => {
    const { mcpsCatalog, mcpsFilter } = get();
    return applyFilter(mcpsCatalog, mcpsFilter);
  },

  // -- Event listeners --

  initEventListeners: async () => {
    if (!isTauri()) {
      console.warn('MarketplaceStore: Skipping Tauri event listeners in browser mode');
      // Return a no-op unlisten so callers can `await` and dispose
      // uniformly regardless of environment.
      return () => undefined;
    }

    const unlisteners: UnlistenFn[] = [];

    // Classify result — backend has applied category/tags/icon to the
    // freshly-installed resource. Reload the appropriate domain store so
    // the row picks up the new metadata; clear the classifying flag.
    unlisteners.push(
      await listen<MarketplaceClassifyResultEvent>('marketplace:classify-result', async (event) => {
        const { id, itemType } = event.payload;
        // Domain store reload first so the next render observes
        // updated category / tags. Keep `classifyingItemIds` clearance
        // after the reload so consumers don't briefly see "classified
        // but uncategorized" frame.
        if (itemType === 'skill') {
          await useSkillsStore.getState().loadSkills();
        } else {
          await useMcpsStore.getState().loadMcps();
        }
        set((state) => {
          const classifying = new Set([...state.classifyingItemIds]);
          classifying.delete(id);
          const classifyFailed = new Set([...state.classifyFailedItemIds]);
          classifyFailed.delete(id);
          return {
            classifyingItemIds: classifying,
            classifyFailedItemIds: classifyFailed,
          };
        });
      }),
    );

    // Classify failed — keep the resource installed but record the row
    // for inline "assign manually" prompting (R1-P0-4).
    unlisteners.push(
      await listen<MarketplaceClassifyFailedEvent>('marketplace:classify-failed', (event) => {
        const { id } = event.payload;
        set((state) => {
          const classifying = new Set([...state.classifyingItemIds]);
          classifying.delete(id);
          const classifyFailed = new Set([...state.classifyFailedItemIds, id]);
          return {
            classifyingItemIds: classifying,
            classifyFailedItemIds: classifyFailed,
          };
        });
      }),
    );

    // Stale cache — record the age so the page can render the amber
    // "Last synced N hours ago" hint without obscuring data.
    unlisteners.push(
      await listen<MarketplaceStaleCacheEvent>('marketplace:stale-cache', (event) => {
        const { source, ageHours } = event.payload;
        if (source === 'skills') {
          set({ staleCacheSkills: { ageHours } });
        } else {
          set({ staleCacheMcps: { ageHours } });
        }
      }),
    );

    // Catalog enhanced — background scrape added new items to the cache.
    // Quietly reload so the list gains entries; do not surface a banner
    // (PRD §5.7 — soft enhancement, not an alert).
    unlisteners.push(
      await listen<MarketplaceCatalogEnhancedEvent>(
        'marketplace:catalog-enhanced',
        async (event) => {
          const { source } = event.payload;
          if (source === 'skills') {
            await get().loadSkillsCatalog(false);
          } else {
            await get().loadMcpsCatalog(false);
          }
        },
      ),
    );

    // Scrape degraded — only affects the skills source's enhancement
    // layer; surface as a non-blocking flag so the page can show
    // "(seed only)" on the synced timestamp (D-Imp-1 contract).
    unlisteners.push(
      await listen<MarketplaceScrapeDegradedEvent>('marketplace:scrape-degraded', (event) => {
        // V1: telemetry only — we do not interrupt the user. The
        // `lastSyncedSkills` already reflects the seed-only timestamp.
        console.warn('Marketplace scrape degraded:', event.payload.reason);
      }),
    );

    // Upstream error — backend exhausted seed + cache fallbacks. Record
    // as upstream error so EmptyState renders (PRD §5.7).
    unlisteners.push(
      await listen<MarketplaceUpstreamErrorEvent>('marketplace:upstream-error', (event) => {
        const { source, error } = event.payload;
        if (source === 'skills') {
          set({ upstreamErrorSkills: error });
        } else {
          set({ upstreamErrorMcps: error });
        }
      }),
    );

    return () => {
      for (const fn of unlisteners) fn();
    };
  },
}));

export default useMarketplaceStore;
