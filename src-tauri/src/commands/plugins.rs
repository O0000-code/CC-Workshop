//! Plugin detection and import commands for Ensemble
//!
//! This module provides commands to:
//! - Detect installed Claude Code plugins
//! - Detect Skills and MCPs within plugins
//! - Import plugin Skills and MCPs to Ensemble

#![allow(dead_code)]

use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    DetectedPluginMcp, DetectedPluginSkill, InstalledPlugin, McpConfigFile,
    PluginImportCleanupResult, PluginImportError, PluginImportItem, PluginImportResult,
};
use crate::utils::path::expand_tilde;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================================
// Helper types for parsing plugin files
// ============================================================================

/// installed_plugins.json structure
#[derive(Debug, Deserialize)]
struct InstalledPluginsFile {
    #[serde(default)]
    version: u32,
    #[serde(default)]
    plugins: HashMap<String, Vec<InstalledPluginEntry>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledPluginEntry {
    scope: String,
    install_path: String,
    version: String,
    #[serde(default)]
    installed_at: Option<String>,
    #[serde(default)]
    last_updated: Option<String>,
    #[serde(default)]
    git_commit_sha: Option<String>,
}

/// Claude settings.json structure (for enabledPlugins)
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClaudeSettingsFile {
    #[serde(default)]
    enabled_plugins: HashMap<String, bool>,
    #[serde(flatten)]
    _other: HashMap<String, serde_json::Value>,
}

/// plugin.json structure inside .claude-plugin/
#[derive(Debug, Deserialize)]
struct PluginJson {
    name: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    author: Option<PluginAuthor>,
}

#[derive(Debug, Deserialize)]
struct PluginAuthor {
    #[serde(default)]
    name: Option<String>,
}

/// .mcp.json structure
#[derive(Debug, Deserialize)]
struct McpJsonFile {
    #[serde(flatten)]
    servers: HashMap<String, McpServerConfig>,
}

#[derive(Debug, Deserialize)]
struct McpServerConfig {
    #[serde(default)]
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: Option<HashMap<String, String>>,
    #[serde(rename = "type", default)]
    mcp_type: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

// ============================================================================
// Helper functions
// ============================================================================

/// Get Claude plugins directory path
fn get_claude_plugins_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude").join("plugins"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

/// Get Claude settings.json path
fn get_claude_settings_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude").join("settings.json"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

/// Read enabled plugins from settings.json
fn read_enabled_plugins() -> Result<HashMap<String, bool>, String> {
    let settings_path = get_claude_settings_path()?;
    if !settings_path.exists() {
        return Ok(HashMap::new());
    }

    let content =
        fs::read_to_string(&settings_path).map_err(|e| format!("Failed to read settings.json: {}", e))?;

    let settings: ClaudeSettingsFile =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings.json: {}", e))?;

    Ok(settings.enabled_plugins)
}

/// Parse plugin ID into (name, marketplace)
fn parse_plugin_id(plugin_id: &str) -> (String, String) {
    if let Some(at_pos) = plugin_id.rfind('@') {
        // Safe string slicing using get()
        let name = plugin_id.get(..at_pos)
            .map(|s| s.to_string())
            .unwrap_or_else(|| plugin_id.to_string());
        let marketplace = plugin_id.get(at_pos + 1..)
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        (name, marketplace)
    } else {
        (plugin_id.to_string(), "unknown".to_string())
    }
}

/// Truncate description to first sentence (ending with period) and max length
fn truncate_to_first_sentence(text: &str, max_chars: usize) -> String {
    let trimmed = text.trim();

    // Find first sentence ending (period followed by space or end)
    let sentence_end = trimmed.char_indices().find(|(i, c)| {
        if *c == '.' || *c == '。' {
            // Check if next char is space, newline, or end of string
            let next_idx = i + c.len_utf8();
            if next_idx >= trimmed.len() {
                return true;
            }
            if let Some(next_char) = trimmed.get(next_idx..).and_then(|s| s.chars().next()) {
                return next_char.is_whitespace() || next_char == '\n';
            }
        }
        false
    });

    let result = if let Some((idx, c)) = sentence_end {
        let end = idx + c.len_utf8();
        trimmed.get(..end).unwrap_or(trimmed).to_string()
    } else {
        trimmed.to_string()
    };

    // Apply max length limit
    if result.chars().count() > max_chars {
        let end_idx = result.char_indices()
            .nth(max_chars)
            .map(|(i, _)| i)
            .unwrap_or(result.len());
        format!("{}...", result.get(..end_idx).unwrap_or(&result))
    } else {
        result
    }
}

/// Parse SKILL.md to extract description from frontmatter
fn parse_skill_description(content: &str) -> Option<String> {
    // Check for YAML frontmatter
    if !content.starts_with("---") {
        // Fallback: find first non-empty, non-header line
        return content
            .lines()
            .find(|line| {
                let trimmed = line.trim();
                !trimmed.is_empty() && !trimmed.starts_with('#') && trimmed != "---"
            })
            .map(|s| truncate_to_first_sentence(s, 200));
    }

    // Safely get content after "---"
    let remaining = match content.get(3..) {
        Some(r) => r,
        None => return None,
    };

    // Find the closing ---
    let end_pos = match remaining.find("\n---") {
        Some(pos) => pos,
        None => return None,
    };

    let frontmatter = match remaining.get(..end_pos) {
        Some(f) => f,
        None => return None,
    };

    // Look for description field
    let lines: Vec<&str> = frontmatter.lines().collect();
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with("description:") {
            let desc_start = "description:".len();
            let after_key = match trimmed.get(desc_start..) {
                Some(d) => d.trim(),
                None => continue,
            };

            // Check for YAML multi-line indicators
            if after_key == "|" || after_key == "|-" || after_key == ">-" || after_key == ">" {
                // Multi-line string: collect subsequent indented lines
                let mut desc_lines = Vec::new();
                let is_folded = after_key.starts_with('>'); // > folds newlines to spaces

                for j in (i + 1)..lines.len() {
                    let next_line = lines[j];
                    // Check if line is indented (part of multi-line value)
                    if next_line.starts_with("  ") || next_line.starts_with("\t") {
                        desc_lines.push(next_line.trim());
                    } else if next_line.trim().is_empty() {
                        // Empty lines within multi-line
                        if !desc_lines.is_empty() {
                            desc_lines.push("");
                        }
                    } else {
                        // Non-indented non-empty line means end of multi-line
                        break;
                    }
                }

                let desc = if is_folded {
                    // Folded style: join with spaces
                    desc_lines.join(" ")
                } else {
                    // Literal style: join with newlines, but for display use spaces
                    desc_lines.join(" ")
                };

                if !desc.is_empty() {
                    return Some(truncate_to_first_sentence(&desc, 200));
                }
            } else {
                // Single line description
                let desc = after_key.trim_matches('"').trim_matches('\'');
                if !desc.is_empty() {
                    return Some(truncate_to_first_sentence(desc, 200));
                }
            }
        }
    }

    None
}

/// Read plugin.json from a plugin version directory
fn read_plugin_json(plugin_version_dir: &Path) -> Option<PluginJson> {
    let plugin_json_path = plugin_version_dir.join(".claude-plugin").join("plugin.json");
    if !plugin_json_path.exists() {
        return None;
    }

    fs::read_to_string(&plugin_json_path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

/// Find the version directory inside a plugin directory
/// Handles both semver (1.0.0) and hash (27d2b86d72da) versions
fn find_version_dir(plugin_dir: &Path) -> Option<PathBuf> {
    if !plugin_dir.is_dir() {
        return None;
    }

    // Look for subdirectories (version directories)
    let entries: Vec<_> = fs::read_dir(plugin_dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .chars()
                .next()
                .map_or(false, |c| c != '.')
        })
        .collect();

    if entries.is_empty() {
        return None;
    }

    // Return the first version directory found
    // (In most cases there's only one version installed)
    Some(entries[0].path())
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Detect installed plugins from Claude Code
///
/// Reads:
/// - ~/.claude/plugins/installed_plugins.json for plugin list
/// - ~/.claude/settings.json for enabled status
/// - Plugin cache directories for details
#[tauri::command]
pub fn detect_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let plugins_dir = get_claude_plugins_dir()?;
    let installed_plugins_path = plugins_dir.join("installed_plugins.json");

    if !installed_plugins_path.exists() {
        return Ok(Vec::new());
    }

    // Read installed_plugins.json
    let content = fs::read_to_string(&installed_plugins_path)
        .map_err(|e| format!("Failed to read installed_plugins.json: {}", e))?;

    let installed_file: InstalledPluginsFile =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse installed_plugins.json: {}", e))?;

    // Read enabled plugins
    let enabled_plugins = read_enabled_plugins().unwrap_or_default();

    // Process each plugin
    let cache_dir = plugins_dir.join("cache");
    let mut plugins = Vec::new();

    for (plugin_id, entries) in installed_file.plugins {
        // Get the first entry (most recent installation)
        if let Some(entry) = entries.first() {
            let (name, marketplace) = parse_plugin_id(&plugin_id);

            // Check if enabled
            let enabled = enabled_plugins.get(&plugin_id).copied().unwrap_or(false);

            // Find the plugin version directory in cache
            let plugin_cache_dir = cache_dir.join(&marketplace).join(&name);
            let version_dir = find_version_dir(&plugin_cache_dir);

            // Check for skills and MCP
            let (has_skills, has_mcp) = if let Some(ref ver_dir) = version_dir {
                let skills_dir = ver_dir.join("skills");
                let mcp_json = ver_dir.join(".mcp.json");
                (skills_dir.exists() && skills_dir.is_dir(), mcp_json.exists())
            } else {
                (false, false)
            };

            plugins.push(InstalledPlugin {
                id: plugin_id.clone(),
                name: name.clone(),
                marketplace: marketplace.clone(),
                version: entry.version.clone(),
                enabled,
                install_path: version_dir
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| entry.install_path.clone()),
                has_skills,
                has_mcp,
            });
        }
    }

    // Sort by name
    plugins.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(plugins)
}

/// Detect Skills within installed plugins (for import dialog)
///
/// Traverses plugin cache directory to find skills/ subdirectories
/// and parses SKILL.md for descriptions
#[tauri::command]
pub fn detect_plugin_skills(imported_plugin_skills: Vec<String>) -> Result<Vec<DetectedPluginSkill>, String> {
    let plugins_dir = get_claude_plugins_dir()?;
    let cache_dir = plugins_dir.join("cache");

    if !cache_dir.exists() {
        return Ok(Vec::new());
    }

    let enabled_plugins = read_enabled_plugins().unwrap_or_default();
    let imported_set: std::collections::HashSet<_> = imported_plugin_skills.into_iter().collect();

    let mut detected_skills = Vec::new();

    // Iterate through marketplaces
    let marketplaces = fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;

    for marketplace_entry in marketplaces.filter_map(|e| e.ok()) {
        let marketplace_path = marketplace_entry.path();
        if !marketplace_path.is_dir() {
            continue;
        }

        let marketplace_name = marketplace_entry
            .file_name()
            .to_string_lossy()
            .to_string();

        // Skip hidden directories
        if marketplace_name.starts_with('.') {
            continue;
        }

        // Iterate through plugins in this marketplace
        let plugins = match fs::read_dir(&marketplace_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        for plugin_entry in plugins.filter_map(|e| e.ok()) {
            let plugin_path = plugin_entry.path();
            if !plugin_path.is_dir() {
                continue;
            }

            let plugin_name = plugin_entry.file_name().to_string_lossy().to_string();

            // Skip hidden directories
            if plugin_name.starts_with('.') {
                continue;
            }

            // Find version directory
            let version_dir = match find_version_dir(&plugin_path) {
                Some(dir) => dir,
                None => continue,
            };

            // Read plugin.json for metadata
            let plugin_json = read_plugin_json(&version_dir);
            let display_name = plugin_json
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| plugin_name.clone());
            let version = plugin_json
                .as_ref()
                .and_then(|p| p.version.clone())
                .unwrap_or_else(|| {
                    version_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                });

            // Check skills directory
            let skills_dir = version_dir.join("skills");
            if !skills_dir.exists() || !skills_dir.is_dir() {
                continue;
            }

            // Iterate through skills
            let skills = match fs::read_dir(&skills_dir) {
                Ok(s) => s,
                Err(_) => continue,
            };

            for skill_entry in skills.filter_map(|e| e.ok()) {
                let skill_path = skill_entry.path();
                if !skill_path.is_dir() {
                    continue;
                }

                let skill_name = skill_entry.file_name().to_string_lossy().to_string();

                // Skip hidden directories
                if skill_name.starts_with('.') {
                    continue;
                }

                // Check for SKILL.md
                let skill_md_path = skill_path.join("SKILL.md");
                if !skill_md_path.exists() {
                    continue;
                }

                // Parse SKILL.md for description
                let description = fs::read_to_string(&skill_md_path)
                    .ok()
                    .and_then(|content| parse_skill_description(&content))
                    .unwrap_or_default();

                let plugin_id = format!("{}@{}", plugin_name, marketplace_name);

                // Check if this skill is from an enabled plugin
                let _is_enabled = enabled_plugins.get(&plugin_id).copied().unwrap_or(false);

                // Check if already imported (using pluginId|skillName combination for precise tracking)
                let import_key = format!("{}|{}", plugin_id, skill_name);
                let is_imported = imported_set.contains(&import_key);

                detected_skills.push(DetectedPluginSkill {
                    plugin_id: plugin_id.clone(),
                    plugin_name: display_name.clone(),
                    marketplace: marketplace_name.clone(),
                    skill_name: skill_name.clone(),
                    description,
                    path: skill_path.to_string_lossy().to_string(),
                    version: version.clone(),
                    is_imported,
                });
            }
        }
    }

    // Sort by plugin name, then skill name
    detected_skills.sort_by(|a, b| {
        a.plugin_name
            .cmp(&b.plugin_name)
            .then(a.skill_name.cmp(&b.skill_name))
    });

    Ok(detected_skills)
}

/// Detect MCPs within installed plugins (for import dialog)
///
/// Traverses plugin cache directory to find .mcp.json files
/// and parses MCP configurations
#[tauri::command]
pub fn detect_plugin_mcps(imported_plugin_mcps: Vec<String>) -> Result<Vec<DetectedPluginMcp>, String> {
    let plugins_dir = get_claude_plugins_dir()?;
    let cache_dir = plugins_dir.join("cache");

    if !cache_dir.exists() {
        return Ok(Vec::new());
    }

    let enabled_plugins = read_enabled_plugins().unwrap_or_default();
    let imported_set: std::collections::HashSet<_> = imported_plugin_mcps.into_iter().collect();

    // Build a set of MCP names that already exist on disk (from any source)
    let mcps_dir = crate::utils::get_ensemble_dir().join("mcps");
    let existing_mcp_names: std::collections::HashSet<String> = if mcps_dir.exists() {
        fs::read_dir(&mcps_dir)
            .ok()
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .filter_map(|e| {
                        let name = e.file_name().to_string_lossy().to_string();
                        name.strip_suffix(".json").map(|n| n.to_string())
                    })
                    .collect()
            })
            .unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };

    let mut detected_mcps = Vec::new();

    // Iterate through marketplaces
    let marketplaces = fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed to read cache directory: {}", e))?;

    for marketplace_entry in marketplaces.filter_map(|e| e.ok()) {
        let marketplace_path = marketplace_entry.path();
        if !marketplace_path.is_dir() {
            continue;
        }

        let marketplace_name = marketplace_entry
            .file_name()
            .to_string_lossy()
            .to_string();

        // Skip hidden directories
        if marketplace_name.starts_with('.') {
            continue;
        }

        // Iterate through plugins in this marketplace
        let plugins = match fs::read_dir(&marketplace_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        for plugin_entry in plugins.filter_map(|e| e.ok()) {
            let plugin_path = plugin_entry.path();
            if !plugin_path.is_dir() {
                continue;
            }

            let plugin_name = plugin_entry.file_name().to_string_lossy().to_string();

            // Skip hidden directories
            if plugin_name.starts_with('.') {
                continue;
            }

            // Find version directory
            let version_dir = match find_version_dir(&plugin_path) {
                Some(dir) => dir,
                None => continue,
            };

            // Read plugin.json for metadata
            let plugin_json = read_plugin_json(&version_dir);
            let display_name = plugin_json
                .as_ref()
                .map(|p| p.name.clone())
                .unwrap_or_else(|| plugin_name.clone());
            let version = plugin_json
                .as_ref()
                .and_then(|p| p.version.clone())
                .unwrap_or_else(|| {
                    version_dir
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| "unknown".to_string())
                });

            // Check for .mcp.json
            let mcp_json_path = version_dir.join(".mcp.json");
            if !mcp_json_path.exists() {
                continue;
            }

            // Parse .mcp.json
            let mcp_content = match fs::read_to_string(&mcp_json_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let mcp_file: McpJsonFile = match serde_json::from_str(&mcp_content) {
                Ok(f) => f,
                Err(_) => continue,
            };

            let plugin_id = format!("{}@{}", plugin_name, marketplace_name);

            // Check if this MCP is from an enabled plugin
            let _is_enabled = enabled_plugins.get(&plugin_id).copied().unwrap_or(false);

            // Process each MCP server in the file
            for (mcp_name, mcp_config) in mcp_file.servers {
                // Check if already imported (via plugin tracking OR same-name file on disk)
                let import_key = format!("{}|{}", plugin_id, mcp_name);
                let is_imported = imported_set.contains(&import_key)
                    || existing_mcp_names.contains(&mcp_name);

                detected_mcps.push(DetectedPluginMcp {
                    plugin_id: plugin_id.clone(),
                    plugin_name: display_name.clone(),
                    marketplace: marketplace_name.clone(),
                    mcp_name: mcp_name.clone(),
                    command: mcp_config.command,
                    args: mcp_config.args,
                    env: mcp_config.env,
                    url: mcp_config.url,
                    mcp_type: mcp_config.mcp_type,
                    path: mcp_json_path.to_string_lossy().to_string(),
                    version: version.clone(),
                    is_imported,
                });
            }
        }
    }

    // Sort by plugin name, then MCP name
    detected_mcps.sort_by(|a, b| {
        a.plugin_name
            .cmp(&b.plugin_name)
            .then(a.mcp_name.cmp(&b.mcp_name))
    });

    Ok(detected_mcps)
}

/// Import plugin Skills to Ensemble (creates symlinks, does NOT delete source)
///
/// Creates symlinks from dest_dir to the plugin skill directories. Returns
/// a `PluginImportResult` with the import keys that succeeded *and* a
/// per-item `errors` list (R2-6). Pre-fix the function returned only the
/// success list and swallowed errors to `eprintln!`, so the frontend marked
/// every selected item as imported even when some failed silently.
///
/// The function returns `Ok(...)` whenever at least bookkeeping completed
/// (the destination directory creation can still fail with `Err`); per-item
/// failures show up in `result.errors` and the modal layer is responsible
/// for surfacing them to the user.
#[tauri::command]
pub fn import_plugin_skills(
    items: Vec<PluginImportItem>,
    dest_dir: String,
) -> Result<PluginImportResult, String> {
    let dest_path = expand_tilde(&dest_dir);

    // Ensure destination directory exists
    fs::create_dir_all(&dest_path).map_err(|e| format!("Failed to create destination directory: {}", e))?;

    let mut imported_plugin_ids = Vec::new();
    let mut errors: Vec<PluginImportError> = Vec::new();

    for item in items {
        let source_path = Path::new(&item.source_path);

        if !source_path.exists() {
            errors.push(PluginImportError {
                plugin_id: item.plugin_id.clone(),
                item_name: item.item_name.clone(),
                error: format!("Source path does not exist: {}", item.source_path),
            });
            continue;
        }

        // Destination: dest_dir/{skill_name} (using item_name which is the skill name)
        let dest_skill_path = dest_path.join(&item.item_name);

        // Check if destination already exists
        if dest_skill_path.exists() || dest_skill_path.symlink_metadata().is_ok() {
            // Still track as imported since it exists (was imported before)
            // Use pluginId|skillName combination for precise tracking
            let import_key = format!("{}|{}", item.plugin_id, item.item_name);
            if !imported_plugin_ids.contains(&import_key) {
                imported_plugin_ids.push(import_key);
            }
            continue;
        }

        // Create symlink (NOT moving or copying files)
        #[cfg(unix)]
        {
            if let Err(e) = std::os::unix::fs::symlink(source_path, &dest_skill_path) {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("Failed to create symlink: {}", e),
                });
                continue;
            }
        }

        #[cfg(windows)]
        {
            if let Err(e) = std::os::windows::fs::symlink_dir(source_path, &dest_skill_path) {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("Failed to create symlink: {}", e),
                });
                continue;
            }
        }

        // Track imported skill using pluginId|skillName combination
        let import_key = format!("{}|{}", item.plugin_id, item.item_name);
        if !imported_plugin_ids.contains(&import_key) {
            imported_plugin_ids.push(import_key);
        }
    }

    // R2-6: still log to stderr for server-side debug, but no longer the
    // sole error path — the structured `errors` field is the frontend
    // signal.
    if !errors.is_empty() {
        eprintln!("[import_plugin_skills] {} item(s) failed", errors.len());
    }

    Ok(PluginImportResult {
        imported: imported_plugin_ids,
        errors,
    })
}

/// Import plugin MCPs to Ensemble (extracts MCP config, does NOT delete source)
///
/// Reads .mcp.json from plugins and creates standalone JSON files in dest_dir.
/// Returns a `PluginImportResult` with the import keys that succeeded *and*
/// a per-item `errors` list (R2-6).
#[tauri::command]
pub fn import_plugin_mcps(
    items: Vec<PluginImportItem>,
    dest_dir: String,
) -> Result<PluginImportResult, String> {
    let dest_path = expand_tilde(&dest_dir);

    // Ensure destination directory exists
    fs::create_dir_all(&dest_path).map_err(|e| format!("Failed to create destination directory: {}", e))?;

    let mut imported_plugin_ids = Vec::new();
    let mut errors: Vec<PluginImportError> = Vec::new();

    for item in items {
        let source_path = Path::new(&item.source_path);

        if !source_path.exists() {
            errors.push(PluginImportError {
                plugin_id: item.plugin_id.clone(),
                item_name: item.item_name.clone(),
                error: format!("Source path does not exist: {}", item.source_path),
            });
            continue;
        }

        // Read .mcp.json
        let mcp_content = match fs::read_to_string(source_path) {
            Ok(c) => c,
            Err(e) => {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("Failed to read .mcp.json: {}", e),
                });
                continue;
            }
        };

        let mcp_file: McpJsonFile = match serde_json::from_str(&mcp_content) {
            Ok(f) => f,
            Err(e) => {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("Failed to parse .mcp.json: {}", e),
                });
                continue;
            }
        };

        // Find the specific MCP config by name
        let mcp_config = match mcp_file.servers.get(&item.item_name) {
            Some(c) => c,
            None => {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("MCP '{}' not found in .mcp.json", item.item_name),
                });
                continue;
            }
        };

        // Destination: dest_dir/{mcp_name}.json
        let dest_mcp_path = dest_path.join(format!("{}.json", item.item_name));

        // Check if destination already exists (same-name MCP from another source)
        if dest_mcp_path.exists() {
            // Don't add to imported_plugin_ids — the detect function handles
            // this via file existence check, avoiding phantom "imported" state
            continue;
        }

        // Create standalone MCP config file with plugin source info
        let mcp_config_file = McpConfigFile {
            name: item.item_name.clone(),
            description: Some(format!(
                "Imported from plugin: {} ({})",
                item.plugin_name, item.marketplace
            )),
            command: mcp_config.command.clone(),
            args: Some(mcp_config.args.clone()),
            env: mcp_config.env.clone(),
            provided_tools: None,
            url: mcp_config.url.clone(),
            headers: None,
            mcp_type: mcp_config.mcp_type.clone(),
            install_source: Some("plugin".to_string()),
            plugin_id: Some(item.plugin_id.clone()),
            plugin_name: Some(item.plugin_name.clone()),
            marketplace: Some(item.marketplace.clone()),
            marketplace_source: None,
        };

        let json = match serde_json::to_string_pretty(&mcp_config_file) {
            Ok(j) => j,
            Err(e) => {
                errors.push(PluginImportError {
                    plugin_id: item.plugin_id.clone(),
                    item_name: item.item_name.clone(),
                    error: format!("Failed to serialize MCP config: {}", e),
                });
                continue;
            }
        };

        if let Err(e) = fs::write(&dest_mcp_path, json) {
            errors.push(PluginImportError {
                plugin_id: item.plugin_id.clone(),
                item_name: item.item_name.clone(),
                error: format!("Failed to write MCP config file: {}", e),
            });
            continue;
        }

        // Track imported MCP using pluginId|mcpName combination
        let import_key = format!("{}|{}", item.plugin_id, item.item_name);
        if !imported_plugin_ids.contains(&import_key) {
            imported_plugin_ids.push(import_key);
        }
    }

    // R2-6: still log to stderr for server-side debug, but no longer the
    // sole error path — the structured `errors` field is the frontend
    // signal.
    if !errors.is_empty() {
        eprintln!("[import_plugin_mcps] {} item(s) failed", errors.len());
    }

    Ok(PluginImportResult {
        imported: imported_plugin_ids,
        errors,
    })
}

/// Check if plugins are enabled in Claude Code settings
///
/// Returns a map of plugin_id -> enabled status
#[tauri::command]
pub fn check_plugins_enabled(plugin_ids: Vec<String>) -> Result<HashMap<String, bool>, String> {
    let enabled_plugins = read_enabled_plugins()?;

    let mut result = HashMap::new();
    for plugin_id in plugin_ids {
        let enabled = enabled_plugins.get(&plugin_id).copied().unwrap_or(false);
        result.insert(plugin_id, enabled);
    }

    Ok(result)
}

/// Read the set of installed Claude Code plugin IDs by inspecting
/// `~/.claude/plugins/installed_plugins.json`. Returns an empty set when the
/// file is missing or fails to parse — orphan cleanup degrades to a no-op,
/// which is strictly safer than silently dropping markers because we
/// couldn't see the installed list.
///
/// Shared between `detect_installed_plugins` (used to build the live plugin
/// list) and `cleanup_orphan_plugin_imports` (R2-10).
fn read_installed_plugin_ids() -> HashSet<String> {
    let plugins_dir = match get_claude_plugins_dir() {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };
    let installed_plugins_path = plugins_dir.join("installed_plugins.json");
    if !installed_plugins_path.exists() {
        return HashSet::new();
    }
    let content = match fs::read_to_string(&installed_plugins_path) {
        Ok(c) => c,
        Err(_) => return HashSet::new(),
    };
    let parsed: InstalledPluginsFile = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(_) => return HashSet::new(),
    };
    parsed.plugins.keys().cloned().collect()
}

/// Remove orphan markers from `imported_plugin_skills` / `imported_plugin_mcps`
/// pointing at plugins no longer installed (R2-10).
///
/// Background — when a user uninstalls a Claude Code plugin, the entries in
/// these two `Vec<String>` markers (each shaped `"<plugin_id>|<item_name>"`)
/// stay forever. On the *next* install of the same plugin, the
/// Import-from-Plugins dialog reports every row as "Already imported" even
/// though the `~/.ensemble/skills/<name>` symlinks went broken when the
/// plugin cache directory disappeared, leaving the user with no way to
/// re-import.
///
/// Behaviour:
/// 1. Build the live installed-plugin-id set from
///    `installed_plugins.json` (`read_installed_plugin_ids`).
/// 2. For each marker, parse out the `plugin_id` prefix (split on the first
///    `|`) and retain when it is still in the live set.
/// 3. Malformed entries (no `|`) are retained — schema-evolution defensiveness.
/// 4. Persist via `write_app_data` under `DATA_MUTEX`.
///
/// The cleanup is silent (no UI notification); the count return lets the
/// caller log at debug level.
#[tauri::command]
pub fn cleanup_orphan_plugin_imports() -> Result<PluginImportCleanupResult, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;

    let installed = read_installed_plugin_ids();

    // R2-10 conservatism: when the installed set is empty (file missing or
    // unreadable) we cannot tell apart "no plugins installed" from "we
    // failed to read the index". Treat empty as "skip cleanup" rather than
    // "every marker is an orphan" — silently nuking markers on the basis
    // of an unreadable file would punish the user for an unrelated I/O
    // hiccup. `detect_installed_plugins` returns Ok(Vec::new()) in the
    // missing-file case, so this branch is the legitimate "user has zero
    // plugins" case AND the "file unreadable" case — both should leave
    // markers untouched.
    if installed.is_empty() {
        return Ok(PluginImportCleanupResult {
            removed_skills: 0,
            removed_mcps: 0,
        });
    }

    let mut app_data = read_app_data()?;

    let before_skills = app_data.imported_plugin_skills.len();
    app_data.imported_plugin_skills.retain(|key| {
        match key.split_once('|') {
            Some((plugin_id, _)) => installed.contains(plugin_id),
            // Malformed entry (no `|` delimiter): keep — never drop a user
            // record we cannot confidently classify.
            None => true,
        }
    });
    let removed_skills = (before_skills - app_data.imported_plugin_skills.len()) as u32;

    let before_mcps = app_data.imported_plugin_mcps.len();
    app_data.imported_plugin_mcps.retain(|key| {
        match key.split_once('|') {
            Some((plugin_id, _)) => installed.contains(plugin_id),
            None => true,
        }
    });
    let removed_mcps = (before_mcps - app_data.imported_plugin_mcps.len()) as u32;

    if removed_skills + removed_mcps > 0 {
        write_app_data(app_data)?;
    }

    Ok(PluginImportCleanupResult {
        removed_skills,
        removed_mcps,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_plugin_id_standard() {
        let (name, marketplace) = parse_plugin_id("my-plugin@npm");
        assert_eq!(name, "my-plugin");
        assert_eq!(marketplace, "npm");
    }

    #[test]
    fn test_parse_plugin_id_with_at_in_name() {
        // rfind('@') should split on the last '@'
        let (name, marketplace) = parse_plugin_id("@scope/plugin@github");
        assert_eq!(name, "@scope/plugin");
        assert_eq!(marketplace, "github");
    }

    #[test]
    fn test_parse_plugin_id_no_at() {
        let (name, marketplace) = parse_plugin_id("standalone-plugin");
        assert_eq!(name, "standalone-plugin");
        assert_eq!(marketplace, "unknown");
    }

    #[test]
    fn test_truncate_to_first_sentence_short() {
        let result = truncate_to_first_sentence("A short sentence.", 200);
        assert_eq!(result, "A short sentence.");
    }

    #[test]
    fn test_truncate_to_first_sentence_multiple() {
        let result = truncate_to_first_sentence("First sentence. Second sentence. Third.", 200);
        assert_eq!(result, "First sentence.");
    }

    #[test]
    fn test_truncate_to_first_sentence_no_period() {
        let result = truncate_to_first_sentence("No period here", 200);
        assert_eq!(result, "No period here");
    }

    #[test]
    fn test_truncate_to_first_sentence_max_length() {
        let long_text = "A".repeat(300);
        let result = truncate_to_first_sentence(&long_text, 50);
        // Should be truncated to 50 chars + "..."
        assert!(result.len() <= 53 + 3); // 50 chars + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_to_first_sentence_chinese_period() {
        let result = truncate_to_first_sentence("Chinese period here\u{3002} And more.", 200);
        assert_eq!(result, "Chinese period here\u{3002}");
    }

    #[test]
    fn test_parse_skill_description_with_frontmatter() {
        let content = "---\nname: test\ndescription: This is a test skill.\n---\n# Body";
        let desc = parse_skill_description(content);
        assert_eq!(desc, Some("This is a test skill.".to_string()));
    }

    #[test]
    fn test_parse_skill_description_no_frontmatter() {
        let content = "# Heading\nFirst meaningful line.";
        let desc = parse_skill_description(content);
        assert_eq!(desc, Some("First meaningful line.".to_string()));
    }

    #[test]
    fn test_parse_skill_description_quoted() {
        let content = "---\ndescription: \"Quoted description.\"\n---\n# Body";
        let desc = parse_skill_description(content);
        assert_eq!(desc, Some("Quoted description.".to_string()));
    }
}
