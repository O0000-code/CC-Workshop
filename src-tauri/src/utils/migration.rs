//! One-time migration from the legacy `~/.ensemble/` data directory to the
//! v2.3.0+ canonical `~/.cc-workshop/` directory.
//!
//! Runs once at app startup, BEFORE any `read_app_data` / `read_settings` /
//! `scan_skills` call. Idempotent — re-running after success is an O(1)
//! no-op. Failure is non-fatal: the function returns `Err(String)` and the
//! caller decides whether to surface a dialog or continue with the legacy
//! directory intact (we never delete the legacy data before the copy
//! succeeds, so the user can always relaunch to retry).
//!
//! ## Critical coupling
//!
//! The project enforces `Skill::id == source_path == absolute_path_string`
//! (`types.rs:7-15`). The same absolute path is the HashMap key in
//! `AppData::skill_metadata` / `mcp_metadata` and is stored verbatim inside
//! every `Scene.skill_ids` / `mcp_ids`. A filesystem-move-only migration
//! would orphan every metadata entry on first `scan_skills` after the move,
//! reset every Skill's category / tags, and silently drop every Scene's
//! `skill_ids` at sync time (filtered by `find()` per CLAUDE.md `:121`).
//!
//! This migration therefore performs two coupled transformations:
//!
//!   1. Filesystem move `~/.ensemble/` → `~/.cc-workshop/`
//!   2. Path-string rewrite inside `data.json` (keys + values) and
//!      `settings.json` (defaults only) so every `/$HOME/.ensemble/...`
//!      substring becomes `/$HOME/.cc-workshop/...`.
//!
//! Plugin-sourced Skills under `~/.ensemble/skills/` are SYMLINKS into
//! `~/.claude/plugins/cache/`. `fs::rename` preserves symlinks (POSIX
//! moves the link, not the target); the cross-volume fallback uses
//! `cp -RP` (preserve symlinks) — NOT `-RL` (dereference) — for the
//! same reason.

use log::{info, warn};
use serde_json::Value;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

/// Outcome reported back to the Tauri `setup` hook. Used to decide whether
/// to surface a one-time toast / dialog.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationOutcome {
    /// No legacy directory present, migration already completed in a
    /// previous launch, or env var override active.
    Skipped,
    /// Filesystem move + data-rewrite both completed in this launch.
    Migrated,
    /// Both legacy and new directories exist with real data — refused to
    /// touch either. Caller should surface a non-blocking notice.
    Conflict,
}

pub const LEGACY_DIR_NAME: &str = ".ensemble";
pub const NEW_DIR_NAME: &str = ".cc-workshop";
const BREADCRUMB_FILENAME: &str = "MOVED_TO_CC_WORKSHOP.txt";
const LEGACY_ENV_VAR: &str = "ENSEMBLE_DATA_DIR";
const NEW_ENV_VAR: &str = "CC_WORKSHOP_DATA_DIR";

/// Entry point. Call from `lib.rs::setup` BEFORE `migrate_claude_md_storage`
/// and BEFORE the first `read_app_data` of the launch.
pub fn migrate_legacy_data_dir() -> Result<MigrationOutcome, String> {
    // Honour either env var if set — a test or power user has explicitly
    // pinned the data directory and we must not touch the default ~ paths.
    if std::env::var(LEGACY_ENV_VAR).is_ok() || std::env::var(NEW_ENV_VAR).is_ok() {
        info!("[migrate] env var data dir override active — skipping legacy migration");
        return Ok(MigrationOutcome::Skipped);
    }

    let home = dirs::home_dir()
        .ok_or_else(|| "could not resolve $HOME — cannot migrate".to_string())?;
    let legacy = home.join(LEGACY_DIR_NAME);
    let new = home.join(NEW_DIR_NAME);

    // Case A: legacy absent → nothing to do (fresh install or already migrated).
    if !path_exists_nofollow(&legacy) {
        return Ok(MigrationOutcome::Skipped);
    }

    let legacy_meta = fs::symlink_metadata(&legacy)
        .map_err(|e| format!("stat {} failed: {e}", legacy.display()))?;

    // Case B: legacy is a regular file (attacker / accident) → abort loudly.
    if !legacy_meta.is_dir() && !legacy_meta.file_type().is_symlink() {
        return Err(format!(
            "Refusing to migrate: {} is not a directory (found regular file). \
             Inspect and remove manually before relaunching.",
            legacy.display()
        ));
    }

    // Case C: legacy is a symlink. We resolve it and migrate the link's
    // target dir but DO NOT delete the symlink itself — the user may have
    // intentionally aliased ~/.ensemble to an external volume. Skip
    // migration to preserve user intent; the symlinked target keeps
    // working as the data dir if get_app_data_dir falls back (it won't
    // — we updated path.rs to use .cc-workshop — but the user can set
    // the env var to keep the symlinked layout).
    if legacy_meta.file_type().is_symlink() {
        warn!(
            "[migrate] {} is a symlink; user-managed layout, skipping",
            legacy.display()
        );
        return Ok(MigrationOutcome::Skipped);
    }

    // legacy is now confirmed a real directory.
    //
    // Idempotency: if legacy has no real data (only the breadcrumb or empty),
    // migration already completed in a previous launch. Skip.
    if !has_real_data(&legacy)? {
        info!(
            "[migrate] legacy {} contains no canonical data — skipping (already migrated)",
            legacy.display()
        );
        return Ok(MigrationOutcome::Skipped);
    }

    let new_present = path_exists_nofollow(&new);

    if new_present {
        let new_meta = fs::symlink_metadata(&new)
            .map_err(|e| format!("stat {} failed: {e}", new.display()))?;
        if !new_meta.is_dir() {
            return Err(format!(
                "Refusing to migrate: {} exists but is not a directory.",
                new.display()
            ));
        }
        if directory_is_empty(&new)? {
            // Case D: new is empty → safe to remove and proceed.
            fs::remove_dir(&new)
                .map_err(|e| format!("could not remove empty {}: {e}", new.display()))?;
            info!("[migrate] removed empty {} before move", new.display());
        } else if has_real_data(&new)? {
            // Case E: both have real data — DO NOT MERGE. Surface to user.
            warn!(
                "[migrate] both {} and {} contain data — refusing to merge",
                legacy.display(),
                new.display()
            );
            return Ok(MigrationOutcome::Conflict);
        } else {
            // Only stub files in new (e.g. health-check leftover) — clear them.
            clear_directory_contents(&new)?;
            fs::remove_dir(&new).map_err(|e| {
                format!("could not remove stub dir {} after clearing: {e}", new.display())
            })?;
        }
    }

    // Case F: legacy already breadcrumbed but new is gone → user manually
    // deleted the new dir after migration. Re-run the move, ignoring the
    // breadcrumb (it will be regenerated). Remove the stale breadcrumb so
    // it does not get carried into the new directory.
    let legacy_breadcrumb = legacy.join(BREADCRUMB_FILENAME);
    if legacy_breadcrumb.exists() {
        info!("[migrate] breadcrumb present but new dir absent — re-running migration");
        let _ = fs::remove_file(&legacy_breadcrumb);
    }

    // ----- Phase 1: filesystem move (rename with cross-volume fallback) -----
    info!(
        "[migrate] starting filesystem move: {} -> {}",
        legacy.display(),
        new.display()
    );
    rename_with_cross_volume_fallback(&legacy, &new)?;

    // ----- Phase 2: rewrite path-string identifiers inside data.json -----
    // MUST succeed for migration to be considered complete — see file header.
    if let Err(e) = rewrite_paths_in_data_json(&home, &new) {
        return Err(format!(
            "filesystem moved but data.json rewrite failed: {e}. \
             Relaunch the app to retry; legacy paths in data.json mean Skill \
             metadata will appear orphaned. Pre-migration backup at {}.",
            new.join("data.json.pre-migration.bak").display()
        ));
    }

    // ----- Phase 3: rewrite settings.json (best-effort, non-fatal) -----
    if let Err(e) = rewrite_paths_in_settings_json(&home, &new) {
        warn!("[migrate] settings.json rewrite failed (non-fatal): {e}");
    }

    // ----- Phase 4: breadcrumbs (best-effort, never block) -----
    if let Err(e) = leave_breadcrumb_legacy(&home, &new) {
        warn!("[migrate] breadcrumb write failed (non-fatal): {e}");
    }

    info!(
        "[migrate] complete: {} -> {}",
        legacy.display(),
        new.display()
    );
    Ok(MigrationOutcome::Migrated)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn path_exists_nofollow(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

fn directory_is_empty(p: &Path) -> Result<bool, String> {
    let mut it = fs::read_dir(p).map_err(|e| format!("read_dir {}: {e}", p.display()))?;
    Ok(it.next().is_none())
}

/// "Real data" = any of the named subdirectories / files that the running app
/// would populate. A bare `.DS_Store` or `.health-check` probe is not data.
fn has_real_data(dir: &Path) -> Result<bool, String> {
    const REAL: &[&str] = &[
        "data.json",
        "settings.json",
        "skills",
        "mcps",
        "claude-md",
        "rules",
        "trash",
        "marketplace-cache",
        "backups",
    ];
    for name in REAL {
        let p = dir.join(name);
        if path_exists_nofollow(&p) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn clear_directory_contents(dir: &Path) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let p = entry.path();
        let res = if entry
            .file_type()
            .map(|t| t.is_dir() && !t.is_symlink())
            .unwrap_or(false)
        {
            fs::remove_dir_all(&p)
        } else {
            fs::remove_file(&p)
        };
        if let Err(e) = res {
            warn!("[migrate] could not clear stub {}: {e}", p.display());
        }
    }
    Ok(())
}

/// `fs::rename` is atomic but only on the same filesystem. EXDEV ("invalid
/// cross-device link", errno 18 on Darwin and Linux) happens when the user
/// has symlinked $HOME or has $HOME on an APFS volume but `.ensemble` was
/// originally on an external one. Fallback: `cp -RP` (preserve symlinks —
/// plugin entries are symlinks into `~/.claude/plugins/cache/`) then
/// `rm -rf` the source. We use `/bin/cp` rather than rolling a Rust
/// recursive copy because the system tool handles permissions, xattrs,
/// resource forks (HFS+ tail), and symlink modes correctly.
fn rename_with_cross_volume_fallback(src: &Path, dst: &Path) -> Result<(), String> {
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if e.raw_os_error() == Some(EXDEV) => {
            warn!(
                "[migrate] cross-volume rename ({e}); falling back to cp -RP + rm -rf"
            );
            let status = Command::new("/bin/cp")
                .arg("-RP")
                .arg(src.as_os_str())
                .arg(dst.as_os_str())
                .status()
                .map_err(|e| format!("could not spawn /bin/cp: {e}"))?;
            if !status.success() {
                return Err(format!("/bin/cp -RP exited with {status}"));
            }
            // Verify the copy actually produced data before deleting source.
            if !path_exists_nofollow(dst) || directory_is_empty(dst).unwrap_or(true) {
                return Err(format!(
                    "cp completed but {} is missing or empty — refusing to delete source",
                    dst.display()
                ));
            }
            fs::remove_dir_all(src).map_err(|e| {
                format!(
                    "cp succeeded but rm -rf {} failed: {e}. \
                     Migration is complete; the legacy dir will be removed on next launch.",
                    src.display()
                )
            })?;
            Ok(())
        }
        Err(e) if e.kind() == ErrorKind::PermissionDenied => Err(format!(
            "permission denied moving {} -> {}: {e}. \
             If the legacy directory is owned by root (prior `sudo open` run), run \
             `sudo chown -R $(whoami) ~/.ensemble ~/.cc-workshop` and relaunch.",
            src.display(),
            dst.display()
        )),
        Err(e) => Err(format!(
            "rename {} -> {} failed: {e}",
            src.display(),
            dst.display()
        )),
    }
}

/// EXDEV errno on macOS (Darwin) and Linux. Both POSIX, both 18.
const EXDEV: i32 = 18;

/// Rewrite every absolute-path string inside data.json that references the
/// legacy directory. We use `serde_json::Value` rather than the strongly
/// typed `AppData` so a future field that adds a path string we do not
/// know about still gets rewritten.
///
/// The legacy substring is the user's resolved `$HOME/.ensemble/`; the
/// substitution target is `$HOME/.cc-workshop/`. We rewrite **HashMap keys**
/// as well as string values because `skill_metadata` / `mcp_metadata` are
/// keyed by absolute path (`types.rs:250-251`).
///
/// We perform the rewrite atomically (tmp + rename), and we keep the
/// pre-rewrite content as `data.json.pre-migration.bak` for one-shot
/// rollback inspection in case of regression.
fn rewrite_paths_in_data_json(home: &Path, new_dir: &Path) -> Result<(), String> {
    let data_path = new_dir.join("data.json");
    if !data_path.exists() {
        // Fresh user with no data yet — nothing to rewrite.
        return Ok(());
    }
    let raw = fs::read_to_string(&data_path).map_err(|e| format!("read data.json: {e}"))?;

    let legacy_prefix = format!("{}/", home.join(LEGACY_DIR_NAME).display());
    let new_prefix = format!("{}/", home.join(NEW_DIR_NAME).display());

    // Keep a one-shot safety copy before we mutate.
    let safety = data_path.with_extension("json.pre-migration.bak");
    if !safety.exists() {
        fs::write(&safety, raw.as_bytes())
            .map_err(|e| format!("write pre-migration backup: {e}"))?;
    }

    let mut value: Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse data.json: {e}"))?;
    let mut rewrite_count: usize = 0;
    rewrite_json_paths(&mut value, &legacy_prefix, &new_prefix, &mut rewrite_count);
    info!("[migrate] rewrote {rewrite_count} legacy paths in data.json");

    let serialized =
        serde_json::to_string_pretty(&value).map_err(|e| format!("serialize data.json: {e}"))?;
    let tmp = data_path.with_extension("json.tmp.migrating");
    fs::write(&tmp, serialized.as_bytes())
        .map_err(|e| format!("write tmp data.json: {e}"))?;
    fs::rename(&tmp, &data_path).map_err(|e| format!("rename tmp -> data.json: {e}"))?;
    Ok(())
}

/// Recursively walk a `serde_json::Value`. For every `String` value AND
/// every `Object` key, replace the legacy prefix with the new prefix.
/// We rewrite keys because `skill_metadata` / `mcp_metadata` are HashMaps
/// keyed by absolute path. We do NOT touch numbers / bools / null.
fn rewrite_json_paths(v: &mut Value, legacy: &str, new: &str, count: &mut usize) {
    match v {
        Value::String(s) => {
            if s.starts_with(legacy) {
                *s = format!("{new}{}", &s[legacy.len()..]);
                *count += 1;
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                rewrite_json_paths(item, legacy, new, count);
            }
        }
        Value::Object(map) => {
            let needs_key_rewrite = map.keys().any(|k| k.starts_with(legacy));
            if needs_key_rewrite {
                let old = std::mem::take(map);
                for (k, mut child) in old {
                    let new_k = if k.starts_with(legacy) {
                        *count += 1;
                        format!("{new}{}", &k[legacy.len()..])
                    } else {
                        k
                    };
                    rewrite_json_paths(&mut child, legacy, new, count);
                    map.insert(new_k, child);
                }
            } else {
                for (_, child) in map.iter_mut() {
                    rewrite_json_paths(child, legacy, new, count);
                }
            }
        }
        _ => {}
    }
}

/// Settings.json defaults are `"~/.ensemble/skills"` / `"~/.ensemble/mcps"`.
/// If the user has NOT customised them, rewrite. If they have set any
/// other value, leave alone — assume intentional. We match by exact-string
/// equality against the documented defaults (both `~`-tilde and absolute
/// forms, because `expand_tilde` is applied at read time, not at storage).
fn rewrite_paths_in_settings_json(home: &Path, new_dir: &Path) -> Result<(), String> {
    let settings_path = new_dir.join("settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(&settings_path).map_err(|e| e.to_string())?;
    let mut value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let abs_legacy_skills = format!("{}/skills", home.join(LEGACY_DIR_NAME).display());
    let abs_legacy_mcps = format!("{}/mcps", home.join(LEGACY_DIR_NAME).display());
    let abs_new_skills = format!("{}/skills", home.join(NEW_DIR_NAME).display());
    let abs_new_mcps = format!("{}/mcps", home.join(NEW_DIR_NAME).display());

    let mut changed = false;
    if let Some(obj) = value.as_object_mut() {
        for (key, tilde_default, abs_default, new_default) in [
            (
                "skillSourceDir",
                "~/.ensemble/skills",
                abs_legacy_skills.as_str(),
                "~/.cc-workshop/skills",
            ),
            (
                "mcpSourceDir",
                "~/.ensemble/mcps",
                abs_legacy_mcps.as_str(),
                "~/.cc-workshop/mcps",
            ),
        ] {
            if let Some(s) = obj.get(key).and_then(Value::as_str) {
                if s == tilde_default {
                    obj.insert(key.into(), Value::String(new_default.into()));
                    changed = true;
                } else if s == abs_default {
                    let new_abs = if key == "skillSourceDir" {
                        abs_new_skills.as_str()
                    } else {
                        abs_new_mcps.as_str()
                    };
                    obj.insert(key.into(), Value::String(new_abs.into()));
                    changed = true;
                }
            }
        }
    }
    if changed {
        let serialized = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
        let tmp = settings_path.with_extension("json.tmp.migrating");
        fs::write(&tmp, serialized).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &settings_path).map_err(|e| e.to_string())?;
        info!("[migrate] updated default skill/mcp source dirs in settings.json");
    }
    Ok(())
}

/// Drop a human-readable marker at `~/.ensemble/MOVED_TO_CC_WORKSHOP.txt`
/// AFTER the move so a user who later finds an empty `~/.ensemble/` sees
/// an explanation. We recreate the legacy directory just to hold the
/// breadcrumb — a single text file.
fn leave_breadcrumb_legacy(home: &Path, new_dir: &Path) -> Result<(), String> {
    let legacy = home.join(LEGACY_DIR_NAME);
    fs::create_dir_all(&legacy).map_err(|e| e.to_string())?;
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let body = format!(
        "CC Workshop migrated this directory to:\n  {}\n\n\
         Migration timestamp (Unix): {ts}\n\
         App version: {}\n\n\
         You can safely delete this folder. If you have a backup tool \
         (Time Machine, etc.) configured to exclude {}, you may want to \
         add an exclusion for the new directory as well.\n",
        new_dir.display(),
        env!("CARGO_PKG_VERSION"),
        legacy.display(),
    );
    fs::write(legacy.join(BREADCRUMB_FILENAME), body).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::path::ENV_TEST_LOCK;
    use serde_json::json;
    use std::sync::MutexGuard;

    /// Helper: scope `$HOME` to a tempdir for one test, restoring on drop.
    /// Holds `ENV_TEST_LOCK` so concurrent env-mutating tests serialise.
    /// Also clears both data-dir env vars so the function under test sees
    /// the default path-based behaviour.
    struct ScopedHome {
        _td: tempfile::TempDir,
        prior_home: Option<String>,
        prior_legacy_env: Option<String>,
        prior_new_env: Option<String>,
        _guard: MutexGuard<'static, ()>,
    }
    impl ScopedHome {
        fn new() -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let td = tempfile::tempdir().expect("tempdir");
            let prior_home = std::env::var("HOME").ok();
            let prior_legacy_env = std::env::var(LEGACY_ENV_VAR).ok();
            let prior_new_env = std::env::var(NEW_ENV_VAR).ok();
            std::env::set_var("HOME", td.path());
            std::env::remove_var(LEGACY_ENV_VAR);
            std::env::remove_var(NEW_ENV_VAR);
            Self {
                _td: td,
                prior_home,
                prior_legacy_env,
                prior_new_env,
                _guard: guard,
            }
        }
        fn home(&self) -> &Path {
            self._td.path()
        }
    }
    impl Drop for ScopedHome {
        fn drop(&mut self) {
            match &self.prior_home {
                Some(v) => std::env::set_var("HOME", v),
                None => std::env::remove_var("HOME"),
            }
            match &self.prior_legacy_env {
                Some(v) => std::env::set_var(LEGACY_ENV_VAR, v),
                None => std::env::remove_var(LEGACY_ENV_VAR),
            }
            match &self.prior_new_env {
                Some(v) => std::env::set_var(NEW_ENV_VAR, v),
                None => std::env::remove_var(NEW_ENV_VAR),
            }
        }
    }

    /// Seed `~/.ensemble/` with the realistic structure: data.json with a
    /// skill_metadata entry keyed by the absolute legacy path, a Scene
    /// referencing the same legacy path in skill_ids, and a settings.json
    /// with the documented `~/.ensemble/skills` default.
    fn seed_legacy(home: &Path) {
        let legacy = home.join(LEGACY_DIR_NAME);
        fs::create_dir_all(legacy.join("skills/test-skill")).unwrap();
        fs::create_dir_all(legacy.join("mcps")).unwrap();

        let skill_key = format!("{}/skills/test-skill", legacy.display());
        let data = json!({
            "categories": [],
            "tags": [],
            "skillMetadata": {
                skill_key.as_str(): { "category": "Dev", "tags": ["rust"], "enabled": true }
            },
            "mcpMetadata": {},
            "claudeMdFiles": [],
            "rules": [],
            "scenes": [{
                "id": "scene-1",
                "name": "Test",
                "description": "",
                "icon": "code",
                "skillIds": [skill_key.as_str()],
                "mcpIds": [],
                "claudeMdIds": [],
                "ruleIds": [],
                "createdAt": "2026-05-18T00:00:00Z",
                "lastUsed": null
            }],
            "projects": []
        });
        fs::write(
            legacy.join("data.json"),
            serde_json::to_string_pretty(&data).unwrap(),
        )
        .unwrap();

        let settings = json!({ "skillSourceDir": "~/.ensemble/skills", "mcpSourceDir": "~/.ensemble/mcps" });
        fs::write(
            legacy.join("settings.json"),
            serde_json::to_string_pretty(&settings).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_no_legacy_skips() {
        let scope = ScopedHome::new();
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Skipped);
        assert!(!scope.home().join(LEGACY_DIR_NAME).exists());
        assert!(!scope.home().join(NEW_DIR_NAME).exists());
    }

    #[test]
    fn test_clean_upgrade_moves_dir() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Migrated);
        // New dir populated
        assert!(scope.home().join(NEW_DIR_NAME).join("data.json").exists());
        assert!(scope
            .home()
            .join(NEW_DIR_NAME)
            .join("skills/test-skill")
            .exists());
        // Legacy dir gone except for breadcrumb
        assert!(scope.home().join(LEGACY_DIR_NAME).exists());
        assert!(scope
            .home()
            .join(LEGACY_DIR_NAME)
            .join(BREADCRUMB_FILENAME)
            .exists());
        assert!(!scope.home().join(LEGACY_DIR_NAME).join("data.json").exists());
    }

    #[test]
    fn test_data_json_keys_rewritten() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        migrate_legacy_data_dir().unwrap();

        let raw = fs::read_to_string(scope.home().join(NEW_DIR_NAME).join("data.json")).unwrap();
        let val: Value = serde_json::from_str(&raw).unwrap();

        let new_key = format!(
            "{}/skills/test-skill",
            scope.home().join(NEW_DIR_NAME).display()
        );
        let legacy_key = format!(
            "{}/skills/test-skill",
            scope.home().join(LEGACY_DIR_NAME).display()
        );

        // HashMap key rewritten
        let metadata = val["skillMetadata"].as_object().unwrap();
        assert!(metadata.contains_key(new_key.as_str()));
        assert!(!metadata.contains_key(legacy_key.as_str()));

        // Scene.skillIds rewritten
        let scene_skill_id = val["scenes"][0]["skillIds"][0].as_str().unwrap();
        assert_eq!(scene_skill_id, new_key);
    }

    #[test]
    fn test_settings_default_paths_rewritten() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        migrate_legacy_data_dir().unwrap();
        let raw =
            fs::read_to_string(scope.home().join(NEW_DIR_NAME).join("settings.json")).unwrap();
        let val: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(val["skillSourceDir"].as_str(), Some("~/.cc-workshop/skills"));
        assert_eq!(val["mcpSourceDir"].as_str(), Some("~/.cc-workshop/mcps"));
    }

    #[test]
    fn test_settings_custom_paths_preserved() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        // Overwrite settings with custom path
        let settings = json!({ "skillSourceDir": "/Volumes/External/my-skills", "mcpSourceDir": "/tmp/custom-mcps" });
        fs::write(
            scope.home().join(LEGACY_DIR_NAME).join("settings.json"),
            serde_json::to_string_pretty(&settings).unwrap(),
        )
        .unwrap();
        migrate_legacy_data_dir().unwrap();
        let raw =
            fs::read_to_string(scope.home().join(NEW_DIR_NAME).join("settings.json")).unwrap();
        let val: Value = serde_json::from_str(&raw).unwrap();
        // Custom paths preserved as-is
        assert_eq!(
            val["skillSourceDir"].as_str(),
            Some("/Volumes/External/my-skills")
        );
        assert_eq!(val["mcpSourceDir"].as_str(), Some("/tmp/custom-mcps"));
    }

    #[test]
    fn test_conflict_with_real_data_returns_conflict() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        // Pre-create new dir with real data
        let new = scope.home().join(NEW_DIR_NAME);
        fs::create_dir_all(&new).unwrap();
        fs::write(new.join("data.json"), "{}").unwrap();
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Conflict);
        // Neither dir touched
        assert!(scope
            .home()
            .join(LEGACY_DIR_NAME)
            .join("data.json")
            .exists());
        assert!(new.join("data.json").exists());
    }

    #[test]
    fn test_empty_new_dir_is_cleared_then_migrated() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        fs::create_dir_all(scope.home().join(NEW_DIR_NAME)).unwrap();
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Migrated);
        assert!(scope.home().join(NEW_DIR_NAME).join("data.json").exists());
    }

    #[test]
    fn test_legacy_is_file_returns_error() {
        let scope = ScopedHome::new();
        fs::write(scope.home().join(LEGACY_DIR_NAME), b"evil").unwrap();
        let result = migrate_legacy_data_dir();
        assert!(result.is_err());
        // Legacy file untouched
        assert!(scope.home().join(LEGACY_DIR_NAME).exists());
        assert!(!scope.home().join(NEW_DIR_NAME).exists());
    }

    #[test]
    #[cfg(unix)]
    fn test_legacy_is_symlink_skipped() {
        use std::os::unix::fs::symlink;
        let scope = ScopedHome::new();
        let target = scope.home().join("alternate-data");
        fs::create_dir_all(&target).unwrap();
        symlink(&target, scope.home().join(LEGACY_DIR_NAME)).unwrap();
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Skipped);
        // Symlink untouched
        assert!(fs::symlink_metadata(scope.home().join(LEGACY_DIR_NAME))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn test_env_var_override_skips_migration() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        std::env::set_var(LEGACY_ENV_VAR, "/tmp/test-override");
        let result = migrate_legacy_data_dir().unwrap();
        std::env::remove_var(LEGACY_ENV_VAR);
        assert_eq!(result, MigrationOutcome::Skipped);
        // Legacy untouched
        assert!(scope
            .home()
            .join(LEGACY_DIR_NAME)
            .join("data.json")
            .exists());
        assert!(!scope.home().join(NEW_DIR_NAME).exists());
    }

    #[test]
    fn test_new_env_var_override_skips_migration() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        std::env::set_var(NEW_ENV_VAR, "/tmp/test-override-2");
        let result = migrate_legacy_data_dir().unwrap();
        std::env::remove_var(NEW_ENV_VAR);
        assert_eq!(result, MigrationOutcome::Skipped);
    }

    #[test]
    fn test_idempotent() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        let first = migrate_legacy_data_dir().unwrap();
        assert_eq!(first, MigrationOutcome::Migrated);
        // Second run: legacy dir contains only the breadcrumb (no canonical
        // data files), new dir is healthy. The has_real_data(&legacy) gate
        // catches this and returns Skipped — no Conflict, no double-move.
        let second = migrate_legacy_data_dir().unwrap();
        assert_eq!(second, MigrationOutcome::Skipped);
        // Third run for extra safety
        let third = migrate_legacy_data_dir().unwrap();
        assert_eq!(third, MigrationOutcome::Skipped);
        // Data still intact
        assert!(scope.home().join(NEW_DIR_NAME).join("data.json").exists());
    }

    #[test]
    fn test_pre_migration_backup_written() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        migrate_legacy_data_dir().unwrap();
        let backup = scope
            .home()
            .join(NEW_DIR_NAME)
            .join("data.json.pre-migration.bak");
        assert!(backup.exists());
        let raw = fs::read_to_string(&backup).unwrap();
        // Backup retains LEGACY-prefixed key
        let legacy_key = format!(
            "{}/skills/test-skill",
            scope.home().join(LEGACY_DIR_NAME).display()
        );
        assert!(
            raw.contains(&legacy_key),
            "pre-migration backup missing legacy key {legacy_key}"
        );
    }

    #[test]
    fn test_breadcrumb_present_but_new_missing_reruns() {
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        // Put a stale breadcrumb in legacy without doing a real migration
        fs::write(
            scope.home().join(LEGACY_DIR_NAME).join(BREADCRUMB_FILENAME),
            "stale",
        )
        .unwrap();
        let result = migrate_legacy_data_dir().unwrap();
        assert_eq!(result, MigrationOutcome::Migrated);
        assert!(scope.home().join(NEW_DIR_NAME).join("data.json").exists());
    }

    #[test]
    #[cfg(unix)]
    fn test_plugin_symlinks_preserved() {
        use std::os::unix::fs::symlink;
        let scope = ScopedHome::new();
        seed_legacy(scope.home());
        // Replace test-skill with a symlink to simulate plugin Skill
        let skill_dir = scope.home().join(LEGACY_DIR_NAME).join("skills/test-skill");
        fs::remove_dir_all(&skill_dir).unwrap();
        let plugin_target = scope.home().join("plugin-cache/plugin-skill");
        fs::create_dir_all(&plugin_target).unwrap();
        fs::write(plugin_target.join("SKILL.md"), "# plugin").unwrap();
        symlink(&plugin_target, &skill_dir).unwrap();
        migrate_legacy_data_dir().unwrap();
        // After migration the link still exists and still points at the same target
        let migrated = scope.home().join(NEW_DIR_NAME).join("skills/test-skill");
        let meta = fs::symlink_metadata(&migrated).unwrap();
        assert!(meta.file_type().is_symlink());
        let target_read = fs::read_link(&migrated).unwrap();
        assert_eq!(target_read, plugin_target);
    }

    #[test]
    fn test_rewrite_json_paths_recurses_arrays_and_objects() {
        let mut v = json!({
            "/HOME/.ensemble/a": {
                "nested": ["/HOME/.ensemble/b", "/other/path"]
            },
            "scenes": [{ "skillIds": ["/HOME/.ensemble/c"] }]
        });
        let mut count = 0;
        rewrite_json_paths(&mut v, "/HOME/.ensemble/", "/HOME/.cc-workshop/", &mut count);
        assert_eq!(count, 3); // key 'a', value 'b', value 'c'
        assert!(v.as_object().unwrap().contains_key("/HOME/.cc-workshop/a"));
        let nested = v["/HOME/.cc-workshop/a"]["nested"].as_array().unwrap();
        assert_eq!(nested[0].as_str(), Some("/HOME/.cc-workshop/b"));
        assert_eq!(nested[1].as_str(), Some("/other/path"));
        assert_eq!(
            v["scenes"][0]["skillIds"][0].as_str(),
            Some("/HOME/.cc-workshop/c")
        );
    }
}
