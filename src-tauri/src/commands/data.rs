use crate::types::{
    AppData, AppSettings, Category, MigrationReport, Project, Scene, Tag, TrashedProject,
    TrashedScene,
};
use crate::utils::{ensure_dir, get_app_data_dir, get_data_file_path, get_settings_file_path};
use std::fs;
use std::io::Write;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

/// Global mutex protecting all read-modify-write operations on `data.json`.
///
/// Tauri commands run on independent tokio tasks; without this lock,
/// concurrent `reorder_categories` + `add_category` invocations can lose
/// updates (T1 reads stale data, T2 writes its own version, T1 writes
/// overwriting T2). All mutating commands acquire this guard at their
/// outermost scope before calling `read_app_data` / `write_app_data`.
///
/// Pure read commands (`get_categories`, `get_tags`, ...) do not acquire
/// the lock so reads can run concurrently with one another.
pub static DATA_MUTEX: Mutex<()> = Mutex::new(());

/// Trait for items keyed by a string `id` (Category, Tag, ...).
/// Used by [`apply_reorder`] to look items up while reordering.
pub trait HasId {
    fn id(&self) -> &str;
}

impl HasId for Category {
    fn id(&self) -> &str {
        &self.id
    }
}

impl HasId for Tag {
    fn id(&self) -> &str {
        &self.id
    }
}

/// Pure function: reorder a `Vec<T>` so that ids in `ordered_ids` come first
/// in the given order, with any remaining items appended in their original
/// relative order.
///
/// Semantics:
/// - Ids in `ordered_ids` that exist in `items` are placed first in that order.
/// - Items not mentioned in `ordered_ids` are appended in their **original**
///   `Vec` order — preserving "newly-added items remain at end" semantics.
/// - Unknown ids in `ordered_ids` are silently skipped.
/// - Duplicate ids in `ordered_ids` are deduplicated (first occurrence wins).
///
/// Implementation note: we snapshot the original `Vec` order **before** moving
/// items into a `HashMap`, because `HashMap` iteration order is undefined and
/// would otherwise produce non-deterministic ordering for trailing items.
pub fn apply_reorder<T: HasId>(items: Vec<T>, ordered_ids: &[String]) -> Vec<T> {
    use std::collections::{HashMap, HashSet};

    // Snapshot original order BEFORE moving items into the HashMap.
    let original_order: Vec<String> = items.iter().map(|i| i.id().to_string()).collect();

    // Move items into a HashMap for O(1) extraction by id.
    let mut by_id: HashMap<String, T> = items
        .into_iter()
        .map(|i| (i.id().to_string(), i))
        .collect();

    let mut result: Vec<T> = Vec::with_capacity(by_id.len());
    let mut seen: HashSet<String> = HashSet::new();

    // Pass 1: emit items in the requested order, dedup via `seen`, skip unknowns.
    for id in ordered_ids {
        if seen.contains(id) {
            continue;
        }
        if let Some(item) = by_id.remove(id) {
            seen.insert(id.clone());
            result.push(item);
        }
    }

    // Pass 2: append remaining items in *original_order* (deterministic),
    // not via HashMap iteration.
    for id in &original_order {
        if let Some(item) = by_id.remove(id) {
            result.push(item);
        }
    }

    result
}

// ============================================================================
// Hierarchy validator (V1 category hierarchy — see 03_tech_plan V2 §3.2)
// ============================================================================

/// Errors returned by [`validate_hierarchy`].
///
/// Each variant maps to a single, user-meaningful invariant. The `Display`
/// impl is the message surfaced through the IPC boundary
/// (`set_category_parent` / `update_category` map this to `Err(String)`).
///
/// `#[allow(dead_code)]`: the variants are constructed only by
/// [`validate_hierarchy`] and consumed by IPC commands T1c/T1d (per
/// 03_tech_plan V2 §3.3). T1b ships the validator + tests in isolation,
/// so the lib-only build sees the variants as unused until T1c/T1d land.
#[allow(dead_code)]
#[derive(Debug, PartialEq, Eq)]
pub enum HierarchyError {
    /// Setting a category as its own parent (a 1-cycle).
    SelfAsParent,
    /// Setting parent_id would create a cycle in the parent chain.
    Cycle,
    /// Operation would push depth past the project hard limit
    /// (root + one layer of children, i.e. max depth = 2).
    DepthExceeded,
    /// `new_parent_id` does not refer to any existing category.
    OrphanParent,
    /// Demoting a category that itself has children would push them past
    /// the depth limit.
    DemoteWithChildren,
}

impl std::fmt::Display for HierarchyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SelfAsParent => write!(f, "Cannot set category as its own parent"),
            Self::Cycle => write!(f, "Setting parent would create a cycle"),
            Self::DepthExceeded => write!(f, "Hierarchy depth limit exceeded (max 2)"),
            Self::OrphanParent => write!(f, "Parent category not found"),
            Self::DemoteWithChildren => write!(f, "Cannot demote a category that has children"),
        }
    }
}

impl std::error::Error for HierarchyError {}

/// Pure validator for category hierarchy mutations.
///
/// Called by `set_category_parent` and by `update_category` whenever the
/// parent_id is being changed. Holding the `DATA_MUTEX` guard around the
/// `read_app_data()` → `validate_hierarchy()` → `write_app_data()` block is
/// the responsibility of the caller; this function is pure (no IO, no lock).
///
/// # Arguments
/// - `categories`: the full category list snapshot (held under DATA_MUTEX).
/// - `target_id`: the category whose parent_id is changing.
/// - `new_parent_id`: the desired new parent. `None` = promote to root.
///
/// # Returns
/// `Ok(())` if the requested mutation preserves all hierarchy invariants;
/// otherwise the matching [`HierarchyError`].
///
/// # Invariants enforced
/// 1. Root promotion (`new_parent_id == None`) is always valid — no cycle,
///    depth, or orphan check applies.
/// 2. A category cannot be its own parent (`SelfAsParent`).
/// 3. The new parent must be a root (`parent_id == None`); otherwise the
///    target would land at depth 2, exceeding the max-depth-2 hard limit
///    (`DepthExceeded`).
/// 4. The new parent must exist in the snapshot (`OrphanParent`).
/// 5. The parent chain reachable from `new_parent_id` must not contain
///    `target_id` (`Cycle`). With max-depth-2 this is normally redundant
///    with rule 3, but the loop defensively walks up to 32 hops to also
///    catch pre-existing data corruption (e.g. hand-edited data.json or
///    downgrade-then-upgrade of the schema).
/// 6. If the target itself has children, demoting it (any `Some(_)` parent)
///    would push the children to depth 2 (`DemoteWithChildren`). D5 = B-1
///    (`_synthesis_decisions` §3) is enforced at the front-end UX layer;
///    this check guards the data invariant only.
///
/// Complexity: O(n) for the orphan + depth + has-children scans, plus
/// O(min(n, 32)) for the cycle walk. With the project's 50-category target,
/// this is well under the < 1ms budget (R2 §11 / 03 V2 §11).
///
/// `#[allow(dead_code)]`: T1c (`set_category_parent`) and T1d
/// (`update_category` parent_id branch + `add_category` parent_id branch)
/// are the consumers; until they land, the lib-only build sees this as
/// unused. Tests in `hierarchy_validator_tests` exercise it.
#[allow(dead_code)]
pub fn validate_hierarchy(
    categories: &[Category],
    target_id: &str,
    new_parent_id: Option<&str>,
) -> Result<(), HierarchyError> {
    // Rule 1: Promotion to root is always valid.
    let Some(new_parent_id) = new_parent_id else {
        return Ok(());
    };

    // Rule 2: Self-as-parent (1-cycle).
    if new_parent_id == target_id {
        return Err(HierarchyError::SelfAsParent);
    }

    // Rule 4: Orphan — the new parent must exist.
    let new_parent = categories
        .iter()
        .find(|c| c.id == new_parent_id)
        .ok_or(HierarchyError::OrphanParent)?;

    // Rule 3: Depth — the new parent must itself be a root.
    // (If it has a parent, target would land at depth 2.)
    if new_parent.parent_id.is_some() {
        return Err(HierarchyError::DepthExceeded);
    }

    // Rule 5: Cycle — walk the new parent's ancestor chain. Currently
    // redundant with rule 3 under max-depth-2, but defensive against
    // pre-existing data corruption (hand-edited data.json with deeper
    // chains, or future relaxation of MAX_DEPTH).
    let mut current = Some(new_parent);
    let mut hops: usize = 0;
    while let Some(p) = current {
        if p.id == target_id {
            return Err(HierarchyError::Cycle);
        }
        current = p
            .parent_id
            .as_deref()
            .and_then(|pid| categories.iter().find(|c| c.id == pid));
        hops += 1;
        if hops > 32 {
            // Defensive bailout: pre-existing data corruption (longer than
            // any legitimate hierarchy could reach). Treat as a cycle so
            // the mutation is rejected rather than spinning.
            return Err(HierarchyError::Cycle);
        }
    }

    // Rule 6: Demote-with-children — if the target itself has any children,
    // any non-None new_parent_id would push those children past the limit.
    let target_has_children = categories
        .iter()
        .any(|c| c.parent_id.as_deref() == Some(target_id));
    if target_has_children {
        return Err(HierarchyError::DemoteWithChildren);
    }

    Ok(())
}

/// Read application data.
///
/// On a clean install (`data.json` missing) returns `AppData::default()`.
/// On I/O error reading the file (permission denied, hardware fault) the
/// error propagates — recovering from a backup we likely also cannot read
/// would just mask the underlying issue.
///
/// On **parse failure** (truncated / corrupt JSON — typically caused by an
/// interrupted previous write, hand-editing accidents, or partial file
/// sync), `read_app_data` performs a one-step recovery:
///   1. Try `data.json.bak` (the 1-slot rolling backup written by
///      `write_app_data`). If it parses, return it.
///   2. Otherwise, rename the corrupt `data.json` to
///      `data.json.corrupt.<unix_ts>` so the next launch does not loop on
///      the same parse failure and so the user (or a support session) can
///      inspect the bytes. Return `AppData::default()`.
///
/// This recovery contract is what makes the app survive `F14`+`F15`
/// (R5 / R6): a power loss or disk-full event during write can no longer
/// brick the app into a permanent "every IPC fails" state.
#[tauri::command]
pub fn read_app_data() -> Result<AppData, String> {
    let data_path = get_data_file_path();

    if !data_path.exists() {
        return Ok(AppData::default());
    }

    let content = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<AppData>(&content) {
        Ok(data) => Ok(data),
        Err(parse_err) => {
            // V2 (bug-audit B-12): surface the recovery path to stderr so
            // a future support investigation can find this in Console.app.
            // Silent fallback to default would otherwise look like "user
            // lost their data for no reason".
            eprintln!(
                "[read_app_data] data.json parse failed ({}); attempting .bak recovery",
                parse_err
            );

            // Step 1: try the 1-slot rolling backup.
            let bak_path = data_path.with_extension("json.bak");
            if let Ok(bak_content) = fs::read_to_string(&bak_path) {
                if let Ok(bak_data) = serde_json::from_str::<AppData>(&bak_content) {
                    eprintln!("[read_app_data] recovered from data.json.bak");
                    return Ok(bak_data);
                }
            }

            // Step 2: quarantine the corrupt main file so the next launch
            // does not re-enter the same recovery loop. Best-effort: any
            // failure here still falls through to returning a default
            // AppData — we never want to leave the user stuck.
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs().to_string())
                .unwrap_or_else(|_| "unknown".to_string());
            let stamped =
                data_path.with_file_name(format!("data.json.corrupt.{ts}"));
            let _ = fs::rename(&data_path, &stamped);
            eprintln!(
                "[read_app_data] .bak also unusable; quarantined corrupt file to {:?}, returning empty AppData",
                stamped
            );

            Ok(AppData::default())
        }
    }
}

/// Write application data atomically, preserving a single rolling backup.
///
/// Sequence:
///   1. Serialize `data` to JSON. If serialization fails, return Err
///      immediately — no disk side-effect has occurred.
///   2. Ensure parent directory exists.
///   3. **Best-effort backup**: copy current `data.json` → `data.json.bak`.
///      Failures (disk full, etc.) are intentionally swallowed; a backup
///      failure must not block the primary write that the user requested.
///   4. **Atomic primary write**:
///        - Write the full JSON to `data.json.tmp` in the same directory.
///        - `sync_all()` to force fsync — POSIX `rename` is atomic on the
///          directory entry, but only an fsync guarantees the bytes are on
///          stable storage before the rename swap.
///        - `fs::rename("data.json.tmp", "data.json")` — atomic on the
///          same filesystem (which is always the case here because the
///          tmp file is in the same directory).
///
/// Signature (`fn(AppData) -> Result<(), String>`) is unchanged from prior
/// revisions — all ~70 callsites across `data.rs`, `skills.rs`, `mcps.rs`,
/// `rules.rs`, `claude_md.rs`, `marketplace.rs`, `import.rs`, `trash.rs`
/// continue to work without modification.
#[tauri::command]
pub fn write_app_data(data: AppData) -> Result<(), String> {
    let data_path = get_data_file_path();

    // (1) Serialize first — if this fails, no disk side-effect happens.
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;

    // (2) Ensure directory exists.
    if let Some(parent) = data_path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    // (3) Best-effort backup of the current `data.json`. Errors are
    // intentionally swallowed: backup failure must not block the primary
    // write. If `data.json` does not yet exist (first write), there's
    // nothing to back up — `fs::copy` returns Err which we ignore.
    let bak_path = data_path.with_extension("json.bak");
    let _ = fs::copy(&data_path, &bak_path);

    // (4) Atomic primary write: tmp + fsync + rename. The tmp path sits in
    // the same directory as the target so POSIX rename atomicity holds.
    let tmp_path = data_path.with_extension("json.tmp");
    {
        let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        file.write_all(json.as_bytes())
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    } // file dropped/closed here so rename can proceed on Windows-like fs

    fs::rename(&tmp_path, &data_path).map_err(|e| e.to_string())?;

    Ok(())
}

/// Read application settings
#[tauri::command]
pub fn read_settings() -> Result<AppSettings, String> {
    let settings_path = get_settings_file_path();

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
        let settings: AppSettings = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(settings)
    } else {
        Ok(AppSettings::default())
    }
}

/// Write application settings
#[tauri::command]
pub fn write_settings(settings: AppSettings) -> Result<(), String> {
    let settings_path = get_settings_file_path();

    // Ensure directory exists
    if let Some(parent) = settings_path.parent() {
        ensure_dir(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&settings_path, json).map_err(|e| e.to_string())?;

    Ok(())
}

/// Initialize application data directory and default data
#[tauri::command]
pub fn init_app_data() -> Result<(), String> {
    let app_dir = get_app_data_dir();
    ensure_dir(&app_dir).map_err(|e| e.to_string())?;

    // Create skills directory
    let skills_dir = app_dir.join("skills");
    ensure_dir(&skills_dir).map_err(|e| e.to_string())?;

    // Create mcps directory
    let mcps_dir = app_dir.join("mcps");
    ensure_dir(&mcps_dir).map_err(|e| e.to_string())?;

    // Initialize data.json if not exists
    let data_path = get_data_file_path();
    if !data_path.exists() {
        let default_data = AppData {
            categories: vec![
                Category {
                    id: Uuid::new_v4().to_string(),
                    name: "Development".to_string(),
                    color: "#3B82F6".to_string(),
                    count: 0,
                    parent_id: None,
                },
                Category {
                    id: Uuid::new_v4().to_string(),
                    name: "Writing".to_string(),
                    color: "#10B981".to_string(),
                    count: 0,
                    parent_id: None,
                },
                Category {
                    id: Uuid::new_v4().to_string(),
                    name: "Analysis".to_string(),
                    color: "#F59E0B".to_string(),
                    count: 0,
                    parent_id: None,
                },
            ],
            tags: vec![],
            scenes: vec![],
            projects: vec![],
            skill_metadata: std::collections::HashMap::new(),
            mcp_metadata: std::collections::HashMap::new(),
            trashed_scenes: vec![],
            trashed_projects: vec![],
            imported_plugin_skills: vec![],
            imported_plugin_mcps: vec![],
            claude_md_files: vec![],
            global_claude_md_id: None,
            rules: vec![],
            has_completed_category_id_migration: false,
            last_edited_scene_id: None,
            imported_marketplace_skills: vec![],
        };
        write_app_data(default_data)?;
    }

    // Initialize settings.json if not exists
    let settings_path = get_settings_file_path();
    if !settings_path.exists() {
        write_settings(AppSettings::default())?;
    }

    Ok(())
}

// ============ Categories ============

/// Get all categories
#[tauri::command]
pub fn get_categories() -> Result<Vec<Category>, String> {
    let data = read_app_data()?;
    Ok(data.categories)
}

/// Add a new category. `parentId = None` (key absent in JS payload, or
/// explicitly `undefined`) creates a root-level category;
/// `parentId = Some(id)` creates a child of the category referenced by `id`.
///
/// V1 hierarchy (03_tech_plan V2 §3.3.1): `parentId` uses a single
/// `Option<String>` (not `Option<Option<String>>`) because there is no
/// "do not modify" semantic during creation — every newly created
/// category is either a root or a direct child. The three-state
/// `Option<Option<String>>` pattern is reserved for `update_category`
/// (§3.3.2) where "do not modify" is meaningful.
///
/// Validates hierarchy invariants (under DATA_MUTEX) inline rather than via
/// `validate_hierarchy`: the latter requires a `target_id` that exists in
/// the snapshot, which a brand-new UUID does not. We instead inline the
/// relevant subset:
/// - F2 depth: if `parentId = Some(id)`, the referenced category must
///   itself be a root (`parent_id == None`); otherwise the new category
///   would land at depth 2 → `HierarchyError::DepthExceeded`.
/// - F3 orphan: if `parentId = Some(id)`, the referenced category must
///   exist in the snapshot → `HierarchyError::OrphanParent` otherwise.
///
/// Cycle / self-as-parent / demote-with-children all trivially pass for a
/// brand-new category (its UUID does not yet appear in any chain) and are
/// not checked.
#[tauri::command]
#[allow(non_snake_case)]
pub fn add_category(
    name: String,
    color: String,
    parentId: Option<String>,
) -> Result<Category, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Inline hierarchy guard for the create path. Mirrors the orphan +
    // depth subset of `validate_hierarchy` without needing a target_id.
    if let Some(pid) = parentId.as_deref() {
        let parent = data
            .categories
            .iter()
            .find(|c| c.id == pid)
            .ok_or_else(|| HierarchyError::OrphanParent.to_string())?;
        if parent.parent_id.is_some() {
            return Err(HierarchyError::DepthExceeded.to_string());
        }
    }

    let category = Category {
        id: Uuid::new_v4().to_string(),
        name,
        color,
        count: 0,
        parent_id: parentId,
    };

    data.categories.push(category.clone());
    write_app_data(data)?;

    Ok(category)
}

/// Update a category. `name` and `color` follow the existing two-state
/// `Option<T>` semantic (None = do not modify, Some(_) = set). `parentId`
/// uses the three-state `Option<Option<String>>` pattern (V2 [P1-6]):
///
/// - **outer `None`** (JS payload omits the key OR sends `undefined`)
///   → "do not modify the parent_id"
/// - **outer `Some(None)`** (JS payload sends `null`)
///   → "clear the parent_id (promote to root)"
/// - **outer `Some(Some(id))`** (JS payload sends `{ parentId: "id" }`)
///   → "set parent_id to the given id"
///
/// When `parentId` is provided (outer `Some(_)`), the change is validated
/// via `validate_hierarchy` against the current snapshot under DATA_MUTEX.
/// Frontend callers that don't change parent (the V3 `appStore.updateCategory(id, name?, color?)`
/// path) simply omit the key — backend receives outer `None` → leaves
/// `category.parent_id` untouched (V3 backward compat preserved).
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_category(
    id: String,
    name: Option<String>,
    color: Option<String>,
    parentId: Option<Option<String>>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // If parent change requested, validate hierarchy (cycle / depth /
    // orphan / demote-with-children) before mutating.
    if let Some(new_parent_id_opt) = parentId.as_ref() {
        validate_hierarchy(&data.categories, &id, new_parent_id_opt.as_deref())
            .map_err(|e| e.to_string())?;
    }

    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
        if let Some(n) = name {
            category.name = n;
        }
        if let Some(c) = color {
            category.color = c;
        }
        if let Some(new_parent_id_opt) = parentId {
            category.parent_id = new_parent_id_opt;
        }
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Category not found".to_string())
    }
}

/// Delete a category and cascade-promote all of its children to root level
/// (set their `parent_id` to `None`). This preserves Skill/MCP/ClaudeMd
/// references — child categories survive the parent deletion, so any
/// downstream references via `category_id` remain valid.
///
/// V2 [P0-DATA-2] (per `_v2_patch_plan` §3.5 + 03_tech_plan V2 §3.6):
/// when a promoted child's name collides with an existing root name (or
/// with another about-to-promote sibling), we disambiguate by renaming to
/// `"<original_name> (<deleted_parent_name>)"`, appending a numeric suffix
/// (`" 2"`, `" 3"`, ...) if the suffixed name itself collides. Each
/// disambiguation is logged to stderr for traceability.
///
/// Skill/MCP/ClaudeMd metadata pointing to the *deleted* category itself is
/// NOT cleaned up here (the `category_id` becomes a dangling reference,
/// falling back to the cached `category` name field at display time, and
/// rendering as "Uncategorized" once the user explicitly clears it). This
/// matches the D7/D14 separation: removing a parent does NOT silently
/// re-categorize its content.
///
/// The bare-deletion path (no children) is unchanged from V3 — only when
/// the deleted category has at least one direct child do we walk the
/// disambiguation logic, so leaf deletes remain a single `retain` call.
#[tauri::command]
pub fn delete_category(id: String) -> Result<(), String> {
    use std::collections::HashSet;

    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find the deleted parent's name up-front (used for the disambiguation
    // suffix). Looked up before any mutation so the borrow is short.
    let deleted_parent_name = data
        .categories
        .iter()
        .find(|c| c.id == id)
        .map(|c| c.name.clone());

    // Collect the existing root-level name set, excluding the to-be-deleted
    // parent itself. Mutable so each successive promoted sibling
    // disambiguates against earlier promoted siblings too — this matters
    // when two children of the deleted parent share a name.
    let mut root_names: HashSet<String> = data
        .categories
        .iter()
        .filter(|c| c.parent_id.is_none() && c.id != id)
        .map(|c| c.name.clone())
        .collect();

    // Promote children, suffixing names that would collide with existing
    // roots. Max depth = 2 means "child of child" cannot exist, so a single
    // pass over the flat Vec is enough. The mutable borrow here releases
    // before the trailing `retain` call below.
    for cat in data.categories.iter_mut() {
        if cat.parent_id.as_deref() == Some(&id) {
            cat.parent_id = None;
            if root_names.contains(&cat.name) {
                if let Some(parent_name) = &deleted_parent_name {
                    let original_name = cat.name.clone();
                    let mut new_name = format!("{original_name} ({parent_name})");
                    let mut suffix = 2;
                    while root_names.contains(&new_name) {
                        new_name = format!("{original_name} ({parent_name}) {suffix}");
                        suffix += 1;
                    }
                    eprintln!(
                        "[delete_category] disambiguating promoted child '{original_name}' -> '{new_name}' (parent was '{parent_name}')"
                    );
                    root_names.insert(new_name.clone());
                    cat.name = new_name;
                } else {
                    // Defensive: should never happen — `deleted_parent_name`
                    // is None only when `id` doesn't match any category, in
                    // which case there are no children to promote either.
                    // Insert the original name to keep `root_names`
                    // consistent for any subsequent sibling.
                    root_names.insert(cat.name.clone());
                }
            } else {
                // No collision: name lands as-is, but reserve it in the
                // running set so the next promoted sibling (if any) sees it.
                root_names.insert(cat.name.clone());
            }
        }
    }

    // Now remove the deleted category itself.
    data.categories.retain(|c| c.id != id);

    // Cascade clear: any skill / mcp / CLAUDE.md metadata that referenced
    // the deleted category must drop the reference, otherwise downstream
    // reads (`scan_skills`, `scan_mcps`) hand the front-end a dangling
    // category_id / stale category name and the item appears in nowhere-
    // visible state (not under any sidebar category, but the detail panel
    // shows the now-deleted category name as if it still applied).
    //
    // Match by id first (the canonical reference). For legacy entries where
    // metadata only carries the name (pre-`category_id` migration), fall
    // back to a name match so they get cleaned up too. Clearing both fields
    // (category_id AND category) leaves the metadata in a clean "no
    // category" state regardless of which read path the UI uses.
    let deleted_name = deleted_parent_name.clone();
    for meta in data.skill_metadata.values_mut() {
        let by_id = meta.category_id.as_deref() == Some(&id);
        let by_name = deleted_name.as_deref().is_some_and(|n| meta.category == n);
        if by_id || by_name {
            meta.category_id = None;
            meta.category = String::new();
        }
    }
    for meta in data.mcp_metadata.values_mut() {
        let by_id = meta.category_id.as_deref() == Some(&id);
        let by_name = deleted_name.as_deref().is_some_and(|n| meta.category == n);
        if by_id || by_name {
            meta.category_id = None;
            meta.category = String::new();
        }
    }
    for file in data.claude_md_files.iter_mut() {
        if file.category_id.as_deref() == Some(&id) {
            file.category_id = None;
        }
    }
    // Cascade Rules in the same pattern as claude_md_files. The Rule entity
    // was added after the original cascade block was written; without this
    // loop a deleted-category id remained as a dangling reference on
    // `Rule.category_id`, leaving the rule in a "ghost" state — invisible
    // under every sidebar Category page (the referenced category no longer
    // exists) and also not surfaced under Uncategorized.
    // Bug Audit 2026-05-15 finding A6 (R1::A4 / R3::F2).
    for rule in data.rules.iter_mut() {
        if rule.category_id.as_deref() == Some(&id) {
            rule.category_id = None;
        }
    }

    write_app_data(data)?;
    Ok(())
}

/// Reorder categories. Returns the resulting `Vec<Category>` for client-side
/// calibration: the front-end performs an optimistic update before this IPC
/// returns, then reconciles with the canonical backend order.
#[tauri::command]
#[allow(non_snake_case)]
pub fn reorder_categories(orderedIds: Vec<String>) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    data.categories = apply_reorder(data.categories, &orderedIds);
    let result = data.categories.clone();
    write_app_data(data)?;
    Ok(result)
}

/// Set or unset a category's parent. `newParentId = None` promotes the
/// category to root level (it becomes a top-level row in the sidebar);
/// `newParentId = Some(id)` demotes it to a child of the referenced
/// category. Validates all hierarchy invariants under DATA_MUTEX
/// (D13 = A backend hard validate, 03_tech_plan V2 §3.3.3).
///
/// Returns the resulting `Vec<Category>` for client-side calibration —
/// the front-end applies optimistic state then reconciles with this
/// canonical Vec.
///
/// V2 [P1-6] note: this IPC accepts `newParentId: Option<String>` (single
/// Option, not three-state `Option<Option<String>>`). The "do not modify"
/// path is not meaningful here — the entire purpose of the command is to
/// modify `parent_id`. The Option semantics are:
/// - `None` (key omitted in JS payload, or sent as `null`) → promote to root
/// - `Some(id)` → demote to child of that id
#[tauri::command]
#[allow(non_snake_case)]
pub fn set_category_parent(
    id: String,
    newParentId: Option<String>,
) -> Result<Vec<Category>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Reject unknown target ids early — `validate_hierarchy` does not check
    // the existence of `target_id` itself (it only walks `new_parent_id`'s
    // ancestor chain for cycle detection), so we must guard here.
    if !data.categories.iter().any(|c| c.id == id) {
        return Err("Category not found".to_string());
    }

    // Hierarchy validation (D13 = A backend hard validate). Covers
    // self-as-parent, depth-exceeded, orphan-parent, multi-hop cycles,
    // and demote-with-children — see `validate_hierarchy` doc comments.
    validate_hierarchy(&data.categories, &id, newParentId.as_deref())
        .map_err(|e| e.to_string())?;

    // Apply the parent_id change.
    if let Some(category) = data.categories.iter_mut().find(|c| c.id == id) {
        category.parent_id = newParentId;
    }

    let result = data.categories.clone();
    write_app_data(data)?;
    Ok(result)
}

/// One-time migration: backfill `category_id` for every `SkillMetadata` and
/// `McpMetadata` entry by looking up `category` (name) against the current
/// `categories` Vec.
///
/// Idempotent at three layers (per `03_tech_plan.md` V2 §3.7 +
/// `_v2_patch_plan.md` §3.3 / §3.4):
/// 1. **AppData flag**: when `data.has_completed_category_id_migration` is
///    already `true`, return an empty report immediately (zero work).
/// 2. **Per-entry guard**: entries whose `category_id.is_some()` are skipped —
///    they have already been migrated in a previous run that found orphans.
/// 3. **Empty-name guard**: entries whose `category` is the empty string are
///    treated as genuinely uncategorized and neither migrated nor reported as
///    orphans.
///
/// **Flag advancement (per Phase-1 audit P0-1 → 03_tech_plan V2 §3.4)**:
/// the flag is advanced to `true` after one full pass regardless of orphan
/// presence. Orphans are a terminal state — re-running migration on every
/// launch will not resolve them on its own (the user must rename or
/// re-classify). The orphan list is surfaced via `MigrationReport.orphaned_*`
/// for the front-end to display. The same-level Decisional contradiction
/// with `_v2_patch_plan.md` §3.4 (which said "any orphan → flag stays false")
/// has been resolved in favour of `03_tech_plan.md` V2 §3.4 by main-agent
/// ruling on 2026-05-04.
///
/// **Concurrency**: held under `DATA_MUTEX` for the entire
/// read → mutate → write window so concurrent reorder / set_parent / add
/// callers cannot interleave between the snapshot and the persist.
///
/// **Storage location**: the flag lives in [`AppData`] (NOT [`AppSettings`]).
/// V2 [P0-DATA-1] moved it here to bypass the
/// `settingsStore.saveSettings` enumerate risk that would otherwise reset
/// the flag every time the user touches any setting.
///
/// **Failure model**: if `write_app_data` fails (disk full, permission, …),
/// `?` propagates the error to the caller; the in-memory mutation is
/// discarded; the on-disk flag stays `false`; next launch retries.
///
/// **Note**: only the persisted layer (`skill_metadata` / `mcp_metadata` in
/// `data.json`) is mutated. Runtime [`Skill`] / [`McpServer`] are
/// re-derived by `scan_skills` / `scan_mcps` from metadata + filesystem on
/// next scan, so they pick up the new `category_id` automatically.
#[tauri::command]
pub fn migrate_category_id_for_skills_mcps() -> Result<MigrationReport, String> {
    use std::collections::HashMap;

    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Layer 1 idempotence: already-migrated runs return an empty report.
    if data.has_completed_category_id_migration {
        return Ok(MigrationReport::default());
    }

    // Build name → id index (one pass over categories).
    let categories_by_name: HashMap<String, String> = data
        .categories
        .iter()
        .map(|c| (c.name.clone(), c.id.clone()))
        .collect();

    let mut report = MigrationReport::default();

    // Skill metadata pass.
    for (skill_id, meta) in data.skill_metadata.iter_mut() {
        // Layer 2 idempotence: already migrated → skip.
        if meta.category_id.is_some() {
            continue;
        }
        // Layer 3 guard: empty category = genuinely uncategorized.
        if meta.category.is_empty() {
            continue;
        }
        match categories_by_name.get(&meta.category) {
            Some(id) => {
                meta.category_id = Some(id.clone());
                report.migrated_skills += 1;
            }
            None => {
                eprintln!(
                    "[migrate_category_id] orphan skill_metadata id='{}' category='{}' \
                     — leaving unchanged (terminal state, surfaced via report.orphaned_*)",
                    skill_id, meta.category
                );
                report.orphaned_skills.push(skill_id.clone());
            }
        }
    }

    // Mcp metadata pass.
    for (mcp_id, meta) in data.mcp_metadata.iter_mut() {
        if meta.category_id.is_some() {
            continue;
        }
        if meta.category.is_empty() {
            continue;
        }
        match categories_by_name.get(&meta.category) {
            Some(id) => {
                meta.category_id = Some(id.clone());
                report.migrated_mcps += 1;
            }
            None => {
                eprintln!(
                    "[migrate_category_id] orphan mcp_metadata id='{}' category='{}' \
                     — leaving unchanged (terminal state, surfaced via report.orphaned_*)",
                    mcp_id, meta.category
                );
                report.orphaned_mcps.push(mcp_id.clone());
            }
        }
    }

    // Flag advancement: orphans are a terminal state (the metadata's `category`
    // string does not match any current Category — the user must rename or
    // re-classify manually). Re-running migration on every launch would never
    // resolve orphans on its own and would add IO churn. So we advance the
    // flag once the migration pass has run, regardless of orphan presence.
    // The `report.orphaned_*` lists are returned to the front-end for UI
    // surfacing if needed.
    //
    // Per Phase-1 audit P0-1: this matches `03_tech_plan` V2 §3.4
    // (Decisional). The `_v2_patch_plan` §3.4 wording — which said "any
    // orphan → flag stays false" — has been superseded; same-level
    // contradiction resolved by main-agent ruling.
    data.has_completed_category_id_migration = true;
    write_app_data(data)?;
    Ok(report)
}

// ============ Tags ============

/// Get all tags
#[tauri::command]
pub fn get_tags() -> Result<Vec<Tag>, String> {
    let data = read_app_data()?;
    Ok(data.tags)
}

/// Add a new tag
#[tauri::command]
pub fn add_tag(name: String) -> Result<Tag, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let tag = Tag {
        id: Uuid::new_v4().to_string(),
        name,
        count: 0,
    };

    data.tags.push(tag.clone());
    write_app_data(data)?;

    Ok(tag)
}

/// Update a tag
#[tauri::command]
pub fn update_tag(id: String, name: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if let Some(tag) = data.tags.iter_mut().find(|t| t.id == id) {
        tag.name = name;
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Tag not found".to_string())
    }
}

/// Delete a tag
#[tauri::command]
pub fn delete_tag(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find the tag by id before we drop it — skill/mcp metadata reference
    // tags by name (legacy: there's no `tag_ids` mirror, only `tags: Vec<String>`).
    // CLAUDE.md is id-based (`tag_ids: Vec<String>`).
    let deleted_name = data
        .tags
        .iter()
        .find(|t| t.id == id)
        .map(|t| t.name.clone());

    data.tags.retain(|t| t.id != id);

    // Cascade clear from every item that carried the tag. Without this the
    // tag name persists in `SkillMetadata.tags` even though the canonical
    // Tag entry is gone — the UI then renders an "orphan tag" pill that
    // points to nowhere, and a future `add_tag` with the same name would
    // collide silently.
    if let Some(name) = &deleted_name {
        for meta in data.skill_metadata.values_mut() {
            meta.tags.retain(|t| t != name);
        }
        for meta in data.mcp_metadata.values_mut() {
            meta.tags.retain(|t| t != name);
        }
    }
    for file in data.claude_md_files.iter_mut() {
        file.tag_ids.retain(|t| t != &id);
    }
    // Cascade Rules.tag_ids — same rationale as the category cascade above.
    // Without this, a deleted tag id persists in `Rule.tag_ids`, the rule's
    // tag pill links to a no-longer-existing Tag, and a later `add_tag` with
    // the same name would re-attach the orphan reference silently.
    // Bug Audit 2026-05-15 finding A6 (R1::A4 / R3::F2).
    for rule in data.rules.iter_mut() {
        rule.tag_ids.retain(|t| t != &id);
    }

    write_app_data(data)?;
    Ok(())
}

/// Reset every auto-classify-produced classification in one atomic write.
///
/// Clears `data.categories`, `data.tags`, every item's `category` / `category_id`
/// / `tags` (Skills + MCPs) and every CLAUDE.md file's `category_id` / `tag_ids`.
/// **Items themselves are NOT removed** — only their classification assignments.
///
/// The UX surface is the Settings page "Reset auto-classify data" button. Users
/// reach for it after a manual `Auto Classify` run whose results they dislike —
/// the alternative was deleting categories one by one in the sidebar, then
/// tags one by one (the latter being especially tedious when a single run
/// produced 20+ tags). Single atomic IPC keeps backend writes consistent and
/// avoids partial-state windows the UI would need to handle.
///
/// Tests / data-migration code that calls this should NOT rely on it being
/// idempotent in any deeper sense — repeated calls all settle on the same
/// final state (everything cleared) which is the only relevant invariant.
#[tauri::command]
pub fn reset_auto_classify_data() -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    data.categories.clear();
    data.tags.clear();

    for meta in data.skill_metadata.values_mut() {
        meta.category = String::new();
        meta.category_id = None;
        meta.tags.clear();
    }
    for meta in data.mcp_metadata.values_mut() {
        meta.category = String::new();
        meta.category_id = None;
        meta.tags.clear();
    }
    for file in data.claude_md_files.iter_mut() {
        file.category_id = None;
        file.tag_ids.clear();
    }
    // V2 (bug-audit A6-2): Rules are first-class entities; reset must
    // cascade to them too, mirroring delete_category / delete_tag cascade.
    for rule in data.rules.iter_mut() {
        rule.category_id = None;
        rule.tag_ids.clear();
    }

    write_app_data(data)?;
    Ok(())
}

/// Reorder tags. Returns the resulting `Vec<Tag>` for client-side calibration.
#[tauri::command]
#[allow(non_snake_case)]
pub fn reorder_tags(orderedIds: Vec<String>) -> Result<Vec<Tag>, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    data.tags = apply_reorder(data.tags, &orderedIds);
    let result = data.tags.clone();
    write_app_data(data)?;
    Ok(result)
}

// ============ Scenes ============

/// Get all scenes
#[tauri::command]
pub fn get_scenes() -> Result<Vec<Scene>, String> {
    let data = read_app_data()?;
    Ok(data.scenes)
}

/// Add a new scene
#[tauri::command]
#[allow(non_snake_case)]
pub fn add_scene(
    name: String,
    description: String,
    icon: String,
    skillIds: Vec<String>,
    mcpIds: Vec<String>,
    claudeMdIds: Option<Vec<String>>,
    ruleIds: Option<Vec<String>>,
) -> Result<Scene, String> {
    println!("add_scene called: name={}, skillIds={:?}, mcpIds={:?}, claudeMdIds={:?}, ruleIds={:?}", name, skillIds, mcpIds, claudeMdIds, ruleIds);
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;
    println!("Current scenes count: {}", data.scenes.len());

    let scene = Scene {
        id: Uuid::new_v4().to_string(),
        name,
        description,
        icon,
        skill_ids: skillIds,
        mcp_ids: mcpIds,
        claude_md_ids: claudeMdIds.unwrap_or_default(),
        rule_ids: ruleIds.unwrap_or_default(),
        created_at: chrono::Utc::now().to_rfc3339(),
        last_used: None,
    };

    data.scenes.push(scene.clone());
    // V2 Marketplace D-Imp-6: track most recently created/edited Scene so the
    // post-install ShortcutBanner can surface "Add to active Scene: <name>".
    data.last_edited_scene_id = Some(scene.id.clone());
    write_app_data(data)?;

    Ok(scene)
}

/// Update a scene
#[tauri::command]
pub fn update_scene(
    id: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    skill_ids: Option<Vec<String>>,
    mcp_ids: Option<Vec<String>>,
    claude_md_ids: Option<Vec<String>>,
    rule_ids: Option<Vec<String>>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if let Some(scene) = data.scenes.iter_mut().find(|s| s.id == id) {
        if let Some(n) = name {
            scene.name = n;
        }
        if let Some(d) = description {
            scene.description = d;
        }
        if let Some(i) = icon {
            scene.icon = i;
        }
        if let Some(s) = skill_ids {
            scene.skill_ids = s;
        }
        if let Some(m) = mcp_ids {
            scene.mcp_ids = m;
        }
        if let Some(c) = claude_md_ids {
            scene.claude_md_ids = c;
        }
        if let Some(r) = rule_ids {
            scene.rule_ids = r;
        }
        // V2 Marketplace D-Imp-6: any scene update bumps the active id so
        // the user's most recent intent drives the post-install short-cut.
        data.last_edited_scene_id = Some(id.clone());
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Scene not found".to_string())
    }
}

/// Delete a scene (soft delete - moves to trashed_scenes)
#[tauri::command]
pub fn delete_scene(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find and remove the scene from active scenes
    if let Some(index) = data.scenes.iter().position(|s| s.id == id) {
        let scene = data.scenes.remove(index);

        // Create TrashedScene with deleted_at timestamp
        let trashed_scene = TrashedScene {
            id: scene.id,
            name: scene.name,
            description: scene.description,
            icon: scene.icon,
            skill_ids: scene.skill_ids,
            mcp_ids: scene.mcp_ids,
            claude_md_ids: scene.claude_md_ids,
            rule_ids: scene.rule_ids,
            created_at: scene.created_at,
            last_used: scene.last_used,
            deleted_at: chrono::Utc::now().to_rfc3339(),
        };

        data.trashed_scenes.push(trashed_scene);
    }

    // V2 Marketplace D-Imp-6: when the deleted Scene was the active one,
    // fall back to the most recently `last_used` Scene (or None when no
    // Scenes remain). Keeps the ShortcutBanner from pointing at a Scene
    // that no longer exists.
    if data.last_edited_scene_id.as_deref() == Some(id.as_str()) {
        data.last_edited_scene_id = data
            .scenes
            .iter()
            .filter_map(|s| s.last_used.as_ref().map(|lu| (s.id.clone(), lu.clone())))
            .max_by(|a, b| a.1.cmp(&b.1))
            .map(|(id, _)| id)
            .or_else(|| data.scenes.last().map(|s| s.id.clone()));
    }

    write_app_data(data)?;
    Ok(())
}

// ============ Projects ============

/// Get all projects
#[tauri::command]
pub fn get_projects() -> Result<Vec<Project>, String> {
    let data = read_app_data()?;
    Ok(data.projects)
}

/// Add a new project
#[tauri::command]
#[allow(non_snake_case)]
pub fn add_project(name: String, path: String, sceneId: Option<String>) -> Result<Project, String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    let project = Project {
        id: Uuid::new_v4().to_string(),
        name,
        path,
        scene_id: sceneId.unwrap_or_default(),
        last_synced: None,
    };

    data.projects.push(project.clone());
    write_app_data(data)?;

    Ok(project)
}

/// Update a project
#[tauri::command]
#[allow(non_snake_case)]
pub fn update_project(
    id: String,
    name: Option<String>,
    path: Option<String>,
    sceneId: Option<String>,
    lastSynced: Option<String>,
) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    if let Some(project) = data.projects.iter_mut().find(|p| p.id == id) {
        if let Some(n) = name {
            project.name = n;
        }
        if let Some(p) = path {
            project.path = p;
        }
        if let Some(s) = sceneId {
            project.scene_id = s;
        }
        if let Some(l) = lastSynced {
            project.last_synced = Some(l);
        }
        write_app_data(data)?;
        Ok(())
    } else {
        Err("Project not found".to_string())
    }
}

/// Delete a project (soft delete - moves to trashed_projects)
#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut data = read_app_data()?;

    // Find and remove the project from active projects
    if let Some(index) = data.projects.iter().position(|p| p.id == id) {
        let project = data.projects.remove(index);

        // Create TrashedProject with deleted_at timestamp
        let trashed_project = TrashedProject {
            id: project.id,
            name: project.name,
            path: project.path,
            scene_id: project.scene_id,
            last_synced: project.last_synced,
            deleted_at: chrono::Utc::now().to_rfc3339(),
        };

        data.trashed_projects.push(trashed_project);
    }

    write_app_data(data)?;
    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod apply_reorder_tests {
    use super::*;

    fn cat(id: &str) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: None,
        }
    }

    fn ids(cs: &[Category]) -> Vec<&str> {
        cs.iter().map(|c| c.id.as_str()).collect()
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn basic_reorder() {
        let items = vec![cat("A"), cat("B"), cat("C")];
        let out = apply_reorder(items, &s(&["C", "A", "B"]));
        assert_eq!(ids(&out), vec!["C", "A", "B"]);
    }

    #[test]
    fn empty_ordered_ids_appends_all_in_original_order() {
        let items = vec![cat("A"), cat("B"), cat("C")];
        let out = apply_reorder(items, &s(&[]));
        assert_eq!(ids(&out), vec!["A", "B", "C"]);
    }

    #[test]
    fn partial_ordered_ids_appends_remainder_in_original_order() {
        let items = vec![cat("A"), cat("B"), cat("C")];
        let out = apply_reorder(items, &s(&["B"]));
        // B first (mentioned), then A and C in original Vec order.
        assert_eq!(ids(&out), vec!["B", "A", "C"]);
    }

    #[test]
    fn unknown_ids_silently_skipped() {
        let items = vec![cat("A"), cat("B"), cat("C")];
        let out = apply_reorder(items, &s(&["A", "X", "B", "C"]));
        // X is unknown: silently skipped. Result is A, B, C in given order.
        assert_eq!(ids(&out), vec!["A", "B", "C"]);
    }

    #[test]
    fn duplicate_ids_deduplicated_first_wins() {
        let items = vec![cat("A"), cat("B"), cat("C")];
        let out = apply_reorder(items, &s(&["A", "A", "B", "C"]));
        // Second "A" deduped (first occurrence wins).
        assert_eq!(ids(&out), vec!["A", "B", "C"]);
    }

    #[test]
    fn preserves_original_order_for_unmentioned_items() {
        let items = vec![cat("A"), cat("B"), cat("C"), cat("D")];
        let out = apply_reorder(items, &s(&["D", "B"]));
        // D, B (mentioned), then A, C in their original Vec order.
        assert_eq!(ids(&out), vec!["D", "B", "A", "C"]);
    }

    #[test]
    fn works_for_tags_too() {
        // HasId is implemented for Tag too — sanity-check the generic.
        let items = vec![
            Tag { id: "t1".into(), name: "one".into(), count: 0 },
            Tag { id: "t2".into(), name: "two".into(), count: 0 },
            Tag { id: "t3".into(), name: "three".into(), count: 0 },
        ];
        let out = apply_reorder(items, &s(&["t3", "t1"]));
        let out_ids: Vec<&str> = out.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(out_ids, vec!["t3", "t1", "t2"]);
    }
}

#[cfg(test)]
mod hierarchy_validator_tests {
    //! Pure unit tests for [`validate_hierarchy`] — no IO, no DATA_MUTEX.
    //!
    //! Each test seeds a small in-memory `Vec<Category>` and asserts the
    //! validator's verdict on a single (target_id, new_parent_id) pair.
    //! The fixture helper `cat()` constructs a category with a chosen
    //! `parent_id` and inert defaults for every other field, so each test
    //! reads as a single proposition about hierarchy invariants.
    //!
    //! Coverage map (one test per invariant from 03_tech_plan V2 §3.2):
    //! - Rule 1 (promote to root) → [`valid_flat_categories_pass`],
    //!   [`valid_two_level_hierarchy_pass`], [`empty_categories_pass`]
    //! - Rule 2 (self-as-parent)  → [`cycle_detected_self_loop`]
    //! - Rule 3 (depth)           → [`max_depth_exceeded`]
    //! - Rule 4 (orphan)          → [`orphaned_child_detected`]
    //! - Rule 5 (cycle walk)      → [`cycle_detected_two_node`],
    //!   [`multi_hop_cycle_defensive`]
    //! - Rule 6 (demote children) → [`cannot_demote_parent_with_children`]
    use super::*;

    /// Build a `Category` with a specific id + parent_id; inert defaults
    /// for every other field. Tests don't care about display fields.
    fn cat(id: &str, parent_id: Option<&str>) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: parent_id.map(|s| s.to_string()),
        }
    }

    #[test]
    fn empty_categories_pass() {
        // Edge case: empty list. Promote-to-root is always valid (rule 1)
        // even when the target itself isn't in the list — `validate` does
        // not require target_id to exist; the caller resolves it.
        let cats: Vec<Category> = vec![];
        assert_eq!(validate_hierarchy(&cats, "anything", None), Ok(()));
    }

    #[test]
    fn valid_flat_categories_pass() {
        // All categories are roots; promoting any of them to root again
        // is a no-op and must succeed (rule 1).
        let cats = vec![cat("A", None), cat("B", None), cat("C", None)];
        assert_eq!(validate_hierarchy(&cats, "A", None), Ok(()));
        assert_eq!(validate_hierarchy(&cats, "B", None), Ok(()));
        // Demoting a leaf root under another leaf root is the canonical
        // "make this a child of that" operation — must succeed because
        // neither side breaks any rule.
        assert_eq!(validate_hierarchy(&cats, "B", Some("A")), Ok(()));
    }

    #[test]
    fn valid_two_level_hierarchy_pass() {
        // Existing depth-2 hierarchy: P (root) + C (child of P).
        // Adding a second child of P (say X) is valid; promoting C back
        // to root is valid (rule 1 again).
        let cats = vec![
            cat("P", None),
            cat("C", Some("P")),
            cat("X", None),
        ];
        // X under P → valid (P is a root, X has no children)
        assert_eq!(validate_hierarchy(&cats, "X", Some("P")), Ok(()));
        // C → root → valid promotion
        assert_eq!(validate_hierarchy(&cats, "C", None), Ok(()));
    }

    #[test]
    fn cycle_detected_self_loop() {
        // Rule 2: setting A as its own parent is the smallest cycle.
        let cats = vec![cat("A", None), cat("B", None)];
        assert_eq!(
            validate_hierarchy(&cats, "A", Some("A")),
            Err(HierarchyError::SelfAsParent)
        );
    }

    #[test]
    fn cycle_detected_two_node() {
        // Pre-existing corruption: A.parent = B, B.parent = A. Any attempt
        // to validate a mutation that walks into this loop must terminate
        // (rule 5). We pick an unrelated target X and propose making it a
        // child of A — A's chain is the cycle. With max-depth-2, this is
        // also caught by rule 3 (B is non-root, so rule 3 fires for A's
        // grandparent step), so accept either DepthExceeded or Cycle.
        let cats = vec![
            cat("A", Some("B")),
            cat("B", Some("A")),
            cat("X", None),
        ];
        let result = validate_hierarchy(&cats, "X", Some("A"));
        // A.parent_id = Some("B") → A is non-root → rule 3 fires first
        // (DepthExceeded). The cycle walk is the defensive fallback if
        // MAX_DEPTH ever grows; we accept either to keep the test robust
        // against that future change.
        assert!(
            matches!(
                result,
                Err(HierarchyError::DepthExceeded) | Err(HierarchyError::Cycle)
            ),
            "expected DepthExceeded or Cycle, got {result:?}"
        );
    }

    #[test]
    fn max_depth_exceeded() {
        // P (root) + A (child of P). Trying to make B a grandchild
        // (B → A → P) violates the max-depth-2 limit (rule 3).
        let cats = vec![
            cat("P", None),
            cat("A", Some("P")),
            cat("B", None),
        ];
        assert_eq!(
            validate_hierarchy(&cats, "B", Some("A")),
            Err(HierarchyError::DepthExceeded)
        );
    }

    #[test]
    fn orphaned_child_detected() {
        // Rule 4: new_parent_id must exist in the snapshot. "nonexistent"
        // is not in the list → OrphanParent.
        let cats = vec![cat("A", None), cat("B", None)];
        assert_eq!(
            validate_hierarchy(&cats, "B", Some("nonexistent")),
            Err(HierarchyError::OrphanParent)
        );
    }

    #[test]
    fn cannot_demote_parent_with_children() {
        // Rule 6: P has child C. Demoting P under another root P2 would
        // push C to depth 2. Reject.
        let cats = vec![
            cat("P", None),
            cat("C", Some("P")),
            cat("P2", None),
        ];
        assert_eq!(
            validate_hierarchy(&cats, "P", Some("P2")),
            Err(HierarchyError::DemoteWithChildren)
        );
        // But promoting P to root (no-op since it's already a root) is
        // still fine — rule 1 short-circuits before rule 6.
        assert_eq!(validate_hierarchy(&cats, "P", None), Ok(()));
    }

    #[test]
    fn multi_hop_cycle_defensive() {
        // Pre-existing data corruption: A → B → C → A, length-3 cycle.
        // Even though max-depth-2 disallows this in the runtime data
        // model, hand-edited data.json or a downgrade-then-upgrade can
        // produce it. The validator must not spin forever (the 32-hop
        // bailout converts the spin into a `Cycle` rejection).
        //
        // Rule 3 may also fire because A's parent_id is Some("B") (a
        // non-root parent). Accept either Cycle or DepthExceeded — both
        // are correct rejections; the load-bearing assertion is that we
        // do not stack-overflow / hang.
        let cats = vec![
            cat("A", Some("B")),
            cat("B", Some("C")),
            cat("C", Some("A")),
            cat("X", None),
        ];
        let result = validate_hierarchy(&cats, "X", Some("A"));
        assert!(
            matches!(
                result,
                Err(HierarchyError::DepthExceeded) | Err(HierarchyError::Cycle)
            ),
            "expected DepthExceeded or Cycle, got {result:?}"
        );
    }

    #[test]
    fn display_messages_are_user_facing() {
        // The Display impl is what crosses the IPC boundary as Err(String).
        // Lock it down so a future refactor doesn't accidentally surface
        // a Debug-format message to the user.
        assert_eq!(
            HierarchyError::SelfAsParent.to_string(),
            "Cannot set category as its own parent"
        );
        assert_eq!(
            HierarchyError::Cycle.to_string(),
            "Setting parent would create a cycle"
        );
        assert_eq!(
            HierarchyError::DepthExceeded.to_string(),
            "Hierarchy depth limit exceeded (max 2)"
        );
        assert_eq!(
            HierarchyError::OrphanParent.to_string(),
            "Parent category not found"
        );
        assert_eq!(
            HierarchyError::DemoteWithChildren.to_string(),
            "Cannot demote a category that has children"
        );
    }
}

#[cfg(test)]
mod reorder_integration_tests {
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use tempfile::TempDir;

    /// Test fixture: scope an `ENSEMBLE_DATA_DIR` override to a TempDir for the
    /// duration of the test. Restores the prior value (or removes the var) on
    /// drop. Acquires the crate-wide [`ENV_TEST_LOCK`] (defined in
    /// `utils::path`) so it serialises with every other test that touches the
    /// env var — without that single shared lock, tests across modules race.
    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            // Acquire the lock first to serialise env mutation. If a prior
            // test panicked while holding the lock, recover the inner guard
            // (the env state may be dirty but ScopedDataDir overwrites it).
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
            // Lock guard drops here, releasing the mutex.
        }
    }

    fn cat(id: &str) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: None,
        }
    }

    fn tag(id: &str) -> Tag {
        Tag {
            id: id.to_string(),
            name: id.to_string(),
            count: 0,
        }
    }

    fn seed(categories: Vec<Category>, tags: Vec<Tag>) {
        let data = AppData {
            categories,
            tags,
            ..AppData::default()
        };
        write_app_data(data).expect("seed write_app_data");
    }

    #[test]
    fn reorder_categories_persists_order() {
        let _scope = ScopedDataDir::new();
        seed(vec![cat("A"), cat("B"), cat("C")], vec![]);

        let result = reorder_categories(vec!["C".into(), "A".into(), "B".into()])
            .expect("reorder_categories");
        assert_eq!(
            result.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["C", "A", "B"]
        );

        // Reload from disk to verify persistence.
        let reloaded = read_app_data().expect("read_app_data");
        assert_eq!(
            reloaded.categories.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["C", "A", "B"]
        );
    }

    #[test]
    fn reorder_categories_returns_canonical_vec() {
        let _scope = ScopedDataDir::new();
        seed(vec![cat("A"), cat("B"), cat("C")], vec![]);

        // Partial ordered_ids should append unmentioned in original order.
        let result = reorder_categories(vec!["B".into()]).expect("reorder_categories");
        assert_eq!(
            result.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["B", "A", "C"]
        );
    }

    #[test]
    fn reorder_tags_persists_order() {
        let _scope = ScopedDataDir::new();
        seed(vec![], vec![tag("t1"), tag("t2"), tag("t3")]);

        let result = reorder_tags(vec!["t3".into(), "t1".into(), "t2".into()])
            .expect("reorder_tags");
        assert_eq!(
            result.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["t3", "t1", "t2"]
        );

        let reloaded = read_app_data().expect("read_app_data");
        assert_eq!(
            reloaded.tags.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["t3", "t1", "t2"]
        );
    }

    #[test]
    fn reorder_categories_unknown_id_is_skipped() {
        let _scope = ScopedDataDir::new();
        seed(vec![cat("A"), cat("B"), cat("C")], vec![]);

        let result = reorder_categories(vec!["X".into(), "B".into(), "A".into()])
            .expect("reorder_categories");
        // X skipped, B and A first, then C from original order.
        assert_eq!(
            result.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
            vec!["B", "A", "C"]
        );
    }

    #[test]
    fn concurrent_reorder_and_add_no_lost_update() {
        // Verifies that DATA_MUTEX serialises concurrent mutators so no writes
        // are lost. We spawn 10 reorder threads + 10 add threads and assert
        // that all 10 added categories survive in the final on-disk state.
        let _scope = ScopedDataDir::new();
        seed(vec![cat("A"), cat("B"), cat("C")], vec![]);

        let mut handles = Vec::new();

        // 10 add_category threads (root-level — `parentId = None`).
        for i in 0..10 {
            handles.push(std::thread::spawn(move || {
                add_category(format!("new-{i}"), "#FFFFFF".to_string(), None)
                    .expect("add_category");
            }));
        }

        // 10 reorder_categories threads (no-op orderings drawn from the seed).
        for _ in 0..10 {
            handles.push(std::thread::spawn(|| {
                let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
            }));
        }

        for h in handles {
            h.join().expect("thread panicked — DATA_MUTEX lock contention failure?");
        }

        // After all threads join, every added category must be present.
        let final_data = read_app_data().expect("read_app_data");
        // 3 seeded + 10 added = 13.
        assert_eq!(final_data.categories.len(), 13, "lost updates detected");

        // Verify all 10 newly added categories are present (any order).
        let final_ids: std::collections::HashSet<&str> =
            final_data.categories.iter().map(|c| c.name.as_str()).collect();
        for i in 0..10 {
            let expected_name = format!("new-{i}");
            assert!(
                final_ids.contains(expected_name.as_str()),
                "added category {expected_name} was lost — DATA_MUTEX did not serialise mutations",
            );
        }
    }
}

#[cfg(test)]
mod set_parent_integration_tests {
    //! Integration tests for `set_category_parent` + the new
    //! `parent_id`-aware `add_category` / `update_category` paths
    //! (V1 hierarchy, T1c, 03_tech_plan V2 §3.3).
    //!
    //! Each test scopes an `ENSEMBLE_DATA_DIR` to a TempDir via
    //! `ScopedDataDir` so we exercise the real on-disk read/write loop
    //! and the DATA_MUTEX guard, but never touch the user's
    //! `~/.ensemble/`. Drop order: TempDir is removed last, so even
    //! after the env override is restored on Drop, the spilled JSON file
    //! is cleaned up.
    //!
    //! Coverage:
    //! - `set_parent_to_root_persists` — child → root promotion
    //! - `set_parent_to_another_category_persists` — root → child demotion
    //! - `set_parent_returns_canonical_vec` — IPC return value matches disk
    //! - `set_parent_validates_cycle` — A→B then B→A blocked
    //! - `set_parent_validates_max_depth` — grandchild attempt blocked
    //! - `set_parent_unknown_id_errors` — non-existent target id
    //! - `set_parent_validates_demote_with_children` — parent with children
    //!   cannot be demoted
    //! - `add_category_with_parent_id_persists` — create-as-child path
    //! - `add_category_with_parent_id_validates` — create-under-non-root rejected
    //! - `add_category_orphan_parent_id_errors` — create under unknown id
    //! - `update_category_clears_parent_id_via_some_none` — three-state
    //!   `Option<Option<T>>` "clear" path
    //! - `update_category_sets_parent_id_via_some_some` — "set" path
    //! - `update_category_outer_none_leaves_parent_unchanged` — "do not modify" path
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use tempfile::TempDir;

    /// Same fixture as `reorder_integration_tests::ScopedDataDir`. Duplicated
    /// here because Rust does not allow `pub(super)` test items across two
    /// `#[cfg(test)]` siblings without sharing a parent module — and the
    /// existing fixture is intentionally module-private to that suite.
    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    /// Build a Category with a chosen `parent_id`. Tests that need a flat
    /// (root-only) seed pass `None` everywhere; hierarchy tests reach for
    /// `Some(parent_id)`.
    fn cat_with_parent(id: &str, parent_id: Option<&str>) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: parent_id.map(|s| s.to_string()),
        }
    }

    fn seed(categories: Vec<Category>) {
        let data = AppData {
            categories,
            ..AppData::default()
        };
        write_app_data(data).expect("seed write_app_data");
    }

    // ============ set_category_parent: happy paths ============

    #[test]
    fn set_parent_to_root_persists() {
        // Seed: P (root) + X (child of P). Promote X to root.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", Some("P")),
        ]);

        let result = set_category_parent("X".into(), None).expect("set_category_parent");

        // Returned canonical Vec reflects the change.
        let x = result.iter().find(|c| c.id == "X").expect("X present");
        assert_eq!(x.parent_id, None, "X should be promoted to root");

        // Reload from disk to confirm persistence.
        let reloaded = read_app_data().expect("read_app_data");
        let x_disk = reloaded
            .categories
            .iter()
            .find(|c| c.id == "X")
            .expect("X persisted");
        assert_eq!(x_disk.parent_id, None);
    }

    #[test]
    fn set_parent_to_another_category_persists() {
        // Seed: P (root) + X (root). Demote X under P.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", None),
        ]);

        let result = set_category_parent("X".into(), Some("P".into()))
            .expect("set_category_parent");

        let x = result.iter().find(|c| c.id == "X").expect("X present");
        assert_eq!(
            x.parent_id.as_deref(),
            Some("P"),
            "X should be demoted under P"
        );

        let reloaded = read_app_data().expect("read_app_data");
        let x_disk = reloaded
            .categories
            .iter()
            .find(|c| c.id == "X")
            .expect("X persisted");
        assert_eq!(x_disk.parent_id.as_deref(), Some("P"));
    }

    #[test]
    fn set_parent_returns_canonical_vec() {
        // The IPC must return the full Vec<Category>, not just the mutated
        // entry — the front-end uses it to reconcile optimistic state.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", None),
            cat_with_parent("Other", None),
        ]);

        let result = set_category_parent("X".into(), Some("P".into()))
            .expect("set_category_parent");

        // 3 categories preserved (count, ids, ordering).
        assert_eq!(result.len(), 3, "full Vec returned");
        let ids: Vec<&str> = result.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["P", "X", "Other"], "original ordering preserved");
    }

    // ============ set_category_parent: validation rejections ============

    #[test]
    fn set_parent_validates_cycle() {
        // Pre-existing depth-2 hierarchy: A child of B. Attempt to also
        // make B a child of A would create a 2-node cycle. Backend must
        // reject. Note: rule 3 (depth) fires before rule 5 (cycle walk)
        // because A is non-root; both rejections are correct.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("B", None),
            cat_with_parent("A", Some("B")),
        ]);

        let err = set_category_parent("B".into(), Some("A".into()))
            .expect_err("cycle should be rejected");

        // Accept either DepthExceeded (rule 3) or Cycle (rule 5) — both
        // are valid rejections per `validate_hierarchy` invariants.
        // Rule 6 (DemoteWithChildren) also applies here because B has a
        // child A; that's another valid rejection path.
        assert!(
            err == HierarchyError::DepthExceeded.to_string()
                || err == HierarchyError::Cycle.to_string()
                || err == HierarchyError::DemoteWithChildren.to_string(),
            "expected hierarchy rejection, got: {err}"
        );
    }

    #[test]
    fn set_parent_validates_max_depth() {
        // Seed: P (root) + C (child of P) + X (root). Try to make X
        // a grandchild via X → C: C is non-root → rule 3 fires.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("C", Some("P")),
            cat_with_parent("X", None),
        ]);

        let err = set_category_parent("X".into(), Some("C".into()))
            .expect_err("depth-3 should be rejected");
        assert_eq!(err, HierarchyError::DepthExceeded.to_string());
    }

    #[test]
    fn set_parent_unknown_id_errors() {
        // Target id doesn't exist in the snapshot. The IPC has its own
        // pre-check for this (validate_hierarchy walks the parent chain
        // but doesn't verify target existence), so the error message is
        // the literal "Category not found" string.
        let _scope = ScopedDataDir::new();
        seed(vec![cat_with_parent("P", None)]);

        let err = set_category_parent("nonexistent".into(), None)
            .expect_err("unknown target id should be rejected");
        assert_eq!(err, "Category not found");
    }

    #[test]
    fn set_parent_validates_demote_with_children() {
        // P has child C. Try to demote P under another root P2 — rule 6
        // fires because P's children would be pushed past max depth.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("C", Some("P")),
            cat_with_parent("P2", None),
        ]);

        let err = set_category_parent("P".into(), Some("P2".into()))
            .expect_err("demoting parent with children should be rejected");
        assert_eq!(err, HierarchyError::DemoteWithChildren.to_string());
    }

    // ============ add_category: parent_id paths ============

    #[test]
    fn add_category_with_parent_id_persists() {
        // Add a child under an existing root.
        let _scope = ScopedDataDir::new();
        seed(vec![cat_with_parent("P", None)]);

        let created = add_category(
            "child".to_string(),
            "#FF0000".to_string(),
            Some("P".to_string()),
        )
        .expect("add_category");
        assert_eq!(created.parent_id.as_deref(), Some("P"));

        // Reload from disk to confirm persistence.
        let reloaded = read_app_data().expect("read_app_data");
        let from_disk = reloaded
            .categories
            .iter()
            .find(|c| c.id == created.id)
            .expect("child persisted");
        assert_eq!(from_disk.parent_id.as_deref(), Some("P"));
    }

    #[test]
    fn add_category_with_parent_id_validates() {
        // Trying to add a category under a non-root parent (which would
        // create depth 3) must be rejected. This is the create-time
        // pre-check that `add_category` does inline.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("C", Some("P")),
        ]);

        let err = add_category(
            "X".to_string(),
            "#000000".to_string(),
            Some("C".to_string()),
        )
        .expect_err("grandchild attempt should be rejected");
        assert_eq!(err, HierarchyError::DepthExceeded.to_string());
    }

    #[test]
    fn add_category_orphan_parent_id_errors() {
        // Parent id refers to a non-existent category — must be rejected.
        let _scope = ScopedDataDir::new();
        seed(vec![cat_with_parent("P", None)]);

        let err = add_category(
            "X".to_string(),
            "#000000".to_string(),
            Some("nonexistent".to_string()),
        )
        .expect_err("orphan parent should be rejected");
        assert_eq!(err, HierarchyError::OrphanParent.to_string());
    }

    // ============ update_category: three-state Option<Option<T>> ============

    #[test]
    fn update_category_clears_parent_id_via_some_none() {
        // outer Some + inner None == "clear (promote to root)"
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", Some("P")),
        ]);

        update_category("X".into(), None, None, Some(None)).expect("update_category");

        let reloaded = read_app_data().expect("read_app_data");
        let x = reloaded
            .categories
            .iter()
            .find(|c| c.id == "X")
            .expect("X persisted");
        assert_eq!(x.parent_id, None, "X should be cleared to root");
    }

    #[test]
    fn update_category_sets_parent_id_via_some_some() {
        // outer Some(Some(id)) == "set parent_id to id"
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", None),
        ]);

        update_category(
            "X".into(),
            None,
            None,
            Some(Some("P".to_string())),
        )
        .expect("update_category");

        let reloaded = read_app_data().expect("read_app_data");
        let x = reloaded
            .categories
            .iter()
            .find(|c| c.id == "X")
            .expect("X persisted");
        assert_eq!(x.parent_id.as_deref(), Some("P"), "X should be demoted under P");
    }

    #[test]
    fn update_category_outer_none_leaves_parent_unchanged() {
        // outer None == "do not modify parent_id" — V3 backward compat:
        // the existing `appStore.updateCategory(id, name?, color?)` path
        // omits the parentId key, which deserialises to outer None.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", Some("P")),
        ]);

        // Update name only, leave parentId untouched.
        update_category(
            "X".into(),
            Some("Renamed".into()),
            None,
            None, // outer None → do not modify
        )
        .expect("update_category");

        let reloaded = read_app_data().expect("read_app_data");
        let x = reloaded
            .categories
            .iter()
            .find(|c| c.id == "X")
            .expect("X persisted");
        assert_eq!(x.name, "Renamed", "name updated");
        assert_eq!(
            x.parent_id.as_deref(),
            Some("P"),
            "parent_id unchanged when outer None"
        );
    }
}

#[cfg(test)]
mod migrate_category_id_tests {
    //! Integration tests for [`migrate_category_id_for_skills_mcps`] (T1e).
    //!
    //! Each test seeds an isolated [`AppData`] in a temporary `ENSEMBLE_DATA_DIR`,
    //! invokes the IPC, and asserts both the [`MigrationReport`] return value
    //! and the post-write state of `data.json`.
    //!
    //! Coverage map (per task prompt):
    //! 1. `migrate_writes_metadata_category_id` — happy path: legacy fixture
    //!    with `category_id: None` and resolvable names → all migrated.
    //! 2. `migrate_writes_flag_to_app_data_only_on_full_success` — full
    //!    success → flag advances; orphan run → flag stays false.
    //! 3. `migrate_does_not_write_flag_on_orphan` — orphan present → flag
    //!    stays false BUT already-migrated entries persist.
    //! 4. `migrate_idempotent` — flag already true → fast path; second
    //!    invocation reports zero work.
    //! 5. `migrate_skips_already_migrated_metadata` — entries with
    //!    `category_id: Some(_)` are not re-mapped.
    //! 6. `migrate_returns_orphan_lists` — orphan IDs (HashMap keys) are
    //!    surfaced in `orphaned_skills` / `orphaned_mcps`.
    //! 7. `migrate_handles_empty_categories_uncategorized_metadata` — edge
    //!    case for entries with empty `category` strings.

    use super::*;
    use crate::types::{McpMetadata, SkillMetadata};
    use crate::utils::path::ENV_TEST_LOCK;
    use std::collections::HashMap;
    use tempfile::TempDir;

    /// Same scoped env helper as the sibling test modules. Duplicated here
    /// because Rust test modules cannot re-export across `#[cfg(test)]` mods
    /// without lifting `ScopedDataDir` to `pub(crate)` — keeping the type
    /// strictly test-private lowers the maintenance surface.
    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    fn cat_named(id: &str, name: &str) -> Category {
        Category {
            id: id.to_string(),
            name: name.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: None,
        }
    }

    /// Build a `SkillMetadata` with a chosen `category` name and explicit
    /// `category_id` (typically `None` for legacy fixtures).
    fn skill_meta(category: &str, category_id: Option<&str>) -> SkillMetadata {
        SkillMetadata {
            category: category.to_string(),
            category_id: category_id.map(|s| s.to_string()),
            tags: vec![],
            enabled: true,
            usage_count: 0,
            last_used: None,
            icon: None,
            scope: "global".to_string(),
            install_source: None,
            marketplace_source: None,
        }
    }

    fn mcp_meta(category: &str, category_id: Option<&str>) -> McpMetadata {
        McpMetadata {
            category: category.to_string(),
            category_id: category_id.map(|s| s.to_string()),
            tags: vec![],
            enabled: true,
            usage_count: 0,
            last_used: None,
            scope: "global".to_string(),
            install_source: None,
            marketplace_source: None,
            required_env_vars: None,
        }
    }

    fn seed_for_migration(
        categories: Vec<Category>,
        skill_metadata: HashMap<String, SkillMetadata>,
        mcp_metadata: HashMap<String, McpMetadata>,
        flag: bool,
    ) {
        let data = AppData {
            categories,
            skill_metadata,
            mcp_metadata,
            has_completed_category_id_migration: flag,
            ..AppData::default()
        };
        write_app_data(data).expect("seed write_app_data");
    }

    #[test]
    fn migrate_writes_metadata_category_id() {
        // Legacy fixture: two categories, two skills + two mcps all referencing
        // them by name with category_id == None. After migrate, every metadata
        // entry must have category_id resolved; flag must advance to true.
        let _scope = ScopedDataDir::new();

        let cats = vec![cat_named("cat-web", "Web"), cat_named("cat-tools", "Tools")];

        let mut skills = HashMap::new();
        skills.insert("skill-1".into(), skill_meta("Web", None));
        skills.insert("skill-2".into(), skill_meta("Tools", None));

        let mut mcps = HashMap::new();
        mcps.insert("mcp-1".into(), mcp_meta("Web", None));
        mcps.insert("mcp-2".into(), mcp_meta("Tools", None));

        seed_for_migration(cats, skills, mcps, false);

        let report =
            migrate_category_id_for_skills_mcps().expect("migrate_category_id_for_skills_mcps");

        assert_eq!(report.migrated_skills, 2);
        assert_eq!(report.migrated_mcps, 2);
        assert!(report.orphaned_skills.is_empty());
        assert!(report.orphaned_mcps.is_empty());

        // Reload from disk and verify both metadata mutation + flag persist.
        let reloaded = read_app_data().expect("read_app_data");
        assert!(reloaded.has_completed_category_id_migration);

        assert_eq!(
            reloaded.skill_metadata["skill-1"].category_id.as_deref(),
            Some("cat-web")
        );
        assert_eq!(
            reloaded.skill_metadata["skill-2"].category_id.as_deref(),
            Some("cat-tools")
        );
        assert_eq!(
            reloaded.mcp_metadata["mcp-1"].category_id.as_deref(),
            Some("cat-web")
        );
        assert_eq!(
            reloaded.mcp_metadata["mcp-2"].category_id.as_deref(),
            Some("cat-tools")
        );

        // The cached `category` (name) string is left intact for backward
        // display compat — it must NOT be cleared by migration.
        assert_eq!(reloaded.skill_metadata["skill-1"].category, "Web");
        assert_eq!(reloaded.mcp_metadata["mcp-2"].category, "Tools");
    }

    #[test]
    fn migrate_advances_flag_after_one_pass_regardless_of_orphans() {
        // Per Phase-1 audit P0-1 ruling (03_tech_plan V2 §3.4 wins):
        // orphans are a terminal state — re-running migration on every launch
        // would never resolve them on its own (the user must rename / re-classify).
        // So the flag advances after one pass regardless of orphan presence.
        // The orphan list is surfaced in the MigrationReport for UI handling.

        // (a) Full success → flag advances.
        {
            let _scope = ScopedDataDir::new();

            let cats = vec![cat_named("cat-web", "Web")];
            let mut skills = HashMap::new();
            skills.insert("skill-1".into(), skill_meta("Web", None));
            seed_for_migration(cats, skills, HashMap::new(), false);

            let report = migrate_category_id_for_skills_mcps().expect("migrate ok");
            assert_eq!(report.migrated_skills, 1);
            assert!(report.orphaned_skills.is_empty());
            assert!(report.orphaned_mcps.is_empty());

            let reloaded = read_app_data().expect("read_app_data");
            assert!(
                reloaded.has_completed_category_id_migration,
                "flag must advance when no orphans"
            );
        }

        // (b) Orphan present → flag also advances (terminal state).
        {
            let _scope = ScopedDataDir::new();

            let cats = vec![cat_named("cat-web", "Web")];
            let mut skills = HashMap::new();
            skills.insert("skill-1".into(), skill_meta("Web", None));
            skills.insert("skill-orphan".into(), skill_meta("Vanished", None));
            seed_for_migration(cats, skills, HashMap::new(), false);

            let report = migrate_category_id_for_skills_mcps().expect("migrate ok");
            assert_eq!(report.migrated_skills, 1);
            assert_eq!(report.orphaned_skills.len(), 1);

            let reloaded = read_app_data().expect("read_app_data");
            assert!(
                reloaded.has_completed_category_id_migration,
                "flag advances even with orphans (terminal state, per 03 V2 §3.4)"
            );
        }
    }

    #[test]
    fn migrate_with_orphans_persists_resolved_entries_and_advances_flag() {
        // Even with orphans, the entries that DID resolve must be persisted
        // (progress is never lost), and the flag advances so subsequent
        // launches don't redundantly re-scan. The orphan list is returned in
        // the MigrationReport for the front-end to surface.
        let _scope = ScopedDataDir::new();

        let cats = vec![cat_named("cat-web", "Web"), cat_named("cat-tools", "Tools")];
        let mut skills = HashMap::new();
        skills.insert("skill-good-1".into(), skill_meta("Web", None));
        skills.insert("skill-good-2".into(), skill_meta("Tools", None));
        skills.insert("skill-orphan".into(), skill_meta("Vanished", None));
        seed_for_migration(cats, skills, HashMap::new(), false);

        let report = migrate_category_id_for_skills_mcps().expect("migrate ok");

        assert_eq!(report.migrated_skills, 2);
        assert_eq!(report.orphaned_skills, vec!["skill-orphan".to_string()]);

        let reloaded = read_app_data().expect("read_app_data");
        // Flag advances (terminal state, per Phase-1 audit P0-1).
        assert!(reloaded.has_completed_category_id_migration);
        // Already-migrated entries are persisted.
        assert_eq!(
            reloaded.skill_metadata["skill-good-1"].category_id.as_deref(),
            Some("cat-web")
        );
        assert_eq!(
            reloaded.skill_metadata["skill-good-2"].category_id.as_deref(),
            Some("cat-tools")
        );
        // Orphan entry untouched (category_id stays None; cached name intact).
        assert!(reloaded.skill_metadata["skill-orphan"]
            .category_id
            .is_none());
        assert_eq!(reloaded.skill_metadata["skill-orphan"].category, "Vanished");
    }

    #[test]
    fn migrate_idempotent() {
        // Once flag = true, the IPC must short-circuit: no further mutation,
        // no work counters > 0. We verify the second invocation does NOT
        // re-resolve any entry by setting up data such that any re-resolution
        // would be observable (we'd see migrated_skills > 0 again).
        let _scope = ScopedDataDir::new();

        let cats = vec![cat_named("cat-web", "Web")];
        let mut skills = HashMap::new();
        // Pre-migrated entry: category_id already set (matches existing
        // category). After flag=true, no further work should happen.
        skills.insert("skill-1".into(), skill_meta("Web", Some("cat-web")));
        seed_for_migration(cats, skills, HashMap::new(), true /* flag pre-set */);

        let report1 = migrate_category_id_for_skills_mcps().expect("migrate ok");
        assert_eq!(report1.migrated_skills, 0);
        assert_eq!(report1.migrated_mcps, 0);
        assert!(report1.orphaned_skills.is_empty());
        assert!(report1.orphaned_mcps.is_empty());

        // Second call: same fast-path behaviour.
        let report2 = migrate_category_id_for_skills_mcps().expect("migrate ok #2");
        assert_eq!(report2.migrated_skills, 0);
        assert_eq!(report2.migrated_mcps, 0);

        // State on disk unchanged.
        let reloaded = read_app_data().expect("read_app_data");
        assert!(reloaded.has_completed_category_id_migration);
        assert_eq!(
            reloaded.skill_metadata["skill-1"].category_id.as_deref(),
            Some("cat-web")
        );
    }

    #[test]
    fn migrate_skips_already_migrated_metadata() {
        // Mixed batch: one pre-migrated entry (category_id = Some) + one new
        // entry (category_id = None). The migration must NOT overwrite the
        // pre-migrated entry, even if the cached `category` name still
        // resolves to a different id.
        let _scope = ScopedDataDir::new();

        let cats = vec![
            cat_named("cat-web-old", "Web"),
            cat_named("cat-tools", "Tools"),
        ];
        let mut skills = HashMap::new();
        // Pre-migrated entry — category_id points at cat-web-old. Even if
        // the function were to re-resolve "Web", it must not touch this row.
        skills.insert(
            "skill-pre".into(),
            skill_meta("Web", Some("cat-web-old")),
        );
        // New entry needing migration.
        skills.insert("skill-new".into(), skill_meta("Tools", None));

        seed_for_migration(cats, skills, HashMap::new(), false);

        let report = migrate_category_id_for_skills_mcps().expect("migrate ok");

        // Only the new entry is counted as migrated; the pre-migrated row is
        // skipped via the `category_id.is_some()` guard.
        assert_eq!(report.migrated_skills, 1);
        assert!(report.orphaned_skills.is_empty());

        let reloaded = read_app_data().expect("read_app_data");
        // Pre-migrated row is unchanged — still points at cat-web-old.
        assert_eq!(
            reloaded.skill_metadata["skill-pre"].category_id.as_deref(),
            Some("cat-web-old")
        );
        // New row is now resolved.
        assert_eq!(
            reloaded.skill_metadata["skill-new"].category_id.as_deref(),
            Some("cat-tools")
        );
        assert!(reloaded.has_completed_category_id_migration);
    }

    #[test]
    fn migrate_returns_orphan_lists() {
        // Verify that `orphaned_skills` / `orphaned_mcps` carry the HashMap
        // keys (skill_id / mcp_id) — not category names. Per prompt:
        //   "orphaned_skills: Vec<String>  — skill_id 没找到对应 category name"
        let _scope = ScopedDataDir::new();

        let cats = vec![cat_named("cat-web", "Web")];

        let mut skills = HashMap::new();
        skills.insert("skill-orphan-1".into(), skill_meta("Vanished-A", None));
        skills.insert("skill-orphan-2".into(), skill_meta("Vanished-B", None));
        skills.insert("skill-good".into(), skill_meta("Web", None));

        let mut mcps = HashMap::new();
        mcps.insert("mcp-orphan-1".into(), mcp_meta("Lost", None));
        mcps.insert("mcp-good".into(), mcp_meta("Web", None));

        seed_for_migration(cats, skills, mcps, false);

        let report = migrate_category_id_for_skills_mcps().expect("migrate ok");

        assert_eq!(report.migrated_skills, 1);
        assert_eq!(report.migrated_mcps, 1);

        // Orphan lists carry skill_id / mcp_id keys (sort for stable assertion
        // because HashMap iteration order is undefined).
        let mut orphan_skills_sorted = report.orphaned_skills.clone();
        orphan_skills_sorted.sort();
        assert_eq!(
            orphan_skills_sorted,
            vec!["skill-orphan-1".to_string(), "skill-orphan-2".to_string()]
        );
        assert_eq!(report.orphaned_mcps, vec!["mcp-orphan-1".to_string()]);

        // Per Phase-1 audit P0-1: flag advances even with orphans (terminal
        // state). The orphan list above is the front-end's signal, not a
        // re-run trigger.
        let reloaded = read_app_data().expect("read_app_data");
        assert!(reloaded.has_completed_category_id_migration);
    }

    #[test]
    fn migrate_handles_empty_categories_uncategorized_metadata() {
        // Edge case: metadata with empty `category` string is treated as
        // genuinely uncategorized (per implementation Layer-3 guard) — neither
        // migrated nor reported as orphan. If all entries fall in this bucket,
        // the migration is a "no-op success" and the flag still advances.
        let _scope = ScopedDataDir::new();

        let cats = vec![cat_named("cat-web", "Web")];
        let mut skills = HashMap::new();
        skills.insert("skill-uncat".into(), skill_meta("", None));
        seed_for_migration(cats, skills, HashMap::new(), false);

        let report = migrate_category_id_for_skills_mcps().expect("migrate ok");
        assert_eq!(report.migrated_skills, 0);
        assert!(report.orphaned_skills.is_empty());

        let reloaded = read_app_data().expect("read_app_data");
        // No orphans → flag advances even though no real work was done.
        assert!(reloaded.has_completed_category_id_migration);
        // Empty category metadata is left untouched.
        assert!(reloaded.skill_metadata["skill-uncat"]
            .category_id
            .is_none());
        assert_eq!(reloaded.skill_metadata["skill-uncat"].category, "");
    }
}

#[cfg(test)]
mod delete_category_cascade_tests {
    //! Integration tests for `delete_category` cascade-promote semantics
    //! (T1d, 03_tech_plan V2 §3.6 + `_v2_patch_plan` §3.5).
    //!
    //! Each test scopes an `ENSEMBLE_DATA_DIR` to a TempDir via `ScopedDataDir`
    //! so we exercise the real on-disk read/write loop and the DATA_MUTEX
    //! guard, but never touch the user's `~/.ensemble/`.
    //!
    //! Coverage:
    //! - `delete_parent_promotes_children_to_root` — Rule 1: cascade
    //! - `delete_parent_disambiguates_name_collision` — Rule 2: rename
    //! - `delete_parent_disambiguates_with_numeric_suffix` — Rule 2 fallback
    //! - `delete_parent_with_two_same_name_children` — disambiguation across
    //!   siblings (running `root_names` set must grow as we promote)
    //! - `delete_leaf_category_unchanged` — V3 path intact (no children, no
    //!   disambiguation pass)
    //! - `delete_root_with_no_children_unchanged` — bare delete with adjacent
    //!   parent/child pair untouched
    //! - `delete_nonexistent_id_no_op` — defensive Ok no-op
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use tempfile::TempDir;

    /// Same fixture as the sibling test modules' `ScopedDataDir`. Duplicated
    /// here because Rust does not allow `pub(super)` test items across
    /// `#[cfg(test)]` siblings without a shared parent module.
    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    /// Build a `Category` with chosen id, name, and parent_id. We need name
    /// and id to vary independently so disambiguation collisions are
    /// observable — the sibling test modules' `cat()` helper sets name = id
    /// and would degenerate every collision test.
    fn ncat(id: &str, name: &str, parent_id: Option<&str>) -> Category {
        Category {
            id: id.to_string(),
            name: name.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: parent_id.map(|s| s.to_string()),
        }
    }

    fn seed(categories: Vec<Category>) {
        let data = AppData {
            categories,
            ..AppData::default()
        };
        write_app_data(data).expect("seed write_app_data");
    }

    /// Find a category by id in the post-delete on-disk snapshot. Returns
    /// `None` if the category was removed (e.g. the deleted parent itself).
    fn find_by_id<'a>(cats: &'a [Category], id: &str) -> Option<&'a Category> {
        cats.iter().find(|c| c.id == id)
    }

    #[test]
    fn delete_parent_promotes_children_to_root() {
        // Setup: P (root) with two children C1, C2; plus an unrelated R (root).
        // Action: delete P.
        // Expected: C1, C2 become roots (parent_id = None); R untouched; P gone.
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("P", "Parent", None),
            ncat("C1", "Child1", Some("P")),
            ncat("C2", "Child2", Some("P")),
            ncat("R", "Other", None),
        ]);

        delete_category("P".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        assert!(
            find_by_id(&reloaded.categories, "P").is_none(),
            "deleted parent must be gone"
        );
        let c1 = find_by_id(&reloaded.categories, "C1").expect("C1 survives");
        let c2 = find_by_id(&reloaded.categories, "C2").expect("C2 survives");
        let r = find_by_id(&reloaded.categories, "R").expect("R untouched");
        assert!(c1.parent_id.is_none(), "C1 promoted to root");
        assert!(c2.parent_id.is_none(), "C2 promoted to root");
        assert!(r.parent_id.is_none(), "R was a root and stays one");
        // Names unchanged because no collision.
        assert_eq!(c1.name, "Child1");
        assert_eq!(c2.name, "Child2");
        assert_eq!(reloaded.categories.len(), 3);
    }

    #[test]
    fn delete_parent_disambiguates_name_collision() {
        // Setup mirrors the spec's primary disambiguation example
        // (03_tech_plan V2 §3.6 / _v2_patch_plan §3.5):
        //   root: Web (cat-A) | Tools (cat-B), child of Tools: Web (cat-C)
        // Action: delete Tools.
        // Expected: cat-A still named "Web"; cat-C renamed to "Web (Tools)".
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("cat-A", "Web", None),
            ncat("cat-B", "Tools", None),
            ncat("cat-C", "Web", Some("cat-B")),
        ]);

        delete_category("cat-B".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        assert!(
            find_by_id(&reloaded.categories, "cat-B").is_none(),
            "deleted parent must be gone"
        );
        let a = find_by_id(&reloaded.categories, "cat-A").expect("cat-A survives");
        let c = find_by_id(&reloaded.categories, "cat-C").expect("cat-C survives");
        assert_eq!(a.name, "Web", "existing root keeps its original name");
        assert_eq!(
            c.name, "Web (Tools)",
            "promoted child renamed to disambiguate (`<orig> (<parent>)`)"
        );
        assert!(a.parent_id.is_none());
        assert!(c.parent_id.is_none());
        // Exactly one root named "Web" after delete (the disambiguation
        // invariant: no two roots share a name).
        let web_count = reloaded
            .categories
            .iter()
            .filter(|c| c.name == "Web")
            .count();
        assert_eq!(web_count, 1, "exactly one root named 'Web' after delete");
    }

    #[test]
    fn delete_parent_disambiguates_with_numeric_suffix() {
        // Setup: existing root already has the disambiguated name occupied,
        // so the simple `<orig> (<parent>)` candidate also collides → must
        // fall back to numeric suffix.
        //   root: Web (cat-A) | Tools (cat-B) | Web (Tools) (cat-X)
        //   child of Tools: Web (cat-C)
        // Action: delete Tools.
        // Expected: cat-C ends up as "Web (Tools) 2".
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("cat-A", "Web", None),
            ncat("cat-B", "Tools", None),
            ncat("cat-X", "Web (Tools)", None),
            ncat("cat-C", "Web", Some("cat-B")),
        ]);

        delete_category("cat-B".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        let c = find_by_id(&reloaded.categories, "cat-C").expect("cat-C survives");
        assert_eq!(
            c.name, "Web (Tools) 2",
            "numeric suffix kicks in when `<orig> (<parent>)` already collides"
        );
        assert!(c.parent_id.is_none());

        // The original two roots are untouched.
        assert_eq!(
            find_by_id(&reloaded.categories, "cat-A").unwrap().name,
            "Web"
        );
        assert_eq!(
            find_by_id(&reloaded.categories, "cat-X").unwrap().name,
            "Web (Tools)"
        );
        // All names unique among roots (the disambiguation invariant).
        let names: Vec<&str> = reloaded
            .categories
            .iter()
            .filter(|c| c.parent_id.is_none())
            .map(|c| c.name.as_str())
            .collect();
        let unique_count = names
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len();
        assert_eq!(
            unique_count,
            names.len(),
            "all root names must be unique post-disambiguation"
        );
    }

    #[test]
    fn delete_parent_with_two_same_name_children() {
        // Edge case: two children of the same parent share a name. The
        // running `root_names` set must grow as we promote each, so the
        // SECOND child sees the first's promoted name and disambiguates
        // against it.
        //   root: Web (cat-A) | Tools (cat-B)
        //   child of Tools: Web (cat-C), Web (cat-D)
        // Action: delete Tools.
        // Expected:
        //   cat-A keeps "Web"
        //   cat-C → "Web (Tools)" (collides with cat-A's "Web")
        //   cat-D → "Web (Tools) 2" (collides with cat-C's just-promoted name)
        // Order between cat-C / cat-D follows the data.json `Vec` order.
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("cat-A", "Web", None),
            ncat("cat-B", "Tools", None),
            ncat("cat-C", "Web", Some("cat-B")),
            ncat("cat-D", "Web", Some("cat-B")),
        ]);

        delete_category("cat-B".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        let c = find_by_id(&reloaded.categories, "cat-C").expect("cat-C survives");
        let d = find_by_id(&reloaded.categories, "cat-D").expect("cat-D survives");
        assert_eq!(
            c.name, "Web (Tools)",
            "first promoted sibling takes the unsuffixed candidate"
        );
        assert_eq!(
            d.name, "Web (Tools) 2",
            "second sibling falls back to numeric suffix"
        );

        // Total name uniqueness post-promotion.
        let names: Vec<&str> = reloaded
            .categories
            .iter()
            .map(|c| c.name.as_str())
            .collect();
        let unique_count = names
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len();
        assert_eq!(unique_count, names.len(), "all names unique");
    }

    #[test]
    fn delete_leaf_category_unchanged() {
        // Bare leaf delete (no children, no parent involvement) must remain
        // identical to V3 behavior — single retain, no disambiguation pass.
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("A", "Alpha", None),
            ncat("B", "Beta", None),
            ncat("C", "Gamma", None),
        ]);

        delete_category("B".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        assert!(find_by_id(&reloaded.categories, "B").is_none(), "B removed");
        assert_eq!(reloaded.categories.len(), 2);
        // Sibling roots untouched (still roots, names unchanged).
        let a = find_by_id(&reloaded.categories, "A").unwrap();
        let c = find_by_id(&reloaded.categories, "C").unwrap();
        assert_eq!(a.name, "Alpha");
        assert_eq!(c.name, "Gamma");
        assert!(a.parent_id.is_none());
        assert!(c.parent_id.is_none());
    }

    #[test]
    fn delete_root_with_no_children_unchanged() {
        // A root with NO children but a parent-shaped categories Vec around
        // it. Confirms the disambiguation loop is skipped entirely (no
        // mutation walks over the unrelated parent/child pair).
        let _scope = ScopedDataDir::new();
        seed(vec![
            ncat("Solo", "Solo", None),
            ncat("P", "Parent", None),
            ncat("C", "Child", Some("P")),
        ]);

        delete_category("Solo".into()).expect("delete_category");

        let reloaded = read_app_data().expect("read_app_data");
        assert!(find_by_id(&reloaded.categories, "Solo").is_none());
        // Parent/child pair is left exactly intact.
        let p = find_by_id(&reloaded.categories, "P").expect("P intact");
        let c = find_by_id(&reloaded.categories, "C").expect("C intact");
        assert!(p.parent_id.is_none());
        assert_eq!(c.parent_id.as_deref(), Some("P"));
        assert_eq!(p.name, "Parent");
        assert_eq!(c.name, "Child");
    }

    #[test]
    fn delete_nonexistent_id_no_op() {
        // Defensive: deleting a non-existent id must not corrupt state.
        // (Existing V3 behavior is no-op + Ok.)
        let _scope = ScopedDataDir::new();
        seed(vec![ncat("A", "Alpha", None), ncat("B", "Beta", None)]);

        delete_category("ghost".into()).expect("delete_category should not error");

        let reloaded = read_app_data().expect("read_app_data");
        assert_eq!(reloaded.categories.len(), 2, "no categories removed");
        assert!(find_by_id(&reloaded.categories, "A").is_some());
        assert!(find_by_id(&reloaded.categories, "B").is_some());
    }
}

#[cfg(test)]
mod concurrency_tests {
    //! T1f closure (Phase 1 P1-3): concurrency tests proving DATA_MUTEX
    //! serialises every data.json mutator under the V2 [P1-5] /
    //! `phase1_audit.md` §9.5 expanded coverage.
    //!
    //! Coverage (per `03_tech_plan.md` V2 §3.7 + §10):
    //! - `concurrent_update_skill_metadata_and_reorder_no_lost_update` —
    //!   the V1 lost-update window (skills.rs `update_skill_metadata` did
    //!   not hold DATA_MUTEX while `reorder_categories` did) is now closed.
    //!   10 metadata-update threads × 10 reorder threads must produce a
    //!   final on-disk state with all 10 metadata entries persisted AND
    //!   the categories Vec preserved at length 3 (no reorder lost the
    //!   seeded set).
    //! - `concurrent_set_parent_and_add_no_lost_update` — V2 [P1-5]
    //!   sibling test for the new `set_category_parent` IPC against
    //!   `add_category`. 10 set_parent threads × 10 add_category threads
    //!   must produce all 10 added categories AND preserve the seeded P
    //!   parent + X child relationship's invariant.
    //!
    //! Both tests follow the pattern of
    //! `reorder_integration_tests::concurrent_reorder_and_add_no_lost_update`
    //! which has been the canonical lost-update guard since V3
    //! sidebar-reorder.
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use tempfile::TempDir;

    /// Same fixture as the sibling test modules' `ScopedDataDir`.
    /// Duplicated per P2-1 (data.rs:2335) — Rust does not allow `pub(super)`
    /// test items across `#[cfg(test)]` siblings without a shared parent
    /// module. The duplication is intentional and tracked.
    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    fn cat(id: &str) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: None,
        }
    }

    fn cat_with_parent(id: &str, parent_id: Option<&str>) -> Category {
        Category {
            id: id.to_string(),
            name: id.to_string(),
            color: "#000000".to_string(),
            count: 0,
            parent_id: parent_id.map(|s| s.to_string()),
        }
    }

    fn seed(categories: Vec<Category>) {
        let data = AppData {
            categories,
            ..AppData::default()
        };
        write_app_data(data).expect("seed write_app_data");
    }

    #[test]
    fn concurrent_update_skill_metadata_and_reorder_no_lost_update() {
        // T1f / P1-3: this test would have failed before the lock was added
        // to `update_skill_metadata` in skills.rs because the metadata
        // writer used a bare `fs::read_to_string` + `fs::write` cycle that
        // could overwrite a fresh `reorder_categories` write between the
        // metadata thread's read and write.
        //
        // Spawn 10 threads that each call `update_skill_metadata` for a
        // distinct skill_id, plus 10 threads that each call
        // `reorder_categories` against the seeded set. After all threads
        // join, assert:
        //   1. All 10 metadata entries are present (no lost metadata
        //      writes — DATA_MUTEX held).
        //   2. categories Vec retains all 3 seeded entries (no reorder
        //      thread's write was clobbered by a stale metadata write).
        let _scope = ScopedDataDir::new();
        seed(vec![cat("A"), cat("B"), cat("C")]);

        let mut handles = Vec::new();

        // 10 update_skill_metadata threads, each writing a distinct skill_id.
        for i in 0..10 {
            handles.push(std::thread::spawn(move || {
                let skill_id = format!("skill-{i}");
                crate::commands::skills::update_skill_metadata(
                    skill_id,
                    Some(format!("cat-{i}")),
                    None, // categoryId: outer None = do not modify
                    Some(vec![format!("tag-{i}")]),
                    Some(true),
                    None,
                )
                .expect("update_skill_metadata");
            }));
        }

        // 10 reorder_categories threads (no-op orderings drawn from seed).
        for _ in 0..10 {
            handles.push(std::thread::spawn(|| {
                let _ = reorder_categories(vec!["C".into(), "A".into(), "B".into()]);
            }));
        }

        for h in handles {
            h.join().expect("thread panicked — DATA_MUTEX contention failure?");
        }

        let final_data = read_app_data().expect("read_app_data");

        // 1. All 10 metadata entries persisted (no lost-update window).
        assert_eq!(
            final_data.skill_metadata.len(),
            10,
            "lost skill_metadata writes — DATA_MUTEX did not serialise update_skill_metadata + reorder_categories",
        );
        for i in 0..10 {
            let key = format!("skill-{i}");
            let entry = final_data
                .skill_metadata
                .get(&key)
                .unwrap_or_else(|| panic!("skill_metadata missing entry {key}"));
            assert_eq!(entry.category, format!("cat-{i}"));
            assert_eq!(entry.tags, vec![format!("tag-{i}")]);
        }

        // 2. Categories Vec preserved (no reorder write clobbered by stale
        //    metadata write).
        assert_eq!(
            final_data.categories.len(),
            3,
            "categories were lost — DATA_MUTEX did not protect reorder_categories from update_skill_metadata",
        );
        let names: std::collections::HashSet<&str> =
            final_data.categories.iter().map(|c| c.name.as_str()).collect();
        for expected in ["A", "B", "C"] {
            assert!(
                names.contains(expected),
                "category {expected} missing from final state",
            );
        }
    }

    #[test]
    fn concurrent_set_parent_and_add_no_lost_update() {
        // T1f / V2 [P1-5]: 10 set_category_parent threads × 10 add_category
        // threads. Each set_parent flips X between root and child of P;
        // each add_category creates a fresh root. After join, assert:
        //   1. All 10 added categories present (no lost add_category).
        //   2. P and X both still exist (the seeded pair is preserved).
        //   3. Every category passes the validate_hierarchy invariant —
        //      i.e. no orphans / cycles / depth-exceeded survived a race.
        let _scope = ScopedDataDir::new();
        seed(vec![
            cat_with_parent("P", None),
            cat_with_parent("X", None),
        ]);

        let mut handles = Vec::new();

        // 10 add_category threads (root-level — `parentId = None`).
        for i in 0..10 {
            handles.push(std::thread::spawn(move || {
                add_category(format!("new-{i}"), "#FFFFFF".to_string(), None)
                    .expect("add_category");
            }));
        }

        // 10 set_category_parent threads alternating X's parent_id.
        // Even iterations demote X under P; odd iterations promote X to root.
        // The validator rejects no-ops gracefully, so the final state is
        // either Some("P") or None — but the categories Vec and seeded
        // pair must both survive every interleaving.
        for i in 0..10 {
            handles.push(std::thread::spawn(move || {
                let new_parent = if i % 2 == 0 { Some("P".to_string()) } else { None };
                // set_category_parent may legitimately fail if X already
                // has the requested parent (idempotent rejection is rare
                // but possible under demote-with-children rule when
                // children appear). Both outcomes are valid for this test.
                let _ = set_category_parent("X".into(), new_parent);
            }));
        }

        for h in handles {
            h.join().expect("thread panicked — DATA_MUTEX contention failure?");
        }

        let final_data = read_app_data().expect("read_app_data");

        // 1. All 10 newly added categories present.
        let names: std::collections::HashSet<&str> =
            final_data.categories.iter().map(|c| c.name.as_str()).collect();
        for i in 0..10 {
            let expected_name = format!("new-{i}");
            assert!(
                names.contains(expected_name.as_str()),
                "added category {expected_name} was lost — DATA_MUTEX did not serialise set_parent + add_category",
            );
        }

        // 2. Seeded P + X both preserved.
        assert!(names.contains("P"), "seeded P lost across set_parent races");
        assert!(names.contains("X"), "seeded X lost across set_parent races");

        // 3. Final state is hierarchy-valid (no orphans / cycles).
        // We rely on validate_hierarchy's per-callsite check having held
        // under DATA_MUTEX, but cross-check the post-state shape: every
        // category with a parent_id refers to an existing root.
        for c in &final_data.categories {
            if let Some(pid) = c.parent_id.as_deref() {
                let parent = final_data
                    .categories
                    .iter()
                    .find(|p| p.id == pid)
                    .unwrap_or_else(|| panic!("orphan: {} -> {pid} (missing)", c.id));
                assert!(
                    parent.parent_id.is_none(),
                    "depth-exceeded survived race: {} -> {pid} -> {:?}",
                    c.id,
                    parent.parent_id,
                );
            }
        }

        // Total: 2 seeded + 10 added = 12.
        assert_eq!(
            final_data.categories.len(),
            12,
            "lost categories detected — final count {} != 12",
            final_data.categories.len(),
        );
    }
}

// ============================================================================
// Scene lifecycle integration tests — A7 (Marketplace D-Imp-6)
// ============================================================================
//
// Verify that `add_scene` / `update_scene` / `delete_scene` correctly
// maintain `AppData.last_edited_scene_id`. The Marketplace ShortcutBanner
// reads this field to surface "Add to active Scene: <name>" — getting it
// wrong means the banner points at the wrong Scene (or at a Scene that
// no longer exists).
//
// We reuse the same `ScopedDataDir` env-isolation pattern as
// `reorder_integration_tests` (the helper is private to that module so we
// re-define it here; matches the pattern already used by
// `set_parent_integration_tests`).

#[cfg(test)]
mod scene_lifecycle_tests {
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use tempfile::TempDir;

    struct ScopedDataDir {
        _tempdir: TempDir,
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }

    impl ScopedDataDir {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            let tempdir = TempDir::new().expect("create tempdir");
            std::env::set_var("ENSEMBLE_DATA_DIR", tempdir.path());
            Self {
                _tempdir: tempdir,
                prior,
                _guard: guard,
            }
        }
    }

    impl Drop for ScopedDataDir {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    #[test]
    fn add_scene_sets_last_edited_scene_id() {
        let _scope = ScopedDataDir::new();
        // Persist an empty AppData so read_app_data returns Ok rather
        // than panicking on a missing data.json.
        write_app_data(AppData::default()).expect("seed");

        let scene = add_scene(
            "test-scene".to_string(),
            String::new(),
            String::new(),
            vec![],
            vec![],
            None,
            None,
        )
        .expect("add_scene");

        let data = read_app_data().expect("read");
        assert_eq!(data.last_edited_scene_id, Some(scene.id));
    }

    #[test]
    fn update_scene_bumps_last_edited_scene_id() {
        let _scope = ScopedDataDir::new();
        write_app_data(AppData::default()).expect("seed");

        let first =
            add_scene("a".into(), String::new(), String::new(), vec![], vec![], None, None).expect("a");
        let second =
            add_scene("b".into(), String::new(), String::new(), vec![], vec![], None, None).expect("b");
        // Sanity — `add_scene("b")` should already have set lastEdited to b.
        let after_add = read_app_data().expect("read");
        assert_eq!(after_add.last_edited_scene_id, Some(second.id.clone()));

        // Editing the older scene moves the active id back to it.
        update_scene(
            first.id.clone(),
            Some("a-renamed".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("update");
        let after_update = read_app_data().expect("read");
        assert_eq!(after_update.last_edited_scene_id, Some(first.id));
    }

    #[test]
    fn delete_active_scene_falls_back_to_remaining_scene() {
        let _scope = ScopedDataDir::new();
        write_app_data(AppData::default()).expect("seed");

        let a =
            add_scene("a".into(), String::new(), String::new(), vec![], vec![], None, None).expect("a");
        let b =
            add_scene("b".into(), String::new(), String::new(), vec![], vec![], None, None).expect("b");
        // Active is currently b (last add).
        delete_scene(b.id.clone()).expect("delete b");

        let after_delete = read_app_data().expect("read");
        // Fallback chooses a remaining scene (a), since b had no last_used
        // and the fallback ladder ends at "scenes.last()".
        assert_eq!(after_delete.last_edited_scene_id, Some(a.id));
    }

    #[test]
    fn delete_active_scene_with_no_remaining_scenes_clears_active_id() {
        let _scope = ScopedDataDir::new();
        write_app_data(AppData::default()).expect("seed");

        let only =
            add_scene("solo".into(), String::new(), String::new(), vec![], vec![], None, None).expect("a");
        delete_scene(only.id).expect("delete");

        let after_delete = read_app_data().expect("read");
        assert_eq!(after_delete.last_edited_scene_id, None);
    }

    #[test]
    fn delete_inactive_scene_preserves_active_id() {
        let _scope = ScopedDataDir::new();
        write_app_data(AppData::default()).expect("seed");

        let a =
            add_scene("a".into(), String::new(), String::new(), vec![], vec![], None, None).expect("a");
        let b =
            add_scene("b".into(), String::new(), String::new(), vec![], vec![], None, None).expect("b");
        // Active is b. Deleting a should NOT change active.
        delete_scene(a.id).expect("delete a");

        let after_delete = read_app_data().expect("read");
        assert_eq!(after_delete.last_edited_scene_id, Some(b.id));
    }
}
