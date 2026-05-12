import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
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
  McpsPageResponse,
  McpsView,
  SkillsPageResponse,
  SkillsSearchResponse,
  SkillsView,
  TrashedItemBrief,
} from '@/types/marketplace';
import { getSkillItemKey } from '@/types/marketplace';

export type { McpsView, SkillsView } from '@/types/marketplace';
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

// ----- Skill marketplace (V2: server-driven listing + search) -------------

export interface SkillsListingState {
  /** Items accumulated across pages. New items append + dedupe by key. */
  items: MarketplaceSkillItem[];
  view: SkillsView;
  /** Full upstream count. Drives the "End of catalog (N total)" sentinel. */
  total: number;
  /** 0-indexed page number of the most recent successful fetch. */
  currentPage: number;
  hasMore: boolean;
  /** True only on initial fetch / view switch (page=0). */
  isLoadingPage: boolean;
  /** True while appending the next page. */
  isLoadingMore: boolean;
  /** Last upstream error (string). Set when a page fetch fails; cleared on
   *  the next successful fetch. */
  upstreamError: string | null;
  /** ISO timestamp of the most recent successful fetch (page 0). Drives
   *  SWR cache decisions on mount. `null` when never synced. */
  lastSyncedAt: string | null;
  /** True while a stale-while-revalidate fetch is in flight (silent — UI
   *  keeps showing existing items, only the sync indicator pulses). */
  isBackgroundSyncing: boolean;
}

const initialSkillsListing: SkillsListingState = {
  items: [],
  view: 'all-time',
  total: 0,
  currentPage: 0,
  hasMore: false,
  isLoadingPage: false,
  isLoadingMore: false,
  upstreamError: null,
  lastSyncedAt: null,
  isBackgroundSyncing: false,
};

export interface SkillsSearchState {
  /** Trimmed query string that produced these results. */
  query: string;
  results: MarketplaceSkillItem[];
  /** `"fuzzy"` | `"semantic"` per the upstream classification. */
  searchType: string | null;
  count: number;
  isSearching: boolean;
  error: string | null;
}

/** README cache entry — populated by `loadSkillReadme`. Memory-only and
 *  TTL'd on the backend (5-min); we mirror the cache here so a re-open
 *  of the same item within the session does not re-fetch. */
export interface SkillReadmeEntry {
  content: string;
  loadedAt: string; // ISO timestamp
}

// ----- MCP marketplace (V2: cursor-paginated realtime mirror) -------------

/** Default page size for both views and search. Matches the Registry
 *  website's own page size (96 < API max 100). */
export const MCP_REGISTRY_PAGE_SIZE = 96;

/** Time window for the "Recently Updated" view (hours back from now). */
export const MCP_RECENTLY_UPDATED_HOURS = 24;

/** Cursor-paginated MCP listing state. Shared shape between main listing
 *  and search results. `prevCursors` is a stack of cursors that produced
 *  earlier pages, walked back when the user clicks Previous so we can
 *  re-fetch (or, when length === 0, return to the first-page state with
 *  `cursor: undefined`). `currentCursor` is the cursor that was passed
 *  into the request producing `items`; it is `null` for page 1. `page`
 *  is a 1-indexed display value; not used for any backend call but
 *  surfaced if the UI ever wants to show "Page N". */
export interface McpsPaginatedState {
  items: MarketplaceMcpItem[];
  /** Active view tab. Drives which IPC the page actions dispatch to:
   *  `'all'` → `list_marketplace_mcps_page`,
   *  `'recently-updated'` → `list_recently_updated_mcps`. */
  view: McpsView;
  /** Cursor used to fetch `items`. `null` for page 1 (no cursor). */
  currentCursor: string | null;
  /** Stack of cursors that produced earlier pages. Length === pages walked
   *  forward so far. `prevCursors[0] === null` always (page 1). */
  prevCursors: Array<string | null>;
  /** Cursor for the next page, or `null` when no more pages exist. */
  nextCursor: string | null;
  hasMore: boolean;
  /** 1-indexed display page number. */
  page: number;
  loading: boolean;
  error: string | null;
  /** ISO timestamp of the most recent successful page-1 fetch. Drives SWR
   *  cache decisions on mount. `null` when never synced. */
  lastSyncedAt: string | null;
  /** True while a stale-while-revalidate fetch is in flight (silent — UI
   *  keeps showing existing items, only the sync indicator pulses). */
  isBackgroundSyncing: boolean;
}

const initialMcpsListing: McpsPaginatedState = {
  items: [],
  view: 'all',
  currentCursor: null,
  prevCursors: [],
  nextCursor: null,
  hasMore: false,
  page: 1,
  loading: false,
  error: null,
  lastSyncedAt: null,
  isBackgroundSyncing: false,
};

/** Search-mode state — same cursor-paginated fields as the listing minus
 *  the view tab, plus the query string that produced it. `null` when the
 *  page is in listing mode. Search has its own dispatch path
 *  (`search_marketplace_mcps`); the underlying listing's view is preserved
 *  while search is open so clearing the search returns the user to it. */
export interface McpsSearchState {
  items: MarketplaceMcpItem[];
  currentCursor: string | null;
  prevCursors: Array<string | null>;
  nextCursor: string | null;
  hasMore: boolean;
  page: number;
  loading: boolean;
  error: string | null;
  query: string;
}

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
  // Skill marketplace V2 — server-driven listing + search.
  skillsListing: SkillsListingState;
  /** `null` = listing mode (show `skillsListing.items`).
   *  Non-null = search mode (show `skillsSearch.results`). */
  skillsSearch: SkillsSearchState | null;
  /** README cache. Key is `${source}/${skillId}` (= `getSkillItemKey`). */
  skillReadmes: Record<string, SkillReadmeEntry>;
  /** Currently-loading README keys (so multiple openings of the same item
   *  don't trigger duplicate fetches). */
  loadingReadmes: Set<string>;
  /** README load failures, keyed by `${source}/${skillId}`. */
  readmeErrors: Record<string, string>;

  /** MCP README cache. Key is the upstream `repositoryUrl`. Same TTL +
   *  loading-set pattern as the Skill README cache. */
  mcpReadmes: Record<string, SkillReadmeEntry>;
  loadingMcpReadmes: Set<string>;
  mcpReadmeErrors: Record<string, string>;

  // MCP marketplace (V2: cursor-paginated realtime mirror, 2026-05-11).
  /** Active listing state. `view` inside drives which IPC backs page
   *  loads ('all' → main listing, 'recently-updated' → updated-since
   *  window). 96 items/page. */
  mcpsListing: McpsPaginatedState;
  /** `null` = listing mode (show `mcpsListing.items`). Non-null = search
   *  mode (show `mcpsSearch.items`). */
  mcpsSearch: McpsSearchState | null;

  // Per-item progress (cross-view persistence; keyed by item React key —
  // `getSkillItemKey(item)` for skills, `item.id` for MCPs)
  installingItemIds: Set<string>;
  installFailedItems: Record<string, { error: string; attemptedAt: string }>;
  classifyingItemIds: Set<string>;
  classifyFailedItemIds: Set<string>;

  // Selection (drives SlidePanel detail)
  /** For Skill marketplace, this stores `getSkillItemKey(item)`
   *  (`${source}/${skillId}`), NOT a backend-issued id. */
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

  // Skills.sh topic reverse map (icon resolver Stage 0; ~94 entries from
  // 8 curated topics, 24h cache on the backend). Empty object is the safe
  // default when fetch failed / cache empty — the icon resolver simply
  // falls through to Stages 1-3.
  skillsTopicMap: Record<string, string[]>;
  loadingSkillsTopicMap: boolean;

  // ---- Actions ----

  // Skill catalog (V2 server-driven)
  /** Fetch a single page of the listing. `page=0` replaces `items`; `page>0`
   *  appends + dedupes. `mode='auto'` consults the SWR cache (default for
   *  mount); `mode='force'` always foreground-fetches (default; used by
   *  view switch / search clear / explicit refresh). */
  loadSkillsPage: (view: SkillsView, page?: number, mode?: 'auto' | 'force') => Promise<void>;
  /** Convenience: fetch the next page when `hasMore` and not currently
   *  loading. No-op in search mode. */
  loadMoreSkills: () => Promise<void>;
  /** Switch the active listing tab. Resets pagination + clears search. */
  setSkillsView: (view: SkillsView) => void;
  /** Run a server-side search. Queries shorter than 2 chars are no-ops
   *  (callers are expected to debounce input). Toggles to search mode. */
  searchSkills: (query: string) => Promise<void>;
  /** Switch back to listing mode. */
  clearSkillsSearch: () => void;
  /** Fetch a single skill's README. Memoised per `${source}/${skillId}`. */
  loadSkillReadme: (source: string, skillId: string) => Promise<void>;
  /** Fetch a single MCP's README. Memoised per `repositoryUrl`. */
  loadMcpReadme: (repositoryUrl: string) => Promise<void>;
  /** Load the skills.sh topic → skill reverse map (powers Stage 0 of the
   *  icon resolver). Backend caches 24h. Idempotent: no-op when already
   *  loaded or in flight. */
  loadSkillsTopicMap: () => Promise<void>;

  // MCP marketplace (V2 server-driven pagination)
  /** Load page 1 for the given view (or the currently-active view when
   *  `view` is omitted). Resets cursors + items. For `'all'` the first
   *  page also merges MCP_SEED at the top. `mode='auto'` consults the SWR
   *  cache (default for mount); `mode='force'` always foreground-fetches. */
  loadMcpsFirstPage: (view?: McpsView, mode?: 'auto' | 'force') => Promise<void>;
  /** Walk forward one page using the current `nextCursor` (dispatches to
   *  the IPC matching `mcpsListing.view`). Pushes the current cursor onto
   *  `prevCursors`. */
  loadMcpsNextPage: () => Promise<void>;
  /** Walk back one page by popping `prevCursors` and re-fetching with that
   *  cursor (or no cursor when the stack is empty → returns to page 1).
   *  Dispatches to the IPC matching `mcpsListing.view`. */
  loadMcpsPrevPage: () => Promise<void>;
  /** Switch the active view tab. Clears the cursor stack + items, then
   *  loads page 1 of the new view. No-op if already on `view`. */
  setMcpsView: (view: McpsView) => Promise<void>;
  /** Enter search mode and run page 1 of the server-side `?search=` query. */
  searchMcps: (query: string) => Promise<void>;
  /** Walk forward / back inside search mode. */
  searchMcpsNextPage: () => Promise<void>;
  searchMcpsPrevPage: () => Promise<void>;
  /** Exit search mode (re-show listing + recently-updated). */
  clearMcpsSearch: () => void;
  /** Backwards-compat: existing pages call `refreshCatalog('skills')`; the
   *  MCP branch is now a no-op (we just rerun the page-1 fetch). */
  refreshCatalog: (source: 'skills' | 'mcps') => Promise<void>;

  // Install
  installSkill: (item: MarketplaceSkillItem, conflictAction?: ConflictAction) => Promise<void>;
  installMcp: (item: MarketplaceMcpItem, conflictAction?: ConflictAction) => Promise<void>;

  // Select
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
  /** Visible Skill items. Returns `skillsSearch.results` in search mode,
   *  otherwise `skillsListing.items`. */
  getVisibleSkills: () => MarketplaceSkillItem[];
  /** Visible MCP items. Returns `mcpsSearch.items` in search mode,
   *  otherwise `mcpsListing.items`. */
  getVisibleMcps: () => MarketplaceMcpItem[];

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

/** Dedupe-by-key concat that preserves order of first appearance.
 *  Used by `loadSkillsPage` when appending the next page. */
function appendUnique(
  prev: MarketplaceSkillItem[],
  next: MarketplaceSkillItem[],
): MarketplaceSkillItem[] {
  const seen = new Set(prev.map(getSkillItemKey));
  const merged = [...prev];
  for (const item of next) {
    const key = getSkillItemKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

const README_CACHE_TTL_MS = 5 * 60 * 1000;

// ----- Stale-while-revalidate (SWR) cache window --------------------------
// Cache age decides what `mode: 'auto'` does on mount when there is already
// a cached listing for the requested view:
//   age < FRESH    → no fetch at all (cache is fresh enough)
//   age ≥ FRESH    → silent background fetch (items stay visible, the sync
//                    icon pulses; new data swaps in when ready)
// There is no "clear cache + loading spinner" path. As long as the user
// has seen the marketplace once, every subsequent open shows data instantly
// (including across full app restarts via the persist middleware below).
// User-initiated `mode: 'force'` always foreground-fetches (cache bypassed).
export const MARKETPLACE_FRESH_TTL_MS = 5 * 60 * 1000;

/** Dispatch one MCP page fetch to the IPC matching `view`. Centralised so
 *  the three pagination actions (first / next / prev) don't each repeat
 *  the if/else branch. Throws on null upstream response. */
async function fetchMcpsPageByView(
  view: McpsView,
  cursor: string | null,
): Promise<McpsPageResponse> {
  if (view === 'recently-updated') {
    const resp = await safeInvoke<McpsPageResponse>('list_recently_updated_mcps', {
      hoursBack: MCP_RECENTLY_UPDATED_HOURS,
      cursor,
      limit: MCP_REGISTRY_PAGE_SIZE,
    });
    if (!resp) throw new Error('Backend returned no listing response');
    return resp;
  }
  const resp = await safeInvoke<McpsPageResponse>('list_marketplace_mcps_page', {
    cursor,
    limit: MCP_REGISTRY_PAGE_SIZE,
  });
  if (!resp) throw new Error('Backend returned no listing response');
  return resp;
}

// ============================================================================
// Store
// ============================================================================

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set, get) => ({
      // Initial state
      skillsListing: initialSkillsListing,
      skillsSearch: null,
      skillReadmes: {},
      loadingReadmes: new Set<string>(),
      readmeErrors: {},

      mcpReadmes: {},
      loadingMcpReadmes: new Set<string>(),
      mcpReadmeErrors: {},

      mcpsListing: initialMcpsListing,
      mcpsSearch: null,

      installingItemIds: new Set<string>(),
      installFailedItems: {},
      classifyingItemIds: new Set<string>(),
      classifyFailedItemIds: new Set<string>(),

      selectedSkillItemId: null,
      selectedMcpItemId: null,

      collisionModalState: initialCollisionModalState,
      shortcutBannerState: initialShortcutBannerState,
      addToScenePopoverState: initialAddToScenePopoverState,

      onboardingDismissedSkills: false,
      onboardingDismissedMcps: false,

      skillsTopicMap: {},
      loadingSkillsTopicMap: false,

      // -- Skill catalog (V2: server-driven listing + search) --

      loadSkillsPage: async (view, page = 0, mode = 'force') => {
        if (!isTauri()) {
          console.warn('MarketplaceStore: Cannot load skills page in browser mode');
          set((state) => ({
            skillsListing: {
              ...state.skillsListing,
              view,
              isLoadingPage: false,
              isLoadingMore: false,
              upstreamError:
                'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          }));
          return;
        }

        // SWR cache check — `mode='auto'` on mount with cached items for this
        // view: skip if cache is fresh (< 5min), otherwise silent SWR refresh
        // (items stay visible, icon pulses, swap in when fetch completes).
        // No foreground "clear-and-spinner" path when cache exists.
        let silent = false;
        if (mode === 'auto' && page === 0) {
          const cached = get().skillsListing;
          if (
            cached.view === view &&
            cached.items.length > 0 &&
            cached.lastSyncedAt &&
            !cached.isLoadingPage &&
            !cached.isBackgroundSyncing
          ) {
            const ageMs = Date.now() - new Date(cached.lastSyncedAt).getTime();
            if (ageMs < MARKETPLACE_FRESH_TTL_MS) {
              return;
            }
            silent = true;
          }
        }

        // Page 0 → replace (unless silent SWR, in which case items stay visible
        // until the new page arrives); clear search.
        if (page === 0) {
          if (silent) {
            set((state) => ({
              skillsListing: {
                ...state.skillsListing,
                view,
                isBackgroundSyncing: true,
                upstreamError: null,
              },
              skillsSearch: null,
            }));
          } else {
            set((state) => ({
              skillsListing: {
                ...state.skillsListing,
                view,
                items: [],
                total: 0,
                currentPage: 0,
                hasMore: false,
                isLoadingPage: true,
                isLoadingMore: false,
                isBackgroundSyncing: false,
                upstreamError: null,
              },
              skillsSearch: null,
            }));
          }
        } else {
          set((state) => ({
            skillsListing: {
              ...state.skillsListing,
              isLoadingMore: true,
              upstreamError: null,
            },
          }));
        }

        try {
          const resp = await safeInvoke<SkillsPageResponse>('list_marketplace_skills', {
            view,
            page,
          });
          if (!resp) {
            throw new Error('Backend returned no listing response');
          }
          set((state) => {
            // Concurrent-safety: if the user switched view while this page was
            // in flight, ignore the late response. The latest `view` wins.
            if (state.skillsListing.view !== view) return state;
            const merged =
              page === 0 ? resp.skills : appendUnique(state.skillsListing.items, resp.skills);
            return {
              skillsListing: {
                ...state.skillsListing,
                items: merged,
                total: resp.total,
                currentPage: resp.page,
                hasMore: resp.hasMore,
                isLoadingPage: false,
                isLoadingMore: false,
                isBackgroundSyncing: false,
                lastSyncedAt:
                  page === 0 ? new Date().toISOString() : state.skillsListing.lastSyncedAt,
                upstreamError: null,
              },
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load skills page:', error);
          set((state) => ({
            skillsListing: {
              ...state.skillsListing,
              isLoadingPage: false,
              isLoadingMore: false,
              isBackgroundSyncing: false,
              upstreamError: message,
            },
          }));
        }
      },

      loadMoreSkills: async () => {
        const { skillsListing, skillsSearch } = get();
        // Search mode never paginates (skills.sh /api/search returns all hits up
        // to its server-side cap in one shot).
        if (skillsSearch !== null) return;
        if (!skillsListing.hasMore) return;
        if (skillsListing.isLoadingPage || skillsListing.isLoadingMore) return;
        await get().loadSkillsPage(skillsListing.view, skillsListing.currentPage + 1);
      },

      setSkillsView: (view) => {
        const { skillsListing } = get();
        if (skillsListing.view === view && !skillsListing.upstreamError) return;
        void get().loadSkillsPage(view, 0);
      },

      searchSkills: async (query) => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
          get().clearSkillsSearch();
          return;
        }

        if (!isTauri()) {
          console.warn('MarketplaceStore: Cannot search in browser mode');
          set({
            skillsSearch: {
              query: trimmed,
              results: [],
              searchType: null,
              count: 0,
              isSearching: false,
              error: 'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          });
          return;
        }

        set((state) => ({
          skillsSearch: {
            query: trimmed,
            results: state.skillsSearch?.query === trimmed ? state.skillsSearch.results : [],
            searchType:
              state.skillsSearch?.query === trimmed ? state.skillsSearch.searchType : null,
            count: state.skillsSearch?.query === trimmed ? state.skillsSearch.count : 0,
            isSearching: true,
            error: null,
          },
        }));

        try {
          const resp = await safeInvoke<SkillsSearchResponse>('search_marketplace_skills', {
            query: trimmed,
          });
          if (!resp) {
            throw new Error('Backend returned no search response');
          }
          set((state) => {
            // Stale-response guard: if the user typed past this query in the
            // meantime, drop this result.
            if (state.skillsSearch && state.skillsSearch.query !== trimmed) return state;
            return {
              skillsSearch: {
                query: resp.query,
                results: resp.skills,
                searchType: resp.searchType,
                count: resp.count,
                isSearching: false,
                error: null,
              },
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to search skills:', error);
          set((state) => {
            if (state.skillsSearch && state.skillsSearch.query !== trimmed) return state;
            return {
              skillsSearch: {
                query: trimmed,
                results: [],
                searchType: null,
                count: 0,
                isSearching: false,
                error: message,
              },
            };
          });
        }
      },

      clearSkillsSearch: () => set({ skillsSearch: null }),

      loadSkillReadme: async (source, skillId) => {
        const key = `${source}/${skillId}`;
        const { skillReadmes, loadingReadmes } = get();
        // Memoise: cached entry within TTL → skip; loading → skip.
        const cached = skillReadmes[key];
        if (cached) {
          const ageMs = Date.now() - new Date(cached.loadedAt).getTime();
          if (ageMs < README_CACHE_TTL_MS) return;
        }
        if (loadingReadmes.has(key)) return;

        if (!isTauri()) {
          set((state) => ({
            readmeErrors: {
              ...state.readmeErrors,
              [key]: 'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          }));
          return;
        }

        set((state) => {
          const next = new Set(state.loadingReadmes);
          next.add(key);
          const errors = { ...state.readmeErrors };
          delete errors[key];
          return { loadingReadmes: next, readmeErrors: errors };
        });

        try {
          const content = await safeInvoke<string>('get_marketplace_skill_readme', {
            source,
            skillId,
          });
          set((state) => {
            const next = new Set(state.loadingReadmes);
            next.delete(key);
            return {
              skillReadmes: {
                ...state.skillReadmes,
                [key]: { content: content ?? '', loadedAt: new Date().toISOString() },
              },
              loadingReadmes: next,
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error(`Failed to load README for ${key}:`, error);
          set((state) => {
            const next = new Set(state.loadingReadmes);
            next.delete(key);
            return {
              loadingReadmes: next,
              readmeErrors: { ...state.readmeErrors, [key]: message },
            };
          });
        }
      },

      loadMcpReadme: async (repositoryUrl) => {
        const key = repositoryUrl;
        if (!key || key.length === 0) return;
        const { mcpReadmes, loadingMcpReadmes } = get();
        // Memoise: cached entry within TTL → skip; loading → skip.
        const cached = mcpReadmes[key];
        if (cached) {
          const ageMs = Date.now() - new Date(cached.loadedAt).getTime();
          if (ageMs < README_CACHE_TTL_MS) return;
        }
        if (loadingMcpReadmes.has(key)) return;

        if (!isTauri()) {
          set((state) => ({
            mcpReadmeErrors: {
              ...state.mcpReadmeErrors,
              [key]: 'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          }));
          return;
        }

        set((state) => {
          const next = new Set(state.loadingMcpReadmes);
          next.add(key);
          const errors = { ...state.mcpReadmeErrors };
          delete errors[key];
          return { loadingMcpReadmes: next, mcpReadmeErrors: errors };
        });

        try {
          const content = await safeInvoke<string>('get_marketplace_mcp_readme', {
            repositoryUrl,
          });
          set((state) => {
            const next = new Set(state.loadingMcpReadmes);
            next.delete(key);
            return {
              mcpReadmes: {
                ...state.mcpReadmes,
                [key]: { content: content ?? '', loadedAt: new Date().toISOString() },
              },
              loadingMcpReadmes: next,
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error(`Failed to load MCP README for ${key}:`, error);
          set((state) => {
            const next = new Set(state.loadingMcpReadmes);
            next.delete(key);
            return {
              loadingMcpReadmes: next,
              mcpReadmeErrors: { ...state.mcpReadmeErrors, [key]: message },
            };
          });
        }
      },

      loadSkillsTopicMap: async () => {
        // Idempotent: skip if already loaded or in flight. The persisted
        // map survives across sessions; a non-empty map is treated as
        // "good enough" without re-fetching on every mount (backend has
        // its own 24h cache layered behind the IPC, so a refetch is cheap
        // when the persist storage is empty).
        const state = get();
        if (state.loadingSkillsTopicMap) return;
        if (Object.keys(state.skillsTopicMap).length > 0) return;
        if (!isTauri()) return;

        set({ loadingSkillsTopicMap: true });
        try {
          const map = await safeInvoke<Record<string, string[]>>('list_skill_topics_map', {
            refresh: false,
          });
          set({
            skillsTopicMap: map ?? {},
            loadingSkillsTopicMap: false,
          });
        } catch (error) {
          // Non-fatal — resolver falls through to Stages 1-3.
          console.warn('Failed to load skills topic map:', error);
          set({ loadingSkillsTopicMap: false });
        }
      },

      // -- MCP marketplace (V2 server-driven pagination) --

      loadMcpsFirstPage: async (view, mode = 'force') => {
        const targetView: McpsView = view ?? get().mcpsListing.view;
        if (!isTauri()) {
          console.warn('MarketplaceStore: Cannot load mcps in browser mode');
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              view: targetView,
              loading: false,
              error: 'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          }));
          return;
        }

        // SWR cache check — same logic as `loadSkillsPage`: fresh < 5min skip,
        // otherwise silent SWR refresh. Items stay visible across the fetch.
        let silent = false;
        if (mode === 'auto') {
          const cached = get().mcpsListing;
          if (
            cached.view === targetView &&
            cached.items.length > 0 &&
            cached.lastSyncedAt &&
            !cached.loading &&
            !cached.isBackgroundSyncing
          ) {
            const ageMs = Date.now() - new Date(cached.lastSyncedAt).getTime();
            if (ageMs < MARKETPLACE_FRESH_TTL_MS) {
              return;
            }
            silent = true;
          }
        }

        if (silent) {
          // Silent SWR: items stay visible until the new page arrives.
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              view: targetView,
              isBackgroundSyncing: true,
              error: null,
            },
          }));
        } else {
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              view: targetView,
              loading: true,
              isBackgroundSyncing: false,
              error: null,
            },
          }));
        }
        try {
          const resp = await fetchMcpsPageByView(targetView, null);
          set({
            mcpsListing: {
              items: resp.items,
              view: targetView,
              currentCursor: null,
              prevCursors: [],
              nextCursor: resp.nextCursor,
              hasMore: resp.hasMore,
              page: 1,
              loading: false,
              isBackgroundSyncing: false,
              lastSyncedAt: new Date().toISOString(),
              error: null,
            },
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load mcps first page:', error);
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              loading: false,
              isBackgroundSyncing: false,
              error: message,
            },
          }));
        }
      },

      loadMcpsNextPage: async () => {
        const { mcpsListing } = get();
        if (mcpsListing.loading) return;
        if (!mcpsListing.hasMore || !mcpsListing.nextCursor) return;
        if (!isTauri()) return;

        const cursorToFetch = mcpsListing.nextCursor;
        const newPrevCursors = [...mcpsListing.prevCursors, mcpsListing.currentCursor];
        const view = mcpsListing.view;

        set((state) => ({
          mcpsListing: { ...state.mcpsListing, loading: true, error: null },
        }));
        try {
          const resp = await fetchMcpsPageByView(view, cursorToFetch);
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              items: resp.items,
              view,
              currentCursor: cursorToFetch,
              prevCursors: newPrevCursors,
              nextCursor: resp.nextCursor,
              hasMore: resp.hasMore,
              page: state.mcpsListing.page + 1,
              loading: false,
              error: null,
            },
          }));
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load mcps next page:', error);
          set((state) => ({
            mcpsListing: { ...state.mcpsListing, loading: false, error: message },
          }));
        }
      },

      loadMcpsPrevPage: async () => {
        const { mcpsListing } = get();
        if (mcpsListing.loading) return;
        if (mcpsListing.prevCursors.length === 0) return;
        if (!isTauri()) return;

        // Pop one cursor off the stack — that's the cursor that produced the
        // page we're returning to. (The previous-page cursor is at the top of
        // the stack; the current `currentCursor` is the cursor that produced
        // the page we're currently on, which should be discarded.)
        const newPrevCursors = mcpsListing.prevCursors.slice(0, -1);
        const targetCursor = mcpsListing.prevCursors[mcpsListing.prevCursors.length - 1];
        const view = mcpsListing.view;

        set((state) => ({
          mcpsListing: { ...state.mcpsListing, loading: true, error: null },
        }));
        try {
          const resp = await fetchMcpsPageByView(view, targetCursor);
          set((state) => ({
            mcpsListing: {
              ...state.mcpsListing,
              items: resp.items,
              view,
              currentCursor: targetCursor,
              prevCursors: newPrevCursors,
              nextCursor: resp.nextCursor,
              hasMore: resp.hasMore,
              page: Math.max(1, state.mcpsListing.page - 1),
              loading: false,
              error: null,
            },
          }));
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load mcps prev page:', error);
          set((state) => ({
            mcpsListing: { ...state.mcpsListing, loading: false, error: message },
          }));
        }
      },

      setMcpsView: async (view) => {
        if (get().mcpsListing.view === view && get().mcpsListing.items.length > 0) return;
        // Clear any active search so the switch is unambiguous (the search
        // path is its own dispatch — switching view inside search would be
        // confusing). Caller can re-search after.
        if (get().mcpsSearch !== null) {
          set({ mcpsSearch: null });
        }
        await get().loadMcpsFirstPage(view);
      },

      searchMcps: async (query) => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
          get().clearMcpsSearch();
          return;
        }
        if (!isTauri()) {
          set({
            mcpsSearch: {
              query: trimmed,
              items: [],
              currentCursor: null,
              prevCursors: [],
              nextCursor: null,
              hasMore: false,
              page: 1,
              loading: false,
              error: 'Browser preview mode — run `npm run tauri dev` to load the marketplace.',
            },
          });
          return;
        }
        set({
          mcpsSearch: {
            query: trimmed,
            items: [],
            currentCursor: null,
            prevCursors: [],
            nextCursor: null,
            hasMore: false,
            page: 1,
            loading: true,
            error: null,
          },
        });
        try {
          const resp = await safeInvoke<McpsPageResponse>('search_marketplace_mcps', {
            query: trimmed,
            cursor: null,
            limit: MCP_REGISTRY_PAGE_SIZE,
          });
          if (!resp) throw new Error('Backend returned no search response');
          set((state) => {
            // Stale-response guard.
            if (state.mcpsSearch && state.mcpsSearch.query !== trimmed) return state;
            return {
              mcpsSearch: {
                query: trimmed,
                items: resp.items,
                currentCursor: null,
                prevCursors: [],
                nextCursor: resp.nextCursor,
                hasMore: resp.hasMore,
                page: 1,
                loading: false,
                error: null,
              },
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to search mcps:', error);
          set((state) => {
            if (state.mcpsSearch && state.mcpsSearch.query !== trimmed) return state;
            return {
              mcpsSearch: {
                query: trimmed,
                items: [],
                currentCursor: null,
                prevCursors: [],
                nextCursor: null,
                hasMore: false,
                page: 1,
                loading: false,
                error: message,
              },
            };
          });
        }
      },

      searchMcpsNextPage: async () => {
        const { mcpsSearch } = get();
        if (!mcpsSearch || mcpsSearch.loading) return;
        if (!mcpsSearch.hasMore || !mcpsSearch.nextCursor) return;
        if (!isTauri()) return;
        const cursorToFetch = mcpsSearch.nextCursor;
        const newPrevCursors = [...mcpsSearch.prevCursors, mcpsSearch.currentCursor];
        const query = mcpsSearch.query;
        set((state) => ({
          mcpsSearch: state.mcpsSearch
            ? { ...state.mcpsSearch, loading: true, error: null }
            : state.mcpsSearch,
        }));
        try {
          const resp = await safeInvoke<McpsPageResponse>('search_marketplace_mcps', {
            query,
            cursor: cursorToFetch,
            limit: MCP_REGISTRY_PAGE_SIZE,
          });
          if (!resp) throw new Error('Backend returned no search response');
          set((state) => {
            if (!state.mcpsSearch || state.mcpsSearch.query !== query) return state;
            return {
              mcpsSearch: {
                query,
                items: resp.items,
                currentCursor: cursorToFetch,
                prevCursors: newPrevCursors,
                nextCursor: resp.nextCursor,
                hasMore: resp.hasMore,
                page: state.mcpsSearch.page + 1,
                loading: false,
                error: null,
              },
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load search next page:', error);
          set((state) => ({
            mcpsSearch: state.mcpsSearch
              ? { ...state.mcpsSearch, loading: false, error: message }
              : state.mcpsSearch,
          }));
        }
      },

      searchMcpsPrevPage: async () => {
        const { mcpsSearch } = get();
        if (!mcpsSearch || mcpsSearch.loading) return;
        if (mcpsSearch.prevCursors.length === 0) return;
        if (!isTauri()) return;
        const newPrevCursors = mcpsSearch.prevCursors.slice(0, -1);
        const targetCursor = mcpsSearch.prevCursors[mcpsSearch.prevCursors.length - 1];
        const query = mcpsSearch.query;
        set((state) => ({
          mcpsSearch: state.mcpsSearch
            ? { ...state.mcpsSearch, loading: true, error: null }
            : state.mcpsSearch,
        }));
        try {
          const resp = await safeInvoke<McpsPageResponse>('search_marketplace_mcps', {
            query,
            cursor: targetCursor,
            limit: MCP_REGISTRY_PAGE_SIZE,
          });
          if (!resp) throw new Error('Backend returned no search response');
          set((state) => {
            if (!state.mcpsSearch || state.mcpsSearch.query !== query) return state;
            return {
              mcpsSearch: {
                query,
                items: resp.items,
                currentCursor: targetCursor,
                prevCursors: newPrevCursors,
                nextCursor: resp.nextCursor,
                hasMore: resp.hasMore,
                page: Math.max(1, state.mcpsSearch.page - 1),
                loading: false,
                error: null,
              },
            };
          });
        } catch (error) {
          const message = typeof error === 'string' ? error : String(error);
          console.error('Failed to load search prev page:', error);
          set((state) => ({
            mcpsSearch: state.mcpsSearch
              ? { ...state.mcpsSearch, loading: false, error: message }
              : state.mcpsSearch,
          }));
        }
      },

      clearMcpsSearch: () => set({ mcpsSearch: null }),

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
        // V2: re-run the freshest fetch path for each source. MCP refresh
        // re-fetches page 1 of the currently-active view; skill refresh
        // re-fetches the active view's page 0.
        if (source === 'skills') {
          const { skillsListing } = get();
          await get().loadSkillsPage(skillsListing.view, 0);
        } else {
          await get().loadMcpsFirstPage();
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

        // Per-item progress key. V2 internal-API items don't carry an `id`, so
        // we derive the key from `(source, skillId)`. See `getSkillItemKey`.
        const itemKey = getSkillItemKey(item);

        // Mark installing (per-item, persists across page navigation).
        set((state) => ({
          installingItemIds: new Set([...state.installingItemIds, itemKey]),
          installFailedItems: (() => {
            const next = { ...state.installFailedItems };
            delete next[itemKey];
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
              // remove the id from `classifyingItemIds` (the event payload `id`
              // is the LOCAL skill id, not the marketplace key — see below).
              set((state) => {
                const installing = new Set([...state.installingItemIds]);
                installing.delete(itemKey);
                const classifying = new Set([...state.classifyingItemIds, outcome.skillId]);
                const classifyFailed = new Set([...state.classifyFailedItemIds]);
                classifyFailed.delete(outcome.skillId);
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
                installing.delete(itemKey);
                return {
                  installingItemIds: installing,
                  installFailedItems: {
                    ...state.installFailedItems,
                    [itemKey]: {
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
            installing.delete(itemKey);
            return {
              installingItemIds: installing,
              installFailedItems: {
                ...state.installFailedItems,
                [itemKey]: { error: message, attemptedAt: new Date().toISOString() },
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

      // -- Select --

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
        let itemKey: string | undefined;
        if (collisionModalState.item) {
          if (collisionModalState.itemType === 'skill') {
            itemKey = getSkillItemKey(collisionModalState.item as MarketplaceSkillItem);
          } else {
            itemKey = (collisionModalState.item as MarketplaceMcpItem).id;
          }
        }
        set((state) => {
          const next = { ...state, collisionModalState: initialCollisionModalState };
          if (itemKey) {
            const installing = new Set([...state.installingItemIds]);
            installing.delete(itemKey);
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
        // Look up the item in the appropriate visible source. If absent, clear
        // the failure so the row no longer claims to be retryable.
        if (itemType === 'skill') {
          const visible = get().getVisibleSkills();
          const item = visible.find((i) => getSkillItemKey(i) === itemId);
          if (!item) {
            get().clearInstallFailure(itemId);
            return;
          }
          await get().installSkill(item);
        } else {
          const visible = get().getVisibleMcps();
          const item = visible.find((i) => i.id === itemId);
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
          kind === 'skills'
            ? { onboardingDismissedSkills: true }
            : { onboardingDismissedMcps: true },
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
            itemType === 'skill'
              ? scene.skillIds.filter((id) => id !== targetItemId)
              : scene.skillIds;
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
        // Derive the (owner, repo) triple from the V2 internal-API `source`
        // field first; fall back to the V1 owner/repo fields for legacy cache
        // entries. The local skill's `marketplaceSource.name` is the upstream
        // skillId / name (backend writes whichever is present).
        let owner = item.owner ?? '';
        let repo = item.repo ?? '';
        if ((!owner || !repo) && item.source) {
          const parts = item.source.split('/');
          if (parts.length === 2) {
            owner = owner || parts[0];
            repo = repo || parts[1];
          }
        }
        const upstreamName = item.skillId || item.name;
        // Triple match (preferred). Marketplace-installed Skills carry
        // `marketplaceSource = { owner, repo, name }`.
        if (owner && repo) {
          const tripleMatch = skills.some(
            (s) =>
              s.marketplaceSource?.owner === owner &&
              s.marketplaceSource?.repo === repo &&
              (s.marketplaceSource?.name === upstreamName ||
                s.marketplaceSource?.name === item.name),
          );
          if (tripleMatch) return true;
        }
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

      getVisibleSkills: () => {
        const { skillsListing, skillsSearch } = get();
        return skillsSearch !== null ? skillsSearch.results : skillsListing.items;
      },

      getVisibleMcps: () => {
        const { mcpsListing, mcpsSearch } = get();
        return mcpsSearch !== null ? mcpsSearch.items : mcpsListing.items;
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
          await listen<MarketplaceClassifyResultEvent>(
            'marketplace:classify-result',
            async (event) => {
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
            },
          ),
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

        // Stale cache — V2 has no cache for either source (Skills V2 is
        // fresh-fetch; MCP V2 is realtime mirror). If the backend ever emits
        // this for either source, we ignore it (no UI hint applies).
        unlisteners.push(
          await listen<MarketplaceStaleCacheEvent>('marketplace:stale-cache', () => {
            // No-op in V2.
          }),
        );

        // Catalog enhanced — neither V2 source emits this any more. Forward-compat
        // listener: if a leftover signal arrives, refresh the active surface.
        unlisteners.push(
          await listen<MarketplaceCatalogEnhancedEvent>(
            'marketplace:catalog-enhanced',
            async (event) => {
              const { source } = event.payload;
              if (source === 'skills') {
                const { skillsListing, skillsSearch } = get();
                if (skillsSearch === null) {
                  await get().loadSkillsPage(skillsListing.view, 0);
                }
              } else {
                await get().loadMcpsFirstPage();
              }
            },
          ),
        );

        // Scrape degraded — only affects the skills source's enhancement
        // layer (V1). V2 doesn't emit this; keep the listener for forward
        // compat with any leftover legacy signal so it doesn't surface as a
        // hard error.
        unlisteners.push(
          await listen<MarketplaceScrapeDegradedEvent>('marketplace:scrape-degraded', (event) => {
            console.warn('Marketplace scrape degraded:', event.payload.reason);
          }),
        );

        // Upstream error — backend hit a network / API failure. Record on the
        // appropriate listing-state error slot so the page can render its
        // EmptyState (PRD §5.7).
        unlisteners.push(
          await listen<MarketplaceUpstreamErrorEvent>('marketplace:upstream-error', (event) => {
            const { source, error } = event.payload;
            if (source === 'skills') {
              set((state) => ({
                skillsListing: { ...state.skillsListing, upstreamError: error },
              }));
            } else {
              set((state) => ({
                mcpsListing: { ...state.mcpsListing, error },
              }));
            }
          }),
        );

        return () => {
          for (const fn of unlisteners) fn();
        };
      },
    }),
    {
      // localStorage key. Versioned so future shape changes can migrate
      // cleanly (currently the only consumer is the SWR snapshot; bump
      // `version` on incompatible store-shape changes).
      name: 'ensemble-marketplace',
      // version 2 (2026-05-11): added `skillsTopicMap` persisted slice. Old
      // v1 state is wiped on first load with this version; the listings
      // re-fetch silently via SWR, no visible disruption.
      // version 3 (2026-05-12): backend dropped the 3KB README truncation
      // cap, but persisted caches written under v2 still hold the truncated
      // bodies (suffixed `…[truncated for catalog cache]`). Migrate by
      // clearing only the README slices — listings + topic map + settings
      // survive untouched, so the UX cost is one silent re-fetch the next
      // time the user opens any detail panel.
      version: 3,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<MarketplaceState> | undefined;
        if (!state) return state;
        if (version < 3) {
          return {
            ...state,
            skillReadmes: {},
            mcpReadmes: {},
          };
        }
        return state;
      },
      storage: createJSONStorage(() => localStorage),
      // Persist only the SWR-relevant slices. Transient state (loading,
      // isBackgroundSyncing, errors, install progress, modal state) is
      // recomputed on each session start; persisting it would freeze the
      // last "loading" flicker into the next launch's first paint.
      partialize: (state) => ({
        skillsListing: {
          ...state.skillsListing,
          isLoadingPage: false,
          isLoadingMore: false,
          isBackgroundSyncing: false,
          upstreamError: null,
        },
        mcpsListing: {
          ...state.mcpsListing,
          loading: false,
          isBackgroundSyncing: false,
          error: null,
        },
        // README caches survive across sessions (TTL still applies on
        // next access — see `loadSkillReadme` / `loadMcpReadme`).
        skillReadmes: state.skillReadmes,
        mcpReadmes: state.mcpReadmes,
        // Onboarding banner dismissal — once dismissed, stays dismissed.
        onboardingDismissedSkills: state.onboardingDismissedSkills,
        onboardingDismissedMcps: state.onboardingDismissedMcps,
        // Skills topic map — persisted so the icon resolver Stage 0
        // works on cold launch without waiting for the backend
        // 8-page scrape. The action skips its fetch when this is
        // non-empty, so it survives until the cache file (or its 24h
        // TTL on the backend) actually changes shape.
        skillsTopicMap: state.skillsTopicMap,
      }),
    },
  ),
);

export default useMarketplaceStore;
