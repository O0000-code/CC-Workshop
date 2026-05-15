# G3 Implementation Log — Round 2

Three Round 2 fixes landed:

- **R2-4 (P1)** HTTP MCP URL validation on install + update.
- **R2-7 (P2)** `fetch_mcp_tools` stderr capture (8 KB / 500 ms bound).
- **R2-8 (P1)** Terminal pre-flight IPC + Ghostty bundle fallback + Quick-Action `current_exe` self-resolve + frontend status indicator.

## Files changed

### Backend
- `src-tauri/src/commands/marketplace.rs`
  - Added free function `validate_http_mcp_url(url: &str) -> Result<(), String>` (near top of module, after `sanitize_resource_name`).
  - Hooked into `install_marketplace_mcp` HTTP branch: validates `final_url` between the match-block destructure and the `McpConfigFile` construction; failure returns `InstallOutcome::Failed { reason }`.
  - Hooked into `update_mcp_http_config`: validates `substituted` URL right after substitution; failure returns `Err(reason)` which the McpDetailPanel surfaces as a toast.
- `src-tauri/src/commands/mcps.rs`
  - Added `AsyncReadExt`, `ChildStderr` to imports.
  - Switched `cmd.stderr(Stdio::null())` → `cmd.stderr(Stdio::piped())`.
  - Capture stderr handle via `child.stderr.take()` right after stdin/stdout takes.
  - On failure paths only (timeout, `Ok(Err)`), append stderr tail via helpers `drain_mcp_stderr` (8 KB / 500 ms bound) and `combine_error_with_stderr` (consistent formatting). Success path discards stderr — server debug noise stays out of the happy-path UI.
- `src-tauri/src/commands/import.rs`
  - Added `xml_escape_for_plist` helper (encodes `&`, `<`, `>`, `'`, `"` for plist `<string>` body safety).
  - `install_quick_action`: resolves running binary via `std::env::current_exe()`, escapes the path, replaces sentinel `__ENSEMBLE_BINARY_PATH__` in the workflow's `COMMAND_STRING` body before writing.
  - `installed_ghostty_version`: probes `/Applications/Ghostty.app`, then `~/Applications/Ghostty.app`, then `ghostty --version` on PATH. Returns the first found version.
  - Added `app_bundle_exists`, `binary_on_path` helpers + new IPC `validate_terminal_app(name: String) -> Result<bool, String>`. Per-terminal probe order matches how each app is launched in `launch_claude_for_folder`.
  - `launch_claude_for_folder`: pre-flight calls `validate_terminal_app` after the folder-existence check; missing terminal returns structured `Err("TerminalNotInstalled:<Name>")`. Round 1's iTerm/Terminal.app shell-injection fixes (line ~1640 / ~1796) untouched.
- `src-tauri/src/lib.rs`: registered `import::validate_terminal_app` in `invoke_handler!`.

### Frontend
- `src/pages/SettingsPage.tsx`: added `terminalAppInstalled` state + `useEffect` calling `validate_terminal_app` on dropdown change. Rendered green/red status dot next to the Terminal Application select. Red warning line in the description column when "not installed".
- `src/components/launcher/LauncherModal.tsx`: catch block detects `TerminalNotInstalled:<Name>` prefix and shows a user-friendly message instead of the raw error.
- `src/components/layout/MainLayout.tsx`: same `TerminalNotInstalled:` detection in the Quick-Action/Shortcut path; surfaces a `window.alert` with the actionable instruction.

## Regression-risk analysis

### R2-4
- **stdio MCPs**: only HTTP branch validates URL. stdio install/update unchanged.
- **`install_marketplace_mcp` already-existing variant paths** (Replace, RestoreFromTrash): both run before the HTTP-vs-stdio match, so the validation fires only on the actual write of the new config. No double-validation, no early-exit before the user picks an action.
- **`update_mcp_http_config` happy path**: when the substitution produces a valid URL, behavior unchanged.
- **Round 1 changes**: I did not touch `B4` (sanitize_resource_name) or `B5` (derive_stdio_command). Validation is additive.

### R2-7
- **Failure on stderr drain itself**: if reading stderr hangs or fails, `timeout(500ms, ...)` caps the wait and `String::from_utf8_lossy` cannot itself fail. Failure path still returns the original error.
- **Tokio resource leak**: `kill_on_drop(true)` already on the child + we explicitly `child.kill().await` before reading. The pipe closes naturally after kill.
- **stdout/stdin flow**: unchanged.
- **`server_info`**: unchanged.
- **frontend rendering** of error: `FetchMcpToolsResult.error` is the same field; the value is just longer. `McpMarketplacePage.handleFetchTools` (and equivalent in McpDetailPanel) already render `error` verbatim. The new `--- MCP server stderr ---` separator is human-readable.
- **Sensitive info**: stderr may include env-revealing debug. We accept this (a) only on failure paths, (b) capped at 8 KB, (c) audit charter explicitly permits "tail" for actionability. Future hardening could redact secrets but is out of charter scope.

### R2-8
- **Round 1 iTerm/Terminal.app injection fixes**: confirmed in `import.rs:1626` and `~:1782` — both still call `folder_launch_command(...)` + `applescript_quote(...)`. The pre-flight check inserts above the `match`, leaving these branches byte-identical.
- **Quick Action**: `current_exe()` returns the binary inside `Ensemble.app/Contents/MacOS/Ensemble`. Verified empirically: this is the right path for the Automator workflow's shell to invoke; `--launch "$f"` semantics preserved.
- **`current_exe()` failure**: returns `Err("Failed to resolve Ensemble binary path: ...")`. SettingsPage's install button already shows errors via `setQuickActionMessage`.
- **plist XML escape**: trailing concern was that `current_exe().to_string_lossy()` could contain `&` (e.g. path with `R&D` in it). `xml_escape_for_plist` escapes `&` first to avoid double-escaping. The sentinel `__ENSEMBLE_BINARY_PATH__` is unique enough not to collide with any plist token (no `<` `>` `&` chars).
- **Ghostty fallback**: existing flow `installed_ghostty_version() -> None` made `supports_native_applescript = true` via `unwrap_or(true)` — which we keep, since the old behavior was actually correct for never-installed Ghostty (the pre-flight `validate_terminal_app` already returned false). The fallback only changes behavior for users with Ghostty in `~/Applications/` or only as a PATH binary — for them, version detection now works and the correct AppleScript / keystroke path is chosen.
- **`Terminal` (Terminal.app)**: pre-flight allows three locations (system Utilities + slashed Applications/Utilities/ + plain /Applications/Terminal.app). On stock macOS this is always true; failure path is still surfaced if for some reason it is missing.
- **`launch_claude_for_folder` pre-flight clone**: `terminal_app.clone()` is needed because `validate_terminal_app` takes `String` (Tauri command signature). The subsequent `match terminal_app.as_str()` still works on the original.

## Self-check (6 questions)

1. **Touched scope outside finding?** No. All edits map to R2-4 / R2-7 / R2-8.
2. **Same bug elsewhere unhandled?**
   - HTTP MCP URL validation: greps for `cfg.url = ` / `url: Some(` and McpConfigFile construction show only `install_marketplace_mcp` + `update_mcp_http_config` as URL-writing IPCs; `extract_mcp_config` only reads from existing files (out of scope per charter focus on install/update). `plugins.rs` MCP import reads URLs from plugin metadata, no substitution. ✓
   - `Stdio::null` on stderr in MCP-spawn paths: grep confirms `fetch_mcp_tools` was the only MCP child-process spawn that piped null. Tarball-extract `tar` in `marketplace.rs::install_marketplace_skill` is unrelated runtime. ✓
   - Hardcoded Ensemble app path: `rg "/Applications/Ensemble\.app" src-tauri/src/` returns only `import.rs:1050` (the COMMAND_STRING). ✓
   - Hardcoded Ghostty app path: `rg "/Applications/Ghostty\.app" src-tauri/src/` returns only the `installed_ghostty_version` plist path. ✓
3. **New dependency?** None. `dirs` already in `Cargo.toml`. Only `tokio::io::AsyncReadExt` and `tokio::process::ChildStderr` added (already in the `tokio` crate, already a dep).
4. **Modified Round 1 hunks?** No. Confirmed by Read of `import.rs:1626` and `:1782` — both still use `folder_launch_command` + `applescript_quote`.
5. **Broken existing tests?** None. 196 unit tests pass, 203 with `--include-ignored` (7 live-network), 289 frontend vitest tests pass.
6. **IPC signature / return shape change?**
   - `validate_terminal_app` is new (additive).
   - `fetch_mcp_tools` returns the same `FetchMcpToolsResult` shape; the `error` field's value can now be longer. Frontend renders this verbatim — already-compatible.
   - `install_marketplace_mcp` already returns `InstallOutcome::Failed` for HTTP install failures; we use the existing variant.
   - `update_mcp_http_config` already returns `Result<(), String>`; we return `Err(...)` for invalid URL — caller (`mcpsStore.updateMcpHttpConfig`) already surfaces this as a toast.

## Gate results

- `cd src-tauri && cargo build` — clean (1 pre-existing dead-code warning on unrelated field).
- `cd src-tauri && cargo test --lib` — 196 passed, 0 failed, 7 ignored.
- `cd src-tauri && cargo test --lib -- --include-ignored` — 203 passed, 0 failed.
- `npx tsc --noEmit` — 1 pre-existing error in `ImportMcpModal.tsx` (G2's R2-6 WIP, not mine; nothing in my touched files).
- `npx eslint src/` — 0 errors in my touched files (3 pre-existing console-warn lints in `ProjectsPage.tsx` / `pluginsStore.ts`).
- `npx vitest run` — 289 passed, 0 failed.

## User-observable success contracts

### R2-4
- **User does X**: Marketplace, install HTTP MCP `sentry-mcp`, the catalog template URL is `https://mcp.example.com/{REGION}/sse` and the user leaves `REGION` blank.
- **User sees Y**: Install modal/toast: `URL still contains the placeholder {REGION}. Please fill in all URL variables before saving.` No MCP appears in the list.
- **User does NOT see**: Green install indicator alongside a `.mcp.json` whose `url` is `https://mcp.example.com//sse`.

### R2-7
- **User does X**: Configure an MCP with `command: "npx"` on a machine where npx is not on PATH, click Fetch Tools.
- **User sees Y**: Error string includes both `Operation timed out after 15000ms` and `--- MCP server stderr ---\nzsh: command not found: npx`.
- **User does NOT see**: A 15-second wait followed by a content-free `No response from MCP server` message.

### R2-8
- **User does X (terminal pre-flight)**: Settings dropdown shows Alacritty; right-click folder → "Open with Ensemble".
- **User sees Y**: macOS alert `Alacritty doesn't appear to be installed on this Mac. Open Ensemble Settings → Launch Configuration and pick a different terminal, or install Alacritty.`
- **User does NOT see**: Silent no-op or raw `Failed to launch Alacritty: No such file or directory (os error 2)`.

- **User does X (Ghostty fallback)**: Install Ghostty 1.3 to `~/Applications/Ghostty.app` (work machine, no admin).
- **User sees Y**: SettingsPage shows green dot beside Ghostty. Launch uses the version-1.3 native AppleScript path.
- **User does NOT see**: Red dot saying Ghostty not installed; launch falling back to keyboard automation against a non-running app.

- **User does X (Quick Action self-resolve)**: Install Ensemble.app to `~/Applications/`, enable Finder Quick Action, right-click folder.
- **User sees Y**: Ensemble window opens with the folder loaded.
- **User does NOT see**: Silent no-op (because the workflow's shell command pointed at `/Applications/Ensemble.app/Contents/MacOS/Ensemble` which does not exist).

## Manual verification steps

1. Build a fresh `cargo build` + `tauri dev` session.
2. **R2-4 HTTP**: In Marketplace pane, find an HTTP MCP whose template URL contains `{VAR}`. Try to install without entering all url_variables; confirm the install toast surfaces the placeholder name.
3. **R2-7 stderr**: Add a fake MCP with `command: "nonexistentbin"`, click Fetch Tools. Confirm the error text now includes a stderr tail.
4. **R2-8a (pre-flight)**: In Settings, pick Alacritty (assuming not installed). Confirm: red dot beside dropdown + red warning line. Use Quick Action or LauncherModal → user-friendly modal appears.
5. **R2-8b (Ghostty path)**: Add `~/Applications/Ghostty.app` symlink (or copy a Ghostty.app there). Restart Ensemble. Settings should now show a green dot.
6. **R2-8c (Quick Action self-resolve)**: Copy Ensemble.app to `~/Applications/`, launch from there, install Quick Action. Open `~/Library/Services/Open with Ensemble.workflow/Contents/document.wflow` and confirm the `COMMAND_STRING` references the actual binary path (not `/Applications/...`).
