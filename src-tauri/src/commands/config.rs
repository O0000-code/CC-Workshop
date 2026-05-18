use crate::types::{AppData, McpConfigFile, McpServer, ProjectConfigStatus};
use crate::utils::expand_path;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

/// Returns the byte contents of every CLAUDE.md file currently managed by
/// CC Workshop (one entry per file). Used by `clear_project_config` to decide
/// whether a project-side CLAUDE.md is safe to remove: a project file is
/// deletable iff its bytes match one of these managed contents.
///
/// Files whose `managed_path` is missing or unreadable are silently
/// skipped — they will simply not contribute to the "deletable" set, so
/// any project-side CLAUDE.md whose content we could not verify gets
/// preserved (safe default).
fn ensemble_managed_claude_md_contents(app_data: &AppData) -> Vec<Vec<u8>> {
    app_data
        .claude_md_files
        .iter()
        .filter_map(|f| f.managed_path.as_deref())
        .filter_map(|p| fs::read(expand_path(p)).ok())
        .collect()
}

/// True iff `path` exists, is readable, and its bytes match one of
/// `managed_contents`. Any I/O error → false (preserve the file: we can't
/// prove it is CC Workshop-managed, so we must not delete it).
fn matches_any_managed(path: &Path, managed_contents: &[Vec<u8>]) -> bool {
    match fs::read(path) {
        Ok(bytes) => managed_contents.iter().any(|m| m == &bytes),
        Err(_) => false,
    }
}

/// Returns the `name` field of every JSON file in `mcp_source_dir` that
/// parses as `McpConfigFile`. These are the keys CC Workshop would use when
/// writing entries into a project's `.mcp.json::mcpServers` HashMap;
/// therefore they are the keys we are permitted to remove during Clear or
/// when shrinking to an empty list.
fn ensemble_managed_mcp_names(mcp_source_dir: &str) -> HashSet<String> {
    let dir = expand_path(mcp_source_dir);
    let mut names = HashSet::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return names;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) == Some("json") {
            if let Ok(content) = fs::read_to_string(&p) {
                if let Ok(cfg) = serde_json::from_str::<McpConfigFile>(&content) {
                    names.insert(cfg.name);
                }
            }
        }
    }
    names
}

/// Selectively remove CC Workshop-managed entries from a project's
/// `.mcp.json::mcpServers`.
///
/// Rules:
/// - If the file does not exist → no-op (Ok).
/// - If the file cannot be parsed as JSON → leave it alone (preserve
///   user content; better to skip than to corrupt).
/// - From `mcpServers`, remove only keys present in `managed_names`.
/// - **Decision: delete vs. preserve the file**:
///   - If **every** original key was managed (i.e. there were no
///     unmanaged keys to begin with), the user had no hand-written MCP
///     content here — delete the whole file.
///   - Otherwise, write back the trimmed JSON. (The trimmed map may be
///     empty; that's still a valid Claude Code config when the user
///     authored other top-level keys, and even an empty file is harmless.)
fn trim_managed_mcps_in_file(
    mcp_path: &Path,
    managed_names: &HashSet<String>,
) -> Result<(), String> {
    if !mcp_path.exists() {
        return Ok(());
    }
    let content = match fs::read_to_string(mcp_path) {
        Ok(c) => c,
        Err(_) => return Ok(()), // unreadable: don't touch
    };
    let mut value: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Ok(()), // unparseable: don't touch (user content)
    };

    // If there is no `mcpServers` object, there is nothing for us to do.
    let Some(obj) = value
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
    else {
        return Ok(());
    };

    let original_keys: Vec<String> = obj.keys().cloned().collect();
    let all_were_managed = !original_keys.is_empty()
        && original_keys.iter().all(|k| managed_names.contains(k));

    for k in &original_keys {
        if managed_names.contains(k) {
            obj.remove(k);
        }
    }

    if all_were_managed {
        // Every key was CC Workshop-managed and we just removed them all.
        // The only top-level key is `mcpServers` (now empty) — the user
        // had no hand-written MCP content here. Safe to remove the file.
        // (If there were *other* top-level keys the user authored, we
        // fall into the `else` branch below and preserve them.)
        let only_mcp_servers_key = value
            .as_object()
            .map(|m| m.len() == 1 && m.contains_key("mcpServers"))
            .unwrap_or(false);
        if only_mcp_servers_key {
            return fs::remove_file(mcp_path).map_err(|e| e.to_string());
        }
    }

    // Write back the trimmed JSON.
    let json = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
    fs::write(mcp_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// Write MCP configuration to project's .mcp.json (project root)
/// Note: Claude Code reads project-level MCP config from .mcp.json, not settings.local.json
#[tauri::command]
pub fn write_mcp_config(project_path: String, mcp_servers: Vec<McpServer>) -> Result<(), String> {
    let project_dir = expand_path(&project_path);
    let mcp_path = project_dir.join(".mcp.json");

    // If no MCP servers to write, trim only CC Workshop-managed entries out
    // of any existing `.mcp.json` rather than blowing away the whole file:
    // a user may have hand-written entries that must survive a Sync of an
    // empty Scene.
    if mcp_servers.is_empty() {
        let settings = crate::commands::data::read_settings().unwrap_or_default();
        let managed_names = ensemble_managed_mcp_names(&settings.mcp_source_dir);
        return trim_managed_mcps_in_file(&mcp_path, &managed_names);
    }

    // Build mcpServers object with proper format for Claude Code
    let mut mcp_config: HashMap<String, Value> = HashMap::new();
    for mcp in mcp_servers {
        let is_http = mcp.mcp_type.as_deref() == Some("http");
        let mut server_config = if is_http {
            // HTTP MCP: use url instead of command
            json!({
                "type": "http",
                "url": mcp.url.as_deref().unwrap_or(""),
            })
        } else {
            // stdio MCP: use command and args
            json!({
                "type": mcp.mcp_type.as_deref().unwrap_or("stdio"),
                "command": mcp.command,
                "args": mcp.args,
            })
        };

        if let Some(env) = mcp.env {
            if !env.is_empty() {
                server_config["env"] = json!(env);
            }
        }

        // Claude Code reads `headers` as an object on HTTP MCP entries
        // (verified against the official MCP docs, 2026-05-12). Forward
        // any non-empty header map verbatim so Authorization / X-API-Key
        // / Bearer tokens reach the upstream MCP server.
        if is_http {
            if let Some(headers) = mcp.headers {
                if !headers.is_empty() {
                    server_config["headers"] = json!(headers);
                }
            }
        }

        mcp_config.insert(mcp.name.clone(), server_config);
    }

    // Create config object
    let config = json!({
        "mcpServers": mcp_config
    });

    // Write to .mcp.json
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&mcp_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Sync project configuration - creates symlinks for skills and writes MCP config
#[tauri::command]
#[allow(non_snake_case)]
pub fn sync_project_config(
    projectPath: String,
    skillPaths: Vec<String>,
    mcpServers: Vec<McpServer>,
) -> Result<(), String> {
    let project_dir = expand_path(&projectPath);
    let claude_dir = project_dir.join(".claude");
    let skills_dir = claude_dir.join("skills");

    // Ensure directories exist
    fs::create_dir_all(&skills_dir).map_err(|e| e.to_string())?;

    // Remove existing skill symlinks
    if skills_dir.exists() {
        for entry in fs::read_dir(&skills_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }

    // Create symlinks for skills
    for skill_path in skillPaths {
        let source = expand_path(&skill_path);
        if let Some(skill_name) = source.file_name() {
            let target = skills_dir.join(skill_name);
            
            #[cfg(unix)]
            std::os::unix::fs::symlink(&source, &target).map_err(|e| e.to_string())?;
            
            #[cfg(windows)]
            std::os::windows::fs::symlink_dir(&source, &target).map_err(|e| e.to_string())?;
        }
    }

    // Write MCP configuration
    write_mcp_config(projectPath, mcpServers)?;

    Ok(())
}

/// Clear project configuration
#[tauri::command]
#[allow(non_snake_case)]
pub fn clear_project_config(projectPath: String) -> Result<(), String> {
    let project_dir = expand_path(&projectPath);
    let claude_dir = project_dir.join(".claude");
    let skills_dir = claude_dir.join("skills");
    let settings_path = claude_dir.join("settings.local.json");

    // Remove skill symlinks
    if skills_dir.exists() {
        for entry in fs::read_dir(&skills_dir).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(false) {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
        }
    }

    // Acquire DATA_MUTEX once for the remaining cleanup that depends on
    // `data.json`. The guard is held through end of function so the
    // existing rule cleanup block below also runs inside it — a strict
    // improvement over the prior unguarded direct fs::read_to_string.
    let _data_guard = crate::commands::data::DATA_MUTEX
        .lock()
        .map_err(|e| e.to_string())?;
    let app_data = crate::commands::data::read_app_data().unwrap_or_default();
    let settings = crate::commands::data::read_settings().unwrap_or_default();

    // Clear MCP config (.mcp.json in project root) — only remove
    // CC Workshop-managed entries. Hand-written entries in the same file
    // must survive Clear.
    let mcp_path = project_dir.join(".mcp.json");
    let managed_mcp_names = ensemble_managed_mcp_names(&settings.mcp_source_dir);
    trim_managed_mcps_in_file(&mcp_path, &managed_mcp_names)?;

    // Also clean up legacy settings.local.json mcpServers if present
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(mut legacy_settings) = serde_json::from_str::<Value>(&content) {
                if legacy_settings.get("mcpServers").is_some() {
                    if let Some(obj) = legacy_settings.as_object_mut() {
                        obj.remove("mcpServers");
                    }
                    if let Ok(json) = serde_json::to_string_pretty(&legacy_settings) {
                        let _ = fs::write(&settings_path, json);
                    }
                }
            }
        }
    }

    // Clear CLAUDE.md files (all possible distribution paths) — but only
    // delete files whose **bytes match** one of the CC Workshop-managed
    // CLAUDE.md contents. A user-authored CLAUDE.md whose contents do
    // not match anything CC Workshop tracks must survive Clear.
    //
    // Best-effort: any unexpected I/O error preserves the file (we
    // can't prove it's managed, so we don't delete it).
    let managed_claude_md_contents = ensemble_managed_claude_md_contents(&app_data);
    for candidate in [
        project_dir.join("CLAUDE.md"),
        claude_dir.join("CLAUDE.md"),
        project_dir.join("CLAUDE.local.md"),
    ] {
        if candidate.exists() && matches_any_managed(&candidate, &managed_claude_md_contents) {
            let _ = fs::remove_file(&candidate);
        }
    }

    // Clear CC Workshop-managed Rule files from <project>/.claude/rules/.
    //
    // We only delete files whose filename matches a Rule currently tracked in
    // data.json — never the entire `rules/` directory — because users may
    // hand-write project-local rules alongside the CC Workshop-managed ones, and
    // a Sync should never wipe out unmanaged content. Silently skip on any
    // IO error: clearing is a best-effort operation and must not break the
    // primary clear flow (deleting skill symlinks / .mcp.json).
    let rules_dir = claude_dir.join("rules");
    if rules_dir.exists() && rules_dir.is_dir() {
        // Read managed filenames from data.json. If the read fails we skip
        // rule cleanup entirely rather than risk deleting unmanaged files.
        if let Ok(content) =
            fs::read_to_string(crate::utils::get_app_data_dir().join("data.json"))
        {
            if let Ok(value) = serde_json::from_str::<Value>(&content) {
                if let Some(rules_arr) = value.get("rules").and_then(|v| v.as_array()) {
                    let managed_filenames: std::collections::HashSet<String> = rules_arr
                        .iter()
                        .filter_map(|r| r.get("filename").and_then(|f| f.as_str()).map(String::from))
                        .collect();

                    if let Ok(entries) = fs::read_dir(&rules_dir) {
                        for entry in entries.filter_map(|e| e.ok()) {
                            let path = entry.path();
                            if !path.is_file() {
                                continue;
                            }
                            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                                if managed_filenames.contains(name) {
                                    let _ = fs::remove_file(&path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}

/// Get project configuration status
#[tauri::command]
pub fn get_project_config_status(project_path: String) -> Result<ProjectConfigStatus, String> {
    let project_dir = expand_path(&project_path);
    let claude_dir = project_dir.join(".claude");
    let skills_dir = claude_dir.join("skills");
    let settings_path = claude_dir.join("settings.local.json");
    let commands_path = claude_dir.join("COMMANDS.md");

    let has_claude_dir = claude_dir.exists();
    let has_settings_local = settings_path.exists();
    let has_commands_md = commands_path.exists();

    // Count skills (symlinks in skills dir)
    let skill_count = if skills_dir.exists() {
        fs::read_dir(&skills_dir)
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter(|e| {
                        e.path()
                            .symlink_metadata()
                            .map(|m| m.file_type().is_symlink())
                            .unwrap_or(false)
                    })
                    .count() as u32
            })
            .unwrap_or(0)
    } else {
        0
    };

    // Count MCPs from .mcp.json (project root)
    let mcp_path = project_dir.join(".mcp.json");
    let mcp_count = if mcp_path.exists() {
        fs::read_to_string(&mcp_path)
            .ok()
            .and_then(|content| serde_json::from_str::<Value>(&content).ok())
            .and_then(|config| config["mcpServers"].as_object().map(|m| m.len() as u32))
            .unwrap_or(0)
    } else {
        0
    };

    Ok(ProjectConfigStatus {
        has_claude_dir,
        has_settings_local,
        has_commands_md,
        skill_count,
        mcp_count,
    })
}
