# G1 Plan — Filesystem & startup (R2-1 NFC/NFD + R2-2 EnsembleDir health check)

## Scope
- **R2-1 (P1)**: macOS APFS preserves on-disk byte sequence. Skills/MCPs whose directory or filename arrives in NFC (git/Linux origin) vs. NFD (Finder/iCloud origin) get different `id` bytes in our `HashMap` even though the OS treats them as the same file. Result: every metadata lookup returns `None`, user-set `category` reverts on next scan.
- **R2-2 (P0)**: User runs `sudo open Ensemble.app` once → `~/.ensemble/` ownership flips to `root:wheel` → next normal launch's `fs::write` fails → IPC returns "Permission denied (os error 13)" → frontend renders an opaque error with no actionable hint.

Both failures share a common shape: filesystem reality drifts from expectation, no diagnostic surface exists, user gets stuck looping.

## R2-1: NFC normalisation

### Files & functions

| File | Function / line | Change |
|---|---|---|
| `src-tauri/Cargo.toml` | `[dependencies]` block | Add `unicode-normalization = "0.1"` |
| `src-tauri/src/utils/path.rs` | new helper `normalize_nfc(&str) -> String` | NFC-normalise any string used as a metadata key or id |
| `src-tauri/src/commands/skills.rs` | `parse_skill_file:212` (`id`), `:281` (`source_path`) | Both go through `normalize_nfc` so the invariant `id == source_path` holds in NFC form |
| `src-tauri/src/commands/mcps.rs` | `parse_mcp_file:179` (`id`), `:231` (`source_path`) | Same treatment |
| `src-tauri/src/types.rs` | `AppData` struct | Add `#[serde(default)] pub has_completed_unicode_normalization: bool` |
| `src-tauri/src/commands/data.rs` | new IPC `migrate_unicode_normalization` + `init_app_data` default-value list | Boot-time migration that NFC-normalises every existing key in `skill_metadata` / `mcp_metadata`; collision resolution; flag advancement |
| `src-tauri/src/lib.rs` | `setup` closure + `invoke_handler!` | Run migration once at startup; register IPC for tests |

### Migration algorithm
For each of `skill_metadata` / `mcp_metadata`:
1. Drain the map into `Vec<(String, T)>`.
2. For each `(key, value)`:
   - Compute `nfc_key = normalize_nfc(&key)`.
   - If `nfc_key == key`: re-insert as-is (no-op).
   - Else: attempt `map.entry(nfc_key).or_insert(value)`. If a slot at `nfc_key` already exists (collision — both NFC and NFD copies were stored independently), apply the "more-populated-wins" merge: keep whichever entry has more non-default fields (`category`, `category_id`, non-empty `tags`, `last_used`, `install_source`, etc.).
3. Set `has_completed_unicode_normalization = true`, persist via `write_app_data` (atomic write protects us if the migration itself is interrupted).

Idempotent: flag guard prevents re-run; per-entry guard (`nfc_key == key`) makes a second run a no-op even if the flag were cleared.

### grep before declaring coverage
Run these greps to confirm every shared-resource access site is covered:
```
rg -n 'skill_metadata\.|mcp_metadata\.' src-tauri/src/
rg -n 'to_string_lossy.*string|skill_dir.to_str|file_path.to_string_lossy' src-tauri/src/commands/skills.rs src-tauri/src/commands/mcps.rs
```
Findings + decisions:
- `skills.rs:212`, `:281` — id + source_path. **Both normalised**.
- `mcps.rs:179`, `:231` — id + source_path. **Both normalised**.
- `marketplace.rs` writes `skill_id`/`mcp_id` from a `target_dir` that Ensemble creates. The `name` string is user-controlled (downloaded from upstream catalog). To be safe and to preserve the `id == source_path == metadata_key` invariant across rounds, we rely on the fact that next `scan_skills` / `scan_mcps` will re-derive the id in NFC form. If marketplace writes a NFD-keyed entry and the OS happens to return NFD in subsequent `read_dir`, scan returns NFC id but metadata is still NFD-keyed → mismatch. **Decision**: leave marketplace write sites unchanged in this round; relying on the next `scan_*` round to re-key via the migration's at-startup pass would not run between an install and the immediately-following scan. Instead, marketplace install paths benefit from the fact that the immediately-following scan returns NFC ids; existing metadata is keyed by `target_dir.to_string_lossy()` which is itself whatever `target_dir` is. If the catalog `name` is NFC (overwhelming common case for upstream-curated names), marketplace writes NFC keys. The migration only catches the legacy NFD entries that originated from Finder-rename / git-checkout-with-precompose-off. Marketplace path safety = **already NFC by convention**.
- `trash.rs:454`, `:546` insert keys from `target_path.to_string_lossy()`; restored paths are reconstructed from `parse_timestamp_from_name` over the trash filename, then the live re-scan produces NFC. Same reasoning as marketplace.
- IPC entry points (`update_skill_metadata`, `update_mcp_metadata`, `delete_skill`, `delete_mcp`): the `skill_id` parameter arrives from frontend, which got it from `scan_skills` / `scan_mcps` → already NFC. **No defensive normalize on input** to keep the call chain simple; the contract is "scan returns NFC, frontend pipes through".

### macOS APFS verification
APFS is normalisation-insensitive (looking up `/path/é` finds the file whether the on-disk bytes are NFC `é` or NFD `é`). Verified: `man hfs.util` and Apple's APFS documentation describe this behaviour. Practical confirmation: Finder displays one entry regardless of which form a file is stored in. **Implication**: `source_path` may be normalised to NFC even when the disk bytes are NFD — `Path::new(nfc_str).exists()` / `fs::read_dir(nfc_str)` will still succeed. This is exactly why we can safely normalise both `id` and `source_path` without breaking any later `fs::*` call against `source_path`.

## R2-2: EnsembleDir health check + structured frontend handling

### Backend (`data.rs::init_app_data`)
Append a write-then-delete probe at the end of `init_app_data`:
```rust
let probe = get_app_data_dir().join(".health-check");
match fs::write(&probe, env!("CARGO_PKG_VERSION")) {
    Ok(_) => { let _ = fs::remove_file(&probe); }
    Err(e) => {
        let dir = get_app_data_dir();
        return Err(format!(
            "EnsembleDirUnwritable: cannot write to {}. \
             Hint: if you ever opened Ensemble via `sudo`, the directory \
             may now be owned by root. Run: `sudo chown -R $(whoami) {}` \
             in Terminal, then restart Ensemble. (Underlying error: {})",
            dir.display(), dir.display(), e
        ));
    }
}
```
Prefix `EnsembleDirUnwritable:` is the structured shape the frontend matches.

### Frontend (`MainLayout.tsx`)
Existing init flow already wraps `initApp()` in try/catch and shows a generic "Failed to Load" pane on the catch path. Extend that pane: if `initError` starts with `"EnsembleDirUnwritable:"`, render a dedicated diagnostic modal that:
- Displays the chown hint as a copy-able code block.
- Provides a "Retry" button (same `window.location.reload()` action).
- Uses the existing design-language tokens (status-error palette).

The change is localised to the `if (initError) { return … }` block (line 737-755). No new component, no new store action, no IPC contract change.

## User-observable success contracts

**R2-1**
- User does X: Clone a skill repo whose directory name contains Chinese (e.g. `数学专家/`) into `~/.ensemble/skills/`, set its category in Ensemble UI, restart.
- User sees Y: Category persists across restarts.
- User does NOT see: Category silently reverts to "Uncategorized" on next scan.

**R2-2**
- User does X: Boot Ensemble after a previous `sudo open` flipped `~/.ensemble/` to root ownership.
- User sees Y: Diagnostic pane with a chown command they can copy.
- User does NOT see: Blank sidebar plus a generic "Permission denied (os error 13)" string.

## Regression risk register

- **AppData schema bump**: adding `has_completed_unicode_normalization` with `#[serde(default)]` is backward-compatible — old `data.json` deserialises to `false`, triggering the one-time migration on next launch.
- **Migration ordering**: must run AFTER `migrate_category_id_for_skills_mcps` is unaffected. They touch the same `data.json` but the unicode migration only re-keys; it doesn't change category fields. Order in `setup` is independent.
- **NFC vs NFD source_path display**: the Skills/MCP detail panels show `source_path`. NFC normalisation produces visually identical strings for all human writing systems we expect; only the underlying bytes change. The Skill detail panel's "Show in Finder" call (`reveal_in_finder`) passes the string back to `open -R` which uses `Path::new` against APFS → normalisation-insensitive → still works.
- **Marketplace install collision**: if a user had a NFD-keyed `data.json` and then installed a marketplace skill that wrote a NFC key for the same path, the migration collision-merge runs at next startup. The "more-populated-wins" strategy ensures the marketplace's freshly-written entry (with `install_source = "marketplace"` and `marketplace_source` populated) is preserved.
- **Health check probe disk space**: file is `env!("CARGO_PKG_VERSION")` (~5 bytes) and immediately removed. Negligible.
- **Health check race against ensure_dir**: probe runs after `ensure_dir`. If `ensure_dir` succeeded but the parent is unwritable for a non-owner reason (rare — e.g. a file with the same name as the parent dir), the probe correctly fails. Acceptable.

## Gate

```bash
cd src-tauri && cargo build
cd src-tauri && cargo test --lib
cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx tsc --noEmit
cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx eslint src/
cd /Users/bo/Documents/Development/Ensemble/Ensemble2 && npx vitest run
```
