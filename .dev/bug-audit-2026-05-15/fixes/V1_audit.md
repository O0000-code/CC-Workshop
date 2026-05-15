# V1 — 代码层 Audit Report

Owner: V1 (Opus, code-layer audit). Scope: 15 findings across F1/F2/F3/F4a/F4b
+ surprise-change investigation. Reference: `04_master_findings.md`,
`00_implementation_charter.md`, all 5 fix logs/plans, full git diff HEAD.

## Gate 复跑结果

```
$ cd src-tauri && cargo build
warning: field `transport` is never read (pre-existing, marketplace.rs:727)
warning: `ensemble` (lib) generated 1 warning
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.52s
EXIT 0

$ cd src-tauri && cargo test --lib
test result: ok. 185 passed; 0 failed; 7 ignored; 0 measured; 0 filtered out;
finished in 0.71s
EXIT 0

$ npx tsc --noEmit
(no output)
EXIT 0

$ npx eslint src/
✖ 17 problems (0 errors, 17 warnings)
(all 17 are pre-existing in files unrelated to bug-audit fixes)
EXIT 0

$ npx vitest run
Test Files  22 passed (22)
     Tests  283 passed (283)
EXIT 0
```

All 5 gates green. No regressions introduced.

---

## 逐条 finding audit(15 条 × 4 问)

### B1 — `write_app_data` atomic + 1-slot bak + parse-failure recovery
**Owner**: F1 · **Files**: `data.rs:243-353` · **Severity**: P0

- **Q1 修对了吗**: PASS. Sequence is correct (serialize → ensure_dir →
  best-effort `fs::copy` bak → `File::create + write_all + sync_all + drop` →
  `fs::rename`). `read_app_data` parse-failure tries bak then quarantines to
  `data.json.corrupt.<ts>` before returning default.
- **Q2 边界**: PASS.
  - Tmp file is in the same directory as target → POSIX rename atomicity holds.
  - `File` is scoped + explicitly dropped before `rename` → Windows-compatible.
  - `fs::copy` on first write fails (no source) → swallowed; intended.
  - `with_extension("json.bak")` on `data.json` correctly yields `data.json.bak`
    (verified — Rust extension is "json", replacement adds ".bak" after the
    file_name root). Same for `.tmp`.
  - `with_file_name(format!("data.json.corrupt.{ts}"))` produces the right
    quarantine path.
  - Quarantine rename is best-effort `let _` — even if it fails, default is
    still returned. Won't loop on next launch because default has no `data.json`.
  - I/O error reading `data.json` (different class than parse error) still
    propagates Err — recovery only triggers on parse failure. Correct
    semantic separation.
- **Q3 不破现有**: PASS. Both signatures byte-identical
  (`read_app_data() -> Result<AppData, String>` / `write_app_data(AppData) -> Result<(), String>`).
  All ~70 callers untouched. Successful writes still produce identical
  pretty-printed JSON.
- **Q4 不引入新 bug**: PASS.
  - Disk-full during tmp write → `write_all` errs, `rename` never runs,
    original `data.json` untouched.
  - Disk-full during backup → swallowed; primary write proceeds.
  - Concurrent writers: `DATA_MUTEX` (in callers) serializes; the helper
    itself is unlocked but reaches only after rename atomicity.
  - One behavior change: empty `data.json` (zero bytes) used to be an Err;
    now treated as parse failure → falls to default. Intended for "don't
    brick the app".

---

### A1 — selective deletion of managed CLAUDE.md + .mcp.json
**Owner**: F1 · **Files**: `config.rs:1-127, 133-196, 246-356` · **Severity**: P0

- **Q1 修对了吗**: PASS. 4 new private helpers
  (`ensemble_managed_claude_md_contents`, `matches_any_managed`,
  `ensemble_managed_mcp_names`, `trim_managed_mcps_in_file`) implement
  byte-identity matching for CLAUDE.md and key-set filtering for `.mcp.json`.
  `clear_project_config` now reads AppData/Settings once under DATA_MUTEX
  and uses these helpers. `write_mcp_config`'s empty-list branch delegates
  to `trim_managed_mcps_in_file`.
- **Q2 边界**: PASS.
  - File doesn't exist → no-op Ok. Unreadable → return without touching
    (preserve user content). Unparseable → return without touching (safer
    than `fs::remove`). `mcpServers` missing / non-object → no-op.
  - "All-managed → delete entire file" decision correctly checks BOTH
    `all_were_managed` AND `only_mcp_servers_key` (so the user's other
    top-level keys are preserved by falling to the rewrite path).
  - Empty initial `mcpServers: {}` → `original_keys.is_empty()` makes
    `all_were_managed = false`, file is preserved with empty mcpServers.
  - `matches_any_managed` on I/O error returns false → safe default
    (preserve, never delete unknowable file).
- **Q3 不破现有**: PASS. Signatures unchanged. Default-user behavior:
  same final outcome (managed files removed, user files preserved). The
  pre-fix behavior of unconditionally removing files was the BUG; new
  behavior is the intended fix.
- **Q4 不引入新 bug**: PASS.
  - `DATA_MUTEX` scope: acquired once after skill-symlink removal (which
    doesn't touch data.json) and held through end of function. Existing
    rule cleanup block at lines 328-353 still does its own direct
    `fs::read_to_string(data.json)` — that's R1 F2 (out of scope), now
    strictly safer because it runs inside the guard.
  - No new IPC; no signature change.
- **NON-BLOCKING observation**: `write_mcp_config` non-empty branch still
  uses unconditional `fs::write` (lines 192-194). A user with both
  hand-written and Ensemble-managed entries who syncs a non-empty Scene
  loses the hand-written entries. R1 F1 was specifically scoped to the
  empty-list branch; this sister concern was not in any reviewer finding.
  Recommend backlog as P1 follow-up.

---

### B7 — `.claude` exception in `claude_md.rs::is_excluded_dir`
**Owner**: F1 · **Files**: `claude_md.rs:296-309` · **Severity**: P0

- **Q1 修对了吗**: PASS. Condition flipped from
  `name.starts_with('.')` to `name.starts_with('.') && name != ".claude"`,
  mirroring `rules.rs:351`.
- **Q2 边界**: PASS.
  - `.git`, `.venv`, `.next` etc. still excluded.
  - Walker descends into `.claude/` → only `CLAUDE.md` and `CLAUDE.local.md`
    filenames are matched by `scan_directory` (line 208-215), so no
    `.claude/rules/*.md` or `.claude/settings.json` accidentally surfaces.
- **Q3 不破现有**: PASS. No signature change. Pre-fix scans missed
  `.claude/CLAUDE.md`; post-fix surfaces it. Pure additive scope.
- **Q4 不引入新 bug**: PASS. Walker's filename filter (`CLAUDE.md` /
  `CLAUDE.local.md`) is the safety net.

---

### A3 — `restore_skill` / `restore_mcp` metadata recovery
**Owner**: F2 · **Files**: `trash.rs:114-152, 409-551`, `marketplace.rs:531/561` · **Severity**: P0

- **Q1 修对了吗**: PASS. Both restore paths now call the relevant
  `consume_*_metadata_snapshot` (visibility upgraded to `pub(crate)`),
  pass the result through `sanitize_*_metadata_against_data`, and persist
  the validated metadata under `DATA_MUTEX`.
- **Q2 边界**: PASS.
  - Skill snapshot lives INSIDE the directory (`_ensemble_metadata.json`),
    so `fs::rename(trash → live)` moves it with the directory. ✓
  - MCP snapshot lives ALONGSIDE the `.json` (sibling), so the rename of
    the primary `.json` does NOT move the sibling. Implementation
    correctly does a second `fs::rename` for the sibling (best-effort
    `let _ = ...` style with eprintln-on-failure) BEFORE calling
    `consume_mcp_metadata_snapshot`. ✓
  - Sibling rename failure → snapshot remains at trash location;
    `consume_mcp_metadata_snapshot` returns None (sibling missing at
    target); metadata not restored. Documented as "best-effort"
    semantics; acceptable.
  - `consume_*` internally `fs::remove_file`s on success AND parse
    failure → no orphan `_ensemble_metadata.json` / `.metadata.json` left
    in restored item directory.
  - `sanitize_*_metadata_against_data` only mutates `category_id` (null
    if id no longer exists) and `tags` (retain only valid name set).
    `install_source` / `marketplace_source` round-trip intact — closes
    R2 F7 vector.
- **Q3 不破现有**: PASS.
  - Marketplace finalize paths (`finalize_skill_install` line 2964,
    `finalize_mcp_install` line 3260) still call `consume_*` identically;
    visibility upgrade is additive.
  - `restore_skill` / `restore_mcp` IPC signatures unchanged.
  - `restore_claude_md` / `restore_rule` untouched.
- **Q4 不引入新 bug**: PASS.
  - `DATA_MUTEX` only acquired AFTER `consume_*` succeeded (inside
    `if let Some(snap)`) — the lock scope is tight. No nested-lock
    deadlock because `read_app_data` / `write_app_data` are pure
    functions that don't acquire the mutex themselves.
  - Theoretical race: marketplace finalize + trash restore of same skill
    name → at most one wins, no data corruption (consume_* removes
    snapshot file, the other gets None). Very unlikely in practice.

---

### A4 — Rules tab in TrashRecoveryModal
**Owner**: F2 · **Files**: `TrashRecoveryModal.tsx` (full refactor),
`trashStore.ts:155-176` · **Severity**: P1

- **Q1 修对了吗**: PASS. `restoreRule` action added to trashStore mirroring
  `restoreClaudeMd`. Modal extended with 'rules' tab type, `selectedRules`
  Set, `handleToggleRule`, `handleRestore` Rules loop. Tab inserted between
  CLAUDE.md and Scenes per sidebar order. Backend was already wired
  (`list_trashed_items.rules` + `restore_rule` IPC).
- **Q2 边界**: PASS. Tab UI uses `ScrollText` icon (consistent with
  RulesPage). Rules meta line shows `filename · deletedAt` to disambiguate
  multi-rule same-name (filename is Claude Code identity).
- **Q3 不破现有**: PASS. Modal refactor extracted `renderRow` / `renderFooter`
  / `renderEmpty` / `renderTabBody` helpers, eliminating 3× JSX duplication.
  Existing 3 tabs' behavior preserved (handler shapes, Set typing,
  reset-on-close).
- **Q4 不引入新 bug**: PASS.
  - `tabs` array declared inside component body (recreated each render) —
    standard React; modal rarely opens, no perf concern.
  - `totalSelectedCount` arithmetic correctly sums all 6 sets.
  - `setSelectedRules(new Set())` on modal close resets selection (along
    with all 5 other sets).

---

### A5 — Scene / Project trash restore path
**Owner**: F2 · **Files**: `types.rs:1318-1330, 169-201`,
`trash.rs:367-389, 805-927`, `lib.rs:184-185`, `trash.ts`, `trashStore.ts:175-220`,
`TrashRecoveryModal.tsx` · **Severity**: P1

- **Q1 修对了吗**: PASS. `TrashedItems` gains `scenes` / `projects` fields
  (`#[serde(default)]` for backward compat). `list_trashed_items` reads
  `data.trashed_scenes` / `trashed_projects` under `DATA_MUTEX` (lock
  scope tight around clone, released before sort). `restore_scene` /
  `restore_project` IPCs added + registered in `lib.rs`. Frontend
  `TrashedScene` / `TrashedProject` types + 2 store actions + modal tabs.
- **Q2 边界**: PASS.
  - Collision check on live `scenes` / `projects` BEFORE the trash entry
    is removed — on collision returns Err without mutating data.
    (Original plan called for write-back-then-Err; implementation
    realizes the same with no-mutation early-return — cleaner.)
  - R5 F5 reference validity: skill_ids / mcp_ids / claude_md_ids /
    rule_ids each filtered against current AppData sets (built once,
    O(1) per id). Dangling refs silently dropped.
  - Project's `scene_id` reset to empty string when referenced Scene is
    gone; ProjectsPage handles empty sceneId gracefully (existing
    behavior).
- **Q3 不破现有**: PASS.
  - `list_trashed_items` return type gains 2 fields with
    `#[serde(default)]` — JSON-wire-compatible. Frontend types updated
    in lockstep.
  - `delete_scene` / `delete_project` writers untouched.
  - No existing IPC signature changes.
- **Q4 不引入新 bug**: PASS.
  - DATA_MUTEX scope correct in both new IPCs.
  - Modal restore loop calls `restoreScene(id)` / `restoreProject(id)`
    keyed by id (not path) — selection Set typed as `string` but
    interpreted as id for those two tabs (documented inline).
- **NON-BLOCKING observation**: `restore_rule` (pre-existing) does NOT
  filter dangling `category_id` / `tag_ids` against current AppData,
  even though `restore_scene` does. This is an inconsistency, not a
  scope item. Recommend backlog cleanup.

---

### A2 — AppleScript injection (iTerm + Terminal.app)
**Owner**: F3 · **Files**: `import.rs:1455-1490, 1621-1644` · **Severity**: P0

- **Q1 修对了吗**: PASS. Both branches replaced ad-hoc escape
  (`replace('\\', "\\\\").replace('"', "\\\"")`) with the two-layer
  pattern: `folder_launch_command` (shell-quotes folder via POSIX
  single-quote `'...'`) → `applescript_quote` (escape `\` and `"` for
  AppleScript literal).
- **Q2 边界**: PASS.
  - Folder names containing `$(...)`, backticks, `${VAR}` no longer
    expand inside zsh (single quotes neutralize).
  - Single quote in folder name handled by `shell_quote`'s `'\''`
    pattern (close-escape-reopen).
  - Backslash / double-quote in folder name escaped by
    `applescript_quote` for outer AppleScript literal.
  - `claude_command` flows through unmodified — preserves multi-token
    user-configured value (e.g. `claude --model opus`). This matches
    the trust boundary documented in the Ghostty path.
- **Q3 不破现有**: PASS.
  - Warp branch (YAML) untouched — different security model (R4 D2,
    descoped to P2).
  - Alacritty branch untouched — uses `Command::new("alacritty").arg(...)`
    (no shell interpretation, safe).
  - Ghostty branch untouched — already used the safe pattern.
- **Q4 不引入新 bug**: PASS. `format!` positional `{}` correctly substitutes
  `quoted` (which is `"..."` complete with surrounding quotes) into the
  AppleScript template. Final AppleScript syntax verified valid.

---

### B4 — `install_marketplace_skill` owner/repo sanitization
**Owner**: F3 · **Files**: `marketplace.rs:2911-2944` · **Severity**: P0

- **Q1 修对了吗**: PASS. After `derive_install_triple`, both `owner_raw`
  and `repo_raw` are sanitized via `sanitize_resource_name` before being
  passed to `install_skill_via_codeload`. On sanitize failure, returns
  `Ok(InstallOutcome::Failed { reason })` — same shape as existing
  failure path.
- **Q2 边界**: PASS.
  - `sanitize_resource_name` rejects `..`, leading `.`, `/`, `\`,
    non-ASCII, len > 64, embedded NUL. Allows alphanumeric + `_`-`.`.
  - `skill_path` NOT sanitized (legitimately contains `/` for nested
    paths); downstream `install_skill_via_codeload` per-component
    sanitizes during tar extraction.
  - 3 sibling callsites in marketplace.rs (`get_marketplace_repo_stars`,
    `fetch_skill_summary_github`, `fetch_mcp_readme_github`) already had
    sanitize — this closes the last hole.
- **Q3 不破现有**: PASS. Legitimate names (`microsoft`, `azure-skills`)
  pass through unchanged. `install_skill_via_codeload` signature
  unchanged.
- **Q4 不引入新 bug**: PASS.
  - `finalize_skill_install`'s second `derive_install_triple` call (line
    2969) is NOT also sanitized — this is correct because its use is
    metadata-only (`MarketplaceSource` display fields), not URL
    construction. When sanitize at the URL boundary rejects, finalize
    is never reached. Documented inline.

---

### B5 — `derive_stdio_command` unknown registry_type
**Owner**: F3 · **Files**: `marketplace.rs:1297-1348, 1404-1419` · **Severity**: P0

- **Q1 修对了吗**: PASS. Two layered defenses:
  1. `envelope_to_item` rejects envelopes with `registry_type` not in
     `{ "npm", "pypi", "oci" }` allowlist at line 1417 — entry never
     enters the marketplace catalog.
  2. `derive_stdio_command` `_` arm tightened to `("node", Vec::new())`
     safe sentinel — defense-in-depth for any future direct callers.
- **Q2 边界**: PASS.
  - `registry_type = ""`: lowercase still "", doesn't match → None.
  - `registry_type = "EvilFoo"`: lowercase "evilfoo", doesn't match → None.
  - `registry_type = "Npm"`: lowercase "npm" matches → derives correctly.
  - Trailing space (`"npm "`): doesn't match exact "npm" → None. (Safe
    failure mode.)
- **Q3 不破现有**: PASS. npm/pypi/oci flows unchanged. Only
  previously-unknown types now filter out (which was the dangerous case).
- **Q4 不引入新 bug**: PASS. Verified only one caller of
  `derive_stdio_command` (line 1426 inside `envelope_to_item`),
  guarded upstream by the allowlist check.

---

### A6 — `delete_category` / `delete_tag` cascade Rules
**Owner**: F4a · **Files**: `data.rs:698-709, 981-988` · **Severity**: P1

- **Q1 修对了吗**: PASS. Both functions extended with a final cascade
  loop on `data.rules`, byte-identical pattern to the adjacent
  `claude_md_files` cascade.
  - `delete_category`: clears `rule.category_id` if equal to deleted id.
  - `delete_tag`: retains `rule.tag_ids` where != id.
- **Q2 边界**: PASS.
  - `Rule.category_id: Option<String>` matched via `as_deref() == Some(&id)`.
  - `Rule.tag_ids: Vec<String>` filtered via `retain(|t| t != &id)`.
  - `TrashedRule` does NOT carry `category_id` / `tag_ids` (verified
    `types.rs:1302-1310`) — no trash cascade needed.
- **Q3 不破现有**: PASS. Pure addition to existing cascade pattern. No
  signature change; same DATA_MUTEX scope.
- **Q4 不引入新 bug**: PASS. No interaction with skill_metadata or
  mcp_metadata cascade above.

---

### A8 — Tri-state `categoryId` on `update_rule` / `update_claude_md`
**Owner**: F4a · **Files**: `rules.rs:485-565`, `claude_md.rs:502-556`,
`rulesStore.ts:243-285`, `claudeMdStore.ts:242-282` · **Severity**: P1

- **Q1 修对了吗**: PASS. Both backend commands now take
  `categoryId: Option<Option<String>>` with `#[allow(non_snake_case)]`,
  mirroring `update_skill_metadata` / `update_mcp_metadata`. Mutation:
  `if let Some(new_opt) = categoryId { rule.category_id = new_opt; }`.
  Frontend stores construct payload conditionally via `'categoryId' in
  updates`, normalising `undefined` → `null` so JSON.stringify emits the
  explicit clear-signal.
- **Q2 边界**: PASS.
  - Outer `None` (key omitted / JS undefined dropped by stringify) →
    no-op.
  - Outer `Some(None)` (JS null) → clears `category_id`.
  - Outer `Some(Some(id))` (JS string) → sets.
- **Q3 不破现有**: PASS.
  - Auto-classify path (rulesStore:490, claudeMdStore:511) sends
    `categoryId: string | undefined` directly — under new contract,
    string → set, undefined → outer None (no-op). Same observable
    semantics as before.
  - DetailPanel `handleCategoryChange` previously sent
    `{ categoryId: '' || undefined }` → undefined → stringify dropped
    key → backend `Option<String> = None` → BUG (no clear). New: store
    normalises to null → backend `Some(None)` → clears. Fixed.
  - tag_ids / icon paths unaffected (key omission semantics unchanged).
- **Q4 不引入新 bug**: PASS.
  - No new IPC; backend signature change is camelCase param naming
    (Tauri's auto-translation handles the wire format correctly).
  - skillsStore / mcpsStore (which already had the tri-state pattern)
    untouched.

---

### A7 — `importStore.importMcps` path derivation
**Owner**: F4b · **Files**: `src/stores/importStore.ts:394-401` · **Severity**: P1

- **Q1 修对了吗**: PASS. Switched `skillSourceDir.replace('/skills', '')`
  → `mcpSourceDir.replace('/mcps', '')`. Backend `import_existing_config`
  computes `mcps_dest = ensembleDir/mcps`, so stripping `/mcps`
  correctly recovers the parent path.
- **Q2 边界**: PASS.
  - Default users (both source dirs default to `~/.ensemble/...`):
    ensembleDir evaluates to `~/.ensemble` either way — no observable
    change.
  - Custom users (different `mcpSourceDir`, e.g.
    `/Volumes/External/ensemble-mcps`): MCP JSON now lands in the user's
    chosen location instead of defaulting to `~/.ensemble/mcps/`.
- **Q3 不破现有**: PASS. One-line variable + arg change. No new IPC,
  no signature change.
- **Q4 不引入新 bug**: PASS. Three other `skillSourceDir.replace('/skills','')`
  hits in the file (backupBeforeImport, importConfig, importSkills) are
  legitimate (they import skills or back up the combined path).

---

### A9 — addCategory / addTag / addScene duplicate-name guards
**Owner**: F4b · **Files**: `MainLayout.tsx:462-498, 600-628`,
`ScenesPage.tsx:282-322, 336-383`, `appStore.ts:204-208, 930-937` · **Severity**: P1

- **Q1 修对了吗**: PASS. Handler-layer guards: trim + case-insensitive
  comparison, scoped to same parent for categories, flat namespace for
  tags / scenes. Edit mode excludes self via `c.id !== id`. On conflict,
  `setError(...)` and early return — modal stays open (`setIsCreateModalOpen(false)`
  / `setEditingScene(null)` only run after the conflict check passes).
- **Q2 边界**: PASS.
  - Category ADD: `id === null`, parentScope = null (root) — matches
    sidebar UI which only adds to root.
  - Category EDIT (renaming a child): parentScope = currentCategory's
    parentId → check against siblings in same parent. Correct.
  - No-op rename (same string): excluded by `c.id !== id`. Proceeds normally.
  - Case-only rename ("Dev" → "DEV"): self excluded, but checks against
    other siblings.
  - Scene EDIT: excludes own scene; rename-to-self stays a no-op.
- **Q3 不破现有**: PASS.
  - 2 new `appStore` actions (`setError`, `clearError`) — additive, no
    interface incompatibility.
  - Pre-existing duplicates in user data (if any) not retroactively
    flagged — guard runs only on new add/rename.
- **Q4 不引入新 bug**: PASS.
  - Empty-name edge case (trimmed = ""): backend likely rejects;
    pre-existing concern, not in scope.
  - Race: two concurrent adds with the same name → both pass client-side
    check, both reach backend. Acceptable per A9 scope (frontend-only
    fix; "前端拦住即可" per charter).

---

### A10 — Global error banner driven by `appStore.error`
**Owner**: F4b · **Files**: `MainLayout.tsx:84-89, 811-840` · **Severity**: P2

- **Q1 修对了吗**: PASS. `MainLayout` subscribes to `useAppStore((s) => s.error)`
  and `clearError`. Banner rendered at top of `<main>` with conditional
  display + Dismiss button. Banner uses `var(--color-error)` /
  `var(--color-error-bg)` design tokens.
- **Q2 边界**: PASS.
  - `role="alert"` for assistive technology.
  - No `position: fixed` — banner flows in main column, doesn't block
    clicks below.
  - Visible above ErrorBoundary > Outlet.
- **Q3 不破现有**: PASS.
  - Page-level error banners in SkillsPage / McpServersPage / RulesPage
    untouched (they consume per-page store error fields).
  - `appStore.error` field semantics unchanged — only 2 new actions.
- **Q4 不引入新 bug**: PASS.
  - Tailwind class `mx-7 mt-4 ... rounded-md px-4 py-3` uses documented
    tokens; matches design-language Rule's color constraints.
- **NON-BLOCKING observation**: pre-existing page-level banners
  (SkillsPage etc.) use Tailwind `red-*` palette, not the new
  `--color-error` token. This creates a slight visual inconsistency.
  F4b_log already flagged as backlog cleanup.

---

### A11 — SlidePanel close on delete (SkillsPage + McpServersPage)
**Owner**: F4b · **Files**: `SkillsPage.tsx:536-545, 1089-1102`,
`McpServersPage.tsx:483-493, 1119-1131` · **Severity**: P1

- **Q1 修对了吗**: PASS. Two-layer safety per spec:
  1. `handleDelete` resets `selectedSkillId` / `selectedMcpId` if matches.
  2. `<SlidePanel isOpen=...>` driven by `selectedSkill` / `selectedMcp`
     (data-driven) rather than the id (data may exist briefly during
     stale render).
- **Q2 边界**: PASS.
  - Delete selected: layer 1 zeros id → memo returns null → layer 2
    closes panel.
  - Delete NON-selected: layer 1's `if` short-circuits → A stays
    selected → panel remains open showing A. Correct.
  - Marketplace deep-link path (`?selected=...` in useEffect) only
    `setSelectedSkillId`, doesn't enter `handleDelete`. No interaction.
- **Q3 不破现有**: PASS.
  - `handleCloseDetail` user-initiated close path unchanged.
  - `mr-[800px]` main-content margin still keyed on local id — collapses
    in the same render frame as the panel slides out.
  - CategoryPage / TagPage use the separate `SkillDetailPanel` /
    `McpDetailPanel` (R7 F7-1 explicitly noted as out of scope).
- **Q4 不引入新 bug**: PASS.
  - `useMemo([skills, selectedSkillId])` correctly recomputes when
    either dep changes.
  - No race between local state and store state.

---

## Surprise 改动审查(4 处)

Audit prompt flagged `skills.rs +56`, `mcps.rs +71`, `ScopeSelector.tsx +16`,
`mcpsStore.ts +5` as not appearing in any of F1-F4b's logs. Investigation:

### Origin: Separate "Scope 系统修复" task

All four surprise changes are from a pre-existing session documented at
`/Users/bo/.claude/plans/hazy-percolating-forest.md` — the "Scope 系统修复"
task. The git status at session start showed `mcps.rs`, `skills.rs`,
`McpServersPage.tsx`, `SkillsPage.tsx` already modified BEFORE the bug
audit fixes began.

Code comments explicitly cite the plan file:
```rust
// scope: derive_skill_scope(...)
// See V1 fix plan /Users/bo/.claude/plans/hazy-percolating-forest.md.
```

### What the surprise changes do

The "Scope 系统修复" refactors Skill / MCP `scope` from STORED metadata to
DERIVED filesystem state:
- **Skill scope**: `<claude_config_dir>/skills/<name>` exists → "global".
- **MCP scope**: `~/.claude.json::mcpServers` contains name → "global".
- Old hardcoded `scope = "user"` removed; metadata.scope deprecated but
  still deserialized for backward compat.

Specifically:
- `skills.rs +56`: adds `derive_skill_scope` + `claude_config_dir`
  parameter to `scan_skills` / `get_skill`; anchors `created_at` to OS
  directory creation time.
- `mcps.rs +71`: adds `load_global_mcp_names` + `derive_mcp_scope`; new
  `scan_mcps` reads `~/.claude.json` once per scan; anchors `created_at`
  to OS file creation time.
- `ScopeSelector.tsx +16`: removes the `'user' → 'global'` UI hack
  (backend now consistently returns `'global' | 'project'`).
- `mcpsStore.ts +5`: re-scans after `updateMcpScope` to reflect derived
  state.
- (Also in `skillsStore.ts +13`: passes `claudeConfigDir` to
  `scan_skills`; re-scans after scope update.)
- (Also in `import.rs`: removed `update_skill_scope_in_metadata` /
  `update_mcp_scope_in_metadata` helpers — scope no longer persisted.)
- (Also in `types.rs`: `SkillMetadata.scope` / `McpMetadata.scope` doc
  comments marked DEPRECATED but field kept for backward compat.)

### Assessment

**Not scope creep of the bug audit fixes.** These are legitimate
pre-existing work from a separate, well-documented task. No code-comment
or commit-trace overlap with bug-audit-2026-05-15 work; both projects
are clearly attributed in source comments.

**No regression risk to bug-audit fixes:**
- `update_mcp_metadata` already had tri-state `categoryId` (this was the
  PRECEDENT for A8). F4a's pattern for `update_rule` / `update_claude_md`
  mirrors it correctly.
- The scope-system change removed `update_skill_scope_in_metadata` /
  `update_mcp_scope_in_metadata` cleanly — no orphan callers (verified
  via grep across both `src/` and `src-tauri/src/`).
- `scan_skills` / `scan_mcps` signature changes are mirrored by the
  store callers (`loadSkills` / `loadMcps`).

**Observation on `SkillsPage.tsx` / `McpServersPage.tsx`:** Both files
combine pre-existing skills/mcp-detail-audit changes (sort logic using
usageStats, `installedAt` anchor) with F4b's A11 fixes. The pre-existing
changes have their own audit dirs (`.dev/skills-detail-audit/`,
`.dev/mcp-detail-audit/`). The A11 additions don't conflict with the
sort/usage refactor.

---

## 总结

### BLOCKING 问题(必须修才能合并)

**无。** All 15 audited findings PASS all 4 questions (modified
correctly, edge cases handled, no breakage of existing functionality,
no new bugs introduced).

### NON-BLOCKING 但应该跟进的(backlog)

1. **`write_mcp_config` non-empty branch still overwrites entirely**
   (config.rs:192-194). A user with hand-written + Ensemble-managed
   entries in `.mcp.json` who syncs a non-empty Scene loses the
   hand-written entries. R1 F1 was scoped to empty-list only; this
   sister concern was unflagged. Recommend P1 follow-up applying the
   same selective-merge pattern (trim managed keys, write back combined
   map).
2. **`restore_rule` (pre-existing) does NOT filter dangling category_id
   / tag_ids** even though `restore_scene` / `restore_project` (new in
   A5) do. Inconsistency, not a bug per se. Recommend backlog cleanup
   to apply the same `sanitize_*_against_data` pattern.
3. **Pre-existing page-level error banners** (SkillsPage etc.) use
   Tailwind `red-*`, not the new `--color-error` token. F4b_log already
   noted as backlog cleanup; not introduced by this fix round.
4. **No unit tests added** for any of the 15 fixes. None of the
   reviewer findings or charter required tests. Recommend a separate
   pass to add regression coverage, especially for A1 (selective
   deletion), A3 (metadata recovery), A5 (Scene/Project restore).

### 整体判断: **GO**

All 15 fixes are correctly implemented, internally consistent, and
backward-compatible. All 5 verification gates pass (cargo build, cargo
test --lib, npx tsc --noEmit, npx eslint, npx vitest run). The 4
"surprise" changes flagged by the prompt are pre-existing work from
separate tasks with clean attribution and no conflict with the
bug-audit fixes.

Recommend merging.
