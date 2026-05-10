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

/** A single Skill entry as returned by `list_marketplace_skills`. */
export interface MarketplaceSkillItem {
  id: string;
  name: string;
  description: string;
  readmeMarkdown: string;
  author: string;
  owner: string;
  repo: string;
  skillPath: string;
  homepageUrl: string;
  lastUpdatedAt: string;
  stars: number;
  categories: string[];
  tags: string[];
  license?: string;
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
