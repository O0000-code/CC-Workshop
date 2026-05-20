use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{ClaudeJson, FetchMcpToolsResult, McpConfigFile, McpMetadata, McpServer, McpServerRuntimeInfo, McpToolInfo};
use crate::utils::{expand_path, get_data_file_path, normalize_nfc};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{ChildStderr, Command as TokioCommand};
use tokio::time::{timeout, Duration};
use walkdir::WalkDir;

/// Scan MCPs directory and return list of MCP servers
#[tauri::command]
pub fn scan_mcps(source_dir: String) -> Result<Vec<McpServer>, String> {
    let path = expand_path(&source_dir);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut mcps = Vec::new();
    let metadata_map = load_mcp_metadata();
    // Single-shot read of ~/.claude.json::mcpServers keys — `parse_mcp_file`
    // derives each MCP's scope by checking this set, so reading once per
    // scan beats reading once per MCP. Failure (missing / unparseable
    // ~/.claude.json) yields an empty set, which means every MCP derives
    // to "project" — the safe default.
    let global_mcp_names = load_global_mcp_names();

    for entry in WalkDir::new(&path)
        .min_depth(1)
        .max_depth(2)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        // Look for JSON files (MCP config files)
        if file_path.extension().map_or(false, |ext| ext == "json") {
            if let Ok(mcp) = parse_mcp_file(file_path, &metadata_map, &global_mcp_names) {
                mcps.push(mcp);
            }
        }
    }

    Ok(mcps)
}

/// Get a single MCP by ID
#[tauri::command]
pub fn get_mcp(source_dir: String, mcp_id: String) -> Result<Option<McpServer>, String> {
    let mcps = scan_mcps(source_dir)?;
    Ok(mcps.into_iter().find(|m| m.id == mcp_id))
}

/// Read `~/.claude.json::mcpServers` keys as a HashSet.
///
/// `~/.claude.json` is the source of truth for whether an MCP is registered
/// at user (global) scope in Claude Code. We don't reuse `import::read_claude_json`
/// to keep this module self-contained — and we only need the key set, not the
/// full config. On any failure (missing file, parse error) returns an empty
/// set so every MCP derives to "project" (safe default; matches the
/// pre-derivation behavior when metadata.scope was empty).
fn load_global_mcp_names() -> HashSet<String> {
    let Some(home) = dirs::home_dir() else {
        return HashSet::new();
    };
    let path = home.join(".claude.json");
    let Ok(content) = fs::read_to_string(&path) else {
        return HashSet::new();
    };
    let Ok(claude_json) = serde_json::from_str::<ClaudeJson>(&content) else {
        return HashSet::new();
    };
    claude_json.mcp_servers.into_keys().collect()
}

/// Derive an MCP's scope from filesystem state.
///
/// `mcp_name` is the MCP config file's `name` field (which `update_mcp_scope`
/// uses as the `~/.claude.json::mcpServers` key — see `import.rs:884`+). If the
/// name appears in the global set, scope is "global"; otherwise "project".
///
/// Caller passes a pre-loaded `HashSet` from `load_global_mcp_names` so that
/// scanning N MCPs does not perform N IO operations.
fn derive_mcp_scope(mcp_name: &str, global_mcp_names: &HashSet<String>) -> String {
    if global_mcp_names.contains(mcp_name) {
        "global".to_string()
    } else {
        "project".to_string()
    }
}

/// Update MCP metadata (category, tags, enabled status, category_id).
///
/// **DATA_MUTEX**: Acquired at the outermost scope (T1f / `phase1_audit.md`
/// P1-3 closure — was previously a known gap). Concurrent
/// `update_mcp_metadata` + `reorder_categories` (and any other data.json
/// mutator) are now serialised, eliminating the V1 lost-update window in
/// which a stale `read_app_data` snapshot could overwrite a fresh
/// `categories` reorder. See `03_tech_plan.md` V2 §3.1 + §3.6.
///
/// `category_id` uses the three-state `Option<Option<String>>` pattern
/// (V2 [P1-6], mirrors `update_category.parentId` semantics):
/// - **outer `None`** (JS payload omits the key OR sends `undefined`)
///   → "do not modify the `category_id`"
/// - **outer `Some(None)`** (JS payload sends `null`)
///   → "clear the `category_id` (uncategorized)"
/// - **outer `Some(Some(id))`** (JS payload sends `{ categoryId: "id" }`)
///   → "set `category_id` to the given id"
///
/// Frontend stores call this with both `category` (cached display name) and
/// `categoryId` (canonical reference) when the dropdown changes — dual-write
/// keeps the cached name in sync with the resolved id while the V1
/// hierarchy migration is still rolling out (see `03_tech_plan.md` V2 §4.6
/// + `04_implementation_plan.md` V2 T3e).
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_mcp_metadata(
    mcp_id: String,
    category: Option<String>,
    categoryId: Option<Option<String>>,
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let metadata = app_data
        .mcp_metadata
        .entry(mcp_id)
        .or_insert_with(McpMetadata::default);

    if let Some(cat) = category {
        metadata.category = cat;
    }
    if let Some(new_category_id_opt) = categoryId {
        metadata.category_id = new_category_id_opt;
    }
    if let Some(t) = tags {
        metadata.tags = t;
    }
    if let Some(e) = enabled {
        metadata.enabled = e;
    }

    write_app_data(app_data)?;
    Ok(())
}

/// Check if a plugin is enabled in Claude settings
fn is_plugin_enabled(plugin_id: &str) -> bool {
    if let Some(home) = dirs::home_dir() {
        let settings_path = home.join(".claude").join("settings.json");
        if settings_path.exists() {
            if let Ok(content) = fs::read_to_string(&settings_path) {
                if let Ok(settings) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(enabled_plugins) = settings.get("enabledPlugins") {
                        if let Some(enabled) = enabled_plugins.get(plugin_id) {
                            return enabled.as_bool().unwrap_or(false);
                        }
                    }
                }
            }
        }
    }
    false
}

fn parse_mcp_file(
    file_path: &std::path::Path,
    metadata_map: &std::collections::HashMap<String, McpMetadata>,
    global_mcp_names: &HashSet<String>,
) -> Result<McpServer, String> {
    let content = fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    let config: McpConfigFile = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Generate ID from path. R2-1: NFC-normalise so an MCP JSON whose
    // filename contains CJK / accented characters gets the same metadata
    // key regardless of whether the disk bytes are NFC (git origin) or
    // NFD (Finder rename / iCloud). See `skills.rs:parse_skill_file` for
    // the broader rationale.
    let id = normalize_nfc(&file_path.to_string_lossy());

    // Get metadata if exists
    let metadata = metadata_map.get(&id);

    // Get installed_at from file creation time
    let installed_at = fs::metadata(file_path)
        .ok()
        .and_then(|m| m.created().ok())
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.to_rfc3339()
        });

    // Determine plugin enabled status if this is a plugin-sourced MCP
    let plugin_enabled = if config.install_source.as_deref() == Some("plugin") {
        config.plugin_id.as_ref().map(|pid| is_plugin_enabled(pid))
    } else {
        None
    };

    // Marketplace provenance — prefer the JSON file's own field (written at
    // install time by `install_marketplace_mcp`), fall back to metadata in
    // `data.json` (kept in sync as the SSoT mirror). Either path satisfies
    // the SSoT helper; the JSON is canonical for newly installed entries.
    let marketplace_source = config
        .marketplace_source
        .clone()
        .or_else(|| metadata.and_then(|m| m.marketplace_source.clone()));

    // B-P0-9: surface persisted `required_env_vars` from metadata to the
    // runtime `McpServer` so the Project detail panel can render
    // "Missing required env vars" hints without rehydrating the catalog.
    let required_env_vars = metadata.and_then(|m| m.required_env_vars.clone());

    // Phase A (marketplace GitHub Search + AI install): derive `needs_config`
    // from `(required_env_vars, config.env)` so list / detail UIs can render a
    // warning corner badge ("Configuration required") without re-walking the
    // spec list themselves. True iff at least one declared spec name has a
    // missing or whitespace-only value in the user-facing `env` map. HTTP
    // MCPs have `required_env_vars=None` (env requirements live in headers /
    // url_variables) and therefore `needs_config=false`. Matches the "missing
    // env" probe used by `ProjectConfigPanel.tsx:80` so corner-badge state and
    // panel state stay aligned (10 §B.2 SSoT goal).
    let needs_config = required_env_vars
        .as_ref()
        .map(|specs| {
            let env_map = config.env.as_ref();
            specs.iter().any(|spec| {
                env_map
                    .and_then(|m| m.get(&spec.name))
                    .map(|v| v.trim().is_empty())
                    .unwrap_or(true)
            })
        })
        .unwrap_or(false);

    // Scope is DERIVED from `~/.claude.json::mcpServers` at scan time
    // (not read from `McpMetadata.scope`). The metadata field still
    // exists for `data.json` backward compat but is no longer the
    // source of truth — `~/.claude.json` is. See V1 fix plan
    // `/Users/bo/.claude/plans/hazy-percolating-forest.md`. Computed
    // before the struct literal so `config.name` can still be moved
    // into the `name:` field without an extra clone.
    let derived_scope = derive_mcp_scope(&config.name, global_mcp_names);

    let mcp = McpServer {
        id: id.clone(),
        name: config.name,
        description: config.description.unwrap_or_default(),
        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
        category_id: metadata.and_then(|m| m.category_id.clone()),
        tags: metadata.map(|m| m.tags.clone()).unwrap_or_default(),
        enabled: metadata.map(|m| m.enabled).unwrap_or(true),
        // R2-1: preserve the `id == source_path` invariant in NFC form.
        // See `skills.rs:parse_skill_file` for the rationale.
        source_path: id.clone(),
        scope: derived_scope,
        command: config.command,
        args: config.args.unwrap_or_default(),
        env: config.env,
        provided_tools: config.provided_tools.unwrap_or_default(),
        // Mirror skills.rs:261 — anchor `createdAt` to the OS file creation
        // time so the MCP Servers page "Recently added" sort tracks real
        // install history instead of getting reset to `now()` on every scan.
        created_at: installed_at
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        last_used: metadata.and_then(|m| m.last_used.clone()),
        usage_count: metadata.map(|m| m.usage_count).unwrap_or(0),
        installed_at,
        url: config.url,
        headers: config.headers,
        mcp_type: config.mcp_type,
        install_source: config.install_source,
        plugin_id: config.plugin_id,
        plugin_name: config.plugin_name,
        marketplace: config.marketplace,
        plugin_enabled,
        marketplace_source,
        required_env_vars,
        needs_config,
    };

    Ok(mcp)
}

fn load_mcp_metadata() -> std::collections::HashMap<String, McpMetadata> {
    let data_path = get_data_file_path();
    if data_path.exists() {
        if let Ok(content) = fs::read_to_string(&data_path) {
            if let Ok(app_data) = serde_json::from_str::<crate::types::AppData>(&content) {
                return app_data.mcp_metadata;
            }
        }
    }
    std::collections::HashMap::new()
}

// ============================================================================
// MCP Tools Fetch Implementation
// ============================================================================

/// JSON-RPC response structure for MCP communication
#[derive(Debug, serde::Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: Option<u64>,
    result: Option<serde_json::Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, serde::Deserialize)]
struct JsonRpcError {
    #[allow(dead_code)]
    code: i64,
    message: String,
}

/// Fetch tools from an MCP server by starting it and querying tools/list
///
/// This command:
/// 1. Starts the MCP server as a child process
/// 2. Sends initialize request via JSON-RPC
/// 3. Receives initialize response and sends initialized notification
/// 4. Sends tools/list request
/// 5. Parses and returns the tools
/// 6. Gracefully shuts down the server
#[tauri::command]
pub async fn fetch_mcp_tools(
    command: String,
    args: Vec<String>,
    env: Option<HashMap<String, String>>,
    timeout_ms: Option<u64>,
) -> Result<FetchMcpToolsResult, String> {
    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(15000));

    // Build the command
    //
    // R2-7: stderr is now piped (was Stdio::null()) so we can append a
    // tail of it to the error string on failure paths. Previously the
    // user got "No response from MCP server" with no clue why (e.g.
    // `npx: command not found`, missing env var, wrong Node version);
    // see `drain_mcp_stderr` for the bounded read.
    let mut cmd = TokioCommand::new(&command);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true); // Ensure process is terminated when dropped

    // Inherit current environment (PATH is fixed at app startup in main.rs)
    cmd.envs(std::env::vars());
    if let Some(env_vars) = &env {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }

    // Spawn the child process
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return Ok(FetchMcpToolsResult {
                success: false,
                tools: vec![],
                error: Some(format!("Failed to spawn MCP server '{}': {}", command, e)),
                server_info: None,
            });
        }
    };

    let stdin = match child.stdin.take() {
        Some(s) => s,
        None => {
            let _ = child.kill().await;
            return Ok(FetchMcpToolsResult {
                success: false,
                tools: vec![],
                error: Some("Failed to get stdin of MCP server process".to_string()),
                server_info: None,
            });
        }
    };

    let stdout = match child.stdout.take() {
        Some(s) => s,
        None => {
            let _ = child.kill().await;
            return Ok(FetchMcpToolsResult {
                success: false,
                tools: vec![],
                error: Some("Failed to get stdout of MCP server process".to_string()),
                server_info: None,
            });
        }
    };

    // R2-7: take the stderr handle so we can drain it on failure paths.
    // `take()` returns None only if stderr was not piped (we just piped
    // it above), so this is effectively infallible — but handle the
    // theoretical None by dropping the stderr capture rather than
    // failing the whole IPC.
    let stderr_handle = child.stderr.take();

    let mut stdin = stdin;
    let mut reader = BufReader::new(stdout).lines();

    // Wrap the entire communication in a timeout
    let result = timeout(timeout_duration, async {
        // Step 1: Send initialize request
        let init_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "roots": { "listChanged": true }
                },
                "clientInfo": {
                    "name": "CC Workshop",
                    "version": "1.0.0"
                }
            }
        });

        let init_json = serde_json::to_string(&init_request)
            .map_err(|e| format!("Failed to serialize initialize request: {}", e))?;

        stdin.write_all(init_json.as_bytes()).await
            .map_err(|e| format!("Failed to write initialize request: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        // Step 2: Read initialize response
        let init_response_line = reader.next_line().await
            .map_err(|e| format!("Failed to read initialize response: {}", e))?
            .ok_or("No response from MCP server")?;

        let init_response: JsonRpcResponse = serde_json::from_str(&init_response_line)
            .map_err(|e| format!("Failed to parse initialize response: {} (raw: {})", e, init_response_line))?;

        if let Some(error) = init_response.error {
            return Err(format!("Initialize error: {}", error.message));
        }

        // Parse server info from initialize response
        let server_info = init_response.result
            .as_ref()
            .and_then(|r| r.get("serverInfo"))
            .map(|si| McpServerRuntimeInfo {
                name: si.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string(),
                version: si.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
            });

        // Step 3: Send initialized notification (no id, it's a notification)
        let initialized_notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });

        let notif_json = serde_json::to_string(&initialized_notification)
            .map_err(|e| format!("Failed to serialize initialized notification: {}", e))?;

        stdin.write_all(notif_json.as_bytes()).await
            .map_err(|e| format!("Failed to write initialized notification: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        // Step 4: Send tools/list request
        let tools_request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        });

        let tools_json = serde_json::to_string(&tools_request)
            .map_err(|e| format!("Failed to serialize tools/list request: {}", e))?;

        stdin.write_all(tools_json.as_bytes()).await
            .map_err(|e| format!("Failed to write tools/list request: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("Failed to write newline: {}", e))?;
        stdin.flush().await
            .map_err(|e| format!("Failed to flush: {}", e))?;

        // Step 5: Read tools/list response
        let tools_response_line = reader.next_line().await
            .map_err(|e| format!("Failed to read tools/list response: {}", e))?
            .ok_or("No tools response from MCP server")?;

        let tools_response: JsonRpcResponse = serde_json::from_str(&tools_response_line)
            .map_err(|e| format!("Failed to parse tools/list response: {} (raw: {})", e, tools_response_line))?;

        if let Some(error) = tools_response.error {
            return Err(format!("tools/list error: {}", error.message));
        }

        // Step 6: Parse tools from response
        let tools: Vec<McpToolInfo> = tools_response.result
            .and_then(|r| r.get("tools").cloned())
            .and_then(|t| serde_json::from_value(t).ok())
            .unwrap_or_default();

        Ok::<_, String>(FetchMcpToolsResult {
            success: true,
            tools,
            error: None,
            server_info,
        })
    })
    .await;

    // Ensure child process is terminated. We kill before draining stderr
    // so a misbehaving server that never closes its pipes still terminates
    // promptly; after kill, the OS closes the pipe and `read_to_end` sees
    // EOF after any buffered bytes.
    let _ = child.kill().await;

    match result {
        Ok(Ok(result)) => Ok(result),
        Ok(Err(e)) => {
            // R2-7: enrich the error with whatever the MCP server wrote
            // to stderr. Cap-bounded read (8 KB / 500 ms) so a flood
            // cannot grow the IPC return indefinitely.
            let tail = drain_mcp_stderr(stderr_handle).await;
            Ok(FetchMcpToolsResult {
                success: false,
                tools: vec![],
                error: Some(combine_error_with_stderr(e, tail)),
                server_info: None,
            })
        }
        Err(_) => {
            let tail = drain_mcp_stderr(stderr_handle).await;
            let base = format!("Operation timed out after {}ms", timeout_ms.unwrap_or(15000));
            Ok(FetchMcpToolsResult {
                success: false,
                tools: vec![],
                error: Some(combine_error_with_stderr(base, tail)),
                server_info: None,
            })
        }
    }
}

/// R2-7: bounded drain of an MCP server's stderr pipe.
///
/// Reads up to 8 KB or 500 ms, whichever happens first. Returns the
/// trimmed text iff non-empty. The bound is essential: a misbehaving
/// server could write megabytes of warnings and we must not balloon the
/// IPC return value. Used exclusively on failure paths — successful
/// `fetch_mcp_tools` calls discard stderr because servers often emit
/// debug noise that would clutter the UI.
async fn drain_mcp_stderr(handle: Option<ChildStderr>) -> Option<String> {
    let stderr = handle?;
    let mut buf = Vec::with_capacity(2048);
    // Cap the read at 8 KB so a chatty server cannot grow the return
    // string without bound, and cap the wait at 500 ms so a child whose
    // stderr pipe is still open (because the child wasn't fully killed
    // in time) cannot stall the IPC return.
    let mut limited = stderr.take(8192);
    let _ = timeout(
        Duration::from_millis(500),
        limited.read_to_end(&mut buf),
    )
    .await;
    if buf.is_empty() {
        return None;
    }
    let text = String::from_utf8_lossy(&buf).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Append the stderr tail (if any) to an existing error string in a
/// stable, documented format. Keeping the formatting here means we
/// don't repeat it across every failure branch.
fn combine_error_with_stderr(base: String, tail: Option<String>) -> String {
    match tail {
        Some(t) => format!("{}\n\n--- MCP server stderr ---\n{}", base, t),
        None => base,
    }
}

/// Delete an MCP by moving it to the trash directory
///
/// Instead of permanently deleting, moves the MCP config to ~/.cc-workshop/trash/mcps/
/// for easy recovery if needed.
#[tauri::command]
pub fn delete_mcp(mcp_id: String, ensemble_dir: String) -> Result<(), String> {
    let ensemble_path = expand_path(&ensemble_dir);
    let mcp_path = std::path::Path::new(&mcp_id);

    // Verify the MCP config file exists
    if !mcp_path.exists() {
        return Err(format!("MCP config not found: {}", mcp_id));
    }

    // Get MCP name from path
    let mcp_name = mcp_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid MCP path")?;

    // Create trash directory
    let trash_dir = ensemble_path.join("trash").join("mcps");
    fs::create_dir_all(&trash_dir)
        .map_err(|e| format!("Failed to create trash directory: {}", e))?;

    // Generate unique destination path (add timestamp if exists)
    let mut dest_path = trash_dir.join(mcp_name);
    if dest_path.exists() {
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let name_without_ext = mcp_name.trim_end_matches(".json");
        dest_path = trash_dir.join(format!("{}_{}.json", name_without_ext, timestamp));
    }

    // B-P0-7 (E3-3 / E4-1): snapshot current metadata into a sibling
    // `<path>.metadata.json` BEFORE the rename so a future
    // `RestoreFromTrash` can recover the user's category / tags / icon.
    // Failure is non-fatal.
    let _ = crate::commands::marketplace::snapshot_mcp_metadata_into(mcp_path, &mcp_id);

    // Move MCP config to trash
    fs::rename(mcp_path, &dest_path)
        .map_err(|e| format!("Failed to move MCP to trash: {}", e))?;

    // Move the metadata snapshot sibling (if any) alongside the trashed
    // config so it travels with the rename. The marketplace finalize path
    // looks for it next to the live MCP path post-restore.
    let snapshot_src = {
        let mut s = mcp_path.as_os_str().to_os_string();
        s.push(".metadata.json");
        std::path::PathBuf::from(s)
    };
    if snapshot_src.exists() {
        let snapshot_dest = {
            let mut s = dest_path.as_os_str().to_os_string();
            s.push(".metadata.json");
            std::path::PathBuf::from(s)
        };
        let _ = fs::rename(&snapshot_src, &snapshot_dest);
    }

    // Remove metadata for this MCP (T1f: holds DATA_MUTEX so a concurrent
    // `update_mcp_metadata` / `reorder_categories` cannot lose this delete).
    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut app_data = read_app_data().unwrap_or_default();
        app_data.mcp_metadata.remove(&mcp_id);
        // `write_app_data` errors are intentionally swallowed here to preserve
        // existing best-effort semantics: the trash move already succeeded, so
        // surfacing a metadata-cleanup error would mislead the caller. The lock
        // still serialises the write against concurrent mutators.
        let _ = write_app_data(app_data);
    }

    Ok(())
}
