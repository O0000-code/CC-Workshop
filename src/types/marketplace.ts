// Marketplace types — TypeScript mirror of Rust types in
// `src-tauri/src/types.rs` and `src-tauri/src/commands/marketplace.rs`.
// Backend uses `#[serde(rename_all = "camelCase")]`; all field names below
// must match the wire format exactly.

// ----- Upstream provenance -------------------------------------------------

/** Source kind. Mirrors Rust `MarketplaceSource.source` discriminator. */
export type MarketplaceSourceKind = 'skills_sh' | 'mcp_registry';

/**
 * Provenance triple `(owner, repo, name)` plus sync timestamp recorded in
 * SkillMetadata / McpMetadata when an item is installed via the Marketplace.
 * Used by the SSoT selector (`isSkillInstalled`) for triple-priority match
 * before falling back to name match. (D-Imp-4 / D-Imp-8)
 */
export interface MarketplaceSource {
  source: MarketplaceSourceKind;
  owner: string;
  repo: string;
  name: string;
  lastSyncedAt: string;
}

// ----- Catalog item — Skill ------------------------------------------------

/**
 * A single Skill entry as returned by `list_marketplace_skills` /
 * `search_marketplace_skills`.
 *
 * V2 (Phase I, 2026-05-10): the **canonical wire shape** comes from the
 * skills.sh internal pagination API
 * (`GET https://skills.sh/api/skills/{view}/{page}` and
 * `GET https://skills.sh/api/search?q=...`), which returns a flat envelope of
 * `{source, skillId, name, installs, isOfficial?, installsYesterday?, change?}`.
 *
 * All GitHub-derived fields (`stars`, `lastUpdatedAt`, `license`, `repo`,
 * `repositoryUrl`, `categories`, `tags`, `readmeMarkdown`, `homepageUrl`,
 * `skillPath`, `author`, `owner`) are now **optional** because the internal
 * API does not return them — they are populated lazily at install time when
 * the backend walks the GitHub Contents API. The detail panel pulls README
 * content on-demand via `get_marketplace_skill_readme(source, skillId)`.
 *
 * `id` is also optional: V2 internal-API items don't carry one. The frontend
 * uses `${source}/${skillId}` as the React key (see `useSkillItemKey` /
 * `getSkillItemKey` helpers in `marketplaceStore`).
 */
export interface MarketplaceSkillItem {
  // ---- V2 internal-API fields (canonical) ----
  /** skills.sh-style upstream `source` field, e.g. `"anthropics/skills"`.
   *  Combined with `skillId` to form the install path + the React key. */
  source: string;
  /** skills.sh-style upstream `skillId` field — typically the directory path
   *  within the repo (e.g. `"skill-creator"` or `"skills/skill-creator"`). */
  skillId: string;
  name: string;
  /** Total install count reported by skills.sh. */
  installs?: number;
  /** Whether the skill is published by Anthropic / a verified author. */
  isOfficial?: boolean;
  /** Hot-view enrichment: installs in the last 24h. Only present when the
   *  item came from the `hot` view; absent for `all-time` / `trending`. */
  installsYesterday?: number;
  /** Hot-view enrichment: signed delta vs. the previous 24h. */
  change?: number;

  // ---- V1 legacy / lazily-derived fields (optional) ----
  /** Legacy V1 cache id; absent for V2 internal-API items. The frontend
   *  always derives the React key from `${source}/${skillId}` instead. */
  id?: string;
  description?: string;
  readmeMarkdown?: string;
  author?: string;
  owner?: string;
  repo?: string;
  skillPath?: string;
  homepageUrl?: string;
  lastUpdatedAt?: string;
  stars?: number;
  categories?: string[];
  tags?: string[];
  license?: string;
}

// ----- Skills.sh listing / search response envelopes -----------------------

/** Wire envelope returned by `list_marketplace_skills(view, page)`. Mirrors
 *  Rust `SkillsPageResponse` in `src-tauri/src/commands/marketplace.rs`. */
export interface SkillsPageResponse {
  skills: MarketplaceSkillItem[];
  /** Full upstream count (NOT the count on this page). Used to render
   *  "{total} skills" hints + drive the "End of catalog" sentinel. */
  total: number;
  hasMore: boolean;
  /** 0-indexed page number of the returned slice. */
  page: number;
}

/** Wire envelope returned by `search_marketplace_skills(query)`. Mirrors
 *  Rust `SkillsSearchResponse` in `src-tauri/src/commands/marketplace.rs`. */
export interface SkillsSearchResponse {
  query: string;
  /** Upstream-chosen mode — `"fuzzy"` for short queries, `"semantic"` for
   *  longer ones. Surfaced in the UI as a small hint badge. */
  searchType: string;
  skills: MarketplaceSkillItem[];
  count: number;
  /** Upstream-reported elapsed time in milliseconds. */
  durationMs: number;
}

/** Skills.sh listing view tab. */
export type SkillsView = 'all-time' | 'trending' | 'hot';

/** Stable React key for a marketplace skill item. V2 internal-API items
 *  identify themselves by `(source, skillId)`; V1 cache items carry an `id`.
 *  Using `${source}/${skillId}` works for both — V1 cache items also fill
 *  `source` and `skillId` (see `MarketplaceSkillItem` doc). */
export function getSkillItemKey(item: MarketplaceSkillItem): string {
  if (item.source && item.skillId) return `${item.source}/${item.skillId}`;
  if (item.id) return item.id;
  // Defensive last-resort. The backend never returns an item with neither, but
  // a falsy key would collide React's reconciliation.
  return item.name;
}

// ----- MCP listing / search response envelope ----------------------------

/**
 * Wire envelope for the V2 MCP marketplace IPCs:
 * - `list_marketplace_mcps_page(cursor, limit)`
 * - `search_marketplace_mcps(query, cursor, limit)`
 *
 * Mirrors Rust `McpsPageResponse` in
 * `src-tauri/src/commands/marketplace.rs`.
 *
 * `nextCursor` is `null` when the upstream signals "no more pages";
 * `hasMore` mirrors `nextCursor !== null` for UI convenience.
 */
export interface McpsPageResponse {
  items: MarketplaceMcpItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ----- Catalog item — MCP --------------------------------------------------

/** A single MCP entry as returned by `list_marketplace_mcps`. */
export interface MarketplaceMcpItem {
  id: string;
  name: string;
  description: string;
  readmeMarkdown: string;
  author: string;
  /**
   * GitHub repository segment parsed from `repositoryUrl` at fetch time.
   * Persisted into `MarketplaceSource.repo` at install (B-P0-3) so the
   * triple is `(owner, repo, name)` rather than the legacy
   * `(author, author, name)` placeholder. Empty string when the upstream
   * provides no parseable GitHub URL.
   */
  repo: string;
  repositoryUrl: string;
  lastUpdatedAt: string;
  stars: number;
  categories: string[];
  tags: string[];
  license?: string;
  /** Discriminator for stdio vs HTTP. The matching config field is non-null. */
  mcpType: 'stdio' | 'http';
  stdioConfig?: StdioMcpConfig;
  httpConfig?: HttpMcpConfig;
}

export interface StdioMcpConfig {
  command: string;
  args: string[];
  requiredEnvVars: EnvVarSpec[];
}

export interface EnvVarSpec {
  name: string;
  description?: string;
  whereToFind?: string;
}

export interface HttpMcpConfig {
  url: string;
  /** e.g. "sse" | "streamable-http". Free-form; UI displays as-is. */
  transport: string;
  oauthAuthorizationUrl?: string;
}

// ----- Install / collision -------------------------------------------------

/**
 * What the frontend asks the backend to do when a name collision is detected.
 * Mirrors Rust enum tagged with `kind` (serde tag = "kind", camelCase variants).
 */
export type ConflictAction = { kind: 'replace' } | { kind: 'restoreFromTrash'; trashPath: string };

/**
 * Backend response from `install_marketplace_skill` / `install_marketplace_mcp`.
 * Mirrors Rust `InstallOutcome` enum tagged with `kind`.
 *
 * NOTE: `Installed.skillId` carries the local Skill.id for skill installs and
 * the local MCP id (= mcps JSON path) for MCP installs. The field name is
 * shared across both variants for TS discriminated-union simplicity, even
 * though the underlying value semantics differ by itemType. The frontend
 * marketplaceStore disambiguates at the call-site, see B2 install handlers.
 */
export type InstallOutcome =
  | { kind: 'installed'; skillId: string }
  | {
      kind: 'nameCollision';
      hasLocal: boolean;
      hasTrashed?: TrashedItemBrief;
    }
  | { kind: 'failed'; reason: string };

export interface TrashedItemBrief {
  name: string;
  /** Path passed back to backend in `ConflictAction.restoreFromTrash`. */
  path: string;
  deletedAt: string;
}

// ----- IPC payloads --------------------------------------------------------

/**
 * Args for the `update_mcp_env_vars` IPC (B-P0-6 / E3-1). Persists the user's
 * filled stdio MCP env values to `~/.ensemble/mcps/<name>.json::env` so they
 * survive across restarts and propagate to Sync. Empty `env` clears the field.
 */
export interface UpdateMcpEnvVarsPayload {
  mcpId: string;
  env: Record<string, string>;
}

// ----- Tauri event payloads (camelCase wire format) ------------------------

/** `marketplace:classify-result` payload. */
export interface MarketplaceClassifyResultEvent {
  id: string;
  itemType: 'skill' | 'mcp';
  category?: string;
  parentCategory?: string;
  tags: string[];
  icon?: string;
}

/** `marketplace:classify-failed` payload. */
export interface MarketplaceClassifyFailedEvent {
  id: string;
  itemType: 'skill' | 'mcp';
  error: string;
}

/** `marketplace:stale-cache` payload. */
export interface MarketplaceStaleCacheEvent {
  source: 'skills' | 'mcps';
  ageHours: number;
}

/** `marketplace:catalog-enhanced` payload. */
export interface MarketplaceCatalogEnhancedEvent {
  source: 'skills' | 'mcps';
  addedCount: number;
}

/** `marketplace:scrape-degraded` payload. */
export interface MarketplaceScrapeDegradedEvent {
  source: 'skills';
  reason: string;
}

/** `marketplace:upstream-error` payload. */
export interface MarketplaceUpstreamErrorEvent {
  source: 'skills' | 'mcps';
  error: string;
}
