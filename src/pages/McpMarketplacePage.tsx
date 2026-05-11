import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plug, Loader2, WifiOff, Copy, Check, Search } from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import { Button, EmptyState, ICON_MAP } from '@/components/common';
import { Input } from '@/components/common/Input';
import { MarketplaceListItem } from '@/components/marketplace/MarketplaceListItem';
import { MarketplaceCollisionModal } from '@/components/marketplace/MarketplaceCollisionModal';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { AddToSceneTriggerButton } from '@/components/marketplace/MarketplaceShortcutBanner';
import { safeInvoke } from '@/utils/tauri';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useScenesStore } from '@/stores/scenesStore';
import type { EnvVarSpec, MarketplaceMcpItem, MarketplaceSource } from '@/types/marketplace';

// ============================================================================
// McpMarketplacePage — V2.0 Marketplace MCP (realtime registry mirror)
// ============================================================================
//
// Mirrors the Official MCP Registry website
// (`registry.modelcontextprotocol.io/`) one-for-one:
//
//   1. Search-by-name input in the header (Registry's `?search=` is name-only).
//   2. "Recently Updated" strip — 9 most-recently-updated servers in the last
//      24h. Hidden in search mode.
//   3. Main paginated list — 96 servers per page, with Previous / Next buttons.
//   4. Detail SlidePanel — unchanged from V1 (info / source card / README /
//      Configuration block with stdio env-var inputs or HTTP url).
//
// What this page does NOT do (V2 explicit out-of-scope):
//   - No infinite scroll (Registry uses explicit pagination)
//   - No view tab / sort dropdown / Refresh button
//   - No "Page N of M" total-page indicator (cursor opaque)
//   - No new design tokens, colours, or animation curves
// ============================================================================

// ----- Helpers --------------------------------------------------------------

function formatDate(dateString?: string): string {
  if (!dateString) return 'Unknown';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

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

interface ConfigItemProps {
  label: string;
  value: React.ReactNode;
  isLast?: boolean;
}

function ConfigItem({ label, value, isLast = false }: ConfigItemProps) {
  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${
        !isLast ? 'border-b border-[#E5E5E5]' : ''
      }`}
    >
      <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">{label}</span>
      <div className="min-w-0 flex-1">{value}</div>
    </div>
  );
}

function isHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

// Pull the most-likely SSoT MCP id from the local mcps list, given a
// marketplace item. Mirrors `marketplaceStore.isMcpInstalled` (which uses
// `marketplaceSource.owner === item.author && marketplaceSource.name === item.name`
// then a name fallback). Returns the local id (mcps JSON path) if present.
function findLocalMcpId(
  mcps: { id: string; name: string; marketplaceSource?: MarketplaceSource }[],
  item: MarketplaceMcpItem,
): string | null {
  const triple = mcps.find(
    (m) => m.marketplaceSource?.owner === item.author && m.marketplaceSource?.name === item.name,
  );
  if (triple) return triple.id;
  const target = item.name.trim();
  const nameMatch = mcps.find((m) => m.name.trim() === target);
  return nameMatch ? nameMatch.id : null;
}

// ============================================================================
// Component
// ============================================================================

export function McpMarketplacePage() {
  // ----- Marketplace store slice -----
  const mcpsListing = useMarketplaceStore((s) => s.mcpsListing);
  const mcpsRecentlyUpdated = useMarketplaceStore((s) => s.mcpsRecentlyUpdated);
  const mcpsSearch = useMarketplaceStore((s) => s.mcpsSearch);
  const selectedMcpItemId = useMarketplaceStore((s) => s.selectedMcpItemId);
  const collisionModalState = useMarketplaceStore((s) => s.collisionModalState);

  const loadMcpsFirstPage = useMarketplaceStore((s) => s.loadMcpsFirstPage);
  const loadMcpsNextPage = useMarketplaceStore((s) => s.loadMcpsNextPage);
  const loadMcpsPrevPage = useMarketplaceStore((s) => s.loadMcpsPrevPage);
  const loadRecentlyUpdated = useMarketplaceStore((s) => s.loadRecentlyUpdated);
  const searchMcps = useMarketplaceStore((s) => s.searchMcps);
  const searchMcpsNextPage = useMarketplaceStore((s) => s.searchMcpsNextPage);
  const searchMcpsPrevPage = useMarketplaceStore((s) => s.searchMcpsPrevPage);
  const clearMcpsSearch = useMarketplaceStore((s) => s.clearMcpsSearch);
  const selectMcpItem = useMarketplaceStore((s) => s.selectMcpItem);
  const installMcp = useMarketplaceStore((s) => s.installMcp);
  const isMcpInstalled = useMarketplaceStore((s) => s.isMcpInstalled);

  // ----- Cross-store reads (SSoT) -----
  const mcpServers = useMcpsStore((s) => s.mcpServers);
  const scenes = useScenesStore((s) => s.scenes);
  const loadMcps = useMcpsStore((s) => s.loadMcps);

  // ----- Local UI state -----
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Env-var inputs persist while the page is mounted (SkillsPage parity).
  const [envValues, setEnvValues] = useState<Record<string, Record<string, string>>>({});
  const [savedFeedback, setSavedFeedback] = useState<Record<string, 'saved' | 'error' | undefined>>(
    {},
  );
  const [showValidation, setShowValidation] = useState<Record<string, boolean>>({});
  const [oauthCopyFeedback, setOauthCopyFeedback] = useState<Record<string, boolean>>({});

  // ----- Effects -----

  // Initial load on mount: parallel fetch of main list + Recently Updated.
  // We re-trigger only when the relevant slice is empty + has no pending
  // error, so navigating away and back doesn't re-fetch needlessly.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    if (mcpsListing.items.length === 0 && !mcpsListing.error && !mcpsListing.loading) {
      void loadMcpsFirstPage();
    }
    if (
      mcpsRecentlyUpdated.items.length === 0 &&
      !mcpsRecentlyUpdated.error &&
      !mcpsRecentlyUpdated.loading
    ) {
      void loadRecentlyUpdated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce searchQuery → searchMcps / clearMcpsSearch.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) {
      if (mcpsSearch !== null) clearMcpsSearch();
      return;
    }
    const handle = window.setTimeout(() => {
      void searchMcps(trimmed);
    }, 300);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchMcps, clearMcpsSearch]);

  // ----- Derived view state -----
  const isSearchMode = mcpsSearch !== null;
  const visibleItems = isSearchMode ? mcpsSearch.items : mcpsListing.items;
  const activePagination = isSearchMode ? mcpsSearch : mcpsListing;
  const upstreamError = activePagination.error;
  const isLoadingPage = activePagination.loading;
  const isOffline = !!upstreamError && visibleItems.length === 0;
  const showFilterEmpty =
    isSearchMode && !mcpsSearch.loading && mcpsSearch.items.length === 0 && !mcpsSearch.error;
  const showInitialLoading = !isSearchMode && mcpsListing.loading && visibleItems.length === 0;
  // The Recently Updated strip is hidden in search mode and when it has no
  // entries to show (avoids a stray section header pointing at empty space).
  const showRecentlyUpdated =
    !isSearchMode &&
    (mcpsRecentlyUpdated.items.length > 0 ||
      mcpsRecentlyUpdated.loading ||
      !!mcpsRecentlyUpdated.error);

  // ----- Selected detail item -----
  // The selected id is keyed by `item.id`. It might live either in the
  // visible items (listing or search) or in Recently Updated. Look in both.
  const selectedItem = useMemo<MarketplaceMcpItem | null>(() => {
    if (!selectedMcpItemId) return null;
    return (
      visibleItems.find((m) => m.id === selectedMcpItemId) ??
      mcpsRecentlyUpdated.items.find((m) => m.id === selectedMcpItemId) ??
      null
    );
  }, [visibleItems, mcpsRecentlyUpdated.items, selectedMcpItemId]);

  // Close the detail panel when the selected item disappears from view
  // (e.g. user clicked Next page while the panel for an old-page item was
  // still open).
  useEffect(() => {
    if (selectedMcpItemId && !selectedItem) {
      selectMcpItem(null);
    }
  }, [selectedMcpItemId, selectedItem, selectMcpItem]);

  const localMcpId = useMemo(
    () => (selectedItem ? findLocalMcpId(mcpServers, selectedItem) : null),
    [mcpServers, selectedItem],
  );

  const usedInScenesCount = useMemo(() => {
    if (!localMcpId) return 0;
    return scenes.filter((s) => s.mcpIds.includes(localMcpId)).length;
  }, [scenes, localMcpId]);

  const requiredEnvVars: EnvVarSpec[] = useMemo(() => {
    if (!selectedItem || selectedItem.mcpType !== 'stdio') return [];
    return selectedItem.stdioConfig?.requiredEnvVars ?? [];
  }, [selectedItem]);

  const allEnvFilled = useMemo(() => {
    if (!selectedItem) return false;
    if (selectedItem.mcpType !== 'stdio') return true;
    if (requiredEnvVars.length === 0) return true;
    const localValues = envValues[selectedItem.id] ?? {};
    const persistedEnv = (localMcpId && mcpServers.find((m) => m.id === localMcpId)?.env) || {};
    return requiredEnvVars.every((spec) => {
      const localVal = localValues[spec.name];
      const persistedVal = persistedEnv[spec.name];
      return (
        (localVal && localVal.trim().length > 0) || (persistedVal && persistedVal.trim().length > 0)
      );
    });
  }, [selectedItem, requiredEnvVars, envValues, localMcpId, mcpServers]);

  const isCurrentInstalled = selectedItem ? isMcpInstalled(selectedItem) : false;

  // ----- Handlers -----

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleRetry = () => {
    if (isSearchMode) {
      void searchMcps(mcpsSearch.query);
    } else {
      void loadMcpsFirstPage();
    }
  };

  const handlePrev = () => {
    if (isSearchMode) {
      void searchMcpsPrevPage();
    } else {
      void loadMcpsPrevPage();
    }
  };

  const handleNext = () => {
    if (isSearchMode) {
      void searchMcpsNextPage();
    } else {
      void loadMcpsNextPage();
    }
  };

  const handleSelectItem = (id: string) => selectMcpItem(id);
  const handleCloseDetail = () => selectMcpItem(null);
  const handleInstall = (item: MarketplaceMcpItem) => void installMcp(item);

  const handleEnvChange = (itemId: string, name: string, value: string) => {
    setEnvValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [name]: value },
    }));
  };

  const handleSaveEnv = async (item: MarketplaceMcpItem) => {
    const values = envValues[item.id] ?? {};
    const missing = requiredEnvVars.filter(
      (spec) => !values[spec.name] || values[spec.name].trim().length === 0,
    );
    if (missing.length > 0) {
      setShowValidation((prev) => ({ ...prev, [item.id]: true }));
      return;
    }
    setShowValidation((prev) => ({ ...prev, [item.id]: false }));

    const localId = findLocalMcpId(mcpServers, item);
    if (!localId) {
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'error' }));
      return;
    }

    try {
      await safeInvoke('update_mcp_env_vars', {
        mcpId: localId,
        env: values,
      });
      await loadMcps();
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'saved' }));
      window.setTimeout(() => {
        setSavedFeedback((prev) => ({ ...prev, [item.id]: undefined }));
      }, 2000);
    } catch (err) {
      console.error('Failed to save environment variables:', err);
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'error' }));
    }
  };

  const handleCopyOAuthCommand = async (itemId: string) => {
    try {
      await navigator.clipboard.writeText('/mcp');
      setOauthCopyFeedback((prev) => ({ ...prev, [itemId]: true }));
      window.setTimeout(() => {
        setOauthCopyFeedback((prev) => ({ ...prev, [itemId]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy /mcp command:', err);
    }
  };

  // ----- Detail panel sub-views -----

  const detailHeader = selectedItem && (
    <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#F4F4F5]">
        {React.createElement(ICON_MAP['plug'] ?? Plug, {
          className: 'h-[18px] w-[18px] text-[#18181B]',
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-base font-semibold text-[#18181B] truncate">{selectedItem.name}</h2>
        <p
          className="w-full truncate text-xs font-normal text-[#71717A]"
          title={selectedItem.description}
        >
          {selectedItem.description}
        </p>
      </div>
    </div>
  );

  const detailHeaderRight =
    selectedItem &&
    (() => {
      if (isCurrentInstalled) {
        const label =
          selectedItem.mcpType === 'stdio' && !allEnvFilled
            ? 'Installed — needs setup'
            : 'Installed';
        return (
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-md bg-[#F4F4F5] px-2.5 py-1 text-[11px] font-medium text-[#52525B]"
              aria-label={label}
            >
              <Check className="h-3 w-3" />
              {label}
            </span>
            {localMcpId && <AddToSceneTriggerButton itemId={localMcpId} itemType="mcp" />}
          </div>
        );
      }
      return (
        <Button
          variant="primary"
          size="small"
          onClick={() => handleInstall(selectedItem)}
          disabled={isLoadingPage}
        >
          Install
        </Button>
      );
    })();

  const configurationBlock = selectedItem && (
    <section className="flex flex-col gap-3">
      {selectedItem.mcpType === 'stdio' ? (
        <>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-[#18181B]">Required environment variables</h3>
            <p className="text-xs font-normal text-[#71717A]">
              This MCP won&apos;t work without them.
            </p>
          </div>

          {requiredEnvVars.length === 0 ? (
            <div className="flex items-center gap-3 rounded-lg border border-[#E5E5E5] px-3.5 py-3">
              <span className="text-[13px] text-[#71717A]">No environment variables required.</span>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
                {requiredEnvVars.map((spec, idx) => {
                  const itemValues = envValues[selectedItem.id] ?? {};
                  const persistedEnv =
                    (localMcpId && mcpServers.find((m) => m.id === localMcpId)?.env) || {};
                  const value = itemValues[spec.name] ?? persistedEnv[spec.name] ?? '';
                  const isMissing =
                    showValidation[selectedItem.id] && (!value || value.trim().length === 0);
                  const isLastRow = idx === requiredEnvVars.length - 1;
                  const hintIsUrl = isHttpUrl(spec.whereToFind);

                  return (
                    <div
                      key={spec.name}
                      className={`flex flex-col gap-1.5 px-3.5 py-3 ${
                        !isLastRow ? 'border-b border-[#E5E5E5]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-24 flex-shrink-0 text-xs font-medium text-[#71717A]">
                          {spec.name}
                        </span>
                        <div className="min-w-0 flex-1">
                          <Input
                            value={value}
                            placeholder={
                              spec.whereToFind && !hintIsUrl
                                ? spec.whereToFind
                                : `Enter ${spec.name}`
                            }
                            onChange={(e) =>
                              handleEnvChange(selectedItem.id, spec.name, e.target.value)
                            }
                            error={isMissing ? 'Required' : undefined}
                          />
                        </div>
                        {hintIsUrl && spec.whereToFind && (
                          <a
                            href={spec.whereToFind}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-medium text-[#18181B] hover:underline whitespace-nowrap"
                          >
                            Where to find →
                          </a>
                        )}
                      </div>
                      {spec.description && (
                        <span className="ml-[7.5rem] text-[11px] font-normal text-[#A1A1AA]">
                          {spec.description}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => void handleSaveEnv(selectedItem)}
                >
                  Save environment variables
                </Button>
                {savedFeedback[selectedItem.id] === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
                    <Check className="h-3 w-3" />
                    Saved
                  </span>
                )}
                {savedFeedback[selectedItem.id] === 'error' && (
                  <span className="text-[11px] font-medium text-[#DC2626]">
                    Failed to save environment variables
                  </span>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-[#18181B]">Connection</h3>
          <div className="overflow-hidden rounded-lg border border-[#E5E5E5]">
            <ConfigItem
              label="URL"
              value={
                <code className="font-mono text-xs text-[#18181B] break-all">
                  {selectedItem.httpConfig?.url ?? '—'}
                </code>
              }
              isLast={!selectedItem.httpConfig?.oauthAuthorizationUrl}
            />
            {selectedItem.httpConfig?.oauthAuthorizationUrl && (
              <ConfigItem
                label="OAuth"
                value={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#52525B]">
                      After installing, run <code className="font-mono">/mcp</code> in your Claude
                      Code session to complete authentication.
                    </span>
                    <Button
                      variant="secondary"
                      size="small"
                      icon={oauthCopyFeedback[selectedItem.id] ? <Check /> : <Copy />}
                      onClick={() => handleCopyOAuthCommand(selectedItem.id)}
                    >
                      {oauthCopyFeedback[selectedItem.id] ? 'Copied' : 'Copy command'}
                    </Button>
                  </div>
                }
                isLast
              />
            )}
          </div>
        </>
      )}
    </section>
  );

  const detailContent = selectedItem && (
    <div className="flex flex-col gap-7">
      {/* Block 1: Decision-critical info. */}
      <section className="flex gap-8">
        <InfoItem label="Author" value={selectedItem.author || 'Unknown'} />
        <InfoItem label="Last Updated" value={formatRelativeTime(selectedItem.lastUpdatedAt)} />
        <InfoItem label="Type" value={selectedItem.mcpType === 'stdio' ? 'stdio' : 'HTTP'} />
      </section>

      {/* Block 2: Reference info. */}
      <section className="flex flex-col gap-4">
        {(selectedItem.categories.length > 0 || selectedItem.tags.length > 0) && (
          <div className="flex flex-col gap-2.5">
            {selectedItem.categories.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-[#71717A]">Categories</span>
                {selectedItem.categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-md border border-[#E5E5E5] px-2 py-0.5 text-[11px] font-medium text-[#52525B]"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            {selectedItem.tags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-[#71717A]">Tags</span>
                {selectedItem.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-[#E5E5E5] px-2 py-0.5 text-[11px] font-medium text-[#52525B]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-[#E5E5E5] p-4">
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-xs font-medium text-[#71717A]">Source</span>
            <MarketplaceSourceBadge
              source={
                {
                  source: 'mcp_registry',
                  owner: selectedItem.author,
                  repo:
                    selectedItem.repositoryUrl
                      .replace(/^https?:\/\/github\.com\//, '')
                      .replace(/\.git$/, '')
                      .split('/')
                      .slice(-1)[0] || selectedItem.name,
                  name: selectedItem.name,
                  lastSyncedAt: selectedItem.lastUpdatedAt,
                } as MarketplaceSource
              }
            />
          </div>
          {usedInScenesCount > 0 && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-[#71717A]">Used in</span>
              <span className="text-xs font-medium text-[#18181B]">
                {usedInScenesCount} {usedInScenesCount === 1 ? 'Scene' : 'Scenes'}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Block 3: README. */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[#18181B]">README</h3>
        <div
          className="overflow-y-auto rounded-lg border border-[#E5E5E5] bg-white p-4"
          style={{ maxHeight: 480 }}
        >
          {selectedItem.readmeMarkdown && selectedItem.readmeMarkdown.trim().length > 0 ? (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-[#52525B]">
              {selectedItem.readmeMarkdown}
            </p>
          ) : (
            <p className="text-xs text-[#A1A1AA]">No README provided.</p>
          )}
        </div>
      </section>

      {/* Block 4: Configuration. */}
      {configurationBlock}
    </div>
  );

  // ----- Section header subcomponent (uppercase 11px). -----
  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[#71717A]">
      {children}
    </h3>
  );

  // ----- Pagination control subcomponent. -----
  const paginationControl = (() => {
    const hasPrev = activePagination.prevCursors.length > 0;
    const hasNext = activePagination.hasMore && !!activePagination.nextCursor;
    const middleLabel = hasNext ? 'More available' : 'End of catalog';
    return (
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          size="small"
          onClick={handlePrev}
          disabled={!hasPrev || isLoadingPage}
        >
          Previous
        </Button>
        <span className="text-[11px] text-[#71717A]">
          {isLoadingPage ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            middleLabel
          )}
        </span>
        <Button
          variant="secondary"
          size="small"
          onClick={handleNext}
          disabled={!hasNext || isLoadingPage}
        >
          Next
        </Button>
      </div>
    );
  })();

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Page Header — title + search input only. No sort, view tab, or
          Refresh button per V2 (Registry mirror). */}
      <PageHeader
        title="MCP Marketplace"
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search by server name..."
      />

      {/* Upstream error banner — shown alongside existing items. */}
      {upstreamError && visibleItems.length > 0 && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{upstreamError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="text-sm font-medium text-red-700 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main scroll region — collapses by 800px when SlidePanel is open. */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedMcpItemId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Search-scope hint — explicit cue that the upstream's search field
            is name-only, not full-text. */}
        <p className="mb-5 text-[11px] text-[#71717A]">Search by name (Registry limitation)</p>

        {showOfflineEmpty(isOffline, isSearchMode) ? (
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
        ) : showInitialLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#A1A1AA]" />
          </div>
        ) : (
          <>
            {/* Recently Updated section — hidden in search mode. */}
            {showRecentlyUpdated && (
              <section className="mb-7">
                <SectionHeader>Recently Updated</SectionHeader>
                {mcpsRecentlyUpdated.loading && mcpsRecentlyUpdated.items.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[#E5E5E5] px-3.5 py-3 text-[12px] text-[#A1A1AA]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Loading recent updates...</span>
                  </div>
                ) : mcpsRecentlyUpdated.error && mcpsRecentlyUpdated.items.length === 0 ? (
                  <div className="rounded-lg border border-[#E5E5E5] px-3.5 py-3 text-[12px] text-[#A1A1AA]">
                    Recently updated section unavailable.
                  </div>
                ) : mcpsRecentlyUpdated.items.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {mcpsRecentlyUpdated.items.map((item) => (
                      <RecentlyUpdatedRow
                        key={item.id}
                        item={item}
                        selected={item.id === selectedMcpItemId}
                        onSelect={handleSelectItem}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            )}

            {/* Main list section. */}
            <section>
              <SectionHeader>
                {isSearchMode ? `Results for "${mcpsSearch.query}"` : 'All Servers'}
              </SectionHeader>

              {showFilterEmpty ? (
                <div className="flex h-full items-center justify-center py-12">
                  <EmptyState
                    icon={<Search className="h-12 w-12" />}
                    title={`No results for "${mcpsSearch.query}"`}
                    description="Search matches MCP server names exactly. Try a different keyword."
                  />
                </div>
              ) : isLoadingPage && visibleItems.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#A1A1AA]" />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {visibleItems.map((item) => (
                      <MarketplaceListItem
                        key={item.id}
                        item={item}
                        itemType="mcp"
                        selected={item.id === selectedMcpItemId}
                        compact={!!selectedMcpItemId}
                        isInstalled={isMcpInstalled(item)}
                        onSelect={handleSelectItem}
                      />
                    ))}
                  </div>

                  {/* Pagination — bottom of the main list. Only render once
                      we actually have items to paginate. */}
                  {visibleItems.length > 0 && paginationControl}
                </>
              )}
            </section>
          </>
        )}
      </div>

      {/* Slide Panel for detail view. */}
      <SlidePanel
        isOpen={!!selectedMcpItemId}
        onClose={handleCloseDetail}
        width={800}
        header={detailHeader}
        headerRight={detailHeaderRight}
      >
        {detailContent}
      </SlidePanel>

      {/* Collision Modal — single instance shared with the Skill page. */}
      {collisionModalState.open && collisionModalState.itemType === 'mcp' && (
        <MarketplaceCollisionModal />
      )}
    </div>
  );
}

// Decide whether the offline EmptyState should render. We only show it when
// the visible source has no items at all *and* an error is present *and*
// (in search mode) the search itself failed (rather than producing zero
// hits — which `showFilterEmpty` covers separately).
function showOfflineEmpty(isOffline: boolean, isSearchMode: boolean): boolean {
  // The "search returned 0 results" case is handled by `showFilterEmpty`, so
  // an empty search with a non-error finish should not look offline. We use
  // `isOffline` (= visible.length === 0 && upstreamError) as the gate.
  if (!isOffline) return false;
  // In search mode, if `mcpsSearch.error === null` but items are empty, that's
  // the "no results" case → not offline. The caller already filtered for
  // `error !== null` via `isOffline`, so reaching here means error is truthy,
  // and we should show the offline state regardless of mode.
  return !isSearchMode || isOffline;
}

// ============================================================================
// Recently Updated row — compact one-line variant of MarketplaceListItem.
// Same visual cadence (border / hover / selected bg) but slimmer padding so
// the section stays visually distinct from the main list without inventing
// new design tokens.
// ============================================================================

interface RecentlyUpdatedRowProps {
  item: MarketplaceMcpItem;
  selected: boolean;
  onSelect: (id: string) => void;
}

function RecentlyUpdatedRow({ item, selected, onSelect }: RecentlyUpdatedRowProps) {
  const handleClick = () => onSelect(item.id);
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left
        transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]
        ${
          selected
            ? 'border-[#E5E5E5] bg-[#F4F4F5]'
            : 'border-[#E5E5E5] bg-white hover:bg-[#FAFAFA]'
        }
      `}
    >
      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-[#F4F4F5]">
        <Plug className="h-3.5 w-3.5 text-[#52525B]" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[#18181B]">{item.name}</span>
          <span className="flex-shrink-0 rounded-md border border-[#E5E5E5] px-1.5 py-0.5 text-[10px] font-medium text-[#71717A]">
            {item.mcpType === 'stdio' ? 'stdio' : 'HTTP'}
          </span>
        </div>
        <span className="truncate text-[11px] font-normal text-[#71717A]">{item.description}</span>
      </div>
      <span className="flex-shrink-0 text-[11px] text-[#A1A1AA]">
        {formatRelativeTime(item.lastUpdatedAt)}
      </span>
    </button>
  );
}

export default McpMarketplacePage;
