# F4a Implementation Log — Data-Integrity Cascade + Clear Path

Status: complete. Both findings (A6, A8) implemented. All gates pass.

## File-by-file change summary

| File | Lines added/changed | Why |
|---|---|---|
| `src-tauri/src/commands/data.rs` | +12 (cascade) | A6: cascade Rules in `delete_category` and `delete_tag` |
| `src-tauri/src/commands/rules.rs` | ~22 (param + doc) | A8: `category_id: Option<String>` → `categoryId: Option<Option<String>>` |
| `src-tauri/src/commands/claude_md.rs` | ~14 (param + doc) | A8: same upgrade for `update_claude_md` |
| `src/stores/rulesStore.ts` | ~16 (conditional payload) | A8: tri-state payload construction in `updateRule` |
| `src/stores/claudeMdStore.ts` | ~14 (conditional payload) | A8: tri-state payload construction in `updateFile` |

No new files (per charter). No new IPCs, no new dependencies.

## A6 — Cascade Rules on category / tag deletion

### What changed

In `data.rs::delete_category` (line 599-714), after the existing cascades on `data.skill_metadata`, `data.mcp_metadata`, and `data.claude_md_files`, added:

```rust
for rule in data.rules.iter_mut() {
    if rule.category_id.as_deref() == Some(&id) {
        rule.category_id = None;
    }
}
```

In `data.rs::delete_tag` (line 938-991), after the existing cascades on the same three collections (using `retain` on tags / tag_ids), added:

```rust
for rule in data.rules.iter_mut() {
    rule.tag_ids.retain(|t| t != &id);
}
```

Both blocks are byte-identical in structure to the `claude_md_files` cascade immediately above them.

### Why this exact pattern

`Rule.category_id` is `Option<String>` (verified types.rs:1114-1115). `Rule.tag_ids` is `Vec<String>` (verified types.rs:1118-1119). `TrashedRule` (types.rs:1302-1310) carries only `id, name, filename, path, deleted_at, description` — no `category_id` or `tag_ids` field, so no cascade into the trash collection is needed.

### Impact analysis

- **Pure addition** — no existing assertion changes meaning. The cascade-promote logic earlier in `delete_category` (parent_id rewriting, name disambiguation) is untouched.
- `reset_auto_classify_data` (data.rs:991-1015) has a similar shape but is **not** in F4a scope. It currently does not touch `data.rules` either — a sister regression, but not asserted by the audit findings I'm given to fix.
- `update_category` parent renaming, reorder_categories, and similar commands don't reference `Rule.category_id` — they're independent paths.

## A8 — Tri-state `categoryId` on `update_rule` / `update_claude_md`

### Backend changes

`update_rule` (rules.rs:489) and `update_claude_md` (claude_md.rs:506):
- Added `#[allow(non_snake_case)]` attribute.
- Renamed parameter `category_id: Option<String>` → `categoryId: Option<Option<String>>`. (Other parameters stay snake_case; Tauri's auto-camelCase mapping handles the wire conversion identically either way, but the convention used by `update_skill_metadata` / `update_mcp_metadata` is to spell the camelCase parameter explicitly when its type does not match its name's snake_case form.)
- Replaced mutation `if let Some(cid) = category_id { rule/file.category_id = Some(cid); }` → `if let Some(new_category_id_opt) = categoryId { rule/file.category_id = new_category_id_opt; }`.

The pattern is the verbatim mirror of `update_skill_metadata` (skills.rs:129-131) and `update_mcp_metadata` (mcps.rs:137-139).

### Frontend changes

`rulesStore.updateRule` (rulesStore.ts:243-285) and `claudeMdStore.updateFile` (claudeMdStore.ts:242-282) now construct the IPC payload conditionally based on `'key' in updates`:

- If a key is present, it's included (with `categoryId: undefined` normalised to `null` so JSON.stringify emits the explicit clear-signal).
- If a key is absent, it's omitted entirely → backend receives outer `None` → no-op.

This is necessary because `JSON.stringify` drops keys with `undefined` values, which would collapse "clear category" into "do not modify" — exactly the bug the spec describes.

### Why no auto-classify path changed

Both stores have a second `safeInvoke('update_*', { ... })` call inside the auto-classify loop (rulesStore.ts:485-491, claudeMdStore.ts:508-514). These bypass the store action and call IPC directly with `categoryId: categoryIdByName.get(name)` which is either a string (set) or `undefined` (omitted by stringify → no-op).

This is **identical semantics under the new backend**: the old `Option<String>` backend with `cid` present set the field, and a missing payload key left the field untouched. The new `Option<Option<String>>` backend with a string value sets the field via `Some(Some(id))`, and a missing key leaves it untouched via outer `None`. Same observable behaviour.

The skillsStore auto-classify path (skillsStore.ts:432-443) explicitly uses `categoryIdByName.get(...) ?? null` so an unmatched suggestion clears the existing category. The rules/claude_md auto-classify paths do not currently do this — they treat unmatched suggestions as "no change". Bringing those into alignment is out of scope for F4a (it would change pre-existing classify behaviour without an audit finding that prescribes it).

## Self-check (5 questions per charter §5)

1. **Code outside finding description?** No. data.rs +12 lines confined to the two cascade tails. rules.rs / claude_md.rs changes confined to one parameter and one mutation block each. Frontend changes confined to two store action bodies.
2. **Same problem elsewhere not addressed?** `reset_auto_classify_data` does not cascade Rules — noted but explicitly out of audit scope (no finding mandates it).
3. **New deps / files / IPCs?** None.
4. **Modify IPC signature?** `update_rule` and `update_claude_md` change `category_id` to `categoryId: Option<Option<String>>`. Frontend store callers updated; the only other JS callers are the auto-classify paths which work identically under either convention.
5. **Break existing unit tests?** No. Cargo test --lib: 185 passed, 0 failed. Vitest: 283 passed, 0 failed.

## Affected callers — non-regression check

Verified each direct caller of the changed IPCs:

| Caller | What it sends | Old behaviour | New behaviour |
|---|---|---|---|
| `RuleDetailPanel.handleCategoryChange` | `{ categoryId: '' \|\| undefined }` → `{ categoryId: undefined }` | undefined → stringified key dropped → backend `Option<String> = None` → **bug: no change** | now sent as `null` by `updateRule` → backend `Some(None)` → **clears** ✓ |
| `RuleDetailPanel.handleCategoryChange` (with id) | `{ categoryId: 'abc' }` | backend `Some(String)` → set | backend `Some(Some('abc'))` → set ✓ |
| `RuleDetailPanel.handleAddTag` / `handleRemoveTag` | `{ tagIds: [...] }` | no categoryId key → no-op | no categoryId key → outer `None` → no-op ✓ |
| `RulesPage` icon picker | `{ icon }` | no categoryId key → no-op | no categoryId key → outer `None` → no-op ✓ |
| `rulesStore` auto-classify | `{ categoryId: string \| undefined, tagIds, icon }` | string sets / undefined drops key → no-op | string → `Some(Some(id))` set / undefined drops key → outer `None` → no-op ✓ |
| `ClaudeMdDetailPanel.*` | same shape as Rule equivalents | same regression as Rules | now correctly clears with `null` ✓ |
| `claudeMdStore` auto-classify | same shape | same | same ✓ |

## Gates

| Gate | Result |
|---|---|
| `cargo build` | ✓ pass (1 pre-existing unrelated dead-code warning) |
| `cargo test --lib` | ✓ 185 passed, 0 failed, 7 ignored |
| `npx tsc --noEmit` | ✓ no errors |
| `npx eslint src/` | ✓ no errors (17 pre-existing warnings, none in changed files) |
| `npm test` (vitest) | ✓ 283 passed, 0 failed |

## Manual verification steps for lead agent

### A6 — cascade Rules on delete_category

1. Settings → Categories → New Category "Audit-A6-Test".
2. Rules page → click any rule's detail panel → set Category to "Audit-A6-Test".
3. Confirm: rule now appears under "Audit-A6-Test" in sidebar.
4. Right-click "Audit-A6-Test" in sidebar → Delete.
5. **Expected**: rule moves to Uncategorized (visible under "All Rules" with no category pill).
6. **Confirm**: rule's detail panel category dropdown reads empty (Uncategorized).

### A6 — cascade Rules on delete_tag

1. Tags → New Tag "linting".
2. Open any rule's detail panel → add tag "linting".
3. Confirm "linting" pill appears on the rule row.
4. Delete tag "linting".
5. **Expected**: rule no longer carries the pill in list or detail view.

### A8 — categoryId clear on Rule

1. Open a rule that has a category assigned (e.g. "Frontend").
2. In the rule's detail panel, open the category dropdown and pick the empty / Uncategorized option (currently shows `categoryId || undefined` → falsy in the handler).
3. **Expected**: the category dropdown immediately shows empty, the rule disappears from the "Frontend" category in sidebar.
4. **Confirm persistence**: hit Cmd-R (reload), the rule is still Uncategorized; backend has cleared `data.rules[i].category_id` in `data.json`.

### A8 — categoryId clear on CLAUDE.md

Same flow with a managed CLAUDE.md file in `ClaudeMdDetailPanel`.

## Cross-fix interaction with F1

F1 (already shipped) atomicises `write_app_data` with tmp + fsync + rename and adds a `data.json.bak` rolling backup. F4a's cascade writes happen inside the existing `delete_category` / `delete_tag` flow, which already calls `write_app_data` once per IPC under `DATA_MUTEX`. F4a does not add any extra writes — it expands the in-memory mutation set before the single write. The cascade additions are therefore covered by F1's durability guarantees without any new interaction surface.
