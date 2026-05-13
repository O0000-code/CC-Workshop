use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    ClaudeMdConflictResolution, Rule, RuleDistributionOptions, RuleDistributionResult,
    RuleImportOptions, RuleImportResult, RuleScanItem, RuleScanResult, SetGlobalRuleResult,
};
use crate::utils::{expand_path, get_app_data_dir};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;
use uuid::Uuid;
use walkdir::WalkDir;

// ============================================================================
// Constants
// ============================================================================

/// Global backup directory (~/.ensemble/rules/global-backup/)
fn get_rule_global_backup_dir() -> PathBuf {
    get_app_data_dir().join("rules").join("global-backup")
}

// ============================================================================
// Helper functions for independent file storage
// ============================================================================

/// Get Rule storage root directory (~/.ensemble/rules/)
fn get_rule_storage_dir() -> PathBuf {
    get_app_data_dir().join("rules")
}

/// Get directory for a specific Rule file (~/.ensemble/rules/{id}/)
fn get_rule_file_dir(id: &str) -> PathBuf {
    get_rule_storage_dir().join(id)
}

/// Get path to the Rule file (~/.ensemble/rules/{id}/<filename>.md)
fn get_rule_file_path(id: &str, filename: &str) -> PathBuf {
    get_rule_file_dir(id).join(filename)
}

/// Read Rule file content from independent file
fn read_rule_content(id: &str, filename: &str) -> Result<String, String> {
    let path = get_rule_file_path(id, filename);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read Rule content: {}", e))
}

/// Write Rule content to independent file
fn write_rule_content(id: &str, filename: &str, content: &str) -> Result<(), String> {
    let dir = get_rule_file_dir(id);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let path = dir.join(filename);
    fs::write(&path, content).map_err(|e| format!("Failed to write content: {}", e))
}

/// Excluded directory names (mirrors `claude_md.rs::EXCLUDED_DIRS`).
const EXCLUDED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "build",
    "dist",
    ".cache",
    "__pycache__",
    ".venv",
    "venv",
    ".idea",
    ".vscode",
];

/// Max scan depth.
const MAX_SCAN_DEPTH: usize = 10;

/// Preview character count.
const PREVIEW_LENGTH: usize = 500;

// ============================================================================
// Scan commands
// ============================================================================

/// Scan system for Rule files under `.claude/rules/`.
///
/// # Arguments
/// * `scan_paths` - Paths to scan (optional; treated as project roots whose
///   `<root>/.claude/rules/` subtree is walked).
/// * `include_home` - Whether to include the default project home directories.
///
/// # Returns
/// * `RuleScanResult` - Scan result.
#[tauri::command]
pub fn scan_rules(
    scan_paths: Option<Vec<String>>,
    include_home: Option<bool>,
) -> Result<RuleScanResult, String> {
    let start = Instant::now();
    let mut items: Vec<RuleScanItem> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut scanned_dirs: u32 = 0;

    // Read imported file list (for `is_imported` flag).
    let app_data = read_app_data().unwrap_or_default();
    let imported_paths: Vec<String> = app_data
        .rules
        .iter()
        .map(|r| r.source_path.clone())
        .collect();

    // 1. User-level: ~/.claude/rules/ (recursive)
    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let user_rules_dir = home.join(".claude").join("rules");
    if user_rules_dir.exists() && user_rules_dir.is_dir() {
        match scan_rules_in_dir(&user_rules_dir, "user", &imported_paths, &app_data, &mut scanned_dirs)
        {
            Ok(mut found) => items.append(&mut found),
            Err(e) => errors.push(format!("{}: {}", user_rules_dir.display(), e)),
        }
    }

    // 2. Custom project roots (if provided)
    let mut project_roots: Vec<PathBuf> = Vec::new();
    if let Some(custom_paths) = scan_paths {
        for path_str in custom_paths {
            let path = expand_path(&path_str);
            if path.exists() && path.is_dir() {
                project_roots.push(path);
            }
        }
    }

    // 3. Default project home directories (Documents, Projects, ...)
    if include_home.unwrap_or(true) {
        let default_dirs = vec![
            home.join("Documents"),
            home.join("Projects"),
            home.join("Developer"),
            home.join("Code"),
            home.join("Workspace"),
            home.join("repos"),
        ];
        for dir in default_dirs {
            if dir.exists() && dir.is_dir() {
                project_roots.push(dir);
            }
        }
    }

    // Walk each project root looking for `<...>/.claude/rules/*.md`.
    for base_path in project_roots {
        match scan_project_root(&base_path, &imported_paths, &app_data, &mut scanned_dirs) {
            Ok(mut found_items) => items.append(&mut found_items),
            Err(e) => errors.push(format!("{}: {}", base_path.display(), e)),
        }
    }

    // Deduplicate (based on path)
    items.sort_by(|a, b| a.path.cmp(&b.path));
    items.dedup_by(|a, b| a.path == b.path);

    let duration = start.elapsed().as_millis() as u64;

    Ok(RuleScanResult {
        items,
        scanned_dirs,
        duration,
        errors,
    })
}

/// Walk a project home directory looking for nested `.claude/rules/` folders.
fn scan_project_root(
    base_path: &Path,
    imported_paths: &[String],
    app_data: &crate::types::AppData,
    scanned_dirs: &mut u32,
) -> Result<Vec<RuleScanItem>, String> {
    let mut items: Vec<RuleScanItem> = Vec::new();

    for entry in WalkDir::new(base_path)
        .max_depth(MAX_SCAN_DEPTH)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| !is_excluded_dir(e))
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().is_dir() {
            *scanned_dirs += 1;
        } else {
            continue;
        }

        // We only act when we find a `.claude/rules` directory.
        if entry.file_name() != "rules" {
            continue;
        }
        let parent_is_claude = entry
            .path()
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n == ".claude")
            .unwrap_or(false);
        if !parent_is_claude {
            continue;
        }

        // Found a `<project>/.claude/rules/` directory — scan it.
        match scan_rules_in_dir(
            entry.path(),
            "project",
            imported_paths,
            app_data,
            scanned_dirs,
        ) {
            Ok(mut found) => items.append(&mut found),
            Err(_) => continue,
        }
    }

    Ok(items)
}

/// Recursively scan a single `.claude/rules/` directory for `*.md` files.
fn scan_rules_in_dir(
    rules_dir: &Path,
    source_scope: &str,
    imported_paths: &[String],
    app_data: &crate::types::AppData,
    scanned_dirs: &mut u32,
) -> Result<Vec<RuleScanItem>, String> {
    let mut items: Vec<RuleScanItem> = Vec::new();

    for entry in WalkDir::new(rules_dir)
        .max_depth(MAX_SCAN_DEPTH)
        .follow_links(false)
        .into_iter()
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        if entry.file_type().is_dir() {
            *scanned_dirs += 1;
            continue;
        }

        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        if !file_name.ends_with(".md") {
            continue;
        }

        if let Some(item) = scan_single_rule_file(path, source_scope, imported_paths, app_data) {
            items.push(item);
        }
    }

    Ok(items)
}

/// Build a single `RuleScanItem` from a `.md` file.
fn scan_single_rule_file(
    path: &Path,
    source_scope: &str,
    imported_paths: &[String],
    app_data: &crate::types::AppData,
) -> Option<RuleScanItem> {
    let path_str = path.to_string_lossy().to_string();

    let metadata = path.metadata().ok()?;
    let size = metadata.len();
    let modified_at = metadata
        .modified()
        .ok()
        .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_default();

    let is_imported = imported_paths.contains(&path_str);
    let imported_id = if is_imported {
        app_data
            .rules
            .iter()
            .find(|r| r.source_path == path_str)
            .map(|r| r.id.clone())
    } else {
        None
    };

    // Read preview content (UTF-8 safe).
    let preview = fs::read_to_string(path).ok().map(|content| {
        if content.chars().count() > PREVIEW_LENGTH {
            let byte_index = content
                .char_indices()
                .nth(PREVIEW_LENGTH)
                .map(|(idx, _)| idx)
                .unwrap_or(content.len());
            format!("{}...", &content[..byte_index])
        } else {
            content
        }
    });

    // Infer project name (only for "project" scope; user-scope rules live at
    // `~/.claude/rules/`, which has no meaningful project ancestor).
    let project_name = if source_scope == "project" {
        // Walk up: rules_dir / .claude / <project> / ...
        path.ancestors()
            .find(|p| {
                p.parent()
                    .and_then(|pp| pp.file_name())
                    .map(|n| n == ".claude")
                    .unwrap_or(false)
            })
            .and_then(|p| p.parent())
            .and_then(|p| p.parent())
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .map(|s| s.to_string())
    } else {
        None
    };

    Some(RuleScanItem {
        path: path_str,
        size,
        modified_at,
        is_imported,
        imported_id,
        preview,
        project_name,
        source_scope: source_scope.to_string(),
    })
}

/// Check if directory should be excluded.
fn is_excluded_dir(entry: &walkdir::DirEntry) -> bool {
    entry.file_type().is_dir()
        && entry
            .file_name()
            .to_str()
            .map(|name| EXCLUDED_DIRS.contains(&name) || (name.starts_with('.') && name != ".claude"))
            .unwrap_or(false)
}

// ============================================================================
// Import commands
// ============================================================================

/// Import a Rule file into Ensemble management.
#[tauri::command]
pub fn import_rule(options: RuleImportOptions) -> Result<RuleImportResult, String> {
    let source_path = expand_path(&options.source_path);

    if !source_path.exists() {
        return Ok(RuleImportResult {
            success: false,
            file: None,
            error: Some(format!("Source file not found: {}", source_path.display())),
        });
    }

    // Filename is the source's filename, immutable thereafter.
    let filename = source_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Invalid source filename: {}", source_path.display()))?
        .to_string();

    // Read content.
    let content =
        fs::read_to_string(&source_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let size = source_path.metadata().map(|m| m.len()).unwrap_or(0);

    let name = options
        .name
        .unwrap_or_else(|| infer_name_from_filename(&filename));

    let id = Uuid::new_v4().to_string();

    // Persist content to independent file.
    write_rule_content(&id, &filename, &content)?;
    let managed_path = get_rule_file_path(&id, &filename)
        .to_string_lossy()
        .to_string();

    let now = Utc::now().to_rfc3339();
    let mut rule = Rule {
        id,
        name,
        description: options.description.unwrap_or_default(),
        filename,
        source_path: source_path.to_string_lossy().to_string(),
        content: String::new(),
        managed_path: Some(managed_path),
        is_global: false,
        category_id: options.category_id,
        tag_ids: options.tag_ids,
        created_at: now.clone(),
        updated_at: now,
        size,
        icon: None,
    };

    // Append to AppData.
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;
    app_data.rules.push(rule.clone());
    write_app_data(app_data)?;

    rule.content = content;
    Ok(RuleImportResult {
        success: true,
        file: Some(rule),
        error: None,
    })
}

/// Derive a default display name from a filename, e.g.
/// `validate-no-public-api-claim.md` → `validate-no-public-api-claim`.
fn infer_name_from_filename(filename: &str) -> String {
    filename
        .strip_suffix(".md")
        .unwrap_or(filename)
        .to_string()
}

// ============================================================================
// Read commands
// ============================================================================

/// Read a Rule by ID, including its content.
#[tauri::command]
pub fn read_rule(id: String) -> Result<Rule, String> {
    let app_data = read_app_data()?;

    let mut rule = app_data
        .rules
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Rule not found: {}", id))?;

    if rule.managed_path.is_some() {
        rule.content = read_rule_content(&rule.id, &rule.filename)?;
    }

    Ok(rule)
}

/// Get all Rules (with content populated from independent files).
#[tauri::command]
pub fn get_rules() -> Result<Vec<Rule>, String> {
    let app_data = read_app_data()?;

    let rules: Vec<Rule> = app_data
        .rules
        .into_iter()
        .map(|mut rule| {
            if rule.managed_path.is_some() {
                if let Ok(content) = read_rule_content(&rule.id, &rule.filename) {
                    rule.content = content;
                }
            }
            rule
        })
        .collect();

    Ok(rules)
}

// ============================================================================
// Update / Delete commands
// ============================================================================

/// Update Rule metadata and/or content. Note: `filename` is NOT updatable
/// even if a caller mistakenly passes one — Claude Code indexes Rules by
/// filename, so changing the name would break global / project deployment.
#[tauri::command]
pub fn update_rule(
    id: String,
    content: Option<String>,
    name: Option<String>,
    description: Option<String>,
    category_id: Option<String>,
    tag_ids: Option<Vec<String>>,
    icon: Option<String>,
) -> Result<Rule, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    // Borrow once to read filename, then drop and re-borrow mutably below.
    let (filename, is_global) = {
        let rule = app_data
            .rules
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| format!("Rule not found: {}", id))?;
        (rule.filename.clone(), rule.is_global)
    };

    let mut updated_content: Option<String> = None;

    if let Some(c) = content {
        write_rule_content(&id, &filename, &c)?;
        // If currently global, mirror the updated content into
        // `~/.claude/rules/<filename>.md` so the live rule reflects the edit.
        if is_global {
            let home = dirs::home_dir().ok_or("Cannot get home directory")?;
            let global_dir = home.join(".claude").join("rules");
            fs::create_dir_all(&global_dir).map_err(|e| e.to_string())?;
            let global_path = global_dir.join(&filename);
            fs::write(&global_path, &c).map_err(|e| e.to_string())?;
        }
        updated_content = Some(c);
    }

    let rule = app_data
        .rules
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Rule not found: {}", id))?;

    if let Some(c_ref) = updated_content.as_ref() {
        rule.size = c_ref.len() as u64;
        if rule.managed_path.is_none() {
            rule.managed_path =
                Some(get_rule_file_path(&id, &filename).to_string_lossy().to_string());
        }
    }

    if let Some(n) = name {
        rule.name = n;
    }
    if let Some(d) = description {
        rule.description = d;
    }
    if let Some(cid) = category_id {
        rule.category_id = Some(cid);
    }
    if let Some(tids) = tag_ids {
        rule.tag_ids = tids;
    }
    if let Some(i) = icon {
        rule.icon = Some(i);
    }

    rule.updated_at = Utc::now().to_rfc3339();

    let mut updated_rule = rule.clone();
    write_app_data(app_data)?;

    if let Some(c) = updated_content {
        updated_rule.content = c;
    } else if updated_rule.managed_path.is_some() {
        if let Ok(c) = read_rule_content(&updated_rule.id, &updated_rule.filename) {
            updated_rule.content = c;
        }
    }

    Ok(updated_rule)
}

/// Delete a Rule (soft delete — moves to trash). If the rule was global,
/// also remove the corresponding `~/.claude/rules/<filename>.md` since
/// Rule deletion implies the user no longer wants that named rule live.
/// This differs from CLAUDE.md deletion (which conservatively keeps
/// `~/.claude/CLAUDE.md` because that is the user's single magic file).
#[tauri::command]
pub fn delete_rule(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let rule_metadata = app_data.rules.iter().find(|r| r.id == id).cloned();

    // If currently global, also clean up the live file at ~/.claude/rules/.
    if let Some(meta) = &rule_metadata {
        if meta.is_global {
            if let Some(home) = dirs::home_dir() {
                let global_path = home.join(".claude").join("rules").join(&meta.filename);
                if global_path.exists() {
                    if let Err(e) = fs::remove_file(&global_path) {
                        println!(
                            "[delete_rule] Warning: Failed to remove global rule file {}: {}",
                            global_path.display(),
                            e
                        );
                    }
                }
            }
        }
    }

    // Remove from Scene references.
    for scene in app_data.scenes.iter_mut() {
        scene.rule_ids.retain(|rid| rid != &id);
    }

    // Soft delete: move to trash.
    let file_dir = get_rule_file_dir(&id);
    if file_dir.exists() {
        if let Some(metadata) = &rule_metadata {
            let info_path = file_dir.join("info.json");
            if let Ok(info_json) = serde_json::to_string_pretty(metadata) {
                if let Err(e) = fs::write(&info_path, info_json) {
                    println!("[delete_rule] Warning: Failed to save info.json: {}", e);
                }
            }
        }

        let trash_dir = get_app_data_dir().join("trash").join("rules");
        if let Err(e) = fs::create_dir_all(&trash_dir) {
            println!(
                "[delete_rule] Warning: Failed to create trash directory: {}",
                e
            );
        } else {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let trash_dest = trash_dir.join(format!("{}_{}", id, timestamp));

            if let Err(e) = fs::rename(&file_dir, &trash_dest) {
                println!("[delete_rule] Warning: Failed to move to trash: {}", e);
                if let Err(e) = fs::remove_dir_all(&file_dir) {
                    println!("[delete_rule] Warning: Failed to delete directory: {}", e);
                }
            } else {
                println!("[delete_rule] Moved to trash: {:?}", trash_dest);
            }
        }
    }

    app_data.rules.retain(|r| r.id != id);

    write_app_data(app_data)?;
    Ok(())
}

// ============================================================================
// Global setting commands
// ============================================================================

/// Mark a Rule as global — writes `~/.claude/rules/<filename>.md`. If an
/// unmanaged file already exists at that path, it is auto-imported as
/// `"Original <filename>"` and a timestamped backup copy is preserved.
///
/// Unlike CLAUDE.md, multiple Rules can be global simultaneously; this
/// function does NOT unset any other Rule's `is_global`.
#[tauri::command]
pub fn set_global_rule(id: String) -> Result<SetGlobalRuleResult, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let target_rule = app_data
        .rules
        .iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Rule not found: {}", id))?
        .clone();

    // Read content from independent file or fall back to the content field
    // (the latter is theoretical — Rules are always written via independent
    // file storage from import; the fallback exists for parity with the
    // CLAUDE.md pattern).
    let content = if target_rule.managed_path.is_some() {
        read_rule_content(&target_rule.id, &target_rule.filename)?
    } else {
        target_rule.content.clone()
    };

    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let global_dir = home.join(".claude").join("rules");
    let global_path = global_dir.join(&target_rule.filename);

    let mut backup_path: Option<String> = None;
    let mut auto_imported_id: Option<String> = None;

    // If a file exists at the global path that is NOT a managed Rule with the
    // same filename, auto-import it before overwriting.
    if global_path.exists() {
        let path_str = global_path.to_string_lossy().to_string();
        let is_already_managed = app_data
            .rules
            .iter()
            .any(|r| r.source_path == path_str || r.filename == target_rule.filename && r.is_global);

        if !is_already_managed {
            let existing_content = fs::read_to_string(&global_path)
                .map_err(|e| format!("Failed to read existing global rule file: {}", e))?;
            let existing_size = global_path.metadata().map(|m| m.len()).unwrap_or(0);

            let import_id = Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();

            let original_filename = target_rule.filename.clone();
            let imported_rule = Rule {
                id: import_id.clone(),
                name: format!("Original {}", original_filename),
                description: "Auto-imported from ~/.claude/rules/ before replacement".to_string(),
                filename: original_filename.clone(),
                source_path: global_path.to_string_lossy().to_string(),
                content: String::new(),
                managed_path: Some(
                    get_rule_file_path(&import_id, &original_filename)
                        .to_string_lossy()
                        .to_string(),
                ),
                is_global: false,
                category_id: None,
                tag_ids: vec![],
                created_at: now.clone(),
                updated_at: now,
                size: existing_size,
                icon: None,
            };

            let import_dir = get_rule_file_dir(&import_id);
            fs::create_dir_all(&import_dir)
                .map_err(|e| format!("Failed to create import directory: {}", e))?;
            write_rule_content(&import_id, &original_filename, &existing_content)?;

            app_data.rules.push(imported_rule);
            auto_imported_id = Some(import_id);

            // Backup copy for safety.
            let backup_dir = get_rule_global_backup_dir();
            fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let backup_file = backup_dir.join(format!("{}.{}.backup", original_filename, timestamp));
            fs::copy(&global_path, &backup_file).map_err(|e| e.to_string())?;
            backup_path = Some(backup_file.to_string_lossy().to_string());

            println!("[set_global_rule] Auto-imported existing global rule as 'Original {}'", original_filename);
        }
    }

    // Ensure ~/.claude/rules/ exists.
    fs::create_dir_all(&global_dir).map_err(|e| e.to_string())?;

    // Write the global file.
    fs::write(&global_path, &content).map_err(|e| e.to_string())?;

    // Update this rule's is_global flag (do NOT touch other rules' flags).
    if let Some(rule) = app_data.rules.iter_mut().find(|r| r.id == id) {
        rule.is_global = true;
        rule.updated_at = Utc::now().to_rfc3339();
    }

    write_app_data(app_data)?;

    Ok(SetGlobalRuleResult {
        success: true,
        backup_path,
        auto_imported_id,
        error: None,
    })
}

/// Unset global flag for a Rule and remove its `~/.claude/rules/<filename>.md`.
#[tauri::command]
pub fn unset_global_rule(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let filename = {
        let rule = app_data
            .rules
            .iter_mut()
            .find(|r| r.id == id)
            .ok_or_else(|| format!("Rule not found: {}", id))?;
        rule.is_global = false;
        rule.updated_at = Utc::now().to_rfc3339();
        rule.filename.clone()
    };

    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let global_path = home.join(".claude").join("rules").join(&filename);
    if global_path.exists() {
        fs::remove_file(&global_path).map_err(|e| e.to_string())?;
    }

    write_app_data(app_data)?;
    Ok(())
}

// ============================================================================
// Distribution commands
// ============================================================================

/// Distribute a Rule to a project. Target path is fixed at
/// `<project_path>/.claude/rules/<filename>.md`.
#[tauri::command]
pub fn distribute_rule(
    options: RuleDistributionOptions,
) -> Result<RuleDistributionResult, String> {
    let app_data = read_app_data()?;

    let source_rule = app_data
        .rules
        .iter()
        .find(|r| r.id == options.rule_id)
        .ok_or_else(|| format!("Rule not found: {}", options.rule_id))?;

    // Read content from independent file or fall back.
    let content = if source_rule.managed_path.is_some() {
        read_rule_content(&source_rule.id, &source_rule.filename)?
    } else {
        source_rule.content.clone()
    };

    let project_path = expand_path(&options.project_path);
    let target_dir = project_path.join(".claude").join("rules");
    let target_path = target_dir.join(&source_rule.filename);

    fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;

    let mut action = "created";
    let mut backup_path: Option<String> = None;

    if target_path.exists() {
        match options.conflict_resolution {
            ClaudeMdConflictResolution::Skip => {
                return Ok(RuleDistributionResult {
                    success: true,
                    target_path: target_path.to_string_lossy().to_string(),
                    action: "skipped".to_string(),
                    backup_path: None,
                    error: None,
                });
            }
            ClaudeMdConflictResolution::Backup => {
                let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
                let backup_file = target_path.with_extension(format!("md.{}.backup", timestamp));
                fs::copy(&target_path, &backup_file).map_err(|e| e.to_string())?;
                backup_path = Some(backup_file.to_string_lossy().to_string());
                action = "backed_up";
            }
            ClaudeMdConflictResolution::Overwrite => {
                action = "overwritten";
            }
        }
    }

    fs::write(&target_path, &content).map_err(|e| e.to_string())?;

    Ok(RuleDistributionResult {
        success: true,
        target_path: target_path.to_string_lossy().to_string(),
        action: action.to_string(),
        backup_path,
        error: None,
    })
}

/// Batch distribute Rules to a project (used by Scene sync).
#[tauri::command]
pub fn distribute_scene_rules(
    rule_ids: Vec<String>,
    project_path: String,
    conflict_resolution: ClaudeMdConflictResolution,
) -> Result<Vec<RuleDistributionResult>, String> {
    let mut results: Vec<RuleDistributionResult> = Vec::new();

    for id in rule_ids {
        let options = RuleDistributionOptions {
            rule_id: id,
            project_path: project_path.clone(),
            conflict_resolution: conflict_resolution.clone(),
        };

        match distribute_rule(options) {
            Ok(result) => results.push(result),
            Err(e) => results.push(RuleDistributionResult {
                success: false,
                target_path: "".to_string(),
                action: "failed".to_string(),
                backup_path: None,
                error: Some(e),
            }),
        }
    }

    Ok(results)
}
