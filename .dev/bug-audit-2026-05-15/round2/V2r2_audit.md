# V2r2 — Round 2 Completeness + Regression Audit Report

**Audit scope**: Round 2 fixes (R2-1 ~ R2-10) committed as unstaged changes on top of release `3408954`.
**Audit angle**: Completeness (coverage of related callsites + sibling bugs) and Regression Risk (cross-fix interaction, Round 1 + release + Round 2 stacking).
**Final judgement**: **CONDITIONAL** — one BLOCKING regression must be fixed before commit; rest are non-blocking flags.

---

## A. Completeness Audit (per finding × 3 sub-questions)

### R2-1 NFC/NFD migration (G1)

**Same-class bug elsewhere?** — PARTIAL coverage.

- ✅ `parse_skill_file:219` + `parse_mcp_file:179` normalize at scan time (id + source_path share one `normalize_nfc` call → invariant preserved).
- ⚠️ `trash.rs:453` (`new_skill_id = target_path.to_string_lossy()`) and `trash.rs:546` (`new_mcp_id = ...`) write to `skill_metadata` / `mcp_metadata` WITHOUT normalize. If the user's restored skill on disk is NFD, the metadata key gets NFD bytes. Next `scan_skills` returns NFC id → mismatch → restored skill loses metadata silently. G1 plan documents this and relies on "next launch's migration" — BUT the migration flag is set after first run; subsequent launches skip the migration. **An NFD key inserted by `restore_*` after the first boot is orphaned forever.**
- ⚠️ `marketplace.rs:3045, 3381, 3632, 3644` write skill_id / mcp_id keys from `target_dir.to_string_lossy()`. Same exposure. G1 plan reasoned upstream is NFC by convention — true for most catalogs but not a guarantee.
- ⚠️ **Scene `skillIds` / `mcpIds` in data.json are NOT migrated.** R2-1 migration only re-keys `skill_metadata` / `mcp_metadata` HashMap entries — it does NOT walk `scenes[].skill_ids` / `scenes[].mcp_ids` arrays. Users with an i18n-named skill already added to a scene pre-upgrade will see the scene silently drop that skill on sync (because `allSkills.find(s => s.id === skillId)` is byte-compare with frontend's now-NFC id vs scene's stored-then NFD id).
- IPC entry points (`update_skill_metadata`, `delete_skill`, `update_mcp_metadata`, `delete_mcp`) correctly trust the frontend-supplied NFC id from scan (G1 plan §grep coverage).

**Callsite coverage?** — ❌ See "BLOCKING" below: setup-time migration call ordering breaks fresh installs.

**Dependency complete?** — ✅ `unicode-normalization = "0.1"` already committed in release `3408954` Cargo.toml. Cargo.lock already has both direct + transitive entries.

---

### R2-2 EnsembleDir health check + frontend remediation pane (G1)

**Same-class bug elsewhere?** — Single chokepoint at `init_app_data:486-505`. Other write_app_data callsites (~30 across all modules) will inherit the failed-write surface via their own error propagation, BUT they won't carry the `EnsembleDirUnwritable:` prefix → those errors won't trigger the dedicated frontend modal. Acceptable: `init_app_data` runs first; any subsequent operation would only run if init passed.

**Callsite coverage?** — ✅ Frontend `MainLayout.tsx:288-293` reads `useAppStore.getState().error` post-`initApp` and matches prefix. Renders dedicated alertdialog with chown command.

**Dependency complete?** — ✅ No new deps.

**Edge case (NON-BLOCKING)**: For fresh installs in an unwritable dir (rare — user manually pre-created `~/.ensemble/` with wrong owner), `write_app_data(default_data)` at `init_app_data:462` errors BEFORE the health probe at line 487. User gets a non-prefixed error → no diagnostic pane. Existing-install + flipped-owner is the dominant case and that path works.

---

### R2-3 syncProject step-level feedback (G4)

**Same-class bug elsewhere?** — ✅ Only `syncProject` orchestrates the 4-step chain. `clearProjectConfig` uses a single IPC. No sibling location.

**Callsite coverage?** — ✅ Only `ProjectsPage` consumes `syncProject`. Banner subscribes via `useProjectsStore`. `handleSceneChange` catches errors but doesn't read step results — error toast surfaces step info via thrown Error message.

**Dependency complete?** — ✅ No backend signature changes. Pure-frontend.

**Round-1 interaction**: Round-1 didn't modify `syncProject` body — Round-2 R2-3 is the first step-level reporting layer added on top. No conflict.

---

### R2-4 HTTP MCP URL validation (G3)

**Same-class bug elsewhere?** — ✅ Both `install_marketplace_mcp` (line 3311) and `update_mcp_http_config` (line 2513) covered.

- ❌ `import.rs:706, 744` (`import_existing_config`) constructs `McpConfigFile` from URLs read out of user's existing `~/.claude.json` — no validation. **Out of scope** per G3 plan (importing existing user config preserves what user already had). Acceptable.
- ❌ `plugins.rs:870` constructs `McpConfigFile` from plugin metadata — no validation. **Out of scope** per G3 plan (plugin author's responsibility). Acceptable.

**Callsite coverage?** — ✅ McpDetailPanel propagates errors via existing toast pattern. Marketplace install panel surfaces `InstallOutcome::Failed`.

**Dependency complete?** — ✅ No deps.

---

### R2-5 IME composition guard (G4)

**Same-class bug elsewhere?** — ✅ Comprehensive grep: 19 total `e.key === 'Enter'` sites in src/. 11 text-input commits → all guarded with `isEnterCommit`. 8 button-role activators (`Toggle`, `Checkbox`, `SortableCategoryRow` × 2, `SortableTagPill`, `MarketplaceListItem`, `McpItem` × 2) deliberately excluded (no editable text → no IME hazard). G4 reasoning sound; verified by re-grep.

**Callsite coverage?** — ✅ Each replacement site imports `@/utils/keyboard` and replaces only the Enter condition; non-Enter branches unchanged.

**Dependency complete?** — ✅ New file `src/utils/keyboard.ts` (12 LoC) + test file. Both committed in unstaged set.

**Note**: `MainLayout` ESC handler (`document.removeEventListener('keydown', ...)`) and ProjectsPage banner have no Enter commits — correctly out of scope.

---

### R2-6 Plugin import error surfacing (G2)

**Same-class bug elsewhere?** — `eprintln!` errors are common across many modules but only `import_plugin_skills` / `import_plugin_mcps` swallow errors AND return success. Other locations (marketplace install, etc.) return `Result<…, String>` so errors propagate naturally. G2 plan correctly scoped only these two.

**Callsite coverage?** — ✅ Two callsites updated:
- `ImportSkillsModal.tsx:194` reads `result.errors`, renders banner, keeps modal open.
- `ImportMcpModal.tsx:197` mirror pattern.

**Dependency complete?** — ✅ Backend `PluginImportResult` shape mirrored as TS interface. tsc passes.

**Latent issue (NOT introduced by R2-6, but worth flagging)**: `pluginsStore.importPluginSkills` catch path returns `emptyResult` (empty `imported` + empty `errors`). If `safeInvoke` throws (catastrophic failure), modal sees `errors.length === 0` → closes silently. The `pluginsStore.error` is set but no subscriber reads it. This is **pre-existing**, not a R2-6 regression. R2-6 fixes the partial-failure case which is far more common.

---

### R2-7 fetch_mcp_tools stderr capture (G3)

**Same-class bug elsewhere?** — ✅ G3 grep of `Stdio::null` shows only this callsite for MCP-child spawns. `marketplace.rs::install_marketplace_skill`'s `tar` command uses `output()` (captures both). No other locations.

**Callsite coverage?** — ✅ All three failure branches (`Ok(Err)`, `Err` timeout, spawn failure) handled. Spawn failure path discards stderr (no child → nothing to drain) but error message already names the binary. Reasonable.

**Dependency complete?** — ✅ `tokio::io::AsyncReadExt` and `tokio::process::ChildStderr` already in `tokio` dep tree.

**No interaction with R4 D6** (env inheritance): D6 was about how PATH inheritance interacts with MCP launch; R2-7 just surfaces whatever stderr says. If the MCP fails because of D6, stderr will now say so. Complementary, not conflicting.

---

### R2-8 Terminal pre-flight + Ghostty fallback + Quick Action self-resolve (G3)

**Same-class bug elsewhere?**
- ✅ `rg "/Applications/Ensemble\.app" src-tauri/src/` → only `import.rs:1050` (the COMMAND_STRING). Covered (8c).
- ✅ `rg "/Applications/Ghostty\.app"` → only `installed_ghostty_version`. Covered (8b).
- ✅ Per-terminal probe order in `validate_terminal_app` matches launch order in `launch_claude_for_folder`.

**Callsite coverage?** — ✅ SettingsPage status dot. LauncherModal + MainLayout catch `TerminalNotInstalled:` prefix. Pre-flight at top of `launch_claude_for_folder` runs before Round 1's iTerm/Terminal injection-safe path → those branches remain byte-identical.

**Dependency complete?** — ✅ No new deps. `dirs` already in Cargo.toml, `which`/`Command` already used.

**Edge case**: `which` binary may not be on PATH in some sandboxed contexts, but `Command::new("which").output()` returns `Err` → `unwrap_or(false)` → "not on PATH" answer. Conservative.

---

### R2-9 Trash retention (G2)

**Same-class bug elsewhere?**
- ✅ `empty_trash` clears `data.trashed_scenes` + `data.trashed_projects` AND walks disk trash dirs (skills, mcps, claude-md, rules).
- ❌ `data.imported_marketplace_skills` accumulates forever (mentioned in R5 F4 P3). NOT cleared by `empty_trash`. **Out of scope** per types.rs:294 "V1 records only; not yet read by any UI surface". Correct decision.
- ❌ `data.imported_plugin_skills` / `imported_plugin_mcps` markers — R2-10 has its own cleanup path (silent self-heal on detect). Not part of empty_trash flow. Correct.

**Callsite coverage?** — ✅ Two new IPCs registered in lib.rs. TrashRecoveryModal has Empty Trash button + per-row trash icon + confirm overlay (single portal — respects design-language ≤3 layers).

**Dependency complete?** — ✅ `Trash2` icon already in lucide-react. No new deps.

**Concurrency**: Both new IPCs hold `DATA_MUTEX` for data.json mutations. `empty_trash` releases the lock before disk walks → other DATA_MUTEX users not blocked during long disk operations. Sound.

**Partial-failure semantics**: `empty_trash` aggregates per-item errors. UI shows summary. data.json scenes/projects clear may fail before disk walk runs — disk walk still proceeds (best-effort). User-observable: trash may be partially emptied if data.json write fails. Acceptable, matches R5 F4 spec.

---

### R2-10 Plugin orphan marker cleanup (G2)

**Same-class bug elsewhere?**
- ✅ `imported_plugin_skills` + `imported_plugin_mcps` both filtered.
- ❌ `imported_marketplace_skills` (P3 per R5 F12 sibling) has same retention pattern but is unused by UI. R5 F12 mentioned as P3, intentionally deferred. Correct.

**Callsite coverage?** — ✅ Called from both `detectPluginSkillsForImport` AND `detectPluginMcpsForImport`. Both detect entry points self-heal before reading markers.

**Dependency complete?** — ✅ Uses existing `installed_plugins.json` parser via new `read_installed_plugin_ids` helper.

**Safety**: Conservative — empty installed set means SKIP (not "delete everything"). Malformed marker entries (no `|` delimiter) are RETAINED. Won't punish user for an `installed_plugins.json` parse hiccup.

**R5 F4 warning**: "自动清理必须用户可见可关 — 不引入静默后台 GC". R2-10 is silent self-heal, NOT user-visible. Technically violates F4's principle. **Mitigating**: it removes orphaned references to non-existent plugins (the data being cleared is already stale — pointing at uninstalled plugins). This is housekeeping, not data deletion. Documented as "silent self-heal" in plan. Acceptable design judgement — but worth noting that a user who reinstalls a plugin after a hiccup with `installed_plugins.json` might see their import markers gone (because cleanup ran on the bad read). The "empty set ⇒ skip" guard prevents this.

---

## B. Regression Risk Audit

### B1. Round 1 fixes intact?

- ✅ Round 1 `write_app_data` atomic-write (F1) — Round 2's new IPCs all call `write_app_data` via the public function. Atomicity preserved.
- ✅ Round 1 `restore_skill` / `restore_mcp` metadata snapshot recovery (A3) — Round 2 R2-9 `delete_trashed_item_permanently` for Skill/MCP only removes the trash dir; does NOT touch `data.skill_metadata`. A user who permanently deletes a trashed skill does NOT lose unrelated live skill metadata. Sound.
- ✅ Round 1 `restore_scene` / `restore_project` reference-validity filtering (A5) — Round 2 R2-9 Scene/Project permanent delete bypasses restore — just retains the array sans the matching id. No interaction.
- ✅ Round 1 iTerm / Terminal.app shell-injection fix — Round 2 R2-8 inserts `validate_terminal_app` BEFORE the `match terminal_app.as_str()` block. Round 1's `folder_launch_command` + `applescript_quote` still inside each branch. Byte-identical to Round 1.
- ✅ Round 1 `init_app_data` atomic — Round 2 R2-2 appended health-check probe AFTER the seeding block. Round 1 atomicity untouched.
- ✅ Round 1 plugin / marketplace sanitize_resource_name (B4) — Round 2 R2-1 normalize_nfc runs AFTER name sanitization, on different bytes (sourcePath, not catalog name). No collision.

### B2. Release commit side-effects?

- ✅ Release commit `3408954` includes only Cargo.toml (unicode-normalization dep) and Cargo.lock (transitive resolution). All Round 2 source changes are in unstaged state. When Round 2 source is committed, Cargo.toml is already done. No Cargo.lock churn needed.
- ✅ DMG already shipped to GitHub Release contains compiled Round 2 source. Post-commit git tree will match shipped binary contents.
- ✅ No "release ship before commit" risk beyond the user's already-accepted state.

### B3. Cross-fix interaction

- **R2-1 NFC + R2-10 plugin marker cleanup**: Plugin IDs in `installed_plugins.json` and in `imported_plugin_*` markers are conventionally ASCII (`name@marketplace`). R2-10 byte-compares. If user had Unicode plugin name with NFC/NFD divergence, cleanup might falsely treat marker as orphan. **Real-world exposure ≈ zero** — plugin marketplaces don't ship Unicode IDs. Out of practical scope.
- **R2-2 health check + R2-1 migration**: Migration runs at backend `setup`. Health check runs at frontend-triggered `init_app_data`. If migration fails (DATA_MUTEX poisoned / write_app_data fails), error is logged at setup but is non-fatal. Then health check at init_app_data runs and would detect a permissions issue. Sequencing OK but see B5 / BLOCKING below.
- **R2-3 syncProject failure + R2-7 stderr**: They operate on different surfaces (sync chain vs MCP-tool fetch). No interaction.
- **R2-4 URL validation + R2-7 stderr**: URL validation at install/update intercepts BEFORE write; fetch_mcp_tools is invoked on existing config. Sequential, non-overlapping.
- **R2-6 PluginImportResult shape + R2-1 NFC**: Plugin item names with Unicode could be NFD in `imported_plugin_skills` markers if R2-10 wrote NFD. But the marker shape is `<plugin_id>|<item_name>` where item_name comes from upstream `plugin.json` (NFC by convention). No real exposure.
- **R2-8 pre-flight + R2-7 stderr**: Pre-flight rejects in `launch_claude_for_folder` BEFORE spawning. Stderr capture is in `fetch_mcp_tools` (separate function). No interaction.
- **R2-9 empty_trash + R2-10 plugin marker**: empty_trash clears trash dirs and trashed_scenes/projects ONLY. Does NOT touch plugin markers. R2-10 cleanup runs on plugin import detect. No interaction.

### B4. Data integrity

- **R2-1 migration interruption recovery**: Migration sets `data.has_completed_unicode_normalization = true` in-memory BEFORE `write_app_data(data)`. If write fails, mutation is discarded; flag stays `false`; next launch retries. Atomic via Round 1 F4a. Sound.
- **R2-2 health check probe leftover**: Probe is `env!("CARGO_PKG_VERSION")` (5 bytes); deleted immediately on success. A leftover probe file (if remove_file fails) is harmless — next launch's probe rewrites the same path. Safe.
- **R2-9 empty_trash partial failure**: Aggregated errors. trashed_scenes/projects may clear while disk walk fails for some items, OR vice versa. UI shows partial summary; user can re-run. data.json never half-written (atomic).
- **R2-10 cleanup partial failure**: Single write under DATA_MUTEX. Atomic.

### B5. New IPC registration completeness

- ✅ All 5 new IPCs registered in `lib.rs::generate_handler!`:
  - `data::migrate_unicode_normalization` (line 147)
  - `import::validate_terminal_app` (line 187)
  - `plugins::cleanup_orphan_plugin_imports` (line 201)
  - `trash::delete_trashed_item_permanently` (line 236)
  - `trash::empty_trash` (line 237)
- ✅ All have corresponding frontend wiring in stores or component logic.
- ✅ `data::migrate_unicode_normalization` is invoked both at backend `setup` (line 50) AND registered as IPC for tests. Sound.

---

## C. Test Coverage Audit

| Fix | Test coverage |
|---|---|
| R2-1 NFC | ✅ G1 added 6 backend tests in `unicode_normalization_migration_tests` (idempotence, NFC re-keying skills + MCPs, collision, ASCII passthrough, flag advancement). Also 3 unit tests for `normalize_nfc` helper. |
| R2-2 Health check | ❌ No direct test for the probe-fail path. Cargo test environments use `ScopedDataDir` (writable temp dir). Not blocking — manually verified per G1 log. |
| R2-3 syncProject | ❌ No test added for step-level reporting. The store function is now substantially more complex. Non-blocking but a coverage gap. |
| R2-4 URL validation | ❌ No backend test for `validate_http_mcp_url`. Helper is small and pure. Manual verification per G3 log. Non-blocking but adds future regression risk. |
| R2-5 IME guard | ✅ G4 added 6 vitest tests in `keyboard.test.ts` (React event, native event, isComposing, keyCode 229, non-Enter, undefined isComposing). |
| R2-6 PluginImportResult | ❌ No test for partial-failure flow. Backend integration would need full plugin fixtures. Non-blocking. |
| R2-7 stderr capture | ❌ No test for `drain_mcp_stderr` (truncation, timeout). Helper is small and pure. Non-blocking. |
| R2-8 validate_terminal_app | ❌ No test for `validate_terminal_app`, `app_bundle_exists`, `binary_on_path`. All filesystem-dependent. Non-blocking. |
| R2-9 trash | ✅ G2 added 2 tests for `parse_trash_kind` (positive + typo rejection). No test for `empty_trash` end-to-end (filesystem-heavy). Acceptable. |
| R2-10 plugin orphan | ❌ No test for `cleanup_orphan_plugin_imports`. Helper logic is `retain()` calls — low complexity. Non-blocking. |

Overall: G1 + G4 added meaningful tests. G2 partial. G3 added no tests. Test-coverage debt accrued but proportionate to fix complexity.

---

## 总结

### BLOCKING (必须修)

**1. Fresh-install regression: setup-time migration creates empty data.json, blocking default Categories seed.**

**Where**:
- `src-tauri/src/lib.rs:50` — `setup` invokes `migrate_unicode_normalization()` at backend startup, BEFORE frontend calls `init_app_data` IPC.
- `src-tauri/src/commands/data.rs:1064` — `migrate_unicode_normalization` calls `read_app_data()`. When `data.json` does not exist, this returns `Ok(AppData::default())` (line 268).
- `src-tauri/src/commands/data.rs:1066` — flag check passes (default bool is `false`).
- `src-tauri/src/commands/data.rs:1150-1151` — migration always sets flag=true and calls `write_app_data(data)?` UNCONDITIONALLY (no `if did_work` guard), creating a `data.json` with empty `categories: []`.
- `src-tauri/src/commands/data.rs:416` — frontend's later `init_app_data` IPC sees `data_path.exists() == true` → SKIPS the default-categories block (lines 417-440 with "Development", "Writing", "Analysis").

**User-visible effect**: First-launch user on a clean machine ends up with no default categories. The fresh-install onboarding screen shows an empty sidebar.

**Why other migrations don't have this**: `migrate_claude_md_storage` is guarded (`if migrated { write_app_data(...) }` at claude_md.rs:971), so it does NOT write when there's nothing to migrate. The same guard is missing from `migrate_unicode_normalization`.

**Fix options** (smallest first):
- Option A: Guard the write — only call `write_app_data` if `report.renormalized_skills + renormalized_mcps + merged_*_collisions > 0`. But then flag never advances on a no-op run → migration re-runs every launch. Acceptable cost (the no-op path is O(1)).
- Option B: Guard the migration by data.json existence — if `!get_data_file_path().exists() { return Ok(default_report) }`. Then init_app_data later writes data.json with both default categories AND `has_completed_unicode_normalization: true` (already set at line 458). Cleanest.
- Option C: Move `data::migrate_unicode_normalization()` invocation from `setup` to an IPC called by `appStore.initApp` AFTER `init_app_data` succeeds — same shape as `migrate_category_id_for_skills_mcps` (appStore.ts:866-877). Most idiomatic for this project.

**Recommendation**: Option C aligns with the existing migration pattern in this codebase. Option B is the minimal-risk patch.

**Test coverage gap**: Migration tests `seed(...)` always pre-write data.json. The "no pre-existing data.json" scenario is not tested. Adding a test would prevent recurrence.

### NON-BLOCKING flags

**1. R2-1 trash/marketplace metadata write sites not normalized (real but rare data loss risk).**
- `trash.rs:453, 546` and `marketplace.rs:3045, 3381, 3632, 3644` insert metadata keys derived from `target_path.to_string_lossy()` without `normalize_nfc`. After the first-boot migration sets the flag, subsequent NFD insertions go un-migrated. Risk window: user with i18n-named skill restores from trash OR a marketplace catalog ships NFD-named entry. Practical exposure low. **Recommended follow-up**: thread `normalize_nfc` through these 6 write sites or remove the flag gate to allow migration to run repeatedly. Not blocking.

**2. R2-1 scene `skillIds` / `mcpIds` arrays not migrated.**
- Migration only re-keys `skill_metadata` / `mcp_metadata` HashMap keys. Existing `scene.skill_ids` / `scene.mcp_ids` arrays in `data.json` keep their pre-upgrade byte form. Users with i18n-named skills already inside a scene will see silent drop on sync (frontend's `allSkills.find(s => s.id === skillId)` is byte-compare). Could be addressed by extending migration to walk `data.scenes` and rewrite each `id` via `normalize_nfc`. Same data exposure as flag 1. Not blocking.

**3. R2-2 fresh-install + unwritable-dir corner case.**
- `init_app_data:462` writes default data.json BEFORE the health probe runs. On a fresh install in an already-unwritable dir, that write fails first → user gets a non-`EnsembleDirUnwritable:` error → no diagnostic pane. Existing-install case (the dominant trigger pattern) works correctly. Could be addressed by running the health probe BEFORE the default-seed write. Not blocking.

**4. R2-4 import-existing-config and plugin-MCP URLs not validated.**
- `import_existing_config` and `plugins.rs:870` construct McpConfigFile with URLs from external sources without `validate_http_mcp_url`. G3 plan explicitly out-of-scoped both (user/plugin author responsibility). Worth noting but acceptable.

**5. R2-10 cleanup violates R5 F4 "silent auto-cleanup" warning.**
- `cleanup_orphan_plugin_imports` runs silently on every Import Plugins modal open. R5 F4 explicitly warned: "自动清理必须用户可见可关". G2 documented this as "silent self-heal" because the data being removed already points at deleted plugins. Design judgement call. Mitigated by "empty installed set ⇒ skip" guard. Worth a heads-up to the user in the next release notes.

**6. Test coverage debt.**
- R2-2, R2-3, R2-4, R2-6, R2-7, R2-8, R2-9 (empty_trash), R2-10 have no direct unit tests. Most of the new code paths are exercised only by manual verification. Could be addressed in a follow-up "Round 3 test backfill" pass. Not blocking.

### 整体判断: **CONDITIONAL**

Fix the BLOCKING fresh-install regression (Option C recommended) before commit. The 6 NON-BLOCKING items can land as-is and be addressed in a future round.

Once BLOCKING is fixed, the Round 2 set is GO.
