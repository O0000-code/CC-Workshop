use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{
    ClaudeMdConflictResolution, ClaudeMdDistributionOptions, ClaudeMdDistributionPath,
    ClaudeMdDistributionResult, ClaudeMdFile, ClaudeMdImportOptions, ClaudeMdImportResult,
    ClaudeMdScanItem, ClaudeMdScanResult, ClaudeMdType, SetGlobalResult,
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

/// Global backup directory (~/.ensemble/claude-md/global-backup/)
fn get_global_backup_dir() -> PathBuf {
    get_app_data_dir().join("claude-md").join("global-backup")
}

// ============================================================================
// Helper functions for independent file storage
// ============================================================================

/// Get CLAUDE.md storage root directory (~/.ensemble/claude-md/)
fn get_claude_md_storage_dir() -> PathBuf {
    get_app_data_dir().join("claude-md")
}

/// Get directory for a specific CLAUDE.md file (~/.ensemble/claude-md/{id}/)
fn get_claude_md_file_dir(id: &str) -> PathBuf {
    get_claude_md_storage_dir().join(id)
}

/// Get path to the CLAUDE.md file (~/.ensemble/claude-md/{id}/CLAUDE.md)
fn get_claude_md_file_path(id: &str) -> PathBuf {
    get_claude_md_file_dir(id).join("CLAUDE.md")
}

/// Read CLAUDE.md file content from independent file
fn read_claude_md_content(id: &str) -> Result<String, String> {
    let path = get_claude_md_file_path(id);
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read CLAUDE.md content: {}", e))
}

/// Write CLAUDE.md content to independent file
fn write_claude_md_content(id: &str, content: &str) -> Result<(), String> {
    let dir = get_claude_md_file_dir(id);
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let path = dir.join("CLAUDE.md");
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write content: {}", e))
}

/// Excluded directory names
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

/// Max scan depth
const MAX_SCAN_DEPTH: usize = 10;

/// Preview character count
const PREVIEW_LENGTH: usize = 500;

// ============================================================================
// Scan commands
// ============================================================================

/// Scan system for CLAUDE.md files
///
/// # Arguments
/// * `scan_paths` - Paths to scan (optional, defaults to HOME directories)
/// * `include_home` - Whether to include ~/Documents, ~/Projects, etc.
///
/// # Returns
/// * `ClaudeMdScanResult` - Scan result
#[tauri::command]
pub fn scan_claude_md_files(
    scan_paths: Option<Vec<String>>,
    include_home: Option<bool>,
) -> Result<ClaudeMdScanResult, String> {
    let start = Instant::now();
    let mut items: Vec<ClaudeMdScanItem> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut scanned_dirs: u32 = 0;

    // Read imported file list
    let app_data = read_app_data().unwrap_or_default();
    let imported_paths: Vec<String> = app_data
        .claude_md_files
        .iter()
        .map(|f| f.source_path.clone())
        .collect();

    // Determine paths to scan
    let mut paths_to_scan: Vec<PathBuf> = Vec::new();

    // 1. User-level global: ~/.claude/CLAUDE.md
    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let user_claude_md = home.join(".claude").join("CLAUDE.md");
    if user_claude_md.exists() {
        if let Some(item) =
            scan_single_file(&user_claude_md, ClaudeMdType::Global, &imported_paths, &app_data)
        {
            items.push(item);
        }
    }

    // 2. Custom paths
    if let Some(custom_paths) = scan_paths {
        for path_str in custom_paths {
            let path = expand_path(&path_str);
            if path.exists() && path.is_dir() {
                paths_to_scan.push(path);
            }
        }
    }

    // 3. Default scan paths
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
                paths_to_scan.push(dir);
            }
        }
    }

    // Scan all paths
    for base_path in paths_to_scan {
        match scan_directory(&base_path, &imported_paths, &app_data, &mut scanned_dirs) {
            Ok(mut found_items) => items.append(&mut found_items),
            Err(e) => errors.push(format!("{}: {}", base_path.display(), e)),
        }
    }

    // Deduplicate (based on path)
    items.sort_by(|a, b| a.path.cmp(&b.path));
    items.dedup_by(|a, b| a.path == b.path);

    let duration = start.elapsed().as_millis() as u64;

    Ok(ClaudeMdScanResult {
        items,
        scanned_dirs,
        duration,
        errors,
    })
}

/// Scan a single directory
fn scan_directory(
    base_path: &Path,
    imported_paths: &[String],
    app_data: &crate::types::AppData,
    scanned_dirs: &mut u32,
) -> Result<Vec<ClaudeMdScanItem>, String> {
    let mut items: Vec<ClaudeMdScanItem> = Vec::new();

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
        }

        let path = entry.path();
        let file_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        // Check if it's a CLAUDE.md file
        let file_type = match file_name {
            "CLAUDE.md" => {
                // Distinguish ./.claude/CLAUDE.md and ./CLAUDE.md
                ClaudeMdType::Project
            }
            "CLAUDE.local.md" => ClaudeMdType::Local,
            _ => continue,
        };

        if let Some(item) = scan_single_file(path, file_type, imported_paths, app_data) {
            items.push(item);
        }
    }

    Ok(items)
}

/// Scan a single file
fn scan_single_file(
    path: &Path,
    file_type: ClaudeMdType,
    imported_paths: &[String],
    app_data: &crate::types::AppData,
) -> Option<ClaudeMdScanItem> {
    let path_str = path.to_string_lossy().to_string();

    let metadata = path.metadata().ok()?;
    let size = metadata.len();
    let modified_at = metadata
        .modified()
        .ok()
        .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
        .unwrap_or_default();

    // Check if already imported
    let is_imported = imported_paths.contains(&path_str);
    let imported_id = if is_imported {
        app_data
            .claude_md_files
            .iter()
            .find(|f| f.source_path == path_str)
            .map(|f| f.id.clone())
    } else {
        None
    };

    // Read preview content
    // Use char_indices to safely handle UTF-8 multi-byte characters
    let preview = fs::read_to_string(path).ok().map(|content| {
        if content.chars().count() > PREVIEW_LENGTH {
            // Find the byte index of the character at PREVIEW_LENGTH position
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

    // Infer project name
    let project_name = path
        .parent()
        .and_then(|p| {
            // If parent directory is .claude, get parent's parent directory name
            if p.file_name().map(|n| n == ".claude").unwrap_or(false) {
                p.parent().and_then(|pp| pp.file_name())
            } else {
                p.file_name()
            }
        })
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    Some(ClaudeMdScanItem {
        path: path_str,
        file_type,
        size,
        modified_at,
        is_imported,
        imported_id,
        preview,
        project_name,
    })
}

/// Check if directory should be excluded.
///
/// `.claude` is explicitly allowed (project-side `<project>/.claude/CLAUDE.md`
/// is the most common managed location and must appear in scan results).
/// Mirrors the rules.rs equivalent so both Rule and CLAUDE.md scans share
/// the same descent rules.
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

/// Import a CLAUDE.md file to Ensemble management
///
/// # Arguments
/// * `options` - Import options
///
/// # Returns
/// * `ClaudeMdImportResult` - Import result
#[tauri::command]
pub fn import_claude_md(options: ClaudeMdImportOptions) -> Result<ClaudeMdImportResult, String> {
    log::debug!("[import_claude_md] Called with source_path: {}", options.source_path);
    let source_path = expand_path(&options.source_path);
    log::debug!("[import_claude_md] Expanded path: {:?}", source_path);

    // Verify source file exists
    if !source_path.exists() {
        log::warn!("[import_claude_md] Source file not found!");
        return Ok(ClaudeMdImportResult {
            success: false,
            file: None,
            error: Some(format!(
                "Source file not found: {}",
                source_path.display()
            )),
        });
    }

    // Read file content
    let content =
        fs::read_to_string(&source_path).map_err(|e| format!("Failed to read file: {}", e))?;
    log::debug!("[import_claude_md] Read content, length: {}", content.len());

    let size = source_path.metadata().map(|m| m.len()).unwrap_or(0);

    // Infer file type
    let source_type = infer_claude_md_type(&source_path);

    // Generate name
    let name = options
        .name
        .unwrap_or_else(|| infer_name_from_path(&source_path));
    log::debug!("[import_claude_md] Generated name: {}", name);

    // Generate UUID for the file
    let id = Uuid::new_v4().to_string();

    // Write content to independent file
    write_claude_md_content(&id, &content)?;
    let managed_path = get_claude_md_file_path(&id).to_string_lossy().to_string();
    log::info!("[import_claude_md] Written to managed path: {}", managed_path);

    // Create ClaudeMdFile (content field is empty, will be read from independent file)
    let now = Utc::now().to_rfc3339();
    let mut file = ClaudeMdFile {
        id,
        name,
        description: options.description.unwrap_or_default(),
        source_path: source_path.to_string_lossy().to_string(),
        source_type,
        content: String::new(), // Content stored in independent file
        managed_path: Some(managed_path),
        is_global: false,
        category_id: options.category_id,
        tag_ids: options.tag_ids,
        created_at: now.clone(),
        updated_at: now,
        size,
        icon: None,
    };
    log::info!("[import_claude_md] Created file with id: {}", file.id);

    // Save metadata to AppData
    log::debug!("[import_claude_md] Reading app_data...");
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;
    log::debug!("[import_claude_md] Current claude_md_files count: {}", app_data.claude_md_files.len());
    app_data.claude_md_files.push(file.clone());
    log::debug!("[import_claude_md] After push, count: {}", app_data.claude_md_files.len());
    log::debug!("[import_claude_md] Writing app_data...");
    write_app_data(app_data)?;
    log::debug!("[import_claude_md] Write complete!");

    // Populate content for return value
    file.content = content;

    Ok(ClaudeMdImportResult {
        success: true,
        file: Some(file),
        error: None,
    })
}

/// Infer file type
fn infer_claude_md_type(path: &Path) -> ClaudeMdType {
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    if file_name == "CLAUDE.local.md" {
        ClaudeMdType::Local
    } else if path.to_string_lossy().contains("/.claude/") {
        if let Some(home) = dirs::home_dir() {
            let home_claude = home.join(".claude").join("CLAUDE.md");
            if path == home_claude {
                return ClaudeMdType::Global;
            }
        }
        ClaudeMdType::Project
    } else {
        ClaudeMdType::Project
    }
}

/// Infer name from path
fn infer_name_from_path(path: &Path) -> String {
    // Try to get project name
    path.parent()
        .and_then(|p| {
            if p.file_name().map(|n| n == ".claude").unwrap_or(false) {
                p.parent().and_then(|pp| pp.file_name())
            } else {
                p.file_name()
            }
        })
        .and_then(|n| n.to_str())
        .map(|s| format!("{} CLAUDE.md", s))
        .unwrap_or_else(|| "Imported CLAUDE.md".to_string())
}

// ============================================================================
// Read/Write commands
// ============================================================================

/// Read CLAUDE.md content
///
/// # Arguments
/// * `id` - ClaudeMdFile ID
///
/// # Returns
/// * `ClaudeMdFile` - File info and content
#[tauri::command]
pub fn read_claude_md(id: String) -> Result<ClaudeMdFile, String> {
    let app_data = read_app_data()?;

    let mut file = app_data
        .claude_md_files
        .into_iter()
        .find(|f| f.id == id)
        .ok_or_else(|| format!("CLAUDE.md file not found: {}", id))?;

    // Read content from independent file if managed_path exists
    if file.managed_path.is_some() {
        file.content = read_claude_md_content(&file.id)?;
    }
    // If managed_path is None but content exists (old data), use existing content
    // (backward compatibility - content was deserialized from old data.json)

    Ok(file)
}

/// Get all CLAUDE.md files
#[tauri::command]
pub fn get_claude_md_files() -> Result<Vec<ClaudeMdFile>, String> {
    let app_data = read_app_data()?;

    let files: Vec<ClaudeMdFile> = app_data
        .claude_md_files
        .into_iter()
        .map(|mut file| {
            // Read content from independent file if managed_path exists
            if file.managed_path.is_some() {
                if let Ok(content) = read_claude_md_content(&file.id) {
                    file.content = content;
                }
            }
            // If managed_path is None but content exists (old data), use existing content
            file
        })
        .collect();

    Ok(files)
}

/// Update CLAUDE.md content
///
/// # Arguments
/// * `id` - ClaudeMdFile ID
/// * `content` - New content (optional)
/// * `name` - New name (optional)
/// * `description` - New description (optional)
/// * `categoryId` - New category, three-state `Option<Option<String>>`:
///   - outer `None` (JS omit / `undefined`) → do not modify
///   - outer `Some(None)` (JS `null`) → clear (Uncategorized)
///   - outer `Some(Some(id))` (JS string) → set
/// * `tag_ids` - New tag list (optional)
/// * `icon` - New icon (optional)
///
/// Bug Audit 2026-05-15 finding A8 (R3::C6): previously `category_id:
/// Option<String>`, which silently dropped a clear-to-Uncategorized request
/// from the detail panel. Aligned with `update_skill_metadata` /
/// `update_mcp_metadata` / `update_rule`.
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_claude_md(
    id: String,
    content: Option<String>,
    name: Option<String>,
    description: Option<String>,
    categoryId: Option<Option<String>>,
    tag_ids: Option<Vec<String>>,
    icon: Option<String>,
) -> Result<ClaudeMdFile, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let file = app_data
        .claude_md_files
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| format!("CLAUDE.md file not found: {}", id))?;

    // Track content for return value
    let mut updated_content: Option<String> = None;

    // Update content - write to independent file
    if let Some(c) = content {
        file.size = c.len() as u64;
        // Write content to independent file
        write_claude_md_content(&id, &c)?;
        // Update managed_path if not set (migrating old data on update)
        if file.managed_path.is_none() {
            file.managed_path = Some(get_claude_md_file_path(&id).to_string_lossy().to_string());
        }
        updated_content = Some(c);
    }

    // Update other metadata fields
    if let Some(n) = name {
        file.name = n;
    }
    if let Some(d) = description {
        file.description = d;
    }
    if let Some(new_category_id_opt) = categoryId {
        file.category_id = new_category_id_opt;
    }
    if let Some(tids) = tag_ids {
        file.tag_ids = tids;
    }
    if let Some(i) = icon {
        file.icon = Some(i);
    }

    file.updated_at = Utc::now().to_rfc3339();

    let mut updated_file = file.clone();
    write_app_data(app_data)?;

    // Populate content for return value
    if let Some(c) = updated_content {
        updated_file.content = c;
    } else if updated_file.managed_path.is_some() {
        // Read content from independent file
        if let Ok(c) = read_claude_md_content(&id) {
            updated_file.content = c;
        }
    }

    Ok(updated_file)
}

/// Delete CLAUDE.md file (remove from management)
///
/// Note: This is a soft delete - files are moved to trash, not permanently deleted.
/// If the file is currently set as global, we only remove it from management
/// but keep ~/.claude/CLAUDE.md intact.
#[tauri::command]
pub fn delete_claude_md(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    // Find the file metadata before deletion (for saving to info.json)
    let file_metadata = app_data.claude_md_files.iter().find(|f| f.id == id).cloned();

    // If it's the current global, just unset the global status
    // but DO NOT delete ~/.claude/CLAUDE.md
    if app_data.global_claude_md_id.as_ref() == Some(&id) {
        app_data.global_claude_md_id = None;
        // Also unset isGlobal on the file
        if let Some(file) = app_data.claude_md_files.iter_mut().find(|f| f.id == id) {
            file.is_global = false;
        }
    }

    // Remove from Scene references
    for scene in app_data.scenes.iter_mut() {
        scene.claude_md_ids.retain(|cid| cid != &id);
    }

    // Soft delete: move to trash instead of permanent deletion
    let file_dir = get_claude_md_file_dir(&id);
    if file_dir.exists() {
        // Save metadata to info.json before moving to trash (for restore functionality)
        if let Some(metadata) = &file_metadata {
            let info_path = file_dir.join("info.json");
            if let Ok(info_json) = serde_json::to_string_pretty(metadata) {
                if let Err(e) = fs::write(&info_path, info_json) {
                    log::warn!("[delete_claude_md] Warning: Failed to save info.json: {}", e);
                }
            }
        }

        let trash_dir = get_app_data_dir().join("trash").join("claude-md");
        if let Err(e) = fs::create_dir_all(&trash_dir) {
            log::warn!("[delete_claude_md] Warning: Failed to create trash directory: {}", e);
        } else {
            // Generate unique trash name with timestamp
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let trash_dest = trash_dir.join(format!("{}_{}", id, timestamp));

            if let Err(e) = fs::rename(&file_dir, &trash_dest) {
                log::warn!("[delete_claude_md] Warning: Failed to move to trash: {}", e);
                // Fallback to permanent deletion if move fails
                if let Err(e) = fs::remove_dir_all(&file_dir) {
                    log::warn!("[delete_claude_md] Warning: Failed to delete directory: {}", e);
                }
            } else {
                log::info!("[delete_claude_md] Moved to trash: {:?}", trash_dest);
            }
        }
    }

    // Delete from data.json
    app_data.claude_md_files.retain(|f| f.id != id);

    write_app_data(app_data)?;
    Ok(())
}

// ============================================================================
// Global setting commands
// ============================================================================

/// Set a CLAUDE.md as global
///
/// Flow:
/// 1. Read current ~/.claude/CLAUDE.md
/// 2. If exists and not managed by us, backup to ~/.ensemble/claude-md/global-backup/
/// 3. Unset previous global file's isGlobal flag
/// 4. Copy new file content to ~/.claude/CLAUDE.md
/// 5. Set new file's isGlobal to true
///
/// # Arguments
/// * `id` - ClaudeMdFile ID to set as global
#[tauri::command]
pub fn set_global_claude_md(id: String) -> Result<SetGlobalResult, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    // Find target file
    let target_file = app_data
        .claude_md_files
        .iter()
        .find(|f| f.id == id)
        .ok_or_else(|| format!("CLAUDE.md file not found: {}", id))?
        .clone();

    // Read content from independent file if managed_path exists, otherwise use content field (old data)
    let content = if target_file.managed_path.is_some() {
        read_claude_md_content(&target_file.id)?
    } else {
        // Backward compatibility: use content field for old data
        target_file.content.clone()
    };

    // Global file path
    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let global_path = home.join(".claude").join("CLAUDE.md");

    let mut backup_path: Option<String> = None;
    let mut auto_imported_id: Option<String> = None;
    let previous_global_id = app_data.global_claude_md_id.clone();

    // If global file exists, need to backup and auto-import
    if global_path.exists() {
        // Check if it's a file we manage (has is_global=true)
        let is_managed = app_data.claude_md_files.iter().any(|f| f.is_global);

        if !is_managed {
            // Not a file we manage - auto-import it first so user doesn't lose it
            let existing_content = fs::read_to_string(&global_path)
                .map_err(|e| format!("Failed to read existing global file: {}", e))?;

            let existing_size = global_path.metadata().map(|m| m.len()).unwrap_or(0);

            // Create a new managed file for the existing global CLAUDE.md
            let import_id = uuid::Uuid::new_v4().to_string();
            let now = Utc::now().to_rfc3339();

            let imported_file = ClaudeMdFile {
                id: import_id.clone(),
                name: "Original Global".to_string(),
                description: "Auto-imported from ~/.claude/CLAUDE.md before replacement".to_string(),
                content: String::new(), // Content stored in independent file
                source_path: global_path.to_string_lossy().to_string(),
                source_type: ClaudeMdType::Global,
                category_id: None,
                tag_ids: vec![],
                is_global: false, // Not global anymore since we're replacing it
                managed_path: Some(get_claude_md_file_path(&import_id).to_string_lossy().to_string()),
                created_at: now.clone(),
                updated_at: now,
                size: existing_size,
                icon: None,
            };

            // Create independent file directory and save content
            let import_dir = get_claude_md_file_dir(&import_id);
            fs::create_dir_all(&import_dir).map_err(|e| format!("Failed to create import directory: {}", e))?;
            write_claude_md_content(&import_id, &existing_content)?;

            // Add to app data
            app_data.claude_md_files.push(imported_file);
            auto_imported_id = Some(import_id);

            // Also create a backup for safety
            let backup_dir = get_global_backup_dir();
            fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let backup_file = backup_dir.join(format!("CLAUDE.md.{}.backup", timestamp));
            fs::copy(&global_path, &backup_file).map_err(|e| e.to_string())?;

            backup_path = Some(backup_file.to_string_lossy().to_string());

            log::info!("[set_global_claude_md] Auto-imported existing global file as 'Original Global'");
        }
    }

    // Unset previous global file's flag
    for file in app_data.claude_md_files.iter_mut() {
        if file.is_global {
            file.is_global = false;
            file.updated_at = Utc::now().to_rfc3339();
        }
    }

    // Ensure ~/.claude directory exists
    let claude_dir = global_path.parent().unwrap();
    fs::create_dir_all(claude_dir).map_err(|e| e.to_string())?;

    // Write global file (using content from independent file or old data)
    fs::write(&global_path, &content).map_err(|e| e.to_string())?;

    // Set new global flag
    if let Some(file) = app_data.claude_md_files.iter_mut().find(|f| f.id == id) {
        file.is_global = true;
        file.updated_at = Utc::now().to_rfc3339();
    }

    app_data.global_claude_md_id = Some(id);
    write_app_data(app_data)?;

    Ok(SetGlobalResult {
        success: true,
        previous_global_id,
        backup_path,
        auto_imported_id,
        error: None,
    })
}

/// Unset global CLAUDE.md setting
///
/// Flow:
/// 1. Delete ~/.claude/CLAUDE.md
/// 2. Unset file's isGlobal flag
#[tauri::command]
pub fn unset_global_claude_md() -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    // Unset all global flags
    for file in app_data.claude_md_files.iter_mut() {
        if file.is_global {
            file.is_global = false;
            file.updated_at = Utc::now().to_rfc3339();
        }
    }

    app_data.global_claude_md_id = None;

    // Delete global file
    let home = dirs::home_dir().ok_or("Cannot get home directory")?;
    let global_path = home.join(".claude").join("CLAUDE.md");
    if global_path.exists() {
        fs::remove_file(&global_path).map_err(|e| e.to_string())?;
    }

    write_app_data(app_data)?;
    Ok(())
}

// ============================================================================
// Distribution commands
// ============================================================================

/// Distribute CLAUDE.md to project
///
/// # Arguments
/// * `options` - Distribution options
#[tauri::command]
pub fn distribute_claude_md(
    options: ClaudeMdDistributionOptions,
) -> Result<ClaudeMdDistributionResult, String> {
    let app_data = read_app_data()?;

    // Find source file
    let source_file = app_data
        .claude_md_files
        .iter()
        .find(|f| f.id == options.claude_md_id)
        .ok_or_else(|| format!("CLAUDE.md file not found: {}", options.claude_md_id))?;

    // Check if it's a global file
    if source_file.is_global {
        return Err(
            "Cannot distribute a global CLAUDE.md. Global files are already available everywhere."
                .to_string(),
        );
    }

    // Read content from independent file if managed_path exists, otherwise use content field (old data)
    let content = if source_file.managed_path.is_some() {
        read_claude_md_content(&source_file.id)?
    } else {
        // Backward compatibility: use content field for old data
        source_file.content.clone()
    };

    // Build target path
    let project_path = expand_path(&options.project_path);
    let target_path = project_path.join(options.target_path.as_str());

    // Ensure parent directory exists
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut action = "created";
    let mut backup_path: Option<String> = None;

    // Handle conflict
    if target_path.exists() {
        match options.conflict_resolution {
            ClaudeMdConflictResolution::Skip => {
                return Ok(ClaudeMdDistributionResult {
                    success: true,
                    target_path: target_path.to_string_lossy().to_string(),
                    action: "skipped".to_string(),
                    backup_path: None,
                    error: None,
                });
            }
            ClaudeMdConflictResolution::Backup => {
                // Create backup
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

    // Write file (using content from independent file or old data)
    fs::write(&target_path, &content).map_err(|e| e.to_string())?;

    Ok(ClaudeMdDistributionResult {
        success: true,
        target_path: target_path.to_string_lossy().to_string(),
        action: action.to_string(),
        backup_path,
        error: None,
    })
}

/// Batch distribute CLAUDE.md to project (for Scene)
///
/// # Arguments
/// * `claude_md_ids` - File ID list to distribute
/// * `project_path` - Target project path
/// * `target_path` - Target file path
/// * `conflict_resolution` - Conflict resolution strategy
#[tauri::command]
pub fn distribute_scene_claude_md(
    claude_md_ids: Vec<String>,
    project_path: String,
    target_path: ClaudeMdDistributionPath,
    conflict_resolution: ClaudeMdConflictResolution,
) -> Result<Vec<ClaudeMdDistributionResult>, String> {
    let mut results: Vec<ClaudeMdDistributionResult> = Vec::new();

    for id in claude_md_ids {
        let options = ClaudeMdDistributionOptions {
            claude_md_id: id,
            project_path: project_path.clone(),
            target_path: target_path.clone(),
            conflict_resolution: conflict_resolution.clone(),
        };

        match distribute_claude_md(options) {
            Ok(result) => results.push(result),
            Err(e) => results.push(ClaudeMdDistributionResult {
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

// ============================================================================
// Migration
// ============================================================================

/// Migrate old CLAUDE.md data from embedded content to independent file storage
///
/// This function checks for old data where content is stored in data.json
/// and migrates it to independent files in ~/.ensemble/claude-md/{id}/CLAUDE.md
pub fn migrate_claude_md_storage() -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;
    let mut migrated = false;

    for file in app_data.claude_md_files.iter_mut() {
        // Check if migration is needed (content non-empty and managed_path is None)
        if !file.content.is_empty() && file.managed_path.is_none() {
            // Write content to independent file
            write_claude_md_content(&file.id, &file.content)?;

            // Update managed_path
            file.managed_path = Some(get_claude_md_file_path(&file.id).to_string_lossy().to_string());

            // Clear content (will be skipped during serialization anyway)
            file.content = String::new();

            migrated = true;
            log::info!("[Migration] Migrated CLAUDE.md: {} (id: {})", file.name, file.id);
        }
    }

    if migrated {
        write_app_data(app_data)?;
        log::info!("[Migration] CLAUDE.md storage migration completed");
    }

    Ok(())
}
