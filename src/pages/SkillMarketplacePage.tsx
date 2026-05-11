import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Check, Loader2, Search, Sparkles, WifiOff } from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import { MarketplaceListItem } from '@/components/marketplace/MarketplaceListItem';
import { MarketplaceCollisionModal } from '@/components/marketplace/MarketplaceCollisionModal';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { AddToSceneTriggerButton } from '@/components/marketplace/MarketplaceShortcutBanner';
import { SyncIndicator } from '@/components/marketplace/SyncIndicator';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useSkillsStore } from '@/stores/skillsStore';
import type { MarketplaceSkillItem, MarketplaceSource, SkillsView } from '@/types/marketplace';
import { getSkillItemKey } from '@/types/marketplace';

// ============================================================================
// SkillMarketplacePage — Phase I (V2.0 Marketplace, skills.sh internal API)
// ============================================================================
//
// Skill catalogue browser. Phase I rewrites this page to consume the
// server-driven skills.sh internal API:
//   - 3 view tabs (`all-time` / `trending` / `hot`) drive the listing query
//   - Infinite scroll appends pages as the user scrolls (200 items/page)
//   - Search uses the upstream /api/search endpoint (debounced 300 ms)
//   - README is fetched on-demand when the detail panel opens
//
// V1 affordances explicitly removed from this page:
//   - Sort dropdown (the upstream view replaces it)
//   - Refresh button (every fetch is fresh; no cache layer to invalidate)
//   - Categories / Tags filter (internal API has no taxonomy data;
//     reserved for V1.5)
//   - "Last synced" hint (no cache to be stale against)
//
// State lives in `useMarketplaceStore.skillsListing` / `skillsSearch` /
// `skillReadmes`. This component is a view layer: it never mutates store
// internals directly.
// ============================================================================

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Build a transient `MarketplaceSource` from a catalog item so the existing
 * `MarketplaceSourceBadge` can render upstream provenance even before
 * installation. Mirrors what backend writes to metadata after install
 * (D-Imp-4 / spec §4.1) — derived from V2 `source` + `skillId` first,
 * falling back to V1 `owner` / `repo` when present.
 */
function buildSourceFromSkillItem(item: MarketplaceSkillItem): MarketplaceSource {
  let owner = item.owner ?? '';
  let repo = item.repo ?? '';
  if ((!owner || !repo) && item.source) {
    const parts = item.source.split('/');
    if (parts.length === 2) {
      owner = owner || parts[0];
      repo = repo || parts[1];
    }
  }
  return {
    source: 'skills_sh',
    owner,
    repo,
    name: item.skillId || item.name,
    lastSyncedAt: item.lastUpdatedAt ?? '',
  };
}

const VIEW_TABS: { value: SkillsView; label: string }[] = [
  { value: 'all-time', label: 'All Time' },
  { value: 'trending', label: 'Trending' },
  { value: 'hot', label: 'Hot' },
];

/** Format a large integer with K / M suffixes for compact display. */
function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
}

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------

export function SkillMarketplacePage() {
  // ── Subscribe to marketplaceStore slices.
  const skillsListing = useMarketplaceStore((s) => s.skillsListing);
  const skillsSearch = useMarketplaceStore((s) => s.skillsSearch);
  const selectedItemId = useMarketplaceStore((s) => s.selectedSkillItemId);
  const onboardingDismissed = useMarketplaceStore((s) => s.onboardingDismissedSkills);

  // Actions.
  const loadSkillsPage = useMarketplaceStore((s) => s.loadSkillsPage);
  const loadMoreSkills = useMarketplaceStore((s) => s.loadMoreSkills);
  const setSkillsView = useMarketplaceStore((s) => s.setSkillsView);
  const searchSkills = useMarketplaceStore((s) => s.searchSkills);
  const clearSkillsSearch = useMarketplaceStore((s) => s.clearSkillsSearch);
  const selectSkillItem = useMarketplaceStore((s) => s.selectSkillItem);
  const dismissOnboarding = useMarketplaceStore((s) => s.dismissOnboarding);
  const loadSkillsTopicMap = useMarketplaceStore((s) => s.loadSkillsTopicMap);

  // Subscribe to the local Skills SSoT so the `isInstalled` derivation
  // refreshes when the underlying skill list changes.
  const localSkills = useSkillsStore((s) => s.skills);

  // Search input — locally controlled with debounce → store.searchSkills.
  const [searchQuery, setSearchQuery] = useState<string>('');

  // ── Mount: consult the SWR cache. Fresh → noop; stale → silent SWR;
  // beyond stale (or empty cache) → foreground fetch. Also kick off the
  // skills.sh topic-map load — idempotent, persisted, falls back silently
  // if the upstream scrape errors out (icon resolver still works without
  // it via Stages 1-3).
  useEffect(() => {
    void loadSkillsPage(skillsListing.view, 0, 'auto');
    void loadSkillsTopicMap();
    // We deliberately read `view` lazily via the store (one-shot mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSkillsPage, loadSkillsTopicMap]);

  // ── Debounce the search input → call searchSkills / clearSkillsSearch.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      // Empty / single-char input → drop search mode synchronously so the
      // listing snaps back without waiting for the debounce.
      if (skillsSearch !== null) clearSkillsSearch();
      return;
    }
    const handle = window.setTimeout(() => {
      void searchSkills(trimmed);
    }, 300);
    return () => window.clearTimeout(handle);
    // We intentionally exclude `skillsSearch` from deps — it would re-run
    // the effect every time the store updates the search results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchSkills, clearSkillsSearch]);

  // ── Derived view state.
  const isSearchMode = skillsSearch !== null;
  const visibleItems = isSearchMode ? skillsSearch.results : skillsListing.items;
  const isInitialLoading =
    !isSearchMode && skillsListing.isLoadingPage && visibleItems.length === 0;
  const isSearching = isSearchMode && skillsSearch.isSearching;
  const upstreamError = isSearchMode ? skillsSearch.error : skillsListing.upstreamError;
  const isOffline = !!upstreamError && visibleItems.length === 0;

  // ── Selected item — look up by `${source}/${skillId}` key (V2) inside the
  // currently-visible source. If the user toggled mode (search ↔ listing)
  // and the selection's item is no longer visible, close the panel so the
  // user doesn't see an empty SlidePanel.
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return visibleItems.find((i) => getSkillItemKey(i) === selectedItemId) ?? null;
  }, [visibleItems, selectedItemId]);
  useEffect(() => {
    if (selectedItemId && !selectedItem) {
      // The selected item disappeared from the visible source. Close the
      // panel rather than showing an empty SlidePanel.
      selectSkillItem(null);
    }
  }, [selectedItemId, selectedItem, selectSkillItem]);

  // ── Infinite scroll sentinel. Only active in listing mode.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isSearchMode) return; // Search mode doesn't paginate
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMoreSkills();
          }
        }
      },
      {
        root: container,
        // Pre-fetch slightly early so the user does not see the spinner at
        // the absolute bottom of the list.
        rootMargin: '200px',
        threshold: 0,
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isSearchMode, loadMoreSkills, skillsListing.items.length, skillsListing.hasMore]);

  // ── Handlers.
  const handleViewChange = (view: SkillsView) => {
    if (view === skillsListing.view && !isSearchMode) return;
    // Clear local search input + trigger view switch.
    setSearchQuery('');
    setSkillsView(view);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleSelectItem = (itemKey: string) => {
    selectSkillItem(itemKey);
  };

  const handleCloseDetail = () => {
    selectSkillItem(null);
  };

  const handleDismissOnboarding = () => {
    dismissOnboarding('skills');
  };

  const handleRetry = () => {
    if (isSearchMode && skillsSearch.query) {
      void searchSkills(skillsSearch.query);
    } else {
      void loadSkillsPage(skillsListing.view, 0);
    }
  };

  // ── Detail panel sub-views.
  const detailHeader = selectedItem ? (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5]">
        <Sparkles className="h-[18px] w-[18px] text-[#18181B]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold text-[#18181B] truncate flex items-center gap-2">
          <span className="truncate">{selectedItem.name}</span>
          {selectedItem.isOfficial && (
            <Badge variant="neutral" showDot={false} className="gap-1">
              <BadgeCheck className="-mt-px h-3 w-3" />
              <span>Official</span>
            </Badge>
          )}
        </h2>
        <p
          className="w-full truncate text-xs font-normal text-[#71717A]"
          title={selectedItem.source}
        >
          {selectedItem.source ?? ''}
        </p>
      </div>
    </div>
  ) : null;

  const detailHeaderRight = selectedItem ? <DetailInstallControl item={selectedItem} /> : null;

  const detailContent = selectedItem ? <SkillDetailContent item={selectedItem} /> : null;

  // ── Status line above the list (replaces V1 "Last synced X ago"). For
  // listing mode shows "{total} skills · {view}"; for search shows
  // "{count} results · {searchType}".
  const statusLine = useMemo(() => {
    if (isSearchMode) {
      if (skillsSearch.isSearching && skillsSearch.results.length === 0) {
        return null;
      }
      if (skillsSearch.results.length === 0) return null;
      const typeLabel = skillsSearch.searchType === 'semantic' ? 'semantic' : 'fuzzy';
      return `${formatCompactNumber(skillsSearch.count)} results · ${typeLabel} match`;
    }
    if (skillsListing.total > 0) {
      const viewLabel =
        VIEW_TABS.find((t) => t.value === skillsListing.view)?.label ?? skillsListing.view;
      return `Live from skills.sh · ${formatCompactNumber(skillsListing.total)} skills · ${viewLabel}`;
    }
    return null;
  }, [isSearchMode, skillsSearch, skillsListing.total, skillsListing.view]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Skill Marketplace"
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search skills..."
        actions={<ViewTabBar active={skillsListing.view} onChange={handleViewChange} />}
      />

      {/* Upstream error banner — visible whenever an error exists alongside
          existing items. Lets the user keep browsing while signalling that
          the most recent fetch attempt failed. */}
      {upstreamError && visibleItems.length > 0 && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{upstreamError}</p>
          <button
            type="button"
            onClick={() => {
              if (isSearchMode) {
                clearSkillsSearch();
              } else {
                useMarketplaceStore.setState((state) => ({
                  skillsListing: { ...state.skillsListing, upstreamError: null },
                }));
              }
            }}
            className="text-sm font-medium text-red-700 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main scroll region — collapses by 800px when SlidePanel is open. */}
      <div
        ref={scrollContainerRef}
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedItemId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Onboarding banner — first-visit hint. */}
        {!onboardingDismissed && visibleItems.length > 0 && (
          <div
            data-marketplace-onboarding-banner
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="h-4 w-4 flex-shrink-0 text-[#71717A]" />
              <p className="text-[13px] font-medium text-[#18181B] truncate">
                New here? Browse the most popular Skills others are using.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissOnboarding}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#71717A] transition-colors"
              aria-label="Dismiss onboarding hint"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        )}

        {/* Status line — live count + view / search context + sync icon. */}
        {statusLine && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusLine}</span>
            {!isSearchMode && (
              <SyncIndicator
                isSyncing={skillsListing.isLoadingPage || skillsListing.isBackgroundSyncing}
                hasError={!!skillsListing.upstreamError && !skillsListing.isLoadingPage}
                lastSyncedAt={skillsListing.lastSyncedAt}
                onClick={() => void loadSkillsPage(skillsListing.view, 0, 'force')}
              />
            )}
          </div>
        )}

        {/* List / EmptyStates */}
        {isInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-[#A1A1AA]">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-[13px]">Loading marketplace...</span>
            </div>
          </div>
        ) : isSearching && skillsSearch && skillsSearch.results.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-[#A1A1AA]">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-[13px]">Searching...</span>
            </div>
          </div>
        ) : isOffline ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<WifiOff className="h-12 w-12" />}
              title="Marketplace temporarily unavailable"
              description="This may be a network issue or upstream service outage."
              action={
                <Button variant="secondary" size="small" onClick={handleRetry}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : isSearchMode && skillsSearch.results.length === 0 && !skillsSearch.isSearching ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Search className="h-12 w-12" />}
              title={`No results for "${skillsSearch.query}"`}
              description="Try different keywords or switch to All Time."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleItems.map((item) => {
              const itemKey = getSkillItemKey(item);
              return (
                <SkillRowWrapper
                  key={itemKey}
                  item={item}
                  itemKey={itemKey}
                  selected={selectedItemId === itemKey}
                  compact={!!selectedItemId}
                  localSkills={localSkills}
                  onSelect={handleSelectItem}
                />
              );
            })}

            {/* Infinite-scroll sentinel + load-more / end-of-catalogue feedback.
                Only rendered in listing mode. */}
            {!isSearchMode && visibleItems.length > 0 && (
              <div className="flex flex-col items-center gap-2 py-6">
                <div ref={sentinelRef} className="h-px w-full" />
                {skillsListing.isLoadingMore && (
                  <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading more...</span>
                  </div>
                )}
                {!skillsListing.hasMore && !skillsListing.isLoadingMore && (
                  <span className="text-[11px] text-[#A1A1AA]">
                    End of catalog ({formatCompactNumber(skillsListing.total)} total)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail SlidePanel */}
      <SlidePanel
        isOpen={!!selectedItemId}
        onClose={handleCloseDetail}
        width={800}
        header={detailHeader}
        headerRight={detailHeaderRight}
      >
        {detailContent}
      </SlidePanel>

      {/* Collision Modal — shared single instance; renders only when
          `collisionModalState.open` is true (component subscribes itself). */}
      <MarketplaceCollisionModal />
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

/** Three-tab segmented control for selecting the listing view. Active state
 *  uses the documented `bg-[#F4F4F5]` token + `font-semibold` (per
 *  `design-language.md` Constraints / Hover-active). */
function ViewTabBar({
  active,
  onChange,
}: {
  active: SkillsView;
  onChange: (view: SkillsView) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-[#E5E5E5] p-0.5"
      role="tablist"
      aria-label="Skill listing view"
    >
      {VIEW_TABS.map((tab) => {
        const isActive = tab.value === active;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={`
              h-7 rounded-[4px] px-3 text-[12px] transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]
              ${
                isActive
                  ? 'bg-[#F4F4F5] font-semibold text-[#18181B]'
                  : 'font-medium text-[#71717A] hover:bg-[#FAFAFA] hover:text-[#18181B]'
              }
            `}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wraps `MarketplaceListItem` so the SSoT-derived `isInstalled` flag
 * recomputes only when this row's identity / the local skills list change.
 *
 * `useMarketplaceStore.getState().isSkillInstalled` is a function selector.
 * Subscribing the parent page to `useSkillsStore.skills` ensures that when
 * the underlying SSoT updates, this row re-renders and the memo recomputes.
 */
const SkillRowWrapper = React.memo(function SkillRowWrapper({
  item,
  itemKey,
  selected,
  compact,
  localSkills,
  onSelect,
}: {
  item: MarketplaceSkillItem;
  itemKey: string;
  selected: boolean;
  compact: boolean;
  localSkills: ReturnType<typeof useSkillsStore.getState>['skills'];
  onSelect: (id: string) => void;
}) {
  const isInstalled = useMemo(
    () => useMarketplaceStore.getState().isSkillInstalled(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, localSkills],
  );

  // The list item internally derives its own key — but we pass the same
  // value to `onSelect` to keep the parent-side selection sync identical.
  void itemKey;

  return (
    <MarketplaceListItem
      item={item}
      itemType="skill"
      selected={selected}
      compact={compact}
      isInstalled={isInstalled}
      onSelect={onSelect}
    />
  );
});

/**
 * Header-right install control inside the SlidePanel. Mirrors the row's
 * three-state machine (Installed / Retry / Install) with the same SSoT
 * derivation. Lives separate from the row so the user can install from
 * either the row or the detail panel without state drift.
 */
function DetailInstallControl({ item }: { item: MarketplaceSkillItem }) {
  const itemKey = getSkillItemKey(item);
  const isInstalling = useMarketplaceStore((s) => s.installingItemIds.has(itemKey));
  const installFailure = useMarketplaceStore((s) => s.installFailedItems[itemKey]);
  const installSkill = useMarketplaceStore((s) => s.installSkill);

  const localSkills = useSkillsStore((s) => s.skills);
  const isInstalled = useMemo(
    () => useMarketplaceStore.getState().isSkillInstalled(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, localSkills],
  );

  const handleClick = () => {
    if (isInstalled || isInstalling) return;
    void installSkill(item);
  };

  if (isInstalled) {
    // Find the local Skill so AddToSceneTrigger has its local id (the
    // marketplace item carries the upstream identity, not the local one).
    const upstreamName = item.skillId || item.name;
    let owner = item.owner ?? '';
    let repo = item.repo ?? '';
    if ((!owner || !repo) && item.source) {
      const parts = item.source.split('/');
      if (parts.length === 2) {
        owner = owner || parts[0];
        repo = repo || parts[1];
      }
    }
    const localSkill = localSkills.find((s) => {
      if (s.marketplaceSource) {
        if (
          s.marketplaceSource.owner === owner &&
          s.marketplaceSource.repo === repo &&
          (s.marketplaceSource.name === upstreamName || s.marketplaceSource.name === item.name)
        ) {
          return true;
        }
      }
      return s.name.trim() === item.name.trim();
    });
    return (
      <div className="flex items-center gap-2">
        <Badge variant="neutral" showDot={false}>
          <Check className="h-3 w-3" />
          Installed
        </Badge>
        {localSkill && <AddToSceneTriggerButton itemId={localSkill.id} itemType="skill" />}
      </div>
    );
  }

  if (installFailure) {
    return (
      <Button
        variant="primary"
        size="small"
        onClick={handleClick}
        disabled={isInstalling}
        loading={isInstalling}
        title={installFailure.error}
      >
        Retry
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      size="small"
      onClick={handleClick}
      disabled={isInstalling}
      loading={isInstalling}
    >
      {isInstalling ? 'Installing...' : 'Install'}
    </Button>
  );
}

/**
 * Detail panel body for a marketplace skill (V2 / Phase I):
 *   1. Compact info row — Source / Installs / 24h / Author
 *   2. Provenance card — `MarketplaceSourceBadge`
 *   3. README scroll region — fetched on-demand via `loadSkillReadme`
 */
function SkillDetailContent({ item }: { item: MarketplaceSkillItem }) {
  const skillReadmes = useMarketplaceStore((s) => s.skillReadmes);
  const loadingReadmes = useMarketplaceStore((s) => s.loadingReadmes);
  const readmeErrors = useMarketplaceStore((s) => s.readmeErrors);
  const loadSkillReadme = useMarketplaceStore((s) => s.loadSkillReadme);

  const itemKey = `${item.source}/${item.skillId}`;
  const cached = skillReadmes[itemKey];
  const isLoadingReadme = loadingReadmes.has(itemKey);
  const readmeError = readmeErrors[itemKey];

  // Trigger README fetch on detail open / item change. The store memoises
  // by key + 5-min TTL so this is idempotent for repeat opens.
  useEffect(() => {
    if (!item.source || !item.skillId) return;
    void loadSkillReadme(item.source, item.skillId);
  }, [item.source, item.skillId, loadSkillReadme]);

  const installs = item.installs ?? 0;
  const installsYesterday = item.installsYesterday;
  const change = item.change;

  return (
    <div className="flex flex-col gap-7 h-full">
      {/* Block 1 — Compact info row. */}
      <div className="flex gap-8">
        <InfoItem label="Source" value={item.source ?? '—'} />
        <InfoItem label="Installs" value={installs > 0 ? formatCompactNumber(installs) : '—'} />
        {typeof installsYesterday === 'number' && (
          <InfoItem label="24h" value={formatCompactNumber(installsYesterday)} />
        )}
        {typeof change === 'number' && change !== 0 && (
          <InfoItem
            label="Change"
            value={
              <span className={change > 0 ? 'text-[#18181B]' : 'text-[#71717A]'}>
                {change > 0 ? '+' : ''}
                {formatCompactNumber(Math.abs(change))}
              </span>
            }
          />
        )}
        <InfoItem
          label="Author"
          value={item.author || item.owner || item.source?.split('/')[0] || '—'}
        />
      </div>

      {/* Block 2 — Provenance card. */}
      <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
        <span className="text-xs font-medium text-[#71717A]">Source</span>
        <MarketplaceSourceBadge source={buildSourceFromSkillItem(item)} />
      </div>

      {/* Block 3 — README. Flex-1 fill only when README content is
          actually loaded, otherwise the loading/error/empty states
          would stretch their few-line content over the entire remaining
          panel height. Skills.sh API exposes nothing else we could show,
          so a short panel during loading is the natural state. */}
      {(() => {
        const hasReadmeContent = !!cached?.content && cached.content.trim().length > 0;
        return (
          <div className={`flex flex-col gap-3 ${hasReadmeContent ? 'min-h-0 flex-1' : ''}`}>
            <h3 className="text-sm font-semibold text-[#18181B]">README</h3>
            <div
              className={`rounded-lg border border-[#E5E5E5] bg-white p-4 ${
                hasReadmeContent ? 'min-h-[280px] flex-1 overflow-y-auto' : ''
              }`}
            >
              {isLoadingReadme && !cached ? (
                <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading README...</span>
                </div>
              ) : readmeError && !cached ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-[#DC2626]">Failed to load README.</p>
                  <button
                    type="button"
                    onClick={() => void loadSkillReadme(item.source, item.skillId)}
                    className="self-start text-xs font-medium text-[#18181B] underline"
                  >
                    Retry
                  </button>
                </div>
              ) : hasReadmeContent ? (
                <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[#52525B]">
                  {cached!.content}
                </pre>
              ) : (
                <p className="text-xs text-[#A1A1AA]">No README available.</p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helper components — local Info row used in the detail panel.
// ----------------------------------------------------------------------------

interface InfoItemProps {
  label: string;
  value: React.ReactNode;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div className="flex flex-1 flex-col gap-1 min-w-0">
      <span className="text-[11px] font-medium text-[#71717A]">{label}</span>
      <span className="text-[13px] font-medium text-[#18181B] truncate">{value}</span>
    </div>
  );
}

export default SkillMarketplacePage;
