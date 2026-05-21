import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plug, Loader2, WifiOff, Copy, Check, Search, Github, AlertTriangle } from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import { Button, EmptyState, ICON_MAP } from '@/components/common';
import { MarketplaceListItem } from '@/components/marketplace/MarketplaceListItem';
import { MarketplaceCollisionModal } from '@/components/marketplace/MarketplaceCollisionModal';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { MarkdownBody } from '@/components/marketplace/MarkdownBody';
import { EnvVarInputPanel } from '@/components/marketplace/EnvVarInputPanel';
import { AddToSceneTriggerButton } from '@/components/marketplace/MarketplaceShortcutBanner';
import { SyncIndicator } from '@/components/marketplace/SyncIndicator';
import { safeInvoke } from '@/utils/tauri';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useScenesStore } from '@/stores/scenesStore';
import type {
  EnvVarSpec,
  MarketplaceMcpItem,
  MarketplaceSource,
  McpsView,
} from '@/types/marketplace';

// ============================================================================
// McpMarketplacePage — V2.0 Marketplace MCP (realtime registry mirror)
// ============================================================================
//
// Mirrors the Official MCP Registry website
// (`registry.modelcontextprotocol.io/`):
//
//   1. Search-by-name input in the header (Registry's `?search=` is name-only).
//   2. View tab — All Servers / Recently Updated (the Registry website's
//      two visible views; surfaced as a switch instead of stacked sections).
//   3. Main paginated list — 96 servers per page, Previous / Next buttons.
//   4. Detail SlidePanel — unchanged from V1 (info / source card / README /
//      Configuration block with stdio env-var inputs or HTTP url).
//
// What this page does NOT do (V2 explicit out-of-scope):
//   - No infinite scroll (Registry uses explicit pagination)
//   - No sort dropdown / Refresh button
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

/** Compact integer formatter — `1234` → `1.2K`, `1234567` → `1.2M`. Mirrors
 *  the helper used in `SkillMarketplacePage` so the two info rows render
 *  the Stars value identically. */
function formatCompactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return n.toLocaleString();
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
  const mcpsSearch = useMarketplaceStore((s) => s.mcpsSearch);
  const mcpsGithubSearch = useMarketplaceStore((s) => s.mcpsGithubSearch);
  const selectedMcpItemId = useMarketplaceStore((s) => s.selectedMcpItemId);
  const collisionModalState = useMarketplaceStore((s) => s.collisionModalState);

  const loadMcpsFirstPage = useMarketplaceStore((s) => s.loadMcpsFirstPage);
  const loadMcpsNextPage = useMarketplaceStore((s) => s.loadMcpsNextPage);
  const loadMcpsPrevPage = useMarketplaceStore((s) => s.loadMcpsPrevPage);
  const setMcpsView = useMarketplaceStore((s) => s.setMcpsView);
  const searchMcps = useMarketplaceStore((s) => s.searchMcps);
  const searchMcpsNextPage = useMarketplaceStore((s) => s.searchMcpsNextPage);
  const searchMcpsPrevPage = useMarketplaceStore((s) => s.searchMcpsPrevPage);
  const clearMcpsSearch = useMarketplaceStore((s) => s.clearMcpsSearch);
  const triggerGithubSearch = useMarketplaceStore((s) => s.triggerGithubSearch);
  const aiInstallFromGithub = useMarketplaceStore((s) => s.aiInstallFromGithub);
  const selectMcpItem = useMarketplaceStore((s) => s.selectMcpItem);
  const installMcp = useMarketplaceStore((s) => s.installMcp);
  const isMcpInstalled = useMarketplaceStore((s) => s.isMcpInstalled);
  const repoStars = useMarketplaceStore((s) => s.repoStars);
  const loadRepoStars = useMarketplaceStore((s) => s.loadRepoStars);

  // ----- Cross-store reads (SSoT) -----
  const mcpServers = useMcpsStore((s) => s.mcpServers);
  const scenes = useScenesStore((s) => s.scenes);
  const loadMcps = useMcpsStore((s) => s.loadMcps);

  // ----- Local UI state -----
  const [searchQuery, setSearchQuery] = useState<string>('');
  // Env-var inputs persist while the page is mounted (SkillsPage parity).
  const [envValues, setEnvValues] = useState<Record<string, Record<string, string>>>({});
  // Parallel state for HTTP MCPs — URL template variables (substituted
  // into the URL at install) and HTTP headers (Authorization, X-API-Key).
  // Both key on `item.id` so multiple panel openings don't collide.
  const [urlVarValues, setUrlVarValues] = useState<Record<string, Record<string, string>>>({});
  const [headerValues, setHeaderValues] = useState<Record<string, Record<string, string>>>({});
  const [savedFeedback, setSavedFeedback] = useState<Record<string, 'saved' | 'error' | undefined>>(
    {},
  );
  const [showValidation, setShowValidation] = useState<Record<string, boolean>>({});
  const [oauthCopyFeedback, setOauthCopyFeedback] = useState<Record<string, boolean>>({});

  // ----- Effects -----

  // Initial load on mount: consult the SWR cache. Fresh → noop; stale →
  // silent SWR; beyond stale (or empty) → foreground fetch.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (didMountRef.current) return;
    didMountRef.current = true;
    void loadMcpsFirstPage(undefined, 'auto');
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

  // ----- Selected detail item -----
  // The selected id is keyed by `item.id`; look it up in the currently-
  // visible source (listing or search results) — or, when in search mode,
  // the GitHub-Search secondary results, so clicking a GitHub row opens
  // its detail panel rather than triggering the "missing → auto-close"
  // effect below.
  const selectedItem = useMemo<MarketplaceMcpItem | null>(() => {
    if (!selectedMcpItemId) return null;
    const fromVisible = visibleItems.find((m) => m.id === selectedMcpItemId);
    if (fromVisible) return fromVisible;
    const fromGithub = mcpsGithubSearch?.items.find((m) => m.id === selectedMcpItemId);
    return fromGithub ?? null;
  }, [visibleItems, mcpsGithubSearch, selectedMcpItemId]);

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

  // Parse `(owner, repo)` from the MCP's `repositoryUrl` so we can fetch
  // GitHub stars. Handles `https://github.com/<o>/<r>`,
  // `https://github.com/<o>/<r>.git`, and subpaths like
  // `https://github.com/<o>/<r>/tree/main/src/everything`.
  const [mcpOwner, mcpRepo] = useMemo(() => {
    const url = selectedItem?.repositoryUrl ?? '';
    const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/.]+)/i);
    return match ? [match[1] ?? '', match[2] ?? ''] : ['', ''];
  }, [selectedItem]);
  const mcpStarsKey = mcpOwner && mcpRepo ? `${mcpOwner}/${mcpRepo}` : '';
  const mcpStars = mcpStarsKey && mcpStarsKey in repoStars ? repoStars[mcpStarsKey] : undefined;

  useEffect(() => {
    if (!mcpOwner || !mcpRepo) return;
    void loadRepoStars(mcpOwner, mcpRepo);
  }, [mcpOwner, mcpRepo, loadRepoStars]);

  const usedInScenesCount = useMemo(() => {
    if (!localMcpId) return 0;
    return scenes.filter((s) => s.mcpIds.includes(localMcpId)).length;
  }, [scenes, localMcpId]);

  const requiredEnvVars: EnvVarSpec[] = useMemo(() => {
    if (!selectedItem || selectedItem.mcpType !== 'stdio') return [];
    return selectedItem.stdioConfig?.requiredEnvVars ?? [];
  }, [selectedItem]);

  const urlVariableSpecs: EnvVarSpec[] = useMemo(() => {
    if (!selectedItem || selectedItem.mcpType !== 'http') return [];
    return selectedItem.httpConfig?.urlVariables ?? [];
  }, [selectedItem]);

  const headerSpecs: EnvVarSpec[] = useMemo(() => {
    if (!selectedItem || selectedItem.mcpType !== 'http') return [];
    return selectedItem.httpConfig?.headers ?? [];
  }, [selectedItem]);

  const persistedHeaders: Record<string, string> = useMemo(() => {
    if (!localMcpId) return {};
    const local = mcpServers.find((m) => m.id === localMcpId);
    return local?.headers ?? {};
  }, [localMcpId, mcpServers]);

  const allEnvFilled = useMemo(() => {
    if (!selectedItem) return false;
    if (selectedItem.mcpType === 'stdio') {
      if (requiredEnvVars.length === 0) return true;
      const localValues = envValues[selectedItem.id] ?? {};
      const persistedEnv = (localMcpId && mcpServers.find((m) => m.id === localMcpId)?.env) || {};
      return requiredEnvVars.every((spec) => {
        const localVal = localValues[spec.name];
        const persistedVal = persistedEnv[spec.name];
        return (
          (localVal && localVal.trim().length > 0) ||
          (persistedVal && persistedVal.trim().length > 0) ||
          (spec.defaultValue && spec.defaultValue.trim().length > 0)
        );
      });
    }
    // HTTP — required URL vars + required headers must all be filled.
    const urlVarVals = urlVarValues[selectedItem.id] ?? {};
    const hdrVals = headerValues[selectedItem.id] ?? {};
    const allUrlVarsOk = urlVariableSpecs.every((spec) => {
      const v = urlVarVals[spec.name] ?? spec.defaultValue ?? '';
      return v.trim().length > 0;
    });
    const allHeadersOk = headerSpecs.every((spec) => {
      const v = hdrVals[spec.name] ?? persistedHeaders[spec.name] ?? spec.defaultValue ?? '';
      return v.trim().length > 0;
    });
    return allUrlVarsOk && allHeadersOk;
  }, [
    selectedItem,
    requiredEnvVars,
    envValues,
    localMcpId,
    mcpServers,
    urlVariableSpecs,
    headerSpecs,
    urlVarValues,
    headerValues,
    persistedHeaders,
  ]);

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
  const handleInstall = (item: MarketplaceMcpItem) => {
    if (item.mcpType === 'http') {
      // Validate required URL variables and headers are filled before
      // firing install — backend will write whatever we give it, and
      // an unsubstituted `{VAR}` in the URL would land in `.mcp.json`.
      const urlVarsForItem = urlVarValues[item.id] ?? {};
      const headersForItem = headerValues[item.id] ?? {};
      const urlSpecs = item.httpConfig?.urlVariables ?? [];
      const hdrSpecs = item.httpConfig?.headers ?? [];
      const missingUrlVar = urlSpecs.some((spec) => {
        const v = urlVarsForItem[spec.name] ?? spec.defaultValue ?? '';
        return v.trim().length === 0;
      });
      const missingHdr = hdrSpecs.some((spec) => {
        const v =
          headersForItem[spec.name] ?? persistedHeaders[spec.name] ?? spec.defaultValue ?? '';
        return v.trim().length === 0;
      });
      if (missingUrlVar || missingHdr) {
        setShowValidation((prev) => ({ ...prev, [item.id]: true }));
        return;
      }
      setShowValidation((prev) => ({ ...prev, [item.id]: false }));
      // Merge defaults so backend always receives the resolved value.
      const finalUrlVars: Record<string, string> = {};
      for (const spec of urlSpecs) {
        finalUrlVars[spec.name] = urlVarsForItem[spec.name] ?? spec.defaultValue ?? '';
      }
      const finalHeaders: Record<string, string> = {};
      for (const spec of hdrSpecs) {
        finalHeaders[spec.name] =
          headersForItem[spec.name] ?? persistedHeaders[spec.name] ?? spec.defaultValue ?? '';
      }
      void installMcp(item, undefined, finalUrlVars, finalHeaders);
      return;
    }
    void installMcp(item);
  };

  const handleUrlVarChange = (itemId: string, name: string, value: string) => {
    setUrlVarValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [name]: value },
    }));
  };

  const handleHeaderChange = (itemId: string, name: string, value: string) => {
    setHeaderValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [name]: value },
    }));
  };

  const handleSaveHttpConfig = async (item: MarketplaceMcpItem) => {
    if (!localMcpId || !item.httpConfig) {
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'error' }));
      return;
    }
    const urlVarsForItem = urlVarValues[item.id] ?? {};
    const headersForItem = headerValues[item.id] ?? {};
    const urlSpecs = item.httpConfig.urlVariables ?? [];
    const hdrSpecs = item.httpConfig.headers ?? [];
    const finalUrlVars: Record<string, string> = {};
    for (const spec of urlSpecs) {
      finalUrlVars[spec.name] = urlVarsForItem[spec.name] ?? spec.defaultValue ?? '';
    }
    const finalHeaders: Record<string, string> = {};
    for (const spec of hdrSpecs) {
      finalHeaders[spec.name] =
        headersForItem[spec.name] ?? persistedHeaders[spec.name] ?? spec.defaultValue ?? '';
    }
    const missing =
      urlSpecs.some((s) => finalUrlVars[s.name].trim().length === 0) ||
      hdrSpecs.some((s) => finalHeaders[s.name].trim().length === 0);
    if (missing) {
      setShowValidation((prev) => ({ ...prev, [item.id]: true }));
      return;
    }
    setShowValidation((prev) => ({ ...prev, [item.id]: false }));
    try {
      await safeInvoke('update_mcp_http_config', {
        mcpId: localMcpId,
        originalUrl: item.httpConfig.url,
        urlVariables: finalUrlVars,
        headers: finalHeaders,
      });
      await loadMcps();
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'saved' }));
      window.setTimeout(() => {
        setSavedFeedback((prev) => ({ ...prev, [item.id]: undefined }));
      }, 2000);
    } catch (err) {
      console.error('Failed to save HTTP config:', err);
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'error' }));
    }
  };

  const handleViewChange = (view: McpsView) => {
    if (view === mcpsListing.view && !isSearchMode) return;
    setSearchQuery('');
    void setMcpsView(view);
  };

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
        <h2 className="text-base font-semibold text-[#18181B] truncate">
          {selectedItem.title || selectedItem.name}
        </h2>
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
    <section className="flex flex-col gap-4">
      {selectedItem.mcpType === 'stdio' ? (
        <>
          <h3 className="text-sm font-semibold text-[#18181B]">Required environment variables</h3>

          {requiredEnvVars.length === 0 ? (
            <span className="text-[13px] text-[#71717A]">None required.</span>
          ) : (
            <>
              <EnvVarInputPanel
                specs={requiredEnvVars}
                values={envValues[selectedItem.id] ?? {}}
                persistedValues={
                  (localMcpId && mcpServers.find((m) => m.id === localMcpId)?.env) || {}
                }
                showValidation={!!showValidation[selectedItem.id]}
                onChange={(name, value) => handleEnvChange(selectedItem.id, name, value)}
              />

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

          {urlVariableSpecs.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#18181B]">URL variables</h3>
              <EnvVarInputPanel
                specs={urlVariableSpecs}
                values={urlVarValues[selectedItem.id] ?? {}}
                showValidation={!!showValidation[selectedItem.id]}
                onChange={(name, value) => handleUrlVarChange(selectedItem.id, name, value)}
              />
            </>
          )}

          {headerSpecs.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#18181B]">Headers</h3>
              <EnvVarInputPanel
                specs={headerSpecs}
                values={headerValues[selectedItem.id] ?? {}}
                persistedValues={persistedHeaders}
                showValidation={!!showValidation[selectedItem.id]}
                onChange={(name, value) => handleHeaderChange(selectedItem.id, name, value)}
              />
            </>
          )}

          {isCurrentInstalled && (urlVariableSpecs.length > 0 || headerSpecs.length > 0) && (
            <div className="flex items-center gap-2.5">
              <Button
                variant="primary"
                size="small"
                onClick={() => void handleSaveHttpConfig(selectedItem)}
              >
                Save connection settings
              </Button>
              {savedFeedback[selectedItem.id] === 'saved' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#16A34A]">
                  <Check className="h-3 w-3" />
                  Saved
                </span>
              )}
              {savedFeedback[selectedItem.id] === 'error' && (
                <span className="text-[11px] font-medium text-[#DC2626]">
                  Failed to save connection settings
                </span>
              )}
            </div>
          )}
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
        {typeof mcpStars === 'number' && (
          <InfoItem label="Stars" value={formatCompactNumber(mcpStars)} />
        )}
      </section>

      {/* Block 2: Reference info. */}
      <section className="flex flex-col gap-4">
        {/* Publisher-provided metadata strip — license / publisher / website /
            keywords. All four are independent and any subset may render; the
            outer block hides when none are present. */}
        {(selectedItem.license ||
          selectedItem.publisher ||
          selectedItem.websiteUrl ||
          (selectedItem.keywords && selectedItem.keywords.length > 0)) && (
          <div className="flex flex-col gap-2.5">
            {(selectedItem.license || selectedItem.publisher || selectedItem.websiteUrl) && (
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
                {selectedItem.publisher && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-medium text-[#71717A]">Publisher</span>
                    <span className="text-[12px] font-medium text-[#18181B]">
                      {selectedItem.publisher}
                    </span>
                  </div>
                )}
                {selectedItem.license && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-medium text-[#71717A]">License</span>
                    <span className="text-[12px] font-medium text-[#18181B]">
                      {selectedItem.license}
                    </span>
                  </div>
                )}
                {selectedItem.websiteUrl && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-medium text-[#71717A]">Website</span>
                    <a
                      href={selectedItem.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[12px] text-[#18181B] underline decoration-[#D4D4D8] underline-offset-[3px] transition-colors hover:decoration-[#18181B]"
                    >
                      {selectedItem.websiteUrl.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>
            )}
            {selectedItem.keywords && selectedItem.keywords.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-medium text-[#71717A]">Keywords</span>
                {selectedItem.keywords.map((k) => (
                  <span
                    key={k}
                    className="rounded-md border border-[#E5E5E5] px-2 py-0.5 text-[11px] font-medium text-[#52525B]"
                  >
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
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
          {usedInScenesCount > 0 && (
            <div className="mt-1 flex items-baseline gap-2.5">
              <span className="text-xs font-medium text-[#71717A]">Used in</span>
              <span className="text-xs font-medium text-[#18181B]">
                {usedInScenesCount} {usedInScenesCount === 1 ? 'Scene' : 'Scenes'}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Block 3: README — on-demand fetch (mirrors Skill detail). */}
      <McpReadmeBlock item={selectedItem} />

      {/* Block 3.5: Publisher-curated example snippets. Renders only when
          `_meta.publisher-provided.examples[]` is non-empty. Each card
          carries a name + description + a copyable code block (command
          when present, else pretty-printed config JSON). */}
      <McpExamplesBlock examples={selectedItem.examples} />

      {/* Block 4: Configuration. */}
      {configurationBlock}
    </div>
  );

  // ----- Status line (Skill page parity: 11px neutral grey, single row
  // describing source · view; search-mode variant drops the source prefix
  // and shows result count + query, mirroring SkillMarketplacePage. The
  // Registry search endpoint returns paginated results without a total
  // count, so we surface `<loaded>` with a `+` suffix when more pages
  // remain to keep the wording honest. -----
  const statusLine = useMemo(() => {
    if (isSearchMode) {
      if (mcpsSearch.loading && mcpsSearch.items.length === 0) return null;
      if (mcpsSearch.items.length === 0) return null;
      const count = mcpsSearch.items.length;
      const hasMore = mcpsSearch.hasMore;
      const noun = count === 1 ? 'result' : 'results';
      return `${count}${hasMore ? '+' : ''} ${noun} for "${mcpsSearch.query}"`;
    }
    const viewLabel =
      mcpsListing.view === 'recently-updated' ? 'Recently Updated (24h)' : 'All Servers';
    return `Live from MCP Registry · ${viewLabel}`;
  }, [isSearchMode, mcpsSearch, mcpsListing.view]);

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
        <span className="text-[11px] text-[#71717A] inline-flex items-center gap-1.5">
          {isLoadingPage ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <span>{middleLabel}</span>
              {isSearchMode &&
                mcpsSearch !== null &&
                (mcpsGithubSearch === null ? (
                  <>
                    <span className="text-[#D4D4D8]">·</span>
                    <button
                      type="button"
                      onClick={() => void triggerGithubSearch(mcpsSearch.query)}
                      className="inline-flex items-center gap-1 text-[#52525B] hover:text-[#18181B] transition-colors cursor-pointer"
                    >
                      <Search className="h-3 w-3" />
                      Search GitHub
                    </button>
                  </>
                ) : mcpsGithubSearch.loading ? (
                  <>
                    <span className="text-[#D4D4D8]">·</span>
                    <span className="inline-flex items-center gap-1 text-[#A1A1AA]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Searching GitHub...
                    </span>
                  </>
                ) : null)}
            </>
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
        actions={<ViewTabBar active={mcpsListing.view} onChange={handleViewChange} />}
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
        {/* Status line — Skill page parity: 11px neutral grey, single row
            describing source + active view (or search context) + sync icon. */}
        {statusLine && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[11px] text-[#A1A1AA]">{statusLine}</span>
            {!isSearchMode && (
              <SyncIndicator
                isSyncing={mcpsListing.loading || mcpsListing.isBackgroundSyncing}
                hasError={!!mcpsListing.error && !mcpsListing.loading}
                lastSyncedAt={mcpsListing.lastSyncedAt}
                onClick={() => void loadMcpsFirstPage(undefined, 'force')}
              />
            )}
          </div>
        )}

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
            {/* Main list section. Heading is now absorbed into the status
                line above; this section just holds the list + pagination. */}
            <section>
              {showFilterEmpty ? (
                // Four-mode layout for the "primary search → 0 results" branch:
                //   1. Pre-trigger (`mcpsGithubSearch === null`)
                //      → centered EmptyState + "Search GitHub" action.
                //   2. GitHub loading
                //      → centered EmptyState + disabled "Searching GitHub..."
                //        spinner action. Layout stays put so the click does
                //        not flash an empty-action page.
                //   3. GitHub fetched with ≥ 1 result
                //      → EmptyState removed; GithubFallback section takes over.
                //   4. GitHub fetched with 0 results
                //      → top-anchored EmptyState + McpGithubFallback's
                //        "No additional results on GitHub." line.
                mcpsGithubSearch === null ? (
                  <div className="flex h-full items-center justify-center py-12">
                    <EmptyState
                      icon={<Search className="h-12 w-12" />}
                      title={`No results for "${mcpsSearch.query}"`}
                      description="Search matches MCP server names exactly. Try a different keyword."
                      action={
                        <Button
                          variant="secondary"
                          size="small"
                          onClick={() => void triggerGithubSearch(mcpsSearch.query)}
                        >
                          Search GitHub
                        </Button>
                      }
                    />
                  </div>
                ) : mcpsGithubSearch.loading ? (
                  <div className="flex h-full items-center justify-center py-12">
                    <EmptyState
                      icon={<Search className="h-12 w-12" />}
                      title={`No results for "${mcpsSearch.query}"`}
                      description="Search matches MCP server names exactly. Try a different keyword."
                      action={
                        <Button variant="secondary" size="small" disabled>
                          <span className="inline-flex items-center gap-1.5">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Searching GitHub...
                          </span>
                        </Button>
                      }
                    />
                  </div>
                ) : mcpsGithubSearch.hasFetched && mcpsGithubSearch.items.length > 0 ? (
                  <McpGithubFallback
                    isSearchMode={isSearchMode}
                    primaryQuery={mcpsSearch?.query ?? ''}
                    primaryHasResults={visibleItems.length > 0}
                    primaryLoading={isLoadingPage && visibleItems.length === 0}
                    mcpsGithubSearch={mcpsGithubSearch}
                    onTrigger={triggerGithubSearch}
                    onInstall={aiInstallFromGithub}
                    selectedMcpItemId={selectedMcpItemId}
                    onSelectItem={handleSelectItem}
                    isMcpInstalled={isMcpInstalled}
                  />
                ) : (
                  <div className="flex flex-col">
                    <EmptyState
                      icon={<Search className="h-12 w-12" />}
                      title={`No results for "${mcpsSearch.query}"`}
                      description="Search matches MCP server names exactly. Try a different keyword."
                    />
                    <McpGithubFallback
                      isSearchMode={isSearchMode}
                      primaryQuery={mcpsSearch?.query ?? ''}
                      primaryHasResults={visibleItems.length > 0}
                      primaryLoading={isLoadingPage && visibleItems.length === 0}
                      mcpsGithubSearch={mcpsGithubSearch}
                      onTrigger={triggerGithubSearch}
                      onInstall={aiInstallFromGithub}
                      selectedMcpItemId={selectedMcpItemId}
                      onSelectItem={handleSelectItem}
                      isMcpInstalled={isMcpInstalled}
                    />
                  </div>
                )
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

                  {/* GitHub fallback — CTA when no GitHub fetch yet,
                      section when GitHub fetch has returned. Only renders
                      in search mode (otherwise there is no query to
                      forward). Sits between the Anthropic list and the
                      Anthropic pagination so the pagination controls keep
                      their existing semantics (prev/next page through
                      Registry results only). */}
                  <McpGithubFallback
                    isSearchMode={isSearchMode}
                    primaryQuery={mcpsSearch?.query ?? ''}
                    primaryHasResults={visibleItems.length > 0}
                    primaryLoading={isLoadingPage && visibleItems.length === 0}
                    mcpsGithubSearch={mcpsGithubSearch}
                    onTrigger={triggerGithubSearch}
                    onInstall={aiInstallFromGithub}
                    selectedMcpItemId={selectedMcpItemId}
                    onSelectItem={handleSelectItem}
                    isMcpInstalled={isMcpInstalled}
                  />

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
// McpReadmeBlock — detail panel README region. Fetches the repo's README on
// mount (memoised in the store keyed by repositoryUrl; 5-min TTL). Renders
// loading / error+retry / content / "No README provided" states. Mirrors
// the Skill detail panel's README block.
// ============================================================================

function McpReadmeBlock({ item }: { item: MarketplaceMcpItem }) {
  const mcpReadmes = useMarketplaceStore((s) => s.mcpReadmes);
  const loadingMcpReadmes = useMarketplaceStore((s) => s.loadingMcpReadmes);
  const mcpReadmeErrors = useMarketplaceStore((s) => s.mcpReadmeErrors);
  const loadMcpReadme = useMarketplaceStore((s) => s.loadMcpReadme);

  const key = item.repositoryUrl;
  const cached = key ? mcpReadmes[key] : undefined;
  const isLoading = key ? loadingMcpReadmes.has(key) : false;
  const error = key ? mcpReadmeErrors[key] : undefined;
  const hasRepo = !!key && key.length > 0;

  useEffect(() => {
    if (!hasRepo) return;
    void loadMcpReadme(key);
  }, [key, hasRepo, loadMcpReadme]);

  // Flex-1 fill only when content is loaded — otherwise short
  // loading/error/empty states would balloon to fill the remaining
  // panel height which looks unnatural (a 480px box with one
  // "Loading…" line in the corner).
  const hasContent = !!cached?.content && cached.content.trim().length > 0;
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[#18181B]">README</h3>
      <div
        className={`rounded-lg border border-[#E5E5E5] bg-white p-4 ${
          hasContent ? 'max-h-[520px] overflow-y-auto' : ''
        }`}
      >
        {!hasRepo ? (
          <p className="text-xs text-[#A1A1AA]">No repository URL provided.</p>
        ) : isLoading && !cached ? (
          <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading README...</span>
          </div>
        ) : error && !cached ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[#DC2626]">Failed to load README.</p>
            <button
              type="button"
              onClick={() => void loadMcpReadme(key)}
              className="self-start text-xs font-medium text-[#18181B] underline"
            >
              Retry
            </button>
          </div>
        ) : hasContent ? (
          <MarkdownBody
            source={cached!.content}
            baseUrl={(() => {
              // `repositoryUrl` is typically `https://github.com/<owner>/<repo>`
              // (sometimes with `.git` or a `/tree/HEAD/...` suffix). Rewrite to
              // raw.githubusercontent.com so relative `![](logo.png)` images
              // and `[link](docs/setup.md)` references resolve against the
              // repo root.
              const m = key?.match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/);
              return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/` : undefined;
            })()}
          />
        ) : (
          <p className="text-xs text-[#A1A1AA]">No README provided.</p>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// McpExamplesBlock — renders publisher-provided example snippets as stacked
// cards. Each card: name (heading) + description (prose) + a `<pre>` code
// block containing the command (or pretty-printed config JSON) with a
// per-card "Copy" affordance. Hides itself entirely when `examples` is
// empty / undefined.
// ============================================================================

interface McpExamplesBlockProps {
  examples?: import('@/types/marketplace').McpExample[];
}

function McpExamplesBlock({ examples }: McpExamplesBlockProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  if (!examples || examples.length === 0) return null;

  const handleCopy = async (idx: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(idx);
      window.setTimeout(
        () => setCopiedIndex((current) => (current === idx ? null : current)),
        2000,
      );
    } catch (err) {
      console.error('Failed to copy example:', err);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[#18181B]">Examples</h3>
      <div className="flex flex-col gap-2.5">
        {examples.map((ex, idx) => {
          const snippet = ex.command ?? ex.config ?? '';
          if (snippet.length === 0) return null;
          const isCopied = copiedIndex === idx;
          return (
            <div
              key={idx}
              className="flex flex-col gap-2 rounded-lg border border-[#E5E5E5] bg-white p-4"
            >
              {(ex.name || ex.description) && (
                <div className="flex flex-col gap-1">
                  {ex.name && (
                    <span className="text-[13px] font-semibold text-[#18181B]">{ex.name}</span>
                  )}
                  {ex.description && (
                    <p className="text-[12px] leading-relaxed text-[#71717A]">{ex.description}</p>
                  )}
                </div>
              )}
              <div className="relative">
                <pre className="overflow-x-auto rounded-md border border-[#E5E5E5] bg-[#FAFAFA] p-3 pr-16">
                  <code className="font-mono text-[12px] text-[#18181B]">{snippet}</code>
                </pre>
                <button
                  type="button"
                  onClick={() => void handleCopy(idx, snippet)}
                  className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] font-medium transition-colors ${
                    isCopied ? 'text-[#18181B]' : 'text-[#71717A] hover:text-[#18181B]'
                  }`}
                >
                  {isCopied ? (
                    <>
                      <Check className="h-3 w-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ============================================================================
// ViewTabBar — segmented control for switching All Servers / Recently Updated.
// Same tokens as the Skill page's view tab (active = bg-[#F4F4F5] +
// font-semibold; inactive = font-medium text-[#71717A]) per design-language
// constraints.
// ============================================================================

const VIEW_TABS: { value: McpsView; label: string }[] = [
  { value: 'all', label: 'All Servers' },
  { value: 'recently-updated', label: 'Recently Updated' },
];

function ViewTabBar({
  active,
  onChange,
}: {
  active: McpsView;
  onChange: (view: McpsView) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-[#E5E5E5] p-0.5"
      role="tablist"
      aria-label="MCP listing view"
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

// ============================================================================
// McpGithubFallback — secondary GitHub-Search CTA + results section.
//
// State machine (06 §E + 07 plan Phase C2):
//
//   isSearchMode=false                 → render nothing (no query to forward)
//   primaryLoading=true                → render nothing (waiting on Registry)
//   mcpsGithubSearch === null
//     ▸ primaryHasResults=true         → CTA below results
//     ▸ primaryHasResults=false        → CTA only (caller handles EmptyState)
//   mcpsGithubSearch.loading=true      → inline loading state ("Searching GitHub…")
//   mcpsGithubSearch.error             → inline error + Retry
//   mcpsGithubSearch.hasFetched=true && items.length===0
//                                      → "No additional results" line
//   mcpsGithubSearch.hasFetched=true && items.length>0
//                                      → result section (count line + items)
//
// Visual rule: align with `paginationControl` rhythm (mt-6 / py-4) so the
// CTA line and the results section sit at the same vertical cadence as the
// Anthropic pagination. No border/background on the CTA — design-language
// forbids inventing chrome for this kind of light affordance.
// ============================================================================

interface McpGithubFallbackProps {
  isSearchMode: boolean;
  primaryQuery: string;
  primaryHasResults: boolean;
  primaryLoading: boolean;
  mcpsGithubSearch: ReturnType<typeof useMarketplaceStore.getState>['mcpsGithubSearch'];
  onTrigger: (query: string) => Promise<void>;
  onInstall: (item: MarketplaceMcpItem) => Promise<void>;
  selectedMcpItemId: string | null;
  onSelectItem: (id: string) => void;
  isMcpInstalled: (item: MarketplaceMcpItem) => boolean;
}

function McpGithubFallback({
  isSearchMode,
  primaryQuery,
  // primaryHasResults: previously used to gate the standalone CTA row when
  // there were Anthropic results above. CTA + loading are now rendered inline
  // inside paginationControl, so this prop is no longer consumed here. Kept
  // on the props interface to avoid churning every call site; underscore
  // tells TS / ESLint it's intentionally unused.
  primaryHasResults: _primaryHasResults,
  primaryLoading,
  mcpsGithubSearch,
  onTrigger,
  onInstall,
  selectedMcpItemId,
  onSelectItem,
  isMcpInstalled,
}: McpGithubFallbackProps) {
  if (!isSearchMode) return null;
  if (primaryLoading) return null;
  if (primaryQuery.trim().length === 0) return null;

  // Pre-trigger state (mcpsGithubSearch === null) and loading state are now
  // both rendered inline inside `paginationControl`'s middle slot — see
  // McpMarketplacePage.paginationControl. This component only renders the
  // POST-fetch states (error / 0 results / ≥ 1 results). Returning null
  // here keeps the layout free of the old standalone CTA row.
  if (mcpsGithubSearch === null) {
    return null;
  }
  if (mcpsGithubSearch.loading) {
    return null;
  }

  // Error — 11px red line + Retry. Mirrors the inline-error visual of the
  // upstreamError banner but compact (single row, no background).
  if (mcpsGithubSearch.error) {
    return (
      <div className="mt-6 flex items-center justify-center gap-3 py-4 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-[var(--color-error)]">
          <AlertTriangle className="h-3 w-3" />
          <span>GitHub search failed.</span>
        </span>
        <button
          type="button"
          onClick={() => void onTrigger(primaryQuery)}
          className="font-medium text-[#18181B] underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // Post-fetch, 0 results — single greyscale line. No CTA; the user has
  // already exercised the affordance.
  if (mcpsGithubSearch.items.length === 0) {
    return (
      <div className="mt-6 flex items-center justify-center py-4">
        <span className="text-[11px] text-[#A1A1AA]">No additional results on GitHub.</span>
      </div>
    );
  }

  // Post-fetch, ≥ 1 result — section heading + rows. Items reuse
  // `MarketplaceListItem` but with the GitHub-Search-specific overrides:
  // pass `uncertaintyHint` (from backend fingerprint) + override
  // `onInstall` to take the AI install path + label loading "AI inferring..."
  // (30-90s wait — surface it).
  return (
    <section className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
        <Github className="h-3 w-3" />
        <span>
          From GitHub Search · {mcpsGithubSearch.items.length}{' '}
          {mcpsGithubSearch.items.length === 1 ? 'result' : 'results'}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {mcpsGithubSearch.items.map((item) => (
          <McpGithubResultRow
            key={item.id}
            item={item}
            selected={item.id === selectedMcpItemId}
            compact={!!selectedMcpItemId}
            isInstalled={isMcpInstalled(item)}
            onSelect={onSelectItem}
            onInstall={onInstall}
          />
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// McpGithubResultRow — wraps `<MarketplaceListItem>` and stacks an inline
// failure-reason row underneath it when the AI install fails (Phase C6).
//
// The failure row layout is dedicated to the AI install path because the
// regular install error UX surfaces via the row's own Retry button tooltip;
// the AI install failure is intentionally non-retryable (user request: same
// prompt would deterministically fail again, the user must instead escalate
// to interactive fallback — currently disabled, X2). Surfacing a separate
// inline row makes the difference legible.
// ============================================================================

interface McpGithubResultRowProps {
  item: MarketplaceMcpItem;
  selected: boolean;
  compact: boolean;
  isInstalled: boolean;
  onSelect: (id: string) => void;
  onInstall: (item: MarketplaceMcpItem) => Promise<void>;
}

function McpGithubResultRow({
  item,
  selected,
  compact,
  isInstalled,
  onSelect,
  onInstall,
}: McpGithubResultRowProps) {
  // The MarketplaceListItem subscribes to its own `installFailedItems[id]`
  // for the regular `<Retry>` button behaviour. We read the same map here
  // so we can render the inline error explanation; the row itself will not
  // show its "Retry" button because we override `onInstall` to the AI path
  // and the AI path overwrites the same failure slot.
  const failure = useMarketplaceStore((s) => s.installFailedItems[item.id]);
  return (
    <div className="flex flex-col">
      <MarketplaceListItem
        item={item}
        itemType="mcp"
        selected={selected}
        compact={compact}
        isInstalled={isInstalled}
        onSelect={onSelect}
        uncertaintyHint={item.uncertaintyHint}
        onInstall={(it) => void onInstall(it as MarketplaceMcpItem)}
        installingLabel="AI inferring..."
        hideRetryOnFailure
      />
      {failure && (
        <div className="px-5 pt-2 flex items-start gap-2 text-[11px]">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-[var(--color-error)]" />
          <span className="text-[var(--color-error)] flex-1 min-w-0">{failure.error}</span>
          {/* Interactive fallback placeholder (X2 — not yet implemented).
              Disabled button + tooltip-equivalent title attribute makes
              the future affordance visible without offering an action that
              would silently no-op. */}
          <button
            type="button"
            disabled
            title="Interactive fallback coming soon"
            className="text-[var(--color-accent)] cursor-not-allowed opacity-50"
          >
            Open in Claude Code
          </button>
        </div>
      )}
    </div>
  );
}

export default McpMarketplacePage;
