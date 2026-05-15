# F4a Implementation Plan — Data-Integrity Cascade + Clear Path

Scope: P1-2 (A6 in 02 risk map / R1::A4 / R3::F2) + P1-5 (A8 in spec / R3::C6).
Files: `src-tauri/src/commands/data.rs` · `src-tauri/src/commands/rules.rs` · `src-tauri/src/commands/claude_md.rs` · `src/stores/rulesStore.ts` · `src/stores/claudeMdStore.ts`.

## Pre-flight grep verification (per `grep-before-enumerate-shared-resource.md`)

Two shared-resource invariants are being extended:

1. **"delete a Category/Tag must cascade to every entity that references its id"** — currently held by `delete_category` and `delete_tag`. Verified callsites of cascade pattern within the two functions:

   ```
   rg -n 'iter_mut\(\)|values_mut\(\)' src-tauri/src/commands/data.rs
   ```

   In `delete_category` (lines 628-697): cascades to `data.categories` (parent_id promote) + `data.skill_metadata` + `data.mcp_metadata` + `data.claude_md_files`. **Missing**: `data.rules`. Zero hits on `data.rules` inside the function body — confirmed by grep `rules` in lines 599-701 (none).

   In `delete_tag` (lines 938-972): cascades to `data.skill_metadata.tags` + `data.mcp_metadata.tags` + `data.claude_md_files.tag_ids`. **Missing**: `data.rules.tag_ids`. Zero hits on `data.rules` inside lines 938-972.

2. **"update_X with `category_id: None` should mean 'leave it alone', not 'set to None'"** — the three-state `Option<Option<String>>` convention is held by:
   - `update_skill_metadata` (skills.rs:113)
   - `update_mcp_metadata` (mcps.rs:122)
   - `update_category` (data.rs `parent_id`)
   - `set_category_parent` (data.rs deliberate two-state — semantics differ; that command always modifies)

   The two **inconsistent** sites are `update_rule` (rules.rs:494) and `update_claude_md` (claude_md.rs:511), both still on `Option<String>`. No other update_* command needs adjustment.

3. **`TrashedRule` cascade?** — Read types.rs:1302-1310. `TrashedRule` has only `id, name, filename, path, deleted_at, description`. No `category_id` or `tag_ids` field — trashed rules do NOT need cascade.

## Fix 1 — A6: `delete_category` / `delete_tag` cascade Rules

**`data.rs::delete_category`** (line 599): after the existing `for file in data.claude_md_files.iter_mut()` block (line 693-697), append:

```rust
for rule in data.rules.iter_mut() {
    if rule.category_id.as_deref() == Some(&id) {
        rule.category_id = None;
    }
}
```

**`data.rs::delete_tag`** (line 938): after `for file in data.claude_md_files.iter_mut() { file.tag_ids.retain(...) }` (line 966-968), append:

```rust
for rule in data.rules.iter_mut() {
    rule.tag_ids.retain(|t| t != &id);
}
```

The existing function preconditions (`DATA_MUTEX` guard, `read_app_data` / `write_app_data` flow) carry the cascade. No signature change, no new IPC. Pattern is byte-identical to the `claude_md_files` cascade already in place.

## Fix 2 — A8: tri-state `categoryId` on `update_rule` / `update_claude_md`

### Backend (Rust)

**`rules.rs::update_rule`** (line 489):
- Add `#[allow(non_snake_case)]` attribute (already required when introducing a camelCase param)
- Rename `category_id: Option<String>` → `categoryId: Option<Option<String>>`
- Replace mutation `if let Some(cid) = category_id { rule.category_id = Some(cid); }` → `if let Some(new_category_id_opt) = categoryId { rule.category_id = new_category_id_opt; }`

**`claude_md.rs::update_claude_md`** (line 506):
- Same three changes as above. Function attribute already has none; add `#[allow(non_snake_case)]`.

Tauri auto-camelCases the JS payload key, so the param **name** on the Rust side is what the front end sees. The skills/mcps precedent (`#[allow(non_snake_case)] categoryId: Option<Option<String>>`) is what we mirror.

### Frontend (TypeScript)

The store-level callsites currently spread `categoryId: updates.categoryId` unconditionally. After the backend change:
- If `'categoryId' in updates`, send the key with value `updates.categoryId ?? null` (null clears, string sets).
- If `'categoryId' in updates` is `false`, omit the key entirely (no-op).

This matches `skillsStore.updateSkillCategory` (line 208): `categoryId: newCategoryId === undefined ? null : newCategoryId` — that helper only runs in the "user wants to change category" path, so it always sends the key. The `update_rule` store wrapper handles a `Partial<Rule>` payload from arbitrary callers, so it needs the `in` check.

**`rulesStore.ts::updateRule`** (line 243-277): replace the safeInvoke call with explicit conditional payload construction so unused keys are omitted.

**`claudeMdStore.ts::updateFile`** (line 242-274): same pattern.

The other `safeInvoke('update_rule', ...)` / `safeInvoke('update_claude_md', ...)` sites in each store are the auto-classify loops (rulesStore:477, claudeMdStore:500) — they pass `categoryId: categoryId` where `categoryId` is `string | undefined`. Under the new backend, `undefined` would translate to outer `None` (omitted key) which matches the existing intent: "if no category was suggested, don't change it". The current behavior here happens to be correct under either convention — but we should still normalize to `categoryId === undefined ? null : categoryId` to make "no category suggested means clear" the explicit semantic. **Decision**: leave auto-classify untouched — its current "if undefined, don't set" was the prior intent and the user is not asking us to change auto-classify semantics. Only the user-driven detail-panel path needs the clear capability.

### TypeScript type stability

`Rule.categoryId?: string` and `ClaudeMdFile.categoryId?: string` stay as-is. The wire change is purely in the **update payload**, not in the entity shape.

## Affected callers — verified non-regression

For both `update_rule` and `update_claude_md`:

- **DetailPanel.handleCategoryChange** — passes `{ categoryId: categoryId || undefined }` with `'categoryId' in updates === true`. After fix: backend gets `Some(None)` when `categoryId === ''` → clears. ✓
- **Tag handlers** (handleAddTag / handleRemoveTag) — pass `{ tagIds: [...] }` only. `'categoryId' in updates === false` → backend gets outer `None` (key omitted) → leaves alone. ✓
- **IconPicker callers** (RulesPage:323, ClaudeMdPage:378) — pass `{ icon: iconName }` only. Same as tag handler. ✓
- **Auto-classify loops** (rulesStore:477, claudeMdStore:500) — bypass `updateRule`/`updateFile`, call `safeInvoke` directly. Current `categoryId: undefined` → serialized as `null` or omitted? JSON.stringify omits `undefined`-valued keys, so it serializes as if the key isn't there → backend outer `None` → no-op. Same as today. ✓

## User-observable success criteria

**A6 — Rule cascade on category/tag delete**
- User does X: Create a Category "AI". Assign Rule R1 to "AI". Open sidebar context menu → Delete Category "AI".
- User sees Y: R1 moves to Uncategorized list. R1's detail-panel category dropdown reads "Uncategorized".
- User does NOT see: R1 displaying a stale "AI" pill that links nowhere; R1 invisible from every Category page.

**A6 — Rule cascade on tag delete**
- User does X: Create Tag "linting". Tag Rule R2 with "linting". Delete Tag "linting".
- User sees Y: R2 no longer shows the "linting" pill in either list view or detail.
- User does NOT see: R2 retaining a broken pill.

**A8 — categoryId clear in Rule detail panel**
- User does X: Rule R3 currently has Category "Frontend". In R3's detail-panel category dropdown, pick the empty/Uncategorized option.
- User sees Y: R3 immediately moves to Uncategorized. After reload (Cmd-R) R3 is still Uncategorized.
- User does NOT see: R3's category snap back to "Frontend" on reload.

**A8 — categoryId clear in CLAUDE.md detail panel**: same shape with CLAUDE.md file in place of Rule.

## Self-check (5 questions per charter §5)

1. **Does the modification touch code outside the finding description?** No. data.rs cascade additions are 4-line blocks within existing functions; rules.rs / claude_md.rs changes are confined to one parameter and one mutation block each; frontend changes are in two store action bodies.
2. **Same problem elsewhere not addressed?** `reset_auto_classify_data` (data.rs:991-1015) also touches Rules conceptually — but it's out of scope (no spec from the audit said to fix it, and it's a distinct UX surface with a different flow). Documented but NOT touched.
3. **New deps / files / IPCs?** None. No new files (only `_plan.md` and `_log.md` per charter). No new dependencies. No new IPCs — both update commands keep their existing names.
4. **Modify IPC signature?** Yes — `update_rule` and `update_claude_md` change `category_id: Option<String>` → `categoryId: Option<Option<String>>`. Frontend store callers updated to match. No other Rust callers exist (verified via grep).
5. **Break existing unit tests?** `delete_category_cascade_tests` (data.rs:2535-) covers categories + skills + mcps + claude_md but not rules. The cascade addition does not change any existing assertion, so they continue to pass. No existing test covers `update_rule.category_id` clear semantics, so the changed signature only requires the test file's helper invocations (if any) to match. Will verify with `cargo test --lib` in gate phase.

## Risk summary

- **Conservative**: Cascade additions follow the byte-identical pattern adjacent to them. Tri-state migration follows the `update_skill_metadata` / `update_mcp_metadata` precedent verbatim.
- **No new attack surface, no migration step required.** Rule.category_id field type is unchanged.
- **Caller-side compatibility**: A frontend caller that *did not* pass `categoryId` previously continues to work — `JSON.stringify` omits `undefined` keys, backend sees outer `None`, no-op. A caller that *did* pass `undefined` to mean "clear" (currently broken) now correctly clears. No caller passed a literal `null` previously (TS type is `string | undefined`).
- F1's atomic-write refactor of `write_app_data` is upstream; our cascade additions ride on the same write call. No interaction.
