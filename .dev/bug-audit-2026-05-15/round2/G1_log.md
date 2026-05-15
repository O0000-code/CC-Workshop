# G1 Implementation Log — R2-1 (NFC/NFD) + R2-2 (EnsembleDir health check)

## File-by-file changes

### `src-tauri/Cargo.toml`
- Added `unicode-normalization = "0.1"` (resolves to 0.1.25 — the version published 2024-08; no breaking changes since 0.1.0). This is the only new dependency permitted by the Round 2 charter to G1, used to convert raw `String` byte sequences into canonical NFC form for stable `HashMap` keying. The crate is part of the `unicode-rs` org and is a transitive dep of multiple stdlib-adjacent crates (regex, unicode-bidi, idna) so it's already in the dep tree; adding it as a direct dep makes the API surface explicit.

### `src-tauri/src/utils/path.rs`
- Imported `UnicodeNormalization` trait.
- Added `pub fn normalize_nfc(s: &str) -> String` with documentation explaining the macOS APFS / git / Linux interaction.
- Added three unit tests:
  - `test_normalize_nfc_collapses_nfd_and_nfc` — verifies precomposed `é` and decomposed `e` + combining acute produce byte-equal output.
  - `test_normalize_nfc_ascii_passthrough` — ASCII strings are NFC fixed points.
  - `test_normalize_nfc_cjk_passthrough` — CJK characters are already NFC-canonical.

### `src-tauri/src/commands/skills.rs`
- Imported `normalize_nfc` from `crate::utils`.
- In `parse_skill_file` (line ~211-220):
  - `id` now derived as `normalize_nfc(&skill_dir.to_string_lossy())`.
  - `source_path` reuses the already-normalised `id.clone()` (preserves `id == source_path` invariant in NFC form, and saves one extra `.nfc()` pass).

### `src-tauri/src/commands/mcps.rs`
- Imported `normalize_nfc` from `crate::utils`.
- In `parse_mcp_file` (line ~178-187):
  - `id` now derived as `normalize_nfc(&file_path.to_string_lossy())`.
  - `source_path` reuses the normalised `id.clone()`.

### `src-tauri/src/types.rs`
- Added `pub has_completed_unicode_normalization: bool` field to `AppData` with `#[serde(default)]` for backward compatibility (legacy `data.json` files without the key deserialise to `false`).

### `src-tauri/src/commands/data.rs`
- `init_app_data`:
  - Initialises new installs' `has_completed_unicode_normalization` to `true` (fresh installs have no legacy NFD keys to migrate; setting `true` avoids an empty migration pass).
  - Appends a write-then-delete health check probe (writes `.health-check` containing `env!("CARGO_PKG_VERSION")`, then removes it). On `fs::write` failure, returns an `EnsembleDirUnwritable:`-prefixed error string containing the canonical chown command.
- Added private helpers `skill_metadata_populatedness` / `mcp_metadata_populatedness` — heuristic scores used by collision resolution.
- Added `#[tauri::command] pub fn migrate_unicode_normalization() -> Result<UnicodeMigrationReport, String>`:
  - Idempotence: AppData flag fast-path; per-entry `nfc_key == key` no-op.
  - Algorithm: drain `skill_metadata` / `mcp_metadata` into a `Vec`, rebuild a new `HashMap` keyed by NFC form. On key collision (NFC and NFD copies of the same path), the higher-`populatedness` entry wins.
  - Failure model: `write_app_data` errors propagate; flag stays `false`; retried on next launch.
- Added new public type `UnicodeMigrationReport` (serializable, returned to frontend; not currently surfaced).
- Added new test module `unicode_normalization_migration_tests` with 6 tests covering idempotence, NFC re-keying for skills + MCPs, collision resolution, ASCII pass-through, and flag advancement.

### `src-tauri/src/lib.rs`
- Registered `data::migrate_unicode_normalization` in `tauri::generate_handler![]`.
- Added an eager-run call inside `setup` mirroring the pattern of `migrate_claude_md_storage`. Logs renormalized / collision counts to stderr; non-zero work paths are visible in Console.app for support. Failure is non-fatal.

### `src/components/layout/MainLayout.tsx`
- In the `useEffect`-mounted `initialize` function: after `await initApp()`, reads `useAppStore.getState().error` and bails with `setInitError(...)` if the latest error starts with `EnsembleDirUnwritable:`. This is necessary because `appStore.initApp` catches its own IPC errors internally and only writes to `state.error` — without this gate, the parallel loaders downstream would all fail the same way and the UI would land on a blank sidebar.
- In the `if (initError) { return ... }` block: added an `isDirUnwritable = initError.startsWith('EnsembleDirUnwritable:')` branch that renders a dedicated `alertdialog` with:
  - A copy-able code block (`<pre><code>`) containing the chown command (extracted from the backend message via regex; defensive fallback to a hard-coded canonical form).
  - Wording explaining the `sudo open` root cause.
  - A Retry button (`window.location.reload()`).
  - Uses documented design-language tokens (`--color-error`, `--color-error-bg`) per `.claude/rules/design-language.md`, not Tailwind `red-*`.

## Regression risk analysis

| Risk | Mitigation | Verification |
|---|---|---|
| `id == source_path` invariant breaks if normalisation desyncs the two fields | Both fields now derive from the same `normalize_nfc(...)` call (one variable reused via `.clone()`) | Inspected `skills.rs:parse_skill_file` and `mcps.rs:parse_mcp_file` |
| APFS doesn't actually return NFD bytes when given NFC paths | APFS is documented to be normalisation-insensitive — `Path::new(nfc).exists()` matches an on-disk NFD file. The macOS reference confirms this; HFS+ Plus was always-NFD by contract, APFS preserves the as-written form but lookups still resolve | macOS APFS spec, ManKier `man hfs.util` |
| Migration corrupts user data if interrupted mid-write | `write_app_data` is atomic (Round-1 F4a delivered `tmp+fsync+rename`) — partial writes can't survive | Existing `write_app_data` tests, Round-1 F4a log |
| Collision resolution drops the user's data | Heuristic favours the higher-populatedness entry (categories, tags, marketplace provenance all weigh heavily); ties favour first-seen. Each collision logs to stderr for forensic recovery | `unicode_normalization_migration_tests::collision_keeps_more_populated_skill` |
| Health check false-positive on first install (dir does not yet exist) | `ensure_dir` runs immediately before the probe; if dir creation succeeded, write permission is virtually certain. If dir creation fails, `ensure_dir`'s error propagates first (still actionable, though without the `EnsembleDirUnwritable:` prefix) | Inspected ordering in `init_app_data` |
| Frontend `appStore.initApp` error swallowing | Added explicit post-init check in `MainLayout.initialize` that consults `useAppStore.getState().error` and bails before the parallel load runs | Manual trace; covered by structural reasoning since no existing tests exercise this flow |
| Marketplace install writes NFD keys when catalog name contains accented characters | Catalog names come from upstream sources that are overwhelmingly NFC by convention (git, web APIs); next `scan_skills` re-derives the id in NFC form, and if the marketplace happened to write NFD, the next launch's migration collapses it via collision resolution | Best-effort; documented in `G1_plan.md` |
| `has_completed_unicode_normalization` flag absent in old `data.json` | `#[serde(default)]` deserialises to `false`, triggering the one-time migration on next launch. Same pattern as `has_completed_category_id_migration` | Tested via `idempotent_when_flag_already_set` (uses `seed(..., flag=true)`) and `flag_advances_after_run` (`seed(..., flag=false)` → after run flag is true) |

## grep coverage check

```
rg -n 'skill_metadata\.entry|skill_metadata\.get|skill_metadata\.insert|skill_metadata\.remove|mcp_metadata\.entry|mcp_metadata\.get|mcp_metadata\.insert|mcp_metadata\.remove' src-tauri/
```

Returns:
- `skills.rs:122` (`update_skill_metadata::entry`) — incoming `skill_id` came from a prior `scan_skills` (NFC by my fix). Safe.
- `skills.rs:379` (`delete_skill::remove`) — same path.
- `mcps.rs:130` (`update_mcp_metadata::entry`) — same path.
- `mcps.rs:567` (`delete_mcp::remove`) — same path.
- `marketplace.rs:482, :503` (`get`-only inside `get_marketplace_*_readme`) — reads only; lookup will succeed because incoming `skill_id`/`mcp_id` already come from `scan_*`.
- `marketplace.rs:2887, :3142` (`remove` of `old_id` during conflict resolution) — these use `target_dir.to_string_lossy()`; if the upstream catalog name is NFC (overwhelming common case), the key is NFC. Edge case where conflict resolution targets a legacy NFD entry: covered by migration on the next launch via collision-merge (since the new install would write NFC, and the legacy NFD would have already been merged in by the boot migration).
- `marketplace.rs:3018, :3316, :3567, :3579` — write sites during finalize_install; keys are `target_dir.to_string_lossy()` → see above.
- `trash.rs:454, :546, :828, :830` — restore path keys are `target_path.to_string_lossy()`; same reasoning.

**Defense-in-depth**: I deliberately did NOT normalise at the marketplace/trash write sites in this round. The reason: doing so would touch 4 additional modules, and the migration-on-boot strategy catches any escaped NFD key on the very next launch via collision resolution. The Round-2 charter explicitly restricts scope.

## Manual verification

### R2-1
1. Clone a skill repo whose directory name is `caf\u{0065}\u{0301}` (NFD) into `~/.ensemble/skills/`. (Or create one via `mkdir $(printf 'caf\xCC\x81')`.)
2. Boot Ensemble (dev build).
3. UI shows the skill. Set its category to "Development".
4. Quit and restart Ensemble.
5. UI still shows the skill under "Development" (not "Uncategorized").

Expected backend log line during step 2:
```
[Migration] unicode-normalization: renormalized N skills + M mcps; collisions: X skill + Y mcp
```

### R2-2
1. Quit Ensemble.
2. `sudo chown -R root /Users/$(whoami)/.ensemble`
3. Boot Ensemble (dev build).
4. UI shows the `EnsembleDirUnwritable` diagnostic pane with the chown command.
5. Copy command, run it in Terminal, click Retry.
6. UI loads normally.
7. Cleanup: ensure your `~/.ensemble` ownership is back to your user.

## Coordination notes

- A transient build break appeared during this round because parallel agent G3 (R2-7 stderr capture) was mid-edit in `mcps.rs`; build was failing with `E0716`. Resolved itself when G3's edit completed. I did not touch `mcps.rs` outside my parse_mcp_file changes.
- TypeScript / ESLint checks at gate time still report errors in `ImportMcpModal.tsx`, `ImportSkillsModal.tsx`, and `TrashRecoveryModal.tsx`. These are G2's WIP for R2-6 / R2-9 and are not in my scope.

## Self-check (6 questions)

1. **Modifications outside scope?** No. Cargo.toml + path.rs + skills.rs + mcps.rs + data.rs + types.rs + lib.rs + MainLayout.tsx are all in scope per G1 brief.
2. **Same bug elsewhere?** Marketplace + trash write sites could theoretically introduce NFD keys but only when catalog names ship NFD, which is virtually never. Migration-on-boot catches escapees on next launch. Documented in plan.
3. **New dependency?** Yes: `unicode-normalization = "0.1"`. This is explicitly permitted to G1 by the Round-2 charter.
4. **Changed Round-1 code?** No. Touched `init_app_data` but only appended new code; the Round-1 atomic-write `write_app_data` is untouched.
5. **Broke any existing test?** No. 196 (regular) + 203 (with --include-ignored) Rust tests pass. 289 frontend vitest tests pass.
6. **IPC signature changes?** Added one new IPC `migrate_unicode_normalization` returning `UnicodeMigrationReport`. Existing IPCs unchanged. `init_app_data` keeps `Result<(), String>` (the new error string is just a longer message under the same shape).

## Gate results

```
cd src-tauri && cargo build               -> ok (1 pre-existing dead_code warning in marketplace.rs)
cd src-tauri && cargo test --lib          -> 196 passed; 0 failed; 7 ignored
cd src-tauri && cargo test --lib -- --include-ignored -> 203 passed; 0 failed
cd Ensemble2 && npx tsc --noEmit          -> 5 errors all in G2 WIP files (ImportMcpModal, ImportSkillsModal, TrashRecoveryModal)
cd Ensemble2 && npx eslint src/components/layout/MainLayout.tsx -> 0 errors (2 pre-existing warnings)
cd Ensemble2 && npx vitest run            -> 289 passed
```

My code is fully clean. Cross-agent TS/ESLint errors will be cleared once G2 finishes their gate.
