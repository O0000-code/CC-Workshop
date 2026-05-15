# F4b Implementation Log — A7 / A9 / A10 / A11

Owner: F4b Agent. Stage 2 (parallel with F2 / F3 / F4a). Frontend-only. No backend changes, no new deps, no new IPC.

---

## Summary of changes

| Finding | File | Change |
|---|---|---|
| **A7** | `src/stores/importStore.ts` | `importMcps` switched from `skillSourceDir.replace('/skills', '')` to `mcpSourceDir.replace('/mcps', '')`. |
| **A9** | `src/components/layout/MainLayout.tsx` | `handleCategorySave` + `handleTagSave` now run a case-insensitive + trimmed duplicate-name guard (categories scoped by parent) before calling the store mutator. On conflict, sets `appStore.error` and returns early. |
| **A9** | `src/pages/ScenesPage.tsx` | `handleCreateScene` + `handleUpdateScene` run the same guard against `scenes`. Update modal stays open on conflict. New `useAppStore` import added. |
| **A9 + A10** | `src/stores/appStore.ts` | Added two minimal actions: `setError(message)` and `clearError()` plus their interface entries. No change to existing `error` field semantics. |
| **A10** | `src/components/layout/MainLayout.tsx` | Subscribed to `appStore.error` + `clearError`. Added a conditional global banner at the top of `<main>` rendering the error with a Dismiss button. Uses `var(--color-error)` / `var(--color-error-bg)` from `src/index.css`. |
| **A11** | `src/pages/SkillsPage.tsx` | `handleDelete` resets `selectedSkillId` to null when the deleted skill is the currently-selected one. `<SlidePanel isOpen=...>` switched from `selectedSkillId` (id) to `selectedSkill` (data) so a deleted-while-selected still closes the panel via the data-driven fallback. |
| **A11** | `src/pages/McpServersPage.tsx` | Mirror of SkillsPage: `handleDelete` resets `selectedMcpId`; `<SlidePanel>` driven by `selectedMcp`. |

Total lines touched: ~70 across 6 files (mostly the comment headers explaining each guard, not the logic itself).

---

## A7 (P1) — importMcps path derivation

**Diff hot-spot** (`src/stores/importStore.ts`):
```diff
- const { claudeConfigDir, skillSourceDir } = useSettingsStore.getState();
- const ensembleDir = skillSourceDir.replace('/skills', '');
+ const { claudeConfigDir, mcpSourceDir } = useSettingsStore.getState();
+ const ensembleDir = mcpSourceDir.replace('/mcps', '');
```

Backend contract (`src-tauri/src/commands/import.rs:537`) reads `mcps_dest = ensembleDir/mcps` — so the strip must remove the `/mcps` segment to align the parent path.

**Grep validation** (verified before commit):
- `rg -n "skillSourceDir.replace" src/stores/importStore.ts` returned 3 hits at lines 131 (backupBeforeImport — covers both skills+MCPs backup target, unchanged by design), 157 (importConfig — combined path for old flow), 336 (importSkills — correct). Line 394 (now line 400 after comment block) was the bug.
- `rg -n "mcpSourceDir" src/stores/` returned: settingsStore field + setter + the new importMcps usage. No other callsite assumed skill / mcp share a path.

**User-observable success** (re-stated):
- User does X: in Settings set `MCP source directory` to `/Volumes/External/ensemble-mcps`, leave Skills source at default. Open Import MCPs modal, pick an MCP, confirm.
- User sees Y: the imported MCP's JSON ends up under `/Volumes/External/ensemble-mcps/<name>.json`. After restart, `mcpsStore.loadMcps` (which uses `mcpSourceDir`) shows the imported MCP.
- User does NOT see Z: silent write to `~/.ensemble/mcps/<name>.json` while custom dir stays empty and post-restart the imported MCP "disappears".

**Adjacent regression check**: Default users see no change because `skillSourceDir` and `mcpSourceDir` both resolve to `~/.ensemble/{skills,mcps}` → `ensembleDir = ~/.ensemble` for both before and after the patch. Only custom-dir users (the actual victims of the bug) shift behavior.

---

## A9 (P1) — Duplicate-name guards

**Strategy**: nothing changed in the inline inputs / modal internals; the guards sit in the handler layer where the existing data arrays (categories / tags / scenes) are already in scope. Comparison is case-insensitive + trimmed.

**Categories** (`MainLayout.handleCategorySave`):
- Skip self in edit mode (`c.id !== id`)
- Scope by parent (`(c.parentId ?? null) === parentScope`). Sidebar's "Add Category" only enters from root (no UI for adding a child via inline input today), but the scope check is correct for any future entrypoint and is symmetric with how the user perceives duplicates.

**Tags** (`MainLayout.handleTagSave`):
- Flat namespace, no parent. Same self-skip in edit mode.

**Scenes** (`ScenesPage.handleCreateScene` + `handleUpdateScene`):
- Flat namespace. Update path excludes self.
- On conflict, the modal stays open (we `return` before any `setIsCreateModalOpen(false)` / `setEditingScene(null)` call), so the user can edit and retry.

**Error channel**: all three route through `appStore.setError` → global banner (A10). No new toast / dialog system introduced.

**Adjacent regression check**:
- The legacy "name → category id" lookup paths in MainLayout/SkillsPage (e.g. `categories.find(c => c.name === selectedSkill.category)?.id`) still works correctly because we don't actually allow same-name siblings to exist any more, so the find returns a unique result. Pre-existing duplicates (if any user has them) are not affected — guard runs only on new add / rename.
- Test impact: `appStore.test.ts` and `appStore.moveCategoryToParent.test.ts` continue to pass; they don't depend on `setError` / `clearError`.

**User-observable success** (per finding):
- User does X: 创建 category "Dev"; 再次 "+" 输 "Dev" 或 "dev"。 User sees Y: banner "A category named 'Dev' already exists at this level." 第二条不出现。 User does NOT see Z: sidebar 出现两条 "Dev"。
- Tag / Scene analogous.

---

## A10 (P2) — Global error banner

**MainLayout subscription**:
```tsx
const appError = useAppStore((s) => s.error);
const clearAppError = useAppStore((s) => s.clearError);
```

**Banner JSX** placed at the top of `<main>`, above `<ErrorBoundary><Outlet/></ErrorBoundary>`. Token compliance:
- background `var(--color-error-bg)` (= `#fee2e2`, status token, design language Constraints "Color tokens")
- border `var(--color-error)` (= `#dc2626`)
- text size 13, weight 500 — both inside the documented font scale
- radius `rounded-md` = 6 px = `--radius-md`
- horizontal padding `px-4`, vertical `py-3` — standard Tailwind tokens
- `role="alert"` for assistive technology
- `prefers-reduced-motion`: no transitions on this banner, so no extension to existing reduced-motion coverage needed

**Why a new banner, not page-level**: existing SkillsPage / McpServersPage banners consume their own store's `error` field (skillsStore.error / mcpsStore.error). `appStore.error` is written by sidebar reorder + hierarchy / category + tag mutations and previously had zero UI consumers — the bug. The new global banner pulls from `appStore.error` only.

**Why a banner under the sidebar rather than inside the sidebar**: a sidebar inline alert would tie error visibility to scroll position and would visually compete with the user's category color column. Below the sidebar in the main column keeps the error close to where the user just acted (sidebar drag → main viewport stays visible) without changing sidebar layout.

**Adjacent regression check**: 
- Page-level error banners in SkillsPage / McpServersPage / RulesPage / etc. unchanged. They consume separate `error` fields. No double-rendering.
- The banner does not block clicks below (uses `flex` flow, no `position: fixed`), so the user can keep operating while seeing the message.

**User-observable success** (per finding):
- User does X: drag sidebar parent "A" onto its own child (creates circular). `set_category_parent` IPC throws `validate_hierarchy` error → `appStore.moveCategoryToParent` catch writes `error: message`.
- User sees Y: red banner at top of main pane: "Setting parent would create a cycle" (or backend's exact text). Press Dismiss → banner disappears.
- User does NOT see Z: category snaps back with zero feedback.

---

## A11 (P1) — SlidePanel residual blank

**Two-layer safety** per task spec:

**Layer 1 — `handleDelete` clears local id**:
```tsx
if (selectedSkillId === skillId) {
  setSelectedSkillId(null);
}
deleteSkill(skillId);
```

**Layer 2 — `<SlidePanel>` driven by data**:
```diff
- <SlidePanel isOpen={!!selectedSkillId} ...>
+ <SlidePanel isOpen={!!selectedSkill} ...>
```

When the deleted skill is the selected one, both layers cooperate:
- Layer 1 zeroes the local id synchronously → `selectedSkill = useMemo(skills.find(...))` returns null on the next render.
- Layer 2 picks up `selectedSkill === null` → `isOpen` false → panel slides out.

When the deleted skill is NOT the selected one (user has A selected, deletes B via list dropdown):
- Layer 1's `if` short-circuits (no reset) → A stays selected.
- Layer 2's `!!selectedSkill` is still truthy → panel stays open showing A.
- This is the correct behavior: the panel reflects whichever skill is selected, irrespective of unrelated deletions.

**Edge — Marketplace deep link** (`?selected=` query param in `useEffect` line 457): only writes `setSelectedSkillId`, never enters `handleDelete`. No interaction.

**Edge — `mr-[800px]` main-content margin** (SkillsPage:1012, McpServersPage:1048): still keyed on `selectedSkillId` (local id). Because layer 1 zeros the local id synchronously in the same React batch as `deleteSkill`'s state update, the margin collapses in the same frame the panel slides out — no visual lag.

**Adjacent regression check**:
- `handleCloseDetail` still calls `setSelectedSkillId(null)` (user-initiated close). Unchanged.
- `SkillDetailPanel` (used by CategoryPage / TagPage) is a SEPARATE component and out of A11 scope per task description.
- McpServersPage's `fetchMcpTools` auto-fetch effect (line 425-435) depends on `selectedMcpId, selectedMcp, ...`; both already covered by the existing 5-guard expression.

**User-observable success** (per finding):
- User does X: click Skill A row → SlidePanel opens (800 px right column). Then click row dropdown → "Delete".
- User sees Y: Skill A disappears from list, SlidePanel slides out, main area regains full width — all in one animation frame.
- User does NOT see Z: 800 px blank panel staying on the right while main list reflows.

---

## Self-check (charter 5 questions)

1. **Did the change touch finding-external code?** No. All edits are in the 6 files listed in the plan, each tied to a specific finding.
2. **Same-shape bug elsewhere?** Grep verified:
   - `skillSourceDir.replace('/skills','')` — 3 other hits (backupBeforeImport / importConfig / importSkills). All correct — they import skills or back up the parent path. Only `importMcps` was wrong.
   - Duplicate-name guards — three add/edit entry points (CategoryInlineInput → handleCategorySave; TagInlineInput → handleTagSave; CreateSceneModal → handleCreateScene / handleUpdateScene). All covered.
   - SlidePanel double-state — SkillsPage + McpServersPage. CategoryPage / TagPage use the separate `SkillDetailPanel` / `McpDetailPanel` components, which is explicitly noted as out of A11 scope.
3. **New deps / IPC / files?** Zero. Two tiny store actions (`setError`, `clearError`) added to existing `appStore` — these are internal action helpers, not IPC, not new files.
4. **Changed IPC signature?** No. All IPC contracts unchanged. The frontend just passes a different `ensembleDir` string for `importMcps` (which was already a parameter).
5. **Broke any test?** No. All 283 frontend tests pass. Backend `cargo build` clean (no new warnings). The new `setError` / `clearError` actions are additive to `appStore`; existing tests against the `error` field continue to pass.

---

## Gate output

```
$ npx tsc --noEmit
EXIT=0

$ npx eslint src/
✖ 17 problems (0 errors, 17 warnings)   # all pre-existing
EXIT=0

$ npx vitest run
 Test Files  22 passed (22)
      Tests  283 passed (283)
   Duration  2.98s
EXIT=0

$ cd src-tauri && cargo build --quiet
warning: field `transport` is never read   # pre-existing, marketplace.rs
EXIT=0
```

All four gates green. No new lint warnings introduced. No test regressions. Rust unaffected.

---

## Manual verification suggestions (for lead agent)

Each finding has a "User does X / sees Y / does NOT see Z" contract documented above. Recommended manual reps after install:

- **A7**: change `mcpSourceDir` in Settings → import any MCP → `ls /Volumes/External/ensemble-mcps/` (or whatever custom dir was set) confirms the new JSON landed there.
- **A9**: try to create two identically-named categories / tags / scenes (with and without case variation). Expect global banner; second never persists.
- **A10**: drag a parent Category onto its own child. Expect red banner with "Setting parent would create a cycle". Press Dismiss → banner gone.
- **A11**: select any Skill, then delete it from the list-row dropdown. Expect SlidePanel to slide out within the same animation frame.

---

## Surprises / open questions

- The existing SkillsPage / McpServersPage / RulesPage error banners use Tailwind `red-*` palette (`bg-red-50 text-red-700`), which technically violates the design-language Rule's "Color tokens are mandatory" Principle. The new A10 banner uses `var(--color-error)` / `var(--color-error-bg)` per the Rule. This creates a small visual inconsistency (50-tier red vs error-bg `#fee2e2`) until those older banners are migrated — out of F4b scope, but worth noting as cleanup backlog.
- `add_scene` backend (`data.rs`) is the only mutator that doesn't go through a store action — ScenesPage uses `safeInvoke` directly. The A9 guard had to be placed in the page handler, not in a store action. This is consistent with the existing pattern but reveals minor architectural drift (Scene flow vs Category/Tag flow) that might be worth aligning later.
- No surprises in source — task spec was accurate down to the line number for every fix.
