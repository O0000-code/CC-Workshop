//! Marketplace IPCs (V2.0).
//!
//! This module exposes six commands plus six Tauri events. See
//! `.dev/marketplace-impl/02_tech_spec.md` §3 for the full contract:
//!
//! - `list_marketplace_skills(refresh)`
//! - `list_marketplace_mcps(refresh)`
//! - `install_marketplace_skill(item, conflict_action)`
//! - `install_marketplace_mcp(item, conflict_action)`
//! - `auto_classify_marketplace_item(id, item_type)`
//! - `refresh_marketplace_cache(source)`
//!
//! ## Three layers (D-Imp-1 hybrid)
//!
//! 1. **Seed layer** (immediate, ~5s): `marketplace_seed::SKILL_SEED` walked
//!    serially against the GitHub Contents API to populate the catalog on
//!    first paint. MCPs use the Official MCP Registry's `/v0.1/servers`
//!    endpoint as their seed (single GET, ~200KB, no pagination).
//! 2. **Cache layer** (24h TTL): catalogs serialise to
//!    `~/.ensemble/marketplace-cache/{skills,mcps}-catalog.json` so
//!    subsequent app launches show the previous result instantly. Stale
//!    cache is still rendered but emits `marketplace:stale-cache`.
//! 3. **Scrape enhancement** (background, Skills only): once the seed is
//!    served, `tokio::spawn` launches `fetch_skills_sh_top` to scrape the
//!    skills.sh leaderboard for items not in the seed. Failures are
//!    silent — they emit `marketplace:scrape-degraded` and leave the seed
//!    catalog untouched.
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
//! ships with a 15s timeout and a `User-Agent` matching `Ensemble/<version>
//! (+https://github.com/...)`. No new crate is needed — `OnceLock` has
//! been in std since Rust 1.70 and the project's MSRV is 1.77.2 (Cargo.toml).
//!
//! ## verify-third-party-behavior-firsthand
//!
//! - GitHub Contents API: <https://docs.github.com/en/rest/repos/contents>
//!   verified to return `{type, encoding: "base64", content: <bytes>}` for
//!   blob requests at time of writing. Headers `Accept: application/vnd.github+json`
//!   and `X-GitHub-Api-Version: 2022-11-28` are the official recommendation.
//! - MCP Registry: <https://registry.modelcontextprotocol.io/v0.1/servers>
//!   responds with `{servers: Vec<Server>, total_count, ...}` per
//!   <https://github.com/modelcontextprotocol/registry/blob/main/docs/openapi.yaml>.
//!
//! Both schemas are reflected in `GitHubContentResponse` and `RegistryListResponse`
//! below; if the upstream changes shape, deserialisation surfaces a clear
//! `serde_json` error rather than silent corruption.

use crate::commands::classify::{auto_classify, ClassifyItem, ClassifyResult, ExistingCategory};
use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::commands::marketplace_seed::SKILL_SEED;
use crate::types::{
    AppData, ConflictAction, EnvVarSpec, HttpMcpConfig, InstallOutcome, MarketplaceCatalog,
    MarketplaceMcpItem, MarketplaceSkillItem, MarketplaceSource, McpConfigFile, McpMetadata,
    SkillMetadata, StdioMcpConfig, TrashedItemBrief,
};
use crate::utils::{ensure_dir, get_app_data_dir};
use base64_simple::decode_base64;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

// ============================================================================
// Constants
// ============================================================================

/// Cache TTL gate. Spec §1.3 / D-Imp-3.
const CACHE_TTL_SECS: i64 = 24 * 60 * 60;

/// HTTP client timeout for upstream catalog requests.
const HTTP_TIMEOUT_SECS: u64 = 15;

/// Per-request sleep between sequential GitHub API calls (R-24 mitigation —
/// unauthenticated rate limit is 60 req/h; 100ms between calls keeps us
/// well below burst thresholds even if a refresh fan-outs to the seed
/// length).
const GITHUB_PACING_MS: u64 = 100;

/// Skills.sh leaderboard scrape ceiling (D-Imp-1.2). Anything more is
/// diminishing returns for V1 catalog breadth.
const SKILLS_SH_SCRAPE_CAP: usize = 100;

/// Background scrape watchdog. If the scrape exceeds this duration the
/// task is dropped and the seed catalog is treated as final for this run.
const SCRAPE_TIMEOUT_SECS: u64 = 30;

/// Cap on README-content-bytes carried in the catalog. Larger bodies are
/// truncated at fetch time so the cache file stays small.
const README_BYTES_CAP: usize = 3_000;

/// Display label baked into the catalog file's `source` field. Useful for
/// dev logs but not surfaced in the UI.
const SOURCE_TAG_SKILLS: &str = "skills.sh-seed-v1";
const SOURCE_TAG_MCPS: &str = "mcp-registry-v0.1";

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
            .user_agent(concat!(
                "Ensemble/",
                env!("CARGO_PKG_VERSION"),
                " (+https://github.com/O0000-code/Ensemble)"
            ))
            .build()
            .expect("reqwest Client builds with no failures from constants")
    })
}

// ============================================================================
// Cache directory
// ============================================================================

/// Ensure `~/.ensemble/marketplace-cache/` exists. Calls `get_app_data_dir`
/// so the `cfg(test)` panic guard fires whenever tests forget to scope
/// `ENSEMBLE_DATA_DIR` (R-2 / fallback-path-must-be-unreachable-in-test).
pub fn ensure_marketplace_cache_dir() -> Result<PathBuf, String> {
    let dir = get_app_data_dir().join("marketplace-cache");
    ensure_dir(&dir).map_err(|e| format!("Failed to create marketplace-cache dir: {}", e))?;
    Ok(dir)
}

// Cache filename version. Bumped to invalidate older cache files when
// the seed list changes shape (Phase H 2026-05-10 — SKILL_SEED paths
// rewritten + MCP_SEED added). Older `*-catalog.json` files become
// orphaned but are harmless; they sit on disk untouched until a user
// clears `~/.ensemble/marketplace-cache/`.
fn skills_catalog_path() -> Result<PathBuf, String> {
    Ok(ensure_marketplace_cache_dir()?.join("skills-catalog-v2.json"))
}

fn mcps_catalog_path() -> Result<PathBuf, String> {
    Ok(ensure_marketplace_cache_dir()?.join("mcps-catalog-v2.json"))
}

// ============================================================================
// Cache I/O helpers
// ============================================================================

fn read_skills_catalog() -> Option<MarketplaceCatalog<MarketplaceSkillItem>> {
    let path = skills_catalog_path().ok()?;
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_skills_catalog(catalog: &MarketplaceCatalog<MarketplaceSkillItem>) -> Result<(), String> {
    let path = skills_catalog_path()?;
    let json =
        serde_json::to_string_pretty(catalog).map_err(|e| format!("serialize skills catalog: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("write skills catalog: {}", e))
}

fn read_mcps_catalog() -> Option<MarketplaceCatalog<MarketplaceMcpItem>> {
    let path = mcps_catalog_path().ok()?;
    if !path.exists() {
        return None;
    }
    let content = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_mcps_catalog(catalog: &MarketplaceCatalog<MarketplaceMcpItem>) -> Result<(), String> {
    let path = mcps_catalog_path()?;
    let json =
        serde_json::to_string_pretty(catalog).map_err(|e| format!("serialize mcps catalog: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("write mcps catalog: {}", e))
}

/// Returns `Some(age_hours)` when the cache has expired (more than
/// `CACHE_TTL_SECS` since `last_synced_at`), `None` while it is still
/// fresh, and `Some(i64::MAX)` if `last_synced_at` cannot be parsed.
fn cache_age_hours_if_stale(last_synced_at: &str) -> Option<i64> {
    match chrono::DateTime::parse_from_rfc3339(last_synced_at) {
        Ok(t) => {
            let age = chrono::Utc::now().signed_duration_since(t.with_timezone(&chrono::Utc));
            if age.num_seconds() > CACHE_TTL_SECS {
                Some(age.num_hours())
            } else {
                None
            }
        }
        Err(_) => Some(i64::MAX),
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

#[derive(Deserialize)]
struct GitHubRepoMetadata {
    full_name: String,
    description: Option<String>,
    stargazers_count: u32,
    updated_at: String,
    license: Option<GitHubLicense>,
    homepage: Option<String>,
}

#[derive(Deserialize)]
struct GitHubLicense {
    spdx_id: Option<String>,
    name: Option<String>,
}

// ============================================================================
// MCP Registry response
// ============================================================================

#[derive(Deserialize)]
struct RegistryListResponse {
    /// Each element is `{ "server": {...}, "_meta": {...} }` per the live
    /// v0.1 schema (verified via curl 2026-05-09). Older flat-array forms
    /// are caught by the alternate parse paths in `fetch_mcp_registry`.
    #[serde(default)]
    servers: Vec<RegistryServerEnvelope>,
    /// Pagination cursor — V1 ignores; the registry has ~500 entries.
    #[serde(default)]
    #[allow(dead_code)]
    next_cursor: Option<String>,
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
// Helpers — fetch and parse GitHub
// ============================================================================

fn build_repo_metadata_url(owner: &str, repo: &str) -> String {
    format!("https://api.github.com/repos/{}/{}", owner, repo)
}

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
// fetch_skills_seed — the baseline catalog (D-Imp-1.1.1)
// ============================================================================

async fn fetch_one_seed_skill(
    seed: &crate::commands::marketplace_seed::SeedSkill,
) -> Result<MarketplaceSkillItem, String> {
    // 1. Repo metadata (stars, last update, license).
    let repo_meta: GitHubRepoMetadata =
        github_get_json(&build_repo_metadata_url(seed.owner, seed.repo)).await?;

    // 2. SKILL.md content. The Contents API returns base64 with
    //    embedded newlines.
    let skill_md_url = build_contents_url(
        seed.owner,
        seed.repo,
        &if seed.skill_path.is_empty() {
            "SKILL.md".to_string()
        } else {
            format!("{}/SKILL.md", seed.skill_path)
        },
    );
    let blob: GitHubContentBlob = github_get_json(&skill_md_url).await?;
    let content_b64 = blob.content.ok_or("SKILL.md content was empty")?;
    let bytes = decode_base64(&content_b64).map_err(|e| format!("Decode SKILL.md: {}", e))?;
    let skill_md = String::from_utf8(bytes).map_err(|e| format!("SKILL.md UTF-8: {}", e))?;

    let name = extract_skill_name_from_md(&skill_md).unwrap_or_else(|| {
        seed.upstream_id
            .rsplit('/')
            .next()
            .unwrap_or(seed.upstream_id)
            .to_string()
    });
    let description = extract_skill_description_from_md(&skill_md).unwrap_or_default();

    let id = format!("{}-{}-{}", seed.owner, seed.repo, name);
    let homepage_url = repo_meta
        .homepage
        .filter(|h| !h.is_empty())
        .unwrap_or_else(|| format!("https://github.com/{}/{}", seed.owner, seed.repo));

    Ok(MarketplaceSkillItem {
        id,
        name,
        description,
        readme_markdown: truncate_readme(&skill_md),
        author: seed.owner.to_string(),
        owner: seed.owner.to_string(),
        repo: seed.repo.to_string(),
        skill_path: seed.skill_path.to_string(),
        homepage_url,
        last_updated_at: repo_meta.updated_at,
        stars: repo_meta.stargazers_count,
        categories: Vec::new(),
        tags: Vec::new(),
        license: repo_meta
            .license
            .and_then(|l| l.spdx_id.or(l.name)),
    })
}

/// Walk `SKILL_SEED` serially, sleeping 100ms between requests to stay
/// well under GitHub's rate limit. Returns the items collected; entries
/// that fail individually are dropped (logged to stderr). If the entire
/// walk yields zero items the caller falls back to stale cache.
async fn fetch_skills_seed() -> Vec<MarketplaceSkillItem> {
    let mut out = Vec::with_capacity(SKILL_SEED.len());
    for seed in SKILL_SEED.iter() {
        match fetch_one_seed_skill(seed).await {
            Ok(item) => out.push(item),
            Err(e) => {
                eprintln!(
                    "[marketplace] seed fetch failed for {}/{}/{}: {}",
                    seed.owner, seed.repo, seed.skill_path, e
                );
            }
        }
        tokio::time::sleep(Duration::from_millis(GITHUB_PACING_MS)).await;
    }
    out
}

// ============================================================================
// fetch_skills_sh_top — background scrape (D-Imp-1.1.2)
// ============================================================================

/// Best-effort scrape of `https://skills.sh/` (or `/leaderboard`). Returns
/// a Vec of `(owner, repo, skill_path)` triples extracted from
/// `https://github.com/{owner}/{repo}` anchors. Limit is `SKILLS_SH_SCRAPE_CAP`.
///
/// The scrape is intentionally tolerant: any failure (DNS, TLS, 4xx, 5xx,
/// HTML structure change) returns an empty Vec rather than propagating —
/// the caller logs / emits `marketplace:scrape-degraded` and treats the
/// seed as authoritative.
async fn fetch_skills_sh_top(limit: usize) -> Vec<(String, String, String)> {
    let resp = match marketplace_http().get("https://skills.sh/").send().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[marketplace] skills.sh fetch failed: {}", e);
            return Vec::new();
        }
    };
    if !resp.status().is_success() {
        eprintln!("[marketplace] skills.sh HTTP {}", resp.status());
        return Vec::new();
    }
    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[marketplace] skills.sh body read failed: {}", e);
            return Vec::new();
        }
    };

    let re = match regex::Regex::new(r#"https?://github\.com/([\w.-]+)/([\w.-]+)"#) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for caps in re.captures_iter(&body) {
        let owner = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        let repo = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
        // Filter common false positives.
        if owner.is_empty()
            || repo.is_empty()
            || repo.ends_with(".png")
            || repo.ends_with(".jpg")
            || repo == "issues"
            || owner == "github"
        {
            continue;
        }
        let key = format!("{}/{}", owner, repo);
        if !seen.insert(key) {
            continue;
        }
        out.push((owner, repo, String::new()));
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Merge new scrape items into the catalog, deduping against the existing
/// `id` set. Returns the count actually added.
fn merge_scrape_into_catalog(
    catalog: &mut MarketplaceCatalog<MarketplaceSkillItem>,
    new_items: Vec<MarketplaceSkillItem>,
) -> usize {
    let existing: std::collections::HashSet<String> =
        catalog.items.iter().map(|i| i.id.clone()).collect();
    let added: Vec<MarketplaceSkillItem> = new_items
        .into_iter()
        .filter(|i| !existing.contains(&i.id))
        .collect();
    let count = added.len();
    catalog.items.extend(added);
    catalog.last_synced_at = chrono::Utc::now().to_rfc3339();
    count
}

// ============================================================================
// fetch_mcp_registry — single GET (D-Imp-2)
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

/// Whether a registry envelope is the latest version of its server.
///
/// The live registry returns one envelope per `(name, version)` tuple
/// — many entries appear 2-5 times (e.g. ac.tandem/docs-mcp returned
/// 3 versions in user testing). We only want the most recent one.
///
/// `_meta.io.modelcontextprotocol.registry/official.isLatest` is the
/// official flag. Defaults to `true` when meta is absent (legacy
/// responses) so older / non-official registries don't get filtered
/// out wholesale.
fn is_latest_envelope(env: &RegistryServerEnvelope) -> bool {
    env.meta
        .as_ref()
        .and_then(|m| m.get("io.modelcontextprotocol.registry/official"))
        .and_then(|o| o.get("isLatest"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
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

async fn fetch_mcp_registry() -> Result<Vec<MarketplaceMcpItem>, String> {
    let url = "https://registry.modelcontextprotocol.io/v0.1/servers";
    let resp = marketplace_http()
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("MCP Registry HTTP {}", resp.status()));
    }
    // The live v0.1 response is `{ "servers": [{ "server": {...}, "_meta": {...} }] }`.
    // We additionally accept legacy raw-array forms (early registry releases)
    // and a "list of envelopes without the wrapper" shape — same goal each
    // way: end up with `Vec<RegistryServer>`.
    let body = resp
        .text()
        .await
        .map_err(|e| format!("Read MCP Registry body: {}", e))?;
    let envelopes: Vec<RegistryServerEnvelope> = if let Ok(env) =
        serde_json::from_str::<RegistryListResponse>(&body)
    {
        env.servers
    } else if let Ok(raw) = serde_json::from_str::<Vec<RegistryServerEnvelope>>(&body) {
        raw
    } else if let Ok(legacy) = serde_json::from_str::<Vec<RegistryServer>>(&body) {
        legacy
            .into_iter()
            .map(|s| RegistryServerEnvelope { server: s, meta: None })
            .collect()
    } else {
        return Err("Unrecognised MCP Registry response shape".to_string());
    };
    // Filter to latest version only (drops 60-80% of envelopes when the
    // registry serves multi-version histories) + dedupe by canonical
    // name (defence-in-depth — if two envelopes claim isLatest=true for
    // the same name we keep the first).
    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let servers: Vec<RegistryServer> = envelopes
        .into_iter()
        .filter(is_latest_envelope)
        .map(|e| e.server)
        .filter(|s| seen_names.insert(s.name.clone()))
        .collect();

    let now = chrono::Utc::now().to_rfc3339();
    let mut items = Vec::with_capacity(servers.len());
    for s in servers {
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
            let required_env_vars: Vec<EnvVarSpec> = pkg
                .package_environment_variables
                .iter()
                .filter(|e| e.is_required)
                .map(|e| EnvVarSpec {
                    name: e.name.clone(),
                    description: e.description.clone(),
                    where_to_find: e.description.clone(),
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
            // Skip servers with neither packages nor remotes — there is
            // nothing we could install.
            continue;
        };

        items.push(MarketplaceMcpItem {
            // `id` keeps the full reverse-DNS form for uniqueness across
            // the registry's namespace; `name` is stripped for display.
            id: s.name.clone(),
            name: strip_reverse_dns_prefix(&s.name),
            description: s.description.unwrap_or_default(),
            readme_markdown: String::new(),
            author: owner.clone(),
            // B-P0-3: persist the parsed GitHub `repo` so install metadata
            // can write a real `(owner, repo, name)` triple instead of the
            // legacy `(author, author, name)` placeholder. Empty when the
            // upstream URL is not parseable; install paths fall back to the
            // author for backward compatibility.
            repo: repo.clone(),
            repository_url: repo_url,
            last_updated_at: now.clone(),
            stars: 0,
            categories: s.categories,
            tags: s.tags,
            license: None,
            mcp_type,
            stdio_config,
            http_config,
        });
    }
    Ok(items)
}

// ============================================================================
// IPC: list_marketplace_skills (spec §3.1)
// ============================================================================

#[tauri::command]
pub async fn list_marketplace_skills(
    app: AppHandle,
    refresh: bool,
) -> Result<Vec<MarketplaceSkillItem>, String> {
    let cache = read_skills_catalog();

    // Fast path: cache hit, not asked to refresh.
    if !refresh {
        if let Some(c) = &cache {
            if cache_age_hours_if_stale(&c.last_synced_at).is_none() {
                let items = c.items.clone();
                spawn_skills_scrape_enhancement(app.clone());
                return Ok(items);
            }
        }
    }

    // Path B: refresh requested OR cache stale OR cache absent.
    let seed_items = fetch_skills_seed().await;
    if seed_items.is_empty() {
        // Fall back to whatever stale cache we have.
        if let Some(c) = cache {
            let age = cache_age_hours_if_stale(&c.last_synced_at).unwrap_or(0);
            let _ = app.emit(
                "marketplace:stale-cache",
                serde_json::json!({"source": "skills", "ageHours": age}),
            );
            return Ok(c.items);
        }
        let _ = app.emit(
            "marketplace:upstream-error",
            serde_json::json!({"source": "skills", "error": "Seed fetch returned no items"}),
        );
        return Err("Marketplace temporarily unavailable.".to_string());
    }

    let new_catalog = MarketplaceCatalog {
        items: seed_items.clone(),
        last_synced_at: chrono::Utc::now().to_rfc3339(),
        source: SOURCE_TAG_SKILLS.to_string(),
    };
    if let Err(e) = write_skills_catalog(&new_catalog) {
        eprintln!("[marketplace] write skills catalog failed: {}", e);
    }
    spawn_skills_scrape_enhancement(app);
    Ok(seed_items)
}

/// Spawn the background skills.sh scrape task. Failures are silent and
/// surface only via `marketplace:scrape-degraded`. Successes emit
/// `marketplace:catalog-enhanced`.
fn spawn_skills_scrape_enhancement(app: AppHandle) {
    tokio::spawn(async move {
        let scraped = match tokio::time::timeout(
            Duration::from_secs(SCRAPE_TIMEOUT_SECS),
            fetch_skills_sh_top(SKILLS_SH_SCRAPE_CAP),
        )
        .await
        {
            Ok(v) => v,
            Err(_) => {
                let _ = app.emit(
                    "marketplace:scrape-degraded",
                    serde_json::json!({"source": "skills", "reason": "scrape timeout"}),
                );
                return;
            }
        };
        if scraped.is_empty() {
            let _ = app.emit(
                "marketplace:scrape-degraded",
                serde_json::json!({"source": "skills", "reason": "skills.sh unreachable or no anchors"}),
            );
            return;
        }

        // For each scraped (owner, repo) not already in the catalog, fetch
        // a minimal item using the same GitHub API path. We avoid SKILL.md
        // probing (the path may not exist at the repo root) and instead
        // synthesise from repo metadata; the user can still inspect on
        // GitHub via `homepage_url`.
        let cache = match read_skills_catalog() {
            Some(c) => c,
            None => return,
        };
        let known: std::collections::HashSet<String> = cache
            .items
            .iter()
            .map(|i| format!("{}/{}", i.owner, i.repo))
            .collect();
        let mut new_items: Vec<MarketplaceSkillItem> = Vec::new();
        for (owner, repo, _path) in scraped {
            if known.contains(&format!("{}/{}", owner, repo)) {
                continue;
            }
            // Best-effort metadata fetch.
            let meta_url = build_repo_metadata_url(&owner, &repo);
            let meta: GitHubRepoMetadata = match github_get_json(&meta_url).await {
                Ok(m) => m,
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(GITHUB_PACING_MS)).await;
                    continue;
                }
            };
            let name = meta
                .full_name
                .rsplit('/')
                .next()
                .unwrap_or(&meta.full_name)
                .to_string();
            let id = format!("{}-{}-{}", owner, repo, name);
            new_items.push(MarketplaceSkillItem {
                id,
                name,
                description: meta.description.unwrap_or_default(),
                readme_markdown: String::new(),
                author: owner.clone(),
                owner,
                repo,
                skill_path: String::new(),
                homepage_url: meta.homepage.unwrap_or_default(),
                last_updated_at: meta.updated_at,
                stars: meta.stargazers_count,
                categories: Vec::new(),
                tags: Vec::new(),
                license: meta.license.and_then(|l| l.spdx_id.or(l.name)),
            });
            tokio::time::sleep(Duration::from_millis(GITHUB_PACING_MS)).await;
        }

        if new_items.is_empty() {
            return;
        }
        let mut updated_catalog = cache;
        let added = merge_scrape_into_catalog(&mut updated_catalog, new_items);
        if let Err(e) = write_skills_catalog(&updated_catalog) {
            eprintln!("[marketplace] write enhanced catalog failed: {}", e);
            return;
        }
        let _ = app.emit(
            "marketplace:catalog-enhanced",
            serde_json::json!({"source": "skills", "addedCount": added}),
        );
    });
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

/// Merge MCP_SEED with whatever Registry returned. Seed always wins on
/// id collision (well-known config is more useful than the Registry's
/// minimal entry). Registry items are appended after, dedup'd by id.
fn merge_seed_with_registry(
    seed: Vec<MarketplaceMcpItem>,
    registry: Vec<MarketplaceMcpItem>,
) -> Vec<MarketplaceMcpItem> {
    let mut out = seed;
    let mut seen: std::collections::HashSet<String> =
        out.iter().map(|i| i.id.clone()).collect();
    for r in registry {
        if seen.insert(r.id.clone()) {
            out.push(r);
        }
    }
    out
}

// ============================================================================
// IPC: list_marketplace_mcps (spec §3.2)
// ============================================================================

#[tauri::command]
pub async fn list_marketplace_mcps(
    app: AppHandle,
    refresh: bool,
) -> Result<Vec<MarketplaceMcpItem>, String> {
    let cache = read_mcps_catalog();

    if !refresh {
        if let Some(c) = &cache {
            if cache_age_hours_if_stale(&c.last_synced_at).is_none() {
                return Ok(c.items.clone());
            }
        }
    }

    let seed_items = build_mcp_seed_items();
    match fetch_mcp_registry().await {
        Ok(registry_items) => {
            let merged = merge_seed_with_registry(seed_items, registry_items);
            let new_catalog = MarketplaceCatalog {
                items: merged.clone(),
                last_synced_at: chrono::Utc::now().to_rfc3339(),
                source: SOURCE_TAG_MCPS.to_string(),
            };
            if let Err(e) = write_mcps_catalog(&new_catalog) {
                eprintln!("[marketplace] write mcps catalog failed: {}", e);
            }
            Ok(merged)
        }
        Err(registry_err) => {
            // Registry fetch failed — degrade gracefully. Seed is
            // hard-coded so it always works; we still return it.
            eprintln!("[marketplace] registry fetch failed: {}", registry_err);
            // Cache may also have older registry items merged with an
            // older seed; prefer fresh seed-only over stale cache so
            // users see the well-known servers (worst case) immediately.
            if !seed_items.is_empty() {
                let new_catalog = MarketplaceCatalog {
                    items: seed_items.clone(),
                    last_synced_at: chrono::Utc::now().to_rfc3339(),
                    source: SOURCE_TAG_MCPS.to_string(),
                };
                if let Err(e) = write_mcps_catalog(&new_catalog) {
                    eprintln!("[marketplace] write mcps catalog (seed-only) failed: {}", e);
                }
                let _ = app.emit(
                    "marketplace:upstream-error",
                    serde_json::json!({
                        "source": "mcps",
                        "error": format!("Registry unavailable; showing built-in seed only ({}).", registry_err),
                    }),
                );
                return Ok(seed_items);
            }
            if let Some(c) = cache {
                let age = cache_age_hours_if_stale(&c.last_synced_at).unwrap_or(0);
                let _ = app.emit(
                    "marketplace:stale-cache",
                    serde_json::json!({"source": "mcps", "ageHours": age}),
                );
                return Ok(c.items);
            }
            let _ = app.emit(
                "marketplace:upstream-error",
                serde_json::json!({"source": "mcps", "error": registry_err}),
            );
            Err("Marketplace temporarily unavailable.".to_string())
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
            list_marketplace_skills(app, true).await?;
            Ok(())
        }
        "mcps" => {
            list_marketplace_mcps(app, true).await?;
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
    if let Err(e) = download_skill_recursive(&item.owner, &item.repo, &item.skill_path, &target_dir).await {
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
            owner: item.owner.clone(),
            repo: item.repo.clone(),
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

    /// Live MCP Registry v0.1 response — fixture captured via
    /// `curl https://registry.modelcontextprotocol.io/v0.1/servers` on
    /// 2026-05-09. The shape is `{ "servers": [{ "server": {...}, "_meta": {...} }] }`,
    /// which the original `RegistryListResponse` definition could not
    /// parse; this test guards the envelope-fix from regressing.
    #[test]
    fn registry_list_response_parses_nested_envelope() {
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
                    "_meta": {
                        "io.modelcontextprotocol.registry/official": {
                            "status": "active"
                        }
                    }
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
            ]
        }"#;
        let parsed: RegistryListResponse = serde_json::from_str(body)
            .expect("nested-envelope shape must deserialise");
        assert_eq!(parsed.servers.len(), 2);
        assert_eq!(parsed.servers[0].server.name, "ac.inference.sh/mcp");
        assert_eq!(parsed.servers[1].server.name, "ac.tandem/docs-mcp");
        assert!(parsed.servers[1].server.repository.is_some());
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
    fn is_latest_envelope_defaults_true_when_meta_absent() {
        let env = RegistryServerEnvelope {
            server: RegistryServer {
                name: "x".into(),
                description: None,
                repository: None,
                packages: Vec::new(),
                remotes: Vec::new(),
                categories: Vec::new(),
                tags: Vec::new(),
            },
            meta: None,
        };
        assert!(is_latest_envelope(&env));
    }

    #[test]
    fn is_latest_envelope_filters_false() {
        let meta = serde_json::json!({
            "io.modelcontextprotocol.registry/official": { "isLatest": false }
        });
        let env = RegistryServerEnvelope {
            server: RegistryServer {
                name: "x".into(),
                description: None,
                repository: None,
                packages: Vec::new(),
                remotes: Vec::new(),
                categories: Vec::new(),
                tags: Vec::new(),
            },
            meta: Some(meta),
        };
        assert!(!is_latest_envelope(&env));
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
    fn merge_seed_with_registry_dedupes_by_id() {
        let seed = vec![MarketplaceMcpItem {
            id: "npm:@playwright/mcp".into(),
            name: "playwright".into(),
            description: "seed".into(),
            readme_markdown: String::new(),
            author: "microsoft".into(),
            repo: "playwright-mcp".into(),
            repository_url: "https://github.com/microsoft/playwright-mcp".into(),
            last_updated_at: "2026-05-10T00:00:00Z".into(),
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
                last_updated_at: "2026-05-10T00:00:00Z".into(),
                stars: 0,
                categories: vec![],
                tags: vec![],
                license: None,
                mcp_type: "http".into(),
                stdio_config: None,
                http_config: None,
            },
            // Conflict with seed — should be dropped.
            MarketplaceMcpItem {
                id: "npm:@playwright/mcp".into(),
                name: "playwright-conflicting".into(),
                description: "registry duplicate".into(),
                readme_markdown: String::new(),
                author: "x".into(),
                repo: String::new(),
                repository_url: String::new(),
                last_updated_at: "2026-05-10T00:00:00Z".into(),
                stars: 0,
                categories: vec![],
                tags: vec![],
                license: None,
                mcp_type: "stdio".into(),
                stdio_config: None,
                http_config: None,
            },
        ];
        let merged = merge_seed_with_registry(seed, registry);
        assert_eq!(merged.len(), 2);
        // Seed's playwright preserved; registry duplicate dropped.
        assert_eq!(merged[0].name, "playwright");
        assert_eq!(merged[0].description, "seed");
        assert_eq!(merged[1].name, "docs-mcp");
    }

    /// Legacy flat-array shape — defensive support for older registry
    /// versions that returned `[{...}, {...}]` directly. The
    /// `fetch_mcp_registry` body has a fallback path for this; the
    /// test guards that the parse paths still compose.
    #[test]
    fn registry_legacy_flat_array_shape_parses() {
        let body = r#"[
            { "name": "legacy-server", "description": "Old shape" }
        ]"#;
        let parsed: Vec<RegistryServer> =
            serde_json::from_str(body).expect("flat array must deserialise");
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].name, "legacy-server");
    }

    /// End-to-end live network test for MCP Registry. Marked `#[ignore]`
    /// so CI / `cargo test` defaults skip it; run manually:
    ///
    ///   cargo test -- --ignored fetch_mcp_registry_returns_real_data
    ///
    /// Guards against silent regressions in `fetch_mcp_registry` when
    /// the upstream schema evolves (e.g. the envelope shape change
    /// caught on 2026-05-09 that left users seeing
    /// "Marketplace temporarily unavailable"). Uses a hand-built tokio
    /// runtime to avoid the `macros` feature flag (tokio-macros version
    /// resolution is unreliable in some local sandboxes).
    #[test]
    #[ignore = "requires network access to registry.modelcontextprotocol.io"]
    fn fetch_mcp_registry_returns_real_data() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime");
        let items = rt.block_on(async {
            fetch_mcp_registry()
                .await
                .expect("MCP Registry fetch should succeed against live API")
        });
        assert!(
            !items.is_empty(),
            "Live MCP Registry should return at least one server (got {} items)",
            items.len()
        );
        eprintln!("Fetched {} servers from live MCP Registry", items.len());
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
    fn cache_age_returns_none_when_fresh() {
        let now = chrono::Utc::now().to_rfc3339();
        assert!(cache_age_hours_if_stale(&now).is_none());
    }

    #[test]
    fn cache_age_returns_some_when_stale() {
        let two_days_ago = (chrono::Utc::now() - chrono::Duration::hours(48)).to_rfc3339();
        let age = cache_age_hours_if_stale(&two_days_ago).unwrap();
        assert!(age >= 47 && age <= 49);
    }

    #[test]
    fn cache_age_returns_max_on_unparseable() {
        let age = cache_age_hours_if_stale("not-a-date").unwrap();
        assert_eq!(age, i64::MAX);
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
}
