# Codeload install bug — diagnosis (lead-agent investigation)

## Bug

Production app (`/Applications/Ensemble.app`, built 2026-05-14, version 2.1.2) reports:

```
Could not install skill: codeload read error: error decoding response body
```

User clarification: **some installs work, some fail**.
- ✅ Works: `entra-app-registration` (in `microsoft/azure-skills`)
- ❌ Fails: `azure-prepare` (in `microsoft/azure-skills`)

**Both skills are in the same repo → same codeload tarball download.** So the failure is not "tarball size too large for 15s timeout" alone. There is some other factor differentiating azure-prepare from entra-app-registration.

## Code path

`install_marketplace_skill()` (marketplace.rs:2722) → `install_skill_via_codeload()` (marketplace.rs:2508). Error string `"codeload read error: ..."` comes from the **single** site at line 2527:

```rust
let bytes = resp
    .bytes()
    .await
    .map_err(|e| format!("codeload read error: {}", e))?
    .to_vec();
```

Wrapped by the outer `Could not install skill: {}` at line 2854.

So `error decoding response body` is reqwest 0.12's `Display` for `Error` of kind `Decode`. That kind triggers when body decoding (gzip auto-decompression OR HTTP/2 stream interruption) fails.

## What the lead agent has already verified

1. **codeload doesn't send `Content-Encoding: gzip`** — verified via `curl -sI -H 'Accept-Encoding: gzip' https://codeload.github.com/...`. Response carries `content-type: application/x-gzip` (entity body type) but no transport `content-encoding` header. So reqwest's `gzip(true)` auto-decompression should pass through.
2. **`live_codeload_install` and `live_codeload_install_plugin_nested` both pass** in `cargo test --lib -- --ignored`. The plugin-nested test uses `microsoft-foundry` from `microsoft/azure-skills` — **identical structure to `azure-prepare`** (`.github/plugins/azure-skills/skills/<id>/`). Local lib-test environment does not reproduce the bug.
3. **azure-prepare actually exists** in the tarball at `azure-skills-HEAD/.github/plugins/azure-skills/skills/azure-prepare/` (verified via `tar -tzf`). The fallback `find_map` on line ~2580 should locate it via the `/azure-prepare/skill.md` suffix match.
4. **HTTP_TIMEOUT_SECS = 15** in `marketplace.rs:118`. Single global timeout for both small JSON API calls and large tarball downloads.
5. **reqwest version 0.12.28** in Cargo.lock. Last marketplace.rs commit is 2026-05-10; nothing has changed in the install path since the production app was built.
6. **Tauri config** (`tauri.conf.json`): hardenedRuntime: true; no sandbox; standard macOS bundle.

## Hypotheses still on the table

The bug must be runtime-specific. Possible root causes (ranked):

1. **Network / HTTP/2 stream interruption** (most likely): Some condition specific to azure-prepare install repeatedly hits a stream read failure. Could be that azure-prepare-related metadata on the marketplace UI side triggers concurrent install attempts (batching), exhausting reqwest's connection pool or HTTP/2 stream limits, causing some streams to be reset.
2. **Tarball-size-vs-timeout** edge case: Even though azure-skills is 3.3MB, on slow user network it may approach 15s. If the user clicked azure-prepare during higher network load and entra-app-registration during lower load, this would manifest as "azure-prepare always fails for me right now."
3. **macOS-specific HTTPS issue with reqwest 0.12.28**: A regression in the underlying TLS layer (system Security.framework via native-tls). Less likely since `live_codeload_install` passes.
4. **Bytes-buffering OOM**: `resp.bytes()` buffers the entire response in memory. If process is under pressure, allocation could fail mid-stream.

## Validated working environment

- macOS 25.4.0 (lead agent runtime)
- `cargo test --lib -- --ignored live_codeload_install --nocapture` passes
- `cargo test --lib -- --ignored live_codeload_install_plugin_nested --nocapture` passes
- `curl https://codeload.github.com/microsoft/azure-skills/tar.gz/HEAD` → 3.3MB, valid gzip, ~2s

## What the SubAgent needs to do

See `02_subagent_brief.md`.
