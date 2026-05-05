# Fallback Path Must Be Unreachable in Test Builds

Any function that can write real files, hit real network, touch a real DB, or call a real external resource must, when compiled or run under a test profile (`cfg(test)` / `NODE_ENV=test` / equivalent), refuse to fall back to the production path. The last layer of defense must be a panic or explicit error — never a silent fallback.

## Why

Test isolation is conventionally written as *positive guarantee*: "tests must set `ENSEMBLE_DATA_DIR=/tmp/...` before calling disk-writing functions". This depends on every test author and every SubAgent remembering the rule. In a project where multiple SubAgents touch the same code in parallel, that discipline is unenforceable. A single missed setup, a single transient unset during a parallel race, and the production path silently writes into the developer's real data directory.

This is not theoretical. On 2026-05-04 in this project, a Rust integration test wrote test fixtures (categories named `A`, `B`, `C`, `new-0`, `new-7` with `#000000`/`#FFFFFF` colors) into the user's real `~/.ensemble/data.json`, replacing the user's hand-curated Categories, Tags, and Scenes. The user chose not to recover from Time Machine and rebuilt manually. The fix that made it impossible to repeat was a single `cfg(test)` panic in `get_app_data_dir()`.

The principle: **convert positive guarantee into negative guarantee at the lowest level**. Make the production path *physically unreachable* under test build, not just *socially discouraged*.

## How to Apply

Triggers — review/write any function that:
- Returns a default file path or directory (`get_app_data_dir`, `default_config_path`, etc.)
- Falls back to a home directory, user directory, or current working directory
- Has the shape `env::var(...).unwrap_or_else(|_| <production default>)` or `path.unwrap_or_else(|| dirs::home_dir())`
- Performs `fs::write`, `fs::remove`, network requests, or external process spawns

Required pattern in Rust:

```rust
pub fn get_app_data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("ENSEMBLE_DATA_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(test)]
    {
        panic!(
            "get_app_data_dir() called without ENSEMBLE_DATA_DIR set during cargo test. \
             Tests must use ScopedDataDir to avoid writing to the real ~/.ensemble/."
        );
    }
    #[cfg(not(test))]
    {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".ensemble")
    }
}
```

Equivalent shapes for other languages:
- TypeScript with Vitest: branch on `process.env.NODE_ENV === 'test'` and throw before touching real paths.
- Python with pytest: detect `PYTEST_CURRENT_TEST` and raise.

Add a regression-guard test that verifies the panic happens — `#[should_panic]` covering the case where the env override is unset under test build. This guards the rule itself against accidental removal.

The guard runs in addition to, not instead of, `ScopedDataDir`-style scoped overrides. The point is that *forgetting* the scope is loud, not silent.

## Out of Scope

This rule does not require the same treatment for pure read functions or for functions that operate only on tempfile or in-memory state. The trigger is real-resource side effects.
