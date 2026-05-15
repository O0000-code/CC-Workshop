# G4 Plan — R2-3 (sync step-level feedback) + R2-5 (IME composition guard)

## Scope

Two P1 fixes, both pure-frontend:

- **R2-3** (R1 A7 / R7 F7-3 / R1 F5): `syncProject` 4-step chain currently throws on first failure; UI only sees a generic toast. Frontend must (a) capture per-step success/failure, (b) read `result.errors` from `distribute_scene_claude_md` / `distribute_scene_rules` (per-item Vec), (c) surface a structured banner in `ProjectsPage` listing which step failed.
- **R2-5** (R7 F7-7): Add `isComposing` / `keyCode === 229` guard to **11 text-input Enter handlers** so IME (CJK) candidate-select doesn't fire commit.

## Backend signatures (verified, NO changes)

- `sync_project_config` → `Result<(), String>` — Ok or Err
- `distribute_scene_claude_md` → `Result<Vec<ClaudeMdDistributionResult>, String>` — Ok always; per-item `{ success, error? }`
- `distribute_scene_rules` → `Result<Vec<RuleDistributionResult>, String>` — Ok always; per-item `{ success, error? }`
- `update_project` → `Result<(), String>`

Backend file refs:
- `src-tauri/src/commands/config.rs:200-206`
- `src-tauri/src/commands/claude_md.rs:909-939`
- `src-tauri/src/commands/rules.rs:880-908`
- TS types: `src/types/claudeMd.ts:173`, `src/types/rule.ts:156`

## Files to change

### R2-3 — Frontend sync feedback

| File | Lines | Change |
|---|---|---|
| `src/stores/projectsStore.ts` | 22-57, 73, 193-269 | Add `SyncStepResult` type + `syncStepResults` state + `clearSyncResults` action. Rewrite `syncProject` body to: try each step inside its own try/catch, collect step results, check `distribute_*` per-item errors, throw with informative message naming the failed step. Always store `syncStepResults` on completion (success or partial). |
| `src/pages/ProjectsPage.tsx` | 64-83, after status line block | Subscribe `syncStepResults` + `clearSyncResults`. Render a banner (using `--color-error*` tokens) when any step failed, listing the failed step + error string, plus "Dismiss" + "Clear & Retry" buttons. |

### R2-5 — IME composition guard (11 sites)

Create new helper at `src/utils/keyboard.ts` exporting `isEnterCommit(e)`. Replace text-input Enter conditions with `isEnterCommit(e)` at:

| # | File | Line | Context |
|---|---|---|---|
| 1 | `src/components/sidebar/CategoryInlineInput.tsx` | 47 | category name input |
| 2 | `src/components/sidebar/TagInlineInput.tsx` | 43 | tag name input |
| 3 | `src/components/mcps/McpListItem.tsx` | 324 | tag input (list-card) |
| 4 | `src/components/mcps/McpDetailPanel.tsx` | 271 | tag input (detail panel) |
| 5 | `src/components/common/ColorPicker.tsx` | 165 | hex input |
| 6 | `src/components/rules/RuleDetailPanel.tsx` | 198 | tag input |
| 7 | `src/components/claude-md/ClaudeMdDetailPanel.tsx` | 204 | tag input |
| 8 | `src/components/skills/SkillListItem.tsx` | 318 | tag input |
| 9 | `src/components/skills/SkillDetailPanel.tsx` | 333 | tag input |
| 10 | `src/pages/McpServersPage.tsx` | 555 | inline tag input |
| 11 | `src/pages/SkillsPage.tsx` | 627 | inline tag input |

Add unit test at `src/utils/__tests__/keyboard.test.ts`.

### NOT in scope (button-role keyboard activators, 8 sites)

`Toggle.tsx`, `Checkbox.tsx`, `SortableCategoryRow.tsx` (x2), `SortableTagPill.tsx`, `MarketplaceListItem.tsx`, `McpItem.tsx` (x2) all use `e.key === 'Enter' || e.key === ' '` to trigger button activation on `<button>` / `<div role="button">` elements. IME composition cannot occur on these — IME only fires on text-input fields. Adding the guard here is cargo-cult and risks suppressing legitimate keyboard activation in non-IME edge cases. Excluded per principle "don't gold-plate".

## Helper API

```ts
// src/utils/keyboard.ts
export function isEnterCommit(e: React.KeyboardEvent | KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false;
  const native = 'nativeEvent' in e ? e.nativeEvent : e;
  if ((native as KeyboardEvent).isComposing) return false;
  if ((native as KeyboardEvent).keyCode === 229) return false;
  return true;
}
```

## User-observable success contract

### R2-3
- **User does X**: Project pointed at a folder where `.claude/CLAUDE.md` is read-only. Scene contains 1+ CLAUDE.md. User clicks Sync.
- **User sees Y**: Banner appears on `/projects` page: "Sync partially completed. Step 'Distribute CLAUDE.md files' failed: 1 file(s) failed: <err>". Steps that succeeded ("Skills + MCP config") are also enumerated. "Dismiss" closes the banner.
- **User does NOT see**: A bare red toast with stack-trace-y `Error: ...` and no indication of which step. lastSynced silently set to "now" while disk is half-synced.

### R2-5
- **User does X**: Sidebar "Add Category", switch to Pinyin IME, type "fenlei", press Enter to confirm Chinese candidate.
- **User sees Y**: Candidate becomes "分类"; input stays open. Pressing Enter a second time (outside composition) creates a category named "分类".
- **User does NOT see**: Input snaps shut and a category named "fenlei" appears immediately on the first Enter.

## Regression analysis

- Adding `syncStepResults` to store: pure additive, existing `syncProject` callers still see `error` and throw — only behavior delta is the banner is now showing more info.
- `update_project` is still called only on full success; partial-fail no longer touches lastSynced (which matches the A7 finding — "lastSynced not updated").
- IME guard: `e.key === 'Enter' && !isComposing` is a strict subset of `e.key === 'Enter'`. For non-IME users (English/numeric input), behavior is identical (no `isComposing`/229 ever fires).

## Gate checks (run after impl)

```
cd src-tauri && cargo build
cd src-tauri && cargo test --lib
npx tsc --noEmit
npx eslint src/
npx vitest run
```

## Self-check

- Scope-out files: none touched outside the listed 13.
- No same-bug-in-other-place: button-role Enter handlers explicitly excluded with reason.
- No new deps. New file `src/utils/keyboard.ts` (~12 LoC) + test (~30 LoC) — trivial.
- Round-1 commits untouched.
- No IPC signature change.
- Existing unit tests untouched.
