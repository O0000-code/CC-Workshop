#![allow(unused_imports)]
#![allow(unused_variables)]

use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    AppData, BackupInfo, ClaudeJson, ClaudeMcpConfig, ClaudeSettings, DetectedMcp, DetectedSkill,
    ExistingConfig, ImportItem, ImportResult, ImportedCounts, McpConfigFile, McpMetadata,
    SkillMetadata,
};
use crate::utils::path::{expand_tilde, get_data_file_path};
use chrono::Utc;
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Claude JSON project config structure (for parsing ~/.claude.json projects)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeProjectConfig {
    #[serde(default)]
    mcp_servers: HashMap<String, ClaudeMcpConfig>,
    // Other fields are ignored
}

/// Root structure of ~/.claude.json (for parsing only)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeJsonRoot {
    #[serde(default)]
    mcp_servers: HashMap<String, ClaudeMcpConfig>,
    #[serde(default)]
    projects: HashMap<String, ClaudeProjectConfig>,
}

// ============================================================================
// ~/.claude.json helper functions
// ============================================================================

/// Get path to ~/.claude.json (the correct MCP configuration location)
fn get_claude_json_path() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".claude.json"))
        .ok_or_else(|| "Cannot find home directory".to_string())
}

/// Read and parse ~/.claude.json
fn read_claude_json() -> Result<ClaudeJson, String> {
    let path = get_claude_json_path()?;
    if !path.exists() {
        return Ok(ClaudeJson::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))
}

/// Write ~/.claude.json (preserves other fields via #[serde(flatten)])
fn write_claude_json(config: &ClaudeJson) -> Result<(), String> {
    let path = get_claude_json_path()?;
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write ~/.claude.json: {}", e))
}

// /// Remove specified MCPs from ~/.claude.json after successful import
// fn remove_mcps_from_claude_json(mcp_names: &[String]) -> Result<(), String> {
//     let mut claude_json = read_claude_json()?;
//
//     for name in mcp_names {
//         claude_json.mcp_servers.remove(name);
//     }
//
//     write_claude_json(&claude_json)
// }

// ============================================================================

/// Detect existing Claude Code configuration
///
/// Skills: from ~/.claude/skills/ directory (supports symlinks from npx skill)
/// MCPs: from ~/.claude.json (NOT ~/.claude/settings.json)
#[tauri::command]
pub fn detect_existing_config(claude_config_dir: String) -> Result<ExistingConfig, String> {
    let claude_dir = expand_tilde(&claude_config_dir);

    // Build a set of skill names already imported to ~/.ensemble/skills/
    // so we don't show them again in the import list
    let ensemble_skills_dir = crate::utils::get_ensemble_dir().join("skills");
    let already_imported_skills: std::collections::HashSet<String> = if ensemble_skills_dir.exists() {
        fs::read_dir(&ensemble_skills_dir)
            .ok()
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok())
                    .map(|e| e.file_name().to_string_lossy().to_string())
                    .collect()
            })
            .unwrap_or_default()
    } else {
        std::collections::HashSet::new()
    };

    // ========================================================================
    // 1. Detect Skills in ~/.claude/skills/ directory (supports symlinks)
    // ========================================================================
    let skills_dir = claude_dir.join("skills");
    let mut detected_skills = Vec::new();

    if skills_dir.exists() && skills_dir.is_dir() {
        // Use fs::read_dir to properly handle symlinks
        // WalkDir by default doesn't follow symlinks, so we handle them manually
        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();

                // Get skill name from entry
                let skill_name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();

                // Skip hidden directories
                if skill_name.starts_with('.') {
                    continue;
                }

                // Skip skills already imported to ~/.ensemble/skills/
                if already_imported_skills.contains(&skill_name) {
                    continue;
                }

                // Check if it's a symlink or directory
                let metadata = entry_path.symlink_metadata().ok();
                let is_symlink = metadata.as_ref().map_or(false, |m| m.file_type().is_symlink());

                // For symlinks, check if the target is a directory
                let is_dir = if is_symlink {
                    entry_path.is_dir() // This follows the symlink
                } else {
                    metadata.as_ref().map_or(false, |m| m.is_dir())
                };

                if !is_dir {
                    continue;
                }

                // Check for SKILL.md in the directory (follows symlink automatically)
                let skill_md_path = entry_path.join("SKILL.md");
                if !skill_md_path.exists() {
                    continue;
                }

                // Get the real path (resolve symlink if needed)
                let real_path = if is_symlink {
                    fs::read_link(&entry_path)
                        .map(|target| {
                            // Handle relative symlinks (e.g., ../../.agents/skills/xxx)
                            if target.is_relative() {
                                entry_path
                                    .parent()
                                    .map(|p| p.join(&target))
                                    .and_then(|p| fs::canonicalize(&p).ok())
                                    .unwrap_or(target)
                            } else {
                                target
                            }
                        })
                        .unwrap_or_else(|_| entry_path.clone())
                        .to_string_lossy()
                        .to_string()
                } else {
                    entry_path.to_string_lossy().to_string()
                };

                // Read and parse SKILL.md to extract description
                let description = fs::read_to_string(&skill_md_path)
                    .ok()
                    .and_then(|content| parse_skill_description(&content));

                detected_skills.push(DetectedSkill {
                    name: skill_name,
                    path: real_path,
                    description,
                });
            }
        }
    }

    // ========================================================================
    // 1b. Also detect Skills in ~/.agents/skills/ directory
    //     This is where `npx skill` installs skills. Deduplicate by name.
    // ========================================================================
    if let Some(home_dir_path) = dirs::home_dir() {
        let agents_skills_dir = home_dir_path.join(".agents").join("skills");
        if agents_skills_dir.exists() && agents_skills_dir.is_dir() {
            // Collect existing skill names to avoid duplicates
            let existing_names: std::collections::HashSet<String> =
                detected_skills.iter().map(|s| s.name.clone()).collect();

            if let Ok(entries) = fs::read_dir(&agents_skills_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let entry_path = entry.path();

                    let skill_name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // Skip hidden directories, already-detected skills, and already-imported skills
                    if skill_name.starts_with('.')
                        || existing_names.contains(&skill_name)
                        || already_imported_skills.contains(&skill_name)
                    {
                        continue;
                    }

                    if !entry_path.is_dir() {
                        continue;
                    }

                    let skill_md_path = entry_path.join("SKILL.md");
                    if !skill_md_path.exists() {
                        continue;
                    }

                    let real_path = fs::canonicalize(&entry_path)
                        .unwrap_or_else(|_| entry_path.clone())
                        .to_string_lossy()
                        .to_string();

                    let description = fs::read_to_string(&skill_md_path)
                        .ok()
                        .and_then(|content| parse_skill_description(&content));

                    detected_skills.push(DetectedSkill {
                        name: skill_name,
                        path: real_path,
                        description,
                    });
                }
            }
        }
    }

    // 2. Detect MCPs from ~/.claude.json (NOT ~/.claude/settings.json)
    // MCP configuration is stored in ~/.claude.json, not ~/.claude/settings.json
    let mut detected_mcps = Vec::new();

    // Get home directory and construct path to ~/.claude.json
    if let Some(home_dir) = dirs::home_dir() {
        let claude_json_path = home_dir.join(".claude.json");

        if claude_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&claude_json_path) {
                if let Ok(claude_json) = serde_json::from_str::<ClaudeJsonRoot>(&content) {
                    // 2a. User scope MCPs (top-level mcpServers)
                    for (name, config) in claude_json.mcp_servers {
                        detected_mcps.push(DetectedMcp {
                            name,
                            command: config.command.clone(),
                            args: config.args.unwrap_or_default(),
                            env: config.env,
                            scope: Some("user".to_string()),
                            project_path: None,
                            url: config.url.clone(),
                            mcp_type: config.mcp_type.clone(),
                        });
                    }

                    // 2b. Local scope MCPs (projects[path].mcpServers)
                    for (project_path, project_config) in claude_json.projects {
                        for (name, config) in project_config.mcp_servers {
                            detected_mcps.push(DetectedMcp {
                                name,
                                command: config.command.clone(),
                                args: config.args.unwrap_or_default(),
                                env: config.env,
                                scope: Some("local".to_string()),
                                project_path: Some(project_path.clone()),
                                url: config.url.clone(),
                                mcp_type: config.mcp_type.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Also check ~/.claude/settings.json for backward compatibility
    let settings_path = claude_dir.join("settings.json");
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(settings) = serde_json::from_str::<ClaudeSettings>(&content) {
                for (name, config) in settings.mcp_servers {
                    // Only add if not already detected with same name AND scope (avoid duplicates)
                    if !detected_mcps.iter().any(|m| m.name == name && m.scope.as_deref() == Some("user")) {
                        detected_mcps.push(DetectedMcp {
                            name,
                            command: config.command.clone(),
                            args: config.args.unwrap_or_default(),
                            env: config.env,
                            scope: Some("user".to_string()),
                            project_path: None,
                            url: config.url.clone(),
                            mcp_type: config.mcp_type.clone(),
                        });
                    }
                }
            }
        }
    }

    let has_config = !detected_skills.is_empty() || !detected_mcps.is_empty();

    Ok(ExistingConfig {
        skills: detected_skills,
        mcps: detected_mcps,
        has_config,
    })
}

/// Parse SKILL.md content to extract description
fn parse_skill_description(content: &str) -> Option<String> {
    // Try to find description in frontmatter or first paragraph
    let lines: Vec<&str> = content.lines().collect();

    // Skip the title line (usually starts with #)
    for line in lines.iter() {
        let trimmed = line.trim();
        // Skip empty lines, headers, and frontmatter markers
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed == "---" {
            continue;
        }
        // Return first non-empty, non-header line as description
        if !trimmed.is_empty() {
            // Truncate if too long
            let desc = if trimmed.len() > 200 {
                format!("{}...", &trimmed[..200])
            } else {
                trimmed.to_string()
            };
            return Some(desc);
        }
    }
    None
}

/// Backup ~/.claude.json before import
///
/// Creates a timestamped backup of the claude.json file in the ensemble backups directory
#[tauri::command]
pub fn backup_claude_json(ensemble_dir: String) -> Result<BackupInfo, String> {
    let ensemble_path = expand_tilde(&ensemble_dir);

    // Get home directory
    let home_dir = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_json_path = home_dir.join(".claude.json");

    if !claude_json_path.exists() {
        return Err("~/.claude.json does not exist".to_string());
    }

    // Create backup directory with timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir = ensemble_path.join("backups").join(&timestamp);
    fs::create_dir_all(&backup_dir)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Copy claude.json to backup directory
    let backup_file = backup_dir.join("claude.json");
    fs::copy(&claude_json_path, &backup_file)
        .map_err(|e| format!("Failed to backup claude.json: {}", e))?;

    // Count MCPs in the backed up file
    let mut mcp_count = 0u32;
    if let Ok(content) = fs::read_to_string(&claude_json_path) {
        if let Ok(claude_json) = serde_json::from_str::<ClaudeJsonRoot>(&content) {
            // Count user scope MCPs
            mcp_count += claude_json.mcp_servers.len() as u32;
            // Count local scope MCPs from all projects
            for project_config in claude_json.projects.values() {
                mcp_count += project_config.mcp_servers.len() as u32;
            }
        }
    }

    // Create backup info
    let backup_info = BackupInfo {
        path: backup_dir.to_string_lossy().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        items_count: ImportedCounts {
            skills: 0,
            mcps: mcp_count,
        },
    };

    // Write backup-info.json
    let info_path = backup_dir.join("backup-info.json");
    let info_json = serde_json::to_string_pretty(&backup_info)
        .map_err(|e| format!("Failed to serialize backup info: {}", e))?;
    fs::write(&info_path, info_json)
        .map_err(|e| format!("Failed to write backup-info.json: {}", e))?;

    Ok(backup_info)
}

/// Backup existing configuration before import
#[tauri::command]
pub fn backup_before_import(
    ensemble_dir: String,
    claude_config_dir: String,
) -> Result<BackupInfo, String> {
    let ensemble_path = expand_tilde(&ensemble_dir);
    let claude_path = expand_tilde(&claude_config_dir);

    // 1. Create backup directory with timestamp
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir = ensemble_path.join("backups").join(&timestamp);
    fs::create_dir_all(&backup_dir).map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let mut skill_count = 0u32;
    let mut mcp_count = 0u32;

    // 2. Backup settings.json
    let settings_path = claude_path.join("settings.json");
    if settings_path.exists() {
        let dest = backup_dir.join("claude-settings.json");
        fs::copy(&settings_path, &dest)
            .map_err(|e| format!("Failed to backup settings.json: {}", e))?;

        // Count MCPs in settings.json
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(settings) = serde_json::from_str::<ClaudeSettings>(&content) {
                mcp_count = settings.mcp_servers.len() as u32;
            }
        }
    }

    // 3. Backup skills directory
    let skills_dir = claude_path.join("skills");
    let backup_skills_dir = backup_dir.join("claude-skills");

    if skills_dir.exists() && skills_dir.is_dir() {
        fs::create_dir_all(&backup_skills_dir)
            .map_err(|e| format!("Failed to create skills backup directory: {}", e))?;

        // Iterate through skills directory and copy contents
        for entry in WalkDir::new(&skills_dir)
            .min_depth(1)
            .max_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let src_path = entry.path();
            let skill_name = src_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let dest_skill_dir = backup_skills_dir.join(&skill_name);

            // If source is a symlink, copy the actual content (not the symlink)
            let actual_src = if src_path.symlink_metadata().map_or(false, |m| m.file_type().is_symlink()) {
                fs::read_link(src_path).unwrap_or_else(|_| src_path.to_path_buf())
            } else {
                src_path.to_path_buf()
            };

            if actual_src.is_dir() {
                // Recursively copy the directory
                copy_dir_recursive(&actual_src, &dest_skill_dir)
                    .map_err(|e| format!("Failed to backup skill '{}': {}", skill_name, e))?;
                skill_count += 1;
            }
        }
    }

    // 4. Create backup-info.json
    let backup_info = BackupInfo {
        path: backup_dir.to_string_lossy().to_string(),
        timestamp: Utc::now().to_rfc3339(),
        items_count: ImportedCounts {
            skills: skill_count,
            mcps: mcp_count,
        },
    };

    let info_path = backup_dir.join("backup-info.json");
    let info_json =
        serde_json::to_string_pretty(&backup_info).map_err(|e| format!("Failed to serialize backup info: {}", e))?;
    fs::write(&info_path, info_json).map_err(|e| format!("Failed to write backup-info.json: {}", e))?;

    Ok(backup_info)
}

/// Recursively copy a directory
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

/// Import existing configuration (non-destructive copy)
///
/// This function copies skills to ~/.ensemble/skills/ and extracts MCP configs
/// to ~/.ensemble/mcps/. It does NOT modify the original ~/.claude directory.
#[tauri::command]
pub fn import_existing_config(
    claude_config_dir: String,
    ensemble_dir: String,
    items: Vec<ImportItem>,
) -> Result<ImportResult, String> {
    let claude_path = expand_tilde(&claude_config_dir);
    let ensemble_path = expand_tilde(&ensemble_dir);

    // Ensure destination directories exist
    let skills_dest = ensemble_path.join("skills");
    let mcps_dest = ensemble_path.join("mcps");
    fs::create_dir_all(&skills_dest)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;
    fs::create_dir_all(&mcps_dest)
        .map_err(|e| format!("Failed to create mcps directory: {}", e))?;

    let mut imported_skills = 0u32;
    let mut imported_mcps = 0u32;
    let mut errors = Vec::new();

    for item in items {
        match item.item_type.as_str() {
            "skill" => {
                // Copy Skill directory
                match copy_skill(&item, &skills_dest) {
                    Ok(_) => imported_skills += 1,
                    Err(e) => errors.push(format!("Failed to import skill '{}': {}", item.name, e)),
                }
            }
            "mcp" => {
                // Extract MCP configuration from claude settings.json
                match extract_mcp_config(&item, &claude_path, &mcps_dest) {
                    Ok(_) => imported_mcps += 1,
                    Err(e) => errors.push(format!("Failed to import MCP '{}': {}", item.name, e)),
                }
            }
            _ => {
                errors.push(format!("Unknown item type: {}", item.item_type));
            }
        }
    }

    Ok(ImportResult {
        success: errors.is_empty(),
        imported: ImportedCounts {
            skills: imported_skills,
            mcps: imported_mcps,
        },
        errors,
        backup_path: String::new(), // Backup is done separately by backup_before_import
    })
}

/// Import a skill to the ensemble skills directory
///
/// Strategy B: Create symlinks instead of copying files
/// - If source is from ~/.agents/skills/ (npx skill installed), create symlink
/// - Otherwise, copy the files
fn copy_skill(item: &ImportItem, dest_dir: &Path) -> Result<(), String> {
    let source = Path::new(&item.source_path);

    // Resolve the source path (handle symlinks)
    let is_source_symlink = source
        .symlink_metadata()
        .map_or(false, |m| m.file_type().is_symlink());

    let real_source = if is_source_symlink {
        let target = fs::read_link(source).map_err(|e| format!("Failed to read symlink: {}", e))?;
        // Handle relative symlinks
        if target.is_relative() {
            source
                .parent()
                .map(|p| p.join(&target))
                .and_then(|p| fs::canonicalize(&p).ok())
                .unwrap_or(target)
        } else {
            fs::canonicalize(&target).unwrap_or(target)
        }
    } else {
        fs::canonicalize(source).unwrap_or_else(|_| source.to_path_buf())
    };

    // Check if source exists
    if !real_source.exists() {
        return Err(format!(
            "Source path does not exist: {}",
            real_source.display()
        ));
    }

    // Destination directory for this skill
    let skill_dest = dest_dir.join(&item.name);

    // Check if destination already exists (including broken symlinks)
    if skill_dest.exists() || skill_dest.symlink_metadata().is_ok() {
        return Err(format!(
            "Skill '{}' already exists in destination",
            item.name
        ));
    }

    // Determine if we should create a symlink (Strategy B)
    // Create symlink if the source is in ~/.agents/skills/
    let agents_skills_dir = dirs::home_dir()
        .map(|h| h.join(".agents").join("skills"))
        .ok_or("Cannot find home directory")?;

    let should_symlink = real_source.starts_with(&agents_skills_dir);

    if should_symlink {
        // Strategy B: Create symlink pointing to ~/.agents/skills/<name>
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real_source, &skill_dest)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;

        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&real_source, &skill_dest)
            .map_err(|e| format!("Failed to create symlink: {}", e))?;
    } else {
        // Fallback: Copy the files for skills not from ~/.agents/skills/
        copy_dir_recursive(&real_source, &skill_dest)
            .map_err(|e| format!("Failed to copy skill directory: {}", e))?;
    }

    Ok(())
}

/// Extract MCP configuration and save as standalone JSON file
///
/// This reads the MCP config from ~/.claude.json (primary) or ~/.claude/settings.json
/// (fallback) and creates a standalone JSON file in ~/.ensemble/mcps/<name>.json
fn extract_mcp_config(
    item: &ImportItem,
    claude_path: &Path,
    dest_dir: &Path,
) -> Result<(), String> {
    // Check if destination already exists
    let dest_path = dest_dir.join(format!("{}.json", item.name));
    if dest_path.exists() {
        return Err(format!(
            "MCP config '{}' already exists in destination",
            item.name
        ));
    }

    // Try to read from ~/.claude.json first (primary source)
    if let Ok(claude_json_path) = get_claude_json_path() {
        if claude_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&claude_json_path) {
                if let Ok(claude_json) = serde_json::from_str::<ClaudeJsonRoot>(&content) {
                    // Search in user-scope mcpServers
                    if let Some(mcp_config) = claude_json.mcp_servers.get(&item.name) {
                        let mcp_file = McpConfigFile {
                            name: item.name.clone(),
                            description: Some("Imported from Claude Code".to_string()),
                            command: mcp_config.command.clone(),
                            args: mcp_config.args.clone(),
                            env: mcp_config.env.clone(),
                            provided_tools: None,
                            url: mcp_config.url.clone(),
                            headers: mcp_config.headers.clone(),
                            mcp_type: mcp_config.mcp_type.clone(),
                            install_source: Some("local".to_string()),
                            plugin_id: None,
                            plugin_name: None,
                            marketplace: None,
                            marketplace_source: None,
                        };

                        let json = serde_json::to_string_pretty(&mcp_file)
                            .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;
                        fs::write(&dest_path, json)
                            .map_err(|e| format!("Failed to write MCP config file: {}", e))?;
                        return Ok(());
                    }

                    // Search in project-scope mcpServers
                    for (_project_path, project_config) in &claude_json.projects {
                        if let Some(mcp_config) = project_config.mcp_servers.get(&item.name) {
                            let mcp_file = McpConfigFile {
                                name: item.name.clone(),
                                description: Some("Imported from Claude Code".to_string()),
                                command: mcp_config.command.clone(),
                                args: mcp_config.args.clone(),
                                env: mcp_config.env.clone(),
                                provided_tools: None,
                                url: mcp_config.url.clone(),
                                headers: mcp_config.headers.clone(),
                                mcp_type: mcp_config.mcp_type.clone(),
                                install_source: Some("local".to_string()),
                                plugin_id: None,
                                plugin_name: None,
                                marketplace: None,
                                marketplace_source: None,
                            };

                            let json = serde_json::to_string_pretty(&mcp_file)
                                .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;
                            fs::write(&dest_path, json)
                                .map_err(|e| format!("Failed to write MCP config file: {}", e))?;
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    // Fallback: try reading from ~/.claude/settings.json (backward compatibility)
    let settings_path = claude_path.join("settings.json");
    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings.json: {}", e))?;
        let settings: ClaudeSettings =
            serde_json::from_str(&content).map_err(|e| format!("Failed to parse settings.json: {}", e))?;

        if let Some(mcp_config) = settings.mcp_servers.get(&item.name) {
            let mcp_file = McpConfigFile {
                name: item.name.clone(),
                description: Some("Imported from Claude Code".to_string()),
                command: mcp_config.command.clone(),
                args: mcp_config.args.clone(),
                env: mcp_config.env.clone(),
                provided_tools: None,
                url: mcp_config.url.clone(),
                headers: mcp_config.headers.clone(),
                mcp_type: mcp_config.mcp_type.clone(),
                install_source: Some("local".to_string()),
                plugin_id: None,
                plugin_name: None,
                marketplace: None,
                marketplace_source: None,
            };

            let json = serde_json::to_string_pretty(&mcp_file)
                .map_err(|e| format!("Failed to serialize MCP config: {}", e))?;
            fs::write(&dest_path, json)
                .map_err(|e| format!("Failed to write MCP config file: {}", e))?;
            return Ok(());
        }
    }

    Err(format!(
        "MCP '{}' not found in ~/.claude.json or settings.json",
        item.name
    ))
}

/// Update Skill scope and sync to corresponding location
#[tauri::command]
pub fn update_skill_scope(
    skill_id: String,
    scope: String,
    ensemble_dir: String,
    claude_config_dir: String,
) -> Result<(), String> {
    let ensemble_path = expand_tilde(&ensemble_dir);
    let claude_path = expand_tilde(&claude_config_dir);

    // Extract skill name from skill_id (skill_id is the full path)
    let skill_path = Path::new(&skill_id);
    let skill_name = skill_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid skill ID")?;

    // Source path (in ensemble directory)
    let source_skill_path = ensemble_path.join("skills").join(skill_name);
    if !source_skill_path.exists() {
        return Err(format!("Skill not found: {}", skill_name));
    }

    // Target path (in claude directory)
    let claude_skills_dir = claude_path.join("skills");
    let target_skill_path = claude_skills_dir.join(skill_name);

    match scope.as_str() {
        "global" => {
            // Create symlink in ~/.claude/skills/ pointing to ~/.ensemble/skills/<name>
            fs::create_dir_all(&claude_skills_dir).map_err(|e| e.to_string())?;

            // If target exists (could be old symlink or directory), handle accordingly
            if target_skill_path.exists() || target_skill_path.symlink_metadata().is_ok() {
                if target_skill_path
                    .symlink_metadata()
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false)
                {
                    // It's a symlink, remove it
                    fs::remove_file(&target_skill_path).map_err(|e| e.to_string())?;
                } else if target_skill_path.is_dir() {
                    // It's a real directory, don't delete it - report warning
                    return Err(format!(
                        "Target path {} exists and is not a symlink",
                        target_skill_path.display()
                    ));
                }
            }

            // Create symlink
            #[cfg(unix)]
            std::os::unix::fs::symlink(&source_skill_path, &target_skill_path)
                .map_err(|e| e.to_string())?;

            #[cfg(windows)]
            std::os::windows::fs::symlink_dir(&source_skill_path, &target_skill_path)
                .map_err(|e| e.to_string())?;
        }
        "project" => {
            // If ~/.claude/skills/<name> is a symlink, remove it
            if target_skill_path.symlink_metadata().is_ok()
                && target_skill_path
                    .symlink_metadata()
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false)
            {
                fs::remove_file(&target_skill_path).map_err(|e| e.to_string())?;
            }
            // If it's not a symlink but exists, don't process (might be user manually placed)
        }
        _ => {
            return Err(format!("Invalid scope: {}", scope));
        }
    }

    // Scope is derived at scan time from `<claude_config_dir>/skills/<name>`
    // existence (see `mcps.rs` / `skills.rs` `derive_*_scope`), so we no
    // longer mirror it into `SkillMetadata.scope`. The metadata field
    // remains in `data.json` for backward compat but is not read.
    Ok(())
}

/// Update MCP scope and sync to ~/.claude.json
///
/// - global: Add MCP to ~/.claude.json mcpServers (User scope)
/// - project: Remove MCP from ~/.claude.json mcpServers
#[tauri::command]
pub fn update_mcp_scope(
    mcp_id: String,
    scope: String,
    ensemble_dir: String,
    _claude_config_dir: String, // Not used anymore, kept for API compatibility
) -> Result<(), String> {
    let ensemble_path = expand_tilde(&ensemble_dir);

    // Extract MCP name from mcp_id (mcp_id is the full path, e.g., ~/.ensemble/mcps/postgres.json)
    let mcp_path = Path::new(&mcp_id);
    let mcp_filename = mcp_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid MCP ID")?;
    let mcp_name = mcp_filename.trim_end_matches(".json");

    // Read MCP configuration from Ensemble
    let mcp_config_path = ensemble_path.join("mcps").join(mcp_filename);
    if !mcp_config_path.exists() {
        return Err(format!("MCP config not found: {}", mcp_name));
    }

    let mcp_content = fs::read_to_string(&mcp_config_path).map_err(|e| e.to_string())?;
    let mcp_config: McpConfigFile =
        serde_json::from_str(&mcp_content).map_err(|e| e.to_string())?;

    // ========================================================================
    // Read and modify ~/.claude.json (the correct MCP configuration location)
    // ========================================================================
    let mut claude_json = read_claude_json()?;

    match scope.as_str() {
        "global" => {
            // Add to ~/.claude.json mcpServers (User scope = global)
            let claude_mcp_config = ClaudeMcpConfig {
                command: mcp_config.command.clone(),
                args: mcp_config.args.clone(),
                env: mcp_config.env.clone(),
                url: mcp_config.url.clone(),
                headers: mcp_config.headers.clone(),
                mcp_type: mcp_config.mcp_type.clone(),
            };
            claude_json
                .mcp_servers
                .insert(mcp_name.to_string(), claude_mcp_config);
        }
        "project" => {
            // Remove from ~/.claude.json mcpServers
            claude_json.mcp_servers.remove(mcp_name);
        }
        _ => {
            return Err(format!("Invalid scope: {}", scope));
        }
    }

    // Write back ~/.claude.json
    write_claude_json(&claude_json)?;

    // Scope is derived at scan time from `~/.claude.json::mcpServers`
    // membership (see `mcps.rs::derive_mcp_scope`), so we no longer mirror
    // it into `McpMetadata.scope`. The metadata field remains in
    // `data.json` for backward compat but is not read.
    Ok(())
}

/// Install Finder Quick Action
#[tauri::command]
pub fn install_quick_action() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let services_dir = home.join("Library/Services");

    // Ensure Services directory exists
    fs::create_dir_all(&services_dir).map_err(|e| e.to_string())?;

    let workflow_path = services_dir.join("Open with Ensemble.workflow");
    let contents_dir = workflow_path.join("Contents");

    // Remove existing workflow if present
    if workflow_path.exists() {
        fs::remove_dir_all(&workflow_path).map_err(|e| e.to_string())?;
    }

    // Create workflow directory structure
    fs::create_dir_all(&contents_dir).map_err(|e| e.to_string())?;

    // Create Info.plist with NSServices configuration (required for Finder right-click menu)
    let info_plist = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSServices</key>
    <array>
        <dict>
            <key>NSMenuItem</key>
            <dict>
                <key>default</key>
                <string>Open with Ensemble</string>
            </dict>
            <key>NSMessage</key>
            <string>runWorkflowAsService</string>
            <key>NSSendFileTypes</key>
            <array>
                <string>public.folder</string>
            </array>
        </dict>
    </array>
</dict>
</plist>"#;

    fs::write(contents_dir.join("Info.plist"), info_plist).map_err(|e| e.to_string())?;

    // Create document.wflow (Automator Quick Action workflow)
    // Complete workflow with proper metadata for Finder integration
    let document_wflow = r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>AMApplicationBuild</key>
	<string>523</string>
	<key>AMApplicationVersion</key>
	<string>2.10</string>
	<key>AMDocumentVersion</key>
	<string>2</string>
	<key>actions</key>
	<array>
		<dict>
			<key>action</key>
			<dict>
				<key>AMAccepts</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Optional</key>
					<true/>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>AMActionVersion</key>
				<string>2.0.3</string>
				<key>AMApplication</key>
				<array>
					<string>Automator</string>
				</array>
				<key>AMBundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>AMCategory</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>AMIconName</key>
				<string>RunShellScript</string>
				<key>AMName</key>
				<string>Run Shell Script</string>
				<key>AMParameterProperties</key>
				<dict>
					<key>COMMAND_STRING</key>
					<dict/>
					<key>CheckedForUserDefaultShell</key>
					<dict/>
					<key>inputMethod</key>
					<dict/>
					<key>shell</key>
					<dict/>
					<key>source</key>
					<dict/>
				</dict>
				<key>AMProvides</key>
				<dict>
					<key>Container</key>
					<string>List</string>
					<key>Types</key>
					<array>
						<string>com.apple.cocoa.string</string>
					</array>
				</dict>
				<key>ActionBundlePath</key>
				<string>/System/Library/Automator/Run Shell Script.action</string>
				<key>ActionName</key>
				<string>Run Shell Script</string>
				<key>ActionParameters</key>
				<dict>
					<key>COMMAND_STRING</key>
					<string>for f in "$@"
do
    "/Applications/Ensemble.app/Contents/MacOS/Ensemble" --launch "$f"
done</string>
					<key>CheckedForUserDefaultShell</key>
					<true/>
					<key>inputMethod</key>
					<integer>1</integer>
					<key>shell</key>
					<string>/bin/zsh</string>
					<key>source</key>
					<string></string>
				</dict>
				<key>BundleIdentifier</key>
				<string>com.apple.RunShellScript</string>
				<key>CFBundleVersion</key>
				<string>2.0.3</string>
				<key>CanShowSelectedItemsWhenRun</key>
				<false/>
				<key>CanShowWhenRun</key>
				<true/>
				<key>Category</key>
				<array>
					<string>AMCategoryUtilities</string>
				</array>
				<key>Class Name</key>
				<string>RunShellScriptAction</string>
				<key>InputUUID</key>
				<string>A6D90117-7F9E-4E1A-8B5B-2B8A5B5C5D5E</string>
				<key>Keywords</key>
				<array>
					<string>Shell</string>
					<string>Script</string>
					<string>Command</string>
					<string>Run</string>
					<string>Unix</string>
				</array>
				<key>OutputUUID</key>
				<string>B7E90228-8F9E-4E2B-9C6C-3C9B6C6D6E6F</string>
				<key>UUID</key>
				<string>C8F90339-9F9E-4F3C-AD7D-4DAC7D7E7F70</string>
				<key>UnlocalizedApplications</key>
				<array>
					<string>Automator</string>
				</array>
				<key>arguments</key>
				<dict>
					<key>0</key>
					<dict>
						<key>default value</key>
						<integer>0</integer>
						<key>name</key>
						<string>inputMethod</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>0</string>
					</dict>
					<key>1</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>source</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>1</string>
					</dict>
					<key>2</key>
					<dict>
						<key>default value</key>
						<false/>
						<key>name</key>
						<string>CheckedForUserDefaultShell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>2</string>
					</dict>
					<key>3</key>
					<dict>
						<key>default value</key>
						<string></string>
						<key>name</key>
						<string>COMMAND_STRING</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>3</string>
					</dict>
					<key>4</key>
					<dict>
						<key>default value</key>
						<string>/bin/zsh</string>
						<key>name</key>
						<string>shell</string>
						<key>required</key>
						<string>0</string>
						<key>type</key>
						<string>0</string>
						<key>uuid</key>
						<string>4</string>
					</dict>
				</dict>
				<key>isViewVisible</key>
				<integer>1</integer>
				<key>location</key>
				<string>451.000000:253.000000</string>
				<key>nibPath</key>
				<string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/Base.lproj/main.nib</string>
			</dict>
			<key>isViewVisible</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>connectors</key>
	<dict/>
	<key>workflowMetaData</key>
	<dict>
		<key>applicationBundleIDsByPath</key>
		<dict/>
		<key>applicationPaths</key>
		<array/>
		<key>inputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject.folder</string>
		<key>outputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>presentationMode</key>
		<integer>15</integer>
		<key>processesInput</key>
		<integer>0</integer>
		<key>serviceInputTypeIdentifier</key>
		<string>com.apple.Automator.fileSystemObject.folder</string>
		<key>serviceOutputTypeIdentifier</key>
		<string>com.apple.Automator.nothing</string>
		<key>serviceProcessesInput</key>
		<integer>0</integer>
		<key>systemImageName</key>
		<string>NSTouchBarFolderTemplate</string>
		<key>useAutomaticInputType</key>
		<integer>0</integer>
		<key>workflowTypeIdentifier</key>
		<string>com.apple.Automator.servicesMenu</string>
	</dict>
</dict>
</plist>"#;

    fs::write(contents_dir.join("document.wflow"), document_wflow).map_err(|e| e.to_string())?;

    // Refresh services cache
    std::process::Command::new("/System/Library/CoreServices/pbs")
        .arg("-update")
        .output()
        .ok();

    Ok(format!("Quick Action installed at: {}", workflow_path.display()))
}

/// Get launch arguments passed to the application
#[tauri::command]
pub fn get_launch_args() -> Vec<String> {
    std::env::args().collect()
}

fn applescript_quote(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

fn warp_new_tab_uri(folder_path: &str) -> String {
    format!(
        "warp://action/new_tab?path={}",
        urlencoding::encode(folder_path)
    )
}

fn build_warp_run_command_applescript(claude_command: &str) -> String {
    let quoted_command = applescript_quote(claude_command);
    format!(
        r#"tell application "Warp"
    activate
end tell
delay 0.8
set previousClipboard to missing value
try
    set previousClipboard to the clipboard
end try
set the clipboard to {quoted_command}
delay 0.1
tell application "System Events"
    keystroke "v" using command down
    key code 36
end tell
delay 0.1
if previousClipboard is not missing value then
    set the clipboard to previousClipboard
end if"#
    )
}

fn shell_command_that_keeps_ghostty_open(claude_command: &str) -> String {
    format!("shell:{claude_command}; exec /bin/zsh")
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn folder_launch_command(folder_path: &str, claude_command: &str) -> String {
    format!("cd {} && {}", shell_quote(folder_path), claude_command)
}

fn build_ghostty_launch_applescript(
    folder_path: &str,
    claude_command: &str,
    open_mode: &str,
) -> String {
    let quoted_path = applescript_quote(folder_path);
    let quoted_command = applescript_quote(&shell_command_that_keeps_ghostty_open(claude_command));

    if open_mode == "tab" {
        format!(
            r#"tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to {quoted_path}
    set command of cfg to {quoted_command}
    if (count of windows) is 0 then
        set win to new window with configuration cfg
        set term to focused terminal of selected tab of win
    else
        set win to front window
        set newTab to new tab in win with configuration cfg
        set term to focused terminal of newTab
    end if
    focus term
end tell"#
        )
    } else {
        format!(
            r#"tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to {quoted_path}
    set command of cfg to {quoted_command}
    set win to new window with configuration cfg
    set term to focused terminal of selected tab of win
    focus term
end tell"#
        )
    }
}

fn build_ghostty_keyboard_automation_applescript(
    folder_path: &str,
    claude_command: &str,
    open_mode: &str,
) -> String {
    let quoted_command = applescript_quote(&folder_launch_command(folder_path, claude_command));
    let shortcut_key = if open_mode == "tab" { "t" } else { "n" };

    format!(
        r#"tell application "System Events"
    set ghosttyWasRunning to exists application process "Ghostty"
end tell
tell application "Ghostty"
    activate
end tell
delay 0.5
if ghosttyWasRunning then
    tell application "System Events"
        keystroke "{shortcut_key}" using command down
    end tell
    delay 0.5
end if
set previousClipboard to missing value
try
    set previousClipboard to the clipboard
end try
set the clipboard to {quoted_command}
delay 0.1
tell application "System Events"
    keystroke "v" using command down
    key code 36
end tell
delay 0.1
if previousClipboard is not missing value then
    set the clipboard to previousClipboard
end if"#
    )
}

fn run_ghostty_applescript(applescript: &str, open_mode: &str) -> Result<(), String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(applescript)
        .output()
        .map_err(|e| format!("Failed to launch Ghostty: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if open_mode == "tab" {
        return Err(format!(
            "Failed to launch Ghostty in New Tab mode. Ghostty New Tab requires Ghostty 1.3.0 or newer with macOS Automation permission for Ensemble. {stderr}"
        ));
    }

    Err(format!("Failed to launch Ghostty with AppleScript: {stderr}"))
}

fn run_ghostty_keyboard_automation(applescript: &str) -> Result<(), String> {
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(applescript)
        .output()
        .map_err(|e| format!("Failed to launch Ghostty: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("not allowed assistive access")
        || stderr.contains("assistive devices")
        || stderr.contains("System Events got an error")
    {
        return Err("ACCESSIBILITY_PERMISSION_REQUIRED".to_string());
    }

    Err(format!("Failed to launch Ghostty: {stderr}"))
}

fn installed_ghostty_version() -> Option<String> {
    let output = std::process::Command::new("/usr/libexec/PlistBuddy")
        .arg("-c")
        .arg("Print :CFBundleShortVersionString")
        .arg("/Applications/Ghostty.app/Contents/Info.plist")
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!version.is_empty()).then_some(version)
}

fn ghostty_version_tuple(version: &str) -> Option<(u64, u64, u64)> {
    let mut parts = version.split('.').map(|part| {
        part.chars()
            .take_while(|c| c.is_ascii_digit())
            .collect::<String>()
    });

    let major = parts.next()?.parse().ok()?;
    let minor = parts
        .next()
        .filter(|part| !part.is_empty())
        .map(|part| part.parse().ok())
        .unwrap_or(Some(0))?;
    let patch = parts
        .next()
        .filter(|part| !part.is_empty())
        .map(|part| part.parse().ok())
        .unwrap_or(Some(0))?;

    Some((major, minor, patch))
}

fn ghostty_supports_native_applescript(version: &str) -> bool {
    ghostty_version_tuple(version)
        .map(|version| version >= (1, 3, 0))
        .unwrap_or(false)
}

/// Launch Claude Code for a folder
///
/// Uses native CLI methods for each terminal to avoid keystroke simulation
/// which can be affected by input method state.
#[tauri::command]
pub async fn launch_claude_for_folder(
    folder_path: String,
    terminal_app: String,
    claude_command: String,
    warp_open_mode: String,
) -> Result<(), String> {
    let folder = expand_tilde(&folder_path);

    if !folder.exists() {
        return Err(format!("Folder does not exist: {}", folder_path));
    }

    let folder_path_str = folder.display().to_string();

    match terminal_app.as_str() {
        "iTerm" => {
            // Use iTerm2's native AppleScript command execution (no keystroke).
            //
            // Audit 2026-05-15 (R4 D1 / master P0-4): the previous escape only
            // replaced `\\` and `"` for AppleScript literal safety, but the
            // **inner** string was still interpreted by zsh. Double-quoted shell
            // strings still expand `$(...)`, backticks, and `${VAR}` — so a
            // folder named `Demo $(say hacked)` would execute arbitrary code.
            //
            // Fix: build the shell command via `folder_launch_command`, which
            // single-quotes the folder path through `shell_quote` (POSIX
            // `'...'` does not expand metachars). The resulting shell string
            // is then wrapped once with `applescript_quote` for the outer
            // AppleScript literal. `claude_command` flows through unmodified
            // because it is user-configured Settings input that legitimately
            // contains spaces (e.g. `claude --model opus`); shell-quoting it
            // wholesale would collapse it into a single token. Same trust
            // boundary already used by the Ghostty path
            // (`build_ghostty_keyboard_automation_applescript`, line ~1310).
            let inner = folder_launch_command(&folder_path_str, &claude_command);
            let quoted = applescript_quote(&inner);
            let applescript = format!(
                r#"tell application "iTerm2"
    activate
    create window with default profile command {}
end tell"#,
                quoted
            );

            std::process::Command::new("osascript")
                .arg("-e")
                .arg(&applescript)
                .spawn()
                .map_err(|e| format!("Failed to launch iTerm2: {}", e))?;
        }
        "Warp" => {
            if warp_open_mode == "tab" {
                // Warp's URI scheme supports opening a tab at a path, but not running
                // a command in that tab. Paste the configured command after the tab opens.
                std::process::Command::new("open")
                    .arg(warp_new_tab_uri(&folder_path_str))
                    .spawn()
                    .map_err(|e| format!("Failed to launch Warp: {}", e))?;

                let applescript = build_warp_run_command_applescript(&claude_command);
                let output = std::process::Command::new("osascript")
                    .arg("-e")
                    .arg(&applescript)
                    .output()
                    .map_err(|e| format!("Failed to run Warp automation: {}", e))?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    if stderr.contains("not allowed assistive access")
                        || stderr.contains("assistive devices")
                        || stderr.contains("System Events got an error")
                    {
                        return Err("ACCESSIBILITY_PERMISSION_REQUIRED".to_string());
                    }
                    return Err(format!("Failed to run command in Warp tab: {stderr}"));
                }
            } else {
                // New Window mode: Use Launch Configuration (original working code)
                use std::time::{SystemTime, UNIX_EPOCH};

                // Generate unique filename based on timestamp
                let timestamp = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0);
                let config_name = format!("ensemble-launch-{}", timestamp);

                // Get Warp launch configurations directory
                let home = dirs::home_dir().ok_or("Cannot find home directory")?;
                let warp_config_dir = home.join(".warp").join("launch_configurations");

                // Ensure directory exists
                fs::create_dir_all(&warp_config_dir)
                    .map_err(|e| format!("Failed to create Warp config directory: {}", e))?;

                let config_path = warp_config_dir.join(format!("{}.yaml", config_name));

                // Create YAML content with proper formatting and quoting
                // Note: cwd must be an absolute path, properly quoted
                let yaml_content = format!(
                    r#"name: {}
windows:
  - tabs:
      - title: Claude Code
        layout:
          cwd: "{}"
          commands:
            - exec: "{}"
"#,
                    config_name,
                    folder_path_str.replace('"', "\\\""),
                    claude_command.replace('"', "\\\"")
                );

                fs::write(&config_path, &yaml_content)
                    .map_err(|e| format!("Failed to create Warp launch config: {}", e))?;

                // Launch via URI scheme using config name (NOT file path)
                std::process::Command::new("open")
                    .arg(format!("warp://launch/{}", config_name))
                    .spawn()
                    .map_err(|e| format!("Failed to launch Warp: {}", e))?;

                // Spawn background thread to clean up config file after a delay
                let config_path_clone = config_path.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    let _ = fs::remove_file(config_path_clone);
                });
            }
        }
        "Alacritty" => {
            // Alacritty uses CLI arguments directly (no AppleScript needed)
            // Use zsh -c with trailing zsh to keep terminal open after command
            let shell_command = format!("{}; zsh", claude_command);

            std::process::Command::new("alacritty")
                .arg("--working-directory")
                .arg(&folder_path_str)
                .arg("-e")
                .arg("zsh")
                .arg("-c")
                .arg(&shell_command)
                .spawn()
                .map_err(|e| format!("Failed to launch Alacritty: {}", e))?;
        }
        "Ghostty" => {
            // Ghostty 1.3+ exposes native AppleScript support for creating windows,
            // tabs, and per-surface launch configuration. Older builds do not expose
            // that dictionary on macOS, so use the already-running app and its normal
            // keyboard shortcuts to preserve the user's Ghostty profile and Dock icon.
            let ghostty_version = installed_ghostty_version();
            let supports_native_applescript = ghostty_version
                .as_deref()
                .map(ghostty_supports_native_applescript)
                .unwrap_or(true);

            if !supports_native_applescript {
                let applescript = build_ghostty_keyboard_automation_applescript(
                    &folder_path_str,
                    &claude_command,
                    &warp_open_mode,
                );
                run_ghostty_keyboard_automation(&applescript)?;
                return Ok(());
            }

            let applescript =
                build_ghostty_launch_applescript(&folder_path_str, &claude_command, &warp_open_mode);

            if let Err(native_error) = run_ghostty_applescript(&applescript, &warp_open_mode) {
                let fallback_applescript = build_ghostty_keyboard_automation_applescript(
                    &folder_path_str,
                    &claude_command,
                    &warp_open_mode,
                );
                run_ghostty_keyboard_automation(&fallback_applescript)
                    .map_err(|fallback_error| format!("{native_error}. Fallback failed: {fallback_error}"))?;
            }
        }
        _ => {
            // Default to Terminal.app using native 'do script' command (no keystroke).
            //
            // Audit 2026-05-15 (R4 D1 / master P0-4): same shell-injection issue
            // as the iTerm branch above — the old AppleScript-only escape did
            // not protect against zsh `$()` / backtick / `${VAR}` expansion of
            // the inner command. See the iTerm branch for the full rationale.
            let inner = folder_launch_command(&folder_path_str, &claude_command);
            let quoted = applescript_quote(&inner);
            let applescript = format!(
                r#"tell application "Terminal"
    activate
    do script {}
end tell"#,
                quoted
            );

            std::process::Command::new("osascript")
                .arg("-e")
                .arg(&applescript)
                .spawn()
                .map_err(|e| format!("Failed to launch Terminal: {}", e))?;
        }
    }

    Ok(())
}

/// Open System Settings to Accessibility page
#[tauri::command]
pub fn open_accessibility_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn()
        .map_err(|e| format!("Failed to open System Settings: {}", e))?;
    Ok(())
}

/// Remove imported skills from source directory (~/.claude/skills/)
///
/// After successfully importing skills to ~/.ensemble/skills/, this function
/// removes the original symlinks/directories from ~/.claude/skills/
#[tauri::command]
pub fn remove_imported_skills(
    claude_config_dir: String,
    skill_names: Vec<String>,
) -> Result<u32, String> {
    let claude_path = expand_tilde(&claude_config_dir);
    let skills_dir = claude_path.join("skills");

    if !skills_dir.exists() {
        return Ok(0);
    }

    let mut removed_count = 0u32;

    for name in skill_names {
        let skill_path = skills_dir.join(&name);

        if skill_path.exists() || skill_path.symlink_metadata().is_ok() {
            // Check if it's a symlink
            if skill_path.symlink_metadata().map_or(false, |m| m.file_type().is_symlink()) {
                // Remove symlink
                fs::remove_file(&skill_path)
                    .map_err(|e| format!("Failed to remove symlink '{}': {}", name, e))?;
            } else if skill_path.is_dir() {
                // Remove directory
                fs::remove_dir_all(&skill_path)
                    .map_err(|e| format!("Failed to remove directory '{}': {}", name, e))?;
            }
            removed_count += 1;
        }
    }

    Ok(removed_count)
}

/// Remove imported MCPs from ~/.claude.json
///
/// After successfully importing MCPs to ~/.ensemble/mcps/, this function
/// removes the original entries from ~/.claude.json mcpServers
#[tauri::command]
pub fn remove_imported_mcps(mcp_names: Vec<String>) -> Result<u32, String> {
    let home_dir = dirs::home_dir().ok_or("Cannot find home directory")?;
    let claude_json_path = home_dir.join(".claude.json");

    if !claude_json_path.exists() {
        return Ok(0);
    }

    // Read existing config
    let content = fs::read_to_string(&claude_json_path)
        .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;

    let mut claude_json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))?;

    let mut removed_count = 0u32;

    // Remove from top-level mcpServers (User scope)
    if let Some(mcp_servers) = claude_json.get_mut("mcpServers") {
        if let Some(obj) = mcp_servers.as_object_mut() {
            for name in &mcp_names {
                if obj.remove(name).is_some() {
                    removed_count += 1;
                }
            }
        }
    }

    // Write back
    let json = serde_json::to_string_pretty(&claude_json)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&claude_json_path, json)
        .map_err(|e| format!("Failed to write ~/.claude.json: {}", e))?;

    Ok(removed_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applescript_quote_escapes_quotes_and_backslashes() {
        assert_eq!(
            applescript_quote(r#"/Users/bo/Project "Alpha"\beta"#),
            r#""/Users/bo/Project \"Alpha\"\\beta""#
        );
    }

    #[test]
    fn warp_new_tab_uri_encodes_folder_path() {
        assert_eq!(
            warp_new_tab_uri("/Users/bo/Documents/LaboratoryProject/AI Teacher/2026.4.29"),
            "warp://action/new_tab?path=%2FUsers%2Fbo%2FDocuments%2FLaboratoryProject%2FAI%20Teacher%2F2026.4.29"
        );
    }

    #[test]
    fn warp_run_command_applescript_pastes_and_runs_command() {
        let script = build_warp_run_command_applescript("claude --dangerously-skip-permissions");

        assert!(script.contains("tell application \"Warp\""));
        assert!(script.contains("set the clipboard to \"claude --dangerously-skip-permissions\""));
        assert!(script.contains("keystroke \"v\" using command down"));
        assert!(script.contains("key code 36"));
    }

    #[test]
    fn warp_run_command_applescript_escapes_quotes_and_backslashes() {
        let script = build_warp_run_command_applescript("claude \"quoted\" \\ path");

        assert!(script.contains("set the clipboard to \"claude \\\"quoted\\\" \\\\ path\""));
    }

    #[test]
    fn ghostty_window_applescript_uses_surface_configuration() {
        let script =
            build_ghostty_launch_applescript(r#"/Users/bo/My "Project""#, "claude --resume", "window");

        assert!(script.contains(r#"tell application "Ghostty""#));
        assert!(script.contains("set cfg to new surface configuration"));
        assert!(script.contains(r#"set initial working directory of cfg to "/Users/bo/My \"Project\"""#));
        assert!(script.contains(r#"set command of cfg to "shell:claude --resume; exec /bin/zsh""#));
        assert!(script.contains("set win to new window with configuration cfg"));
        assert!(!script.contains("new tab in win"));
    }

    #[test]
    fn ghostty_tab_applescript_opens_tab_when_window_exists() {
        let script = build_ghostty_launch_applescript("/tmp/project", "claude", "tab");

        assert!(script.contains("if (count of windows) is 0 then"));
        assert!(script.contains("set win to new window with configuration cfg"));
        assert!(script.contains("set newTab to new tab in win with configuration cfg"));
        assert!(script.contains("set term to focused terminal of newTab"));
        assert!(script.contains("focus term"));
    }

    #[test]
    fn ghostty_command_keeps_shell_open_after_launch_command_exits() {
        assert_eq!(
            shell_command_that_keeps_ghostty_open("claude"),
            "shell:claude; exec /bin/zsh"
        );
    }

    #[test]
    fn ghostty_applescript_support_starts_at_1_3_0() {
        assert!(!ghostty_supports_native_applescript("1.2.3"));
        assert!(ghostty_supports_native_applescript("1.3.0"));
        assert!(ghostty_supports_native_applescript("1.3.1"));
        assert!(ghostty_supports_native_applescript("2.0.0"));
    }

    #[test]
    fn ghostty_keyboard_automation_uses_existing_app_shortcuts() {
        let script =
            build_ghostty_keyboard_automation_applescript("/Users/bo/My Project", "claude", "window");

        assert!(script.contains("set ghosttyWasRunning to exists application process \"Ghostty\""));
        assert!(script.contains("keystroke \"n\" using command down"));
        assert!(script.contains("set the clipboard to \"cd '/Users/bo/My Project' && claude\""));
        assert!(script.contains("key code 36"));
    }
}
