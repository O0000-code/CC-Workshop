# F3 Implementation Log — Security Layer

Status: complete. All 3 P0 findings (A2 / B4 / B5) implemented and gated.

## File-by-file change summary

| File | Lines changed | Reason |
|---|---|---|
| `src-tauri/src/commands/import.rs` | iTerm branch (~1455–1490) rewritten; Terminal branch (~1620–1645) rewritten | A2: switch to two-layer escape (`folder_launch_command` + `applescript_quote`) so the inner shell command is single-quoted before AppleScript wrapping. |
| `src-tauri/src/commands/marketplace.rs` | `derive_stdio_command` `_` arm (1328–1337) tightened to safe sentinel; `envelope_to_item` (1400–1409) gains registry-type allowlist gate; `install_marketplace_skill` (2902–2935) sanitizes owner / repo after derive. | B4 + B5: defense in depth at three boundary points. |

No frontend changes. No new files (only plan + log). No IPC signature changes.

## A2 — AppleScript injection (iTerm + Terminal.app)

### Diff (semantic)

Both terminal branches changed from:

```rust
let escaped_path = folder_path_str.replace('\\', "\\\\").replace('"', "\\\"");
let escaped_cmd = claude_command.replace('\\', "\\\\").replace('"', "\\\"");
let applescript = format!(r#"... "cd \"{}\" && {}""#, escaped_path, escaped_cmd);
```

to:

```rust
let inner = folder_launch_command(&folder_path_str, &claude_command);
let quoted = applescript_quote(&inner);
let applescript = format!(r#"... {}"#, quoted);
```

The old pattern escaped only AppleScript literal metacharacters (`\\` and `"`). After AppleScript decoded the literal, the inner string `cd "<path>" && <cmd>` was handed to zsh, where double-quoted strings still evaluate `$(...)`, backticks, and `${VAR}`. The new pattern shell-quotes the folder path via `shell_quote('...')` (POSIX single-quoting; metacharacters do not expand inside single quotes), then wraps the whole shell string once with `applescript_quote` for the AppleScript literal.

### Why `claude_command` is not shell-quoted

`claude_command` is user-configured at Settings (e.g. `claude --model opus`). Wrapping the whole multi-token string in single quotes would make zsh treat it as a single executable name, breaking the feature. This matches the existing Ghostty path (`folder_launch_command`, line 1265–1267) and is the documented trust boundary: folder paths come from the environment (Finder, cloned repos) and must be quoted; command strings come from Settings and flow through unmodified.

### Manual verification

- **X**: Create a folder named `Demo $(say "hacked")` (Finder allows `$`, `(`, `)`, `"`). Open project in Ensemble, click Open in iTerm.
- **Y**: iTerm opens. The command line shows `cd '/Users/.../Demo $(say "hacked")' && claude`.
- **NOT Z**: macOS does NOT say "hacked" via TTS. No background command executes.

Repeat with Open in Terminal — same expectation. Repeat with `Demo \`touch /tmp/owned\``, `${HOME}.cache`, `Demo \`rm /tmp/x\`` — none should execute the inner.

### Cascade verification (per grep-before-enumerate)

```
$ rg -n "escaped_path = folder_path_str" src-tauri/src/commands/import.rs
(no results)
$ rg -n "replace\('\\\\\\\\'.* \"\\\\\\\\\\\\\\\\\"" src-tauri/src/commands/import.rs
(no other broken-escape patterns)
```

Other terminal paths in the same function:

- Warp (`import.rs:1485+`): out of scope per R4 D2 (descoped to P2 — YAML escape issue, not shell injection).
- Alacritty (`import.rs:1568+`): uses `Command::new("alacritty").arg(...)` — args go directly to execve, no shell interpretation, safe.
- Ghostty (`import.rs:1583+`): already uses `folder_launch_command` + `applescript_quote` (correct pattern).

## B4 — install_marketplace_skill owner / repo sanitization

### Diff (semantic)

After `derive_install_triple(&item)` (which has no built-in validation), the raw owner/repo strings are now passed through `sanitize_resource_name` before reaching `install_skill_via_codeload`'s URL construction:

```rust
let (owner_raw, repo_raw, skill_path) = derive_install_triple(&item);
if owner_raw.is_empty() || repo_raw.is_empty() {
    return Ok(InstallOutcome::Failed { ... });
}
let owner = match sanitize_resource_name(&owner_raw) { ... };
let repo = match sanitize_resource_name(&repo_raw) { ... };
install_skill_via_codeload(&owner, &repo, ...).await
```

`sanitize_resource_name` rejects `..`, slashes, backslashes, non-ASCII, length > 64, leading `.`, and embedded NUL — exactly the alphabet that allows the codeload URL `https://codeload.github.com/{owner}/{repo}/tar.gz/HEAD` to be RFC 3986-normalized into a different path.

### Why skill_path is not also sanitized

`skill_path` legitimately contains `/` separators (e.g. `skills/azure-ai`). It is consumed downstream by `install_skill_via_codeload`, which already per-component sanitizes every path segment before extraction (`marketplace.rs:2710-2726`). Adding `sanitize_resource_name(&skill_path)` here would reject any nested skill path. The existing tar-extraction defense layer is the right place.

### Why finalize_skill_install was not also patched

`derive_install_triple` is called twice in this function and once in `finalize_skill_install`. The second call site (line 2969) only uses owner/repo to populate `MarketplaceSource` metadata fields written into `data.json`. These fields are not used to construct URLs (the metadata is for display only — "From GitHub" link). When `install_marketplace_skill` succeeds before reaching `finalize_skill_install`, the item has already been validated; when it fails (sanitize reject), `finalize_skill_install` is never reached. Adding sanitize there would be redundant and could surprise the metadata-display path. Minimum scope = sanitize only at the URL boundary.

### Manual verification

- **X**: Build a fake catalog item with `source: "anthropics/../evil-org", skill_id: "demo"`. Trigger install through the UI.
- **Y**: Install fails with `Could not install skill: Invalid repo segment: Resource name may not contain '..': ../evil-org` (or similar — depending on which segment carries the `..`).
- **NOT Z**: No HTTP request to `codeload.github.com` is made; no tarball is downloaded; no files written to `~/.ensemble/skills/`.

## B5 — derive_stdio_command unknown registryType

### Diff (semantic)

Two changes in one function family:

1. **`envelope_to_item` (line 1400–1409)** — registry-type allowlist gate added before `derive_stdio_command` is called:

   ```rust
   if !matches!(registry_type.as_str(), "npm" | "pypi" | "oci") {
       return None;
   }
   ```

   When an envelope's `registryType` is unknown, the envelope returns `None` and is filtered out of `MarketplaceMcpItem` ingestion entirely. The user never sees the entry in the marketplace list, so cannot install it, so `fetch_mcp_tools` never spawns its `identifier`.

2. **`derive_stdio_command` `_` fallback arm (line 1328–1337)** — tightened from "treat identifier as command" to safe sentinel:

   ```rust
   _ => (String::from("node"), Vec::new())
   ```

   This is defense in depth: even if a future code path adds a direct call to `derive_stdio_command` that bypasses `envelope_to_item`, the unknown branch yields a fixed `("node", [])` pair that `fetch_mcp_tools` will spawn harmlessly (or fail clearly) instead of spawning the upstream-controlled identifier.

### Why the allowlist is the right primary fix (vs only patching `_`)

The original `_` fallback was the symptom. The root issue is "we created a `MarketplaceMcpItem` for an envelope we can't actually install safely". Filtering at envelope ingestion is structurally correct — the entry never enters the catalog. Patching only `_` would leave a broken MCP entry in the UI ("install" button that produces an unhelpful `node` MCP). Doing both is layered: structural filter (envelope_to_item) + safe fallback (derive_stdio_command) — neither hides the other's failure.

### Why "node" instead of an Err/panic

`derive_stdio_command` returns `(String, Vec<String>)`, not `Result<…>`. Changing its return type would cascade into the caller and ripple into the `StdioMcpConfig` field types. The minimum-disruption fix is to keep the function total but make its `_` arm yield a non-spawnable-as-attack-vector value. `node` is a no-op that produces a clean "MCP failed to start" UX, consistent with the existing fallback behavior on `is_empty()` identifier — see the pre-fix arm at line 1334. Symmetry preserved.

### Manual verification

Cannot easily inject a fake MCP Registry envelope at runtime without modifying the live wire. However:
- **Code path verification**: searched all callers of `derive_stdio_command` (`rg -n derive_stdio_command src-tauri/src/`). Single callsite at `marketplace.rs:1417`, now guarded by the allowlist gate above it. ✓
- **Static path verification**: searched for direct construction of `StdioMcpConfig` with upstream-derived `command`. Only call path is `envelope_to_item` line 1428–1437. With the gate, `command` is guaranteed to be one of `npx` / `uvx` / `docker`. ✓

User scenario: MCP Registry pushes an envelope `{ registryType: "evilfoo", identifier: "/usr/bin/curl" }`. After fix:
- **X**: User refreshes MCP marketplace.
- **Y**: The evilfoo entry is silently absent from the list.
- **NOT Z**: Ensemble does NOT spawn `/usr/bin/curl`. No supply-chain RCE.

## Self-check (Charter §3 — 5 questions)

1. **Touches code outside the 3 findings?** No. Only the two terminal branches in `import.rs` and the three boundary points in `marketplace.rs` (envelope filter, fallback tightening, install sanitize). All changes cite their finding ID inline.
2. **Same bug elsewhere?**
   - A2: grep `escaped_path = folder_path_str` returns 0 hits after fix. Other terminal branches (Warp / Alacritty / Ghostty) verified safe or out of scope.
   - B4: 3 sibling callsites (`get_marketplace_repo_stars`, `fetch_skill_summary_github`, `fetch_mcp_readme_github`) were already sanitizing; this was the last hole.
   - B5: `derive_stdio_command` has one caller; now gated. `derive_install_triple` and other path-construction helpers are unrelated.
3. **New deps / IPC / files?** None. Only `_plan.md` and `_log.md` (per charter).
4. **IPC signature changes?** None.
5. **Breaks tests?** No. 185 lib tests pass (0 failed).

## Gate evidence

```
$ cd src-tauri && cargo build
   Compiling ensemble v2.1.2
warning: field `transport` is never read (pre-existing dead_code warning, NOT from my changes)
warning: `ensemble` (lib) generated 1 warning
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 3.48s

$ cd src-tauri && cargo test --lib
test result: ok. 185 passed; 0 failed; 7 ignored; 0 measured; 0 filtered out; finished in 0.79s

$ npx tsc --noEmit
exit: 0  (no output)

$ npx eslint src/
✖ 17 problems (0 errors, 17 warnings)
exit: 0  (warnings are pre-existing in files I did not touch — none in import.rs or marketplace.rs callers)
```

## Surprises / deviations from plan

None. The fix landed exactly as planned. Two minor judgment calls (documented inline):

1. Did not patch `finalize_skill_install`'s second `derive_install_triple` callsite — its consumers are display-only metadata, not URL construction. Charter §3 forbids "顺便清理 无关代码"; sanitizing there would be redundant defense at a non-boundary.
2. Tightened `derive_stdio_command` `_` arm by returning `("node", [])` instead of changing signature to `Result`. Selection-c per task brief (envelope-level filter) is the structural fix; tightening the fallback is layered defense-in-depth, not the primary line of defense.
