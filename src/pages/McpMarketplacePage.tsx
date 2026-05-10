import React, { useEffect, useMemo, useState } from 'react';
import { Server, Plug, RotateCw, Loader2, WifiOff, Copy, Check, Sparkles, X } from 'lucide-react';
import { PageHeader, SlidePanel } from '@/components/layout';
import { Button, Dropdown, EmptyState, ICON_MAP, CategoryTreeDropdown } from '@/components/common';
import { Input } from '@/components/common/Input';
import { MarketplaceListItem } from '@/components/marketplace/MarketplaceListItem';
import { MarketplaceCollisionModal } from '@/components/marketplace/MarketplaceCollisionModal';
import { MarketplaceSourceBadge } from '@/components/marketplace/MarketplaceSourceBadge';
import { AddToSceneTriggerButton } from '@/components/marketplace/MarketplaceShortcutBanner';
import { safeInvoke } from '@/utils/tauri';
import { useMarketplaceStore } from '@/stores/marketplaceStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useScenesStore } from '@/stores/scenesStore';
import { useAppStore } from '@/stores/appStore';
import type { EnvVarSpec, MarketplaceMcpItem, MarketplaceSource } from '@/types/marketplace';

// ============================================================================
// McpMarketplacePage — task card C3 (V2.0 Marketplace, Wave 2)
// ============================================================================
//
// Mirrors `SkillMarketplacePage` (C2) skeleton: PageHeader + SearchInput +
// Refresh/Sort/Filter row + List + SlidePanel detail. Differentiated points:
//
//   1. Catalog source / store slice — `mcpsCatalog` + `mcpsFilter` +
//      `selectedMcpItemId` + `loadMcpsCatalog()`.
//   2. List items pass `itemType="mcp"` so `MarketplaceListItem` renders the
//      stdio / HTTP type badge in the right segment (D-9 / D-12 / D-14;
//      task card C3 step 2).
//   3. Detail panel adds a fourth block "Configuration" beyond the three
//      Skill blocks (Decision-critical / Reference / README): stdio types
//      render the required env-var input table with Save handling, HTTP
//      types render URL + (when OAuth) Copy command. Spec §10.1 / §10.3
//      via R2 §4.3 / §10.3.
//   4. Install button text reflects the env-var fill state — derived
//      locally from the env values the user has typed (D-12 / spec §9):
//        - stdio + missing required env  → `Installed — needs setup`
//        - stdio + all required env set  → `Installed`
//        - HTTP                          → `Installed`
//
// What this page does NOT do (out of scope for C3):
//   - Does not import or call McpDetailPanel (R2 §0.1).
//   - Does not introduce new design tokens (design-language Rule).
//   - Does not modify McpServersPage / McpListItem.
//   - Does not add a type badge to the list item's left section (only right
//     segment carries the stdio/HTTP badge; task-card constraint).
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

// Small helper to detect a URL string (for the optional "where to find" link
// in the env-var row). We use a lightweight regex — env var hints can
// legitimately be plain prose, in which case we render them as inline copy
// rather than a link.
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

// ----- Sort options ---------------------------------------------------------

const SORT_OPTIONS = [
  { value: 'popularity', label: 'By Popularity' },
  { value: 'alphabet', label: 'Alphabetical' },
  { value: 'updated', label: 'Recently Updated' },
];

// ============================================================================
// Component
// ============================================================================

export function McpMarketplacePage() {
  // ----- Marketplace store slice -----
  const mcpsCatalog = useMarketplaceStore((s) => s.mcpsCatalog);
  const isLoadingMcps = useMarketplaceStore((s) => s.isLoadingMcps);
  const upstreamErrorMcps = useMarketplaceStore((s) => s.upstreamErrorMcps);
  const lastSyncedMcps = useMarketplaceStore((s) => s.lastSyncedMcps);
  const staleCacheMcps = useMarketplaceStore((s) => s.staleCacheMcps);
  const mcpsFilter = useMarketplaceStore((s) => s.mcpsFilter);
  const selectedMcpItemId = useMarketplaceStore((s) => s.selectedMcpItemId);
  const collisionModalState = useMarketplaceStore((s) => s.collisionModalState);

  const onboardingDismissed = useMarketplaceStore((s) => s.onboardingDismissedMcps);

  const setMcpsFilter = useMarketplaceStore((s) => s.setMcpsFilter);
  const selectMcpItem = useMarketplaceStore((s) => s.selectMcpItem);
  const loadMcpsCatalog = useMarketplaceStore((s) => s.loadMcpsCatalog);
  const refreshCatalog = useMarketplaceStore((s) => s.refreshCatalog);
  const installMcp = useMarketplaceStore((s) => s.installMcp);
  const isMcpInstalled = useMarketplaceStore((s) => s.isMcpInstalled);
  const getFilteredMcps = useMarketplaceStore((s) => s.getFilteredMcps);
  const dismissOnboarding = useMarketplaceStore((s) => s.dismissOnboarding);

  // ----- Cross-store reads (SSoT) -----
  const mcpServers = useMcpsStore((s) => s.mcpServers);
  const scenes = useScenesStore((s) => s.scenes);
  const categories = useAppStore((s) => s.categories);
  const loadMcps = useMcpsStore((s) => s.loadMcps);

  // ----- Local UI state -----
  // Env-var inputs are kept in component state keyed by `marketplaceItem.id`
  // so the user's typing persists through filter / scroll / re-open while
  // they are in this page session. Clearing happens implicitly on page
  // unmount (acceptable V1 behaviour — the spec leaves persistence shape
  // up to spec phase, see PRD §5.4 / D-Imp-9 task-card hint).
  const [envValues, setEnvValues] = useState<Record<string, Record<string, string>>>({});
  // Saved-feedback state: 'saved' shows the green ✓ chip after a successful
  // write, 'error' shows an inline red message when the IPC fails (E3-1 /
  // F-P0-Save). Keyed by marketplace item id.
  const [savedFeedback, setSavedFeedback] = useState<Record<string, 'saved' | 'error' | undefined>>(
    {},
  );
  // Validation flag — only set to `true` after the user attempts a Save with
  // missing required values. Avoids screaming at the user while they are
  // still typing. Keyed per marketplace item id.
  const [showValidation, setShowValidation] = useState<Record<string, boolean>>({});
  // Copy-command feedback for OAuth section.
  const [oauthCopyFeedback, setOauthCopyFeedback] = useState<Record<string, boolean>>({});
  // Per-row refresh spinner state — disabled during in-flight refresh.
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ----- Effects -----

  // Initial catalog load on first mount of the page. Uses the cache-first
  // path (`refresh=false`) — backend will also schedule the optional
  // background scrape via tokio::spawn (spec §3.2 mirrors §3.1).
  useEffect(() => {
    if (mcpsCatalog.length === 0 && !upstreamErrorMcps) {
      void loadMcpsCatalog(false);
    }
    // We deliberately depend on `mcpsCatalog.length` rather than the array
    // identity so a `loadSkillsCatalog` from another tab doesn't re-trigger
    // this effect. The check covers the empty-on-mount case once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Derived data -----

  // The selector reads `mcpsCatalog` + `mcpsFilter` from the store
  // internally; we still depend on those slices so the memo invalidates
  // when either changes. The eslint exhaustive-deps rule cannot see the
  // implicit reads, so we suppress narrowly here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filteredMcps = useMemo(() => getFilteredMcps(), [getFilteredMcps, mcpsCatalog, mcpsFilter]);

  const selectedItem = useMemo<MarketplaceMcpItem | null>(
    () => mcpsCatalog.find((m) => m.id === selectedMcpItemId) ?? null,
    [mcpsCatalog, selectedMcpItemId],
  );

  // Synced timestamp string — surface either the live sync time or a stale
  // hint when the backend served an old cache. The amber treatment is left
  // to a copy-only difference per design-language ("don't invent new
  // accent colours"); we communicate via wording, not hue.
  const lastSyncedLabel = useMemo(() => {
    if (staleCacheMcps) {
      return `Last synced ${staleCacheMcps.ageHours}h ago (stale)`;
    }
    if (lastSyncedMcps) {
      return `Last synced ${formatRelativeTime(lastSyncedMcps)}`;
    }
    return null;
  }, [staleCacheMcps, lastSyncedMcps]);

  // Local SSoT id for the selected upstream item, if installed. Used by the
  // Install button gating and any future `Used in Scenes` count derivation.
  const localMcpId = useMemo(
    () => (selectedItem ? findLocalMcpId(mcpServers, selectedItem) : null),
    [mcpServers, selectedItem],
  );

  const usedInScenesCount = useMemo(() => {
    if (!localMcpId) return 0;
    return scenes.filter((s) => s.mcpIds.includes(localMcpId)).length;
  }, [scenes, localMcpId]);

  // Env-var saturation derives the install button text. We compute it from
  // the in-component `envValues` plus, as a fallback for already-installed
  // items, the SSoT MCP's own `env`. Items HTTP-typed have no required env
  // and short-circuit to `true`.
  const requiredEnvVars: EnvVarSpec[] = useMemo(() => {
    if (!selectedItem || selectedItem.mcpType !== 'stdio') return [];
    return selectedItem.stdioConfig?.requiredEnvVars ?? [];
  }, [selectedItem]);

  const allEnvFilled = useMemo(() => {
    if (!selectedItem) return false;
    if (selectedItem.mcpType !== 'stdio') return true;
    if (requiredEnvVars.length === 0) return true;
    const localValues = envValues[selectedItem.id] ?? {};
    // Cross-check with the persisted MCP entry's `env` map (SSoT) for
    // already-installed resources. The merged view treats either source
    // satisfying a required key as "filled".
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
    setMcpsFilter({ search: value });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshCatalog('mcps');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSortChange = (value: string | string[]) => {
    if (typeof value !== 'string') return;
    setMcpsFilter({ sort: value as 'popularity' | 'alphabet' | 'updated' });
  };

  const handleCategoryChange = (categoryId: string) => {
    setMcpsFilter({ categoryId: categoryId || null });
  };

  const handleDismissOnboarding = () => {
    dismissOnboarding('mcps');
  };

  const handleSelectItem = (id: string) => {
    selectMcpItem(id);
  };

  const handleCloseDetail = () => {
    selectMcpItem(null);
  };

  const handleInstall = (item: MarketplaceMcpItem) => {
    void installMcp(item);
  };

  const handleEnvChange = (itemId: string, name: string, value: string) => {
    setEnvValues((prev) => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [name]: value },
    }));
  };

  // Save handler — persists env vars to the SSoT MCP entry via the
  // `update_mcp_env_vars` IPC (E3-1 / F-P0-Save). Without this the entered
  // values would only live in component state and Sync would write empty
  // env into the project's `.mcp.json`, breaking PRD §5.4 (c)'s "filled →
  // saved" contract for stdio MCPs.
  const handleSaveEnv = async (item: MarketplaceMcpItem) => {
    const values = envValues[item.id] ?? {};
    const missing = requiredEnvVars.filter(
      (spec) => !values[spec.name] || values[spec.name].trim().length === 0,
    );
    if (missing.length > 0) {
      // Trigger validation styling so the missing rows go red. Don't
      // surface a banner — the inline "Required" label per row is enough.
      setShowValidation((prev) => ({ ...prev, [item.id]: true }));
      return;
    }
    setShowValidation((prev) => ({ ...prev, [item.id]: false }));

    // Look up the *local* MCP id (= mcps JSON path) — the IPC writes
    // against the SSoT entry, not the upstream catalog id.
    const localId = findLocalMcpId(mcpServers, item);
    if (!localId) {
      // The Install button gates this Save (Save section only renders for
      // installed stdio MCPs in practice), but if the install is mid-flight
      // we surface a transient error rather than silently no-op.
      setSavedFeedback((prev) => ({ ...prev, [item.id]: 'error' }));
      return;
    }

    try {
      await safeInvoke('update_mcp_env_vars', {
        mcpId: localId,
        env: values,
      });
      // Refresh the SSoT so derived `allEnvFilled` / install button label
      // recompute against the persisted values.
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

  // ----- Render -----

  // Detail panel header — icon + name + one-sentence description.
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

  // Install / Installed control rendered in the SlidePanel's headerRight slot
  // so the user's primary CTA stays visible without scrolling. Mirrors the
  // list-item's button-state machine but in the panel context.
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
          disabled={isLoadingMcps}
        >
          Install
        </Button>
      );
    })();

  // Configuration block — the MCP-specific fourth detail section.
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

  // Detail panel content — assembled top-down per spec §10.1 / R2 §4.4 with
  // the MCP-only fourth Configuration block appended.
  const detailContent = selectedItem && (
    <div className="flex flex-col gap-7">
      {/* Block 1: Decision-critical info (4 columns). */}
      <section className="flex gap-8">
        <InfoItem label="Author" value={selectedItem.author || 'Unknown'} />
        <InfoItem label="Last Updated" value={formatRelativeTime(selectedItem.lastUpdatedAt)} />
        <InfoItem label="Stars" value={(selectedItem.stars ?? 0).toLocaleString()} />
        <InfoItem label="Type" value={selectedItem.mcpType === 'stdio' ? 'stdio' : 'HTTP'} />
      </section>

      {/* Block 2: Reference info — upstream Categories + Tags + Source row. */}
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

      {/* Block 3: README main area — plain pre-wrap rendering of the
          marketplace's `readmeMarkdown` field. We deliberately do not pull
          in a markdown library for V1 (matches the SkillsPage Instructions
          section approach); the upstream markdown renders as readable
          monospaced/proportional copy without rich formatting. */}
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

      {/* Block 4 (MCP-only): Configuration. */}
      {configurationBlock}
    </div>
  );

  // ----- Empty / error states -----

  // Network / upstream catastrophic failure: no items, error present, not
  // currently loading. Surface the WifiOff EmptyState with a Retry action.
  const showOfflineEmpty = mcpsCatalog.length === 0 && !!upstreamErrorMcps && !isLoadingMcps;

  // Filter-induced empty (search/category/tags eliminate everything but the
  // catalog itself is non-empty).
  const showFilterEmpty = mcpsCatalog.length > 0 && filteredMcps.length === 0 && !isLoadingMcps;

  // Loading: catalog empty + currently loading.
  const showLoading = mcpsCatalog.length === 0 && isLoadingMcps;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Page Header */}
      <PageHeader
        title="MCP Marketplace"
        searchValue={mcpsFilter.search}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search MCP servers..."
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
              options={SORT_OPTIONS}
              value={mcpsFilter.sort}
              onChange={handleSortChange}
              compact
              triggerClassName="w-44"
            />
          </div>
        }
      />

      {/* Upstream / install error banner (mirrors SkillsPage:732-742). */}
      {upstreamErrorMcps && mcpsCatalog.length > 0 && (
        <div className="mx-7 mt-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700">{upstreamErrorMcps}</p>
          <button
            type="button"
            onClick={() => void loadMcpsCatalog(true)}
            className="text-sm font-medium text-red-700 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content area with shrink animation matching the SlidePanel. */}
      <div
        className={`
          flex-1 overflow-y-auto px-7 py-6
          transition-[margin-right] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]
          ${selectedMcpItemId ? 'mr-[800px]' : ''}
        `}
      >
        {/* Onboarding banner — first-visit hint for the MCP marketplace
            (F-P0-6 / E3-5 / PRD §5.0). Mirrors SkillMarketplagePage's banner
            visually so the two surfaces feel like one product. */}
        {!onboardingDismissed && mcpsCatalog.length > 0 && (
          <div
            data-marketplace-onboarding-banner
            className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#E5E5E5] bg-[#FAFAFA] px-4 py-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Sparkles className="h-4 w-4 flex-shrink-0 text-[#71717A]" />
              <p className="text-[13px] font-medium text-[#18181B] truncate">
                New here? These are popular MCP servers others are using.
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
            Mirrors SkillMarketplagePage's row exactly so the two pages share
            visual cadence (F-P0-7 / E3-6 / PRD §5.8). */}
        {mcpsCatalog.length > 0 && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CategoryTreeDropdown
                categories={categories}
                value={mcpsFilter.categoryId ?? ''}
                onChange={handleCategoryChange}
                placeholder="All categories"
                compact
                className="w-44"
              />
            </div>
            {lastSyncedLabel && (
              <span className="text-[11px] text-[#A1A1AA]">{lastSyncedLabel}</span>
            )}
          </div>
        )}

        {showOfflineEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<WifiOff className="h-12 w-12" />}
              title="Marketplace temporarily unavailable"
              description="This may be a network issue or upstream service outage."
              action={
                <Button variant="secondary" size="small" onClick={() => void loadMcpsCatalog(true)}>
                  Retry
                </Button>
              }
            />
          </div>
        ) : showLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#A1A1AA]" />
          </div>
        ) : showFilterEmpty ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={<Server className="h-12 w-12" />}
              title="No MCP servers match your filters"
              description="Try adjusting your search or category selection."
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredMcps.map((item) => (
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

      {/* Collision Modal — shared instance; renders only when the store
          flips it open with an MCP-typed payload. The modal itself does not
          differentiate skill vs MCP, but we gate by `itemType === 'mcp'`
          so the Skill page's parallel mount does not double-render. */}
      {collisionModalState.open && collisionModalState.itemType === 'mcp' && (
        <MarketplaceCollisionModal />
      )}
    </div>
  );
}

export default McpMarketplacePage;
