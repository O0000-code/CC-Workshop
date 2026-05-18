# Data Dir Rename Must Rewrite Path-String Identifiers Together

Whenever CC Workshop's data directory is moved, renamed, or relocated (e.g. `~/.ensemble/` → `~/.cc-workshop/`, or any future relocation), the migration MUST do two coupled transformations as one logical operation. A filesystem-move-only migration silently destroys user data.

## When This Applies

- Renaming `~/.ensemble/` / `~/.cc-workshop/` to anything else
- Moving the data directory across volumes
- Any code path that produces a new absolute path for a Skill / MCP source directory
- Any tool that bulk-rewrites file system layout under `get_app_data_dir()`

## The Rule

The project encodes `Skill::id == source_path == absolute_path_string` as a hard invariant (`types.rs:7-15`, `:68-72`). The same absolute path is also:

- The HashMap key in `AppData::skill_metadata` / `mcp_metadata` (`types.rs:250-251`)
- Stored verbatim in every `Scene.skill_ids` / `Scene.mcp_ids` (`types.rs:153-154`)
- Stored as `source_path` in `claudeMdFiles[]` and `rules[]`
- Stored as default in `settings.json::skillSourceDir` / `mcpSourceDir` (`types.rs:482-483`)

A directory rename that only moves files but does NOT rewrite these strings produces silent catastrophic failure:

1. `scan_skills` discovers the moved files under the new path
2. The new path is not in `skillMetadata` → user's category, tags, enabled state, icon all reset to defaults
3. Every Scene's `skill_ids` references the old path → `find()` lookup misses → silently filtered at sync time per the "Orphan id 静默忽略" gotcha in CLAUDE.md
4. User reports "all my Scenes are broken" without any error to debug

Any rename MUST therefore:

1. Atomically move the directory tree (or `cp -RP` + `rm -rf` cross-volume — preserve symlinks for plugin entries)
2. Rewrite every absolute-path string starting with the legacy prefix inside `data.json`, recursing through HashMap keys + array values + nested objects
3. Rewrite `settings.json` default `skillSourceDir` / `mcpSourceDir` if they match the legacy form (preserve custom values)
4. Write a pre-rewrite safety copy (`data.json.pre-migration.bak`) before mutating

Reference implementation: `src-tauri/src/utils/migration.rs::migrate_legacy_data_dir`. The `rewrite_json_paths` helper covers HashMap keys explicitly via `std::mem::take` + rebuild (serde_json's `Map` keys are not in-place mutable).

## Why

In v2.3.0 we renamed `~/.ensemble/` → `~/.cc-workshop/`. If the migration had only moved files, 21 Skills, 33 MCPs, 4 Scenes, 5 Rules, and 3 CLAUDE.md entries would have appeared intact on disk but every category/tag/icon would have reset and every Scene would have silently dropped its references. The user would have seen "data still there" but every Scene would deploy nothing.

This is the canonical failure mode of "rename a directory" tasks in projects that use absolute file paths as identifiers. A SubAgent specifically called this out during the v2.3.0 design phase, otherwise the main-line implementation would have shipped the broken file-move-only version.

The same risk applies to any future rename: do NOT trust "fs::rename is enough". Always rewrite the path-string identifiers in `data.json` and `settings.json` as part of the same operation, with idempotency + pre-migration backup.

## Anti-Patterns

- `fs::rename(legacy_dir, new_dir)` followed by relying on the next `scan_skills` to "rediscover" — discovers under the new path as brand-new entries, orphans all metadata
- Updating only `Skill::source_path` values without touching the `skillMetadata` HashMap keys — the keys (which double as IDs) still reference the legacy path
- Updating `data.json` strings only via the strongly-typed `AppData` deserialisation — silently misses any path field added later that the rename code didn't know about. Use `serde_json::Value` recursive walk instead (path-prefix-anchored substring replace) so unknown future fields are covered automatically
- Cross-volume fallback with `cp -RL` — dereferences plugin symlinks into `~/.claude/plugins/cache/`, breaking the "delete plugin → entry vanishes" lifecycle and inflating disk usage. Always `cp -RP` for this directory tree

## Verification

The migration unit tests in `migration.rs::tests` cover all required behavior. Any future rename PR MUST add equivalent tests:

- `test_data_json_keys_rewritten` — HashMap keys + Scene arrays both transformed
- `test_plugin_symlinks_preserved` — `fs::symlink_metadata().is_symlink()` still true on the moved entries
- `test_settings_default_paths_rewritten` — defaults updated, custom values preserved
- `test_idempotent` — second run is `Skipped`, not a re-move
- `test_conflict_with_real_data_returns_conflict` — both dirs populated → never merge
