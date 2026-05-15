use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    AppData, ClaudeMdFile, McpConfigFile, McpMetadata, Project, Rule, Scene, SkillMetadata,
    TrashedClaudeMd, TrashedItems, TrashedMcp, TrashedRule, TrashedSkill,
};
use crate::utils::{expand_path, get_app_data_dir, parse_skill_md};
use chrono::{DateTime, NaiveDateTime, Utc};
use regex::Regex;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

// ============================================================================
// Helper functions
// ============================================================================

/// Parse timestamp from file/directory name
/// Format: {name}_{YYYYMMDD_HHMMSS} or {name}_{YYYYMMDD_HHMMSS}.json
/// Returns (original_name, deleted_at_iso)
fn parse_timestamp_from_name(name: &str, is_json: bool) -> (String, Option<String>) {
    // Remove .json extension if present
    let name_without_ext = if is_json {
        name.strip_suffix(".json").unwrap_or(name)
    } else {
        name
    };

    // Pattern: {name}_{YYYYMMDD_HHMMSS}
    let re = Regex::new(r"^(.+)_(\d{8}_\d{6})$").unwrap();

    if let Some(caps) = re.captures(name_without_ext) {
        let original_name = caps.get(1).map(|m| m.as_str()).unwrap_or(name_without_ext);
        let timestamp_str = caps.get(2).map(|m| m.as_str()).unwrap_or("");

        // Parse timestamp: YYYYMMDD_HHMMSS
        if let Ok(naive) = NaiveDateTime::parse_from_str(timestamp_str, "%Y%m%d_%H%M%S") {
            let datetime: DateTime<Utc> = DateTime::from_naive_utc_and_offset(naive, Utc);
            let final_name = if is_json {
                format!("{}.json", original_name)
            } else {
                original_name.to_string()
            };
            return (final_name, Some(datetime.to_rfc3339()));
        }
    }

    // No timestamp found, return original name
    let final_name = if is_json && !name.ends_with(".json") {
        format!("{}.json", name_without_ext)
    } else {
        name.to_string()
    };
    (final_name, None)
}

/// Get file modification time as ISO string
fn get_file_modified_time(path: &Path) -> Option<String> {
    fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let datetime: DateTime<Utc> = t.into();
            datetime.to_rfc3339()
        })
}

/// Read skill description from SKILL.md
fn read_skill_description(skill_dir: &Path) -> String {
    let skill_md_path = skill_dir.join("SKILL.md");
    if skill_md_path.exists() {
        if let Ok(content) = fs::read_to_string(&skill_md_path) {
            let (frontmatter, _) = parse_skill_md(&content);
            return frontmatter.description.unwrap_or_default();
        }
    }
    String::new()
}

/// Read MCP description from JSON file
fn read_mcp_description(mcp_path: &Path) -> String {
    if mcp_path.exists() {
        if let Ok(content) = fs::read_to_string(mcp_path) {
            if let Ok(config) = serde_json::from_str::<McpConfigFile>(&content) {
                return config.description.unwrap_or_default();
            }
        }
    }
    String::new()
}

/// Read CLAUDE.md name from info.json
fn read_claude_md_info(claude_md_dir: &Path) -> Option<String> {
    let info_path = claude_md_dir.join("info.json");
    if info_path.exists() {
        if let Ok(content) = fs::read_to_string(&info_path) {
            if let Ok(info) = serde_json::from_str::<serde_json::Value>(&content) {
                return info.get("name").and_then(|n| n.as_str()).map(|s| s.to_string());
            }
        }
    }
    None
}

/// Read Rule info.json from a trashed rule directory. Returns the full
/// `Rule` payload when info.json deserialises cleanly; `None` otherwise.
fn read_rule_info(rule_dir: &Path) -> Option<Rule> {
    let info_path = rule_dir.join("info.json");
    if !info_path.exists() {
        return None;
    }
    let content = fs::read_to_string(&info_path).ok()?;
    serde_json::from_str::<Rule>(&content).ok()
}

/// Strip dangling category / tag references from a recovered SkillMetadata
/// snapshot. The snapshot may sit in trash for weeks or months (R5 F5) —
/// during that time the user may have deleted the category it pointed at or
/// the tags it carried. Persisting such dangling pointers leaves the restored
/// skill in a "ghost" state (category_id pointing nowhere; tags filtered out
/// of every CategoryPage view). Drop them so the restored skill behaves like
/// any orphaned legacy entry (uncategorized, no tags) and the user can
/// re-classify manually.
///
/// Note on `tags` semantics: `SkillMetadata::tags` stores tag NAMES
/// (verified at types.rs:298 — `Vec<String>`), not ids. So we filter against
/// the current set of tag *names*, not ids.
fn sanitize_skill_metadata_against_data(
    mut snap: SkillMetadata,
    data: &AppData,
) -> SkillMetadata {
    if let Some(cat_id) = snap.category_id.as_deref() {
        if !data.categories.iter().any(|c| c.id == cat_id) {
            snap.category_id = None;
        }
    }
    let valid_tag_names: HashSet<&str> = data.tags.iter().map(|t| t.name.as_str()).collect();
    snap.tags.retain(|t| valid_tag_names.contains(t.as_str()));
    snap
}

/// Mirror of `sanitize_skill_metadata_against_data` for `McpMetadata`.
fn sanitize_mcp_metadata_against_data(
    mut snap: McpMetadata,
    data: &AppData,
) -> McpMetadata {
    if let Some(cat_id) = snap.category_id.as_deref() {
        if !data.categories.iter().any(|c| c.id == cat_id) {
            snap.category_id = None;
        }
    }
    let valid_tag_names: HashSet<&str> = data.tags.iter().map(|t| t.name.as_str()).collect();
    snap.tags.retain(|t| valid_tag_names.contains(t.as_str()));
    snap
}

// ============================================================================
// Trash commands
// ============================================================================

/// List all trashed items (skills, MCPs, and CLAUDE.md files)
///
/// Scans the trash directories and returns information about deleted items.
#[tauri::command]
pub fn list_trashed_items(ensemble_dir: String) -> Result<TrashedItems, String> {
    let ensemble_path = expand_path(&ensemble_dir);

    let mut skills: Vec<TrashedSkill> = Vec::new();
    let mut mcps: Vec<TrashedMcp> = Vec::new();
    let mut claude_md_files: Vec<TrashedClaudeMd> = Vec::new();
    let mut rules: Vec<TrashedRule> = Vec::new();

    // Scan trashed skills
    let skills_trash_dir = ensemble_path.join("trash").join("skills");
    if skills_trash_dir.exists() {
        if let Ok(entries) = fs::read_dir(&skills_trash_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();

                // Skip hidden files/directories
                if entry_path.file_name()
                    .map(|n| n.to_string_lossy().starts_with('.'))
                    .unwrap_or(true)
                {
                    continue;
                }

                // Only process directories
                if !entry_path.is_dir() {
                    continue;
                }

                let dir_name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let (original_name, deleted_at) = parse_timestamp_from_name(&dir_name, false);
                let deleted_at = deleted_at
                    .or_else(|| get_file_modified_time(&entry_path))
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                let description = read_skill_description(&entry_path);

                skills.push(TrashedSkill {
                    id: dir_name.clone(),
                    name: original_name,
                    path: entry_path.to_string_lossy().to_string(),
                    deleted_at,
                    description,
                });
            }
        }
    }

    // Scan trashed MCPs
    let mcps_trash_dir = ensemble_path.join("trash").join("mcps");
    if mcps_trash_dir.exists() {
        if let Ok(entries) = fs::read_dir(&mcps_trash_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();

                // Only process .json files
                if entry_path.extension().map_or(true, |ext| ext != "json") {
                    continue;
                }

                // Skip hidden files
                if entry_path.file_name()
                    .map(|n| n.to_string_lossy().starts_with('.'))
                    .unwrap_or(true)
                {
                    continue;
                }

                let file_name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let (original_name, deleted_at) = parse_timestamp_from_name(&file_name, true);
                let deleted_at = deleted_at
                    .or_else(|| get_file_modified_time(&entry_path))
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                let description = read_mcp_description(&entry_path);

                mcps.push(TrashedMcp {
                    id: file_name.clone(),
                    name: original_name.trim_end_matches(".json").to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    deleted_at,
                    description,
                });
            }
        }
    }

    // Scan trashed CLAUDE.md files
    let claude_md_trash_dir = ensemble_path.join("trash").join("claude-md");
    if claude_md_trash_dir.exists() {
        if let Ok(entries) = fs::read_dir(&claude_md_trash_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();

                // Skip hidden files/directories
                if entry_path.file_name()
                    .map(|n| n.to_string_lossy().starts_with('.'))
                    .unwrap_or(true)
                {
                    continue;
                }

                // Only process directories
                if !entry_path.is_dir() {
                    continue;
                }

                let dir_name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let (original_id, deleted_at) = parse_timestamp_from_name(&dir_name, false);
                let deleted_at = deleted_at
                    .or_else(|| get_file_modified_time(&entry_path))
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                // Try to read name from info.json, fallback to ID
                let name = read_claude_md_info(&entry_path)
                    .unwrap_or_else(|| format!("CLAUDE.md ({})", &original_id[..8.min(original_id.len())]));

                claude_md_files.push(TrashedClaudeMd {
                    id: dir_name.clone(),
                    name,
                    path: entry_path.to_string_lossy().to_string(),
                    deleted_at,
                });
            }
        }
    }

    // Scan trashed Rules
    let rules_trash_dir = ensemble_path.join("trash").join("rules");
    if rules_trash_dir.exists() {
        if let Ok(entries) = fs::read_dir(&rules_trash_dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let entry_path = entry.path();

                if entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().starts_with('.'))
                    .unwrap_or(true)
                {
                    continue;
                }
                if !entry_path.is_dir() {
                    continue;
                }

                let dir_name = entry_path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();

                let (original_id, deleted_at) = parse_timestamp_from_name(&dir_name, false);
                let deleted_at = deleted_at
                    .or_else(|| get_file_modified_time(&entry_path))
                    .unwrap_or_else(|| Utc::now().to_rfc3339());

                // Prefer info.json (carries name + filename + description); fall
                // back to a synthesised entry inferring filename from the only
                // .md file in the directory.
                let info = read_rule_info(&entry_path);
                let (name, filename, description) = if let Some(rule) = info {
                    (rule.name, rule.filename, rule.description)
                } else {
                    // Inferred fallback: pick the first .md sibling as filename.
                    let inferred_filename = fs::read_dir(&entry_path)
                        .ok()
                        .and_then(|entries| {
                            entries
                                .filter_map(|e| e.ok())
                                .map(|e| e.file_name().to_string_lossy().to_string())
                                .find(|n| n.ends_with(".md"))
                        })
                        .unwrap_or_else(|| format!("{}.md", &original_id));
                    let inferred_name = inferred_filename
                        .strip_suffix(".md")
                        .unwrap_or(&inferred_filename)
                        .to_string();
                    (inferred_name, inferred_filename, String::new())
                };

                rules.push(TrashedRule {
                    id: dir_name.clone(),
                    name,
                    filename,
                    path: entry_path.to_string_lossy().to_string(),
                    deleted_at,
                    description,
                });
            }
        }
    }

    // A5: Scene / Project trash records live in `data.json::trashed_scenes`
    // and `trashed_projects`, not on disk. Read them under DATA_MUTEX (the
    // lock is held only for the clone — the surrounding `fs::*` work above
    // does not need it). Each Vec is sorted independently by `deleted_at`.
    let (mut scenes, mut projects) = {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let data = read_app_data()?;
        (data.trashed_scenes.clone(), data.trashed_projects.clone())
    };

    // Sort by deleted_at (newest first)
    skills.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    mcps.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    claude_md_files.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    rules.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    scenes.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    projects.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));

    Ok(TrashedItems {
        skills,
        mcps,
        claude_md_files,
        rules,
        scenes,
        projects,
    })
}

/// Restore a skill from trash.
///
/// Moves the skill directory from trash back to the skills directory and
/// — A3 / R2 F6 / R5 F5 — recovers the user's category / tags / icon /
/// usage_count from the metadata snapshot (`_ensemble_metadata.json`)
/// deposited by `delete_skill` before the move. The snapshot file is
/// consumed in-place by `consume_skill_metadata_snapshot`; it never lingers
/// in the restored skill directory.
///
/// `install_source` (and the marketplace_source triple when present) is
/// preserved as-is from the snapshot so a previously-marketplace skill keeps
/// its "From GitHub" provenance after the trash → live round trip (R2 F7).
///
/// Returns error if a skill with the same name already exists at the target.
#[tauri::command]
pub fn restore_skill(trash_path: String, ensemble_dir: String) -> Result<(), String> {
    let trash_path = expand_path(&trash_path);
    let ensemble_path = expand_path(&ensemble_dir);

    // Verify trash path exists
    if !trash_path.exists() {
        return Err(format!("Trash path not found: {}", trash_path.display()));
    }

    // Get directory name and extract original name
    let dir_name = trash_path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid trash path")?;

    let (original_name, _) = parse_timestamp_from_name(dir_name, false);

    // Check if skill with same name already exists
    let target_path = ensemble_path.join("skills").join(&original_name);
    if target_path.exists() {
        return Err("A skill with the same name already exists".to_string());
    }

    // Ensure skills directory exists
    let skills_dir = ensemble_path.join("skills");
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    // Move skill from trash to skills directory
    fs::rename(&trash_path, &target_path)
        .map_err(|e| format!("Failed to restore skill: {}", e))?;

    // A3: recover metadata snapshot if present. `consume_skill_metadata_snapshot`
    // reads + removes the snapshot file in one shot (logging parse failures
    // but not surfacing them — best effort). When no snapshot is found
    // (delete pre-dates the snapshot infra, or the file was hand-removed)
    // we skip the metadata write and the skill comes back with default
    // metadata — same fallback as today's behaviour.
    let recovered =
        crate::commands::marketplace::consume_skill_metadata_snapshot(&target_path);
    if let Some(snap) = recovered {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut app_data = read_app_data()?;
        let validated = sanitize_skill_metadata_against_data(snap, &app_data);
        let new_skill_id = target_path.to_string_lossy().to_string();
        app_data.skill_metadata.insert(new_skill_id, validated);
        write_app_data(app_data)?;
    }

    Ok(())
}

/// Restore an MCP from trash.
///
/// Moves the MCP config file from trash back to the mcps directory and —
/// A3 / R2 F6 — recovers the user's category / tags / scope / usage_count
/// from the sibling metadata snapshot (`<config>.json.metadata.json`)
/// deposited by `delete_mcp` before the move.
///
/// The MCP snapshot lives next to the `.json` (not inside a directory) so
/// the sibling must be renamed back to its target location BEFORE
/// `consume_mcp_metadata_snapshot` is called — the latter reads from the
/// live (target) path. A missing sibling is non-fatal; the restore still
/// completes and the MCP comes back with default metadata.
///
/// `install_source` (and marketplace_source when present) round-trips
/// intact from the snapshot — see `restore_skill` for the broader R2 F7
/// rationale.
#[tauri::command]
pub fn restore_mcp(trash_path: String, ensemble_dir: String) -> Result<(), String> {
    let trash_path = expand_path(&trash_path);
    let ensemble_path = expand_path(&ensemble_dir);

    // Verify trash path exists
    if !trash_path.exists() {
        return Err(format!("Trash path not found: {}", trash_path.display()));
    }

    // Get file name and extract original name
    let file_name = trash_path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid trash path")?;

    let (original_name, _) = parse_timestamp_from_name(file_name, true);

    // Check if MCP with same name already exists
    let target_path = ensemble_path.join("mcps").join(&original_name);
    if target_path.exists() {
        return Err("An MCP with the same name already exists".to_string());
    }

    // Ensure mcps directory exists
    let mcps_dir = ensemble_path.join("mcps");
    fs::create_dir_all(&mcps_dir)
        .map_err(|e| format!("Failed to create mcps directory: {}", e))?;

    // Move MCP from trash to mcps directory
    fs::rename(&trash_path, &target_path)
        .map_err(|e| format!("Failed to restore MCP: {}", e))?;

    // A3: also move the sibling metadata snapshot (if any) so it lands next
    // to the restored `.json` where `consume_mcp_metadata_snapshot` looks
    // for it. The suffix-append pattern mirrors the writer in mcps.rs
    // (the `.metadata.json` suffix is owned by marketplace.rs and is the
    // canonical form for MCP snapshots). Best-effort: a failed sibling
    // rename only loses the snapshot, never blocks the primary restore.
    let trash_sibling = {
        let mut s = trash_path.as_os_str().to_os_string();
        s.push(".metadata.json");
        std::path::PathBuf::from(s)
    };
    if trash_sibling.exists() {
        let target_sibling = {
            let mut s = target_path.as_os_str().to_os_string();
            s.push(".metadata.json");
            std::path::PathBuf::from(s)
        };
        if let Err(e) = fs::rename(&trash_sibling, &target_sibling) {
            eprintln!(
                "[trash::restore_mcp] failed to move sibling snapshot {} → {}: {}",
                trash_sibling.display(),
                target_sibling.display(),
                e
            );
        }
    }

    // A3: recover metadata snapshot if present. See `restore_skill`'s comment
    // for the broader rationale around best-effort recovery and graceful
    // degradation when no snapshot is found.
    let recovered =
        crate::commands::marketplace::consume_mcp_metadata_snapshot(&target_path);
    if let Some(snap) = recovered {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut app_data = read_app_data()?;
        let validated = sanitize_mcp_metadata_against_data(snap, &app_data);
        let new_mcp_id = target_path.to_string_lossy().to_string();
        app_data.mcp_metadata.insert(new_mcp_id, validated);
        write_app_data(app_data)?;
    }

    Ok(())
}

/// Restore a CLAUDE.md file from trash
///
/// Moves the CLAUDE.md directory from trash back to the claude-md directory
/// and restores the record in data.json.
#[tauri::command]
pub fn restore_claude_md(trash_path: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let trash_path = expand_path(&trash_path);

    // Verify trash path exists
    if !trash_path.exists() {
        return Err(format!("Trash path not found: {}", trash_path.display()));
    }

    // Get directory name and extract original ID
    let dir_name = trash_path.file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid trash path")?;

    let (original_id, _) = parse_timestamp_from_name(dir_name, false);

    // Target path in claude-md directory
    let claude_md_dir = get_app_data_dir().join("claude-md");
    let target_path = claude_md_dir.join(&original_id);

    // Check if claude-md with same ID already exists
    if target_path.exists() {
        return Err("A CLAUDE.md file with the same ID already exists".to_string());
    }

    // Ensure claude-md directory exists
    fs::create_dir_all(&claude_md_dir)
        .map_err(|e| format!("Failed to create claude-md directory: {}", e))?;

    // Move from trash to claude-md directory
    fs::rename(&trash_path, &target_path)
        .map_err(|e| format!("Failed to restore CLAUDE.md: {}", e))?;

    // Restore record in data.json
    // First, try to read info.json from the restored directory
    let info_path = target_path.join("info.json");
    let claude_md_path = target_path.join("CLAUDE.md");

    if info_path.exists() {
        // Read info.json to get the original ClaudeMdFile metadata
        let info_content = fs::read_to_string(&info_path)
            .map_err(|e| format!("Failed to read info.json: {}", e))?;

        let file_info: ClaudeMdFile = serde_json::from_str(&info_content)
            .map_err(|e| format!("Failed to parse info.json: {}", e))?;

        // Update app data
        let mut app_data = read_app_data()?;

        // Check if already exists (shouldn't happen, but be safe)
        if !app_data.claude_md_files.iter().any(|f| f.id == original_id) {
            // Create restored file entry
            let restored_file = ClaudeMdFile {
                id: original_id.clone(),
                name: file_info.name,
                description: file_info.description,
                source_path: file_info.source_path,
                source_type: file_info.source_type,
                content: String::new(), // Content is stored in independent file
                managed_path: Some(claude_md_path.to_string_lossy().to_string()),
                is_global: false, // Don't restore global status automatically
                category_id: file_info.category_id,
                tag_ids: file_info.tag_ids,
                created_at: file_info.created_at,
                updated_at: chrono::Utc::now().to_rfc3339(),
                size: file_info.size,
                icon: file_info.icon,
            };

            app_data.claude_md_files.push(restored_file);
            write_app_data(app_data)?;
        }
    } else {
        // No info.json, create a minimal record
        let mut app_data = read_app_data()?;

        if !app_data.claude_md_files.iter().any(|f| f.id == original_id) {
            // Get file size if CLAUDE.md exists
            let size = if claude_md_path.exists() {
                fs::metadata(&claude_md_path)
                    .map(|m| m.len())
                    .unwrap_or(0)
            } else {
                0
            };

            let now = chrono::Utc::now().to_rfc3339();
            let restored_file = ClaudeMdFile {
                id: original_id.clone(),
                name: "Restored CLAUDE.md".to_string(),
                description: "Restored from trash".to_string(),
                source_path: String::new(),
                source_type: crate::types::ClaudeMdType::Project,
                content: String::new(),
                managed_path: Some(claude_md_path.to_string_lossy().to_string()),
                is_global: false,
                category_id: None,
                tag_ids: vec![],
                created_at: now.clone(),
                updated_at: now,
                size,
                icon: None,
            };

            app_data.claude_md_files.push(restored_file);
            write_app_data(app_data)?;
        }
    }

    Ok(())
}

/// Restore a Rule from trash.
///
/// Moves the trashed directory back to `~/.ensemble/rules/{id}/` and restores
/// the row in `data.json` from the directory's `info.json`. The restored
/// Rule's `is_global` is always reset to `false` so trash-restore never
/// silently re-writes `~/.claude/rules/<filename>.md`.
#[tauri::command]
pub fn restore_rule(trash_path: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let trash_path = expand_path(&trash_path);

    if !trash_path.exists() {
        return Err(format!("Trash path not found: {}", trash_path.display()));
    }

    let dir_name = trash_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid trash path")?;

    let (original_id, _) = parse_timestamp_from_name(dir_name, false);

    let rules_dir = get_app_data_dir().join("rules");
    let target_path = rules_dir.join(&original_id);

    if target_path.exists() {
        return Err("A Rule with the same ID already exists".to_string());
    }

    fs::create_dir_all(&rules_dir)
        .map_err(|e| format!("Failed to create rules directory: {}", e))?;

    fs::rename(&trash_path, &target_path)
        .map_err(|e| format!("Failed to restore Rule: {}", e))?;

    // Restore record in data.json.
    let info_path = target_path.join("info.json");

    if info_path.exists() {
        let info_content = fs::read_to_string(&info_path)
            .map_err(|e| format!("Failed to read info.json: {}", e))?;

        let rule_info: Rule = serde_json::from_str(&info_content)
            .map_err(|e| format!("Failed to parse info.json: {}", e))?;

        let mut app_data = read_app_data()?;
        if !app_data.rules.iter().any(|r| r.id == original_id) {
            let rule_file_path = target_path.join(&rule_info.filename);
            let restored = Rule {
                id: original_id.clone(),
                name: rule_info.name,
                description: rule_info.description,
                filename: rule_info.filename.clone(),
                source_path: rule_info.source_path,
                content: String::new(),
                managed_path: Some(rule_file_path.to_string_lossy().to_string()),
                is_global: false,
                category_id: rule_info.category_id,
                tag_ids: rule_info.tag_ids,
                created_at: rule_info.created_at,
                updated_at: chrono::Utc::now().to_rfc3339(),
                size: rule_info.size,
                icon: rule_info.icon,
            };
            app_data.rules.push(restored);
            write_app_data(app_data)?;
        }
    } else {
        // No info.json — synthesise a minimal row by sniffing the first
        // .md file in the directory.
        let mut app_data = read_app_data()?;
        if !app_data.rules.iter().any(|r| r.id == original_id) {
            let inferred_filename = fs::read_dir(&target_path)
                .ok()
                .and_then(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .find(|n| n.ends_with(".md"))
                });

            let filename = inferred_filename.unwrap_or_else(|| format!("{}.md", &original_id));
            let rule_file_path = target_path.join(&filename);
            let size = if rule_file_path.exists() {
                fs::metadata(&rule_file_path)
                    .map(|m| m.len())
                    .unwrap_or(0)
            } else {
                0
            };

            let now = chrono::Utc::now().to_rfc3339();
            let inferred_name = filename
                .strip_suffix(".md")
                .unwrap_or(&filename)
                .to_string();

            let restored = Rule {
                id: original_id.clone(),
                name: format!("Restored {}", inferred_name),
                description: "Restored from trash".to_string(),
                filename: filename.clone(),
                source_path: String::new(),
                content: String::new(),
                managed_path: Some(rule_file_path.to_string_lossy().to_string()),
                is_global: false,
                category_id: None,
                tag_ids: vec![],
                created_at: now.clone(),
                updated_at: now,
                size,
                icon: None,
            };
            app_data.rules.push(restored);
            write_app_data(app_data)?;
        }
    }

    Ok(())
}

/// Restore a Scene from trash (A5).
///
/// Pops the matching `TrashedScene` from `data.trashed_scenes` and pushes a
/// reconstituted `Scene` into `data.scenes`. References that no longer
/// resolve against current AppData (skill_ids, mcp_ids, claude_md_ids,
/// rule_ids that point at deleted entities) are filtered out per R5 F5
/// reference-validity discipline — the user gets back the Scene's identity
/// and intent (name, description, icon, dates) plus whatever bundle members
/// still exist; missing members are silently dropped rather than carried as
/// dangling pointers.
///
/// Returns Err when no trashed Scene matches `id`, or when a Scene with the
/// same id already exists in the live list (defensive: the trashed Scene is
/// re-inserted into trash and not lost).
#[tauri::command]
pub fn restore_scene(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let index = data
        .trashed_scenes
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| format!("Trashed scene not found: {}", id))?;

    // Defensive: collision against live `scenes` (shouldn't happen since
    // delete_scene removes from `scenes` before pushing to trash; guard
    // anyway so a hand-edited data.json doesn't silently merge two rows).
    if data.scenes.iter().any(|s| s.id == data.trashed_scenes[index].id) {
        return Err("A Scene with the same ID already exists".to_string());
    }

    let trashed = data.trashed_scenes.remove(index);

    // R5 F5: filter dangling references. Build sets ONCE so the per-id
    // filter is O(1).
    let skill_id_set: HashSet<&str> =
        data.skill_metadata.keys().map(|s| s.as_str()).collect();
    let mcp_id_set: HashSet<&str> =
        data.mcp_metadata.keys().map(|s| s.as_str()).collect();
    let claude_md_id_set: HashSet<&str> =
        data.claude_md_files.iter().map(|f| f.id.as_str()).collect();
    let rule_id_set: HashSet<&str> =
        data.rules.iter().map(|r| r.id.as_str()).collect();

    let restored = Scene {
        id: trashed.id,
        name: trashed.name,
        description: trashed.description,
        icon: trashed.icon,
        skill_ids: trashed
            .skill_ids
            .into_iter()
            .filter(|s| skill_id_set.contains(s.as_str()))
            .collect(),
        mcp_ids: trashed
            .mcp_ids
            .into_iter()
            .filter(|s| mcp_id_set.contains(s.as_str()))
            .collect(),
        claude_md_ids: trashed
            .claude_md_ids
            .into_iter()
            .filter(|s| claude_md_id_set.contains(s.as_str()))
            .collect(),
        rule_ids: trashed
            .rule_ids
            .into_iter()
            .filter(|s| rule_id_set.contains(s.as_str()))
            .collect(),
        created_at: trashed.created_at,
        last_used: trashed.last_used,
    };

    data.scenes.push(restored);
    write_app_data(data)?;
    Ok(())
}

/// Restore a Project from trash (A5).
///
/// Pops the matching `TrashedProject` from `data.trashed_projects` and
/// pushes a reconstituted `Project` into `data.projects`. When the trashed
/// `scene_id` no longer points at a live Scene (the user deleted the
/// referenced Scene while the project sat in trash) the field is reset to
/// the empty string — ProjectsPage already renders that as "No scene
/// selected" so the user can re-bind explicitly.
///
/// Returns Err when no trashed Project matches `id`, or on id collision
/// against the live list.
#[tauri::command]
pub fn restore_project(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let index = data
        .trashed_projects
        .iter()
        .position(|t| t.id == id)
        .ok_or_else(|| format!("Trashed project not found: {}", id))?;

    if data
        .projects
        .iter()
        .any(|p| p.id == data.trashed_projects[index].id)
    {
        return Err("A Project with the same ID already exists".to_string());
    }

    let trashed = data.trashed_projects.remove(index);

    // R5 F5: reference validity for scene_id. Use empty string when the
    // referenced Scene is gone — ProjectsPage and syncProject already
    // handle empty scene_id gracefully (existing behaviour: shows "No
    // scene selected" / surfaces "Scene not found" error rather than
    // crashing). This is the simpler of the two options the task
    // instructions allow.
    let scene_id = if !trashed.scene_id.is_empty()
        && data.scenes.iter().any(|s| s.id == trashed.scene_id)
    {
        trashed.scene_id
    } else {
        String::new()
    };

    let restored = Project {
        id: trashed.id,
        name: trashed.name,
        path: trashed.path,
        scene_id,
        last_synced: trashed.last_synced,
    };

    data.projects.push(restored);
    write_app_data(data)?;
    Ok(())
}

/// R2-9 — kind discriminator for `delete_trashed_item_permanently`. The
/// frontend sends a stringly-typed `kind`; we centralise the parse here so
/// every match expression in this module agrees on the spelling.
fn parse_trash_kind(kind: &str) -> Result<TrashKind, String> {
    match kind {
        "skill" => Ok(TrashKind::Skill),
        "mcp" => Ok(TrashKind::Mcp),
        "claudeMd" => Ok(TrashKind::ClaudeMd),
        "rule" => Ok(TrashKind::Rule),
        "scene" => Ok(TrashKind::Scene),
        "project" => Ok(TrashKind::Project),
        other => Err(format!("Unknown trash kind: {}", other)),
    }
}

#[derive(Debug, Clone, Copy)]
enum TrashKind {
    Skill,
    Mcp,
    ClaudeMd,
    Rule,
    Scene,
    Project,
}

/// Permanently remove one trashed entry — file/dir trash kinds dispatch on
/// `trash_path_or_id` as an on-disk path, data.json-backed kinds dispatch on
/// it as the record id. Two-step confirmation lives on the frontend; this
/// IPC commits the deletion immediately on call (R2-9).
///
/// Skill / CLAUDE.md / Rule = directory in `~/.ensemble/trash/<kind>/...`
/// MCP                      = `.json` file in `~/.ensemble/trash/mcps/`
/// Scene / Project          = record in `data.json::trashed_{scenes,projects}`
///
/// Removing an entry that does not exist returns Ok(()) — idempotent, so
/// a rapid double-click in the UI does not flip into a confusing error.
/// (The frontend reloads the trashed-items list right after this call,
/// so the user-visible "row vanished" assertion still holds.)
#[tauri::command]
pub fn delete_trashed_item_permanently(
    kind: String,
    trash_path_or_id: String,
) -> Result<(), String> {
    let kind = parse_trash_kind(&kind)?;

    match kind {
        TrashKind::Skill | TrashKind::ClaudeMd | TrashKind::Rule => {
            // Directory-shaped entry
            let path = expand_path(&trash_path_or_id);
            if !path.exists() {
                return Ok(());
            }
            // Defensive: never accept a path that resolves outside the
            // `trash/` subtree. The frontend always sends a path that
            // came from a previous `list_trashed_items` response, so this
            // branch is paranoia rather than load-bearing — but a Tauri
            // command is a public API surface and we treat the arg as
            // untrusted.
            if !path.to_string_lossy().contains("/trash/") {
                return Err(format!(
                    "Refusing to permanently delete path outside trash: {}",
                    path.display()
                ));
            }
            if path.is_dir() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Failed to remove directory: {}", e))?;
            } else {
                // Unexpected (we only expect a directory here for these
                // kinds), but fall back to file removal so we don't leave
                // garbage behind.
                fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))?;
            }
            Ok(())
        }
        TrashKind::Mcp => {
            // File-shaped entry (`.json` in `trash/mcps/`)
            let path = expand_path(&trash_path_or_id);
            if !path.exists() {
                return Ok(());
            }
            if !path.to_string_lossy().contains("/trash/") {
                return Err(format!(
                    "Refusing to permanently delete path outside trash: {}",
                    path.display()
                ));
            }
            if path.is_file() {
                fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))?;
            } else if path.is_dir() {
                fs::remove_dir_all(&path)
                    .map_err(|e| format!("Failed to remove directory: {}", e))?;
            }
            Ok(())
        }
        TrashKind::Scene => {
            let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
            let mut data = read_app_data()?;
            let before = data.trashed_scenes.len();
            data.trashed_scenes.retain(|t| t.id != trash_path_or_id);
            if data.trashed_scenes.len() != before {
                write_app_data(data)?;
            }
            Ok(())
        }
        TrashKind::Project => {
            let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
            let mut data = read_app_data()?;
            let before = data.trashed_projects.len();
            data.trashed_projects.retain(|t| t.id != trash_path_or_id);
            if data.trashed_projects.len() != before {
                write_app_data(data)?;
            }
            Ok(())
        }
    }
}

/// Empty all trash storage (R2-9). Best-effort: per-item failures are
/// aggregated into the returned `Vec<String>` so the UI can surface them as
/// "Emptied N items, M errors" without losing the user's progress on the
/// items that did succeed.
///
/// Order of operations:
///   1. Acquire `DATA_MUTEX`, clear `trashed_scenes` + `trashed_projects`
///      in `data.json`, persist.
///   2. Walk `<ensemble_dir>/trash/{skills,mcps,claude-md,rules}/` and
///      remove every top-level entry.
///
/// The DATA_MUTEX is acquired ONLY for the data.json mutation; the
/// fs walks afterwards do not touch app data. Releasing the lock before
/// the fs walks keeps Empty Trash from blocking other DATA_MUTEX users
/// (e.g. concurrent metadata writes) for the full duration of the walk.
#[tauri::command]
pub fn empty_trash(ensemble_dir: String) -> Result<Vec<String>, String> {
    let mut errors: Vec<String> = Vec::new();

    // Phase 1: data.json-backed trash (scenes + projects)
    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut data = read_app_data()?;
        if !data.trashed_scenes.is_empty() || !data.trashed_projects.is_empty() {
            data.trashed_scenes.clear();
            data.trashed_projects.clear();
            if let Err(e) = write_app_data(data) {
                // If we can't persist, the user's data.json scenes/projects
                // remain — report as one aggregated error and continue with
                // disk-side cleanup so the file-shaped trash still empties.
                errors.push(format!("Failed to clear data.json trash: {}", e));
            }
        }
    }

    // Phase 2: disk-side trash dirs
    let ensemble_path = expand_path(&ensemble_dir);
    let trash_root = ensemble_path.join("trash");
    for subdir in &["skills", "mcps", "claude-md", "rules"] {
        let dir = trash_root.join(subdir);
        if !dir.exists() {
            continue;
        }
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("Failed to read {}: {}", dir.display(), e));
                continue;
            }
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();
            let display_name = entry_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| entry_path.to_string_lossy().to_string());

            let result = if entry_path.is_dir() {
                fs::remove_dir_all(&entry_path)
            } else {
                fs::remove_file(&entry_path)
            };

            if let Err(e) = result {
                errors.push(format!("Failed to remove '{}': {}", display_name, e));
            }
        }
    }

    Ok(errors)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_timestamp_from_name_with_timestamp() {
        let (name, deleted_at) = parse_timestamp_from_name("my-skill_20260115_143022", false);
        assert_eq!(name, "my-skill");
        assert!(deleted_at.is_some());
        let ts = deleted_at.unwrap();
        assert!(ts.contains("2026-01-15"));
    }

    #[test]
    fn test_parse_timestamp_from_name_json_with_timestamp() {
        let (name, deleted_at) = parse_timestamp_from_name("my-mcp_20260115_143022.json", true);
        assert_eq!(name, "my-mcp.json");
        assert!(deleted_at.is_some());
    }

    #[test]
    fn test_parse_timestamp_from_name_no_timestamp() {
        let (name, deleted_at) = parse_timestamp_from_name("my-skill", false);
        assert_eq!(name, "my-skill");
        assert!(deleted_at.is_none());
    }

    #[test]
    fn test_parse_timestamp_from_name_json_no_timestamp() {
        let (name, deleted_at) = parse_timestamp_from_name("my-mcp.json", true);
        assert_eq!(name, "my-mcp.json");
        assert!(deleted_at.is_none());
    }

    #[test]
    fn test_parse_timestamp_from_name_invalid_timestamp_format() {
        // Partial timestamp that does not match YYYYMMDD_HHMMSS
        let (name, deleted_at) = parse_timestamp_from_name("skill_20261301_999999", false);
        // The regex matches, but NaiveDateTime parsing fails, so no timestamp
        assert_eq!(name, "skill_20261301_999999");
        assert!(deleted_at.is_none());
    }

    #[test]
    fn test_parse_trash_kind_accepts_all_six() {
        // R2-9 — the IPC accepts stringly-typed kinds from the frontend.
        // Lock down the spelling so a frontend typo (e.g. "claudemd"
        // vs "claudeMd") fails loud rather than silently no-op'ing.
        assert!(matches!(parse_trash_kind("skill"), Ok(TrashKind::Skill)));
        assert!(matches!(parse_trash_kind("mcp"), Ok(TrashKind::Mcp)));
        assert!(matches!(parse_trash_kind("claudeMd"), Ok(TrashKind::ClaudeMd)));
        assert!(matches!(parse_trash_kind("rule"), Ok(TrashKind::Rule)));
        assert!(matches!(parse_trash_kind("scene"), Ok(TrashKind::Scene)));
        assert!(matches!(parse_trash_kind("project"), Ok(TrashKind::Project)));
    }

    #[test]
    fn test_parse_trash_kind_rejects_typos() {
        assert!(parse_trash_kind("claudemd").is_err());
        assert!(parse_trash_kind("Skill").is_err());
        assert!(parse_trash_kind("").is_err());
        assert!(parse_trash_kind("random").is_err());
    }
}
