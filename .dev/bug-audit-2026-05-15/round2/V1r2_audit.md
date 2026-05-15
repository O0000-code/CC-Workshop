# V1r2 — Round 2 代码层 Audit Report

**Audit scope**: 10 findings (R2-1 → R2-10) × 4 questions ("修对了 / 边界 / 不破现有 / 不引新 bug").
**Audit lens**: pure code-level correctness; user-flow / regression scope is V2r2.
**Verdict (lead)**: **CONDITIONAL GO** — 1 P0 blocker (R2-1 fresh-install category wipe) must fix before commit. Remaining 9 findings are clean or have only Non-Blocking notes.

---

## Gate 复跑结果

| Gate | Result |
|---|---|
| `cargo build` | OK — 1 pre-existing dead_code warning (`marketplace.rs::RegistryPackageTransport`, R1 baseline) |
| `cargo test --lib` | **196 passed, 0 failed, 7 ignored** ✓ |
| `npx tsc --noEmit` | 0 errors ✓ |
| `npx eslint src/` | 0 errors, 17 warnings (all pre-existing, none from R2) ✓ |
| `npx vitest run` | **23 files, 289 passed** ✓ |

All gates pass cleanly. Bug discovered below is not currently catchable by the existing test suite (tests use `ScopedDataDir + seed()` which always pre-creates `data.json`).

---

## R2-1 — NFC normalization migration

### Q1 修对了吗 — **是 (技术正确) / 否 (撞 P0 regression)**

NFC normalization itself works. `unicode_normalization::nfc` (crate 0.1.25 verified at `~/.cargo/registry/src/.../unicode-normalization-0.1.25/src/lib.rs:150`) does exactly what's claimed. Both `parse_skill_file` (skills.rs:215) and `parse_mcp_file` (mcps.rs:182) now derive `id = normalize_nfc(...)` and `source_path = id.clone()` — invariant preserved.

Migration body (`data.rs::migrate_unicode_normalization`) re-keys both metadata HashMaps correctly with sound collision policy (more-populated entry wins, stderr-logged).

### Q2 边界正确吗 — **NO — Critical fresh-install regression**

🚨 **BLOCKING P0**: Order of execution on **fresh install (no `data.json`)** wipes the bootstrap default categories.

Sequence on fresh install:

1. Tauri `setup` (lib.rs:50) runs `migrate_unicode_normalization()`:
   - `read_app_data()` (data.rs:267-269) sees `data.json` doesn't exist → returns `AppData::default()` (silently, **no** error).
   - `default_data.has_completed_unicode_normalization == false` (bool default).
   - Migration drains empty maps → no-op work.
   - Line 1150: `data.has_completed_unicode_normalization = true`.
   - Line 1151: **`write_app_data(data)?` unconditionally writes `data.json`** with the empty-default AppData — categories are empty Vec.
2. Frontend then calls `init_app_data` IPC (data.rs:414-462).
   - `data_path.exists()` is now `true` (just created by step 1).
   - Lines 416-463 (the "no data.json → populate Development / Writing / Analysis defaults") block is **skipped**.
3. User opens app to an empty Categories sidebar. **Lost: Development, Writing, Analysis default categories.**

This is **not** recoverable on subsequent launches:
- Launch 2: data.json exists with `has_completed_unicode_normalization = true` → migration short-circuits.
- `init_app_data` still sees data.json exists → still skips defaults.

The user must manually create the 3 default categories. Same bug also fires for any user who manually deletes `data.json` to "start fresh".

Tests pass because the `unicode_normalization_migration_tests` module uses `seed()` (data.rs:2900-2908) which always writes a valid `AppData` to disk before invoking migration. The "no data.json yet exists" precondition is not covered.

**Fix sketch** (out of audit scope but recommended):
- Option A: in `migrate_unicode_normalization`, skip the `write_app_data` if data.json doesn't yet exist on disk (check `get_data_file_path().exists()` before write, OR move flag-init to `init_app_data` so the boot migration is purely read-only when there's no file).
- Option B: change call order in lib.rs `setup` — run `init_app_data` first (or its equivalent), then `migrate_unicode_normalization`. But `init_app_data` is currently an IPC command called from the frontend, so this requires either calling it from Rust setup or splitting into a Rust-callable initializer.
- Option C: only run the migration if `data.json` already exists on disk; on a brand-new install there is nothing to migrate.

Other R2-1 边界 concerns (Non-Blocking):
- **Marketplace / trash write sites** (`marketplace.rs:2934,3189`, `trash.rs:453,545`) insert/remove metadata keys via raw `target_path.to_string_lossy()` without NFC normalization. G1 documented this is "next-boot migration cleans up" — but the migration flag is one-shot. Once `has_completed_unicode_normalization = true`, future NFD escapes at these write sites are never re-collapsed. Realistically all upstream catalog names are NFC-canonical so the escape is very narrow; documented in G1_log.md line 65; accepted risk.
- **Scene `skill_ids` / `mcp_ids`** Vecs are not migrated. A pre-migration NFD-keyed scene becomes an orphan reference once metadata keys move to NFC. The existing "orphan id silent skip" pattern keeps it working but users lose silently. Narrow case; consistent with existing CLAUDE.md-documented orphan-id semantics. Non-Blocking.

### Q3 不破现有功能吗 — **否 (但 P0 影响 fresh install)**

Existing data.json users (the typical case): `id` lookups now key on NFC, matches the metadata map's NFC keys post-migration. Round-1 atomic write at `write_app_data` untouched. All 185 round-1 baseline tests still green.

Fresh install user: see Q2 above.

### Q4 不引入新 bug 吗 — **新 P0 引入 (Q2)**

Beyond the fresh-install P0: no new race conditions (DATA_MUTEX held throughout migration); no resource leak.

---

## R2-2 — `EnsembleDirUnwritable:` health check

### Q1 修对了吗 — Yes

Probe (`data.rs:486-505`) writes `<dir>/.health-check`, surfaces structured error on failure. Frontend `MainLayout.tsx:760-829` correctly matches `initError.startsWith('EnsembleDirUnwritable:')`, extracts the chown command via regex with a defensive fallback, and renders a dedicated `alertdialog` with copy-able code block.

### Q2 边界正确吗 — Yes

- `.health-check` content is `env!("CARGO_PKG_VERSION")` (~5 bytes), removed best-effort post-write (`let _ = fs::remove_file(&probe)`).
- Health check probe runs AFTER `ensure_dir` (data.rs:404 area), so if the dir was newly created the write almost certainly succeeds.
- Backend uses `app_dir.display()` twice in the message — escape concerns negligible (path is system-controlled).
- Frontend's regex `Run:\s*`([^`]+)`` correctly extracts the canonical chown command; fallback hardcodes `sudo chown -R $(whoami) ~/.ensemble` which differs from the actual `app_dir` IF user has `ENSEMBLE_DATA_DIR` set. Mild but acceptable — the regex is exact-match and the fallback is documented-defensive.

Order-of-operations concern: `init_app_data` writes default data.json at lines 416-462 BEFORE the probe runs at 486-505. If the dir is read-only, the `write_app_data` at 462 will fail FIRST with a generic `"Permission denied"` error (no `EnsembleDirUnwritable:` prefix). The user gets the generic Failed-to-Load pane, not the chown dialog. Only the "data.json exists but dir was later chowned to root" case benefits from the probe — which is exactly the user-reported scenario, so this is acceptable but the probe-AFTER-default-write ordering means a fresh install with already-root-owned dir does NOT get the friendly message. Non-Blocking.

### Q3 不破现有功能吗 — Yes

Pre-existing init flow keeps its generic "Failed to Load" pane via the existing `if (initError)` branch (MainLayout.tsx:806+). New branch is gated on prefix match.

### Q4 不引入新 bug 吗 — Yes

`MainLayout.tsx:280-294` reads `useAppStore.getState().error` post-init explicitly. Stale-React-state issue correctly handled per G1_log.md observation.

---

## R2-3 — `syncProject` step-level reporting

### Q1 修对了吗 — Yes

`projectsStore.ts:281-403` correctly wraps each of 4 steps in own try/catch, records `SyncStepResult` per attempted step. Per-item check for `distribute_scene_claude_md` / `distribute_scene_rules` correctly inspects backend's `Vec<{success, error}>` and converts `success === false` entries into a summarized step error.

`ProjectsPage.tsx:347-413` derives `failedSteps` via `useMemo`, shows banner only when any step failed, uses `var(--color-error)` / `var(--color-error-bg)` design tokens.

### Q2 边界正确吗 — Yes

- Success path (all 4 steps OK) resets `syncStepResults: null` at projectsStore.ts:395-396 — banner clears.
- Partial-fail path stores `stepResults` + `syncResultsProjectId` so the banner can name the affected project.
- Double-push guard at projectsStore.ts:325-330 prevents per-item-check followed by catch from listing the same step twice.
- `clearAndRetry` does NOT auto-resync — design choice per G4_plan.md; user re-clicks Sync deliberately.
- `update_project` (step 4) is wrapped in its own try/catch; if it fails, `lastSynced` in store is NOT updated — matches A7 fix intent.

### Q3 不破现有功能吗 — Yes

`syncProject` still throws on partial failure → existing toast / catch-block consumers (`ProjectsPage` Sync button click, `handleSceneChange`) light up as before. New banner is purely additive.

### Q4 不引入新 bug 吗 — Yes

No race condition (this is a frontend store action; backend IPCs unchanged). No new IPC contract.

---

## R2-4 — HTTP MCP URL validation

### Q1 修对了吗 — Yes

`marketplace.rs:240-262` `validate_http_mcp_url` correctly checks empty trimmed URL + first `{...}` placeholder pair. Hooked into both `install_marketplace_mcp` (HTTP branch only, line 3305-3316) and `update_mcp_http_config` (line 2509).

### Q2 边界正确吗 — Yes

- Empty/whitespace URL → Err.
- `find('{')` then `find('}')` after it; only flags when `name` between braces is non-empty (matches the substitution algorithm at `marketplace.rs:2465` / `3204`).
- Substitution runs BEFORE validation, so a fully-substituted URL passes (the `{...}` placeholder no longer exists).
- stdio MCPs unaffected — branch gating at `install_marketplace_mcp:3306` checks `mcp_type.as_deref() == Some("http")`.

Heuristic false-positive concern: HTTP URLs essentially never contain raw `{` or `}` in canonical form (would be percent-encoded as `%7B` / `%7D`). The check fires only on un-substituted placeholder pairs. Safe.

### Q3 不破现有功能吗 — Yes

Validation runs BEFORE `fs::write` → failed validation = no partial state, no half-written `.mcp.json`. `update_mcp_http_config` returns `Err(reason)` which the existing `McpDetailPanel` toast already handles. `install_marketplace_mcp` returns `InstallOutcome::Failed { reason }` — also an existing variant.

### Q4 不引入新 bug 吗 — Yes

---

## R2-5 — IME composition guard

### Q1 修对了吗 — Yes

`src/utils/keyboard.ts::isEnterCommit(e)` uses dual-property detection: `event.isComposing` (modern) + `event.keyCode === 229` (legacy Safari). Both React events and native events handled via `'nativeEvent' in e` check. 11 text-input replacement sites + 8 deliberately-excluded button-role activator sites.

### Q2 边界正确吗 — Yes

- Verified by grep: total 20 `e.key === 'Enter'` / `isEnterCommit(e)` sites; 11 replaced (text inputs), 9 retained (button-role activators). Aligns with G4_plan.md count of 11/8 with one edge — the count discrepancy is 19 vs 20 because `SortableCategoryRow.tsx` has TWO button-role activators (lines 187 + 215). G4's exclusion logic is correct: button-role keyboard activations cannot be in IME composition.
- `isEnterCommit` for a `KeyboardEvent` with undefined `isComposing` returns true — correct (treats absence as not-composing).
- ColorPicker's hex input commits only when `inputValue.length === 6 && isEnterCommit(e)`; the original guard was `e.key === 'Enter' && inputValue.length === 6`. Order changed (length check second now), but both are pre-checks before mutation; behaviorally equivalent in non-IME usage.

### Q3 不破现有功能吗 — Yes

`isEnterCommit(e)` is a strict subset of `e.key === 'Enter'`. For non-IME users, all three negatives (isComposing, keyCode=229, key!=Enter) are already not-true, so behavior is byte-identical. 6 new unit tests in `keyboard.test.ts` lock down the API contract.

### Q4 不引入新 bug 吗 — Yes

---

## R2-6 — Plugin import error return

### Q1 修对了吗 — Yes

`plugins.rs::import_plugin_skills` / `import_plugin_mcps` now return `PluginImportResult { imported, errors }` (types.rs:792-826). Each per-item error path constructs a `PluginImportError { plugin_id, item_name, error }` (4 paths for skills, 6 paths for MCPs) — all converted from raw `Vec<String>`.

Frontend chain wired correctly: `pluginsStore.importPluginSkills/Mcps` → `Promise<PluginImportResult>` → modals (`ImportSkillsModal.tsx:194-218`, `ImportMcpModal.tsx` mirror) check `result.errors.length > 0`, re-detect to refresh imported flags, keep modal open, surface banner.

### Q2 边界正确吗 — Yes

- `eprintln!` log retained for server-side debug (best practice — non-fatal channel still there).
- `result.imported.length > 0` triggers `onImportComplete?.()` even when partial failure — succeeded items show up on the page immediately.
- Failed rows kept selectable so user can retry or ignore.
- `safeInvoke` may return undefined; `pluginsStore.ts:308` handles via `result ?? emptyResult`.

### Q3 不破现有功能吗 — Yes

IPC `import_plugin_*` signature changed — every TS consumer updated (`pluginsStore.ts`, `ImportSkillsModal.tsx`, `ImportMcpModal.tsx`). `addImportedPluginSkills` / `addImportedPluginMcps` still receives `string[]` (from `result.imported`) — internal marker plumbing unchanged. Round-1 tests pass.

### Q4 不引入新 bug 吗 — Yes

`stopPropagation` on trash-icon buttons in TrashRecoveryModal prevents row-click double-toggle.

---

## R2-7 — `fetch_mcp_tools` stderr capture

### Q1 修对了吗 — Yes

`mcps.rs::fetch_mcp_tools` switches `stderr` from `Stdio::null()` to `Stdio::piped()` (line 330), takes `stderr_handle = child.stderr.take()` (line 385), drains it via `drain_mcp_stderr` helper on failure paths only (lines 511-518, 521-529). Bounded read: `.take(8192) + timeout(500ms)`.

### Q2 边界正确吗 — Yes

- Success path discards stderr (line 506) — avoids leaking debug noise.
- Bound 8 KB + 500 ms protects against flood / stuck child.
- `String::from_utf8_lossy` can't fail; non-empty trimmed text wrapped as `Some(text)`.
- `child.kill().await` (line 502) precedes stderr drain — child stops writing first, then drain reads buffered bytes + EOF.
- `kill_on_drop(true)` already set as defensive backstop.
- `combine_error_with_stderr` formatting `"\n\n--- MCP server stderr ---\n"` provides clear delimiter.

Early-return branches at lines 357-377 (`stdin.take()` / `stdout.take()` failures) do NOT drain stderr — but those branches indicate Tauri/tokio infrastructure failures, not server errors, so no meaningful stderr would exist. Acceptable.

Information leakage: stderr can contain `/Users/<name>/...` (R3 F9 backlog item). G3_log.md documents this is accepted per charter; documented as backlog. Non-Blocking.

### Q3 不破现有功能吗 — Yes

`FetchMcpToolsResult` shape unchanged; only the `error` field's content is richer. Frontend renders `result.error` verbatim. Round-1 timeout behavior preserved.

### Q4 不引入新 bug 吗 — Yes

No new resource leak; stderr handle is part of child's existence; `kill_on_drop` covers panic paths.

---

## R2-8 — Terminal pre-flight + path hardcoding fixes

### Q1 修对了吗 — Yes

Three independent fixes all land:

- **8a** `validate_terminal_app` (import.rs:208-222): pattern-match on terminal name, returns Ok(true/false) for known names, Err for unknown.
- **8b** `installed_ghostty_version` (import.rs:1423-1474): probes `/Applications/Ghostty.app`, then `~/Applications/Ghostty.app`, then `which ghostty` + `--version`.
- **8c** `install_quick_action` (import.rs:944-957, 1075, 1228-1233): uses `std::env::current_exe()` + sentinel substitution with XML-escape.
- **8d** `launch_claude_for_folder` (import.rs:1605-1622): pre-flight check returns `Err("TerminalNotInstalled:<name>")`.
- **8e** Frontend: `SettingsPage.tsx:294-313` calls validate on `useEffect` change; renders green/red dot + warning. `LauncherModal.tsx:115-126` and `MainLayout.tsx:221-232` detect `TerminalNotInstalled:` prefix and show friendly message.

### Q2 边界正确吗 — Yes

- `xml_escape_for_plist` escapes `&` first (line 935-936) — correct order to avoid double-escape.
- Sentinel `__ENSEMBLE_BINARY_PATH__` is unique (no XML metacharacters, no plist keyword collision).
- `current_exe()` failure surfaces as `Failed to resolve Ensemble binary path: ...` — caught upstream.
- `Terminal` pre-flight covers 3 candidate paths (System/Applications/Utilities, /Applications/Utilities, /Applications). 
- `Ghostty` `--version` parse extracts first dotted-digit token via `split_whitespace` — `"Ghostty 1.3.2"` → `"1.3.2"`. Robust to format changes.
- `Alacritty` checks PATH binary OR `.app` bundle.
- `launch_claude_for_folder` Round-1 iTerm + Terminal.app shell-injection fixes (line 1626 / 1782 area per G3_plan.md) preserved — pre-flight inserted ABOVE the dispatch match block.

LauncherModal regex `raw.substring('TerminalNotInstalled:'.length).trim()` → safe; MainLayout's `errorStr.match(/TerminalNotInstalled:([^\s"]+)/)` → safe (captures non-whitespace).

### Q3 不破现有功能吗 — Yes

`fetch_mcp_tools` IPC unchanged. New IPC `validate_terminal_app` is purely additive. Round-1 shell-injection fixes preserved per direct code inspection.

### Q4 不引入新 bug 吗 — Yes

`current_exe()` returns `~/Applications/Ensemble.app/Contents/MacOS/Ensemble` on `~/Applications/` install — correct binary path for Automator `for f in "$@"; do "BINARY" --launch "$f"; done`.

---

## R2-9 — Trash empty + per-row permanent delete

### Q1 修对了吗 — Yes

`trash.rs::delete_trashed_item_permanently` (line 970-1052) dispatches on `kind` → 4 file/dir kinds use disk path, 2 record kinds (scene/project) use record id in `data.json::trashed_*`. `empty_trash` (line 1071-1116) clears `trashed_scenes` + `trashed_projects` under DATA_MUTEX, then walks 4 subdirs and removes everything. Aggregated errors returned as `Vec<String>`.

Frontend `TrashRecoveryModal.tsx` adds Empty Trash header button (gated on `totalCount > 0`), per-row Trash2 button (hover-revealed via `opacity-0 group-hover:opacity-100`), and confirm overlay (absolute-positioned, NOT a portal — design-language Rule "≤3 layers").

### Q2 边界正确吗 — Mostly Yes, 1 NON-BLOCKING

- **Path safety check** (line 1003, 1019): `path.to_string_lossy().contains("/trash/")` is a defensive substring check. Mitigates accidental external path delete. NOT a full path-canonicalization — `expand_path` doesn't resolve `..` segments, so a malicious frontend could theoretically pass `~/.ensemble/trash/../../foo` which would pass the check but resolve to outside trash. Frontend is trusted (Tauri context, not network-facing), so this is acceptable defense-in-depth. Non-Blocking.
- **Idempotent**: `if !path.exists() { return Ok(()) }` — rapid double-click in UI doesn't error.
- **DATA_MUTEX scoping** in `empty_trash`: lock held only for data.json mutation (Phase 1); released BEFORE filesystem walk (Phase 2). Documented choice — prevents long-held lock blocking other writes during a possibly-slow disk walk. ✓
- **`empty_trash` failure to write data.json**: error pushed to aggregated `errors` Vec, walk continues. User sees "Emptied with N errors" — gracefully degraded. ✓
- **Per-item walk errors**: `fs::remove_dir_all` / `fs::remove_file` failures pushed to errors, loop continues. ✓
- **Confirm UI**: backdrop click (line 322) and ESC (line 401) both close confirm only; modal selection retained. ✓
- **Empty-trash dialog uses `totalCount`** at the moment the dialog opens. If the user opens dialog → restoreItem completes asynchronously elsewhere → counter changes → dialog still shows stale count. Cosmetic only; the actual empty walks current disk state. Non-Blocking.
- **Empty error path**: `result.errors[0] || 'Failed to empty trash'` in `handleConfirmDelete` works correctly when errors list is non-empty.

`ensembleDir` derivation: `skillSourceDir.replace('/skills', '')` (`trashStore.ts:278`) is fragile if user changed `skillSourceDir` to a custom path. BUT this same brittle pattern is used by 3 other pre-existing actions (`loadTrashedItems`, `restoreSkill`, `restoreMcp`) — it's a pre-existing footgun NOT introduced by R2-9. Non-Blocking (scope-appropriate to reuse existing convention).

### Q3 不破现有功能吗 — Yes

- 6 `renderRow` callsites updated to pass new `pathOrId` parameter — verified via grep + tsc green.
- Existing restore paths untouched.
- Round-1 trash code (`restore_*`) untouched.

### Q4 不引入新 bug 吗 — Yes

- `stopPropagation` on trash-icon click prevents row-checkbox toggle on icon press.
- ESC stack precedence (confirm first, then modal) prevents accidental modal close during confirm.

---

## R2-10 — Plugin orphan marker cleanup

### Q1 修对了吗 — Yes

`plugins.rs::cleanup_orphan_plugin_imports` (line 962-1052):
1. Acquires DATA_MUTEX.
2. Reads installed plugins via shared helper `read_installed_plugin_ids()`.
3. Retains markers whose `plugin_id` prefix (before `|`) is in the installed set.
4. Writes if any markers removed.

Frontend `pluginsStore.detectPluginSkillsForImport` / `detectPluginMcpsForImport` calls the IPC at the start of detect (non-fatal `try/catch`, console.warn on failure).

### Q2 边界正确吗 — Yes

- **Conservative "empty installed set" handling** (line 990-998): when `read_installed_plugin_ids` returns empty (file missing / parse failure / genuinely zero plugins), CLEANUP IS SKIPPED. Documented trade-off: better to keep markers than to silently nuke them on an unrelated I/O hiccup. The user-genuinely-zero-plugins case won't get cleaned up here, but if user later installs anything → empty set becomes non-empty → markers correctly classified.
- **Malformed entry retention** (lines 1015-1018, 1024-1028): `split_once('|')` returns `None` → retain. Schema-evolution defensive.
- **No-op write skip** (line 1044): `if removed_skills + removed_mcps > 0 { write_app_data(app_data)? }` avoids unnecessary disk write when no orphans found.
- **DATA_MUTEX held** for entire read-mutate-write sequence. ✓

### Q3 不破现有功能吗 — Yes

- Existing `detect_installed_plugins` reuses same `read_installed_plugin_ids` helper — no logic divergence, no duplicate implementation. ✓ (Per `grep-before-enumerate-shared-resource.md` discipline.)
- Marker schema unchanged.
- Non-fatal IPC call from frontend — if cleanup fails, detect still proceeds.

### Q4 不引入新 bug 吗 — Yes

No new race: cleanup is silent self-heal, runs once per detect-open (not periodic background sweep).

---

## 总结

### BLOCKING (必须修才能合并)

#### B1: R2-1 fresh-install regression — wipes default categories

**File**: `src-tauri/src/commands/data.rs:1150-1151` (and lib.rs:50 ordering).

**Root cause**: `migrate_unicode_normalization` unconditionally writes `data.json` even when no `data.json` previously existed. Combined with `init_app_data` "skip defaults if data.json exists" gate, fresh installs (and any "delete data.json to start over" recovery) lose Development / Writing / Analysis default categories.

**Detection**: Tests use `seed()` which always pre-creates data.json → bug invisible to test suite.

**Recommended fix** (out of audit scope but adjacent):
```rust
// In migrate_unicode_normalization, after read_app_data:
let data_path_exists = get_data_file_path().exists();
// ... migration logic ...
// Only persist if there was prior state to migrate OR if we did work:
let did_work = report.renormalized_skills > 0 || report.renormalized_mcps > 0
            || report.merged_skill_collisions > 0 || report.merged_mcp_collisions > 0;
if data_path_exists || did_work {
    data.has_completed_unicode_normalization = true;
    write_app_data(data)?;
}
```
OR move the flag-init / write-coverage to `init_app_data` directly.

User impact: noticeable but not catastrophic — user opens app to empty Categories list, recoverable by manually creating 3 categories. But this is a regression from v2.1.2 behavior and violates the "不影响现有功能" charter requirement.

### NON-BLOCKING 但应跟进

- **R2-1 NF1**: Marketplace `target_path` / trash `target_path` write sites (4 callsites) bypass normalization; migration flag is one-shot so post-migration NFD escapes are not re-collapsed. Narrow case (catalog names are NFC-canonical). Track as backlog if any user reports the symptom.
- **R2-1 NF2**: Scene `skill_ids` / `mcp_ids` Vec elements are not migrated. Pre-migration NFD-keyed scene references silently lose binding under existing orphan-id semantics.
- **R2-2 NF3**: Order-of-operations in `init_app_data` runs `write_app_data(default_data)` (line 462) BEFORE the health-check probe (line 486). A fresh install on already-root-owned dir gets a generic permission error, not the structured `EnsembleDirUnwritable:` message. Most users will hit R2-2's actual user-reported scenario (existing data.json + later chown to root), which works correctly.
- **R2-7 NF4**: stderr text can contain `/Users/<name>/...` — known R3 F9 backlog item; G3 confirmed accepted.
- **R2-9 NF5**: `expand_path` doesn't normalize `..` segments → `/trash/` substring check is mild defense only. Frontend trusted; load-bearing safety is fine. Backlog if security model ever changes.
- **R2-9 NF6**: `skillSourceDir.replace('/skills', '')` to derive ensembleDir is pre-existing footgun shared by 4 actions. If user customizes `skillSourceDir`, all 4 break together. Should be cleaned up project-wide in a future round.

### 整体判断: **CONDITIONAL GO**

9 of 10 findings: code is correct, well-bounded, and ships without regression risk to existing features.

1 finding (R2-1): introduces a P0 regression on fresh install that wipes the bootstrap default categories. This violates the user's "不影响现有功能" hard requirement and is not catchable by the current test suite (test seed pattern hides the bug).

Recommend: fix the fresh-install regression (small change, see B1 fix sketch), re-run gates, then commit Round 2 as a whole. The 6 Non-Blocking items go to backlog.
