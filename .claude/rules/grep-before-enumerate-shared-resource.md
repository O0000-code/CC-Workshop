# Grep Before Enumerating Shared-Resource Constraints

When planning a constraint that must be applied to every access point of a shared resource — a global lock for every read-modify-write of a data file, input validation at every entry point, an audit log on every state mutation — the planning step must begin with a grep (or ripgrep, or equivalent) over the actual access API to enumerate every callsite. The list of callsites that ends up in the plan must come from that grep, not from the planner's mental model of "the file with the data functions in it".

## Why

Mental models of shared-resource access are file-shaped: the planner pictures `data.rs` and lists the mutating functions in `data.rs`. Real code is graph-shaped: `claude_md.rs` and `trash.rs` also import `read_app_data` and `write_app_data` and mutate the same JSON file. Whatever module-boundary discipline once existed has eroded over time, and only a grep-based enumeration sees through it.

In this project, V3 of `03_tech_plan.md` listed the `DATA_MUTEX` coverage by walking through the mutating functions inside `commands/data.rs`. That coverage missed `commands/claude_md.rs` (`import_claude_md`, `update_claude_md`, `delete_claude_md`, `set_global_claude_md`, `unset_global_claude_md`, `migrate_claude_md_storage`) and `commands/trash.rs` (`restore_claude_md`), all of which `read_app_data` → mutate → `write_app_data` against the same `data.json`. Concurrent reorder + import would have produced lost updates. The code reviewer caught it before merge — but the *plan* had already shipped with the gap, and the only reason the gap got closed was that the reviewer happened to grep. Had the reviewer trusted the plan's enumeration, the bug would have reached production.

The fix that mattered was not just adding the missed locks — it was changing how the coverage was enumerated next time.

## How to Apply

**Trigger** — your plan contains any of these phrases:
- "Apply to every X"
- "All Y must Z"
- "Wrap every callsite of W"
- "Audit all paths that mutate V"
- "Add validation at every entry point of U"

**Required action before writing the plan**:

1. Identify the shared-resource API by name (the function, type, table, or endpoint that defines "access" to the resource). For this project: `read_app_data` and `write_app_data`.
2. Run grep across the entire codebase for that API name (not for the file path, not for the callsite shape). Example:
   ```
   rg -n 'write_app_data|read_app_data' src-tauri/
   ```
3. **Add a defense-in-depth second grep** for callsites that bypass the canonical API entirely (raw file read/write, direct field mutation, etc.). Single-grep on the canonical API misses helpers that reach for `fs::read_to_string` + `fs::write` against the same data file. Example for this project:
   ```
   rg -n 'data_path|app_data\.\w+_metadata|fs::write.*data\.json' src-tauri/
   ```
   Discovered in T1f (Phase 1 of category-hierarchy task): the Phase 1 audit single-grep on `read_app_data|write_app_data` missed 4 mutators (`delete_skill` / `delete_mcp` metadata tails + `update_skill_scope_in_metadata` / `update_mcp_scope_in_metadata` in `import.rs`) because they bypass the canonical helpers.
4. Treat the union of both grep outputs as the authoritative set. Every line is a callsite that the plan must explicitly account for — included or explicitly excluded with reason.
5. Re-run the greps at plan completion to confirm no new callsites have been introduced during planning.

**Verification step in the plan itself**: include the grep command and its output (or a description of the count) in the plan as evidence. A reviewer should be able to re-run the grep and confirm coverage matches.

**For the SubAgent doing the implementation**: the implementing SubAgent should also re-run the grep before applying the constraint, as a defense-in-depth check.

## When This Does Not Apply

Constraints scoped to a single file or a single module by design (e.g. a private invariant inside one struct) do not need the grep gate. The trigger is constraints whose stated scope is *every* callsite of a shared resource.

This rule is methodologically sibling to `hard-constraints-before-soft-evaluation.md` (in `~/.claude/rules/`): both are "do step N before step N+1 to avoid silent omission". They apply to different phases — hard-constraint ordering during evaluation, grep-before-enumerate during planning.
