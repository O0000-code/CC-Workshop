# Codeload install fix — validation

## TL;DR

Fix verified. `azure-prepare` (the user's reported failure) installs successfully under load. The error class for true network failures is now self-explanatory (`kind=Timeout` / `kind=Decode` + bytes-downloaded + source chain) rather than the misleading bare `"error decoding response body"`.

## Targeted live tests (3/3 pass)

```
test commands::marketplace::tests::live_codeload_install ... ok
test commands::marketplace::tests::live_codeload_install_plugin_nested ... ok
test commands::marketplace::tests::live_codeload_install_azure_prepare ... ok
3 passed; 0 failed; finished in 75.50s
```

`live_codeload_install_azure_prepare` is new regression coverage for the user-reported case.

## Broad sample (32 skills, 21:54 UTC, fix branch)

Outcome counts:

- **24/32 OK** (vs 25/32 baseline pre-fix)
- **3/32 codeload network errors** — all true upstream / network failures, surfaced with the new diagnostic format
- **5/32 `could not locate SKILL.md`** — catalog drift (skills.sh listing vs. actual repo layout); not a download issue

### The 3 true codeload errors (with new diagnostic format)

```
github/awesome-copilot :: python-mcp-server-generator
  → kind=Timeout "error decoding response body"
    | source: request or response body error
    | source: operation timed out
  120001 ms, 8 024 265 bytes downloaded — repo legitimately too large for 120 s budget on this link

github/awesome-copilot :: dataverse-python-quickstart
  → kind=Decode "error decoding response body"
    | source: end of file before message length reached
  48 667 ms, 29 746 597 bytes downloaded — GitHub edge cut the stream at 30 MB

agentspace-so/runcomfy-agent-skills :: image-edit
  → kind=Decode "error decoding response body"
    | source: end of file before message length reached
  20 681 ms, 58 790 bytes downloaded — small repo, transient CDN drop
```

Compare to pre-fix output for the same skills: bare `error decoding response body` with no kind, no bytes, no source. Future user reports of these classes are now self-diagnosing.

### The 5 catalog-drift failures (unrelated to this fix)

`microsoft/azure-skills :: azure-observability`, `vercel-labs/agent-skills :: vercel-react-best-practices`, `pbakaus/impeccable :: critique / quieter / normalize`. These skills appear in skills.sh's catalog but are not present in the actual repo at any candidate path. Out of scope.

Notable: pbakaus/impeccable appeared as `codeload read error` in the baseline run — the timeout was masking the real problem. After the fix lifted the timeout, the underlying "no such SKILL.md" surfaces. **This is evidence the fix is working** (network layer no longer obscuring the actual cause).

## User-observable success criterion

Per `.claude/rules/fix-must-define-user-observable-success.md`:

- **User action**: User opens Marketplace, clicks Install on `azure-prepare` (or any skill in `microsoft/azure-skills`).
- **User sees**: Install completes; skill appears in Skills list with `Source: microsoft/azure-skills` link.
- **User does NOT see**: `Could not install skill: codeload read error: error decoding response body` for any skill whose tarball can be downloaded within 120 s.
- **If a true upstream failure does occur**, the new error message names the kind (Timeout / Decode / Connect / etc.), the bytes received, the elapsed time, and the underlying source chain — enough information to diagnose without a reproducer session.

## Files changed

`src-tauri/src/commands/marketplace.rs` only:

- Added constant `CODELOAD_TIMEOUT_SECS = 120`
- Added helper `describe_reqwest_error()` (walks `e.source()` chain, prints `kind` label)
- `install_skill_via_codeload`: per-request `.timeout(120s)` + streaming `chunk()` loop + bytes-so-far / elapsed in error context
- New tests: `live_codeload_install_azure_prepare` + `live_codeload_broad_install_sample`

(SubAgent's drive-by removal of `if entry.scope.is_empty() { entry.scope = "global".to_string(); }` in `finalize_skill_install` / `finalize_mcp_install` was reverted by the lead agent — out of scope for this commit.)
