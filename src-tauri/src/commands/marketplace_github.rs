//! GitHub Search + AI-inferred MCP install (Phase A — `07_implementation_plan.md`).
//!
//! Augments the marketplace flow with a second data source — GitHub repository
//! search filtered by MCP-related topics — and an AI-inference install path that
//! spawns `claude -p` to read the upstream README and produce a runnable MCP
//! configuration. The main path (`marketplace::install_marketplace_mcp` against
//! the Anthropic Registry) is unchanged; this module is the fallback.
//!
//! ## Design references
//!
//! - `.dev/marketplace-extension/04_github_search_realtest.md` — fingerprint
//!   signals + `Certain/Uncertain/Reject` heuristic (4 unauth signals,
//!   anonymous `/search/repositories` rate budget).
//! - `.dev/marketplace-extension/07_implementation_plan.md` Phase A — the
//!   plan this module fulfils.
//! - `.dev/marketplace-extension/08_claude_p_capability.md` §C/§I — the five
//!   engineering constraints `claude -p` must obey (neutral cwd, `--tools`
//!   whitelist, `--max-budget-usd`, `structured_output` not `result`,
//!   `--model sonnet/opus/haiku`).
//! - `.dev/marketplace-extension/14_v3_prompt.md` §B — production prompt text
//!   (embedded via `include_str!` from `src-tauri/resources/`).
//! - `.dev/marketplace-extension/12_prompt_synthesis_and_cases.md` §D —
//!   production JSON schema (also embedded).
//! - `.dev/marketplace-extension/15_v3_test_results.md` §E.2 — Case 4 `-y`
//!   normalize patch (applied post-AI in this module).

use crate::commands::marketplace::{
    self, finalize_mcp_install_with_source, finalize_skill_install_with_source,
    find_mcp_trash_brief, find_skill_trash_brief, install_skill_via_codeload, marketplace_http,
};
use crate::types::{
    ConflictAction, EnvVarSpec, HttpMcpConfig, InstallOutcome, MarketplaceMcpItem,
    MarketplaceSkillItem, MarketplaceSource, McpConfigFile, StdioMcpConfig,
};
use crate::utils::get_app_data_dir;
use serde::Deserialize;
use std::fs;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command as TokioCommand;

// ============================================================================
// Constants
// ============================================================================

/// AI install spawn timeout (180s). v3 test cases ranged 30–90s; 180s gives
/// comfortable headroom for slow upstream README fetches. `claude` has no
/// `--max-time` flag (08 §G.4) so the budget must live here.
const AI_INSTALL_TIMEOUT_SECS: u64 = 180;

/// USD cap passed via `--max-budget-usd` to bound runaway cost (08 §I.2 #2).
/// Single-case Opus measured $0.45-$1.4; Sonnet $0.08-$0.50. 2.0 covers
/// the worst case with a comfortable margin.
const AI_INSTALL_BUDGET_USD: &str = "2.0";

/// Models accepted as the AI-install `--model` argument. Mirrors the
/// auto-classify allow-list (`classify.rs:271`) — Settings stores a single
/// `classify_model` string and both paths read it. Out-of-range values
/// (hand-edited settings.json) fall back to "opus".
const ALLOWED_MODELS: &[&str] = &["opus", "sonnet", "haiku"];

/// Stdio runner executables AI install will accept. Mirrors the prompt's
/// Step 3a-i whitelist (14.md §B). Anything else, or a non-absolute path,
/// is rejected after AI output validation. Defence in depth — the prompt
/// already refuses build-from-source, but we re-verify because AI output
/// is untrusted input.
const STDIO_COMMAND_WHITELIST: &[&str] = &[
    "npx", "uvx", "python", "python3", "node", "docker", "bunx", "pnpm", "deno", "uv",
];

/// AI install neutral working directory. Spawning `claude -p` from the
/// CC Workshop project dir would pull in this repo's CLAUDE.md + Rules
/// (~70K tokens of unrelated context), making each call ~2.5× more
/// expensive (08 §G.2 measured). The directory lives under
/// `~/.cc-workshop/` so it is bounded to the app data area.
const AI_INSTALL_WORKDIR_REL: &str = "_ai-install-workdir";

// ============================================================================
// Embedded AI install prompt + schema
// ============================================================================

/// v3 prompt template — see `14_v3_prompt.md` §B. `{REPO_URL}` is the only
/// substitution slot; everything else is verbatim.
const AI_INSTALL_PROMPT_V3: &str = include_str!("../../resources/ai_install_prompt_v3.txt");

/// v3 JSON schema (`12_prompt_synthesis_and_cases.md` §D). Embedded as a
/// string so the binary is self-contained — no run-time file dependency,
/// no version-skew between prompt and schema.
const AI_INSTALL_SCHEMA: &str = include_str!("../../resources/ai_install_schema.json");

/// Skill v0 prompt template — see `.dev/skill-marketplace/03_skill_prompt_draft.md` §B.
/// `{REPO_URL}` is the only substitution slot. The prompt is conceptually
/// simpler than the MCP variant because Skills have a hard signal (SKILL.md
/// file presence) and no runtime config to extract.
const AI_INSTALL_SKILL_PROMPT: &str =
    include_str!("../../resources/ai_install_skill_prompt.txt");

/// Skill v0 JSON schema (`.dev/skill-marketplace/03_skill_prompt_draft.md` §C).
/// Same self-contained-binary discipline as the MCP schema.
const AI_INSTALL_SKILL_SCHEMA: &str =
    include_str!("../../resources/ai_install_skill_schema.json");

// ============================================================================
// GitHub Search response types
// ============================================================================

#[derive(Debug, Deserialize)]
struct GhSearchResponse {
    #[serde(default)]
    items: Vec<GhRepoSearchResult>,
}

/// Single hit from `https://api.github.com/search/repositories`. We only
/// deserialise the fields the fingerprint heuristic + item-construction
/// step actually consume. `serde(default)` everywhere because the GitHub
/// schema is documented but the upstream occasionally omits fields for
/// new / private repos.
#[derive(Debug, Deserialize)]
struct GhRepoSearchResult {
    #[serde(default)]
    name: String,
    #[serde(default)]
    full_name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    stargazers_count: u32,
    #[serde(default)]
    topics: Vec<String>,
    #[serde(default)]
    owner: Option<GhOwner>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    license: Option<GhLicense>,
}

#[derive(Debug, Deserialize)]
struct GhOwner {
    #[serde(default)]
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhLicense {
    #[serde(default)]
    spdx_id: Option<String>,
}

// ============================================================================
// Fingerprint heuristic (04 §C)
// ============================================================================

/// Three-state fingerprint verdict. `Certain` items appear in the result
/// list without a warning hint; `Uncertain` items appear with the warning
/// hint; `Reject` items are dropped from the result list entirely.
///
/// The heuristic operates ONLY on data already present in the GitHub Search
/// response (topics + description + full_name) — no per-hit Contents API
/// follow-up (matches 04 §C "API 调用预算" — anonymous Search 10/min budget
/// is more than enough, but per-hit Contents calls would burn the 60/h
/// budget in a single click).
enum McpLikelihood {
    Certain,
    Uncertain,
    Reject,
}

fn assess_mcp_likelihood(hit: &GhRepoSearchResult) -> McpLikelihood {
    let topics_lower: Vec<String> = hit.topics.iter().map(|t| t.to_lowercase()).collect();
    let topic_strong = topics_lower.iter().any(|t| {
        matches!(
            t.as_str(),
            "mcp" | "mcp-server" | "mcp-servers" | "model-context-protocol"
        )
    });
    let full_name_lower = hit.full_name.to_lowercase();
    let official_owner = full_name_lower.starts_with("modelcontextprotocol/");
    let desc_lower = hit
        .description
        .as_deref()
        .unwrap_or_default()
        .to_lowercase();

    // STRONG NEGATIVE — repo name does NOT contain `mcp` AND description
    // declares "platform / framework / library / workflow / agent platform".
    // Such repos sometimes carry an `mcp` topic because they ship an MCP
    // integration *for* their platform, but the repo itself is the platform
    // (e.g. n8n-io/n8n: README mentions MCP integration node, description
    // is "Fair-code workflow automation platform"). Reject regardless of
    // topic signal — saves the user a ~$0.5 / 30-90s AI inference that
    // would deterministically come back with success=false anyway.
    //
    // Repo-name heuristic: real MCP server repos almost always have `mcp`
    // somewhere in the segment (`firecrawl-mcp-server`, `notebooklm-mcp`,
    // `@scope/mcp-foo`, `mcp-server-X`). A platform repo named `n8n` or
    // `next.js` does not.
    let repo_seg_lower = hit.name.to_lowercase();
    let name_has_mcp = repo_seg_lower.contains("mcp")
        || full_name_lower.starts_with("modelcontextprotocol/");
    let strong_negative_phrases = [
        "workflow automation platform",
        "automation platform",
        "agent platform",
        "framework",
        "open-source platform",
        "low-code", // e.g. dify, langflow
    ];
    if !name_has_mcp
        && strong_negative_phrases
            .iter()
            .any(|p| desc_lower.contains(p))
    {
        return McpLikelihood::Reject;
    }

    // Certain — strong upstream-declared signal:
    //   (1) any "mcp-server-family" topic, OR
    //   (2) the official `modelcontextprotocol/*` owner
    if topic_strong || official_owner {
        return McpLikelihood::Certain;
    }

    // Lighter Reject — negative tokens when no Certain signal. Retained from
    // the original heuristic (04 §B) for repos that didn't trip the strong
    // negative + don't have a topic.
    let light_negative_phrases = ["library", "workflow"];
    if light_negative_phrases
        .iter()
        .any(|p| desc_lower.contains(p))
    {
        return McpLikelihood::Reject;
    }

    McpLikelihood::Uncertain
}

// ============================================================================
// Helpers
// ============================================================================

/// Sanitize `repo` into a valid resource-name. Falls back to `<owner>-<repo>`
/// if the bare repo segment is rejected (e.g. starts with `.`, contains `..`).
/// Mirrors the sanitize attempt order described in
/// `07_implementation_plan.md` Phase A1. Both attempts go through
/// `marketplace::sanitize_resource_name`-equivalent shape; we re-implement
/// the alphabet check inline because the upstream helper is private to
/// `marketplace.rs` and the rules are short.
fn name_from_owner_repo(owner: &str, repo: &str) -> Option<String> {
    if let Some(n) = try_sanitize(repo) {
        return Some(n);
    }
    try_sanitize(&format!("{}-{}", owner, repo))
}

/// Same allowed-character / length / leading-dot rules as
/// `marketplace::sanitize_resource_name`. Returning `Option<String>` so
/// callers can chain fallbacks; the install path re-runs the canonical
/// helper before any FS join so this is a soft pre-check, not the security
/// gate.
fn try_sanitize(name: &str) -> Option<String> {
    if name.is_empty() || name.len() > 64 {
        return None;
    }
    if name.starts_with('.') || name.contains("..") {
        return None;
    }
    for ch in name.chars() {
        let ok = ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' || ch == '.';
        if !ok {
            return None;
        }
    }
    Some(name.to_string())
}

/// Resolve the user's preferred Claude model for AI install. Reads
/// `~/.cc-workshop/settings.json::classify_model` (shared with auto-classify
/// per `09_auto_classify_model_config.md` §E "Option 1 — same field"),
/// allow-lists against `ALLOWED_MODELS`, and falls back to `"opus"` on any
/// failure or out-of-range value. Matches the validation pattern in
/// `classify.rs:268-278`.
fn resolve_classify_model() -> String {
    match crate::commands::data::read_settings() {
        Ok(s) => {
            let m = s.classify_model.trim().to_string();
            if ALLOWED_MODELS.contains(&m.as_str()) {
                m
            } else {
                "opus".to_string()
            }
        }
        Err(_) => "opus".to_string(),
    }
}

/// Construct the neutral working directory the AI install spawn runs in.
/// `mkdir -p` semantics; a stale leftover dir is reused. Living under
/// `~/.cc-workshop/` keeps the app's filesystem footprint contained
/// (and survives a future "where does CC Workshop write things?" audit).
fn ai_install_workdir() -> Result<std::path::PathBuf, String> {
    let workdir = get_app_data_dir().join(AI_INSTALL_WORKDIR_REL);
    fs::create_dir_all(&workdir).map_err(|e| format!("create AI install workdir: {}", e))?;
    Ok(workdir)
}

// ============================================================================
// IPC: search_marketplace_mcps_github
// ============================================================================

/// Run one `topic:<topic>` scoped GitHub Search and return the raw hits.
/// Verbose `eprintln!` at every step so we can diagnose query / network /
/// parse failures from `npm run tauri dev` terminal logs without rebuilding.
async fn fetch_github_search_page(
    keyword: &str,
    topic: &str,
) -> Result<Vec<GhRepoSearchResult>, String> {
    // GitHub Search syntax: terms separated by spaces (URL-encoded as `+`
    // or `%20`). `topic:<x>` qualifier is AND-joined with the free-text
    // keyword. We MUST NOT include literal "OR" in the query — GitHub's
    // search parser treats it as another search term, not a logical
    // operator across `topic:` qualifiers (measured 2026-05-20:
    // `q=firecrawl+topic:a+OR+topic:b+OR+topic:c` returns 0 hits).
    let q = format!("{} topic:{}", keyword, topic);
    let url = format!(
        "https://api.github.com/search/repositories?q={}&per_page=30&sort=stars",
        url_encode(&q)
    );
    eprintln!("[gh_search] GET {}", url);
    let resp = marketplace_http()
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| {
            eprintln!("[gh_search] topic:{} network err: {} ({:?})", topic, e, e);
            format!("GitHub Search request failed: {}", e)
        })?;
    let status = resp.status();
    eprintln!("[gh_search] topic:{} status={}", topic, status);
    if !status.is_success() {
        return Err(if status.as_u16() == 403 {
            "GitHub Search rate limit hit (anonymous 10/min). Try again in a moment.".to_string()
        } else {
            format!("GitHub Search returned HTTP {}", status)
        });
    }
    let body: GhSearchResponse = resp
        .json()
        .await
        .map_err(|e| {
            eprintln!("[gh_search] topic:{} parse err: {}", topic, e);
            format!("Parse GitHub Search response: {}", e)
        })?;
    eprintln!(
        "[gh_search] topic:{} returned {} hits (top: {})",
        topic,
        body.items.len(),
        body.items
            .iter()
            .take(3)
            .map(|h| h.full_name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );
    Ok(body.items)
}

/// Query GitHub's repository search for likely-MCP repos and return them as
/// `MarketplaceMcpItem`s with `mcp_type="unknown"` (the AI install path fills
/// in the real config later). Runs two queries (`topic:mcp-server` and
/// `topic:mcp`) and merges results — GitHub's parser does not support `OR`
/// across `topic:` qualifiers (measured 2026-05-20: a single OR-joined
/// query returns 0 hits).
#[tauri::command]
pub async fn search_marketplace_mcps_github(
    query: String,
) -> Result<Vec<MarketplaceMcpItem>, String> {
    let trimmed = query.trim();
    eprintln!("[search_marketplace_mcps_github] query={:?}", trimmed);
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // GitHub Search does not support `OR` across `topic:` qualifiers
    // (see `fetch_github_search_page` doc). To union the two most common
    // MCP topics we run two sequential queries and merge by full_name.
    // Both queries together stay well under the anonymous 10/min budget.
    // `model-context-protocol` topic alone is rare enough that the
    // mcp-server / mcp pair covers > 99% of real MCP repos.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut all_hits: Vec<GhRepoSearchResult> = Vec::new();
    for topic in &["mcp-server", "mcp"] {
        match fetch_github_search_page(trimmed, topic).await {
            Ok(hits) => {
                for hit in hits {
                    let owner = hit
                        .owner
                        .as_ref()
                        .map(|o| o.login.as_str())
                        .unwrap_or("");
                    let full = format!("{}/{}", owner, hit.name);
                    if seen.insert(full) {
                        all_hits.push(hit);
                    }
                }
            }
            Err(e) => {
                // One topic failing (e.g. rate-limit on second call) is
                // non-fatal — return whatever the first call produced.
                eprintln!(
                    "[search_marketplace_mcps_github] topic:{} failed: {} (continuing)",
                    topic, e
                );
            }
        }
    }
    eprintln!(
        "[search_marketplace_mcps_github] merged {} unique hits across topics",
        all_hits.len()
    );

    let now = chrono::Utc::now().to_rfc3339();
    let mut out: Vec<MarketplaceMcpItem> = Vec::with_capacity(all_hits.len());
    let (mut n_certain, mut n_uncertain, mut n_reject, mut n_drop_name) = (0usize, 0usize, 0usize, 0usize);
    for hit in all_hits {
        let likelihood = assess_mcp_likelihood(&hit);
        match likelihood {
            McpLikelihood::Certain => n_certain += 1,
            McpLikelihood::Uncertain => n_uncertain += 1,
            McpLikelihood::Reject => {
                eprintln!(
                    "[search_marketplace_mcps_github]   REJECT {} (topics={:?}, desc={:?})",
                    hit.full_name,
                    hit.topics,
                    hit.description.as_deref().unwrap_or("").chars().take(80).collect::<String>()
                );
                n_reject += 1;
                continue;
            }
        }

        let owner_login = hit.owner.as_ref().map(|o| o.login.clone()).unwrap_or_default();
        let repo_seg = hit.name.clone();
        let name = match name_from_owner_repo(&owner_login, &repo_seg) {
            Some(n) => n,
            None => {
                eprintln!("[search_marketplace_mcps_github]   DROP {}/{}: unsanitisable name", owner_login, repo_seg);
                n_drop_name += 1;
                continue;
            }
        };

        let id = if owner_login.is_empty() {
            format!("git:{}", repo_seg)
        } else {
            format!("git:{}/{}", owner_login, repo_seg)
        };

        let uncertainty_hint = match likelihood {
            McpLikelihood::Uncertain => Some(
                "Auto-detected from GitHub Search — verify before install".to_string(),
            ),
            // Certain / Reject already filtered or unmarked.
            _ => None,
        };

        let item = MarketplaceMcpItem {
            id,
            name,
            title: None,
            description: hit.description.unwrap_or_default(),
            readme_markdown: String::new(),
            author: owner_login.clone(),
            website_url: None,
            repo: repo_seg.clone(),
            repository_url: hit.html_url,
            // GitHub's `updated_at` is closer to "last push" than the
            // upstream registry's last-publish, but it's still the most
            // accurate timestamp we have without a follow-up API call.
            last_updated_at: hit.updated_at.unwrap_or_else(|| now.clone()),
            stars: hit.stargazers_count,
            categories: Vec::new(),
            tags: Vec::new(),
            license: hit.license.and_then(|l| l.spdx_id),
            publisher: None,
            keywords: Vec::new(),
            examples: Vec::new(),
            // mcp_type intentionally "unknown" — the AI install path is the
            // only one that knows whether this repo is stdio or http; the
            // standard `install_marketplace_mcp` path is bypassed for
            // github_search items.
            mcp_type: "unknown".to_string(),
            stdio_config: None,
            http_config: None,
            uncertainty_hint,
        };
        out.push(item);
    }
    eprintln!(
        "[search_marketplace_mcps_github] FINAL: certain={} uncertain={} reject={} drop_name={} → returning {} items",
        n_certain, n_uncertain, n_reject, n_drop_name, out.len()
    );
    Ok(out)
}

/// Minimal URL-encoder for the GitHub search query string. We treat `+`,
/// `:` (in `topic:foo`), and ASCII letters / digits / a small punctuation
/// set as already-safe so the GitHub query language is preserved verbatim.
/// Everything else gets `%XX` percent-escaped. Importing the `urlencoding`
/// crate just for this would be heavy; the query alphabet here is
/// constrained enough that an inline helper is clearer.
fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        let safe = b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'-' | b'.' | b'_' | b'~' | b'+' | b':' | b'/' | b','
            );
        if safe {
            out.push(b as char);
        } else if b == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

// ============================================================================
// AI install — output schema (only the fields we consume)
// ============================================================================

#[derive(Debug, Deserialize)]
struct ClaudeCliResult {
    #[serde(default)]
    is_error: bool,
    #[serde(default)]
    structured_output: Option<serde_json::Value>,
    #[serde(default)]
    result: Option<String>,
    #[serde(default)]
    api_error_status: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct AiOutput {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    mcp_type: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    command: Option<String>,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    headers: Vec<AiHeader>,
    #[serde(default)]
    required_env_vars: Vec<AiEnvVar>,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    confidence: String,
}

/// Header entry as returned by the AI prompt. We persist `name` →
/// `default` directly into the `McpConfigFile::headers` HashMap pre-seed
/// (the user fills the real value via the post-install header panel —
/// same UX as standard install). `description` / `is_secret` are present
/// in the schema for consistency with the EnvVar shape but not consumed
/// by the install path; the post-install UI re-reads them from a future
/// catalog refresh if needed.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct AiHeader {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    is_secret: bool,
    #[serde(default)]
    default: String,
}

#[derive(Debug, Deserialize)]
struct AiEnvVar {
    #[serde(default)]
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    is_secret: bool,
    #[serde(default)]
    format: String,
    #[serde(default)]
    default: String,
}

/// Convert an [`AiEnvVar`] to the persisted [`EnvVarSpec`] shape. Empty
/// descriptions / formats / defaults become `None` so the JSON file stays
/// clean (matches the existing Marketplace install output shape — see
/// `marketplace.rs:1395+ envelope_to_item`).
fn ai_env_to_spec(env: AiEnvVar) -> EnvVarSpec {
    EnvVarSpec {
        name: env.name,
        description: if env.description.is_empty() {
            None
        } else {
            Some(env.description)
        },
        where_to_find: None,
        is_secret: env.is_secret,
        default_value: if env.default.is_empty() {
            None
        } else {
            Some(env.default)
        },
        format: if env.format.is_empty() {
            None
        } else {
            Some(env.format)
        },
    }
}

// ============================================================================
// IPC: ai_install_from_github
// ============================================================================

/// Install an MCP whose configuration must be inferred from its README
/// (i.e. items returned by `search_marketplace_mcps_github`). Spawns
/// `claude -p` with the v3 prompt, validates the structured output, builds
/// an `McpConfigFile`, and runs the same finalize step the standard
/// install path uses. Returns `InstallOutcome::NameCollision` for live /
/// trash conflicts before any AI cost is paid, so the user can run the
/// existing Replace / RestoreFromTrash flow.
#[tauri::command]
pub async fn ai_install_from_github(
    app: AppHandle,
    item: MarketplaceMcpItem,
    conflict_action: Option<ConflictAction>,
) -> Result<InstallOutcome, String> {
    // 1. sanitize_resource_name + target path. Mirrors install_marketplace_mcp.
    let safe_name = match marketplace_sanitize(&item.name) {
        Ok(n) => n,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("Invalid resource name: {}", e),
                ai_failure_context: None,
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
                ai_failure_context: None,
            });
        }
    }

    // 2. Conflict detection — same shape as install_marketplace_mcp:3155-3162.
    //    Caller resolves NameCollision via the existing modal (Replace /
    //    RestoreFromTrash), then retries with `conflict_action` set.
    let has_local = target_path.exists();
    let trash_brief = find_mcp_trash_brief(&safe_name);
    let has_trashed = trash_brief.is_some();
    if conflict_action.is_none() && (has_local || has_trashed) {
        return Ok(InstallOutcome::NameCollision {
            has_local,
            has_trashed: trash_brief,
        });
    }
    // NOTE: full Replace / RestoreFromTrash handling (file rename, snapshot,
    // metadata remove) is owned by `install_marketplace_mcp`. AI install
    // delegates to that flow only if the caller passes through (and the v3
    // plan permits not handling the post-collision branches here — Phase A
    // ends at "return NameCollision", subsequent rounds reuse the modal).
    // We refuse `conflict_action` for now to keep the surface honest; the
    // user must trash / restore by hand to repeat with the same name.
    if conflict_action.is_some() {
        return Ok(InstallOutcome::Failed {
            reason: "AI install does not currently support Replace / RestoreFromTrash. \
                     Resolve the name collision first, then retry."
                .to_string(),
            ai_failure_context: None,
        });
    }

    // 3. Spawn claude -p with the v3 prompt.
    let workdir = ai_install_workdir()?;
    let model = resolve_classify_model();
    let final_prompt = AI_INSTALL_PROMPT_V3.replace("{REPO_URL}", &item.repository_url);

    let spawn_result = tokio::time::timeout(
        Duration::from_secs(AI_INSTALL_TIMEOUT_SECS),
        TokioCommand::new("claude")
            .current_dir(&workdir)
            .arg("-p")
            .arg(&final_prompt)
            .arg("--output-format")
            .arg("json")
            .arg("--json-schema")
            .arg(AI_INSTALL_SCHEMA)
            .arg("--tools")
            .arg("WebFetch,Read,Write")
            .arg("--dangerously-skip-permissions")
            .arg("--max-budget-usd")
            .arg(AI_INSTALL_BUDGET_USD)
            .arg("--model")
            .arg(&model)
            .output(),
    )
    .await;

    let output = match spawn_result {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "Failed to execute Claude CLI: {}. Make sure `claude` is installed and in PATH.",
                    e
                ),
                ai_failure_context: None,
            });
        }
        Err(_) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "AI install timed out after {}s. The Claude CLI did not return a result.",
                    AI_INSTALL_TIMEOUT_SECS
                ),
                ai_failure_context: None,
            });
        }
    };

    // 4. Parse top-level CLI envelope. NB: exit code 0 does NOT imply success
    //    (08 §F.1); we must inspect `is_error` + `structured_output` ourselves.
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let cli_result: ClaudeCliResult = match serde_json::from_str(&stdout) {
        Ok(r) => r,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "Could not parse Claude CLI output as JSON: {}. \
                     Check that the `claude` CLI is up to date.",
                    e
                ),
                ai_failure_context: Some(stdout),
            });
        }
    };

    if cli_result.is_error {
        let api_status = cli_result
            .api_error_status
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default();
        let result_text = cli_result.result.clone().unwrap_or_default();
        return Ok(InstallOutcome::Failed {
            reason: if !api_status.is_empty() {
                format!(
                    "Claude CLI reported an API error (status {}). {}",
                    api_status, result_text
                )
            } else if !result_text.is_empty() {
                format!("Claude CLI reported an error: {}", result_text)
            } else {
                "Claude CLI reported an error with no detail.".to_string()
            },
            ai_failure_context: Some(stdout),
        });
    }

    let structured = match cli_result.structured_output {
        Some(v) => v,
        None => {
            return Ok(InstallOutcome::Failed {
                reason: "Claude CLI returned no structured_output. The model may have refused \
                         or returned only a free-form `result` string."
                    .to_string(),
                ai_failure_context: Some(stdout),
            });
        }
    };

    let raw_structured_pretty = serde_json::to_string_pretty(&structured)
        .unwrap_or_else(|_| structured.to_string());

    let ai_output: AiOutput = match serde_json::from_value(structured) {
        Ok(o) => o,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("AI structured_output did not match schema: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };

    // 5. Validate AI output before we trust any of it.
    if !ai_output.success {
        return Ok(InstallOutcome::Failed {
            reason: if ai_output.notes.is_empty() {
                format!(
                    "AI install declined this repo (success=false, confidence={}).",
                    ai_output.confidence
                )
            } else {
                ai_output.notes.clone()
            },
            ai_failure_context: Some(raw_structured_pretty),
        });
    }

    // The AI returns its own derived `name` (Step 4a). We treat that as a
    // sanity check only — the canonical filename + config.name must match
    // `item.name` so the existing `id == sourcePath` invariant holds and
    // the marketplace SSoT join (`marketplaceSource.owner+name`) keeps
    // working when the user re-searches the same repo. If the AI returns
    // an unsanitisable name, we still install (the user's expectation is
    // already pinned to the GitHub-derived `item.name`) but log the
    // mismatch in notes via the structured_output snapshot.
    if try_sanitize(&ai_output.name).is_none() && !ai_output.name.is_empty() {
        return Ok(InstallOutcome::Failed {
            reason: format!(
                "AI returned an invalid `name`: {:?}. Must match [A-Za-z0-9_.-]+, ≤ 64 chars, \
                 not start with '.' / '-', not contain '..'.",
                ai_output.name
            ),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }
    let canonical_name = item.name.clone();

    // 6. Build McpConfigFile per AI output.
    let now = chrono::Utc::now().to_rfc3339();
    let mcp_repo = if !item.repo.is_empty() {
        item.repo.clone()
    } else {
        item.author.clone()
    };
    let marketplace_source = MarketplaceSource {
        source: "github_search".to_string(),
        owner: item.author.clone(),
        repo: mcp_repo,
        name: canonical_name.clone(),
        repo_subpath: None,
        last_synced_at: now,
    };

    let (cfg, required_env_vars_for_finalize): (McpConfigFile, Vec<EnvVarSpec>) = match ai_output
        .mcp_type
        .as_str()
    {
        "stdio" => {
            let mut command = match ai_output.command.clone() {
                Some(c) if !c.trim().is_empty() => c,
                _ => {
                    return Ok(InstallOutcome::Failed {
                        reason: "AI output has mcp_type=stdio but `command` is empty.".to_string(),
                        ai_failure_context: Some(raw_structured_pretty),
                    });
                }
            };
            // Enforce the same hard whitelist the prompt declares (defence
            // in depth — the AI is trusted to follow Step 3a-i, but we
            // double-check before exec'ing whatever it returns).
            let cmd_allowed = STDIO_COMMAND_WHITELIST.contains(&command.as_str())
                || command.starts_with('/');
            if !cmd_allowed {
                return Ok(InstallOutcome::Failed {
                    reason: format!(
                        "AI returned a non-whitelisted command `{}`. Only npx/uvx/python/node/docker/bunx/pnpm/deno/uv or absolute paths are allowed.",
                        command
                    ),
                    ai_failure_context: Some(raw_structured_pretty),
                });
            }
            let mut args = ai_output.args.clone();
            if args.is_empty() {
                return Ok(InstallOutcome::Failed {
                    reason: "AI output has mcp_type=stdio but `args` is empty.".to_string(),
                    ai_failure_context: Some(raw_structured_pretty),
                });
            }
            // 15.md §E.2 — Case 4 `-y` normalize. If the runner is npx and
            // args[0] is not `-y`, prepend it. This is the engineering
            // patch that covered the Case 4 sentry-mcp partial in v3.
            if command == "npx" && args.first().map(|s| s.as_str()) != Some("-y") {
                args.insert(0, "-y".to_string());
            }
            // Defence: if the AI somehow returned a value we don't want,
            // canonicalize trailing whitespace etc.
            command = command.trim().to_string();

            let env_specs: Vec<EnvVarSpec> = ai_output
                .required_env_vars
                .into_iter()
                .map(ai_env_to_spec)
                .collect();

            // Pre-seed env map with empty strings so the post-install detail
            // panel can show the inputs (matches install_marketplace_mcp:3289-3293).
            let env_map: std::collections::HashMap<String, String> = env_specs
                .iter()
                .map(|e| (e.name.clone(), String::new()))
                .collect();
            let env_opt = if env_map.is_empty() { None } else { Some(env_map) };

            let cfg = McpConfigFile {
                name: canonical_name.clone(),
                description: Some(item.description.clone()),
                command,
                args: Some(args),
                env: env_opt,
                provided_tools: None,
                url: None,
                headers: None,
                mcp_type: Some("stdio".to_string()),
                install_source: Some("marketplace".to_string()),
                plugin_id: None,
                plugin_name: None,
                marketplace: None,
                marketplace_source: Some(marketplace_source),
            };
            (cfg, env_specs)
        }
        "http" => {
            let raw_url = ai_output.url.clone().unwrap_or_default();
            if raw_url.trim().is_empty() {
                return Ok(InstallOutcome::Failed {
                    reason: "AI output has mcp_type=http but `url` is empty.".to_string(),
                    ai_failure_context: Some(raw_structured_pretty),
                });
            }
            // The AI can return a URL with `{NAME}` placeholders bound to
            // entries in `required_env_vars`. We do NOT substitute them here —
            // the user fills them in via the existing HTTP-MCP env-var panel
            // after install. But we must ensure each placeholder has a
            // matching env-var entry, otherwise the post-install update path
            // can't progress.
            let env_specs: Vec<EnvVarSpec> = ai_output
                .required_env_vars
                .into_iter()
                .map(ai_env_to_spec)
                .collect();
            let url_var_names: std::collections::HashSet<&str> =
                env_specs.iter().map(|s| s.name.as_str()).collect();
            // Scan for unbound {NAME} placeholders.
            let mut cursor = 0usize;
            while let Some(start) = raw_url[cursor..].find('{') {
                let abs_start = cursor + start;
                if let Some(end) = raw_url[abs_start + 1..].find('}') {
                    let name = &raw_url[abs_start + 1..abs_start + 1 + end];
                    if !name.is_empty() && !url_var_names.contains(name) {
                        return Ok(InstallOutcome::Failed {
                            reason: format!(
                                "AI URL contains the placeholder {{{}}} but no matching `required_env_vars` entry.",
                                name
                            ),
                            ai_failure_context: Some(raw_structured_pretty),
                        });
                    }
                    cursor = abs_start + 1 + end + 1;
                } else {
                    break;
                }
            }

            // Headers: convert the AI list into a HashMap pre-seeded with
            // either the AI-provided default (e.g. `"Bearer "` template) or
            // empty, matching install_marketplace_mcp:3253-3265.
            let mut header_map: std::collections::HashMap<String, String> =
                std::collections::HashMap::new();
            for h in &ai_output.headers {
                header_map.insert(h.name.clone(), h.default.clone());
            }
            let headers_opt = if header_map.is_empty() {
                None
            } else {
                Some(header_map)
            };

            let cfg = McpConfigFile {
                name: canonical_name.clone(),
                description: Some(item.description.clone()),
                command: String::new(),
                args: Some(Vec::new()),
                env: None,
                provided_tools: None,
                url: Some(raw_url),
                headers: headers_opt,
                mcp_type: Some("http".to_string()),
                install_source: Some("marketplace".to_string()),
                plugin_id: None,
                plugin_name: None,
                marketplace: None,
                marketplace_source: Some(marketplace_source),
            };
            (cfg, env_specs)
        }
        other => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "AI returned an unknown mcp_type: {:?}. Expected `stdio` or `http`.",
                    other
                ),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };

    // 7. Build a synthesized MarketplaceMcpItem to hand to finalize. The
    //    finalize step uses the item's stdio_config / http_config to
    //    persist required_env_vars in McpMetadata; we synthesise both
    //    fields so the env-var list survives across scans.
    let finalize_item = MarketplaceMcpItem {
        // Keep id stable for upcoming "Installed?" SSoT join.
        id: item.id.clone(),
        name: canonical_name.clone(),
        title: None,
        description: item.description.clone(),
        readme_markdown: String::new(),
        author: item.author.clone(),
        website_url: item.website_url.clone(),
        repo: item.repo.clone(),
        repository_url: item.repository_url.clone(),
        last_updated_at: item.last_updated_at.clone(),
        stars: item.stars,
        categories: Vec::new(),
        tags: Vec::new(),
        license: item.license.clone(),
        publisher: None,
        keywords: Vec::new(),
        examples: Vec::new(),
        mcp_type: ai_output.mcp_type.clone(),
        // Pack synthesized configs so finalize can derive required_env_vars
        // for stdio MCPs. HTTP MCPs intentionally leave http_config.headers
        // empty here — the JSON file (cfg above) already has the real header
        // pre-seed; finalize only consumes stdio.required_env_vars.
        stdio_config: if ai_output.mcp_type == "stdio" {
            Some(StdioMcpConfig {
                command: cfg.command.clone(),
                args: cfg.args.clone().unwrap_or_default(),
                required_env_vars: required_env_vars_for_finalize.clone(),
            })
        } else {
            None
        },
        http_config: if ai_output.mcp_type == "http" {
            Some(HttpMcpConfig {
                url: cfg.url.clone().unwrap_or_default(),
                transport: "http".to_string(),
                oauth_authorization_url: None,
                url_variables: required_env_vars_for_finalize.clone(),
                headers: Vec::new(),
            })
        } else {
            None
        },
        uncertainty_hint: None,
    };

    // 8. Persist the JSON file before calling finalize. Mirrors
    //    install_marketplace_mcp:3337-3350.
    let json = match serde_json::to_string_pretty(&cfg) {
        Ok(j) => j,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("serialize McpConfigFile: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };
    if let Err(e) = fs::write(&target_path, json) {
        let _ = fs::remove_file(&target_path);
        return Ok(InstallOutcome::Failed {
            reason: format!("write MCP config: {}", e),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }

    // 9. finalize_mcp_install_with_source — writes data.json::mcp_metadata
    //    entry with `source = "github_search"`, runs spawn_auto_classify.
    finalize_mcp_install_with_source(app, &finalize_item, target_path, "github_search").await
}

// ============================================================================
// Internal helpers reused from `marketplace` (small re-exports / wrappers)
// ============================================================================

/// Re-run the marketplace's resource-name sanitization. Calls back into the
/// canonical implementation via a `pub(crate)` wrapper added next to
/// `marketplace::sanitize_resource_name` would be cleaner long-term, but
/// re-implementing the alphabet check inline (`try_sanitize`) is short
/// enough that we keep dependency surface minimal. For the install-side
/// check (security gate before FS join), we still call into the
/// canonical helper via [`marketplace::sanitize_marketplace_name`]
/// — see the wrapper at the bottom of `marketplace.rs`.
fn marketplace_sanitize(name: &str) -> Result<String, String> {
    // Re-use the canonical implementation by going through a `pub(crate)`
    // shim added to `marketplace.rs`.
    marketplace::sanitize_marketplace_name(name)
}

// ============================================================================
// ============================================================================
// SKILL GitHub Search + AI install
//
// Mirrors the MCP path above but adapts to the five Skill-vs-MCP differences
// documented in `.dev/skill-marketplace/01_skill_current_state.md` §G:
//   - Three topics (`claude-skill`, `claude-skills`, `claude-code-skill`)
//     instead of two (`mcp-server`, `mcp`) — see `02_github_skill_realtest.md`
//     §A for the empirical justification.
//   - Three fingerprint signals — `SKILL.md` at repo root, `agentic-skill`
//     topic, `anthropics` ownership — instead of MCP's four-signal mix.
//   - HEAD probe to detect `.claude-plugin/marketplace.json` (Skill marker
//     for "this is actually a Plugin, route elsewhere"). Plugin Reject is
//     a Skill-only concern; MCP doesn't have an equivalent overlap.
//   - AI install outputs `(owner, repo, skill_path)` instead of a runtime
//     config; the existing `install_skill_via_codeload` does the rest.
//   - No `needsConfig` / no env vars / no URL / no stdio-http branch.
// ============================================================================
// ============================================================================

/// Three-state fingerprint verdict for Skill candidates. Same shape as
/// [`McpLikelihood`] but different rules. The heuristic combines GitHub
/// Search response data (topics, owner, name, description) with two
/// `raw.githubusercontent.com` HEAD probes — those don't consume any
/// `api.github.com` quota and surface the two strongest Skill signals
/// (root `SKILL.md` exists → Certain; `.claude-plugin/marketplace.json`
/// exists → Reject Plugin).
enum SkillLikelihood {
    Certain,
    Uncertain,
    Reject,
}

/// Probe a URL via GET and consider it present iff the response is HTTP 200.
/// Used exclusively against `raw.githubusercontent.com` paths, which are
/// rate-limited separately from `api.github.com` and respond very quickly
/// to absent files with a 404. Errors are coerced to "absent" — we never
/// want a transient network blip to flip a Skill from Uncertain to Reject.
async fn head_probe(url: &str) -> bool {
    match marketplace_http().get(url).send().await {
        Ok(resp) => resp.status().as_u16() == 200,
        Err(e) => {
            eprintln!("[skill_search] head_probe({}) network err: {}", url, e);
            false
        }
    }
}

/// Decide Certain / Uncertain / Reject for a Skill candidate. The order
/// matters — Reject takes priority so a `.claude-plugin/marketplace.json`
/// plugin can never be promoted to Certain even if it also has
/// `topic:agentic-skill` or owner `anthropics`. See
/// `02_github_skill_realtest.md` §D for the empirical rationale.
fn assess_skill_likelihood(
    hit: &GhRepoSearchResult,
    has_skill_md_root: bool,
    has_plugin_marker: bool,
) -> SkillLikelihood {
    let topics_lower: Vec<String> = hit.topics.iter().map(|t| t.to_lowercase()).collect();
    let owner_lower = hit
        .owner
        .as_ref()
        .map(|o| o.login.to_lowercase())
        .unwrap_or_default();
    let name_lower = hit.name.to_lowercase();
    let desc_lower = hit
        .description
        .as_deref()
        .unwrap_or_default()
        .to_lowercase();

    // -- Reject (evaluated first; takes priority) --

    // 1. Plugin marker — `.claude-plugin/marketplace.json` exists. This is
    //    a CC Workshop plugin marketplace concern, not a Skill marketplace
    //    concern; users install plugins via `/plugin marketplace add`,
    //    not via CC Workshop Skills. Hard-Reject regardless of any
    //    positive signal.
    if has_plugin_marker {
        return SkillLikelihood::Reject;
    }

    // 2. Awesome-list / meta-list trap — `awesome` in name AND
    //    `awesome-list` topic. Same anti-pattern as the MCP fingerprint
    //    (`marketplace_seed.rs` legacy validation rule).
    let name_has_awesome = name_lower.contains("awesome");
    let topic_has_awesome_list = topics_lower.iter().any(|t| t == "awesome-list");
    if name_has_awesome && topic_has_awesome_list {
        return SkillLikelihood::Reject;
    }

    // 3. Strong negative description without `skill` token in name —
    //    e.g. browser library, workflow platform, framework. These trip
    //    `claude-skill(s)` topic in their READMEs (because they mention
    //    skill integrations) but are not themselves Skills.
    let strong_negative_phrases = ["framework", "library", "platform"];
    let name_has_skill = name_lower.contains("skill");
    if !name_has_skill
        && strong_negative_phrases
            .iter()
            .any(|p| desc_lower.contains(p))
    {
        return SkillLikelihood::Reject;
    }

    // -- Certain (strong positive signals) --

    let topic_agentic = topics_lower.iter().any(|t| t == "agentic-skill");
    let official_owner = matches!(owner_lower.as_str(), "anthropics" | "anthropic-experimental");

    if has_skill_md_root || topic_agentic || official_owner {
        return SkillLikelihood::Certain;
    }

    // -- Uncertain (default for everything else that survived Reject) --
    // The 3-topic search already restricts candidates to repos that
    // self-declare as Claude Skills, so an Uncertain bucket here means
    // "real-looking Skill, but no Certain-tier confirmation signal".
    SkillLikelihood::Uncertain
}

// ============================================================================
// IPC: search_marketplace_skills_github
// ============================================================================

/// Query GitHub's repository search for likely-Skill repos and return them as
/// `MarketplaceSkillItem`s with `skill_id=""` (the AI install path fills the
/// in-repo subpath later). Runs three queries (`topic:claude-skill`,
/// `topic:claude-skills`, `topic:claude-code-skill`) and merges by
/// full_name. Each surviving candidate is then probed twice via
/// `raw.githubusercontent.com` (root `SKILL.md` + `.claude-plugin/marketplace.json`)
/// to refine the fingerprint — those probes don't consume `api.github.com`
/// quota. See `02_github_skill_realtest.md` §D for the budget rationale.
#[tauri::command]
pub async fn search_marketplace_skills_github(
    query: String,
) -> Result<Vec<MarketplaceSkillItem>, String> {
    let trimmed = query.trim();
    eprintln!("[search_marketplace_skills_github] query={:?}", trimmed);
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    // 3-topic merge — GitHub's parser still doesn't support `OR` across
    // `topic:` qualifiers (see `fetch_github_search_page` doc). We pay
    // 3 calls / search; well under the 30/min anonymous Search budget.
    // The set is empirically justified in `02_github_skill_realtest.md` §A:
    // `claude-skill` (1723 hits) + `claude-skills` (3307) +
    // `claude-code-skill` (1256). `claude-code-skills` overlaps `claude-skills`
    // ~90% and is omitted to keep the budget at 3 calls.
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut all_hits: Vec<GhRepoSearchResult> = Vec::new();
    for topic in &["claude-skill", "claude-skills", "claude-code-skill"] {
        match fetch_github_search_page(trimmed, topic).await {
            Ok(hits) => {
                for hit in hits {
                    let owner = hit
                        .owner
                        .as_ref()
                        .map(|o| o.login.as_str())
                        .unwrap_or("");
                    let full = format!("{}/{}", owner, hit.name);
                    if seen.insert(full) {
                        all_hits.push(hit);
                    }
                }
            }
            Err(e) => {
                // Any single topic failing is non-fatal — return whatever
                // the earlier calls produced. Matches MCP-side resilience.
                eprintln!(
                    "[search_marketplace_skills_github] topic:{} failed: {} (continuing)",
                    topic, e
                );
            }
        }
    }
    eprintln!(
        "[search_marketplace_skills_github] merged {} unique hits across topics",
        all_hits.len()
    );

    let now = chrono::Utc::now().to_rfc3339();
    let mut out: Vec<MarketplaceSkillItem> = Vec::with_capacity(all_hits.len());
    let (mut n_certain, mut n_uncertain, mut n_reject, mut n_drop_name) =
        (0usize, 0usize, 0usize, 0usize);

    for hit in all_hits {
        let owner_login = hit
            .owner
            .as_ref()
            .map(|o| o.login.clone())
            .unwrap_or_default();
        let repo_seg = hit.name.clone();
        if owner_login.is_empty() || repo_seg.is_empty() {
            // Defensive: GitHub Search should always populate these but
            // guarding keeps the rest of the loop simple.
            continue;
        }

        // raw.githubusercontent.com probes — both off-quota for api.github.com.
        // We deliberately probe `HEAD` (the codeload symbolic ref) since
        // most repos default to either `main` or `master` and `HEAD` is
        // GitHub's canonical "default branch" alias for raw paths.
        //
        // Sequential awaits (rather than `tokio::join!`) because the
        // `tokio` crate is built here without the `macros` feature and
        // adding it just for this probe pair is overkill — two HEAD
        // requests against raw.githubusercontent.com complete in well
        // under 200 ms total.
        let skill_md_url = format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/SKILL.md",
            owner_login, repo_seg
        );
        let plugin_url = format!(
            "https://raw.githubusercontent.com/{}/{}/HEAD/.claude-plugin/marketplace.json",
            owner_login, repo_seg
        );
        let has_skill_md_root = head_probe(&skill_md_url).await;
        let has_plugin_marker = head_probe(&plugin_url).await;

        let likelihood = assess_skill_likelihood(&hit, has_skill_md_root, has_plugin_marker);
        match likelihood {
            SkillLikelihood::Certain => n_certain += 1,
            SkillLikelihood::Uncertain => n_uncertain += 1,
            SkillLikelihood::Reject => {
                eprintln!(
                    "[search_marketplace_skills_github]   REJECT {} (topics={:?}, plugin_marker={}, root_skill_md={}, desc={:?})",
                    hit.full_name,
                    hit.topics,
                    has_plugin_marker,
                    has_skill_md_root,
                    hit.description
                        .as_deref()
                        .unwrap_or("")
                        .chars()
                        .take(80)
                        .collect::<String>()
                );
                n_reject += 1;
                continue;
            }
        }

        let name = match name_from_owner_repo(&owner_login, &repo_seg) {
            Some(n) => n,
            None => {
                eprintln!(
                    "[search_marketplace_skills_github]   DROP {}/{}: unsanitisable name",
                    owner_login, repo_seg
                );
                n_drop_name += 1;
                continue;
            }
        };

        let id = format!("git:{}/{}", owner_login, repo_seg);

        let uncertainty_hint = match likelihood {
            SkillLikelihood::Uncertain => {
                Some("Auto-detected from GitHub Search — verify before install".to_string())
            }
            _ => None,
        };

        // V2 wire shape for Skill: `source = "owner/repo"`, `skill_id`
        // left empty (the AI install path will derive the real subpath
        // and finalize will persist it into MarketplaceSource.repo_subpath).
        let item = MarketplaceSkillItem {
            id,
            name,
            description: hit.description.clone().unwrap_or_default(),
            source: format!("{}/{}", owner_login, repo_seg),
            skill_id: String::new(),
            installs: 0,
            is_official: None,
            installs_yesterday: None,
            change: None,
            readme_markdown: String::new(),
            author: owner_login.clone(),
            owner: owner_login.clone(),
            repo: repo_seg.clone(),
            skill_path: String::new(),
            homepage_url: String::new(),
            last_updated_at: hit.updated_at.clone().unwrap_or_else(|| now.clone()),
            stars: hit.stargazers_count,
            categories: Vec::new(),
            tags: Vec::new(),
            license: hit.license.as_ref().and_then(|l| l.spdx_id.clone()),
            uncertainty_hint,
        };
        out.push(item);
    }
    eprintln!(
        "[search_marketplace_skills_github] FINAL: certain={} uncertain={} reject={} drop_name={} → returning {} items",
        n_certain, n_uncertain, n_reject, n_drop_name, out.len()
    );
    Ok(out)
}

// ============================================================================
// AI install — Skill output schema (only the fields we consume)
// ============================================================================

/// Mirror of the Skill v0 schema in
/// `src-tauri/resources/ai_install_skill_schema.json`. Field-for-field
/// match; `serde(default)` everywhere so a missing field gracefully
/// becomes an empty value rather than crashing the install.
#[derive(Debug, Deserialize)]
struct SkillAiOutput {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    name: String,
    #[serde(default)]
    owner: String,
    #[serde(default)]
    repo: String,
    #[serde(default)]
    skill_path: String,
    #[serde(default)]
    #[allow(dead_code)]
    skill_md_filename: String,
    #[serde(default)]
    #[allow(dead_code)]
    description: String,
    #[serde(default)]
    #[allow(dead_code)]
    summary: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    confidence: String,
}

/// Validate that `skill_path` does not contain path-traversal segments. The
/// codeload extractor sanitizes per-component on its side, but rejecting
/// dubious values here keeps the failure mode loud (clear AI-failure
/// context) instead of silent (codeload runs and emits an empty target dir).
fn skill_path_is_safe(p: &str) -> bool {
    if p.is_empty() {
        return true; // explicit "Skill at repo root"
    }
    if p.contains("..") {
        return false;
    }
    if p.starts_with('/') || p.starts_with('.') {
        return false;
    }
    true
}

// ============================================================================
// IPC: ai_install_skill_from_github
// ============================================================================

/// Install a Skill whose location must be inferred from its README (i.e.
/// items returned by `search_marketplace_skills_github`). Spawns `claude -p`
/// with the Skill v0 prompt, validates the structured output, pulls the
/// repo subdirectory via `install_skill_via_codeload`, and runs the same
/// finalize step the standard install path uses — only the source string
/// changes (`"github_search"` vs `"skills_sh"`). Returns
/// `InstallOutcome::NameCollision` for live / trash conflicts before any
/// AI cost is paid.
#[tauri::command]
pub async fn ai_install_skill_from_github(
    app: AppHandle,
    item: MarketplaceSkillItem,
    conflict_action: Option<ConflictAction>,
) -> Result<InstallOutcome, String> {
    // 1. sanitize_resource_name + target dir. Mirrors install_marketplace_skill.
    let safe_name = match marketplace_sanitize(&item.name) {
        Ok(n) => n,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("Invalid resource name: {}", e),
                ai_failure_context: None,
            });
        }
    };
    let skills_dir = get_app_data_dir().join("skills");
    fs::create_dir_all(&skills_dir).map_err(|e| format!("create skills dir: {}", e))?;
    let target_dir = skills_dir.join(&safe_name);
    // Defence in depth: parent canonicalise + starts_with guard. Mirrors
    // install_marketplace_skill:2919-2926.
    if let Ok(canonical_parent) = skills_dir.canonicalize() {
        if !target_dir.starts_with(&canonical_parent) {
            return Ok(InstallOutcome::Failed {
                reason: format!("Refused: target outside skills_dir: {}", target_dir.display()),
                ai_failure_context: None,
            });
        }
    }

    // 2. Conflict detection — same shape as install_marketplace_skill:2930-2938.
    //    Caller resolves NameCollision via the existing modal (Replace /
    //    RestoreFromTrash), then retries with `conflict_action` set.
    let has_local = target_dir.exists();
    let trash_brief = find_skill_trash_brief(&safe_name);
    let has_trashed = trash_brief.is_some();
    if conflict_action.is_none() && (has_local || has_trashed) {
        return Ok(InstallOutcome::NameCollision {
            has_local,
            has_trashed: trash_brief,
        });
    }
    // Same Phase A limitation as the MCP AI install: full Replace /
    // RestoreFromTrash branching is owned by `install_marketplace_skill`.
    // We refuse a non-None conflict_action so the user explicitly trashes
    // or restores first. Phase 2 upgrade can extend this if needed.
    if conflict_action.is_some() {
        return Ok(InstallOutcome::Failed {
            reason: "AI install does not currently support Replace / RestoreFromTrash. \
                     Resolve the name collision first, then retry."
                .to_string(),
            ai_failure_context: None,
        });
    }

    // 3. Spawn claude -p with the Skill v0 prompt.
    let workdir = ai_install_workdir()?;
    let model = resolve_classify_model();
    // The catalog item carries source="owner/repo" — derive the REPO_URL
    // the prompt expects. This is the GitHub Search hit's html_url shape;
    // we reconstruct it from `source` so V2 wire-format items (which don't
    // carry a homepage_url) still work.
    let repo_url = if !item.source.is_empty() && item.source.contains('/') {
        format!("https://github.com/{}", item.source)
    } else if !item.owner.is_empty() && !item.repo.is_empty() {
        format!("https://github.com/{}/{}", item.owner, item.repo)
    } else {
        return Ok(InstallOutcome::Failed {
            reason: format!(
                "Cannot derive repo URL from item: source={:?}, owner={:?}, repo={:?}",
                item.source, item.owner, item.repo
            ),
            ai_failure_context: None,
        });
    };
    let final_prompt = AI_INSTALL_SKILL_PROMPT.replace("{REPO_URL}", &repo_url);

    let spawn_result = tokio::time::timeout(
        Duration::from_secs(AI_INSTALL_TIMEOUT_SECS),
        TokioCommand::new("claude")
            .current_dir(&workdir)
            .arg("-p")
            .arg(&final_prompt)
            .arg("--output-format")
            .arg("json")
            .arg("--json-schema")
            .arg(AI_INSTALL_SKILL_SCHEMA)
            .arg("--tools")
            .arg("WebFetch,Read,Write")
            .arg("--dangerously-skip-permissions")
            .arg("--max-budget-usd")
            .arg(AI_INSTALL_BUDGET_USD)
            .arg("--model")
            .arg(&model)
            .output(),
    )
    .await;

    let output = match spawn_result {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "Failed to execute Claude CLI: {}. Make sure `claude` is installed and in PATH.",
                    e
                ),
                ai_failure_context: None,
            });
        }
        Err(_) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "AI install timed out after {}s. The Claude CLI did not return a result.",
                    AI_INSTALL_TIMEOUT_SECS
                ),
                ai_failure_context: None,
            });
        }
    };

    // 4. Parse top-level CLI envelope. Same is_error / structured_output
    //    discipline as the MCP path (08 §F.1).
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let cli_result: ClaudeCliResult = match serde_json::from_str(&stdout) {
        Ok(r) => r,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!(
                    "Could not parse Claude CLI output as JSON: {}. \
                     Check that the `claude` CLI is up to date.",
                    e
                ),
                ai_failure_context: Some(stdout),
            });
        }
    };

    if cli_result.is_error {
        let api_status = cli_result
            .api_error_status
            .as_ref()
            .map(|v| v.to_string())
            .unwrap_or_default();
        let result_text = cli_result.result.clone().unwrap_or_default();
        return Ok(InstallOutcome::Failed {
            reason: if !api_status.is_empty() {
                format!(
                    "Claude CLI reported an API error (status {}). {}",
                    api_status, result_text
                )
            } else if !result_text.is_empty() {
                format!("Claude CLI reported an error: {}", result_text)
            } else {
                "Claude CLI reported an error with no detail.".to_string()
            },
            ai_failure_context: Some(stdout),
        });
    }

    let structured = match cli_result.structured_output {
        Some(v) => v,
        None => {
            return Ok(InstallOutcome::Failed {
                reason: "Claude CLI returned no structured_output. The model may have refused \
                         or returned only a free-form `result` string."
                    .to_string(),
                ai_failure_context: Some(stdout),
            });
        }
    };

    let raw_structured_pretty = serde_json::to_string_pretty(&structured)
        .unwrap_or_else(|_| structured.to_string());

    let ai: SkillAiOutput = match serde_json::from_value(structured) {
        Ok(o) => o,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("AI structured_output did not match schema: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };

    // 5. Validate AI output before we trust any of it. The Skill prompt's
    //    Step 4d ties success=true to: README found + Step 1d evidence
    //    matched + skill_path determinate + valid name + non-empty
    //    owner/repo + confidence ∈ {high, medium}. We treat
    //    `success == true` as the unified "this is actually a Skill"
    //    confirmation (the schema does not surface a separate
    //    `has_skill_md` boolean — that signal is folded into Step 1d
    //    evidence and `confidence`).
    if !ai.success {
        return Ok(InstallOutcome::Failed {
            reason: if ai.notes.is_empty() {
                format!(
                    "AI install declined this repo (success=false, confidence={}).",
                    ai.confidence
                )
            } else {
                ai.notes.clone()
            },
            ai_failure_context: Some(raw_structured_pretty),
        });
    }

    // The AI returns its own derived `name` (Step 4a). As with MCP install,
    // we treat that as a sanity check only — the canonical filename must
    // match `item.name` so the GitHub Search id (`git:owner/repo`) keeps
    // pointing at a deterministic install target. An invalid AI-derived
    // name is a hard fail because it indicates the model violated its own
    // schema pattern check.
    if try_sanitize(&ai.name).is_none() && !ai.name.is_empty() {
        return Ok(InstallOutcome::Failed {
            reason: format!(
                "AI returned an invalid `name`: {:?}. Must match [A-Za-z0-9_.-]+, ≤ 64 chars, \
                 not start with '.' / '-', not contain '..'.",
                ai.name
            ),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }
    // owner / repo must also be non-empty for the codeload pull below.
    if ai.owner.is_empty() || ai.repo.is_empty() {
        return Ok(InstallOutcome::Failed {
            reason: "AI returned empty owner or repo while success=true.".to_string(),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }
    // skill_path safety check — codeload also sanitizes per-component, but
    // an explicit guard here surfaces the AI failure case loudly.
    if !skill_path_is_safe(&ai.skill_path) {
        return Ok(InstallOutcome::Failed {
            reason: format!(
                "AI returned an unsafe skill_path: {:?}. Must not contain '..' or start with '/' or '.'.",
                ai.skill_path
            ),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }

    // 6. Codeload + extract. The owner / repo strings still go through the
    //    canonical `sanitize_resource_name` inside `install_skill_via_codeload`
    //    callers (defence in depth) but we sanitise here too to keep the
    //    failure mode contained.
    let owner_safe = match marketplace_sanitize(&ai.owner) {
        Ok(o) => o,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("AI owner failed sanitisation: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };
    let repo_safe = match marketplace_sanitize(&ai.repo) {
        Ok(r) => r,
        Err(e) => {
            return Ok(InstallOutcome::Failed {
                reason: format!("AI repo failed sanitisation: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };

    // The codeload helper takes a vec of candidate sub-paths; the AI's
    // single `skill_path` produces a one-element vec. Empty string is the
    // canonical "repo root" sentinel value (see install_marketplace_skill
    // §3035-3041).
    let candidate_paths: Vec<String> = vec![ai.skill_path.clone()];

    // Clean any stale dir from a prior failed attempt before extracting.
    let _ = fs::remove_dir_all(&target_dir);
    let repo_subpath = match install_skill_via_codeload(
        &owner_safe,
        &repo_safe,
        &candidate_paths,
        // Pass an empty `skill_id` because the codeload helper's secondary
        // tree-search lookup (which would search for `/<skill_id>/SKILL.md`)
        // is irrelevant here — the AI has already given us the precise
        // subpath via candidate_paths. If the precise probe fails,
        // failing the install is the right behaviour.
        "",
        &target_dir,
    )
    .await
    {
        Ok(p) => p,
        Err(e) => {
            let _ = fs::remove_dir_all(&target_dir);
            return Ok(InstallOutcome::Failed {
                reason: format!("Could not install skill: {}", e),
                ai_failure_context: Some(raw_structured_pretty),
            });
        }
    };

    // Defence: the codeload extractor checks for SKILL.md / README.md in
    // its candidate-prefix selection, but per-component sanitization could
    // theoretically drop the manifest after selection. Re-verify.
    if !target_dir.join("SKILL.md").exists() && !target_dir.join("README.md").exists() {
        let _ = fs::remove_dir_all(&target_dir);
        return Ok(InstallOutcome::Failed {
            reason: "Install completed but no SKILL.md / README.md in target dir".to_string(),
            ai_failure_context: Some(raw_structured_pretty),
        });
    }

    // 7. Build a synthesized item for finalize so MarketplaceSource carries
    //    the real (owner, repo, name) triple. We preserve the original
    //    item.id (= `git:owner/repo`) so the GitHub Search "Installed?"
    //    SSoT join keeps working across re-searches.
    let finalize_item = MarketplaceSkillItem {
        id: item.id.clone(),
        name: item.name.clone(),
        description: item.description.clone(),
        // Keep `source` in the wire form `"owner/repo"` so
        // `derive_install_triple` inside finalize parses the same triple
        // we just sanitized above.
        source: format!("{}/{}", owner_safe, repo_safe),
        // skill_id stays empty: this Skill came from the GitHub Search
        // path, not from a skills.sh catalog. The real in-repo path is
        // captured in `repo_subpath` below and persisted into
        // `MarketplaceSource.repo_subpath` by finalize.
        skill_id: String::new(),
        installs: 0,
        is_official: None,
        installs_yesterday: None,
        change: None,
        readme_markdown: String::new(),
        author: owner_safe.clone(),
        owner: owner_safe.clone(),
        repo: repo_safe.clone(),
        skill_path: ai.skill_path.clone(),
        homepage_url: String::new(),
        last_updated_at: item.last_updated_at.clone(),
        stars: item.stars,
        categories: Vec::new(),
        tags: Vec::new(),
        license: item.license.clone(),
        uncertainty_hint: None,
    };

    // 8. finalize — writes data.json::skill_metadata with
    //    `source = "github_search"`, runs spawn_auto_classify.
    finalize_skill_install_with_source(app, &finalize_item, target_dir, Some(repo_subpath), "github_search")
        .await
}
