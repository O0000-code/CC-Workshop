# F3 Implementation Plan — Security Layer

Scope: 3 P0 findings. All three are validated by the lead agent (see `04_master_findings.md`); the agent's task is execution, not re-validation.

| Finding | File | Lines | Strategy |
|---|---|---|---|
| A2 (R4 D1) | `src-tauri/src/commands/import.rs` | iTerm 1455–1473, Terminal.app 1605–1622 | Replace ad-hoc backslash+quote escape with reuse of existing `shell_quote` + `applescript_quote` helpers from same module. |
| B4 (R4 F1) | `src-tauri/src/commands/marketplace.rs` | `install_marketplace_skill` 2799–2935 | After `derive_install_triple`, run `sanitize_resource_name` on owner/repo before any URL construction. Pattern mirrors the 3 sibling callsites at 1893, 2005, 2100. |
| B5 (R4 F2) | `src-tauri/src/commands/marketplace.rs` | `envelope_to_item` 1391–1428 | Short-circuit `envelope_to_item` when `registryType` is not in the known allowlist (`npm`/`pypi`/`oci`). `derive_stdio_command` `_` fallback also tightened so it cannot reach a spawnable command. |

## A2 — Strategy (iTerm + Terminal.app)

Current pattern (both sites, identical mistake):

```rust
let escaped_path = folder_path_str.replace('\\', "\\\\").replace('"', "\\\"");
let escaped_cmd = claude_command.replace('\\', "\\\\").replace('"', "\\\"");
let applescript = format!(
    r#"tell application "iTerm2"
    activate
    create window with default profile command "cd \"{}\" && {}"
end tell"#,
    escaped_path, escaped_cmd
);
```

`replace('"', "\\\"")` only escapes AppleScript string literals. After AppleScript decodes the literal, the inner string `cd "<path>" && <cmd>` goes to zsh. zsh double-quotes still interpret `$()`, backticks, and `${VAR}`. Project path containing `$(say hacked)` → executes.

Fixed pattern (mirrors `build_ghostty_keyboard_automation_applescript` at line 1310–1315):

```rust
let inner = folder_launch_command(&folder_path_str, &claude_command);
// folder_launch_command already shell-quotes the folder; claude_command flows
// through verbatim (intentional — same as Ghostty path; the user-configured
// command may contain `--flags value` token-splittable space).
let quoted = applescript_quote(&inner);
let applescript = format!(
    r#"tell application "iTerm2"
    activate
    create window with default profile command {quoted}
end tell"#
);
```

Two-layer escape: inner shell command uses `'...'` POSIX single-quoting via `shell_quote`; outer AppleScript literal uses `applescript_quote` (`\\` + `\"` escapes). Path containing `$(say hacked)` becomes `cd '/Users/bo/Demo $(say hacked)' && claude`; zsh does not expand inside single quotes.

Same transform for Terminal.app's `do script` invocation.

### Why `claude_command` stays unquoted

`claude_command` is **user-configured** at Settings; it may be `claude --model opus` (multi-token). Quoting the whole string with `shell_quote` would make zsh treat `claude --model opus` as a single executable name, breaking the feature.

This matches existing Ghostty pattern (line 1265–1267 `folder_launch_command`): folder is shell-quoted (path is data); command is appended unmodified (command is configuration). The trust boundary is "user-configured" vs "external data" — folders come from upstream (Finder names / cloned repos), commands come from Settings.

### Cascade footprint

- iTerm path (`import.rs:1456-1473`): switch escape to helper-based.
- Terminal.app path (`import.rs:1605-1622`): switch escape to helper-based.
- Ghostty path (`import.rs:1571-1604`): **unchanged** — already correct.
- Warp path (`import.rs:1475-1554`): **out of scope** (R4 D2, descoped to P2).
- Alacritty path (`import.rs:1556-1570`): **unchanged** — uses `Command::new("alacritty").arg(...)`, not shell-interpreted.

Grep confirms only 2 callsites use the broken pattern:

```
$ rg -n 'escaped_path = folder_path_str' src-tauri/src/commands/import.rs
1459:            let escaped_path = folder_path_str.replace('\\', "\\\\").replace('"', "\\\"");
1607:            let escaped_path = folder_path_str.replace('\\', "\\\\").replace('"', "\\\"");
```

## B4 — Strategy (install_marketplace_skill owner/repo)

Current path: `derive_install_triple` at line 2776 returns `(owner, repo, skill_path)` from `item.source.split('/')` without any sanitization. Caller at line 2894 passes them to `install_skill_via_codeload` at line 2567 which formats `format!("https://codeload.github.com/{}/{}/tar.gz/HEAD", owner, repo)`. url crate (reqwest's parser, RFC 3986 §5.2.4 dot-segment normalization) would resolve `/anthropics/../evil/foo` to `/evil/foo`.

Fix: after `derive_install_triple` returns, sanitize owner & repo in `install_marketplace_skill` body. Same pattern as 3 sibling callsites:

- `marketplace.rs:1893-1896` (`get_marketplace_repo_stars`)
- `marketplace.rs:2005-2007` (`fetch_skill_summary_github`)
- `marketplace.rs:2100-2103` (`fetch_mcp_readme_github`)

Patch:

```rust
let (owner_raw, repo_raw, skill_path) = derive_install_triple(&item);
if owner_raw.is_empty() || repo_raw.is_empty() {
    return Ok(InstallOutcome::Failed { reason: ... });
}
let owner = match sanitize_resource_name(&owner_raw) {
    Ok(o) => o,
    Err(e) => return Ok(InstallOutcome::Failed {
        reason: format!("Invalid owner segment: {}", e),
    }),
};
let repo = match sanitize_resource_name(&repo_raw) {
    Ok(r) => r,
    Err(e) => return Ok(InstallOutcome::Failed {
        reason: format!("Invalid repo segment: {}", e),
    }),
};
// downstream `install_skill_via_codeload(&owner, &repo, ...)` uses sanitized
```

`skill_path` is NOT sanitized via `sanitize_resource_name` (it contains `/` separators legitimately, e.g. `skills/azure-ai`). It is consumed by `install_skill_via_codeload` which already validates each component before extraction (lines 2710-2726 per-component `sanitize_resource_name`).

### Cascade footprint

- `install_marketplace_skill` (line 2799–2948): apply sanitize after derive call.
- Other callers of `derive_install_triple`: there's one more at line 2969 (`finalize_skill_install`). That call only uses owner/repo to populate `MarketplaceSource` metadata fields (written verbatim to `data.json`), never to construct URLs. **Not a security boundary**, but for consistency we'll re-sanitize there too — if `install_marketplace_skill` rejected before reaching `finalize_skill_install`, `finalize_skill_install` won't see bad input via this path; but defense-in-depth + matches sibling pattern.

  Wait: I should check the trade-off. Re-sanitizing in `finalize_skill_install` would change return-from-`Result` handling there. Let me leave the second call site alone to **minimize blast radius** (per "no over-engineering"). The sanitize at the URL construction boundary in `install_marketplace_skill` is sufficient; `finalize_skill_install`'s use stores text that has already passed the boundary or is informational only.

  Confirmed minimal scope: sanitize only at `install_marketplace_skill` line 2894 — that's the only place the values are URL-spliced.

- `install_marketplace_mcp` (line 3038–3319): uses `item.repository_url` / `item.repo` for metadata; the actual install does NOT make a codeload-style URL (MCP install writes a JSON config; no upstream tarball fetched). **Out of scope** for B4.

## B5 — Strategy (derive_stdio_command unknown registryType)

Current `_` fallback (lines 1328–1339):

```rust
_ => {
    let command = if identifier.is_empty() {
        "node".to_string()
    } else {
        identifier.to_string()
    };
    (command, extra_args.to_vec())
}
```

A registry server returning `registryType: "evilfoo"` + `identifier: "/usr/bin/curl"` would result in `derive_stdio_command` returning `("/usr/bin/curl", extra_args)`. That `(command, args)` flows to `StdioMcpConfig` (line 1420), then to `~/.ensemble/mcps/<name>.json`, then to `fetch_mcp_tools` (`mcps.rs:317-323`) which `TokioCommand::new(command).args(args).spawn()`.

**Recommended fix (option c per task brief)**: short-circuit in `envelope_to_item` — entries with unknown `registryType` produce `None`, and the envelope is filtered out at the catalog ingestion step. This is "refuse to create suspicious entries", cleaner than band-aiding the `derive_stdio_command` fallback.

Patch in `envelope_to_item` (line 1391):

```rust
} else if let Some(pkg) = s.packages.first() {
    let registry_type = pkg
        .registry_type
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    // B5 fix: reject unknown registry types at envelope ingestion. Without this
    // gate, derive_stdio_command's `_` fallback would treat the upstream-provided
    // `identifier` as a binary path and spawn it. Only the three known ecosystems
    // (npm, pypi, oci) are accepted today; extending requires explicit code change
    // in derive_stdio_command and a matching update here.
    if !matches!(registry_type.as_str(), "npm" | "pypi" | "oci") {
        return None;
    }
    let identifier = pkg.identifier.clone().unwrap_or_default();
    // ... rest unchanged
```

This excludes the envelope from `MarketplaceMcpItem` list — user never sees the entry, can't install it. Defense in depth.

**Additionally tighten `derive_stdio_command`'s `_` arm** so that even if someone in the future adds a new code path calling it, the unknown branch yields a safe placeholder. Replace with:

```rust
_ => {
    // SAFETY: see envelope_to_item — unknown registry types are filtered
    // upstream. If this branch is reached, return a sentinel that will fail
    // at spawn time rather than execute upstream-controlled identifier as
    // a binary. `node` with empty args is harmless on most systems (and
    // produces a clear "not configured" error in fetch_mcp_tools).
    ("node".to_string(), Vec::new())
}
```

(Note: `node` is also what `derive_stdio_command` returned when `identifier` was empty under all branches before B5; this keeps the behavioral fingerprint familiar.)

### Cascade footprint

- `envelope_to_item` (line 1346): add allowlist check before `derive_stdio_command` call.
- `derive_stdio_command` (line 1298): tighten `_` arm to safe sentinel.
- Tests: existing tests in `marketplace.rs:3897+` cover `sanitize_resource_name`; let me check if `derive_stdio_command` is unit-tested:

```
$ rg -n 'fn .*_stdio_command|derive_stdio_command' src-tauri/src/commands/marketplace.rs
```

I'll run this in the implementation phase and confirm.

## Hard self-check (per Charter §3)

| Self-check question | Answer |
|---|---|
| Touches code outside the 3 findings? | No. iTerm + Terminal in import.rs; install_marketplace_skill + envelope_to_item + derive_stdio_command in marketplace.rs. |
| Same bug elsewhere? | A2: Warp / Alacritty / Ghostty already use safe patterns or are out-of-scope. B4: 3 sibling callsites already sanitized; this is the last hole. B5: `_` fallback is the single ingress for unknown registry types. |
| Introduces new dependencies / IPC / files? | None. `shell_quote` and `sanitize_resource_name` exist; no new IPC; no new files (only plan/log). |
| Modifies existing IPC signatures? | None. |
| Breaks existing tests? | Must verify in implementation phase: `cargo test --lib`. |

## User-observable success criterion

### A2

- **User does X**: User has a project folder named `Demo $(say "hacked")` (allowed by Finder). User clicks Open in iTerm in Ensemble.
- **User sees Y**: iTerm opens, `cd` lands in the demo folder, the command line shows `cd '/Users/.../Demo $(say "hacked")' && claude`.
- **User does NOT see Z**: macOS does NOT say "hacked" via TTS. No arbitrary command runs.

### B4

- **User does X**: User installs a Skill whose upstream catalog item has `source = "anthropics/../evil-org"` (or any owner/repo containing `..`, `/`, non-alphanumeric).
- **User sees Y**: Install fails with a clear error: `Could not install skill: Invalid owner segment: …` or `Invalid repo segment: …`. No file is downloaded.
- **User does NOT see Z**: Skill is NOT installed under the safe name with content actually fetched from a redirected attacker repo.

### B5

- **User does X**: MCP Registry returns a server with `registryType: "evilfoo"` and `identifier: "/usr/bin/curl"`.
- **User sees Y**: The entry is silently absent from the MCP marketplace listing (no install button to push). The user simply doesn't see that server.
- **User does NOT see Z**: When user opens a known MCP detail panel, Ensemble does NOT spawn `/usr/bin/curl` or any other upstream-provided binary path. fetch_mcp_tools never receives the malicious command/args combo.

## Implementation order

1. A2 fixes (single file, 2 sites; smallest blast radius).
2. B5 fix (single file, 2 sites in same function family; smallest semantic change).
3. B4 fix (single file, single site, but loads on the `install_marketplace_skill` happy path; do last so the gate run validates the heaviest test surface).
4. Gate: `cargo build && cargo test --lib && (cd .. && npx tsc --noEmit && npx eslint src/)`.
5. Write `F3_log.md`.
