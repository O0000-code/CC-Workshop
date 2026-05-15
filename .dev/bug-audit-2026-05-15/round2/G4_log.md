# G4 Implementation Log — R2-3 + R2-5

## Summary

Two P1 fixes, both purely frontend (zero backend signature changes):

- **R2-3** (R1 A7 / R7 F7-3 / R1 F5) — `projectsStore.syncProject` now reports
  step-by-step success/failure and reads per-item errors from the two
  batch-distribution IPCs. `ProjectsPage` renders a structured banner when
  any step fails, listing each step's outcome and offering "Clear & Retry".
- **R2-5** (R7 F7-7) — Created `src/utils/keyboard.ts::isEnterCommit(e)`,
  applied to 11 text-input Enter handlers across the codebase so CJK
  IME candidate-selection no longer fires accidental form commits.

## Files changed

| File | Change |
|---|---|
| `src/utils/keyboard.ts` | NEW. `isEnterCommit(e)` helper (12 LoC). |
| `src/utils/__tests__/keyboard.test.ts` | NEW. 6 unit tests covering React event / native event / `isComposing` / `keyCode === 229` / non-Enter / undefined-isComposing. |
| `src/stores/projectsStore.ts` | Add `SyncStepResult` type + `syncStepResults` + `syncResultsProjectId` state + `clearSyncResults` action. Rewrote `syncProject` body to track per-step results, inspect `distribute_*` per-item errors, and persist results to store on partial failure. |
| `src/pages/ProjectsPage.tsx` | Subscribe `syncStepResults` + `syncResultsProjectId` + `clearSyncResults`. Render an error banner with per-step checklist + "Clear & Retry" + "Dismiss" buttons when any step failed. |
| 11 text-input sites | Import `isEnterCommit` + replace `e.key === 'Enter'` with `isEnterCommit(e)`. |

### R2-5 — 11 text-input replacement sites

| # | File | Original line | Context |
|---|---|---|---|
| 1 | `src/components/sidebar/CategoryInlineInput.tsx` | 47 | Category name input |
| 2 | `src/components/sidebar/TagInlineInput.tsx` | 43 | Tag name input |
| 3 | `src/components/mcps/McpListItem.tsx` | 324 | List-card inline tag input |
| 4 | `src/components/mcps/McpDetailPanel.tsx` | 271 | Detail-panel tag input |
| 5 | `src/components/common/ColorPicker.tsx` | 165 | Hex input (defensive) |
| 6 | `src/components/rules/RuleDetailPanel.tsx` | 198 | Tag input |
| 7 | `src/components/claude-md/ClaudeMdDetailPanel.tsx` | 204 | Tag input |
| 8 | `src/components/skills/SkillListItem.tsx` | 318 | List-card inline tag input |
| 9 | `src/components/skills/SkillDetailPanel.tsx` | 333 | Detail-panel tag input |
| 10 | `src/pages/McpServersPage.tsx` | 555 | Page-level inline tag input |
| 11 | `src/pages/SkillsPage.tsx` | 627 | Page-level inline tag input |

### Sites deliberately NOT changed (8 keyboard-activator handlers)

These use `e.key === 'Enter' || e.key === ' '` to activate `<button>` /
`<div role="button">` elements. IME composition cannot occur on a
button — there is no editable text receiving the keystroke — so the
guard would be cargo-cult. Excluded by design per the "don't gold-plate"
principle:

- `src/components/sidebar/SortableCategoryRow.tsx:187, 215`
- `src/components/sidebar/SortableTagPill.tsx:90`
- `src/components/marketplace/MarketplaceListItem.tsx:234`
- `src/components/mcps/McpItem.tsx:74, 232`
- `src/components/common/Toggle.tsx:44`
- `src/components/common/Checkbox.tsx:40`

The brief mentioned "19 处" (matching the raw grep count); 11 are real
text-input commits, 8 are button-role activators with no IME hazard.

## Line-by-line rationale

### `src/utils/keyboard.ts`

```ts
export function isEnterCommit(e: React.KeyboardEvent | KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false;
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  if ((native as KeyboardEvent).isComposing) return false;
  if ((native as KeyboardEvent).keyCode === 229) return false;
  return true;
}
```

Reason: dual signature (React event in JSX handlers, native event in
case anyone wires it through a raw DOM listener). Two-property
detection covers all browsers — `isComposing` is the modern path
([MDN reference](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/isComposing));
`keyCode === 229` is the legacy / Safari edge case where the
synthetic Enter during composition still arrives without `isComposing`
set.

### `src/stores/projectsStore.ts`

- New `SyncStepResult` interface — exported so future tests and
  downstream consumers can type-narrow on `step` / `ok`.
- Added `syncStepResults` + `syncResultsProjectId` state (target which
  project's results we're holding so the banner can name it).
- Added `clearSyncResults()` action.
- Rewrote `syncProject`:
  - Step 1 (`sync_project_config`) — wraps in inner try/catch, pushes
    result, rethrows with named-step error message.
  - Step 2 (`distribute_scene_claude_md`) — same pattern but ALSO
    inspects the returned `Vec<ClaudeMdDistributionResult>` for items
    with `success === false`. Backend convention is "Ok with per-item
    errors"; missing this check is the exact behavior R1 F5 flagged.
    Summarizes failures into one error string.
  - Step 3 (`distribute_scene_rules`) — mirror of Step 2 for Rules.
  - Step 4 (`update_project lastSynced`) — wraps in try/catch; if it
    fails, lastSynced does NOT get updated in store either (matches
    A7's observation that the project was previously left in a
    half-synced state with stale lastSynced).
  - Success path: clears `syncStepResults` to null so the banner does
    not linger after a clean retry.
  - Failure path: stores the partial `stepResults` + `syncResultsProjectId`
    + sets `error`. Rethrows so existing toast consumers and
    `handleSceneChange` catch blocks still see the error.

Two cosmetic safety lines in the catch-rethrow inside Steps 2 and 3:

```ts
if (
  stepResults.length === 0 ||
  stepResults[stepResults.length - 1]?.step !== 'CLAUDE.md distribute'
) {
  stepResults.push({ step: 'CLAUDE.md distribute', ok: false, error: String(e) });
}
```

This guards against double-push when the inner per-item check has
already added the step before throwing. Without it the banner would
show "CLAUDE.md distribute ✗" twice.

### `src/pages/ProjectsPage.tsx`

- Subscribed `syncStepResults` + `syncResultsProjectId` + `clearSyncResults`.
- Derived `failedSteps` (via `useMemo`) and `showSyncBanner` (boolean).
- Derived `syncBannerProject` so the banner can name the affected project.
- Added `handleClearAndRetry()` — invokes `clearProjectConfig`, then
  `clearSyncResults`. Does NOT auto-retry the sync; the user should
  inspect state and decide.
- Inserted the banner JSX at the top of the main content area, just
  inside the scrollable container so it scrolls with the project list.
- Banner uses `var(--color-error)` / `var(--color-error-bg)` design
  tokens — same pattern as `MainLayout` global error banner (round 1
  fix A10). No new inline hex colors.
- Per-step rows use ✓/✗ glyphs (simple Unicode, no new icon
  imports). Body text uses Tailwind `text-[12px]` / `text-[13px]`
  which are documented sizes in `design-language.md`.

## Regression analysis — 6 adjacent functions verified

1. **`syncProject` callers** — only `ProjectsPage.handleSceneChange`
   (already catches errors) and `ProjectsPage` "Sync" button (passes
   thrown error up the React event system). Both still see the
   thrown `Error`; behavior is unchanged for the simple-failure case.
   New banner is purely additive.

2. **`distribute_scene_claude_md` / `distribute_scene_rules`** — backend
   signatures unchanged. The IPC still returns `Vec<…Result>` Ok-wrapped;
   we just now READ that vec for `success: false` items.

3. **`update_project`** — invoked the same way; only added an inner
   try/catch so a failure at step 4 doesn't silently let lastSynced
   leak.

4. **`clearProjectConfig`** — unchanged. The banner's "Clear & Retry"
   simply re-uses the existing IPC.

5. **`appStore.error` global banner** (round 1 A10) — independent
   consumer; both banners can coexist. `syncProject` still sets
   `projectsStore.error` (not appStore.error), so the new banner is the
   primary surface; the global error banner remains for sidebar/category
   failures.

6. **All 11 IME-guarded inputs** — the guard is a STRICT subset of the
   prior condition. `isEnterCommit(e) === (e.key === 'Enter' && !isComposing && keyCode !== 229)`.
   For non-IME users (English, numeric), all three negatives are
   already true, so behavior is byte-identical.

## Self-check (6 questions)

1. **Touched outside finding scope?** No. Helper file is new; banner
   lives only in `ProjectsPage.tsx`; all 11 IME-replacement sites
   match the brief's finding.
2. **Same bug elsewhere?** Verified by grep — 19 total `e.key === 'Enter'`
   sites. 8 are button-role activators where IME doesn't apply and
   the guard would be noise. The other 11 are all in scope.
3. **New deps?** No npm deps. One new utility file
   (`src/utils/keyboard.ts`, ~12 LoC) + one test file. Both trivial.
4. **Touched round-1 commits?** No. round-1 commits b2e5729..e61554e
   untouched. The `projectsStore.syncProject` body had no round-1 fix
   in it (round 1 was charterd to other agents).
5. **Existing tests broken?** No. 289 vitest tests pass (was 283;
   delta +6 from my keyboard.test). 196 cargo tests pass.
6. **IPC signature change?** No. All four IPCs (`sync_project_config`,
   `distribute_scene_claude_md`, `distribute_scene_rules`,
   `update_project`) untouched. Only the frontend store consumes their
   pre-existing return shapes more thoroughly.

## Gate check results

- `cd src-tauri && cargo build` → 0 errors, 1 pre-existing dead_code warning in `marketplace.rs`
- `cd src-tauri && cargo test --lib` → 196 passed; 0 failed; 7 ignored
- `npx tsc --noEmit` → 0 errors in MY files. 1 unrelated error in `ImportMcpModal.tsx` from another in-flight agent (G2's R2-6 work-in-progress, NOT in my scope)
- `npx eslint src/` → 0 errors, 21 warnings (all pre-existing; none introduced by my changes)
- `npx vitest run` → 23 test files, 289 tests passed (was 283; +6 from `keyboard.test.ts`)

## User-observable success contracts (re-stated for verification)

### R2-3

- **User does X**: Sync a project pointed at a folder where
  `.claude/CLAUDE.md` is read-only (or any path causing distribute to
  fail). Scene contains 1+ CLAUDE.md.
- **User sees Y**: Banner appears at top of `/projects` page (red,
  using design-language tokens) titled "Sync did not complete for
  \"<Project Name>\"". Below: a checklist —
  - ✓ Skills + MCP config
  - ✗ CLAUDE.md distribute — 1 file(s) failed: <native error string>

  Plus two buttons: "Clear & Retry" (runs `clearProjectConfig`) and
  "Dismiss" (hides banner).
- **User does NOT see**: A bare unstructured red toast saying only
  "Failed to ...". lastSynced silently set to "now" while disk is
  half-synced. The need to dig through console logs to learn which step
  failed.

### R2-5

- **User does X**: Open sidebar "Add Category", switch to Pinyin IME,
  type "fenlei", press Enter to confirm the Chinese candidate "分类".
- **User sees Y**: Candidate becomes "分类"; the input stays open with
  the value populated. Pressing Enter a second time (after composition
  ended) commits, creating a category named "分类".
- **User does NOT see**: The input snaps shut and a category named
  literally "fenlei" appears on the first Enter press.

## Manual verification steps (for the lead Agent)

1. Build dev: `npm run tauri dev`.
2. **R2-5 verification**:
   - Sidebar → "+" → "Add Category".
   - macOS Cmd+Space → switch to "Pinyin - Simplified".
   - Type "fenlei", press Enter to confirm "分类".
   - Expect: input still open with "分类" inside, no category created.
   - Press Enter again. Expect: category "分类" created.
3. **R2-3 verification**:
   - Create a project pointed at any folder.
   - In the project root: `chmod -R 555 .claude` (or remove write
     permission on `.claude/CLAUDE.md` if it exists).
   - Assign a Scene that includes CLAUDE.md.
   - Click "Sync".
   - Expect: banner appears at top of `/projects` listing each step's
     outcome. Step 1 ✓, step 2 ✗ with the read-only error.
   - Click "Dismiss" → banner disappears.
   - Click "Sync" again → banner reappears (state was re-populated).
   - `chmod -R 755 .claude` and re-sync → banner does NOT re-appear
     (clean run cleared `syncStepResults`).
