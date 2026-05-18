use crate::commands::data::{read_app_data, write_app_data, DATA_MUTEX};
use crate::types::{Skill, SkillMetadata};
use crate::utils::{expand_path, get_data_file_path, normalize_nfc, parse_skill_md};
use std::fs;

/// Scan skills directory and return list of skills
///
/// Supports both regular directories and symlinked skill directories.
///
/// `claude_config_dir` (e.g. `~/.claude`) is used to derive each Skill's
/// `scope` field by checking whether `<claude_config_dir>/skills/<name>`
/// exists — see `derive_skill_scope`. The field is settings-driven (not
/// hardcoded) so a user who customises `claudeConfigDir` in Settings still
/// gets correct scope reporting.
#[tauri::command]
pub fn scan_skills(source_dir: String, claude_config_dir: String) -> Result<Vec<Skill>, String> {
    let path = expand_path(&source_dir);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    let metadata_map = load_skill_metadata();
    let claude_skills_dir = expand_path(&claude_config_dir).join("skills");

    // Use fs::read_dir to properly handle symlinks and avoid duplicates
    // WalkDir with max_depth(2) would process both the directory and SKILL.md file,
    // causing each skill to be added twice
    if let Ok(entries) = fs::read_dir(&path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let entry_path = entry.path();

            // Skip hidden files/directories
            if entry_path.file_name()
                .map(|n| n.to_string_lossy().starts_with('.'))
                .unwrap_or(true)
            {
                continue;
            }

            // Check if it's a directory (follows symlinks)
            if !entry_path.is_dir() {
                continue;
            }

            // Check for SKILL.md in the directory
            let skill_md_path = entry_path.join("SKILL.md");
            if skill_md_path.exists() {
                if let Ok(skill) = parse_skill_file(&skill_md_path, &metadata_map, &claude_skills_dir) {
                    skills.push(skill);
                }
            }
        }
    }

    Ok(skills)
}

/// Get a single skill by ID
#[tauri::command]
pub fn get_skill(source_dir: String, claude_config_dir: String, skill_id: String) -> Result<Option<Skill>, String> {
    let skills = scan_skills(source_dir, claude_config_dir)?;
    Ok(skills.into_iter().find(|s| s.id == skill_id))
}

/// Derive a Skill's scope from filesystem state.
///
/// Returns "global" when `<claude_skills_dir>/<skill_name>` is present
/// (symlink, real dir, or even a broken symlink — `symlink_metadata` does
/// not follow). Claude Code reads `~/.claude/skills/` directly, so its
/// view of "global" matches this check. Returns "project" otherwise —
/// meaning the Skill is only inside `~/.cc-workshop/` and deployment relies
/// on Scene → Project sync.
fn derive_skill_scope(skill_name: &std::ffi::OsStr, claude_skills_dir: &std::path::Path) -> String {
    let candidate = claude_skills_dir.join(skill_name);
    if candidate.symlink_metadata().is_ok() {
        "global".to_string()
    } else {
        "project".to_string()
    }
}

/// Update skill metadata (category, tags, enabled status, icon, category_id).
///
/// **DATA_MUTEX**: Acquired at the outermost scope (T1f / `phase1_audit.md`
/// P1-3 closure — was previously a known gap). Concurrent
/// `update_skill_metadata` + `reorder_categories` (and any other data.json
/// mutator) are now serialised, eliminating the V1 lost-update window in
/// which a stale `read_app_data` snapshot could overwrite a fresh
/// `categories` reorder. See `03_tech_plan.md` V2 §3.1 + §3.6 for the
/// canonical coverage table.
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
pub fn update_skill_metadata(
    skill_id: String,
    category: Option<String>,
    categoryId: Option<Option<String>>,
    tags: Option<Vec<String>>,
    enabled: Option<bool>,
    icon: Option<String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;

    let metadata = app_data
        .skill_metadata
        .entry(skill_id)
        .or_insert_with(SkillMetadata::default);

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
    if let Some(i) = icon {
        metadata.icon = Some(i);
    }

    write_app_data(app_data)?;
    Ok(())
}

/// Extract plugin info from a symlink path pointing to plugin cache
fn extract_plugin_info_from_path(real_path: &std::path::Path) -> Option<(String, String, String)> {
    let path_str = real_path.to_string_lossy();

    // Check if path contains .claude/plugins/cache/
    if !path_str.contains(".claude/plugins/cache/") {
        return None;
    }

    // Path format: ~/.claude/plugins/cache/{marketplace}/{plugin_name}/{version}/skills/{skill_name}
    // We need to extract marketplace and plugin_name
    let parts: Vec<&str> = path_str.split(".claude/plugins/cache/").collect();
    if parts.len() < 2 {
        return None;
    }

    let after_cache = parts[1];
    let segments: Vec<&str> = after_cache.split('/').collect();

    // segments[0] = marketplace, segments[1] = plugin_name
    if segments.len() >= 2 {
        let marketplace = segments[0].to_string();
        let plugin_name = segments[1].to_string();
        let plugin_id = format!("{}@{}", plugin_name, marketplace);
        Some((plugin_id, plugin_name, marketplace))
    } else {
        None
    }
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

fn parse_skill_file(
    skill_md_path: &std::path::Path,
    metadata_map: &std::collections::HashMap<String, SkillMetadata>,
    claude_skills_dir: &std::path::Path,
) -> Result<Skill, String> {
    let content = fs::read_to_string(skill_md_path).map_err(|e| e.to_string())?;
    let (frontmatter, instructions) = parse_skill_md(&content);

    // Get skill directory (parent of SKILL.md)
    let skill_dir = skill_md_path.parent().unwrap_or(skill_md_path);
    let skill_name = skill_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Generate ID from path. R2-1: NFC-normalise so the same skill cloned
    // from git (NFC by default) vs. renamed in Finder (may produce NFD)
    // collapses to a single metadata key. macOS APFS is normalisation-
    // insensitive, so `Path::new(nfc_id).exists()` and downstream
    // `fs::read_to_string(nfc_id)` continue to work against an on-disk
    // NFD file. Migration in `data.rs::migrate_unicode_normalization`
    // collapses any pre-existing NFD keys in `data.json` so this lookup
    // finds them on first launch after upgrade.
    let id = normalize_nfc(&skill_dir.to_string_lossy());

    // Get metadata if exists
    let metadata = metadata_map.get(&id);

    // Clone name before moving it
    let name = frontmatter.name.clone().unwrap_or(skill_name);
    let invocation = frontmatter.name.clone();

    // Get installed_at from directory creation time
    let installed_at = fs::metadata(skill_dir)
        .ok()
        .and_then(|m| m.created().ok())
        .map(|t| {
            let datetime: chrono::DateTime<chrono::Utc> = t.into();
            datetime.to_rfc3339()
        });

    // Determine install source — three-state ("local" | "plugin" | "marketplace").
    //
    // Marketplace items are real copies on disk (D-7) and therefore look
    // identical to local items at the symlink level. We must consult the
    // persisted `SkillMetadata.install_source` first; only when metadata
    // is absent (e.g. legacy entries before A1 landed) do we fall back to
    // runtime symlink probing for the plugin/local distinction.
    let metadata_install_source = metadata.and_then(|m| m.install_source.clone());
    let (install_source, plugin_id, plugin_name, marketplace, plugin_enabled) =
        match metadata_install_source.as_deref() {
            Some("marketplace") => (
                Some("marketplace".to_string()),
                None,
                None,
                None,
                None,
            ),
            // For "plugin" we still re-derive the live pluginId/marketplace
            // by probing the symlink, because the metadata only carries
            // `install_source` (not the plugin triple). For "local" we just
            // accept the metadata answer.
            _ => {
                if let Ok(real_path) = fs::read_link(skill_dir) {
                    if let Some((pid, pname, mkt)) = extract_plugin_info_from_path(&real_path) {
                        let enabled = is_plugin_enabled(&pid);
                        (
                            Some("plugin".to_string()),
                            Some(pid),
                            Some(pname),
                            Some(mkt),
                            Some(enabled),
                        )
                    } else {
                        (Some("local".to_string()), None, None, None, None)
                    }
                } else {
                    (Some("local".to_string()), None, None, None, None)
                }
            }
        };

    let marketplace_source = metadata.and_then(|m| m.marketplace_source.clone());

    let skill = Skill {
        id: id.clone(),
        name,
        description: frontmatter.description.unwrap_or_default(),
        category: metadata.map(|m| m.category.clone()).unwrap_or_default(),
        category_id: metadata.and_then(|m| m.category_id.clone()),
        tags: metadata.map(|m| m.tags.clone()).unwrap_or_default(),
        enabled: metadata.map(|m| m.enabled).unwrap_or(true),
        // R2-1: preserve the `id == source_path` invariant — both fields
        // must carry the SAME byte sequence so downstream lookups by
        // either field hit the same `metadata_map` slot. Reuse the
        // already-normalised `id` rather than re-running normalisation.
        source_path: id.clone(),
        // Scope is DERIVED from the filesystem at scan time:
        // "global" when `<claude_config_dir>/skills/<name>` exists,
        // "project" otherwise. `SkillMetadata.scope` still exists in
        // `data.json` for backward compat but is no longer read — the
        // filesystem is source of truth. See V1 fix plan
        // `/Users/bo/.claude/plans/hazy-percolating-forest.md`.
        scope: derive_skill_scope(
            skill_dir.file_name().unwrap_or(std::ffi::OsStr::new("")),
            claude_skills_dir,
        ),
        invocation,
        allowed_tools: frontmatter.allowed_tools,
        instructions,
        // `createdAt` drives the Skills page "Recently added" sort. We prefer
        // the OS directory creation time (the moment the skill landed on disk
        // — either via marketplace install, local import, or symlink target),
        // so the order tracks real install history instead of getting reset to
        // `now()` on every `scan_skills` call. Fallback is `now()` only when
        // the platform doesn't expose `created()` (rare on macOS APFS).
        created_at: installed_at
            .clone()
            .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        last_used: metadata.and_then(|m| m.last_used.clone()),
        usage_count: metadata.map(|m| m.usage_count).unwrap_or(0),
        icon: metadata.and_then(|m| m.icon.clone()),
        installed_at,
        install_source,
        plugin_id,
        plugin_name,
        marketplace,
        plugin_enabled,
        marketplace_source,
    };

    Ok(skill)
}

fn load_skill_metadata() -> std::collections::HashMap<String, SkillMetadata> {
    let data_path = get_data_file_path();
    if data_path.exists() {
        if let Ok(content) = fs::read_to_string(&data_path) {
            if let Ok(app_data) = serde_json::from_str::<crate::types::AppData>(&content) {
                return app_data.skill_metadata;
            }
        }
    }
    std::collections::HashMap::new()
}

/// Delete a skill by moving it to the trash directory
///
/// Instead of permanently deleting, moves the skill to ~/.cc-workshop/trash/skills/
/// for easy recovery if needed.
#[tauri::command]
pub fn delete_skill(skill_id: String, ensemble_dir: String) -> Result<(), String> {
    let ensemble_path = expand_path(&ensemble_dir);
    let skill_path = std::path::Path::new(&skill_id);

    // Verify the skill exists
    if !skill_path.exists() {
        return Err(format!("Skill not found: {}", skill_id));
    }

    // Get skill name from path
    let skill_name = skill_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid skill path")?;

    // Create trash directory
    let trash_dir = ensemble_path.join("trash").join("skills");
    fs::create_dir_all(&trash_dir)
        .map_err(|e| format!("Failed to create trash directory: {}", e))?;

    // Generate unique destination path (add timestamp if exists)
    let mut dest_path = trash_dir.join(skill_name);
    if dest_path.exists() {
        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        dest_path = trash_dir.join(format!("{}_{}", skill_name, timestamp));
    }

    // B-P0-7 (E3-3 / E4-1): snapshot current metadata into the live skill
    // dir BEFORE the rename so it travels with the move and a future
    // `RestoreFromTrash` (via marketplace's collision modal) can recover
    // the user's category / tags / icon. Failure is non-fatal — we'd
    // rather complete the delete with no snapshot than block the user.
    let _ = crate::commands::marketplace::snapshot_skill_metadata_into(skill_path, &skill_id);

    // Move skill to trash
    fs::rename(skill_path, &dest_path)
        .map_err(|e| format!("Failed to move skill to trash: {}", e))?;

    // Remove metadata for this skill (T1f: holds DATA_MUTEX so a concurrent
    // `update_skill_metadata` / `reorder_categories` cannot lose this delete).
    {
        let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
        let mut app_data = read_app_data().unwrap_or_default();
        app_data.skill_metadata.remove(&skill_id);
        // `write_app_data` errors are intentionally swallowed here to preserve
        // existing best-effort semantics: the trash move already succeeded, so
        // surfacing a metadata-cleanup error would mislead the caller. The lock
        // still serialises the write against concurrent mutators.
        let _ = write_app_data(app_data);
    }

    Ok(())
}
