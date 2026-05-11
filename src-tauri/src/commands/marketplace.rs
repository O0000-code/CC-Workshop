//! Marketplace IPCs (V2.0 — Phase I rewrite, 2026-05-10).
//!
//! ## V2 Skill marketplace = skills.sh internal API
//!
//! Skills are now served by walking the **internal pagination API** at
//! `https://skills.sh/api/skills/{view}/{page}` (200 items/page, 91k items
//! across the `all-time` / `trending` / `hot` views) plus the unauthenticated
//! search at `https://skills.sh/api/search?q=...`. README detail content is
//! pulled from `raw.githubusercontent.com` on demand. This replaces the V1
//! "GitHub Contents API + curated 10-entry seed" pipeline, which produced
//! only 12 visible items and was useless for browsing.
//!
//! The internal API returns `{source, skillId, name, installs, isOfficial?,
//! installsYesterday?, change?}` — see `MarketplaceSkillItem` in `types.rs`
//! for the field-by-field deserialisation contract. The IPC signatures and
//! Tauri events are documented in
//! `.dev/marketplace-impl/02_tech_spec.md` §3:
//!
//! - `list_marketplace_skills(view, page)` — V2 pagination
//! - `search_marketplace_skills(query)` — V2 fuzzy / semantic search
//! - `get_marketplace_skill_readme(source, skill_id)` — V2 README detail
//! - `list_marketplace_mcps(refresh)` — unchanged
//! - `install_marketplace_skill(item, conflict_action)` — unchanged signature; install path
//!   now derives `(owner, repo)` from `item.source.split('/')` and reads
//!   from GitHub Contents API as before
//! - `install_marketplace_mcp(item, conflict_action)` — unchanged
//! - `auto_classify_marketplace_item(id, item_type)` — unchanged
//! - `refresh_marketplace_cache(source)` — unchanged
//! - `update_mcp_env_vars(mcp_id, env)` — unchanged
//!
//! ## skills.sh internal API headers
//!
//! The endpoint requires same-origin browser headers (verified 2026-05-10
//! via curl + Chrome DevTools — without them the upstream returns 403).
//! All requests go through `skills_sh_request()` which sets:
//! `User-Agent` (Mac Safari fingerprint), `Accept: application/json`,
//! `Origin: https://skills.sh`, `Referer: https://skills.sh/`,
//! `Sec-Fetch-Mode: cors`. The reqwest client has gzip decompression
//! enabled (Cargo.toml `features = ["json", "gzip"]`) — the upstream
//! always serves gzip and rejects clients that cannot decode it.
//!
//! ## MCP marketplace (V2 — realtime mirror, 2026-05-11)
//!
//! MCPs mirror the Official MCP Registry website (`registry.modelcontextprotocol.io/`)
//! one-for-one: a top "Recently Updated" strip + a paginated main list with
//! explicit Previous / Next buttons. Three IPCs back this:
//!
//! - `list_marketplace_mcps_page(cursor, limit)` — `?limit=N&version=latest[&cursor=...]`,
//!   page 1 merges `MCP_SEED` at the top (name dedupe).
//! - `list_recently_updated_mcps(hours_back, cursor, limit)` — `?updated_since=<RFC3339>&limit=N&version=latest[&cursor=...]`; same `McpsPageResponse` envelope as the main listing.
//! - `search_marketplace_mcps(query, cursor, limit)` — server-side `?search=<q>` substring on `name`.
//!
//! V1's full-catalog GET / 24h file cache (`mcps-catalog-v2.json`) /
//! client-side `isLatest` filter / HashSet name dedupe are removed:
//! `?version=latest` server-side replaces them; cursor pagination replaces
//! the single GET; the cache file is reaped at startup (`lib.rs::setup`).
//!
//! ## DATA_MUTEX discipline
//!
//! Every IPC that mutates `data.json` (i.e. `install_marketplace_*` and
//! `auto_classify_marketplace_item`) acquires the canonical `DATA_MUTEX`
//! at its outermost scope before calling `read_app_data` /
//! `write_app_data`. See `.claude/rules/grep-before-enumerate-shared-resource.md`.
//!
//! ## HTTP client
//!
//! A single `reqwest::Client` lives behind a `OnceLock` (D-Imp-10). It
//! ships with a 15s timeout, gzip decompression, and a `User-Agent` matching
//! `Ensemble/<version>` for non-skills.sh callers (the skills.sh helper
//! overrides UA to a browser fingerprint).
//!
//! ## verify-third-party-behavior-firsthand
//!
//! - skills.sh internal API:
//!   `https://skills.sh/api/skills/all-time/0` returned 200 items + total ≈ 91029
//!   when curled with the browser headers on 2026-05-10. The same request
//!   without `Origin` / `Referer` returned 403, confirming the same-origin
//!   gate.
//! - skills.sh search:
//!   `https://skills.sh/api/search?q=playwright` returned `{searchType: "fuzzy", count: ...}`.
//! - GitHub raw README:
//!   `https://raw.githubusercontent.com/anthropics/skills/HEAD/skill-creator/SKILL.md`
//!   was either 200 (skill at sub-path) or 404 (skill at repo root); our
//!   helper tries the sub-path first and falls back to the root SKILL.md.
//! - MCP Registry: `https://registry.modelcontextprotocol.io/v0.1/servers`
//!   responds with `{servers: Vec<Server>, total_count, ...}` per
//!   <https://github.com/modelcontextprotocol/registry/blob/main/docs/openapi.yaml>.

use crate::commands::classify::{auto_classify, ClassifyItem, ClassifyResult, ExistingCategory};
use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    AppData, ConflictAction, EnvVarSpec, HttpMcpConfig, InstallOutcome, MarketplaceMcpItem,
    MarketplaceSkillItem, MarketplaceSource, McpConfigFile, McpMetadata, SkillMetadata,
    StdioMcpConfig, TrashedItemBrief,
};
use crate::utils::{ensure_dir, get_app_data_dir};
use base64_simple::decode_base64;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Constants
// ============================================================================

/// HTTP client timeout for upstream catalog requests.
const HTTP_TIMEOUT_SECS: u64 = 15;

/// Per-request sleep between sequential GitHub Contents API calls during
/// install (R-24 mitigation — unauthenticated GitHub rate limit is 60 req/h;
/// 100ms between calls stays well below burst thresholds when fanning out
/// across a skill's nested file tree).
const GITHUB_PACING_MS: u64 = 100;

/// Cap on README-content-bytes carried in the catalog. Larger bodies are
/// truncated at fetch time so the cache file stays small.
const README_BYTES_CAP: usize = 3_000;

/// In-memory README cache TTL (5 minutes). Skill detail panels can fan out
/// repeated `get_marketplace_skill_readme` calls when the user clicks
/// the same row multiple times; we serve from memory to avoid hammering
/// `raw.githubusercontent.com`. Cache lives in `OnceLock<Mutex<...>>` —
/// process-local, lost on restart.
const README_CACHE_TTL_SECS: i64 = 5 * 60;

/// Cap on entries in the README cache to bound memory growth. Eviction
/// is FIFO once the cache hits the cap (sufficient for an interactive
/// browse pattern; the LRU upgrade is in V1.5 backlog).
const README_CACHE_MAX_ENTRIES: usize = 64;

/// User-Agent string sent to skills.sh — must look like a browser. The
/// upstream rejects requests whose UA matches `*reqwest*` or empty UA.
/// Verified 2026-05-10 via curl.
const SKILLS_SH_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";

/// Default page size for MCP Registry list calls. The Registry website itself
/// uses 96 (< API max 100); we mirror that. Used as the default `limit` by the
/// frontend store; the IPC accepts any 1-100 value.
#[allow(dead_code)]
const MCP_REGISTRY_PAGE_SIZE: u32 = 96;

// ============================================================================
// Resource-name sanitisation (B-P0-1 — security)
// ============================================================================
//
// The `name` and recursive `entry.name` strings reaching the install path
// originate from three untrusted sources:
//
// 1. SKILL.md frontmatter (arbitrary YAML written by repo authors)
// 2. SKILL.md H1 fallback (markdown heading text, also arbitrary)
// 3. GitHub Contents API entries (`entry.name` for nested files / dirs)
//
// Without sanitisation, any of these can carry `..`, `/`, `\`, or a leading
// `.`, causing `PathBuf::join(...)` to walk outside `~/.ensemble/skills/`
// (E1-1 review). `sanitize_resource_name` below is the single chokepoint
// every install path calls before joining.
//
// Allowed chars: ASCII letters, digits, `_`, `-`, `.`. Length: 1..=64.
// First char must NOT be `.` (rejects dotfiles and `..`).
fn sanitize_resource_name(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("Resource name is empty".to_string());
    }
    if name.len() > 64 {
        return Err(format!(
            "Resource name too long (>64 chars): {}",
            &name[..64.min(name.len())]
        ));
    }
    // Reject any name starting with `.` (covers `.`, `..`, dotfiles).
    if name.starts_with('.') {
        return Err(format!("Resource name may not start with '.': {}", name));
    }
    // Reject `..` anywhere (defence in depth — substring check, not just prefix).
    if name.contains("..") {
        return Err(format!("Resource name may not contain '..': {}", name));
    }
    // Reject path separators (forward slash, backslash) and any other char
    // outside the safe alphabet.
    for ch in name.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.';
        if !ok {
            return Err(format!(
                "Invalid character {:?} in resource name: {}",
                ch, name
            ));
        }
    }
    Ok(name.to_string())
}

// ============================================================================
// HTTP client (D-Imp-10)
// ============================================================================

static MARKETPLACE_HTTP: OnceLock<reqwest::Client> = OnceLock::new();

/// Lazily-initialised global HTTP client. Reuses connections, sets a
/// User-Agent matching Ensemble's GitHub project (R-40 / R-47 friendly
/// citizen), and applies a 15s timeout so a hung upstream cannot block
/// the IPC indefinitely.
pub fn marketplace_http() -> &'static reqwest::Client {
    MARKETPLACE_HTTP.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
            // Phase I (V2): skills.sh API serves gzip and **rejects clients
            // that cannot decompress it**. The `gzip` feature on reqwest
            // (Cargo.toml) registers the `Accept-Encoding: gzip` header and
            // transparent decoder. Verified 2026-05-10 via curl.
            .gzip(true)
            .user_agent(concat!(
                "Ensemble/",
                env!("CARGO_PKG_VERSION"),
                " (+https://github.com/O0000-code/Ensemble)"
            ))
            .build()
            .expect("reqwest Client builds with no failures from constants")
    })
}

/// Build the request that talks to skills.sh's *internal* (unauth) API.
/// The API rejects requests that don't carry a same-origin browser
/// fingerprint — `Origin` and `Referer` are mandatory, `Sec-Fetch-Mode`
/// guards against CORS preflight bypass detection, and the User-Agent
/// must look like a real browser (server-side filter on `*reqwest*`).
/// Verified working 2026-05-10 via curl + chrome-devtools.
fn skills_sh_request(url: &str) -> reqwest::RequestBuilder {
    marketplace_http()
        .get(url)
        .header(reqwest::header::USER_AGENT, SKILLS_SH_USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/json")
        .header("Origin", "https://skills.sh")
        .header("Referer", "https://skills.sh/")
        .header("Sec-Fetch-Mode", "cors")
}

// ============================================================================
// Cache directory
// ============================================================================

/// Ensure `~/.ensemble/marketplace-cache/` exists. Calls `get_app_data_dir`
/// so the `cfg(test)` panic guard fires whenever tests forget to scope
/// `ENSEMBLE_DATA_DIR` (R-2 / fallback-path-must-be-unreachable-in-test).
///
/// V2 (2026-05-11): no longer called from any production path — MCP cache is
/// removed and Skills V2 has no cache. Kept `pub` for future cache reintroduction
/// and as a stable utility surface.
#[allow(dead_code)]
pub fn ensure_marketplace_cache_dir() -> Result<PathBuf, String> {
    let dir = get_app_data_dir().join("marketplace-cache");
    ensure_dir(&dir).map_err(|e| format!("Failed to create marketplace-cache dir: {}", e))?;
    Ok(dir)
}

// ============================================================================
// V2 cache cleanup (called from lib.rs::setup)
// ============================================================================
//
// V2 (2026-05-11) deletes the MCP catalog cache permanently. `cleanup_legacy_mcp_cache`
// is invoked during app startup; it silently removes
// `~/.ensemble/marketplace-cache/mcps-catalog-v2.json` if present. Failure is
// ignored — the cache file becoming undeletable for some reason should not
// block app launch, and the new IPCs do not depend on it being absent.

/// Best-effort delete of the legacy V1 MCP catalog cache file. Idempotent;
/// safe to call on every app start. Does not touch `skills-catalog-*.json`
/// (Skills V2 has no cache layer to begin with — there is no file to clean).
pub fn cleanup_legacy_mcp_cache() {
    let path = get_app_data_dir()
        .join("marketplace-cache")
        .join("mcps-catalog-v2.json");
    if path.exists() {
        let _ = fs::remove_file(&path);
    }
}

// ============================================================================
// SSoT helpers (spec §11.1)
// ============================================================================

/// Returns `true` when `~/.ensemble/trash/skills/` contains an entry
/// matching `skill_name` exactly or with the trash timestamp suffix
/// (`<name>_YYYYMMDD_HHMMSS`). The third condition of the SSoT contract
/// (PRD §7.4) — Trash presence — relies on this scan.
///
/// The Phase A install path consumes the more detailed
/// [`find_skill_trash_brief`] helper directly. This boolean variant is
/// kept `pub` for future SSoT helpers (e.g. a dedicated `is_in_trash`
/// IPC) and for tests.
#[allow(dead_code)]
pub fn is_skill_in_trash(skill_name: &str) -> bool {
    let trash_dir = get_app_data_dir().join("trash").join("skills");
    if !trash_dir.exists() {
        return false;
    }
    fs::read_dir(trash_dir)
        .ok()
        .map(|rd| {
            rd.filter_map(|e| e.ok()).any(|e| {
                let n = e.file_name();
                let s = n.to_string_lossy();
                s == skill_name || s.starts_with(&format!("{}_", skill_name))
            })
        })
        .unwrap_or(false)
}

/// Mirror of [`is_skill_in_trash`] for MCPs. Trash entries are stored as
/// `~/.ensemble/trash/mcps/<name>.json` (no timestamp) or
/// `<name>_YYYYMMDD_HHMMSS.json`, so we match on either form.
#[allow(dead_code)]
pub fn is_mcp_in_trash(mcp_name: &str) -> bool {
    let trash_dir = get_app_data_dir().join("trash").join("mcps");
    if !trash_dir.exists() {
        return false;
    }
    let exact = format!("{}.json", mcp_name);
    let prefix = format!("{}_", mcp_name);
    fs::read_dir(trash_dir)
        .ok()
        .map(|rd| {
            rd.filter_map(|e| e.ok()).any(|e| {
                let n = e.file_name();
                let s = n.to_string_lossy();
                s == exact || (s.starts_with(&prefix) && s.ends_with(".json"))
            })
        })
        .unwrap_or(false)
}

/// Find the first trash entry matching `skill_name` and return a brief.
/// Used when surfacing an `InstallOutcome::NameCollision` so the modal
/// can show "deleted N days ago" and pass `trash_path` back unchanged for
/// the eventual `ConflictAction::RestoreFromTrash`.
fn find_skill_trash_brief(skill_name: &str) -> Option<TrashedItemBrief> {
    let trash_dir = get_app_data_dir().join("trash").join("skills");
    if !trash_dir.exists() {
        return None;
    }
    let entries = fs::read_dir(trash_dir).ok()?;
    let prefix = format!("{}_", skill_name);
    for e in entries.filter_map(|e| e.ok()) {
        let name_os = e.file_name();
        let name = name_os.to_string_lossy();
        if name == skill_name || name.starts_with(&prefix) {
            let path = e.path();
            let deleted_at = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
            return Some(TrashedItemBrief {
                name: skill_name.to_string(),
                path: path.to_string_lossy().to_string(),
                deleted_at,
            });
        }
    }
    None
}

fn find_mcp_trash_brief(mcp_name: &str) -> Option<TrashedItemBrief> {
    let trash_dir = get_app_data_dir().join("trash").join("mcps");
    if !trash_dir.exists() {
        return None;
    }
    let entries = fs::read_dir(trash_dir).ok()?;
    let exact = format!("{}.json", mcp_name);
    let prefix = format!("{}_", mcp_name);
    for e in entries.filter_map(|e| e.ok()) {
        let name_os = e.file_name();
        let name = name_os.to_string_lossy();
        if name == exact || (name.starts_with(&prefix) && name.ends_with(".json")) {
            let path = e.path();
            let deleted_at = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    let dt: chrono::DateTime<chrono::Utc> = t.into();
                    dt.to_rfc3339()
                })
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
            return Some(TrashedItemBrief {
                name: mcp_name.to_string(),
                path: path.to_string_lossy().to_string(),
                deleted_at,
            });
        }
    }
    None
}

// ============================================================================
// Trash metadata snapshot (B-P0-7 / E3-3 / E4-1)
// ============================================================================
//
// Skills and MCPs are deleted by moving the on-disk artefact (a directory
// for skills, a single `.json` for MCPs) into `~/.ensemble/trash/<kind>/`
// and stripping the corresponding entry from `data.json::*_metadata`.
// Without an extra step, RestoreFromTrash brings the files back but the
// user's category / tags / icon are gone — directly contradicting the
// `MarketplaceCollisionModal` text "Restoring will recover your category,
// tags, and custom icon" (PRD §7.6).
//
// The fix is a *snapshot file* written alongside the artefact at delete
// time:
// - For skills: `<dir>/_ensemble_metadata.json` (lives inside the skill dir
//   so it travels with `fs::rename` of the dir into trash and back).
// - For MCPs: `<original_path>.metadata.json` (sibling file alongside the
//   trashed `.json`, since MCPs are single files not dirs).
//
// `finalize_skill_install` / `finalize_mcp_install` look for this snapshot
// during the RestoreFromTrash branch and merge it in before writing the
// new metadata, so the restored entry retains the user's classification
// work. The snapshot file is removed after a successful restore so it
// doesn't linger in the live tree.
//
// Helpers below are pub(crate) so `skills.rs` / `mcps.rs` can call them
// from their `delete_skill` / `delete_mcp` paths without leaking the
// implementation detail (snapshot file format) outside this module.

/// File name used for the in-skill-dir metadata snapshot.
const SKILL_METADATA_SNAPSHOT_FILE: &str = "_ensemble_metadata.json";

/// Suffix appended to the MCP `.json` path to produce the sibling snapshot
/// file path: `foo.json` → `foo.json.metadata.json`. Done as a suffix
/// (rather than a parallel hidden directory) so the existing trash
/// directory listing tooling continues to work without special-casing.
const MCP_METADATA_SNAPSHOT_SUFFIX: &str = ".metadata.json";

/// Snapshot a `SkillMetadata` entry into a sibling file inside the skill
/// directory. Called from `delete_skill` (skills.rs) before the dir is
/// `fs::rename`'d into trash. `live_dir` is the live skill path *before*
/// the rename; `skill_id` is the canonical id (= live path) used to look
/// up metadata in `data.json`.
///
/// On error: log to stderr and return — the delete operation must not be
/// blocked by an inability to snapshot. The user still loses the
/// metadata in that edge case (no worse than today).
pub(crate) fn snapshot_skill_metadata_into(
    live_dir: &std::path::Path,
    skill_id: &str,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let data = read_app_data()?;
    let metadata = match data.skill_metadata.get(skill_id) {
        Some(m) => m.clone(),
        None => return Ok(()), // No metadata to snapshot — no-op.
    };
    let snapshot_path = live_dir.join(SKILL_METADATA_SNAPSHOT_FILE);
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("serialise skill metadata snapshot: {}", e))?;
    fs::write(&snapshot_path, json)
        .map_err(|e| format!("write skill metadata snapshot: {}", e))?;
    Ok(())
}

/// Snapshot an `McpMetadata` entry into a sibling file alongside the MCP
/// config `.json`. `live_path` is the live MCP path *before* the rename
/// into trash; the snapshot lands at `live_path + MCP_METADATA_SNAPSHOT_SUFFIX`.
pub(crate) fn snapshot_mcp_metadata_into(
    live_path: &std::path::Path,
    mcp_id: &str,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let data = read_app_data()?;
    let metadata = match data.mcp_metadata.get(mcp_id) {
        Some(m) => m.clone(),
        None => return Ok(()),
    };
    let snapshot_path = mcp_snapshot_path_for(live_path);
    let json = serde_json::to_string_pretty(&metadata)
        .map_err(|e| format!("serialise mcp metadata snapshot: {}", e))?;
    fs::write(&snapshot_path, json)
        .map_err(|e| format!("write mcp metadata snapshot: {}", e))?;
    Ok(())
}

/// Construct the canonical sibling-snapshot path for an MCP `.json` file.
fn mcp_snapshot_path_for(mcp_path: &std::path::Path) -> std::path::PathBuf {
    let mut s = mcp_path.as_os_str().to_os_string();
    s.push(MCP_METADATA_SNAPSHOT_SUFFIX);
    std::path::PathBuf::from(s)
}

/// Read and remove a skill metadata snapshot from inside `live_dir` (which
/// has already been renamed back from trash to the live location). Returns
/// `Some(metadata)` on success; `None` when the file is missing or cannot
/// be parsed (the latter logged but not surfaced — best effort).
fn consume_skill_metadata_snapshot(live_dir: &std::path::Path) -> Option<SkillMetadata> {
    let snapshot_path = live_dir.join(SKILL_METADATA_SNAPSHOT_FILE);
    if !snapshot_path.exists() {
        return None;
    }
    let text = fs::read_to_string(&snapshot_path).ok()?;
    let parsed: SkillMetadata = match serde_json::from_str(&text) {
        Ok(m) => m,
        Err(e) => {
            eprintln!(
                "[marketplace] failed to parse skill metadata snapshot at {}: {}",
                snapshot_path.display(),
                e
            );
            // Try to remove the corrupt file so it doesn't keep showing up
            // in the live skill dir.
            let _ = fs::remove_file(&snapshot_path);
            return None;
        }
    };
    let _ = fs::remove_file(&snapshot_path);
    Some(parsed)
}

/// Read and remove an MCP metadata snapshot whose sibling lives alongside
/// `live_path` (which has already been renamed back from trash to live).
fn consume_mcp_metadata_snapshot(live_path: &std::path::Path) -> Option<McpMetadata> {
    let snapshot_path = mcp_snapshot_path_for(live_path);
    if !snapshot_path.exists() {
        return None;
    }
    let text = fs::read_to_string(&snapshot_path).ok()?;
    let parsed: McpMetadata = match serde_json::from_str(&text) {
        Ok(m) => m,
        Err(e) => {
            eprintln!(
                "[marketplace] failed to parse mcp metadata snapshot at {}: {}",
                snapshot_path.display(),
                e
            );
            let _ = fs::remove_file(&snapshot_path);
            return None;
        }
    };
    let _ = fs::remove_file(&snapshot_path);
    Some(parsed)
}

// ============================================================================
// Base64 — minimal, vendored to avoid new crate
// ============================================================================
//
// Only used to decode GitHub Contents API blob payloads, which always
// arrive as base64 (with embedded newlines). We accept both standard
// base64 (`A-Za-z0-9+/`) and url-safe base64 (`-_`) for forward
// compatibility, and tolerate whitespace / line breaks anywhere in the
// payload.
//
// Vendored to keep the crate tree lean — `base64` proper would have been
// the obvious choice but adds a transitive dep for what is here ~25
// lines of pure logic.

mod base64_simple {
    /// Decode a base64 string, ignoring whitespace, equals padding, and
    /// supporting both standard and url-safe alphabets. Returns the
    /// decoded bytes or a static error on the first invalid character.
    pub fn decode_base64(input: &str) -> Result<Vec<u8>, &'static str> {
        let mut out = Vec::with_capacity(input.len() * 3 / 4 + 2);
        let mut buffer: u32 = 0;
        let mut bits: u32 = 0;
        for c in input.chars() {
            let value = match c {
                'A'..='Z' => c as u32 - 'A' as u32,
                'a'..='z' => c as u32 - 'a' as u32 + 26,
                '0'..='9' => c as u32 - '0' as u32 + 52,
                '+' | '-' => 62,
                '/' | '_' => 63,
                '=' | '\n' | '\r' | ' ' | '\t' => continue,
                _ => return Err("invalid base64 character"),
            };
            buffer = (buffer << 6) | value;
            bits += 6;
            if bits >= 8 {
                bits -= 8;
                out.push(((buffer >> bits) & 0xFF) as u8);
                buffer &= (1 << bits) - 1;
            }
        }
        Ok(out)
    }
}

// ============================================================================
// GitHub Contents API responses
// ============================================================================

#[derive(Deserialize)]
struct GitHubContentBlob {
    /// Either `"file"` or `"dir"`. We branch on this to recurse for
    /// directories or fetch blob bytes for files.
    #[serde(rename = "type")]
    kind: String,
    name: String,
    path: String,
    /// base64-encoded content, present when `kind == "file"`. May contain
    /// embedded newlines per the GitHub API contract.
    #[serde(default)]
    content: Option<String>,
    /// `"base64"` or absent. We assume base64 always — the API
    /// docs list base64 as the only encoding for blob responses.
    #[serde(default)]
    #[allow(dead_code)]
    encoding: Option<String>,
    /// Direct download URL for files larger than 1MB (where `content`
    /// is null). V1 ignores this — we cap effective skill size at
    /// 1MB combined.
    #[serde(default)]
    download_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum GitHubContentResponse {
    Single(GitHubContentBlob),
    Multiple(Vec<GitHubContentBlob>),
}

// ============================================================================
// MCP Registry response
// ============================================================================

#[derive(Deserialize)]
struct RegistryListResponse {
    /// Each element is `{ "server": {...}, "_meta": {...} }` per the live
    /// v0.1 schema (verified via curl 2026-05-09).
    #[serde(default)]
    servers: Vec<RegistryServerEnvelope>,
    /// Pagination metadata. Live v0.1 returns `metadata.nextCursor` (opaque
    /// string when more pages exist; absent on the final page). The cursor
    /// flows back into the IPC as the user clicks Next.
    #[serde(default)]
    metadata: Option<RegistryListMetadata>,
}

#[derive(Deserialize)]
struct RegistryListMetadata {
    /// Opaque cursor string. Pass back via `?cursor=<v>` to fetch the next
    /// page. Absent / empty when the current response is the last page.
    #[serde(default, rename = "nextCursor")]
    next_cursor: Option<String>,
    /// Server count in the current response. Surfaced in dev logs only.
    #[serde(default)]
    #[allow(dead_code)]
    count: Option<u32>,
}

/// Envelope wrapping each entry in the `/v0.1/servers` response.
#[derive(Deserialize)]
struct RegistryServerEnvelope {
    server: RegistryServer,
    /// `_meta` is ignored — V1 doesn't surface registry metadata.
    #[serde(default)]
    #[allow(dead_code)]
    #[serde(rename = "_meta")]
    meta: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct RegistryServer {
    name: String,
    description: Option<String>,
    #[serde(default)]
    repository: Option<RegistryRepository>,
    #[serde(default)]
    packages: Vec<RegistryPackage>,
    #[serde(default)]
    remotes: Vec<RegistryRemote>,
    #[serde(default)]
    categories: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct RegistryRepository {
    url: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    source: Option<String>,
}

#[derive(Deserialize)]
struct RegistryPackage {
    #[serde(default)]
    runtime_hint: Option<String>,
    #[serde(default)]
    package_arguments: Vec<RegistryPackageArg>,
    #[serde(default)]
    package_environment_variables: Vec<RegistryEnvVar>,
}

#[derive(Deserialize)]
struct RegistryPackageArg {
    /// CLI argument as published by the upstream package — we copy
    /// these verbatim into `command + args` for the local
    /// `McpConfigFile`. Field shape varies across registry versions:
    /// some emit `{ value: "..." }`, others emit a positional `value`.
    #[serde(default)]
    value: Option<String>,
}

#[derive(Deserialize)]
struct RegistryEnvVar {
    name: String,
    description: Option<String>,
    #[serde(default)]
    is_required: bool,
}

#[derive(Deserialize)]
struct RegistryRemote {
    url: String,
    #[serde(rename = "type")]
    transport: Option<String>,
    #[serde(default)]
    oauth_authorization_url: Option<String>,
}

// ============================================================================
// Helpers — fetch and parse GitHub Contents API (used by install path only)
// ============================================================================

fn build_contents_url(owner: &str, repo: &str, path: &str) -> String {
    if path.is_empty() {
        format!("https://api.github.com/repos/{}/{}/contents", owner, repo)
    } else {
        format!(
            "https://api.github.com/repos/{}/{}/contents/{}",
            owner, repo, path
        )
    }
}

/// Build the `Accept` + `X-GitHub-Api-Version` headers used by every
/// GitHub Contents API request. Centralised so we set them once.
async fn github_get_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T, String> {
    let resp = marketplace_http()
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if resp.status() == reqwest::StatusCode::FORBIDDEN || resp.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        // GitHub returns 403 for rate limiting with X-RateLimit-Reset
        // header. Surface a friendly message rather than the raw body.
        let reset = resp
            .headers()
            .get("X-RateLimit-Reset")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<i64>().ok());
        let mins_to_reset = reset
            .map(|r| {
                let now = chrono::Utc::now().timestamp();
                ((r - now).max(0) / 60).max(1)
            })
            .unwrap_or(60);
        return Err(format!(
            "GitHub rate limit reached. Try again in {} minutes.",
            mins_to_reset
        ));
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub API HTTP {}", resp.status()));
    }
    resp.json::<T>()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))
}

fn extract_skill_name_from_md(md: &str) -> Option<String> {
    // Minimal frontmatter parse — look for `name: <value>` between the
    // first two `---` lines, fall back to the H1 heading.
    if let Some(stripped) = md.strip_prefix("---") {
        if let Some(end) = stripped.find("\n---") {
            let frontmatter = &stripped[..end];
            for line in frontmatter.lines() {
                if let Some(rest) = line.strip_prefix("name:") {
                    return Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }
    md.lines()
        .find_map(|l| l.strip_prefix("# ").map(|s| s.trim().to_string()))
}

fn extract_skill_description_from_md(md: &str) -> Option<String> {
    if let Some(stripped) = md.strip_prefix("---") {
        if let Some(end) = stripped.find("\n---") {
            let frontmatter = &stripped[..end];
            for line in frontmatter.lines() {
                if let Some(rest) = line.strip_prefix("description:") {
                    return Some(rest.trim().trim_matches('"').trim_matches('\'').to_string());
                }
            }
        }
    }
    None
}

fn truncate_readme(s: &str) -> String {
    if s.len() <= README_BYTES_CAP {
        s.to_string()
    } else {
        // Truncate on a UTF-8 boundary.
        let mut idx = README_BYTES_CAP;
        while idx > 0 && !s.is_char_boundary(idx) {
            idx -= 1;
        }
        format!("{}\n\n…[truncated for catalog cache]", &s[..idx])
    }
}

// ============================================================================
// V2 — skills.sh internal API (Phase I, 2026-05-10)
// ============================================================================

/// Wire envelope for `GET https://skills.sh/api/skills/{view}/{page}`.
///
/// Field names match the upstream JSON exactly; `MarketplaceSkillItem`
/// carries `#[serde(rename_all = "camelCase")]` so its `source` /
/// `skillId` / `installs` / `isOfficial` / `installsYesterday` /
/// `change` fields deserialise directly from the API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsPageResponse {
    pub skills: Vec<MarketplaceSkillItem>,
    pub total: u64,
    pub has_more: bool,
    pub page: u32,
}

/// Wire envelope for `GET https://skills.sh/api/search?q=...`.
///
/// `searchType` is one of `"fuzzy"` / `"semantic"`. `durationMs` is
/// the upstream-reported elapsed time (camelCase per upstream — verified
/// 2026-05-10 via curl; the snake-case alternative `duration_ms` does
/// not appear).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsSearchResponse {
    pub query: String,
    pub search_type: String,
    pub skills: Vec<MarketplaceSkillItem>,
    pub count: u32,
    #[serde(default)]
    pub duration_ms: u64,
}

/// Fetch one page of the skills.sh internal API.
///
/// `view` is one of `"all-time"` / `"trending"` / `"hot"`. `page` is
/// 0-indexed; each page carries up to 200 items. The `total` field on the
/// response is the *full* upstream count (not the page count) — used by
/// the frontend to render pagination affordances.
///
/// Returns the deserialised envelope. Network / HTTP-status / JSON
/// errors are surfaced to the caller as a string error so the IPC can
/// emit `marketplace:upstream-error` for the UI.
async fn fetch_skills_internal(view: &str, page: u32) -> Result<SkillsPageResponse, String> {
    let url = format!("https://skills.sh/api/skills/{}/{}", view, page);
    let resp = skills_sh_request(&url)
        .send()
        .await
        .map_err(|e| format!("skills.sh API: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("skills.sh API HTTP {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("skills.sh body read: {}", e))?;
    serde_json::from_str::<SkillsPageResponse>(&body)
        .map_err(|e| format!("skills.sh JSON parse: {}", e))
}

/// Fetch search results from the skills.sh `/api/search` endpoint.
///
/// The upstream chooses `searchType` (`fuzzy` for short queries,
/// `semantic` for longer ones); we surface it back to the frontend
/// untouched so the UI can show a hint ("Semantic results" badge).
async fn search_skills_internal(query: &str) -> Result<SkillsSearchResponse, String> {
    let url = format!(
        "https://skills.sh/api/search?q={}",
        urlencoding::encode(query)
    );
    let resp = skills_sh_request(&url)
        .send()
        .await
        .map_err(|e| format!("skills.sh search API: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("skills.sh search API HTTP {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("skills.sh search body read: {}", e))?;
    serde_json::from_str::<SkillsSearchResponse>(&body)
        .map_err(|e| format!("skills.sh search JSON parse: {}", e))
}

// ============================================================================
// README in-memory cache (V2 — bounded FIFO + 5-min TTL)
// ============================================================================

struct ReadmeCacheEntry {
    body: String,
    fetched_at: i64, // unix seconds
}

static README_CACHE: OnceLock<std::sync::Mutex<HashMap<String, ReadmeCacheEntry>>> =
    OnceLock::new();

fn readme_cache() -> &'static std::sync::Mutex<HashMap<String, ReadmeCacheEntry>> {
    README_CACHE.get_or_init(|| std::sync::Mutex::new(HashMap::new()))
}

fn readme_cache_get(key: &str) -> Option<String> {
    let now = chrono::Utc::now().timestamp();
    let cache = readme_cache().lock().ok()?;
    let entry = cache.get(key)?;
    if now - entry.fetched_at > README_CACHE_TTL_SECS {
        return None;
    }
    Some(entry.body.clone())
}

fn readme_cache_put(key: String, body: String) {
    let now = chrono::Utc::now().timestamp();
    let mut cache = match readme_cache().lock() {
        Ok(c) => c,
        Err(_) => return,
    };
    if cache.len() >= README_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
        // Evict the oldest entry (linear scan; cap is small).
        if let Some(oldest_key) = cache
            .iter()
            .min_by_key(|(_, v)| v.fetched_at)
            .map(|(k, _)| k.clone())
        {
            cache.remove(&oldest_key);
        }
    }
    cache.insert(
        key,
        ReadmeCacheEntry {
            body,
            fetched_at: now,
        },
    );
}

/// Try `https://raw.githubusercontent.com/{source}/HEAD/{skill_id}/SKILL.md`
/// first (skill in subfolder), then fall back to
/// `https://raw.githubusercontent.com/{source}/HEAD/SKILL.md` (skill at
/// repo root). Returns the markdown body — capped at `README_BYTES_CAP`.
///
/// `source` and `skill_id` flow from the catalog item directly. Both go
/// through `sanitize_resource_name` for path-traversal defence in depth
/// (the API surface accepts arbitrary strings).
async fn fetch_skill_readme_github(source: &str, skill_id: &str) -> Result<String, String> {
    // Validate `source` shape: must be `owner/repo` with simple chars.
    let parts: Vec<&str> = source.split('/').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid source (expected owner/repo): {}", source));
    }
    let owner = sanitize_resource_name(parts[0])
        .map_err(|e| format!("Invalid source owner: {}", e))?;
    let repo = sanitize_resource_name(parts[1])
        .map_err(|e| format!("Invalid source repo: {}", e))?;

    // skill_id may include intermediate `/` separators (e.g.
    // `skills/skill-creator`) — sanitise each segment independently.
    let safe_skill_id_segments: Vec<String> = skill_id
        .split('/')
        .filter(|s| !s.is_empty())
        .map(sanitize_resource_name)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Invalid skill_id segment: {}", e))?;
    let safe_skill_id = safe_skill_id_segments.join("/");

    let cache_key = format!("{}/{}|{}", owner, repo, safe_skill_id);
    if let Some(cached) = readme_cache_get(&cache_key) {
        return Ok(cached);
    }

    // Fallback chain. Anthropic-style skills convention is SKILL.md; many
    // non-Anthropic skills on skills.sh use README.md instead. Sub-path
    // is the canonical location for multi-skill repos; repo root is the
    // fallback for single-skill repos.
    let mut tried_urls: Vec<String> = Vec::new();
    if !safe_skill_id.is_empty() {
        tried_urls.push(format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/{}/SKILL.md",
            owner, repo, safe_skill_id
        ));
        tried_urls.push(format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/{}/README.md",
            owner, repo, safe_skill_id
        ));
    }
    tried_urls.push(format!(
        "https://raw.githubusercontent.com/{}/{}/HEAD/SKILL.md",
        owner, repo
    ));
    tried_urls.push(format!(
        "https://raw.githubusercontent.com/{}/{}/HEAD/README.md",
        owner, repo
    ));

    let mut last_err = String::from("no urls tried");
    for url in &tried_urls {
        match marketplace_http().get(url).send().await {
            Ok(resp) if resp.status() == reqwest::StatusCode::NOT_FOUND => {
                last_err = format!("404 at {}", url);
                continue;
            }
            Ok(resp) if !resp.status().is_success() => {
                last_err = format!("HTTP {} at {}", resp.status(), url);
                continue;
            }
            Ok(resp) => match resp.text().await {
                Ok(body) => {
                    let truncated = truncate_readme(&body);
                    readme_cache_put(cache_key, truncated.clone());
                    return Ok(truncated);
                }
                Err(e) => {
                    last_err = format!("read body {}: {}", url, e);
                    continue;
                }
            },
            Err(e) => {
                last_err = format!("network {}: {}", url, e);
                continue;
            }
        }
    }
    Err(format!("README not found ({})", last_err))
}

// ============================================================================
// MCP Registry parsers + URL builder (V2, 2026-05-11)
// ============================================================================

/// Parse `(owner, repo)` from a GitHub repository URL.
///
/// Accepts the four shapes commonly written into the MCP Registry's
/// `repository.url` field plus `homepage` fields:
/// - `https://github.com/foo/bar`            (canonical)
/// - `https://github.com/foo/bar.git`        (clone URL with suffix)
/// - `http://github.com/foo/bar`             (legacy)
/// - `git@github.com:foo/bar.git`            (SSH; some registry entries use this)
/// - `ssh://git@github.com/foo/bar`          (SSH alt form)
///
/// The trailing `.git` suffix is stripped from the returned repo segment.
/// Anything past the second `/` (like `/blob/main/...` or `#anchor`) is
/// dropped — the caller only needs the `(owner, repo)` slice.
///
/// Returns `("", "")` when no GitHub URL pattern matches; callers should
/// fall back to whatever is best-effort sensible (typically `item.author`
/// for MCP installs).
fn parse_owner_repo_from_url(url: &str) -> (String, String) {
    let trimmed = url.trim();
    // Strip every recognised prefix, leaving just `<owner>/<repo>...` (or
    // `<owner>/<repo>.git` etc.) for downstream slicing.
    let rest_opt = trimmed
        .strip_prefix("https://github.com/")
        .or_else(|| trimmed.strip_prefix("http://github.com/"))
        .or_else(|| trimmed.strip_prefix("git+https://github.com/"))
        .or_else(|| trimmed.strip_prefix("ssh://git@github.com/"))
        .or_else(|| trimmed.strip_prefix("git@github.com:"));
    let rest = match rest_opt {
        Some(r) => r,
        None => return (String::new(), String::new()),
    };
    let mut parts = rest.splitn(3, '/');
    let owner = parts.next().unwrap_or("");
    let repo_raw = parts.next().unwrap_or("");
    if owner.is_empty() || repo_raw.is_empty() {
        return (String::new(), String::new());
    }
    // Trim `.git` suffix and any trailing query/anchor that the registry
    // sometimes leaves on the URL.
    let repo = repo_raw
        .trim_end_matches(".git")
        .split(|c| c == '#' || c == '?')
        .next()
        .unwrap_or("");
    if repo.is_empty() {
        return (String::new(), String::new());
    }
    (owner.to_string(), repo.to_string())
}

/// Strip a reverse-DNS namespace prefix from an MCP server name for
/// human display. The Official Registry uses names like
/// `ac.tandem/docs-mcp` or `io.modelcontextprotocol/everything`; the
/// part before the first `/` is a reverse-DNS namespace which has no
/// meaning to end users. Return only the trailing segment.
///
/// Names without a dotted prefix (e.g. seed names like `filesystem`)
/// pass through unchanged.
fn strip_reverse_dns_prefix(full: &str) -> String {
    if let Some(slash) = full.find('/') {
        let prefix = &full[..slash];
        if prefix.contains('.') {
            return full[slash + 1..].to_string();
        }
    }
    full.to_string()
}

/// Convert a single registry envelope into our `MarketplaceMcpItem`. Returns
/// `None` for servers with neither `packages` nor `remotes` — there is nothing
/// we could install from those.
fn envelope_to_item(s: RegistryServer, now: &str) -> Option<MarketplaceMcpItem> {
    let repo_url = s
        .repository
        .as_ref()
        .and_then(|r| r.url.clone())
        .unwrap_or_default();
    let (owner, repo) = parse_owner_repo_from_url(&repo_url);

    // Determine type: HTTP wins over stdio when both are present
    // (D-Imp-2 spec note — easier UX on the install side).
    let (mcp_type, stdio_config, http_config) = if let Some(remote) = s.remotes.first() {
        (
            "http".to_string(),
            None,
            Some(HttpMcpConfig {
                url: remote.url.clone(),
                transport: remote.transport.clone().unwrap_or_else(|| "sse".to_string()),
                oauth_authorization_url: remote.oauth_authorization_url.clone(),
            }),
        )
    } else if let Some(pkg) = s.packages.first() {
        let command = pkg
            .runtime_hint
            .clone()
            .unwrap_or_else(|| "node".to_string());
        let args: Vec<String> = pkg
            .package_arguments
            .iter()
            .filter_map(|a| a.value.clone())
            .collect();
        // Registry env vars only carry `name + description + isRequired`.
        // `whereToFind` is `None` (no separate URL field) — the description
        // already contains any "create a token at …" guidance, so duplicating
        // it into `whereToFind` was producing a doubled placeholder + caption.
        let required_env_vars: Vec<EnvVarSpec> = pkg
            .package_environment_variables
            .iter()
            .filter(|e| e.is_required)
            .map(|e| EnvVarSpec {
                name: e.name.clone(),
                description: e.description.clone(),
                where_to_find: None,
            })
            .collect();
        (
            "stdio".to_string(),
            Some(StdioMcpConfig {
                command,
                args,
                required_env_vars,
            }),
            None,
        )
    } else {
        return None;
    };

    Some(MarketplaceMcpItem {
        // `id` keeps the full reverse-DNS form for uniqueness across the
        // registry's namespace; `name` is stripped for display.
        id: s.name.clone(),
        name: strip_reverse_dns_prefix(&s.name),
        description: s.description.unwrap_or_default(),
        readme_markdown: String::new(),
        author: owner,
        // B-P0-3: persist the parsed GitHub `repo` so install metadata can
        // write a real `(owner, repo, name)` triple instead of the legacy
        // `(author, author, name)` placeholder. Empty when the upstream URL
        // is not parseable; install paths fall back to the author for
        // backward compatibility.
        repo,
        repository_url: repo_url,
        last_updated_at: now.to_string(),
        stars: 0,
        categories: s.categories,
        tags: s.tags,
        license: None,
        mcp_type,
        stdio_config,
        http_config,
    })
}

/// Wire response shape for the V2 page-mode IPCs. Mirrors TypeScript
/// `McpsPageResponse`. `next_cursor` is `None` when the upstream signals
/// "no more pages"; `has_more` mirrors `next_cursor.is_some()` for UI
/// consumption convenience.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpsPageResponse {
    pub items: Vec<MarketplaceMcpItem>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
}

/// Build the URL for one page of the live registry. `version=latest` is
/// always set (server-side dedupe of multi-version entries; replaces V1's
/// client-side filter). `cursor`, `search`, and `updated_since` are passed
/// through when present.
fn build_registry_url(
    cursor: Option<&str>,
    limit: u32,
    search: Option<&str>,
    updated_since: Option<&str>,
) -> String {
    let mut url = String::from("https://registry.modelcontextprotocol.io/v0.1/servers?");
    let limit = limit.clamp(1, 100);
    url.push_str(&format!("limit={}", limit));
    url.push_str("&version=latest");
    if let Some(c) = cursor {
        if !c.is_empty() {
            url.push_str(&format!("&cursor={}", urlencoding::encode(c)));
        }
    }
    if let Some(q) = search {
        if !q.is_empty() {
            url.push_str(&format!("&search={}", urlencoding::encode(q)));
        }
    }
    if let Some(t) = updated_since {
        if !t.is_empty() {
            url.push_str(&format!("&updated_since={}", urlencoding::encode(t)));
        }
    }
    url
}

/// Fetch one page of the live registry. Centralises HTTP + parse + envelope
/// → `MarketplaceMcpItem` conversion. Returns `(items, next_cursor)`.
async fn fetch_registry_page(
    cursor: Option<&str>,
    limit: u32,
    search: Option<&str>,
    updated_since: Option<&str>,
) -> Result<(Vec<MarketplaceMcpItem>, Option<String>), String> {
    let url = build_registry_url(cursor, limit, search, updated_since);
    let resp = marketplace_http()
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("MCP Registry HTTP {}", resp.status()));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Read MCP Registry body: {}", e))?;
    let parsed: RegistryListResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Parse MCP Registry response: {}", e))?;
    let next_cursor = parsed
        .metadata
        .and_then(|m| m.next_cursor)
        .filter(|c| !c.is_empty());
    let now = chrono::Utc::now().to_rfc3339();
    let items: Vec<MarketplaceMcpItem> = parsed
        .servers
        .into_iter()
        .filter_map(|env| envelope_to_item(env.server, &now))
        .collect();
    Ok((items, next_cursor))
}

// ============================================================================
// IPC: list_marketplace_skills (V2 — skills.sh internal API pagination)
// ============================================================================

/// Validate the `view` parameter against the upstream's known set.
/// Returns the canonical lowercased value or an error string.
fn validate_skills_view(view: &str) -> Result<&str, String> {
    match view {
        "all-time" | "trending" | "hot" => Ok(view),
        other => Err(format!(
            "Invalid view: {} (expected one of: all-time, trending, hot)",
            other
        )),
    }
}

/// V2: fetch one page of skills directly from the skills.sh internal API.
///
/// The full envelope (`SkillsPageResponse`) is returned so the frontend can
/// drive pagination from `total` + `hasMore`. The caller specifies:
///
/// - `view`: `"all-time"` | `"trending"` | `"hot"`
/// - `page`: 0-indexed page number; each page carries up to 200 items
///
/// All `MarketplaceSkillItem` GitHub-derived fields (`stars`, `last_updated_at`,
/// `license`, etc.) come back empty for V2 list-page items — the frontend
/// renders `installs` instead. When the user opens the detail panel the
/// frontend calls `get_marketplace_skill_readme` to populate the body.
#[tauri::command]
pub async fn list_marketplace_skills(
    app: AppHandle,
    view: String,
    page: u32,
) -> Result<SkillsPageResponse, String> {
    validate_skills_view(&view)?;
    match fetch_skills_internal(&view, page).await {
        Ok(resp) => Ok(resp),
        Err(e) => {
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "skills", "error": e}),
            );
            Err(e)
        }
    }
}

// ============================================================================
// IPC: search_marketplace_skills (V2 — fuzzy / semantic via skills.sh)
// ============================================================================

#[tauri::command]
pub async fn search_marketplace_skills(
    app: AppHandle,
    query: String,
) -> Result<SkillsSearchResponse, String> {
    let trimmed = query.trim();
    if trimmed.len() < 2 {
        return Err("Query must be at least 2 characters".to_string());
    }
    match search_skills_internal(trimmed).await {
        Ok(resp) => Ok(resp),
        Err(e) => {
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "skills", "error": e}),
            );
            Err(e)
        }
    }
}

// ============================================================================
// IPC: get_marketplace_skill_readme (V2 — GitHub raw + 5-min memory cache)
// ============================================================================

#[tauri::command]
pub async fn get_marketplace_skill_readme(
    source: String,
    skill_id: String,
) -> Result<String, String> {
    fetch_skill_readme_github(&source, &skill_id).await
}

// ============================================================================
// IPC: get_marketplace_mcp_readme (V2 — GitHub raw README + 5-min cache)
// ============================================================================
//
// Registry server entries carry `repository.url` pointing at the upstream
// GitHub repo but no README content; the detail panel needs to fetch it
// on-demand. Tries the `.md` cases (README.md / Readme.md / readme.md)
// at the repo root via `raw.githubusercontent.com/<owner>/<repo>/HEAD/...`.

/// Extract the sub-path portion from a GitHub URL that points at a folder
/// inside a monorepo, e.g. `https://github.com/foo/bar/tree/main/packages/x`
/// → `Some("packages/x")`. Returns `None` for repo-root URLs.
fn extract_github_subpath(repository_url: &str) -> Option<String> {
    // Matches both `/tree/<branch>/...` and `/blob/<branch>/...` GitHub URL
    // shapes. Branch segment is consumed and discarded; everything after
    // becomes the sub-path.
    for marker in ["/tree/", "/blob/"] {
        if let Some(idx) = repository_url.find(marker) {
            let rest = &repository_url[idx + marker.len()..];
            // Skip the branch segment (everything up to the next `/`).
            if let Some(slash) = rest.find('/') {
                let sub = &rest[slash + 1..];
                let sub = sub.trim_end_matches('/');
                if !sub.is_empty() {
                    return Some(sub.to_string());
                }
            }
            // Branch-only URL (no sub-path).
            return None;
        }
    }
    None
}

async fn fetch_mcp_readme_github(repository_url: &str) -> Result<String, String> {
    let (owner_raw, repo_raw) = parse_owner_repo_from_url(repository_url);
    if owner_raw.is_empty() || repo_raw.is_empty() {
        return Err(format!(
            "Could not parse owner/repo from repository URL: {}",
            repository_url
        ));
    }
    let owner = sanitize_resource_name(&owner_raw)
        .map_err(|e| format!("Invalid owner segment: {}", e))?;
    let repo =
        sanitize_resource_name(&repo_raw).map_err(|e| format!("Invalid repo segment: {}", e))?;

    // Sub-path from `tree/<branch>/<sub>` (monorepo case). Each segment is
    // sanitized; empties are filtered.
    let safe_sub_segments: Option<Vec<String>> = extract_github_subpath(repository_url)
        .map(|sub| {
            sub.split('/')
                .filter(|s| !s.is_empty())
                .map(sanitize_resource_name)
                .collect::<Result<Vec<_>, _>>()
        })
        .transpose()
        .map_err(|e| format!("Invalid subpath segment: {}", e))?;
    let safe_sub = safe_sub_segments.map(|v| v.join("/")).filter(|s| !s.is_empty());

    let cache_key = match &safe_sub {
        Some(s) => format!("mcp:{}/{}/{}", owner, repo, s),
        None => format!("mcp:{}/{}", owner, repo),
    };
    if let Some(cached) = readme_cache_get(&cache_key) {
        return Ok(cached);
    }

    // Fallback chain. Sub-path first (monorepo MCPs), then repo root, each
    // tried across README.md / Readme.md / readme.md case variants.
    let mut tried_urls: Vec<String> = Vec::new();
    if let Some(ref sub) = safe_sub {
        for name in ["README.md", "Readme.md", "readme.md"] {
            tried_urls.push(format!(
                "https://raw.githubusercontent.com/{}/{}/HEAD/{}/{}",
                owner, repo, sub, name
            ));
        }
    }
    for name in ["README.md", "Readme.md", "readme.md"] {
        tried_urls.push(format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/{}",
            owner, repo, name
        ));
    }

    let mut last_err = String::from("no urls tried");
    for url in &tried_urls {
        match marketplace_http().get(url).send().await {
            Ok(resp) if resp.status() == reqwest::StatusCode::NOT_FOUND => {
                last_err = format!("404 at {}", url);
                continue;
            }
            Ok(resp) if !resp.status().is_success() => {
                last_err = format!("HTTP {} at {}", resp.status(), url);
                continue;
            }
            Ok(resp) => match resp.text().await {
                Ok(body) => {
                    let truncated = truncate_readme(&body);
                    readme_cache_put(cache_key, truncated.clone());
                    return Ok(truncated);
                }
                Err(e) => {
                    last_err = format!("read body {}: {}", url, e);
                    continue;
                }
            },
            Err(e) => {
                last_err = format!("network {}: {}", url, e);
                continue;
            }
        }
    }
    Err(format!("README not found ({})", last_err))
}

#[tauri::command]
pub async fn get_marketplace_mcp_readme(repository_url: String) -> Result<String, String> {
    fetch_mcp_readme_github(&repository_url).await
}

// ============================================================================
// MCP seed builder (well-known servers users expect to see)
// ============================================================================

/// Build a `Vec<MarketplaceMcpItem>` from `MCP_SEED`. These are the
/// well-known MCP servers users expect to see at first paint —
/// Filesystem, GitHub, Playwright, Memory, etc. The Official MCP
/// Registry has only ~30 long-tail entries; without this seed,
/// `MCP Marketplace` would not surface any name a developer
/// recognises.
fn build_mcp_seed_items() -> Vec<MarketplaceMcpItem> {
    use crate::commands::marketplace_seed::MCP_SEED;
    let now = chrono::Utc::now().to_rfc3339();
    MCP_SEED
        .iter()
        .map(|seed| {
            let env_vars: Vec<EnvVarSpec> = seed
                .env_vars
                .iter()
                .map(|(name, hint)| EnvVarSpec {
                    name: name.to_string(),
                    description: Some(hint.to_string()),
                    where_to_find: Some(hint.to_string()),
                })
                .collect();
            let (owner, repo) = parse_owner_repo_from_url(seed.repository_url);
            let author = if owner.is_empty() {
                seed.display_name.to_string()
            } else {
                owner
            };
            MarketplaceMcpItem {
                id: seed.id.to_string(),
                name: seed.display_name.to_string(),
                description: seed.description.to_string(),
                readme_markdown: String::new(),
                author,
                repo,
                repository_url: seed.repository_url.to_string(),
                last_updated_at: now.clone(),
                stars: 0,
                categories: Vec::new(),
                tags: Vec::new(),
                license: None,
                mcp_type: "stdio".to_string(),
                stdio_config: Some(StdioMcpConfig {
                    command: seed.command.to_string(),
                    args: seed.args.iter().map(|a| a.to_string()).collect(),
                    required_env_vars: env_vars,
                }),
                http_config: None,
            }
        })
        .collect()
}

/// Prepend `MCP_SEED` items to the first page of registry results, deduping
/// by canonical `name` (seed wins). Used only when the IPC is fetching
/// page 1 (`cursor.is_none()`); subsequent pages return registry items as-is
/// because the seed has already been served on the first page.
fn merge_seed_at_top(
    seed: Vec<MarketplaceMcpItem>,
    registry: Vec<MarketplaceMcpItem>,
) -> Vec<MarketplaceMcpItem> {
    let mut out = seed;
    let seen: std::collections::HashSet<String> =
        out.iter().map(|i| i.name.clone()).collect();
    for r in registry {
        if !seen.contains(&r.name) {
            out.push(r);
        }
    }
    out
}

// ============================================================================
// IPC: list_marketplace_mcps_page (V2, 2026-05-11)
// ============================================================================
//
// Main paginated browse. Mirrors the Registry website's main list:
// `?limit=N&version=latest[&cursor=...]`. Page 1 (no cursor) merges
// `MCP_SEED` at the top so well-known servers show up first; later pages
// return live registry items only.

#[tauri::command]
pub async fn list_marketplace_mcps_page(
    app: AppHandle,
    cursor: Option<String>,
    limit: u32,
) -> Result<McpsPageResponse, String> {
    let cursor_ref = cursor.as_deref();
    match fetch_registry_page(cursor_ref, limit, None, None).await {
        Ok((registry_items, next_cursor)) => {
            // Merge seed only on the first page request.
            let items = if cursor_ref.is_none() {
                merge_seed_at_top(build_mcp_seed_items(), registry_items)
            } else {
                registry_items
            };
            Ok(McpsPageResponse {
                has_more: next_cursor.is_some(),
                items,
                next_cursor,
            })
        }
        Err(e) => {
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "mcps", "error": e}),
            );
            Err(e)
        }
    }
}

// ============================================================================
// IPC: list_recently_updated_mcps (V2, 2026-05-11; cursor-paginated 2026-05-11)
// ============================================================================
//
// Drives the "Recently Updated" view tab: `?updated_since=<RFC3339>&limit=N
// &version=latest[&cursor=...]`. Cursor-paginated like the main listing
// (the user can walk forward / back via Next / Previous), uniform
// `McpsPageResponse` shape with `list_marketplace_mcps_page`.

#[tauri::command]
pub async fn list_recently_updated_mcps(
    app: AppHandle,
    hours_back: u32,
    cursor: Option<String>,
    limit: u32,
) -> Result<McpsPageResponse, String> {
    let since = chrono::Utc::now() - chrono::Duration::hours(hours_back.max(1) as i64);
    let since_rfc = since.to_rfc3339();
    match fetch_registry_page(cursor.as_deref(), limit, None, Some(&since_rfc)).await {
        Ok((items, next_cursor)) => Ok(McpsPageResponse {
            has_more: next_cursor.is_some(),
            items,
            next_cursor,
        }),
        Err(e) => {
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "mcps", "error": e}),
            );
            Err(e)
        }
    }
}

// ============================================================================
// IPC: search_marketplace_mcps (V2, 2026-05-11)
// ============================================================================
//
// Server-side substring search on `name` only (the Registry API does not
// index description / tags). Cursor-paginated like the main listing; UI
// hints to the user that the search field is narrower than full-text.

#[tauri::command]
pub async fn search_marketplace_mcps(
    app: AppHandle,
    query: String,
    cursor: Option<String>,
    limit: u32,
) -> Result<McpsPageResponse, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Err("Query must be non-empty".to_string());
    }
    match fetch_registry_page(cursor.as_deref(), limit, Some(trimmed), None).await {
        Ok((items, next_cursor)) => Ok(McpsPageResponse {
            has_more: next_cursor.is_some(),
            items,
            next_cursor,
        }),
        Err(e) => {
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "mcps", "error": e}),
            );
            Err(e)
        }
    }
}

// ============================================================================
// IPC: update_mcp_env_vars (B-P0-6 / E3-1 — stdio env vars persist)
// ============================================================================
//
// PRD §5.4(b) / §7.5 promises that the user's filled-in stdio env values
// survive across restarts and propagate to Sync. The original implementation
// stored env in component state only (`McpMarketplacePage.handleSaveEnv`),
// so the "Saved" reflection was visual only and any of: closing the panel,
// switching pages, restarting the app, or running Sync produced empty env
// vars at the destination — Claude Code then failed cryptically.
//
// This IPC is the missing piece. It atomically:
//
//   1. Acquires `DATA_MUTEX` (defence in depth — even though we mutate the
//      MCP's *.json* file rather than `data.json`, taking the canonical
//      lock keeps any concurrent metadata mutator (e.g. classify) from
//      interleaving observable state).
//   2. Reads `~/.ensemble/mcps/<name>.json` into `McpConfigFile`.
//   3. Replaces the `env` field with the supplied map (full replacement,
//      not merge — V1 contract: "what the panel shows is what gets saved").
//   4. Writes the updated JSON back atomically.
//
// `mcp_id` is the canonical id used everywhere in the data model (= the
// absolute path to the MCP `.json`). The IPC fails fast if the file does
// not exist, returning a friendly error the panel can surface.
#[tauri::command]
pub fn update_mcp_env_vars(
    mcp_id: String,
    env: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let path = std::path::PathBuf::from(&mcp_id);
    if !path.exists() {
        return Err(format!("MCP config not found: {}", mcp_id));
    }
    let text =
        fs::read_to_string(&path).map_err(|e| format!("read MCP config: {}", e))?;
    let mut cfg: McpConfigFile =
        serde_json::from_str(&text).map_err(|e| format!("parse MCP config: {}", e))?;
    cfg.env = if env.is_empty() { None } else { Some(env) };
    let json = serde_json::to_string_pretty(&cfg)
        .map_err(|e| format!("serialise MCP config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("write MCP config: {}", e))?;
    Ok(())
}

// ============================================================================
// IPC: refresh_marketplace_cache (spec §3.6)
// ============================================================================

#[tauri::command]
pub async fn refresh_marketplace_cache(app: AppHandle, source: String) -> Result<(), String> {
    match source.as_str() {
        "skills" => {
            // V2: Skills are fresh-fetched per call (no cache). Refresh here
            // is a noop except for the implicit "warm the connection" effect
            // of one round-trip to skills.sh. We pull page 0 of the all-time
            // view to confirm reachability and surface upstream errors.
            list_marketplace_skills(app, "all-time".to_string(), 0).await?;
            Ok(())
        }
        "mcps" => {
            // V2 (2026-05-11): MCPs are paginated and fresh-fetched per call;
            // there is no cache layer to invalidate. Frontend no longer calls
            // this branch — the page driver re-runs `loadMcpsFirstPage` /
            // `loadRecentlyUpdated` instead. Kept here so the IPC continues
            // to accept "mcps" without erroring out for any in-flight legacy
            // callers, but the body is a noop.
            Ok(())
        }
        other => Err(format!("Unknown marketplace source: {}", other)),
    }
}

// ============================================================================
// IPC: install_marketplace_skill (spec §3.3)
// ============================================================================

/// Recursively download a skill directory from GitHub to `dest_dir`.
/// Pacing applies between every blob/dir request.
async fn download_skill_recursive(
    owner: &str,
    repo: &str,
    path: &str,
    dest_dir: &std::path::Path,
) -> Result<(), String> {
    let resp: GitHubContentResponse =
        github_get_json(&build_contents_url(owner, repo, path)).await?;
    let entries = match resp {
        GitHubContentResponse::Single(b) => vec![b],
        GitHubContentResponse::Multiple(v) => v,
    };

    fs::create_dir_all(dest_dir).map_err(|e| format!("create dir: {}", e))?;

    for entry in entries {
        tokio::time::sleep(Duration::from_millis(GITHUB_PACING_MS)).await;
        // B-P0-1 — security: every recursive `entry.name` must pass the
        // same alphabet check before being joined. GitHub Contents API does
        // not protect us from a tree node whose `name` is `..` or `foo/bar`
        // (rare but possible via crafted contents).
        let safe_entry_name = match sanitize_resource_name(&entry.name) {
            Ok(n) => n,
            Err(e) => return Err(format!("Invalid entry name: {}", e)),
        };
        let target = dest_dir.join(&safe_entry_name);
        match entry.kind.as_str() {
            "file" => {
                let bytes = if let Some(b64) = entry.content {
                    decode_base64(&b64).map_err(|e| format!("decode {}: {}", entry.name, e))?
                } else if let Some(url) = entry.download_url {
                    // Large file fallback — just GET the raw bytes.
                    let r = marketplace_http()
                        .get(&url)
                        .send()
                        .await
                        .map_err(|e| format!("download {}: {}", entry.name, e))?;
                    r.bytes()
                        .await
                        .map_err(|e| format!("read {}: {}", entry.name, e))?
                        .to_vec()
                } else {
                    return Err(format!("{} has neither content nor download_url", entry.name));
                };
                fs::write(&target, bytes).map_err(|e| format!("write {}: {}", entry.name, e))?;
            }
            "dir" => {
                Box::pin(download_skill_recursive(owner, repo, &entry.path, &target)).await?;
            }
            _ => {
                // Skip submodules / symlinks at top level — uncommon in
                // skill repos and tricky to mirror correctly.
            }
        }
    }
    Ok(())
}

/// Derive `(owner, repo, skill_path)` for the GitHub Contents API from a
/// catalog item. V2 internal-API items carry `source = "owner/repo"` and
/// `skillId = "<path-within-repo>"`; V1 cache items carried `owner` /
/// `repo` / `skill_path` separately. Prefer V2 when both are present; fall
/// back to V1 fields. Empty strings on any axis mean "skill at repo root".
fn derive_install_triple(item: &MarketplaceSkillItem) -> (String, String, String) {
    if !item.source.is_empty() {
        let parts: Vec<&str> = item.source.splitn(2, '/').collect();
        if parts.len() == 2 {
            let owner = parts[0].to_string();
            let repo = parts[1].to_string();
            // Use `skill_id` (V2) preferentially; fall back to `skill_path` (V1).
            let path = if !item.skill_id.is_empty() {
                item.skill_id.clone()
            } else {
                item.skill_path.clone()
            };
            return (owner, repo, path);
        }
    }
    // V1 fallback path.
    (
        item.owner.clone(),
        item.repo.clone(),
        item.skill_path.clone(),
    )
}

#[tauri::command]
pub async fn install_marketplace_skill(
    app: AppHandle,
    item: MarketplaceSkillItem,
    conflict_action: Option<ConflictAction>,
) -> Result<InstallOutcome, String> {
    // B-P0-1 — security: validate `item.name` before any FS join. Failure
    // returns an `InstallOutcome::Failed` so the user sees a clean inline
    // error instead of an aborted IPC; the message identifies which name
    // tripped the check for diagnostics.
    let safe_name = match sanitize_resource_name(&item.name) {
        Ok(n) => n,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("Invalid resource name: {}", e),
            });
        }
    };
    let skills_dir = get_app_data_dir().join("skills");
    fs::create_dir_all(&skills_dir).map_err(|e| format!("create skills dir: {}", e))?;
    let target_dir = skills_dir.join(&safe_name);
    // Defence in depth (E1-1 fix): even with the alphabet check above, refuse
    // the install if the resolved path somehow escapes the skills directory.
    // We canonicalise the parent (which exists) and verify the joined target
    // remains beneath it.
    if let Ok(canonical_parent) = skills_dir.canonicalize() {
        if !target_dir.starts_with(&canonical_parent) {
            return Ok(InstallOutcome::Failed {
                reason: format!("Refused: target outside skills_dir: {}", target_dir.display()),
            });
        }
    }
    let trash_dir = get_app_data_dir().join("trash").join("skills");

    // -- Collision detection (no IPC mutation yet)
    let has_local = target_dir.exists();
    let trash_brief = find_skill_trash_brief(&safe_name);
    let has_trashed = trash_brief.is_some();
    if conflict_action.is_none() && (has_local || has_trashed) {
        return Ok(InstallOutcome::NameCollision {
            has_local,
            has_trashed: trash_brief,
        });
    }

    // -- Conflict resolution path
    if let Some(ConflictAction::Replace) = conflict_action {
        // Move existing → trash with timestamp.
        if target_dir.exists() {
            fs::create_dir_all(&trash_dir).map_err(|e| format!("create trash: {}", e))?;
            let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let mut dest = trash_dir.join(&safe_name);
            if dest.exists() {
                dest = trash_dir.join(format!("{}_{}", safe_name, ts));
            }
            // B-P0-7: snapshot current metadata into the dir we're about to
            // rename to trash so a subsequent RestoreFromTrash can recover
            // the user's category / tags / icon (PRD §7.6 + Modal文案契约).
            // We write to `target_dir` BEFORE the rename so the snapshot
            // travels with the move; failure to snapshot doesn't block
            // the install.
            let old_skill_id = target_dir.to_string_lossy().to_string();
            let _ = snapshot_skill_metadata_into(&target_dir, &old_skill_id);
            fs::rename(&target_dir, &dest).map_err(|e| format!("trash old: {}", e))?;
        }
        // Drop old metadata so the new install starts clean (PRD §7.6).
        {
            let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
            let mut data = read_app_data()?;
            let old_id = target_dir.to_string_lossy().to_string();
            data.skill_metadata.remove(&old_id);
            write_app_data(data)?;
        }
    } else if let Some(ConflictAction::RestoreFromTrash { trash_path }) = &conflict_action {
        // Move trash entry back; DO NOT download. Metadata is reconstructed
        // from the marketplace upstream below (Trash never persists meta).
        let src = std::path::PathBuf::from(trash_path);
        if !src.exists() {
            return Ok(InstallOutcome::Failed {
                reason: format!("Trash path no longer exists: {}", trash_path),
            });
        }
        if target_dir.exists() {
            return Ok(InstallOutcome::Failed {
                reason: "Live entry exists; pick Replace instead of Restore.".to_string(),
            });
        }
        fs::rename(&src, &target_dir).map_err(|e| format!("restore from trash: {}", e))?;
        return finalize_skill_install(app, &item, target_dir).await;
    }

    // -- Download path (None and Replace both reach here once the path is clear)
    let (owner, repo, skill_path) = derive_install_triple(&item);
    if owner.is_empty() || repo.is_empty() {
        return Ok(InstallOutcome::Failed {
            reason: format!(
                "Cannot derive owner/repo from item.source={:?}, item.owner={:?}, item.repo={:?}",
                item.source, item.owner, item.repo
            ),
        });
    }
    if let Err(e) = download_skill_recursive(&owner, &repo, &skill_path, &target_dir).await {
        // Roll back partial download so the next attempt sees a clean target.
        let _ = fs::remove_dir_all(&target_dir);
        return Ok(InstallOutcome::Failed { reason: e });
    }

    finalize_skill_install(app, &item, target_dir).await
}

async fn finalize_skill_install(
    app: AppHandle,
    item: &MarketplaceSkillItem,
    target_dir: std::path::PathBuf,
) -> Result<InstallOutcome, String> {
    let skill_id = target_dir.to_string_lossy().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // B-P0-7: if a metadata snapshot was deposited at delete time (Replace
    // / RestoreFromTrash flows in marketplace.rs, or `delete_skill` in
    // skills.rs), recover the user's prior category / tags / icon and
    // merge them into the new entry. Non-RestoreFromTrash paths simply
    // find no snapshot and behave as before.
    let recovered = consume_skill_metadata_snapshot(&target_dir);

    // Derive the install triple so MarketplaceSource carries real
    // (owner, repo, name) — V2 catalog items only have `source` /
    // `skill_id` populated.
    let (owner, repo, _path) = derive_install_triple(item);

    // Write metadata under DATA_MUTEX.
    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut data = read_app_data()?;
        let entry = data
            .skill_metadata
            .entry(skill_id.clone())
            .or_insert_with(SkillMetadata::default);
        if let Some(snap) = recovered {
            // Inherit user-curated fields. install_source /
            // marketplace_source are explicitly overwritten below to point
            // at the current install (the snapshot may carry stale or
            // local-only provenance).
            entry.category = snap.category;
            entry.category_id = snap.category_id;
            entry.tags = snap.tags;
            entry.icon = snap.icon;
            entry.usage_count = snap.usage_count;
            entry.last_used = snap.last_used;
            // `enabled` from the snapshot is preserved so a previously
            // disabled skill stays disabled after restore.
            entry.enabled = snap.enabled;
            if !snap.scope.is_empty() {
                entry.scope = snap.scope;
            }
        }
        entry.install_source = Some("marketplace".to_string());
        entry.marketplace_source = Some(MarketplaceSource {
            source: "skills_sh".to_string(),
            owner,
            repo,
            name: item.name.clone(),
            last_synced_at: now.clone(),
        });
        if entry.scope.is_empty() {
            entry.scope = "global".to_string();
        }
        // Track in imported list (idempotent).
        if !data
            .imported_marketplace_skills
            .contains(&item.id)
        {
            data.imported_marketplace_skills.push(item.id.clone());
        }
        write_app_data(data)?;
    }

    // Spawn auto-classify (R-15 / spec §3.5).
    spawn_auto_classify(app.clone(), skill_id.clone(), "skill".to_string());

    Ok(InstallOutcome::Installed { skill_id })
}

// ============================================================================
// IPC: install_marketplace_mcp (spec §3.4)
// ============================================================================

#[tauri::command]
pub async fn install_marketplace_mcp(
    app: AppHandle,
    item: MarketplaceMcpItem,
    conflict_action: Option<ConflictAction>,
) -> Result<InstallOutcome, String> {
    // B-P0-1 — security: validate `item.name` before any FS join.
    let safe_name = match sanitize_resource_name(&item.name) {
        Ok(n) => n,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("Invalid resource name: {}", e),
            });
        }
    };
    let mcps_dir = get_app_data_dir().join("mcps");
    fs::create_dir_all(&mcps_dir).map_err(|e| format!("create mcps dir: {}", e))?;
    let target_path = mcps_dir.join(format!("{}.json", safe_name));
    if let Ok(canonical_parent) = mcps_dir.canonicalize() {
        if !target_path.starts_with(&canonical_parent) {
            return Ok(InstallOutcome::Failed {
                reason: format!("Refused: target outside mcps_dir: {}", target_path.display()),
            });
        }
    }
    let trash_dir = get_app_data_dir().join("trash").join("mcps");

    let has_local = target_path.exists();
    let trash_brief = find_mcp_trash_brief(&safe_name);
    let has_trashed = trash_brief.is_some();
    if conflict_action.is_none() && (has_local || has_trashed) {
        return Ok(InstallOutcome::NameCollision {
            has_local,
            has_trashed: trash_brief,
        });
    }

    if let Some(ConflictAction::Replace) = conflict_action {
        if target_path.exists() {
            fs::create_dir_all(&trash_dir).map_err(|e| format!("create trash: {}", e))?;
            let ts = chrono::Utc::now().format("%Y%m%d_%H%M%S");
            let mut dest = trash_dir.join(format!("{}.json", safe_name));
            if dest.exists() {
                dest = trash_dir.join(format!("{}_{}.json", safe_name, ts));
            }
            // B-P0-7: snapshot the current MCP metadata into a sibling
            // `.metadata.json` file before the rename so RestoreFromTrash
            // can recover category / tags / icon. Move the sibling
            // alongside the config so they stay paired in trash.
            let old_mcp_id = target_path.to_string_lossy().to_string();
            let _ = snapshot_mcp_metadata_into(&target_path, &old_mcp_id);
            fs::rename(&target_path, &dest).map_err(|e| format!("trash old: {}", e))?;
            let snapshot_src = mcp_snapshot_path_for(&target_path);
            if snapshot_src.exists() {
                let snapshot_dest = mcp_snapshot_path_for(&dest);
                let _ = fs::rename(&snapshot_src, &snapshot_dest);
            }
        }
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut data = read_app_data()?;
        let old_id = target_path.to_string_lossy().to_string();
        data.mcp_metadata.remove(&old_id);
        write_app_data(data)?;
    } else if let Some(ConflictAction::RestoreFromTrash { trash_path }) = &conflict_action {
        let src = std::path::PathBuf::from(trash_path);
        if !src.exists() {
            return Ok(InstallOutcome::Failed {
                reason: format!("Trash path no longer exists: {}", trash_path),
            });
        }
        if target_path.exists() {
            return Ok(InstallOutcome::Failed {
                reason: "Live entry exists; pick Replace instead of Restore.".to_string(),
            });
        }
        fs::rename(&src, &target_path).map_err(|e| format!("restore from trash: {}", e))?;
        // B-P0-7: bring the sibling metadata snapshot back along with the
        // config file so `finalize_mcp_install` can recover it via
        // `consume_mcp_metadata_snapshot`.
        let snapshot_src_in_trash = mcp_snapshot_path_for(&src);
        if snapshot_src_in_trash.exists() {
            let snapshot_dest = mcp_snapshot_path_for(&target_path);
            let _ = fs::rename(&snapshot_src_in_trash, &snapshot_dest);
        }
        return finalize_mcp_install(app, &item, target_path).await;
    }

    // Build the file payload (R-57: McpConfigFile is constructed in three
    // places now — keep field list aligned with import.rs / plugins.rs).
    // B-P0-3: prefer `item.repo` (parsed from upstream `repository_url` at
    // fetch time); fall back to `item.author` for backward compatibility
    // with cached items written before the field was added.
    let now = chrono::Utc::now().to_rfc3339();
    let mcp_repo = if !item.repo.is_empty() {
        item.repo.clone()
    } else {
        item.author.clone()
    };
    let marketplace_source = MarketplaceSource {
        source: "mcp_registry".to_string(),
        owner: item.author.clone(),
        repo: mcp_repo.clone(),
        name: item.name.clone(),
        last_synced_at: now,
    };
    let (command, args, mcp_type, url, env_map) = match item.mcp_type.as_str() {
        "http" => {
            let http = item.http_config.clone().unwrap_or(HttpMcpConfig {
                url: String::new(),
                transport: "sse".to_string(),
                oauth_authorization_url: None,
            });
            (String::new(), Some(Vec::<String>::new()), Some("http".to_string()), Some(http.url), None)
        }
        _ => {
            let stdio = item.stdio_config.clone().unwrap_or(StdioMcpConfig {
                command: "node".to_string(),
                args: Vec::new(),
                required_env_vars: Vec::new(),
            });
            // Pre-seed env map with required keys so the user-facing
            // detail panel can show them as empty inputs.
            let env_map: std::collections::HashMap<String, String> = stdio
                .required_env_vars
                .iter()
                .map(|e| (e.name.clone(), String::new()))
                .collect();
            (stdio.command, Some(stdio.args), Some("stdio".to_string()), None, Some(env_map))
        }
    };

    let cfg = McpConfigFile {
        name: item.name.clone(),
        description: Some(item.description.clone()),
        command,
        args,
        env: env_map,
        provided_tools: None,
        url,
        mcp_type,
        install_source: Some("marketplace".to_string()),
        plugin_id: None,
        plugin_name: None,
        marketplace: None,
        marketplace_source: Some(marketplace_source),
    };
    let json = match serde_json::to_string_pretty(&cfg) {
        Ok(j) => j,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("serialize McpConfigFile: {}", e),
            });
        }
    };
    if let Err(e) = fs::write(&target_path, json) {
        let _ = fs::remove_file(&target_path);
        return Ok(InstallOutcome::Failed {
            reason: format!("write MCP config: {}", e),
        });
    }

    finalize_mcp_install(app, &item, target_path).await
}

async fn finalize_mcp_install(
    app: AppHandle,
    item: &MarketplaceMcpItem,
    target_path: std::path::PathBuf,
) -> Result<InstallOutcome, String> {
    let mcp_id = target_path.to_string_lossy().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    // B-P0-7: recover snapshot if present (RestoreFromTrash flow). See the
    // skill-side comment in `finalize_skill_install` for the rationale.
    let recovered = consume_mcp_metadata_snapshot(&target_path);

    // B-P0-9: persist requiredEnvVars from the catalog item so the Project
    // detail panel can later detect "missing required env" without holding
    // a reference to the catalog. Empty for HTTP MCPs.
    let required_env_vars: Option<Vec<EnvVarSpec>> = match item.mcp_type.as_str() {
        "stdio" => item.stdio_config.as_ref().map(|s| s.required_env_vars.clone()),
        _ => None,
    };

    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut data = read_app_data()?;
        let entry = data
            .mcp_metadata
            .entry(mcp_id.clone())
            .or_insert_with(McpMetadata::default);
        if let Some(snap) = recovered {
            entry.category = snap.category;
            entry.category_id = snap.category_id;
            entry.tags = snap.tags;
            entry.usage_count = snap.usage_count;
            entry.last_used = snap.last_used;
            entry.enabled = snap.enabled;
            if !snap.scope.is_empty() {
                entry.scope = snap.scope;
            }
        }
        entry.install_source = Some("marketplace".to_string());
        // B-P0-3: write the real `(owner, repo, name)` triple by preferring
        // the parsed `item.repo`, falling back to `item.author` for items
        // whose upstream URL was unparseable (matches `install_marketplace_mcp`).
        let mcp_repo = if !item.repo.is_empty() {
            item.repo.clone()
        } else {
            item.author.clone()
        };
        entry.marketplace_source = Some(MarketplaceSource {
            source: "mcp_registry".to_string(),
            owner: item.author.clone(),
            repo: mcp_repo,
            name: item.name.clone(),
            last_synced_at: now,
        });
        // B-P0-9: requiredEnvVars only relevant for stdio MCPs; we still
        // overwrite (even with `None`) so re-installing a previously-stdio
        // MCP as HTTP doesn't leave a stale required-env list pointing at
        // the wrong type.
        entry.required_env_vars = required_env_vars;
        if entry.scope.is_empty() {
            entry.scope = "global".to_string();
        }
        write_app_data(data)?;
    }

    spawn_auto_classify(app.clone(), mcp_id.clone(), "mcp".to_string());

    Ok(InstallOutcome::Installed { skill_id: mcp_id })
}

// ============================================================================
// IPC: auto_classify_marketplace_item (spec §3.5)
// ============================================================================

/// Spawn the post-install classification task. The task respects the
/// `autoClassifyNewItems` settings flag (D-Imp-12) — `false` means we
/// emit nothing and exit silently. Failures emit
/// `marketplace:classify-failed`; successes emit `marketplace:classify-result`.
///
/// **B-P0-4 (E1-4 fix)**: when `read_settings` itself fails (corrupt
/// `settings.json`, transient FS error) we **skip** the spawn rather than
/// optimistically spawning. This matches the conservative semantics of the
/// IPC variant `auto_classify_marketplace_item`, which propagates the
/// `read_settings` error and refuses to classify. With both paths now
/// agreeing on "settings unreachable ⇒ do not classify", a user who
/// has explicitly toggled the flag off can never observe an unexpected
/// auto-classify run, even in degraded settings-file states. The cost is
/// "auto-classify silently doesn't run when settings.json is broken",
/// which the user can recover from by re-saving Settings or fixing the
/// file by hand.
fn spawn_auto_classify(app: AppHandle, item_id: String, item_type: String) {
    tokio::spawn(async move {
        // Settings gate (D-Imp-12). Read the flag inside the spawned task
        // so all call-sites (`finalize_*_install` + `auto_classify_marketplace_item`
        // IPC) consistently honour the user toggle without each having to
        // gate themselves. Silent skip when the flag is `false`; silent
        // skip when settings cannot be read (B-P0-4 alignment).
        match crate::commands::data::read_settings() {
            Ok(settings) => {
                if !settings.auto_classify_new_items {
                    return;
                }
            }
            Err(_) => {
                // settings.json unreachable / corrupt — refuse to spawn.
                return;
            }
        }
        if let Err(e) = run_auto_classify(app.clone(), item_id.clone(), item_type.clone()).await {
            let _ = app.emit(
                "marketplace:classify-failed",
                serde_json::json!({
                    "id": item_id,
                    "itemType": item_type,
                    "error": e,
                }),
            );
        }
    });
}

#[tauri::command]
pub async fn auto_classify_marketplace_item(
    app: AppHandle,
    skill_or_mcp_id: String,
    item_type: String,
) -> Result<(), String> {
    // Settings gate (D-Imp-12). Reading directly from disk avoids a
    // second IPC + matches the Settings file layout used elsewhere.
    let settings = crate::commands::data::read_settings()?;
    if !settings.auto_classify_new_items {
        return Ok(());
    }
    spawn_auto_classify(app, skill_or_mcp_id, item_type);
    Ok(())
}

async fn run_auto_classify(
    app: AppHandle,
    item_id: String,
    item_type: String,
) -> Result<(), String> {
    // Build ClassifyItem from current data.json.
    let data = read_app_data()?;
    let (name, description, instructions, content) = match item_type.as_str() {
        "skill" => {
            // Load SKILL.md content for the body of the prompt.
            let skill_md = std::path::Path::new(&item_id).join("SKILL.md");
            let content = fs::read_to_string(&skill_md).unwrap_or_default();
            // Name + description from frontmatter when present.
            let name = extract_skill_name_from_md(&content)
                .unwrap_or_else(|| item_id.split('/').last().unwrap_or("").to_string());
            let description = extract_skill_description_from_md(&content).unwrap_or_default();
            (name, description, None, Some(content))
        }
        "mcp" => {
            let cfg_text = fs::read_to_string(&item_id).unwrap_or_default();
            let parsed: Option<crate::types::McpConfigFile> =
                serde_json::from_str(&cfg_text).ok();
            let name = parsed
                .as_ref()
                .map(|c| c.name.clone())
                .unwrap_or_else(|| item_id.clone());
            let description = parsed
                .as_ref()
                .and_then(|c| c.description.clone())
                .unwrap_or_default();
            (name, description, None, None)
        }
        other => return Err(format!("unknown itemType: {}", other)),
    };

    let item = ClassifyItem {
        id: item_id.clone(),
        name,
        description,
        instructions,
        content,
        tools: None,
    };

    // Existing categories + tags + icons.
    let mut existing_categories: Vec<ExistingCategory> = Vec::with_capacity(data.categories.len());
    let mut name_by_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for c in &data.categories {
        name_by_id.insert(c.id.clone(), c.name.clone());
    }
    for c in &data.categories {
        let parent_name = c
            .parent_id
            .as_ref()
            .and_then(|pid| name_by_id.get(pid).cloned());
        existing_categories.push(ExistingCategory {
            name: c.name.clone(),
            parent_name,
        });
    }
    let existing_tags: Vec<String> = data.tags.iter().map(|t| t.name.clone()).collect();

    // Available icons — MUST be kebab-case to match the frontend
    // `ICON_MAP` keys produced by `IconPicker.PRESET_ICONS` (the
    // dictionary is built from `name` strings like `'sparkles'`,
    // `'book-open'`, `'message-square'`, see
    // `src/components/common/IconPicker.tsx:219-433`). The previous
    // PascalCase list (`"Sparkles"`, `"Code"`, ...) caused
    // `ICON_MAP[skill.icon]` lookups to return `undefined` and
    // marketplace-installed items to silently fall back to the
    // category icon — directly defeating the auto-classify icon-recovery
    // contract (B-P0-8 / E4-2).
    //
    // verify-third-party-behavior-firsthand: this list is a curated
    // subset of `IconPicker.PRESET_ICONS`. Each entry is verified to
    // exist as a `name:` field in
    // `src/components/common/IconPicker.tsx:221-360`. `'message-circle'`
    // replaces the older Phase A `'MessageSquare'` because the picker
    // exports `message-circle`, not `message-square`. `'book-open'` and
    // `'file-text'` are present.
    let available_icons: Vec<String> = vec![
        "sparkles".to_string(),
        "code".to_string(),
        "database".to_string(),
        "globe".to_string(),
        "box".to_string(),
        "bot".to_string(),
        "book-open".to_string(),
        "file-text".to_string(),
        "wrench".to_string(),
        "zap".to_string(),
        "plug".to_string(),
        "message-circle".to_string(),
        "settings".to_string(),
        "terminal".to_string(),
        "cpu".to_string(),
    ];

    let mut results: Vec<ClassifyResult> =
        auto_classify(vec![item.clone()], existing_categories, existing_tags, available_icons)
            .await?;
    let result = match results.pop() {
        Some(r) => r,
        None => return Err("auto_classify returned empty result".to_string()),
    };

    // Apply result to metadata: ensure category exists, ensure tags exist,
    // then write metadata.
    let now_ts = chrono::Utc::now().to_rfc3339();
    let _ = now_ts;
    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut data: AppData = read_app_data()?;
        let category_id = ensure_category(&mut data, &result.suggested_category, result.suggested_parent_category.as_deref());
        let tag_ids: Vec<String> = result
            .suggested_tags
            .iter()
            .map(|t| {
                if let Some(existing) = data.tags.iter().find(|x| x.name == *t) {
                    existing.id.clone()
                } else {
                    let id = uuid::Uuid::new_v4().to_string();
                    data.tags.push(crate::types::Tag {
                        id: id.clone(),
                        name: t.clone(),
                        count: 0,
                    });
                    id
                }
            })
            .collect();
        let icon = result.suggested_icon.clone();

        match item_type.as_str() {
            "skill" => {
                let entry = data
                    .skill_metadata
                    .entry(item_id.clone())
                    .or_insert_with(SkillMetadata::default);
                entry.category = result.suggested_category.clone();
                entry.category_id = Some(category_id);
                entry.tags = result.suggested_tags.clone();
                if let Some(i) = icon.clone() {
                    entry.icon = Some(i);
                }
            }
            "mcp" => {
                let entry = data
                    .mcp_metadata
                    .entry(item_id.clone())
                    .or_insert_with(McpMetadata::default);
                entry.category = result.suggested_category.clone();
                entry.category_id = Some(category_id);
                entry.tags = result.suggested_tags.clone();
            }
            _ => {}
        }
        // Tag ids consumed only for the event payload — metadata itself
        // stores tag *names* per existing schema.
        let _ = tag_ids;
        write_app_data(data)?;
    }

    let _ = app.emit(
        "marketplace:classify-result",
        serde_json::json!({
            "id": item_id,
            "itemType": item_type,
            "category": result.suggested_category,
            "parentCategory": result.suggested_parent_category,
            "tags": result.suggested_tags,
            "icon": result.suggested_icon,
        }),
    );
    Ok(())
}

/// Find or create the category for `name` (with optional `parent_name`),
/// returning its id. If a child category with the same name is being
/// created under a non-existent parent, the parent is created first as a
/// root.
fn ensure_category(
    data: &mut AppData,
    name: &str,
    parent_name: Option<&str>,
) -> String {
    // Resolve parent first.
    let parent_id = parent_name.and_then(|pn| {
        let existing = data.categories.iter().find(|c| c.name == pn && c.parent_id.is_none());
        if let Some(p) = existing {
            return Some(p.id.clone());
        }
        let id = uuid::Uuid::new_v4().to_string();
        data.categories.push(crate::types::Category {
            id: id.clone(),
            name: pn.to_string(),
            color: "#71717A".to_string(),
            count: 0,
            parent_id: None,
        });
        Some(id)
    });

    // Find existing category by (name, parent_id) tuple.
    if let Some(existing) = data.categories.iter().find(|c| c.name == name && c.parent_id == parent_id) {
        return existing.id.clone();
    }
    let id = uuid::Uuid::new_v4().to_string();
    data.categories.push(crate::types::Category {
        id: id.clone(),
        name: name.to_string(),
        color: "#71717A".to_string(),
        count: 0,
        parent_id,
    });
    id
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_roundtrip_basic() {
        let bytes = decode_base64("SGVsbG8sIFdvcmxkIQ==").unwrap();
        assert_eq!(String::from_utf8(bytes).unwrap(), "Hello, World!");
    }

    /// Live MCP Registry v0.1 response — fixture captured via curl on
    /// 2026-05-11. V2 paginated shape includes `metadata.nextCursor`; the
    /// nested `{ "server": {...}, "_meta": {...} }` envelope is unchanged.
    #[test]
    fn registry_list_response_parses_paginated_envelope() {
        let body = r#"{
            "servers": [
                {
                    "server": {
                        "name": "ac.inference.sh/mcp",
                        "description": "Run 150+ AI apps",
                        "remotes": [
                            { "type": "streamable-http", "url": "https://api.example.com/mcp" }
                        ]
                    },
                    "_meta": {}
                },
                {
                    "server": {
                        "name": "ac.tandem/docs-mcp",
                        "description": "Tandem docs MCP",
                        "repository": {
                            "url": "https://github.com/frumu-ai/tandem",
                            "source": "github"
                        }
                    },
                    "_meta": {}
                }
            ],
            "metadata": {
                "nextCursor": "ai.llmse%2Fmcp%3A1.3.12",
                "count": 2
            }
        }"#;
        let parsed: RegistryListResponse = serde_json::from_str(body)
            .expect("paginated envelope shape must deserialise");
        assert_eq!(parsed.servers.len(), 2);
        assert_eq!(parsed.servers[0].server.name, "ac.inference.sh/mcp");
        assert_eq!(parsed.servers[1].server.name, "ac.tandem/docs-mcp");
        assert!(parsed.servers[1].server.repository.is_some());
        let meta = parsed.metadata.expect("metadata must be present");
        assert_eq!(
            meta.next_cursor.as_deref(),
            Some("ai.llmse%2Fmcp%3A1.3.12")
        );
    }

    /// Final-page response from the live registry has no `metadata.nextCursor`.
    #[test]
    fn registry_list_response_parses_final_page() {
        let body = r#"{
            "servers": [],
            "metadata": { "count": 0 }
        }"#;
        let parsed: RegistryListResponse = serde_json::from_str(body)
            .expect("final-page shape must deserialise");
        let meta = parsed.metadata.expect("metadata present");
        assert!(meta.next_cursor.is_none());
    }

    #[test]
    fn strip_reverse_dns_prefix_strips_dotted_namespace() {
        assert_eq!(strip_reverse_dns_prefix("ac.tandem/docs-mcp"), "docs-mcp");
        assert_eq!(
            strip_reverse_dns_prefix("io.modelcontextprotocol/everything"),
            "everything"
        );
        assert_eq!(strip_reverse_dns_prefix("ai.aarna/atars-mcp"), "atars-mcp");
    }

    #[test]
    fn strip_reverse_dns_prefix_passes_through_simple_names() {
        // Seed names like `filesystem`, `playwright` have no '/'.
        assert_eq!(strip_reverse_dns_prefix("filesystem"), "filesystem");
        assert_eq!(strip_reverse_dns_prefix("playwright"), "playwright");
        // No dotted prefix → keep full path (e.g. github.com-style names
        // that happen to contain '/' but aren't reverse-DNS).
        assert_eq!(strip_reverse_dns_prefix("owner/repo"), "owner/repo");
    }

    #[test]
    fn build_registry_url_clamps_limit_and_encodes_cursor() {
        // Limit clamped into 1..=100.
        let url = build_registry_url(None, 999, None, None);
        assert!(url.contains("limit=100"));
        let url = build_registry_url(None, 0, None, None);
        assert!(url.contains("limit=1"));
        // Default: version=latest is always set.
        let url = build_registry_url(None, 96, None, None);
        assert!(url.contains("version=latest"));
        assert!(!url.contains("cursor="));
        assert!(!url.contains("search="));
        assert!(!url.contains("updated_since="));
        // Cursor + search urlencoded.
        let url = build_registry_url(Some("ac.foo/bar:1.0"), 96, Some("a b"), None);
        assert!(url.contains("cursor=ac.foo%2Fbar%3A1.0"));
        assert!(url.contains("search=a%20b"));
        // Empty cursor / search ignored.
        let url = build_registry_url(Some(""), 96, Some(""), Some(""));
        assert!(!url.contains("cursor="));
        assert!(!url.contains("search="));
        assert!(!url.contains("updated_since="));
    }

    #[test]
    fn build_mcp_seed_items_includes_well_known_servers() {
        let items = build_mcp_seed_items();
        assert!(items.len() >= 5, "seed should expose ~10 well-known MCPs");
        let names: Vec<&str> = items.iter().map(|i| i.name.as_str()).collect();
        assert!(names.contains(&"filesystem"));
        assert!(names.contains(&"playwright"));
        assert!(names.contains(&"github"));
        // All seed items are stdio (config matrix).
        for item in &items {
            assert_eq!(item.mcp_type, "stdio", "{} should be stdio", item.name);
            assert!(item.stdio_config.is_some());
        }
    }

    #[test]
    fn merge_seed_at_top_dedupes_by_name() {
        let seed = vec![MarketplaceMcpItem {
            id: "npm:@playwright/mcp".into(),
            name: "playwright".into(),
            description: "seed".into(),
            readme_markdown: String::new(),
            author: "microsoft".into(),
            repo: "playwright-mcp".into(),
            repository_url: "https://github.com/microsoft/playwright-mcp".into(),
            last_updated_at: "2026-05-11T00:00:00Z".into(),
            stars: 0,
            categories: vec![],
            tags: vec![],
            license: None,
            mcp_type: "stdio".into(),
            stdio_config: Some(StdioMcpConfig {
                command: "npx".into(),
                args: vec!["-y".into(), "@playwright/mcp".into()],
                required_env_vars: vec![],
            }),
            http_config: None,
        }];
        let registry = vec![
            MarketplaceMcpItem {
                id: "ac.tandem/docs-mcp".into(),
                name: "docs-mcp".into(),
                description: "registry".into(),
                readme_markdown: String::new(),
                author: "ac.tandem".into(),
                repo: String::new(),
                repository_url: String::new(),
                last_updated_at: "2026-05-11T00:00:00Z".into(),
                stars: 0,
                categories: vec![],
                tags: vec![],
                license: None,
                mcp_type: "http".into(),
                stdio_config: None,
                http_config: None,
            },
            // Conflict with seed (same display name) — should be dropped
            // because seed wins on name dedupe.
            MarketplaceMcpItem {
                id: "registry/playwright".into(),
                name: "playwright".into(),
                description: "registry duplicate".into(),
                readme_markdown: String::new(),
                author: "x".into(),
                repo: String::new(),
                repository_url: String::new(),
                last_updated_at: "2026-05-11T00:00:00Z".into(),
                stars: 0,
                categories: vec![],
                tags: vec![],
                license: None,
                mcp_type: "stdio".into(),
                stdio_config: None,
                http_config: None,
            },
        ];
        let merged = merge_seed_at_top(seed, registry);
        assert_eq!(merged.len(), 2);
        // Seed's playwright preserved; registry duplicate dropped.
        assert_eq!(merged[0].name, "playwright");
        assert_eq!(merged[0].description, "seed");
        assert_eq!(merged[1].name, "docs-mcp");
    }

    /// Live network test for the V2 paginated registry IPC. Marked `#[ignore]`
    /// so `cargo test` defaults skip it; run manually:
    ///
    ///   cargo test -- --ignored fetch_registry_page_returns_real_data
    ///
    /// Guards against silent regressions in `fetch_registry_page` when the
    /// upstream schema evolves.
    #[test]
    #[ignore = "requires network access to registry.modelcontextprotocol.io"]
    fn fetch_registry_page_returns_real_data() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");
        let (items, next_cursor) = rt.block_on(async {
            fetch_registry_page(None, 96, None, None)
                .await
                .expect("MCP Registry fetch should succeed against live API")
        });
        assert!(
            !items.is_empty(),
            "Live MCP Registry should return at least one server (got {} items)",
            items.len()
        );
        eprintln!(
            "Fetched {} servers, nextCursor present: {}",
            items.len(),
            next_cursor.is_some()
        );
        let first = &items[0];
        assert!(!first.name.is_empty(), "first item must have a name");
        assert!(
            first.mcp_type == "stdio" || first.mcp_type == "http",
            "first item mcp_type should be stdio or http, got {:?}",
            first.mcp_type
        );
    }

    #[test]
    fn base64_handles_url_safe_and_whitespace() {
        let bytes = decode_base64("SGVsbG8s\nIFdvcmxkIQ==").unwrap();
        assert_eq!(String::from_utf8(bytes).unwrap(), "Hello, World!");
        let bytes2 = decode_base64("SGVsbG8s_w").unwrap();
        // _ is mapped to 63 (same as /); this just verifies the alphabet
        // is accepted without panicking.
        assert!(!bytes2.is_empty());
    }

    #[test]
    fn base64_rejects_invalid() {
        assert!(decode_base64("@@@invalid@@@").is_err());
    }

    #[test]
    fn extract_skill_name_from_frontmatter() {
        let md = "---\nname: my-skill\ndescription: foo\n---\n# Body\n";
        assert_eq!(extract_skill_name_from_md(md), Some("my-skill".to_string()));
    }

    #[test]
    fn extract_skill_description_from_frontmatter() {
        let md = "---\nname: a\ndescription: A test skill\n---\nBody\n";
        assert_eq!(
            extract_skill_description_from_md(md),
            Some("A test skill".to_string())
        );
    }

    #[test]
    fn extract_skill_name_falls_back_to_h1() {
        let md = "# My Awesome Skill\n\nbody";
        assert_eq!(
            extract_skill_name_from_md(md),
            Some("My Awesome Skill".to_string())
        );
    }

    #[test]
    fn truncate_readme_short_string_unchanged() {
        let s = "short";
        assert_eq!(truncate_readme(s), s);
    }

    #[test]
    fn truncate_readme_long_string_truncated() {
        let s = "a".repeat(README_BYTES_CAP + 100);
        let out = truncate_readme(&s);
        assert!(out.contains("[truncated for catalog cache]"));
        assert!(out.len() < s.len());
    }

    #[test]
    fn parse_owner_repo_from_url_works() {
        let (o, r) = parse_owner_repo_from_url("https://github.com/anthropics/skills");
        assert_eq!(o, "anthropics");
        assert_eq!(r, "skills");
    }

    #[test]
    fn parse_owner_repo_returns_empty_on_non_github() {
        let (o, r) = parse_owner_repo_from_url("https://example.com/foo/bar");
        assert!(o.is_empty());
        assert!(r.is_empty());
    }

    #[test]
    fn parse_owner_repo_strips_dot_git_suffix() {
        let (o, r) = parse_owner_repo_from_url("https://github.com/foo/bar.git");
        assert_eq!(o, "foo");
        assert_eq!(r, "bar");
    }

    #[test]
    fn parse_owner_repo_handles_ssh_url() {
        let (o, r) = parse_owner_repo_from_url("git@github.com:foo/bar.git");
        assert_eq!(o, "foo");
        assert_eq!(r, "bar");
    }

    #[test]
    fn parse_owner_repo_handles_ssh_alt_url() {
        let (o, r) = parse_owner_repo_from_url("ssh://git@github.com/foo/bar");
        assert_eq!(o, "foo");
        assert_eq!(r, "bar");
    }

    #[test]
    fn parse_owner_repo_drops_path_after_repo() {
        let (o, r) = parse_owner_repo_from_url("https://github.com/foo/bar/blob/main/x.md");
        assert_eq!(o, "foo");
        assert_eq!(r, "bar");
    }

    #[test]
    fn sanitize_resource_name_accepts_normal() {
        assert!(sanitize_resource_name("my-skill").is_ok());
        assert!(sanitize_resource_name("foo_bar.skill_v2").is_ok());
        assert!(sanitize_resource_name("Skill123").is_ok());
    }

    #[test]
    fn sanitize_resource_name_rejects_path_traversal() {
        assert!(sanitize_resource_name("../etc/passwd").is_err());
        assert!(sanitize_resource_name("foo/bar").is_err());
        assert!(sanitize_resource_name("foo\\bar").is_err());
        assert!(sanitize_resource_name("..").is_err());
    }

    #[test]
    fn sanitize_resource_name_rejects_dotfile_and_empty() {
        assert!(sanitize_resource_name(".hidden").is_err());
        assert!(sanitize_resource_name("").is_err());
    }

    #[test]
    fn sanitize_resource_name_rejects_overlong() {
        let long = "a".repeat(65);
        assert!(sanitize_resource_name(&long).is_err());
    }

    #[test]
    fn sanitize_resource_name_rejects_special_chars() {
        assert!(sanitize_resource_name("foo bar").is_err()); // space
        assert!(sanitize_resource_name("foo\0bar").is_err()); // NUL
        assert!(sanitize_resource_name("foo:bar").is_err()); // colon
    }

    // ========================================================================
    // V2 Phase I tests — skills.sh internal API
    // ========================================================================

    /// Skills.sh internal API list-page envelope. Fixture matches the live
    /// response shape captured 2026-05-10 via curl + chrome-devtools.
    /// Field names are camelCase: `skills, total, hasMore, page`.
    #[test]
    fn parse_skills_internal_response() {
        let body = r#"{
            "skills": [
                {
                    "source": "anthropics/skills",
                    "skillId": "skill-creator",
                    "name": "skill-creator",
                    "installs": 12345,
                    "isOfficial": true
                },
                {
                    "source": "obra/superpowers",
                    "skillId": "skills/test-driven-development",
                    "name": "test-driven-development",
                    "installs": 678
                }
            ],
            "total": 91029,
            "hasMore": true,
            "page": 0
        }"#;
        let parsed: SkillsPageResponse =
            serde_json::from_str(body).expect("internal API list shape must parse");
        assert_eq!(parsed.total, 91029);
        assert!(parsed.has_more);
        assert_eq!(parsed.page, 0);
        assert_eq!(parsed.skills.len(), 2);
        assert_eq!(parsed.skills[0].source, "anthropics/skills");
        assert_eq!(parsed.skills[0].skill_id, "skill-creator");
        assert_eq!(parsed.skills[0].installs, 12345);
        assert_eq!(parsed.skills[0].is_official, Some(true));
        // GitHub-derived fields default to empty.
        assert!(parsed.skills[0].owner.is_empty());
        assert!(parsed.skills[0].repo.is_empty());
        assert!(parsed.skills[0].readme_markdown.is_empty());
    }

    /// Hot-view enrichment: `installsYesterday` + `change`.
    #[test]
    fn parse_skills_internal_response_hot_view() {
        let body = r#"{
            "skills": [
                {
                    "source": "anthropics/skills",
                    "skillId": "pdf",
                    "name": "pdf",
                    "installs": 9999,
                    "installsYesterday": 100,
                    "change": -25
                }
            ],
            "total": 5318,
            "hasMore": true,
            "page": 0
        }"#;
        let parsed: SkillsPageResponse =
            serde_json::from_str(body).expect("hot view fields must parse");
        assert_eq!(parsed.skills[0].installs_yesterday, Some(100));
        assert_eq!(parsed.skills[0].change, Some(-25));
    }

    #[test]
    fn parse_skills_search_response() {
        let body = r#"{
            "query": "playwright",
            "searchType": "fuzzy",
            "skills": [
                {
                    "id": "abc123",
                    "source": "microsoft/playwright-mcp",
                    "skillId": "playwright",
                    "name": "playwright",
                    "installs": 4242
                }
            ],
            "count": 1,
            "duration_ms": 8
        }"#;
        let parsed: SkillsSearchResponse =
            serde_json::from_str(body).expect("search shape must parse");
        assert_eq!(parsed.query, "playwright");
        assert_eq!(parsed.search_type, "fuzzy");
        assert_eq!(parsed.count, 1);
        assert_eq!(parsed.skills.len(), 1);
        assert_eq!(parsed.skills[0].name, "playwright");
        assert_eq!(parsed.skills[0].installs, 4242);
    }

    /// Backward compatibility: V1 cache JSON had only legacy fields. The
    /// V2 struct must still deserialise it (V2 fields default to empty /
    /// None). Guards against silently dropping V1 cache entries on app
    /// upgrade.
    #[test]
    fn parse_skills_v1_legacy_cache_still_works() {
        // r#"..."# raw-string literal handles the literal `\n` JSON escape
        // sequence inside `readmeMarkdown` without Rust trying to interpret
        // it as a Rust escape (which would error on a raw string anyway —
        // r#""# has a different escape lexicon than "").
        let body = "{
            \"id\": \"anthropics-skills-skill-creator\",
            \"name\": \"skill-creator\",
            \"description\": \"Create new skills\",
            \"readmeMarkdown\": \"# Skill Creator body\",
            \"author\": \"anthropics\",
            \"owner\": \"anthropics\",
            \"repo\": \"skills\",
            \"skillPath\": \"skills/skill-creator\",
            \"homepageUrl\": \"https://github.com/anthropics/skills\",
            \"lastUpdatedAt\": \"2026-05-09T00:00:00Z\",
            \"stars\": 1234,
            \"categories\": [],
            \"tags\": [],
            \"license\": \"MIT\"
        }";
        let parsed: MarketplaceSkillItem =
            serde_json::from_str(body).expect("V1 legacy cache JSON must still parse");
        assert_eq!(parsed.owner, "anthropics");
        assert_eq!(parsed.repo, "skills");
        assert_eq!(parsed.stars, 1234);
        assert!(parsed.source.is_empty()); // V2 field defaults
        assert!(parsed.skill_id.is_empty());
        assert_eq!(parsed.installs, 0);
    }

    #[test]
    fn validate_skills_view_accepts_known_views() {
        assert!(validate_skills_view("all-time").is_ok());
        assert!(validate_skills_view("trending").is_ok());
        assert!(validate_skills_view("hot").is_ok());
        assert!(validate_skills_view("popular").is_err());
        assert!(validate_skills_view("").is_err());
    }

    #[test]
    fn derive_install_triple_v2_internal_api() {
        let item = MarketplaceSkillItem {
            id: "anthropics/skills/skill-creator".into(),
            name: "skill-creator".into(),
            source: "anthropics/skills".into(),
            skill_id: "skill-creator".into(),
            ..Default::default()
        };
        let (owner, repo, path) = derive_install_triple(&item);
        assert_eq!(owner, "anthropics");
        assert_eq!(repo, "skills");
        assert_eq!(path, "skill-creator");
    }

    #[test]
    fn derive_install_triple_v2_with_nested_skill_path() {
        let item = MarketplaceSkillItem {
            id: "obra/superpowers/test-driven-development".into(),
            name: "test-driven-development".into(),
            source: "obra/superpowers".into(),
            skill_id: "skills/test-driven-development".into(),
            ..Default::default()
        };
        let (owner, repo, path) = derive_install_triple(&item);
        assert_eq!(owner, "obra");
        assert_eq!(repo, "superpowers");
        assert_eq!(path, "skills/test-driven-development");
    }

    #[test]
    fn derive_install_triple_v1_legacy_fallback() {
        // V1-shape item with no `source` / `skill_id` populated.
        let item = MarketplaceSkillItem {
            id: "old-cache-id".into(),
            name: "skill-creator".into(),
            source: String::new(),
            skill_id: String::new(),
            owner: "anthropics".into(),
            repo: "skills".into(),
            skill_path: "skills/skill-creator".into(),
            ..Default::default()
        };
        let (owner, repo, path) = derive_install_triple(&item);
        assert_eq!(owner, "anthropics");
        assert_eq!(repo, "skills");
        assert_eq!(path, "skills/skill-creator");
    }

    #[test]
    fn derive_install_triple_returns_empty_when_unparseable() {
        let item = MarketplaceSkillItem {
            id: "bad".into(),
            name: "x".into(),
            // `source` lacks the `/` so we can't split it.
            source: "no-slash-here".into(),
            ..Default::default()
        };
        let (owner, repo, _) = derive_install_triple(&item);
        // Falls through to V1 fallback which is also empty.
        assert!(owner.is_empty());
        assert!(repo.is_empty());
    }

    /// README cache TTL behaviour. We hit `readme_cache_put` directly
    /// (avoids a network call) and verify get/put consistency.
    #[test]
    fn readme_cache_put_then_get() {
        readme_cache_put("test-key-A".to_string(), "body content".to_string());
        let got = readme_cache_get("test-key-A");
        assert_eq!(got.as_deref(), Some("body content"));
    }

    #[test]
    fn readme_cache_get_returns_none_for_missing() {
        let got = readme_cache_get("nonexistent-test-key");
        assert!(got.is_none());
    }

    /// Live skills.sh internal-API integration test. Marked `#[ignore]` so
    /// the default `cargo test` skips it; run manually:
    ///
    ///   cargo test --lib -- --ignored live_internal_api_returns_skills --nocapture
    ///
    /// Guards the same-origin browser headers + gzip decompression
    /// requirements: a regression here is exactly what Phase I shipped
    /// to fix (the V1 GitHub-seed pipeline returned only ~10 items;
    /// the internal API returns ~91k).
    #[test]
    #[ignore = "requires network access to skills.sh"]
    fn live_internal_api_returns_skills() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");
        let resp = rt
            .block_on(fetch_skills_internal("all-time", 0))
            .expect("internal API should succeed against live skills.sh");
        assert!(
            !resp.skills.is_empty(),
            "Live skills.sh internal API should return at least one item (got {} skills)",
            resp.skills.len()
        );
        assert!(
            resp.total > 1000,
            "Live skills.sh all-time total should be > 1000 (got {})",
            resp.total
        );
        eprintln!(
            "Live: {} skills on page 0, total {}, hasMore {}",
            resp.skills.len(),
            resp.total,
            resp.has_more
        );
    }

    #[test]
    #[ignore = "requires network access to skills.sh"]
    fn live_internal_search_returns_results() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");
        let resp = rt
            .block_on(search_skills_internal("playwright"))
            .expect("search API should succeed against live skills.sh");
        assert!(
            !resp.skills.is_empty(),
            "Live search 'playwright' should return at least one match"
        );
        eprintln!(
            "Live search 'playwright': {} results, type={}, took={} ms",
            resp.skills.len(),
            resp.search_type,
            resp.duration_ms
        );
    }
}
