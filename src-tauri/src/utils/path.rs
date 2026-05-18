#![allow(dead_code)]

use std::path::{Path, PathBuf};
use unicode_normalization::UnicodeNormalization;

/// Normalize a string to Unicode NFC (Canonical Composition) form.
///
/// macOS APFS preserves the on-disk byte sequence of file names — a name
/// written as NFC (precomposed `é` = U+00E9) stays NFC, a name written as
/// NFD (decomposed `e` + `̀` = U+0065 U+0301) stays NFD. The OS treats the
/// two forms as equivalent for path resolution (normalisation-insensitive
/// lookup), but Rust `String` equality is a raw byte comparison.
///
/// CC Workshop keys `data.json::skill_metadata` and `data.json::mcp_metadata`
/// by `to_string_lossy()` of the disk path. If the same skill is at one
/// point seen in NFC form (e.g. cloned from git with `core.precomposeUnicode`
/// off) and later in NFD form (e.g. Finder rename), the two scans produce
/// different `String` keys and the user's category / tags get reset.
///
/// The fix is to canonicalise every key — and every `source_path` we
/// publish to the frontend — to NFC at scan time, and to run a one-time
/// migration over existing `data.json` entries so legacy NFD keys collapse
/// to their NFC twins.
///
/// Why NFC: git, Linux filesystems, the Web, and HTTP all default to NFC.
/// Round-tripping across those surfaces is safe in NFC, lossy in NFD.
///
/// APFS path resolution remains normalisation-insensitive against the
/// chosen form, so `Path::new(nfc).exists()` matches an on-disk NFD file
/// transparently. We can therefore normalise both `id` and `source_path`
/// without breaking subsequent `fs::*` calls. See R2-1 in
/// `.dev/bug-audit-2026-05-15/round2/G1_plan.md` and finding R6 F5.
pub fn normalize_nfc(s: &str) -> String {
    s.nfc().collect::<String>()
}

/// Shared mutex used by all tests that mutate the `ENSEMBLE_DATA_DIR`
/// environment variable. Cargo runs tests in parallel by default; without a
/// **single shared** lock spanning every test module that touches this env
/// var, two tests can interleave `set_var`/`remove_var` calls and observe
/// inconsistent state. Tests in `utils::path::tests` and
/// `commands::data::reorder_integration_tests` both acquire this guard
/// before reading or writing `ENSEMBLE_DATA_DIR`.
#[cfg(test)]
pub(crate) static ENV_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Expand ~ to home directory
pub fn expand_path(path: &str) -> PathBuf {
    if path.starts_with('~') {
        if let Some(home) = dirs::home_dir() {
            return home.join(&path[1..].trim_start_matches('/'));
        }
    }
    PathBuf::from(path)
}

/// Get the application data directory
///
/// Honours the `ENSEMBLE_DATA_DIR` environment variable when set (used for
/// test isolation so integration tests do not touch `~/.ensemble/`).
///
/// **Test safety guarantee**: when compiled under `cfg(test)`, this function
/// **refuses to fall back to `~/.ensemble/`**. If `ENSEMBLE_DATA_DIR` is not
/// set, it panics — loudly, instead of silently corrupting the developer's
/// real data. Every test that touches disk MUST set the env var first
/// (typically via `ScopedDataDir`).
///
/// Rationale: prior incident (2026-05-04) — a transient unset of the env var
/// during a parallel test run wrote test fixtures into the user's real
/// `~/.ensemble/data.json`, replacing real categories/tags. The silent fallback
/// is a footgun for *anyone* running `cargo test` on a machine that also runs
/// the app.
pub fn get_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ENSEMBLE_DATA_DIR") {
        return PathBuf::from(dir);
    }

    #[cfg(test)]
    {
        panic!(
            "get_app_data_dir() called without ENSEMBLE_DATA_DIR set during cargo test. \
             Tests must use ScopedDataDir (or set ENSEMBLE_DATA_DIR explicitly) to avoid \
             writing to the real ~/.ensemble/. See src-tauri/src/utils/path.rs comments."
        );
    }

    #[cfg(not(test))]
    {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".ensemble")
    }
}

/// Get the data.json path
pub fn get_data_file_path() -> PathBuf {
    get_app_data_dir().join("data.json")
}

/// Get the settings.json path
pub fn get_settings_file_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

/// Ensure a directory exists
pub fn ensure_dir(path: &Path) -> std::io::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

/// Get relative path from base
pub fn get_relative_path(path: &Path, base: &Path) -> Option<PathBuf> {
    path.strip_prefix(base).ok().map(|p| p.to_path_buf())
}

/// Check if a path is a symlink
pub fn is_symlink(path: &Path) -> bool {
    path.symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

/// Get symlink target
pub fn get_symlink_target(path: &Path) -> Option<PathBuf> {
    std::fs::read_link(path).ok()
}

/// Expand tilde (~) in path to home directory (alias for expand_path)
pub fn expand_tilde(path: &str) -> PathBuf {
    expand_path(path)
}

/// Collapse absolute path to path with ~ prefix
pub fn collapse_tilde(path: &Path) -> String {
    if let Some(home) = dirs::home_dir() {
        if let Ok(relative) = path.strip_prefix(&home) {
            return format!("~/{}", relative.display());
        }
    }
    path.display().to_string()
}

/// Get the user's home directory
pub fn get_home_dir() -> Option<PathBuf> {
    dirs::home_dir()
}

/// Get the path to the application data file (alias for get_data_file_path)
pub fn get_data_path() -> PathBuf {
    get_data_file_path()
}

/// Get the path to the application config/settings file
pub fn get_config_path() -> PathBuf {
    get_settings_file_path()
}

/// Get the ensemble directory (alias for get_app_data_dir)
pub fn get_ensemble_dir() -> PathBuf {
    get_app_data_dir()
}

#[cfg(test)]
mod tests {
    use super::*;
    // Reuse the crate-wide ENV_TEST_LOCK declared above so this module's tests
    // serialise with `commands::data::reorder_integration_tests` (which also
    // mutates ENSEMBLE_DATA_DIR). A per-module lock would NOT prevent races
    // across modules.

    /// R2-1 regression: NFC and NFD encodings of the same string must
    /// canonicalise to byte-equal output. The canonical example is
    /// precomposed `é` (U+00E9) vs decomposed `e` + combining grave
    /// (U+0065 U+0301).
    #[test]
    fn test_normalize_nfc_collapses_nfd_and_nfc() {
        // U+00E9 — precomposed é (NFC form)
        let nfc = "\u{00E9}";
        // U+0065 U+0301 — e + combining acute (NFD form)
        let nfd = "\u{0065}\u{0301}";
        assert_ne!(nfc.as_bytes(), nfd.as_bytes(), "test fixture is wrong if these are byte-equal");
        assert_eq!(normalize_nfc(nfc), normalize_nfc(nfd));
        // NFC form is the fixpoint: normalising NFC again yields the same string.
        assert_eq!(normalize_nfc(nfc), nfc);
    }

    #[test]
    fn test_normalize_nfc_ascii_passthrough() {
        let ascii = "/Users/bo/.ensemble/skills/code-helper";
        assert_eq!(normalize_nfc(ascii), ascii);
    }

    #[test]
    fn test_normalize_nfc_cjk_passthrough() {
        // CJK chars are already in NFC form; nothing to compose.
        let cjk = "数学专家";
        assert_eq!(normalize_nfc(cjk), cjk);
    }

    #[test]
    fn test_expand_path_with_tilde() {
        let result = expand_path("~/Documents");
        let home = dirs::home_dir().unwrap();
        assert_eq!(result, home.join("Documents"));
    }

    #[test]
    fn test_expand_path_with_tilde_slash() {
        let result = expand_path("~/.ensemble/skills");
        let home = dirs::home_dir().unwrap();
        assert_eq!(result, home.join(".ensemble/skills"));
    }

    #[test]
    fn test_expand_path_without_tilde() {
        let result = expand_path("/usr/local/bin");
        assert_eq!(result, PathBuf::from("/usr/local/bin"));
    }

    #[test]
    fn test_expand_path_relative() {
        let result = expand_path("relative/path");
        assert_eq!(result, PathBuf::from("relative/path"));
    }

    #[test]
    fn test_expand_tilde_is_alias() {
        let path = "~/test";
        assert_eq!(expand_tilde(path), expand_path(path));
    }

    /// Helper: scope an `ENSEMBLE_DATA_DIR` value for one test, restoring
    /// the prior value (or unsetting) on drop. Holds [`ENV_TEST_LOCK`] so
    /// concurrent env-mutating tests serialise.
    struct ScopedEnv {
        prior: Option<String>,
        _guard: std::sync::MutexGuard<'static, ()>,
    }
    impl ScopedEnv {
        fn set(value: &str) -> Self {
            let guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
            std::env::set_var("ENSEMBLE_DATA_DIR", value);
            Self { prior, _guard: guard }
        }
    }
    impl Drop for ScopedEnv {
        fn drop(&mut self) {
            match &self.prior {
                Some(v) => std::env::set_var("ENSEMBLE_DATA_DIR", v),
                None => std::env::remove_var("ENSEMBLE_DATA_DIR"),
            }
        }
    }

    #[test]
    fn test_get_app_data_dir_honours_env_override() {
        let _scope = ScopedEnv::set("/tmp/ensemble-override-test");
        let result = get_app_data_dir();
        assert_eq!(result, PathBuf::from("/tmp/ensemble-override-test"));
    }

    #[test]
    fn test_get_data_file_path_uses_env_override() {
        let _scope = ScopedEnv::set("/tmp/ensemble-override-test");
        let result = get_data_file_path();
        assert!(result.ends_with("data.json"));
        assert_eq!(result, PathBuf::from("/tmp/ensemble-override-test/data.json"));
    }

    #[test]
    fn test_get_settings_file_path_uses_env_override() {
        let _scope = ScopedEnv::set("/tmp/ensemble-override-test");
        let result = get_settings_file_path();
        assert!(result.ends_with("settings.json"));
        assert_eq!(
            result,
            PathBuf::from("/tmp/ensemble-override-test/settings.json")
        );
    }

    /// Safety regression test: under `cfg(test)`, calling `get_app_data_dir`
    /// without `ENSEMBLE_DATA_DIR` set MUST panic. This prevents the silent
    /// fallback to `~/.ensemble/` that previously corrupted user data when an
    /// integration test forgot to scope the env var.
    #[test]
    #[should_panic(expected = "ENSEMBLE_DATA_DIR")]
    fn test_get_app_data_dir_panics_without_env_in_tests() {
        let _guard = ENV_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let prior = std::env::var("ENSEMBLE_DATA_DIR").ok();
        std::env::remove_var("ENSEMBLE_DATA_DIR");

        // Capture the panic so we can restore env in non-panic paths too.
        // `should_panic` will catch the unwind for us; the Drop on `prior`
        // restoration below would not run on panic, so we restore now.
        // Strategy: use AssertUnwindSafe + catch_unwind to control restoration.
        let result = std::panic::catch_unwind(|| {
            let _ = get_app_data_dir();
        });

        // Restore env before re-raising the panic for `should_panic` to catch.
        if let Some(v) = prior {
            std::env::set_var("ENSEMBLE_DATA_DIR", v);
        }
        if let Err(payload) = result {
            std::panic::resume_unwind(payload);
        }
        // If we got here, the function did not panic — fail the test.
        panic!("ENSEMBLE_DATA_DIR not set but get_app_data_dir did not panic");
    }

    #[test]
    fn test_get_relative_path_success() {
        let path = Path::new("/home/user/projects/foo/bar.rs");
        let base = Path::new("/home/user/projects");
        let result = get_relative_path(path, base);
        assert_eq!(result, Some(PathBuf::from("foo/bar.rs")));
    }

    #[test]
    fn test_get_relative_path_not_prefix() {
        let path = Path::new("/other/path");
        let base = Path::new("/home/user");
        let result = get_relative_path(path, base);
        assert_eq!(result, None);
    }

    #[test]
    fn test_collapse_tilde() {
        let home = dirs::home_dir().unwrap();
        let path = home.join("Documents/test.txt");
        let result = collapse_tilde(&path);
        assert_eq!(result, "~/Documents/test.txt");
    }

    #[test]
    fn test_collapse_tilde_not_in_home() {
        let path = Path::new("/usr/local/bin/foo");
        let result = collapse_tilde(path);
        assert_eq!(result, "/usr/local/bin/foo");
    }

    #[test]
    fn test_is_symlink_nonexistent() {
        let result = is_symlink(Path::new("/nonexistent/path/that/does/not/exist"));
        assert!(!result);
    }

    #[test]
    fn test_get_symlink_target_nonexistent() {
        let result = get_symlink_target(Path::new("/nonexistent/path"));
        assert!(result.is_none());
    }

    #[test]
    fn test_aliases_match_originals() {
        // Under cfg(test), get_app_data_dir requires ENSEMBLE_DATA_DIR.
        let _scope = ScopedEnv::set("/tmp/ensemble-aliases-test");
        assert_eq!(get_data_path(), get_data_file_path());
        assert_eq!(get_config_path(), get_settings_file_path());
        assert_eq!(get_ensemble_dir(), get_app_data_dir());
    }
}
