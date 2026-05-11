# Stage 3 Implementation Log — MCP Marketplace V2 Realtime Mirror

Date: 2026-05-11
Author: Stage 3 SubAgent (Opus 4.7)
Source: `00_PRD_v2.md` §4 V1.5 In + §6 决策登记

---

## Summary

Replaced V1 "全量 GET 30 条 + 24h cache" MCP marketplace with V2 cursor-paginated realtime mirror of `registry.modelcontextprotocol.io`. UX mirrors the Registry website: top "Recently Updated" strip + paginated main list with explicit Previous/Next buttons. No infinite scroll, no view tab, no Refresh button — these are Skill-page concepts that don't fit the Registry's UX.

Phase I Skill marketplace is **untouched**.

---

## Files Changed

### Backend (Rust)

- **`src-tauri/src/commands/marketplace.rs`** (~3043 → ~3000 LoC, net delta neutral; functional rewrite)
  - **Removed**:
    - `fetch_mcp_registry()` (full GET, no params)
    - `list_marketplace_mcps` IPC (V1 single-call full catalog)
    - `mcps_catalog_path()` / `read_mcps_catalog()` / `write_mcps_catalog()` (cache I/O)
    - `cache_age_hours_if_stale()` (24h TTL gate)
    - `is_latest_envelope()` (client-side filter; replaced by server-side `?version=latest`)
    - `merge_seed_with_registry()` (id-based dedupe; replaced by name-based `merge_seed_at_top`)
    - constants `CACHE_TTL_SECS` and `SOURCE_TAG_MCPS`
    - `MarketplaceCatalog` use (and import)
    - 3 unit tests for above (`is_latest_envelope_*`, `cache_age_*`, `registry_legacy_flat_array_shape_parses`)
    - 1 live test renamed (`fetch_mcp_registry_returns_real_data` → `fetch_registry_page_returns_real_data`)
  - **Added**:
    - `RegistryListMetadata { next_cursor, count }` struct (parses `?metadata.nextCursor`)
    - `envelope_to_item()` (extracted from old monolithic fetch — `Option<MarketplaceMcpItem>`)
    - `McpsPageResponse { items, next_cursor, has_more }` (V2 wire response)
    - `build_registry_url(cursor, limit, search, updated_since)` — single chokepoint, `?version=latest` always set, `urlencoding` for cursor + search params, limit clamped to 1..=100
    - `fetch_registry_page(cursor, limit, search, updated_since) → (Vec<Item>, Option<String>)`
    - **3 IPCs**:
      - `list_marketplace_mcps_page(cursor, limit) → McpsPageResponse` — page 1 (no cursor) merges `MCP_SEED` at top with name-based dedupe; later pages return live registry only
      - `list_recently_updated_mcps(hours_back, limit) → Vec<MarketplaceMcpItem>` — `?updated_since=<RFC3339>&limit=N&version=latest`
      - `search_marketplace_mcps(query, cursor, limit) → McpsPageResponse` — server-side `?search=<q>` substring on name; cursor-paginated
    - `cleanup_legacy_mcp_cache()` pub fn — best-effort delete of `~/.ensemble/marketplace-cache/mcps-catalog-v2.json` on app start
    - 3 unit tests (`registry_list_response_parses_paginated_envelope`, `registry_list_response_parses_final_page`, `build_registry_url_clamps_limit_and_encodes_cursor`)
  - **Preserved unchanged**: `MCP_SEED` (10 entries), `strip_reverse_dns_prefix`, `parse_owner_repo_from_url`, `install_marketplace_mcp`, `auto_classify_marketplace_item`, `update_mcp_env_vars`, `refresh_marketplace_cache` (kept "mcps" branch as no-op for backwards-compat — frontend doesn't call it any more), all Tauri events, DATA_MUTEX usage, all Skill V2 paths, all install/snapshot/finalize helpers
  - **`refresh_marketplace_cache("mcps")`** — body changed from cache-refresh to no-op (cache is gone)

- **`src-tauri/src/lib.rs`**
  - Registered 3 new IPCs (`list_marketplace_mcps_page`, `list_recently_updated_mcps`, `search_marketplace_mcps`)
  - Removed registration of `list_marketplace_mcps`
  - Added `marketplace::cleanup_legacy_mcp_cache()` to setup hook (called once at app start, after `migrate_claude_md_storage`)

### Frontend (TypeScript)

- **`src/types/marketplace.ts`**
  - Added `McpsPageResponse { items, nextCursor, hasMore }` (mirrors Rust)

- **`src/stores/marketplaceStore.ts`** (~1337 → ~1490 LoC, +~150)
  - **Removed**:
    - `mcpsCatalog`, `lastSyncedMcps`, `staleCacheMcps`, `isLoadingMcps`, `upstreamErrorMcps`, `mcpsFilter` state fields
    - `MarketplaceFilter` / `MarketplaceSort` types + `initialFilter`
    - `applyMcpFilter()` helper
    - `loadMcpsCatalog`, `setMcpsFilter`, `getFilteredMcps` actions / selectors
  - **Added**:
    - Constants: `MCP_REGISTRY_PAGE_SIZE = 96`, `MCP_RECENTLY_UPDATED_LIMIT = 9`, `MCP_RECENTLY_UPDATED_HOURS = 24`
    - State types: `McpsPaginatedState`, `McpsRecentlyUpdatedState`, `McpsSearchState extends McpsPaginatedState`
    - State fields: `mcpsListing`, `mcpsRecentlyUpdated`, `mcpsSearch`
    - Actions: `loadMcpsFirstPage`, `loadMcpsNextPage`, `loadMcpsPrevPage`, `loadRecentlyUpdated`, `searchMcps`, `searchMcpsNextPage`, `searchMcpsPrevPage`, `clearMcpsSearch`
    - Selector: `getVisibleMcps()` (replaces `getFilteredMcps`)
  - Cursor stack model: `prevCursors` array tracks the cursor that produced each historic page; Previous pops one cursor and re-fetches; Next pushes the current cursor before fetching
  - Stale-response guards (search): drop response if `state.mcpsSearch.query !== expectedQuery`
  - Updated `retryInstall("mcp")` to look in visible items + Recently Updated
  - Updated `refreshCatalog("mcps")` to fire both `loadMcpsFirstPage` + `loadRecentlyUpdated` in parallel
  - Updated `marketplace:upstream-error` event handler — writes to `mcpsListing.error` (was `upstreamErrorMcps`)
  - Stale-cache / catalog-enhanced event handlers updated to match new state shape

- **`src/pages/McpMarketplacePage.tsx`** (~864 → ~620 LoC, full rewrite)
  - PageHeader: title + search input only — **no sort dropdown, no Refresh button, no view tab, no Last synced label** (V2 explicit out-of-scope)
  - Search-scope hint (top, 11px `#71717A`): `"Search by name (Registry limitation)"`
  - Recently Updated section (hidden in search mode):
    - 11px uppercase section header: `RECENTLY UPDATED`
    - Inline `RecentlyUpdatedRow` component — slimmer padding (`py-2.5` vs `gap-3`), small Plug icon, name + stdio/HTTP type chip, description, relative-time label on the right
    - Empty / loading / error degradation
  - Main list section (`ALL SERVERS` / `RESULTS FOR "<query>"`):
    - Standard `MarketplaceListItem` rows (96/page max)
    - Bottom pagination: `<Button variant="secondary" size="small">Previous</Button>` / "More available" or "End of catalog" middle text / `<Button variant="secondary" size="small">Next</Button>`
    - Previous disabled when `prevCursors.length === 0`; Next disabled when `!hasMore`
    - Loading spinner replaces middle text when in-flight
  - EmptyStates:
    - Offline (`WifiOff`) + Retry (re-fires search if in search mode, else first-page reload)
    - Search no-results (`Search` icon) — `"No results for '<query>'"` with hint about name-only matching
  - SlidePanel detail unchanged — same Author / Last Updated / Type info row, Source/Categories/Tags reference card, README block, Configuration block (stdio env-var inputs with Save handler / HTTP url + Copy /mcp button)
  - Mount-once effect: `loadMcpsFirstPage()` + `loadRecentlyUpdated()` in parallel (only if respective slices empty + no error + not loading) — `didMountRef` guards against re-fire on page revisit
  - 300ms debounced search input → `searchMcps` / `clearMcpsSearch`

---

## Decisions / Trade-offs

1. **Removed `Stars` from Detail panel header info row** — V1 surfaced 4 columns (Author / Last Updated / Stars / Type); V2 drops Stars because the Registry doesn't track GitHub stars and `selectedItem.stars` is hard-coded `0` from the parser. Keeping a column that always reads `0` would be misleading. Net: 3-column row instead of 4. (Aligned with PRD §9 visual consistency goal — Skill page uses installs, MCP shows just Author/Updated/Type.)

2. **`RecentlyUpdatedRow` is page-local, not a new shared component** — PRD says "9-cell 紧凑 grid 或紧凑列表;每条 name + version + description + date". I used a list (more density-consistent with the main `MarketplaceListItem`) and inlined the row component to avoid creating a new design token / component for a 1-page-only variant. Padding (`py-2.5`) and icon size (`h-7 w-7`) are tighter than `MarketplaceListItem` but reuse all colour / radius / border tokens from `design-language.md`.

3. **`refresh_marketplace_cache("mcps")` kept as no-op** — PRD §4 V1.5 In told me to delete the V1 path. The IPC was registered in `lib.rs` and the frontend `refreshCatalog` selector calls it. Rather than delete the IPC (and break any in-flight callers / future plugin hooks that might invoke it), I kept the IPC as a no-op for backward compat. The frontend `refreshCatalog("mcps")` now also re-fires `loadMcpsFirstPage` + `loadRecentlyUpdated` directly so the user-facing behavior of the IPC call is preserved.

4. **`merge_seed_at_top` dedupes by `name`, not `id`** — V1 `merge_seed_with_registry` deduped by `id`. Seed entries have `id` like `npm:@playwright/mcp` while registry entries have `id` like `io.modelcontextprotocol/everything` — these never collide on `id` even when the displayed `name` is the same. Switched to `name` dedupe per PRD §4 V1.5 In / D-MCP-8 ("seed 优先;未来若 Registry 全覆盖可清理"). Test `merge_seed_at_top_dedupes_by_name` updated to assert this.

5. **`build_registry_url` clamps `limit` to 1..=100** — Registry API max is 100. Defensive clamp on the IPC layer (vs. trusting the frontend to behave) keeps a buggy frontend from emitting an upstream 4xx. Added unit test.

6. **No-op handling for legacy event listeners** — `marketplace:stale-cache` and `marketplace:catalog-enhanced` are V1 events that the V2 backend doesn't emit. Listeners kept as forward-compat no-ops so any leftover signal is silently ignored. Decided not to remove the listener registrations because that risks re-introducing them later if a feature wants similar semantics.

---

## DATA_MUTEX / grep-before-enumerate

`read_app_data` / `write_app_data` callsite grep across the entire `src-tauri/`:

- `marketplace.rs` — 8 callsites, all in **install / classify / metadata-snapshot** paths (lines 470, 491, 1728, 1731, 1793, 1834, 1906, 1909, 2033, 2073, 2154, 2260, 2308). All wrapped in `DATA_MUTEX.lock()` guards.
- The 3 new IPCs (`list_marketplace_mcps_page`, `list_recently_updated_mcps`, `search_marketplace_mcps`) and supporting helpers (`fetch_registry_page`, `envelope_to_item`, `merge_seed_at_top`, `build_registry_url`, `cleanup_legacy_mcp_cache`) make zero `read_app_data` / `write_app_data` calls — they only do HTTP fetches and serde parsing. DATA_MUTEX is irrelevant for the new code path.

Bypass-grep for direct `data.json` / file mutation: `cleanup_legacy_mcp_cache` does `fs::remove_file` against `~/.ensemble/marketplace-cache/mcps-catalog-v2.json` — that's a separate file from `data.json`, no mutex needed.

---

## Gates

```
cd src-tauri && cargo build               → Finished `dev` profile (clean, 0 warnings, 3.65s)
cd src-tauri && cargo test --lib          → 37 passed, 0 failed, 3 ignored (network-gated)
                                            All marketplace.rs tests pass
npx tsc --noEmit                          → exit 0 (clean)
npx eslint src/                           → 0 errors, 15 pre-existing warnings (none in modified files)
npm test -- --run                         → 283 passed across 22 test files
```

---

## Live IPC Behavior (verified via curl prior to implementation)

PRD §3.2 / §3.3 already documented these. Implementation matches.

- **Listing (page 1)**: `GET /v0.1/servers?limit=96&version=latest` → `{ servers: [...], metadata: { nextCursor, count } }`
- **Listing (page N)**: `GET /v0.1/servers?limit=96&cursor=<prev>&version=latest`
- **Recently Updated**: `GET /v0.1/servers?limit=9&version=latest&updated_since=<RFC3339-of-now-minus-24h>`
- **Search**: `GET /v0.1/servers?limit=96&version=latest&search=<query>` (substring on `name` only)

---

## Out of Scope (per PRD §5)

Deliberately not implemented:

- Infinite scroll for MCPs (Registry uses Previous/Next)
- Trending / Hot / Popular view tab (Registry has no such endpoint)
- Description full-text search (Registry API doesn't support)
- Sort by stars / installs (Registry doesn't store these)
- Categories / tags filter (Registry query API doesn't support)
- "Page X of Y" total-page indicator (cursor opaque, Registry website itself doesn't show)
- "Show only latest versions" checkbox (always implicit `version=latest`)
- Changes to `install_marketplace_mcp` / `auto_classify` / Sync / Sidebar / routing
- New design tokens, colours, animation curves

---

## Follow-ups / Risks

- **Stage 4** (主 Agent): build + replace `/Applications/Ensemble.app` (per `replace-installed-app-in-place` Rule, in-place `rm -rf && cp -R`)
- **Stage 5**: user smoke-test → commit on success
- Live network test `fetch_registry_page_returns_real_data` is `#[ignore]`'d. Running manually with `cargo test -- --ignored` is recommended before final ship to confirm Registry API hasn't drifted (PRD R-MCP-6 schema-drift sentinel).
- The PRD notes Registry can be slow (20s timeout, 60s through). The reqwest client uses a 15s timeout. If users observe slow loads in real conditions, raising to 30s (PRD R-MCP-4) is the right next move — currently within "should fit most cases" range.
