import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, RotateCw, Search, Sparkles, Star, WifiOff, X } from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import Badge from '@/components/common/Badge';
import Button from '@/components/common/Button';
import EmptyState from '@/components/common/EmptyState';
import { Dropdown, type DropdownOption } from '@/components/common/Dropdown';
import { CategoryTreeDropdown } from '@/components/common/CategoryTreeDropdown';
import { MarketplaceListItem } from '@/components/marketplace/MarketplaceListItem';
import { MarketplaceCollisionModal } from '@/components/marketplace/MarketplaceCollisionModal';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { AddToSceneTriggerButton } from '@/components/marketplace/MarketplaceShortcutBanner';
import { parseDescription } from '@/utils/parseDescription';
import { truncateToFirstSentence } from '@/utils/text';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useSkillsStore } from '@/stores/skillsStore';
import { useAppStore } from '@/stores/appStore';
import type { MarketplaceSkillItem, MarketplaceSource } from '@/types/marketplace';

// ============================================================================
// SkillMarketplacePage — task card C2 (Wave 2)
// ============================================================================
//
// Skill catalog browser + inline detail panel + onboarding banner + offline
// EmptyState. Mirrors `SkillsPage.tsx` skeleton (R2 §1.1 / §10.1) so the
// visual density of the row + detail panel matches what the user already
// learned from the Skills page. Diverges from SkillsPage in:
//   - PageHeader actions = Refresh + Sort dropdown (no Import / Auto Classify
//     batch button — those belong on the local Skills page).
//   - List rows are MarketplaceListItem (Wave 1 C4) instead of SkillListItem.
//   - Detail panel is the 3-block layout from R2 §4.4 (decision-critical
//     info / reference / README) — NOT the 7-section SkillDetailPanel
//     (R2 §0.1 explicitly forbids re-using SkillDetailPanel here).
//   - SlidePanel headerRight slot carries the Install button so the user's
//     eye lands on it without scrolling (R2 §4.4).
//   - First-visit Onboarding banner ABOVE the list with × dismiss.
//   - Three EmptyState modes: Loading / NoResults / Offline with Retry.
//
// State:
//   - All catalog / filter / install / collision state lives in
//     `useMarketplaceStore`. This component is a view layer only; it never
//     mutates store internals directly.
//   - `useMarketplaceStore.initEventListeners()` is registered once at
//     `MainLayout` mount (Phase B note); we do NOT register again here.
//   - `isSkillInstalled` is a function selector — we read it via
//     `getState()` after subscribing to the underlying SSoT
//     (`useSkillsStore.skills`) so the row re-renders whenever the local
//     skills catalog changes (Phase B note).
// ============================================================================

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Format an ISO timestamp as a relative-time string ("3h ago", "2d ago"). */
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Unknown';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Build a transient `MarketplaceSource` from a catalog item so the existing
 *  MarketplaceSourceBadge can render the upstream provenance even before
 *  installation. The badge expects the same shape that backend writes to
 *  metadata after install (D-Imp-4 / spec §4.1). */
function buildSourceFromSkillItem(item: MarketplaceSkillItem): MarketplaceSource {
  return {
    source: 'skills_sh',
    owner: item.owner,
    repo: item.repo,
    name: item.name,
    lastSyncedAt: item.lastUpdatedAt,
  };
}

const SORT_OPTIONS: DropdownOption[] = [
  { value: 'popularity', label: 'By Popularity' },
  { value: 'alphabet', label: 'Alphabetical' },
  { value: 'updated', label: 'Recently Updated' },
];

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

// ----------------------------------------------------------------------------
// Page component
// ----------------------------------------------------------------------------

export function SkillMarketplacePage() {
  // ── Subscribe to marketplaceStore slices (zustand selector pattern; only
  //    the slices used here trigger re-render).
  const skillsCatalog = useMarketplaceStore((s) => s.skillsCatalog);
  const isLoading = useMarketplaceStore((s) => s.isLoadingSkills);
  const upstreamError = useMarketplaceStore((s) => s.upstreamErrorSkills);
  const filter = useMarketplaceStore((s) => s.skillsFilter);
  const selectedItemId = useMarketplaceStore((s) => s.selectedSkillItemId);
  const lastSyncedAt = useMarketplaceStore((s) => s.lastSyncedSkills);
  const staleCache = useMarketplaceStore((s) => s.staleCacheSkills);
  const onboardingDismissed = useMarketplaceStore((s) => s.onboardingDismissedSkills);

  // Actions (stable references via zustand) — pulled separately so action
  // dispatch sites read clearly.
  const loadSkillsCatalog = useMarketplaceStore((s) => s.loadSkillsCatalog);
  const setSkillsFilter = useMarketplaceStore((s) => s.setSkillsFilter);
  const selectSkillItem = useMarketplaceStore((s) => s.selectSkillItem);
  const dismissOnboarding = useMarketplaceStore((s) => s.dismissOnboarding);

  // Subscribe to the local Skills SSoT so the `isInstalled` derivation below
  // refreshes when the underlying skill list changes (install / delete /
  // restore-from-trash all flow through useSkillsStore.skills).
  const localSkills = useSkillsStore((s) => s.skills);

  // Categories — used by CategoryTreeDropdown's left-side filter. Marketplace
  // upstream categories are display-only (D-15 / R-33); the dropdown still
  // emits an Ensemble Category id, which gets compared against upstream
  // category strings in `applyFilter` — this is a known V1 dissonance
  // (PRD §10 OQ). The dropdown remains useful as a UI affordance and keeps
  // visual symmetry with the Skills page.
  const categories = useAppStore((s) => s.categories);

  // Local UI state for refresh button loading flag — kept separate from the
  // store's `isLoadingSkills` because the user-driven Refresh wants its own
  // visual feedback distinct from the initial-load spinner (PRD §5.7
  // "Refresh keeps the current list visible").
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Mount: kick off a single catalog load. The store guards against
  // re-loading when called concurrently because `loadSkillsCatalog` flips
  // `isLoadingSkills` and the early-return checks Tauri context.
  useEffect(() => {
    void loadSkillsCatalog();
    // We intentionally re-run only on action-identity change (action is
    // zustand-stable, so this is a one-shot mount).
  }, [loadSkillsCatalog]);

  // ── Derived: filtered & sorted list. `getFilteredSkills` is a function
  // selector (not a hook) — call it inside useMemo so it re-runs whenever
  // the catalog or the filter changes. Subscribing to both slices above
  // means `useMemo` here gets re-evaluated on the right beats. The lint
  // rule cannot see through `getState()`, so we declare the SSoT slices
  // (skillsCatalog + filter) as explicit deps even though the closure body
  // reads them via the store getter.
  /* eslint-disable react-hooks/exhaustive-deps */
  const filteredSkills = useMemo(
    () => useMarketplaceStore.getState().getFilteredSkills(),
    [skillsCatalog, filter],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  // ── Selected item — the SlidePanel's source of truth. We look it up in
  // the catalog so we render the latest catalog entry (e.g. after a
  // background scrape merged updated metadata).
  const selectedItem = useMemo(
    () => skillsCatalog.find((i) => i.id === selectedItemId) ?? null,
    [skillsCatalog, selectedItemId],
  );

  // ── Handlers
  const handleSearchChange = (value: string) => {
    setSkillsFilter({ search: value });
  };

  const handleSortChange = (value: string | string[]) => {
    if (typeof value !== 'string') return;
    if (value !== 'popularity' && value !== 'alphabet' && value !== 'updated') {
      return;
    }
    setSkillsFilter({ sort: value });
  };

  const handleCategoryChange = (categoryId: string) => {
    setSkillsFilter({ categoryId: categoryId || null });
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await loadSkillsCatalog(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSelectItem = (itemId: string) => {
    selectSkillItem(itemId);
  };

  const handleCloseDetail = () => {
    selectSkillItem(null);
  };

  const handleDismissOnboarding = () => {
    dismissOnboarding('skills');
  };

  // ── Detail panel sub-views
  const detailHeader = selectedItem ? (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5]">
        <Sparkles className="h-[18px] w-[18px] text-[#18181B]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold text-[#18181B] truncate">{selectedItem.name}</h2>
        {(() => {
          const { firstSentence } = parseDescription(selectedItem.description);
          return (
            <p
              className="w-full truncate text-xs font-normal text-[#71717A]"
              title={selectedItem.description}
            >
              {firstSentence}
            </p>
          );
        })()}
      </div>
    </div>
  ) : null;

  const detailHeaderRight = selectedItem ? <DetailInstallControl item={selectedItem} /> : null;

  const detailContent = selectedItem ? (
    <SkillDetailContent item={selectedItem} categories={categories} />
  ) : null;

  // ── Render

  // Prepare list-content area: three EmptyStates (loading / offline / no-
  // results) vs the actual list grid.
  const isOffline = !!upstreamError && skillsCatalog.length === 0;
  const isInitialLoading = isLoading && skillsCatalog.length === 0;
  const showNoResults =
    !isInitialLoading && !isOffline && skillsCatalog.length > 0 && filteredSkills.length === 0;

  // "Last synced X ago" hint — staleCache wins over fresh syncedAt because
  // the backend signaled the cache is older than 24h. Per design-language
  // Rule §Anti-patterns we communicate the stale state via wording, NOT a
  // hue swap (the previous `#B45309` amber was self-invented and forbidden;
  // mirrors `McpMarketplacePage` lastSyncedLabel — F-P0-2 / E2-2).
  const lastSyncedHint = useMemo(() => {
    if (staleCache) {
      return `Last synced ${staleCache.ageHours}h ago (stale)`;
    }
    if (lastSyncedAt) {
      return `Last synced ${formatRelativeTime(lastSyncedAt)}`;
    }
    return null;
  }, [staleCache, lastSyncedAt]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Header */}
      <PageHeader
        title="Skill Marketplace"
        searchValue={filter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search skills..."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="small"
              icon={isRefreshing ? <Loader2 className="animate-spin" /> : <RotateCw />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            <Dropdown
              compact
              options={SORT_OPTIONS}
              value={filter.sort}
              onChange={handleSortChange}
              triggerClassName="w-[180px]"
            />
          </div>
        }
      />

      {/* Upstream error banner — visible whenever an error exists, even if
          we've fallen back to seed/cache and have items to display. Mirrors
          the SkillsPage red banner (`SkillsPage.tsx:735-745`). */}
      {upstreamError && skillsCatalog.length > 0 && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{upstreamError}</p>
          <button
            type="button"
            onClick={() => useMarketplaceStore.setState({ upstreamErrorSkills: null })}
            className="text-sm font-medium text-red-700 hover:text-red-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main scroll region — collapses by 800px when SlidePanel is open. */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedItemId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Onboarding banner — first-visit hint. Sits ABOVE the filter row
            so it's the very first thing the user reads. */}
        {!onboardingDismissed && skillsCatalog.length > 0 && (
          <div
            data-marketplace-onboarding-banner
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="h-4 w-4 flex-shrink-0 text-[#71717A]" />
              <p className="text-[13px] font-medium text-[#18181B] truncate">
                New here? These are popular Skills others are using.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDismissOnboarding}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[#A1A1AA] hover:bg-[#F4F4F5] hover:text-[#71717A] transition-colors"
              aria-label="Dismiss onboarding hint"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Filter row — Category dropdown (left) + Last synced hint (right).
            Sits above the list. Tag pill multi-select is intentionally
            deferred for V1 (Phase B store models tags as string[] but no
            curated tag taxonomy from the upstream catalog yet). */}
        {skillsCatalog.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CategoryTreeDropdown
                categories={categories}
                value={filter.categoryId ?? ''}
                onChange={handleCategoryChange}
                placeholder="All categories"
                compact
                className="w-44"
              />
            </div>
            {lastSyncedHint && <span className="text-[11px] text-[#A1A1AA]">{lastSyncedHint}</span>}
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
        ) : isOffline ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<WifiOff className="h-12 w-12" />}
              title="Marketplace temporarily unavailable"
              description="This may be a network issue or upstream service outage."
              action={
                <Button
                  variant="secondary"
                  size="small"
                  icon={isRefreshing ? <Loader2 className="animate-spin" /> : <RotateCw />}
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  {isRefreshing ? 'Retrying...' : 'Retry'}
                </Button>
              }
            />
          </div>
        ) : showNoResults ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Search className="h-12 w-12" />}
              title="No skills match your filters"
              description="Try adjusting your search or category selection."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredSkills.map((item) => (
              <SkillRowWrapper
                key={item.id}
                item={item}
                selected={selectedItemId === item.id}
                compact={!!selectedItemId}
                localSkills={localSkills}
                onSelect={handleSelectItem}
              />
            ))}
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

/**
 * Wraps `MarketplaceListItem` so the SSoT-derived `isInstalled` flag
 * recomputes only when this row's identity / the local skills list change.
 *
 * `useMarketplaceStore.getState().isSkillInstalled` is a function selector
 * (Phase B note: not a hook). Subscribing the parent page to
 * `useSkillsStore.skills` ensures that when the underlying SSoT updates,
 * this row re-renders and the memo recomputes.
 */
const SkillRowWrapper = React.memo(function SkillRowWrapper({
  item,
  selected,
  compact,
  localSkills,
  onSelect,
}: {
  item: MarketplaceSkillItem;
  selected: boolean;
  compact: boolean;
  localSkills: ReturnType<typeof useSkillsStore.getState>['skills'];
  onSelect: (id: string) => void;
}) {
  // `isSkillInstalled` reads from `useSkillsStore.getState()` (Phase B
  // contract — function selector, not a hook). Subscribing the parent to
  // `localSkills` makes the memo recompute whenever the SSoT changes;
  // listing `localSkills` as an explicit dep is correct — exhaustive-deps
  // can't trace through `getState()` so it complains about an "unused"
  // dep that is in fact load-bearing.
  const isInstalled = useMemo(
    () => useMarketplaceStore.getState().isSkillInstalled(item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, localSkills],
  );

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
  // Per-item progress + failure flags (subscribed slices).
  const isInstalling = useMarketplaceStore((s) => s.installingItemIds.has(item.id));
  const installFailure = useMarketplaceStore((s) => s.installFailedItems[item.id]);
  const installSkill = useMarketplaceStore((s) => s.installSkill);

  // SSoT-derived install state. Subscribe to localSkills here too so the
  // button updates when the user installs the resource via the row's
  // button (which targets a different React subtree). Same exhaustive-deps
  // caveat as `SkillRowWrapper`.
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
    // Triple-then-name match against local skills to derive the *local* id
    // (= source_path) — needed for AddToSceneTrigger to drive Scene
    // assignment, which references local Skill.id, not the marketplace
    // catalog id (D-Imp-8).
    const localSkill = localSkills.find(
      (s) =>
        (s.marketplaceSource?.owner === item.owner &&
          s.marketplaceSource.repo === item.repo &&
          s.marketplaceSource.name === item.name) ||
        s.name.trim() === item.name.trim(),
    );
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
 * The 3-block detail panel body for a marketplace skill (R2 §4.4):
 *   1. Decision-critical info row (Author / Last Updated / Stars / Source)
 *   2. Reference info (upstream categories + tags + Source provenance row)
 *   3. README scroll region — V1 raw markdown rendered as `whitespace-pre-wrap`
 *      because no markdown library is bundled (`package.json` has no
 *      `react-markdown` / `remark` deps). Future: swap in a real renderer
 *      after evaluating image-handling + safe HTML strategy.
 */
function SkillDetailContent({
  item,
  categories,
}: {
  item: MarketplaceSkillItem;
  categories: ReturnType<typeof useAppStore.getState>['categories'];
}) {
  // Derive "Used in N Scenes" purely from the local Skills SSoT — only
  // applicable when the resource is already installed locally. Marketplace
  // catalog items don't carry scene refs, so we look up the local Skill by
  // the SSoT triple-or-name match before consulting useScenesStore.
  void categories; // categories reserved for future Block 2 enhancement

  return (
    <div className="flex flex-col gap-7">
      {/* Block 1 — Decision-critical Info row (4 columns). */}
      <div className="flex gap-8">
        <InfoItem label="Author" value={item.author || item.owner || 'Unknown'} />
        <InfoItem label="Last Updated" value={formatRelativeTime(item.lastUpdatedAt)} />
        <InfoItem
          label="Stars"
          value={
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3 text-[#A1A1AA]" />
              {item.stars.toLocaleString()}
            </span>
          }
        />
        <InfoItem label="License" value={item.license || '—'} />
      </div>

      {/* Block 2 — Reference info: upstream categories + tags + Source row. */}
      <div className="flex flex-col gap-4">
        {(item.categories.length > 0 || item.tags.length > 0) && (
          <div className="flex flex-col gap-3">
            {item.categories.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-[#71717A]">
                  Categories (upstream)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {item.categories.map((c) => (
                    <Badge key={c} variant="category">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {item.tags.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium text-[#71717A]">Tags (upstream)</span>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <Badge key={t} variant="tag">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
          <span className="text-xs font-medium text-[#71717A]">Source</span>
          <MarketplaceSourceBadge source={buildSourceFromSkillItem(item)} />
        </div>
      </div>

      {/* Block 3 — README scroll region. Raw markdown for V1 (no md
          renderer installed); the box uses the same Instructions-section
          container shape as SkillsPage so future drop-in renderers don't
          need layout changes. */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">README</h3>
        <div
          className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4"
          style={{ maxHeight: '480px' }}
        >
          {item.readmeMarkdown ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-[#52525B]">
              {item.readmeMarkdown}
            </pre>
          ) : (
            <p className="text-xs text-[#A1A1AA]">
              {truncateToFirstSentence(item.description ?? '', 280) || 'No README provided.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default SkillMarketplacePage;
