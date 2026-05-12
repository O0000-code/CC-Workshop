use crate::types::{McpServer, ProjectConfigStatus};
use crate::utils::expand_path;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;

/// Write MCP configuration to project's .mcp.json (project root)
/// Note: Claude Code reads project-level MCP config from .mcp.json, not settings.local.json
#[tauri::command]
pub fn write_mcp_config(project_path: String, mcp_servers: Vec<McpServer>) -> Result<(), String> {
    let project_dir = expand_path(&project_path);
    let mcp_path = project_dir.join(".mcp.json");

    // If no MCP servers, delete the config file if it exists
    if mcp_servers.is_empty() {
        if mcp_path.exists() {
            fs::remove_file(&mcp_path).map_err(|e| e.to_string())?;
        }
        return Ok(());
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

    // Clear MCP config (.mcp.json in project root)
    let mcp_path = project_dir.join(".mcp.json");
    if mcp_path.exists() {
        fs::remove_file(&mcp_path).map_err(|e| e.to_string())?;
    }

    // Also clean up legacy settings.local.json mcpServers if present
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(mut settings) = serde_json::from_str::<Value>(&content) {
                if settings.get("mcpServers").is_some() {
                    if let Some(obj) = settings.as_object_mut() {
                        obj.remove("mcpServers");
                    }
                    if let Ok(json) = serde_json::to_string_pretty(&settings) {
                        let _ = fs::write(&settings_path, json);
                    }
                }
            }
        }
    }

    // Clear CLAUDE.md files (all possible distribution paths)
    // 1. Project root: CLAUDE.md
    let claude_md_root = project_dir.join("CLAUDE.md");
    if claude_md_root.exists() {
        let _ = fs::remove_file(&claude_md_root);
    }

    // 2. Claude directory: .claude/CLAUDE.md
    let claude_md_dir = claude_dir.join("CLAUDE.md");
    if claude_md_dir.exists() {
        let _ = fs::remove_file(&claude_md_dir);
    }

    // 3. Local: CLAUDE.local.md
    let claude_md_local = project_dir.join("CLAUDE.local.md");
    if claude_md_local.exists() {
        let _ = fs::remove_file(&claude_md_local);
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
