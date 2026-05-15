# F1 Implementation Plan — Data Protection Infrastructure

Owner: Fix Agent F1 (Opus). Scope: B1 (atomic write + backup), A1 (selective deletion of managed CLAUDE.md / .mcp.json), B7 (`.claude/` scan exception). No other findings, no scope creep.

## Findings under this plan

| ID | File:Line | Issue |
|---|---|---|
| B1 (R5 F14+F15, R6 F6) | `data.rs::write_app_data:257-269` + `read_app_data:243-253` | Non-atomic write; no backup; parse-failure aborts app |
| A1 (R1 A1+F1) | `config.rs::clear_project_config:162-179` + `write_mcp_config:14-20` + `clear_project_config:141-144` | Blind deletion of CLAUDE.md (3 paths) and `.mcp.json` ignores user-authored content |
| B7 (R2 B2/F1) | `claude_md.rs::is_excluded_dir:297-304` | `.claude/` excluded → user's `<project>/.claude/CLAUDE.md` never appears in scan |

## Pre-fix grep audit (callsite coverage of `write_app_data` signature)

Per `.claude/rules/grep-before-enumerate-shared-resource.md`, before changing `write_app_data` internals I enumerated **every** callsite to verify the signature is stable.

```
rg -n 'write_app_data|read_app_data' src-tauri/src/
```

Callsites (24 files / ~70 lines): `data.rs`, `skills.rs`, `mcps.rs`, `rules.rs`, `claude_md.rs`, `marketplace.rs`, `import.rs`, `trash.rs`. **All** use the same signature `fn write_app_data(data: AppData) -> Result<(), String>` and `fn read_app_data() -> Result<AppData, String>`. F1 keeps both signatures byte-identical, so no caller adjustment is needed.

Defense-in-depth grep for `data.json` direct access (bypassing the canonical helpers):

```
rg -n 'data\.json|get_data_file_path' src-tauri/src/
```

Hit: `config.rs:194` inside the existing rule cleanup block (R1 F2). **Out of scope** for F1 — I will not touch that block; A1 work only adds new logic alongside it. (R1 F2 belongs to a later agent or a future P2 pass.)

## B1 — atomic write + 1-slot rotating backup + parse-failure recovery

### `write_app_data` (data.rs)

New body:

1. Serialize to JSON (`serde_json::to_string_pretty(&data)`). If serialization fails, return `Err` immediately — no disk side-effect happened.
2. `ensure_dir(parent)` (preserve existing behavior).
3. **Best-effort backup**: if `data.json` exists, `let _ = fs::copy(data.json, data.json.bak)`. Failures are intentionally swallowed — backup is defense, not the primary write. A backup failure (e.g., disk full when copying) must not block the primary write that the user requested.
4. **Atomic primary write**:
   - `let tmp = data_path.with_extension("json.tmp");`
   - `let file = fs::File::create(&tmp).map_err(...)?;`
   - `file.write_all(json.as_bytes()).map_err(...)?;`
   - `file.sync_all().map_err(...)?;` (forces fsync — required before rename for true durability across power loss; POSIX rename is atomic but only guarantees nothing about whether the new data is on stable storage without an fsync).
   - `drop(file);` so rename can proceed.
   - `fs::rename(&tmp, &data_path).map_err(...)?;` — POSIX guarantees atomicity within the same filesystem. The tmp path is in the same directory as data.json, so this holds.
5. Return `Ok(())`.

Signature unchanged. Existing tests should continue to pass (they call write/read in tmp directories scoped by ScopedDataDir).

### `read_app_data` (data.rs)

New body:

1. If `data.json` does not exist → `Ok(AppData::default())` (unchanged).
2. `fs::read_to_string` failure → propagate `Err` (unchanged — this is a different error class than parse failure: I/O error means we can't even read bytes, recovery from a bak we also can't read isn't useful).
3. `serde_json::from_str` success → `Ok(data)` (unchanged).
4. `serde_json::from_str` **failure** — new recovery path:
   - Try `data.json.bak`: if it exists, `fs::read_to_string` it and re-parse. If that parses, return the bak data (the user gets back to "almost current" state).
   - If bak doesn't exist OR also fails to parse → quarantine the corrupt main file:
     - `let stamped = data.json.corrupt.<unix_ts>;` (use `SystemTime::now().duration_since(UNIX_EPOCH)` for a stable monotonic-ish suffix; fall back to "unknown" if clock errors).
     - `let _ = fs::rename(data_path, stamped);` (best-effort — even if rename fails we still want to fall back to default and not leave the user stuck).
     - Return `Ok(AppData::default())`.

This satisfies F15's "no recovery path" failure mode. The rename ensures the next start does not re-trigger the same recovery and the corrupt evidence is preserved for forensics. User sees a working (default) UI and can recover from `data.json.bak` manually if they want their last state.

### Why no UI banner for "data was restored from backup"

The task explicitly says: "**最小化复杂度**". A user-facing banner would require:
- New AppData field (e.g. `last_recovery_at`) → schema change
- Front-end state to surface it
- Translations (none today, but precedent matters)

The current design produces a directly observable artifact (`data.json.corrupt.<ts>` in `~/.ensemble/`) that a power-user can spot, and the UI silently keeps working with default state — which is itself the strongest signal something happened (user notices their categories are gone). This matches existing project tone (no banners for migration warnings either). Leaving banner for a future P2.

## A1 — selective deletion of Ensemble-managed CLAUDE.md / .mcp.json

### Helper functions in `config.rs` (private)

Two new helpers, both pure logic + small amount of I/O, called only inside `config.rs`. They take the AppSettings and AppData snapshots that the callers have already loaded (under DATA_MUTEX).

```rust
/// Returns the set of byte-identical contents currently managed as
/// CLAUDE.md files by Ensemble. Used to decide whether a project-side
/// CLAUDE.md is safe to delete (it is, iff its bytes match a managed
/// file).
fn ensemble_managed_claude_md_contents(app_data: &AppData) -> Vec<Vec<u8>> {
    app_data
        .claude_md_files
        .iter()
        .filter_map(|f| f.managed_path.as_deref().map(expand_path))
        .filter_map(|p| fs::read(&p).ok())
        .collect()
}

/// Returns true iff the file at `path` exists and its bytes match one of
/// `managed_contents`. Missing file → false (nothing to compare against);
/// I/O error on read → false (safe default: do not delete if we cannot
/// verify equality).
fn matches_any_managed(path: &Path, managed_contents: &[Vec<u8>]) -> bool {
    match fs::read(path) {
        Ok(bytes) => managed_contents.iter().any(|m| m == &bytes),
        Err(_) => false,
    }
}

/// Returns the set of MCP `name` values for every managed MCP JSON in
/// `mcp_source_dir`. The .mcp.json `mcpServers` HashMap is keyed by this
/// `name`, so this set is what we use to decide which entries we are
/// permitted to remove from a project's .mcp.json.
fn ensemble_managed_mcp_names(mcp_source_dir: &str) -> HashSet<String> {
    let dir = expand_path(mcp_source_dir);
    let mut names = HashSet::new();
    let Ok(entries) = fs::read_dir(&dir) else { return names; };
    for entry in entries.filter_map(|e| e.ok()) {
        let p = entry.path();
        if p.extension().map_or(false, |ext| ext == "json") {
            if let Ok(content) = fs::read_to_string(&p) {
                if let Ok(cfg) = serde_json::from_str::<McpConfigFile>(&content) {
                    names.insert(cfg.name);
                }
            }
        }
    }
    names
}
```

### `clear_project_config` — CLAUDE.md change

Acquire DATA_MUTEX once around the data.json-dependent work. Replace lines 162-179 (3 hardcoded removals) with a loop that:
1. Reads AppData via `read_app_data()` under the guard.
2. Computes `managed_contents`.
3. For each of the 3 candidate paths (`CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`), if the file exists, check `matches_any_managed`. If yes → delete; if no → skip (preserve user's hand-written file).

### `clear_project_config` — .mcp.json change

Replace lines 141-144 (`fs::remove_file` on .mcp.json). New logic:
1. Get `mcp_source_dir` from AppSettings (`read_settings()` — no DATA_MUTEX needed; settings are independent).
2. Compute `managed_mcp_names` set.
3. Read current `<project>/.mcp.json` if it exists. Parse as JSON `Value`.
4. From `mcpServers` HashMap, remove only entries whose key is in `managed_mcp_names`.
5. **Decision: when to delete vs. preserve the file**:
   - If before-cleanup `mcpServers` was entirely managed (every key was managed) → after cleanup it's empty AND there were no unmanaged keys to begin with → delete the entire file (matches existing "only Ensemble wrote this" assumption).
   - Otherwise → write back the trimmed `mcpServers` (mcpServers may be empty after cleanup, but only because all entries were managed AND there are other unrelated fields the user authored at the top level. Even then, an empty `mcpServers: {}` is a valid Claude Code config; we preserve it.)

This is "Option A with conditional" from the task instructions.

### `write_mcp_config` — empty list case

Currently (line 15-20): empty list ⇒ `fs::remove_file` if exists. Replace with: empty list ⇒ apply the same selective-removal path used by `clear_project_config` for .mcp.json (factored into a private helper).

I'll add a helper `trim_managed_mcps_in_file(mcp_path: &Path, managed: &HashSet<String>) -> Result<(), String>` that encapsulates "read current file → trim managed keys → either delete-if-was-all-managed or rewrite". Both `write_mcp_config` (empty-list branch) and `clear_project_config` (.mcp.json cleanup) call into this helper.

When `write_mcp_config` is called with a **non-empty** list, the existing "overwrite with new mcpServers" semantic is preserved — that path is the deliberate "sync writes Ensemble's MCPs" flow.

### DATA_MUTEX placement in `clear_project_config`

After skill symlink removal (which doesn't need data.json), before the rule cleanup block (which already reads data.json directly), acquire `_guard` and read AppData. The CLAUDE.md and .mcp.json changes use AppData. The existing rule cleanup at 189-219 continues to use its own fs::read_to_string path — out of scope.

Since the rule cleanup block currently runs **without** DATA_MUTEX (R1 F2), holding the guard during my new code is strictly better (no concurrent writers can race). The block doesn't release the guard until function return, so the existing rule cleanup runs inside the guard incidentally.

This does mean my fix incidentally improves R1 F2 too (concurrent writer protection during rule cleanup). I document it but flag that I did not modify the rule cleanup block itself.

## B7 — `.claude` exception in claude_md.rs scan exclude

One-line change at `claude_md.rs:297-304`:

Before:
```rust
.map(|name| EXCLUDED_DIRS.contains(&name) || name.starts_with('.'))
```

After (mirrors `rules.rs:351`):
```rust
.map(|name| EXCLUDED_DIRS.contains(&name) || (name.starts_with('.') && name != ".claude"))
```

The semantics: still exclude `.git`, `.next`, `.venv`, etc. — but allow walker descent into `.claude/`, where `<project>/.claude/CLAUDE.md` lives. The downstream `infer_claude_md_type` (line 402+) already correctly identifies that file as `Project` type.

## User-observable success criteria (per `fix-must-define-user-observable-success.md`)

### B1
- **User does X**: While Ensemble is mid-write of `~/.ensemble/data.json` (e.g. user just reordered categories or imported a Scene), simulate a power loss / forced kill (`pkill -9 ensemble`) **OR** start with a `data.json` that is truncated/invalid JSON.
- **User sees Y**: On next launch, Ensemble starts cleanly. Categories, scenes, projects are intact (from `data.json.bak`) — possibly missing the very last action, but never blank. If both main and bak are unrecoverable, the UI shows default state and `~/.ensemble/data.json.corrupt.<ts>` exists for forensics.
- **User does NOT see**: A permanent "white screen of death" where every IPC fails. No more "Ensemble is bricked, must `rm ~/.ensemble/data.json`".

### A1 (CLAUDE.md)
- **User does X**: In a project directory, the user has previously hand-written `CLAUDE.md` (content unique to their project, not generated by Ensemble). They then attach a Scene with no CLAUDE.md, or hit "Clear" in the Project panel.
- **User sees Y**: Their hand-written `CLAUDE.md` is **still on disk** after the operation. Only CLAUDE.md files whose bytes match a managed Ensemble CLAUDE.md are removed.
- **User does NOT see**: Their hand-written file silently disappearing.

### A1 (.mcp.json)
- **User does X**: User has a `<project>/.mcp.json` with both Ensemble-managed MCPs AND a hand-written entry (e.g. `my-private-mcp`). They sync a Scene that has no MCPs (or call Clear).
- **User sees Y**: `<project>/.mcp.json` still exists, `mcpServers` contains only `my-private-mcp` (the hand-written entry survives). The Ensemble-managed keys are gone.
- **User does NOT see**: Their `my-private-mcp` entry deleted along with the Ensemble-managed ones.

### B7
- **User does X**: A project at `~/work/myproj/` contains `.claude/CLAUDE.md`. User opens Ensemble's CLAUDE.md scan dialog and picks `~/work/myproj/`.
- **User sees Y**: `.claude/CLAUDE.md` appears in the scan list and can be imported.
- **User does NOT see**: Only `<project>/CLAUDE.md` (root) shown, with `.claude/CLAUDE.md` missing as it currently is.

## Self-check 5 (per charter §6)

1. **Does any of this touch code outside the finding-described scope?**
   - `clear_project_config` rule cleanup block (R1 F2): NOT modified. The DATA_MUTEX guard I add wraps it incidentally (strictly improves it), but no code-line change in that block.
   - Otherwise: only `data.rs::read_app_data`, `data.rs::write_app_data`, `config.rs::write_mcp_config`, `config.rs::clear_project_config`, `config.rs` (new private helpers), `claude_md.rs::is_excluded_dir`.

2. **Same bug elsewhere I'm not fixing?** Grep confirms only `data.rs::write_app_data` is the canonical write path; no other writer for `data.json` exists. The matching pattern (bypass-canonical with direct `fs::read_to_string`) does exist in `config.rs:194` for rules — that's R1 F2, **out of F1 scope**.

3. **New dependency / file / IPC?** No new crate. No new IPC. New helpers are private functions inside `config.rs`. The `_plan.md` and `_log.md` are the only new files.

4. **Modified existing IPC signature / return shape?** No. `read_app_data` and `write_app_data` keep exact byte-identical signatures. `write_mcp_config` and `clear_project_config` keep their signatures too — only internal behavior changes.

5. **Broken existing unit tests?** Existing `data.rs` tests use `ScopedDataDir`-style env scoping and exercise `apply_reorder` (pure) + `validate_hierarchy` (pure). They don't depend on the write path beyond round-trip. The atomic write + temp file + rename still produces the same final file. Backup file is best-effort, doesn't affect test assertions. Parse-recovery path triggers only on intentionally corrupted JSON.

## Open questions / proposals (handle in-line per task instructions)

**Q1**: When `clear_project_config` reads AppData under DATA_MUTEX, the existing rule cleanup at line 189-219 still does its own direct read of `data.json`. This duplicate read is inefficient but safe (it's inside the guard now, so the same data is observed). Should I refactor the rule cleanup to reuse the snapshot?

**Proposal**: NO. Refactoring the rule cleanup block touches code that belongs to R1 F2 (separate finding). Leave the duplicate read in place. The cost is one extra `fs::read_to_string` per Clear — negligible.

**Q2**: What if the user has BOTH a managed CLAUDE.md and a hand-written one at the same path?
- e.g., user imported `<project>/CLAUDE.md` to Ensemble, distributed it (so the file in the project IS the managed content), then edited the project's CLAUDE.md manually.
- Now the project's CLAUDE.md no longer matches the managed bytes.
- **My behavior**: file is preserved (since bytes differ). User's edits are not destroyed.
- **Consequence**: A subsequent re-distribute will overwrite with the managed content. This is consistent with distribute's existing "managed wins on push" model.

**Proposal**: This is the correct behavior. Hand-edits survive Clear; only re-distribute (an explicit user action) overwrites them.

**Q3**: What if `data.json.bak` is loaded successfully but is itself stale (5 hours old)? User loses 5 hours of work.

**Proposal**: This is acceptable. The alternative (no bak at all) loses all history. The user has a strong tell: their UI state differs from what they remember. If they want full history, Time Machine is the answer. The 1-slot rolling backup is "best-effort minimal-complexity preservation" — exactly what the task asks for.
