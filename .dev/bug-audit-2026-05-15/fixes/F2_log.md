# F2 Implementation Log

Owner: Fix Agent F2 (Opus). Scope per `F2_plan.md`: A3 (UI restore metadata recovery), A4 (Rules tab in TrashRecoveryModal), A5 (Scene / Project trash exposure + restore IPCs). No scope creep.

## Files changed

| File | Lines (net) | Concern |
|---|---|---|
| `src-tauri/src/commands/marketplace.rs` | +9 / -2 | A3 — change `consume_skill_metadata_snapshot` and `consume_mcp_metadata_snapshot` from module-private `fn` to `pub(crate) fn` so `trash.rs` can re-use them. Doc comments added explaining the cross-module use. **No body change.** |
| `src-tauri/src/types.rs` | +9 / -0 | A5 — extend `TrashedItems` with `scenes: Vec<TrashedScene>` and `projects: Vec<TrashedProject>` (both `#[serde(default)]` for backward compat). |
| `src-tauri/src/commands/trash.rs` | +252 / -29 | A3 — add `sanitize_skill_metadata_against_data` + `sanitize_mcp_metadata_against_data` helpers, modify `restore_skill` + `restore_mcp` to consume snapshots and persist validated metadata. A5 — modify `list_trashed_items` to also return `trashed_scenes` / `trashed_projects`; add `restore_scene` + `restore_project` IPCs. |
| `src-tauri/src/lib.rs` | +2 / 0 | A5 — register `trash::restore_scene` + `trash::restore_project` IPCs. |
| `src/types/trash.ts` | +29 / -1 | A5 — mirror Rust `TrashedScene` / `TrashedProject`; extend `TrashedItems` with `scenes` + `projects`. |
| `src/stores/trashStore.ts` | +75 / -2 | A4 — add `restoreRule` action. A5 — add `restoreScene` + `restoreProject` actions. Doc comment block summarising the 4 vs 2 keying convention (path vs id). |
| `src/components/modals/TrashRecoveryModal.tsx` | full rewrite (+329 / -296 net) | A4 — Rules tab. A5 — Scenes / Projects tabs. Refactored 3 duplicated tab blocks into a shared `renderTabBody` + `renderRow` + `renderFooter` + `renderEmpty` structure so adding 3 tabs didn't 2× the file length. |

Total: ~705 lines added, ~330 lines removed across 7 files (heavily skewed by the modal refactor — same content, more compact arrangement).

## Diff-by-finding

### A3 — restore_skill / restore_mcp metadata recovery

**Backend (`marketplace.rs:526` / `:552`)**: visibility change only.

```diff
-fn consume_skill_metadata_snapshot(live_dir: &std::path::Path) -> Option<SkillMetadata> {
+pub(crate) fn consume_skill_metadata_snapshot(live_dir: &std::path::Path) -> Option<SkillMetadata> {
```

(Plus a docstring extension explaining why the visibility was upgraded. No code-flow change.)

**Backend (`trash.rs::restore_skill`)**: after the existing `fs::rename` body, append the metadata recovery block:

```rust
let recovered =
    crate::commands::marketplace::consume_skill_metadata_snapshot(&target_path);
if let Some(snap) = recovered {
    let _guard = DATA_MUTEX.lock().map_err(|e| e.to_string())?;
    let mut app_data = read_app_data()?;
    let validated = sanitize_skill_metadata_against_data(snap, &app_data);
    let new_skill_id = target_path.to_string_lossy().to_string();
    app_data.skill_metadata.insert(new_skill_id, validated);
    write_app_data(app_data)?;
}
```

`consume_*` internally removes the snapshot file on read success AND on parse failure, so no orphan artefact is left in the restored skill directory (R2 F10 incidentally covered).

**Backend (`trash.rs::restore_mcp`)**: same shape, plus the sibling-snapshot relocation:

```rust
let trash_sibling = trash_path + ".metadata.json";   // (PathBuf via OsStr push)
if trash_sibling.exists() {
    let target_sibling = target_path + ".metadata.json";
    let _ = fs::rename(&trash_sibling, &target_sibling);  // best-effort
}
let recovered = consume_mcp_metadata_snapshot(&target_path);
if let Some(snap) = recovered { ... }
```

The MCP snapshot is a **sibling** file (not inside a dir) so `delete_mcp` moved it into trash next to the `.json` — restore must do the inverse. `fs::rename` of the primary file does not implicitly move siblings.

**Reference-validity helpers (new in trash.rs)**:

```rust
fn sanitize_skill_metadata_against_data(mut snap, data) -> SkillMetadata {
    if let Some(cat_id) = snap.category_id.as_deref() {
        if !data.categories.iter().any(|c| c.id == cat_id) {
            snap.category_id = None;
        }
    }
    let valid_tag_names = data.tags.iter().map(|t| t.name).collect::<HashSet>();
    snap.tags.retain(|t| valid_tag_names.contains(t.as_str()));
    snap
}
```

This addresses R5 F5 (snapshot may outlive its referenced category / tags during long trash dwell). I verified that `SkillMetadata::tags` is `Vec<String>` of NAMES (types.rs:298), not ids, so the filter is name-based. The matching `McpMetadata` helper is structurally identical.

**Impact analysis (A3)**:
- `marketplace.rs` finalize paths still consume snapshots exactly as before — verified by reading lines 2964 + 3260 which are the only existing callers; visibility upgrade is purely additive.
- `restore_claude_md` / `restore_rule` were already taking `DATA_MUTEX` and writing back through `write_app_data` — the new `restore_skill` / `restore_mcp` lock acquisition mirrors this convention.
- `install_source` and `marketplace_source` survive via the snapshot (per types.rs:314-319 fields), so the R2 F7 data-loss vector ("marketplace skill rebrands as local after restore") is also closed.

### A4 — Rules tab

- `trashStore.ts`: add `restoreRule(path) → Promise<boolean>` action mirroring `restoreClaudeMd` shape (uses `restore_rule` IPC; no `ensembleDir` parameter because backend reads `get_app_data_dir()` internally — verified in trash.rs:556).
- `TrashRecoveryModal.tsx`: add 'rules' to `TabType` union; add `selectedRules` state Set; extend counts + handlers; render Rules tab with the same checkbox-row layout as other tabs. Rules' meta line shows `filename · deleted_at` instead of just deleted_at — this gives users disambiguation when two rules share a display name (filename is the Claude Code identity per CLAUDE.md project notes).

Backend verification: `list_trashed_items` already includes `trash::rules` (verified by reading trash.rs:260-323 in full); `restore_rule` IPC already registered (`lib.rs:183`). **No backend change needed for A4.**

### A5 — Scene / Project trash exposure

**`types.rs`**: extend `TrashedItems` with `#[serde(default)] scenes: Vec<TrashedScene>` and `#[serde(default)] projects: Vec<TrashedProject>`. `TrashedScene` and `TrashedProject` structs themselves (types.rs:169 / :198) already existed and were field-complete — no change there.

**`trash.rs::list_trashed_items`**: insert a one-shot DATA_MUTEX block at the end that reads `data.trashed_scenes` + `data.trashed_projects` into the return value. The lock is held only across the `.clone()` call — no `fs::*` work runs while locked. Output struct now carries all 6 trash collections.

**`trash.rs::restore_scene`** (new):
- Take DATA_MUTEX, read AppData.
- Find `trashed_scenes` position by id; ok_or "Trashed scene not found: {id}".
- Defensive: collision check against `data.scenes` (returns Err if id already live — defensive guard against hand-edited data.json; under normal `delete_scene` → `restore_scene` flow this is impossible).
- Filter `skill_ids` / `mcp_ids` / `claude_md_ids` / `rule_ids` against current AppData id-sets (R5 F5).
- Reconstitute `Scene` and push onto `data.scenes`.
- `write_app_data`.

**`trash.rs::restore_project`** (new):
- Same shape.
- `scene_id` reference validity: if the referenced Scene no longer exists, reset to empty string. ProjectsPage already renders that as "No scene selected" — graceful degradation per task instructions.

**`lib.rs`**: register both new IPCs alongside the existing 4 restore commands.

### A4 + A5 Frontend (TrashRecoveryModal.tsx refactor)

Previous version: 3 tabs each with its own duplicated tab-content block + footer. Adding 3 more tabs to that pattern would have 2x'd the file. Instead I extracted the list-rendering, footer, and empty-state into 3 helpers:

- `renderRow(key, isSelected, onToggle, name, meta)` — single list item, identical across all 6 tabs.
- `renderFooter()` — Cancel + Recover Selected button row, identical across all 6 tabs.
- `renderEmpty(Icon, label)` — empty-state placeholder, identical shape.
- `renderTabBody()` — dispatches on `activeTab` to build the right list of rows. Per-tab specifics live here (e.g. Rules show `filename · deletedAt`; Scenes show `N skills · M MCPs · deletedAt`; Projects show `path · deletedAt`).

Tab buttons themselves are now driven from a `tabs: { id, icon, label }[]` array — adding a 7th tab in the future is one append rather than 6 manual JSX touches.

Restore keying:
- Skills / MCPs / CLAUDE.md / Rules: `path` (string) — file lives on disk.
- Scenes / Projects: `id` (string) — record lives in `data.json`, no disk path.
- Selection Set type is `string` either way; only the source field differs. The 6 `handleToggle*` callbacks dispatch to the right Set.

## Impact analysis — what could regress

I considered all 4 trash restore paths and the 2 marketplace finalize paths individually:

| Path | Could regress? | Why not |
|---|---|---|
| Marketplace finalize_skill_install (existing) | NO | Visibility change is purely additive. `consume_skill_metadata_snapshot` still called at exactly line 2964; behaviour identical. |
| Marketplace finalize_mcp_install (existing) | NO | Same as above for line 3260. |
| UI restore_skill (modified) | LOW | Pre-fix behaviour: rename + return. Post-fix: rename + (try recover, no-op if no snapshot, only writes on success). If snapshot file is malformed, `consume_*` returns None (with eprintln + best-effort file removal), same as today's behaviour. If `read_app_data` / `write_app_data` fail, an Err propagates AFTER the rename has succeeded — user sees an error toast but the skill is back. They can manually re-classify; no data loss compared to today (today's behaviour drops metadata regardless). |
| UI restore_mcp (modified) | LOW | Same as restore_skill plus an extra `fs::rename` of the sibling snapshot. That rename is best-effort (`let _ = fs::rename`) — failure logs to stderr but does not block primary restore. |
| restore_claude_md (existing) | NO | Untouched. |
| restore_rule (existing) | NO | Untouched. |
| restore_scene (new) | N/A | Did not exist before. |
| restore_project (new) | N/A | Did not exist before. |

Then I considered the consumers:

| Consumer | Could regress? | Why not |
|---|---|---|
| `trashStore.loadTrashedItems` | NO | Existing call shape unchanged; just receives 2 extra fields. |
| `trashStore.restoreSkill` | NO | Backend signature unchanged; behavior more correct. |
| `trashStore.restoreMcp` | NO | Same. |
| `trashStore.restoreClaudeMd` | NO | Untouched. |
| `TrashRecoveryModal` consumers | NO | Same props (`isOpen`, `onClose`, `onRestoreComplete`). Only added internal state + tabs. |
| `delete_scene` / `delete_project` (data.rs) | NO | Untouched — they continue writing to the same `trashed_*` Vecs; my change only adds readers, never modifies the writer. |
| Marketplace install flows | NO | None call `restore_*` from trash.rs. Only `consume_*` callers are inside marketplace.rs itself. |

## Manual verification steps for lead agent

For each finding, the user-observable check that should be run after F2 lands in dev mode (`npm run tauri dev`):

### A3

1. Import a Skill (e.g. local skill `foo`). Set its Category to "AI", Tags = ["mcp", "claude"], Icon = some emoji. Use it 3 times in another action so `usage_count` ticks up.
2. Delete the Skill from the Skills page.
3. Open Trash Recovery (sidebar / settings → Trash Recovery).
4. Verify the Skills tab shows `foo` with its `deletedAt`.
5. Select it, click "Recover Selected".
6. Open Skills page → `foo` is back. **Verify**: Category = "AI", Tags = ["mcp", "claude"], Icon present, usage_count = 3.
7. In Finder, open the skill's directory under `~/.ensemble/skills/foo/`. **Verify**: no `_ensemble_metadata.json` file visible (consumed by restore).

Same for an MCP: delete → recover → category / tags / scope intact, no sibling `.metadata.json` left in `~/.ensemble/mcps/`.

### A4

1. Create a Rule (e.g. file `my-test.md`). Delete it from Rules page.
2. Open Trash Recovery. **Verify**: 4th tab "Rules" is visible.
3. Click Rules tab. **Verify**: `my-test` appears with filename and deletedAt visible in the meta line.
4. Select + Recover Selected.
5. Open Rules page → Rule is back, `isGlobal` is false (per backend trash.rs:590 — already correct).

### A5 (Scene)

1. Create a Scene "TestScene" with 2 Skills + 1 MCP + 1 Rule.
2. From ScenesPage, delete TestScene (ensure no project references it, or remove project ref first).
3. Open Trash Recovery. **Verify**: 5th tab "Scenes" exists with TestScene listed, and the meta line shows `"2 skills · 1 MCPs · <date>"`.
4. Select + Recover.
5. Open ScenesPage → TestScene is back with all 3 bindings intact (assuming none of the Skills / MCP / Rule were deleted during trash dwell).
6. **Edge case test**: delete a Skill that's in TestScene, then restore TestScene. **Verify**: TestScene is back with only the remaining valid Skills (the deleted one is silently filtered out per R5 F5). This is the dangling-ref filtering behaviour.

### A5 (Project)

1. Create a Project "TestProj" bound to TestScene.
2. Delete TestProj from ProjectsPage.
3. Open Trash Recovery → 6th tab "Projects" → TestProj listed with path + deletedAt.
4. Recover. **Verify**: TestProj is back in ProjectsPage with sceneId = TestScene intact.
5. **Edge case test**: delete TestScene also (between trash and restore), then restore TestProj. **Verify**: TestProj returns but with empty sceneId; ProjectsPage shows "No scene selected" and user can rebind.

## Self-check 5 — final pass

1. **Out-of-scope edits?** None. `data.rs::delete_scene` / `delete_project` writers untouched (verified by re-reading lines 1124-1168 and 1233-1258 after my changes — no diff). `marketplace.rs` only had visibility-and-docs changes on 2 fn declarations.

2. **Same bug elsewhere unfixed?** Grep `fs::rename.*trash` confirms only the 4 modified restore paths exist; grep `consume_.*metadata_snapshot` confirms only marketplace finalize and the new trash restore call sites. Grep `trashed_scenes|trashed_projects` confirms zero readers were left unfixed.

3. **New deps / files / IPCs?** No new crate / npm package. 2 new IPCs (`restore_scene` + `restore_project`) explicitly required by A5 finding. 0 new files beyond `F2_plan.md` + `F2_log.md`.

4. **Modified existing IPC signatures?** `list_trashed_items` return type gains 2 new fields with `#[serde(default)]` — backward-compatible for the wire format. Frontend types updated in lockstep. No existing IPC's *signature* (input parameters or return shape excluding the additive fields) changed.

5. **Broken existing tests?** Re-ran `cargo test --lib`: 185 passed, 0 failed, 7 ignored. No regressions. Existing trash.rs tests target `parse_timestamp_from_name` only — unaffected. `AppData::trashed_scenes.is_empty()` assertions in `types.rs` test paths only check that `AppData::default()` produces empty Vecs, which still holds.

## Gate output (tail line)

```
$ cd src-tauri && cargo build
warning: `ensemble` (lib) generated 1 warning   # pre-existing in marketplace.rs (not mine)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.17s

$ cd src-tauri && cargo test --lib
test result: ok. 185 passed; 0 failed; 7 ignored; 0 measured; 0 filtered out; finished in 0.75s

$ npx tsc --noEmit
(no output — clean)

$ npx eslint src/
✖ 17 problems (0 errors, 17 warnings)   # all 17 are pre-existing in unrelated files
```

All gates green.

## Surprises during implementation

None significant. Two minor:

1. **`TrashedScene` / `TrashedProject` were already complete with `rule_ids` field** (types.rs:181-183) — I expected to need to extend them but didn't. Reading `delete_scene` (data.rs:1135-1146) confirmed that Rule bindings already round-trip through trash.

2. **`McpMetadata::scope` is `String` not `Option<String>`** (types.rs:340) — different from what the marketplace finalize code suggests (`if !snap.scope.is_empty()`). I followed marketplace's convention and did NOT special-case scope in `sanitize_mcp_metadata_against_data` (scope is "user" / "project" — both valid; not a category-style reference that can go dangling). No issue, just worth flagging.

The plan-vs-implementation drift was zero — `F2_plan.md` Step-by-step matches what landed in code, including the 5 Open Questions all decided per the plan's proposals.
