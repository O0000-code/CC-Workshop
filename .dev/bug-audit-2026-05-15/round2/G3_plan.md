# G3 Implementation Plan — Round 2 (Install / MCP Runtime / Terminal)

Round 2 Agent **G3**. Three fixes:

| ID | Severity | Module |
|---|---|---|
| R2-4 | P1 | `marketplace.rs` HTTP MCP URL validation |
| R2-7 | P2 | `mcps.rs::fetch_mcp_tools` stderr capture |
| R2-8 | P1 | `import.rs` terminal pre-flight + Ghostty fallback path + Ensemble.app self-resolve |

All three are additive fixes — no IPC signature changes that break existing callers, and zero touch on Round 1's already-merged hunks.

---

## R2-4 — HTTP MCP URL validation

### Files
- `src-tauri/src/commands/marketplace.rs`
  - Add free function `validate_http_mcp_url(url: &str) -> Result<(), String>` near top of module (right after the existing `use` block, alongside other private helpers).
  - Call it from `install_marketplace_mcp` (HTTP branch, line ~3225–3232) **before** the `fs::write(&target_path, json)` at line ~3282.
  - Call it from `update_mcp_http_config` (line ~2447–2477) **after** substitution, **before** `fs::write` at line ~2475.

### Logic
```rust
fn validate_http_mcp_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL is empty. Please provide a valid HTTPS URL for this MCP.".to_string());
    }
    // Look for an unresolved `{VAR}` placeholder (mirrors the `{NAME}`
    // pattern the URL-variables substitution uses). We report the first
    // such placeholder by name so the user knows what to fill in.
    if let Some(start) = trimmed.find('{') {
        if let Some(end_offset) = trimmed[start + 1..].find('}') {
            let name = &trimmed[start + 1..start + 1 + end_offset];
            if !name.is_empty() {
                return Err(format!(
                    "URL still contains the placeholder {{{}}}. Please fill in all URL variables before saving.",
                    name
                ));
            }
        }
    }
    Ok(())
}
```

### Call sites
- `install_marketplace_mcp`: in the HTTP branch, after `final_url` is computed (around line 3204) and before the `cfg` is serialised and written. Failure → `return Ok(InstallOutcome::Failed { reason: e })`.
- `update_mcp_http_config`: after the `substituted` string is built (around line 2467), before writing. Failure → `return Err(e)`. The frontend `mcpsStore.updateMcpHttpConfig` already propagates errors as toasts.

### Constraints
- **Do NOT validate the URL is reachable** — that's a lifetime check, out of scope.
- stdio MCPs are unaffected; the validation only runs in the HTTP branches.
- The check happens before any filesystem write, so a failed validation leaves no partial state.

### User-observable success contract
- **User does X**: From marketplace, installs an HTTP MCP that has `url_variables` but leaves one blank (or pastes a URL like `https://example.com/{TOKEN}` without filling `TOKEN`).
- **User sees Y**: Install toast / modal shows `URL still contains the placeholder {TOKEN}. Please fill in all URL variables before saving.` MCP is NOT added to the list.
- **User does NOT see**: A green "Installed" indicator alongside a broken `.mcp.json` whose URL field is empty or contains literal `{TOKEN}`.

### Grep — same-bug-elsewhere
Functions that construct an HTTP MCP `.mcp.json` and could write an empty/placeholder URL:
- `install_marketplace_mcp` (covered) — line 3127.
- `update_mcp_http_config` (covered) — line 2447.
- `update_mcp_env_vars` (line 2415) — stdio only, no URL handling. **Not in scope.**
- `import.rs::extract_mcp_config` — reads existing URLs from `.claude.json`, does not generate them. **Not in scope** (per R2-4 charter focus on install/update paths).
- `plugins.rs` MCP import — reads plugin-supplied URL verbatim; no substitution. **Not in scope.**

---

## R2-7 — fetch_mcp_tools stderr capture

### Files
- `src-tauri/src/commands/mcps.rs` (lines 295–500, `fetch_mcp_tools`)

### Logic
1. Add `AsyncReadExt` to the tokio io import.
2. Change `cmd.stderr(Stdio::null())` to `cmd.stderr(Stdio::piped())`.
3. After `child.stdin.take()` / `child.stdout.take()`, also `let stderr = child.stderr.take();`.
4. On error / timeout paths, drain up to **8 KB** of stderr (cap is critical — a misbehaving MCP could flood stderr) and append to the error message.

### Draining strategy
Read the stderr handle into a `Vec<u8>` with `.take(8192).read_to_end(&mut buf)`. Wrap with a 500 ms timeout so a stuck child doesn't block the IPC's overall return. If the read finishes early, we use what we got; if it hits 8 KB or 500 ms, we still return whatever was read with a `(truncated)` suffix indicator if non-empty.

### Where to splice
- After `child.kill().await` (line 483), if the result branch produces a failure, attempt to drain the stderr handle and append it to the error string.
- The success path discards stderr (no allocation).

### Helper
Introduce a private async function `drain_stderr(stderr: Option<tokio::process::ChildStderr>) -> Option<String>` to keep the failure path readable. Returns `Some(text)` only if non-empty after trim. Strips ANSI escape codes is **out of scope** (project does not currently depend on it; KISS).

### Failure-path splicing logic
```rust
let stderr_handle = ...; // taken at top of function
// ... existing logic that produces `result_branch` ...
let _ = child.kill().await;
let stderr_tail = drain_stderr(stderr_handle).await;
match result {
    Ok(Ok(r)) => Ok(r),  // success: do not append stderr
    Ok(Err(e)) | ...     => {
        let combined = match stderr_tail {
            Some(s) => format!("{}\n\n--- MCP server stderr ---\n{}", e, s),
            None => e,
        };
        Ok(FetchMcpToolsResult { success: false, error: Some(combined), ... })
    }
}
```

### Constraints
- **Do not append stderr on success** — stderr from a happy MCP can contain debug noise or environment-revealing info.
- **Cap 8 KB** — buffer cannot grow unbounded.
- **500 ms timeout** on the drain — protects against a hung child whose stdout pipe is closed but stderr is still pending.
- `kill_on_drop(true)` is already set; no new resource-leak risk.

### User-observable success contract
- **User does X**: Configures an MCP with `command: "npx"` on a machine where npx is not installed, clicks "Fetch tools".
- **User sees Y**: Error message includes `--- MCP server stderr ---\nzsh: command not found: npx` (or whatever the OS reports). The user can act on it.
- **User does NOT see**: `No response from MCP server` with zero diagnostic context.

### Grep — same-bug-elsewhere
Other callsites in the codebase that spawn a child with `Stdio::null()` on stderr:
- `import.rs` terminal-launch paths: stderr is captured in `output()` mode (line 1505, 1556 etc.) — already inspected. ✓
- `marketplace.rs::install_marketplace_skill`'s tarball-extraction `Command::new("tar")`: not relevant to MCP runtime; out of scope.
- `import.rs::installed_ghostty_version`: uses `.output()` which captures stdout AND stderr. ✓
- No other MCP-spawning code path uses `Stdio::null()` on stderr.

---

## R2-8 — Terminal pre-flight + Ghostty fallback + Ensemble.app self-resolve

Three logically related edits in `import.rs`:

### 8a. New IPC `validate_terminal_app(name: String) -> Result<bool, String>`

Pure-fs/which check. Returns Ok(true) installed, Ok(false) not installed, Err for unknown name.

```rust
#[tauri::command]
pub fn validate_terminal_app(name: String) -> Result<bool, String> {
    match name.as_str() {
        "Terminal" => {
            // System Terminal.app — present on every macOS install but
            // we still confirm rather than assume.
            Ok(Path::new("/System/Applications/Utilities/Terminal.app").exists()
                || Path::new("/Applications/Utilities/Terminal.app").exists())
        }
        "iTerm" => Ok(app_bundle_exists("iTerm.app")),
        "Warp" => Ok(app_bundle_exists("Warp.app")),
        "Ghostty" => Ok(app_bundle_exists("Ghostty.app") || on_path("ghostty")),
        "Alacritty" => Ok(on_path("alacritty") || app_bundle_exists("Alacritty.app")),
        _ => Err(format!("Unknown terminal app: {}", name)),
    }
}

fn app_bundle_exists(name: &str) -> bool {
    if Path::new(&format!("/Applications/{}", name)).exists() {
        return true;
    }
    if let Some(home) = dirs::home_dir() {
        if home.join("Applications").join(name).exists() {
            return true;
        }
    }
    false
}

fn on_path(binary: &str) -> bool {
    std::process::Command::new("which")
        .arg(binary)
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}
```

### 8b. `installed_ghostty_version` fallback

Update the function to check, in order:
1. `/Applications/Ghostty.app/Contents/Info.plist`
2. `~/Applications/Ghostty.app/Contents/Info.plist`
3. `which ghostty` → `<ghostty-bin> --version` (a `brew install ghostty` install may not have an `.app` bundle).

If none yields a version, return `None`.

### 8c. `install_quick_action` self-resolve

Replace the hardcoded `"/Applications/Ensemble.app/Contents/MacOS/Ensemble"` string in the `COMMAND_STRING` plist with `std::env::current_exe()`.

XML-escape the resolved path (plist string body) — handles `<` `>` `&` `'` `"`. Most install paths are plain `/Applications/...` or `~/Applications/...` and need zero escaping, but `Workspace 'foo'.app` style names need quote escaping; cheap to do unconditionally.

Switch from `r#"..."#` raw template to a `format!()` build so the `COMMAND_STRING` body can be substituted. Everything else in the document.wflow stays byte-identical.

### 8d. `launch_claude_for_folder` pre-flight

At the top of the function (after `folder.exists()` check, before the `match terminal_app.as_str()`), call `validate_terminal_app(&terminal_app)`. On Ok(false), return a structured error:
```rust
return Err(format!("TerminalNotInstalled:{}", terminal_app));
```

The `Err("TerminalNotInstalled:Alacritty")` shape lets the frontend split on `:` to detect the case. **Do NOT** modify the existing per-terminal launch branches (Round 1's iTerm + Terminal.app shell-injection fixes must stay untouched).

For `Terminal` specifically, the system Terminal.app is essentially always present; if `validate_terminal_app("Terminal")` returns false, the user has a wildly non-standard macOS — we still surface a clear error rather than crash.

### 8e. Frontend — SettingsPage status indicator + LauncherModal/MainLayout error handling

**SettingsPage.tsx** (`/Users/bo/.../src/pages/SettingsPage.tsx`):
- Add a state `const [terminalAppInstalled, setTerminalAppInstalled] = useState<boolean | null>(null);`
- On `terminalApp` change (and once on mount), call `validate_terminal_app` and set the state.
- Render a small dot next to the dropdown — green when installed, red when not, hidden when `null` (initial load).
- A short helper text in red when not installed: `Looks like {terminalApp} isn't installed on this Mac. Pick a different terminal or install it first.`

**LauncherModal.tsx** + **MainLayout.tsx**:
- In the catch block of `safeInvoke('launch_claude_for_folder', ...)`, detect error string starting with `TerminalNotInstalled:` and show a clearer message: `<Name> doesn't appear to be installed. Open Settings → Launch Configuration and pick a different terminal.`

### Files
- `src-tauri/src/commands/import.rs` — 8a-8d
- `src-tauri/src/lib.rs` — register `validate_terminal_app`
- `src/pages/SettingsPage.tsx` — 8e (status dot)
- `src/components/launcher/LauncherModal.tsx` — friendlier error
- `src/components/layout/MainLayout.tsx` — friendlier error

### User-observable success contracts

**8a–d (pre-flight)**:
- **User does X**: Picks Alacritty in Settings on a machine without Alacritty installed, then right-clicks a folder → Open with Ensemble (or uses LauncherModal).
- **User sees Y**: Modal/toast: `Alacritty doesn't appear to be installed. Open Settings → Launch Configuration and pick a different terminal.`
- **User does NOT see**: Silent failure or a raw `No such file or directory (os error 2)`.

**8b (Ghostty fallback)**:
- **User does X**: Has Ghostty installed to `~/Applications/Ghostty.app` (workplace machine without admin).
- **User sees Y**: `validate_terminal_app("Ghostty")` returns true; `installed_ghostty_version` returns the real version; native AppleScript path is chosen correctly.
- **User does NOT see**: A failed launch caused by the version detection silently returning `None`.

**8c (Quick Action)**:
- **User does X**: Installs Ensemble to `~/Applications/Ensemble.app`, enables Finder Quick Action, right-clicks a folder.
- **User sees Y**: Ensemble window opens.
- **User does NOT see**: Quick Action silently no-ops because the workflow's shell line pointed at the wrong path.

### Constraints
- **Round 1's iTerm and Terminal.app shell-injection fixes (`shell_quote` + `folder_launch_command`) MUST NOT be touched.** Verified by reading `import.rs:1475` and `:1628` — both already use `folder_launch_command`. My patch only inserts a pre-flight call before these branches.
- **No new dependency** — `dirs` already in `Cargo.toml`, `which`/`Command` already used.
- **`Path::new("/Applications/Ghostty.app").exists()` verified firsthand on this dev machine** (`ls -la /Applications/Ghostty.app` succeeds — Ghostty is in fact installed at that path).
- `which alacritty` verified to exit non-zero when not installed (firsthand on this machine: not installed).

### Grep — same-bug-elsewhere
Hardcoded `/Applications/Ensemble.app` strings:
```
$ rg -n "/Applications/Ensemble\.app" src-tauri/src/
```
- `import.rs:1050` — the Quick Action plist body. **Covered (8c).**
- No other backend references.

Hardcoded `/Applications/Ghostty.app`:
```
$ rg -n "/Applications/Ghostty\.app" src-tauri/src/
```
- `import.rs:1396` — `installed_ghostty_version`. **Covered (8b).**
- No other references.

Stdio::null on stderr (already covered under R2-7).

---

## Cross-fix concerns

- **No file collisions with G1 / G2 / G4** — G3 owns `mcps.rs` `fetch_mcp_tools`, `marketplace.rs` `install_marketplace_mcp` + `update_mcp_http_config`, `import.rs` `validate_terminal_app` + `installed_ghostty_version` + `install_quick_action` + the pre-flight at the top of `launch_claude_for_folder`. None of these overlap with R2-1/R2-2 (G1, NFC + perms), R2-3/R2-5 (G4, sync error + IME), R2-6/R2-9/R2-10 (G2, plugin import + trash cleanup).
- **No new IPC signatures break** — `validate_terminal_app` is new; everything else preserves existing shapes.

## Self-check (before gates)

1. **Touched scope outside finding?** No — only the 3 files listed.
2. **Same bug elsewhere unhandled?** Greps above cover all known callsites.
3. **New dependency?** No.
4. **Modified Round 1 hunks?** No — verified by reading lines 1475 & 1628 of `import.rs`.
5. **Breaks existing tests?** None of the touched code has unit tests today (verified by `rg fetch_mcp_tools src-tauri/src/`). New behavior is additive.
6. **IPC signature/return shape change?** `validate_terminal_app` is new (additive). `fetch_mcp_tools` returns the same `FetchMcpToolsResult`; the `error` field's content is richer but the shape is unchanged. `install_marketplace_mcp` already returns `InstallOutcome::Failed`. `update_mcp_http_config` already returns `Result<(), String>`.

## Gates

- `cd src-tauri && cargo build` — 0 errors
- `cd src-tauri && cargo test --lib` — pass
- `cd src-tauri && cargo test --lib -- --include-ignored 2>/dev/null` — pass
- `cd <root> && npx tsc --noEmit` — clean
- `cd <root> && npx eslint src/` — 0 errors
- `cd <root> && npx vitest run` — pass

