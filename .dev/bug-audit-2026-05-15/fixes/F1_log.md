# F1 Implementation Log — Data Protection Infrastructure

Status: complete. All 3 findings (B1, A1, B7) implemented and gated.

## File-by-file change summary

| File | Lines changed | Reason |
|---|---|---|
| `src-tauri/src/commands/data.rs` | +3 imports, ~115 lines net added (full rewrite of `read_app_data` + `write_app_data` + docstrings) | B1: atomic write + 1-slot backup + parse-failure recovery |
| `src-tauri/src/commands/config.rs` | +112 lines (helpers) + ~30 lines edited (`write_mcp_config` empty branch + `clear_project_config` cleanup block) | A1: selective deletion of managed `.mcp.json` and `CLAUDE.md` |
| `src-tauri/src/commands/claude_md.rs` | +5 lines docstring, 1-line condition change at `is_excluded_dir` | B7: `.claude/` exempted from scan exclusion |

No frontend changes — none of the three findings have a UI surface.

No test changes — existing tests cover the unchanged signatures; behavior change is only in error / recovery paths that aren't currently asserted on.

## B1 — `data.rs::write_app_data` + `read_app_data`

### What changed

- `write_app_data` now: serialize → ensure_dir → best-effort `fs::copy(data.json, data.json.bak)` → `fs::File::create + write_all + sync_all + drop` to `data.json.tmp` → `fs::rename(tmp, data.json)`. The rename is POSIX-atomic on the same filesystem; the tmp file shares the parent directory with the target, so this invariant holds.
- `read_app_data` is unchanged on the happy path (file exists + parses). On parse failure (not on I/O failure — that still propagates) it now:
  1. Tries to read + parse `data.json.bak`. If that succeeds, returns it.
  2. Otherwise renames the corrupt `data.json` → `data.json.corrupt.<unix_ts>` (best-effort) and returns `AppData::default()`.

### Why the file is closed before rename

`fs::File::sync_all()` flushes the OS write buffer but does **not** flush directory metadata. On most filesystems the `fs::rename` that follows updates the directory entry; on Windows we explicitly need the file to be closed before rename can proceed. Putting the `File` inside its own scope drops it before the `rename` call — works on both Unix and Windows.

### Why parse-failure recovery does not also try `data.json.tmp`

The audit's F15 proposal mentioned "try `.bak` then `.tmp`". I excluded `.tmp` because:
- `data.json.tmp` exists only during a write. If it lingers, it means the write was interrupted (partial bytes on disk) — exactly the case we want to NOT load.
- Loading a partial tmp would re-introduce the exact corruption we're trying to recover from.
- `.bak` is the correct recovery source because it was written **successfully** during the previous write cycle (it's a copy of the pre-mutation `data.json`, which itself parsed cleanly when it was last `read_app_data`'d).

### Signature stability — write_app_data callsite audit

```
rg -n 'write_app_data|read_app_data' src-tauri/src/
```

Enumerated callsites: `data.rs` (11), `skills.rs` (3), `mcps.rs` (3), `rules.rs` (12), `claude_md.rs` (14), `marketplace.rs` (15), `import.rs` (1), `trash.rs` (8), `lib.rs` (2 — registrations).

Both signatures are byte-identical to their previous form:
- `pub fn read_app_data() -> Result<AppData, String>`
- `pub fn write_app_data(data: AppData) -> Result<(), String>`

No caller needs to adapt. `lib.rs::generate_handler!` continues to work.

### Manual verification (User does X → User sees Y)

- **X**: With Ensemble closed, manually corrupt `~/.ensemble/data.json` (e.g. `echo "{bogus" > ~/.ensemble/data.json`). Restart Ensemble.
- **Y**: Ensemble loads with categories/scenes intact (from `~/.ensemble/data.json.bak` if it exists) **or** with default state if neither file is readable. `~/.ensemble/data.json.corrupt.<ts>` appears alongside.
- **NOT Z**: No "all IPC failing / white screen" state.

- **X2**: With Ensemble open, reorder some categories several times, then manually `rm ~/.ensemble/data.json.bak`, then `pkill -9 ensemble` mid-write. Restart Ensemble.
- **Y2**: If the SIGKILL landed before `fs::rename`, `data.json` is untouched (atomic semantic). If it landed after `rename`, `data.json` is the new state. Either way the file parses on next launch.
- **NOT Z2**: No truncated `data.json` that fails to parse.

## A1 — `config.rs`: selective deletion of managed CLAUDE.md and `.mcp.json`

### New private helpers in `config.rs`

```rust
fn ensemble_managed_claude_md_contents(app_data: &AppData) -> Vec<Vec<u8>>
fn matches_any_managed(path: &Path, managed_contents: &[Vec<u8>]) -> bool
fn ensemble_managed_mcp_names(mcp_source_dir: &str) -> HashSet<String>
fn trim_managed_mcps_in_file(mcp_path: &Path, managed_names: &HashSet<String>) -> Result<(), String>
```

All four are file-private (no `pub`). They consolidate the "deduce what we are permitted to touch" logic so both `write_mcp_config` and `clear_project_config` use identical rules. No new IPC, no signature change.

### `write_mcp_config` change

The empty-list branch used to do an unconditional `fs::remove_file(.mcp.json)`. It now reads `AppSettings.mcp_source_dir`, computes the managed name set, and delegates to `trim_managed_mcps_in_file`. The non-empty branch is unchanged.

Note: `write_mcp_config` is called both directly (e.g. project sync) and from inside `sync_project_config`. Both paths benefit from the new selective deletion.

### `clear_project_config` change

After the skill-symlink removal (which doesn't depend on data.json), I now acquire `DATA_MUTEX` once and load `app_data` via `read_app_data()`. The guard scope wraps the rest of the function — which **incidentally** includes the legacy rule-cleanup block at lines 316-354 (formerly 189-219). That block continues to do its own direct `fs::read_to_string(data.json)` (out of scope for F1), but now it does so under the mutex — strictly safer than before.

- `.mcp.json` cleanup: `trim_managed_mcps_in_file` replaces the prior blanket `fs::remove_file`.
- CLAUDE.md cleanup: loop over the 3 candidate paths; for each existing file, compare bytes to `ensemble_managed_claude_md_contents`; remove only on match.

### "All-managed → delete file" decision in `trim_managed_mcps_in_file`

If the original `mcpServers` HashMap contained only managed keys AND `mcpServers` is the only top-level key in the file, we delete the whole file (matches the prior "Ensemble wrote this entire file" assumption). If there are other top-level keys, or if any unmanaged key existed alongside the managed ones, we rewrite the trimmed JSON — preserving the user's hand-written content.

### Manual verification

- **X**: In `~/test-proj/`, hand-write a `CLAUDE.md` with content `# my private notes`. Click "Clear" for that project in Ensemble.
- **Y**: `~/test-proj/CLAUDE.md` still exists with the same bytes.
- **NOT Z**: The file is not silently deleted.

- **X2**: In `~/test-proj/.mcp.json`, hand-write `{"mcpServers": {"managed-foo": {...}, "user-bar": {...}}}` where `managed-foo` corresponds to an Ensemble MCP and `user-bar` doesn't. Click "Clear".
- **Y2**: `.mcp.json` now has `{"mcpServers": {"user-bar": {...}}}` — only the user's entry remains.
- **NOT Z2**: The whole file deleted.

## B7 — `claude_md.rs::is_excluded_dir`

One condition change at line 302, plus a slight docstring extension.

Before:
```rust
.map(|name| EXCLUDED_DIRS.contains(&name) || name.starts_with('.'))
```

After (mirrors `rules.rs:351`):
```rust
.map(|name| EXCLUDED_DIRS.contains(&name) || (name.starts_with('.') && name != ".claude"))
```

### Manual verification

- **X**: In `~/test-proj/.claude/CLAUDE.md`, place a file. In Ensemble, open the "Scan CLAUDE.md" dialog and pick `~/test-proj/`.
- **Y**: `.claude/CLAUDE.md` appears in the scan results.
- **NOT Z**: Only root `CLAUDE.md` shown.

## Impact analysis — regression vectors I considered

- **Concurrent write race** (R1 F2 territory): partially improved as a side-effect — `clear_project_config` now holds `DATA_MUTEX` through its full data-touching scope. Other paths that bypass the canonical helper (none found outside `config.rs:329`) are still as they were; that's the F2 fix's territory.

- **`data.json.bak` overwriting user-modified `data.json`**: cannot happen. The recovery flow only loads `.bak` when the main `data.json` fails to **parse**. If the user hand-edited `data.json` (a valid use case), parsing succeeds and bak is ignored.

- **Disk full**: best-effort backup means a backup failure does not propagate. Primary write still proceeds. If primary write fails too (no space for tmp), the existing `data.json` remains intact (the rename never happened). User gets an error toast but app remains usable.

- **Cross-filesystem `data.json`**: if a user sets `ENSEMBLE_DATA_DIR` across filesystem boundaries, `fs::rename` could fail with `EXDEV`. The tmp file is always in the *same* directory as the target, so within-FS atomicity holds. Cross-FS only matters if the data dir itself is a mount point — but the tmp and bak still live alongside data.json inside that dir, so the rename within that mount is atomic.

- **Symlinked `data.json`**: if `~/.ensemble/data.json` is a user-made symlink to another location, `fs::rename` rebinds the directory entry to point at the new tmp, breaking the symlink. This was true before this change too (`fs::write` and `fs::rename` both lose the symlink). Not a regression.

- **`.mcp.json` containing `mcpServers: null`** or non-object: `trim_managed_mcps_in_file` checks `as_object_mut` and returns Ok silently — file untouched. Safer than the prior `fs::remove_file`.

- **Test isolation**: tests using `ScopedDataDir` continue to work; the panic guard in `get_app_data_dir()` already prevents unscoped tests from touching `~/.ensemble/`. The new code path (tmp write, bak copy, rename) operates entirely under the env-overridden `data_path`.

## Self-check 5 questions

1. **Touched code outside scope?** Only the `clear_project_config` DATA_MUTEX guard, which now wraps the pre-existing rule-cleanup block — a strict-improvement side-effect, no code-line change inside that block.
2. **Same bug elsewhere?** Grep confirmed no other writer for `data.json`. Other findings (R1 F2 direct-fs-read) are separate scope.
3. **New dependencies / files / IPC?** None. New private helpers in `config.rs`. New `std::io::Write`, `std::time::{SystemTime, UNIX_EPOCH}` imports in `data.rs` (stdlib). `_plan.md` + `_log.md` per charter.
4. **Modified IPC signatures?** No. All four affected functions (`read_app_data`, `write_app_data`, `write_mcp_config`, `clear_project_config`) keep their exact signatures.
5. **Broken existing tests?** No — all 185 lib tests + 7 ignored live tests pass.

## Gates — final state

| Gate | Outcome |
|---|---|
| `cargo build` | `Finished dev profile [unoptimized + debuginfo] target(s) in 7.95s` — 1 pre-existing warning unrelated to F1 |
| `cargo test --lib` | `test result: ok. 185 passed; 0 failed; 7 ignored; 0 measured; 0 filtered out; finished in 0.79s` |
| `cargo test --lib -- --include-ignored` | `test result: ok. 192 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 254.68s` |
| `npx tsc --noEmit` | no output (clean) |
| `npx eslint src/` | `17 problems (0 errors, 17 warnings)` — all warnings pre-existing in files I did not touch |
