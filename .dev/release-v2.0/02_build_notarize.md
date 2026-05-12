# Build + Notarize Workflow for v2.0

## TL;DR — Pipeline for Lead Agent

1. **Bump version to 2.0.0 in three files** (in order):
   - `tauri.conf.json` → `"version": "2.0.0"`
   - `package.json` → `"version": "2.0.0"`
   - `src-tauri/Cargo.toml` → `version = "2.0.0"`

2. **Build:**
   ```bash
   APPLE_ID="<your-apple-id>" \
   APPLE_PASSWORD="<app-specific-password>" \
   APPLE_TEAM_ID="4WZ6SMP55G" \
   npm run tauri build
   ```
   Tauri auto-signs and auto-notarizes when all three env vars are set. Notarization + stapling happens inline — the command blocks until Apple's server responds and the ticket is stapled.

3. **Notarization is built into step 2** — no separate step needed. Tauri CLI invokes `xcrun notarytool submit --wait` and then staples automatically.

4. **Stapling** is done automatically by `tauri build` (unless `--skip-stapling` is passed). No manual `xcrun stapler` call needed.

5. **Final artifact locations:**
   - `.app`: `src-tauri/target/release/bundle/macos/Ensemble.app`
   - `.dmg`: `src-tauri/target/release/bundle/dmg/Ensemble_2.0.0_aarch64.dmg`

6. **Verification after build:**
   ```bash
   codesign -dvv src-tauri/target/release/bundle/macos/Ensemble.app
   # Expected: Authority=Developer ID Application: BoZhi Yuan (4WZ6SMP55G), flags=0x10000(runtime)

   spctl -a -v src-tauri/target/release/bundle/macos/Ensemble.app
   # Expected: "source=Notarized Developer ID" (NOT "Unnotarized Developer ID")
   ```

---

## Discovered Workflow Mechanics

### Build

- **Command:** `npm run tauri build` (which runs `tauri build` via `@tauri-apps/cli`)
- **CLI version in use:** `@tauri-apps/cli` 2.9.6
- **Pre-build hook:** `npm run build` (TypeScript compile + Vite bundle)
- **Output paths (verified from `tauri.conf.json` + Tauri CLI help):**
  - `.app` bundle: `src-tauri/target/release/bundle/macos/Ensemble.app`
  - `.dmg` installer: `src-tauri/target/release/bundle/dmg/Ensemble_<version>_aarch64.dmg`
    - For v2.0.0 this will be: `Ensemble_2.0.0_aarch64.dmg`
- **Architecture:** `aarch64` (Apple Silicon only). The v1.0.0 release was aarch64-only (matches `Ensemble_1.0.0_aarch64.dmg` naming pattern from `installation.md`). Building universal would require `--target universal-apple-darwin` plus both Rust targets installed.

### Code-signing

- **Identity** (from `tauri.conf.json` `bundle.macOS.signingIdentity`):
  `"Developer ID Application: BoZhi Yuan (4WZ6SMP55G)"`
- **Team ID:** `4WZ6SMP55G`
- **How invoked:** Tauri auto-signs during `tauri build`. The identity must be present in the user's login keychain (it is — `codesign -dvv` on the installed app confirms it was signed with this identity on 2026-05-11).
- **Hardened runtime:** enabled (`"hardenedRuntime": true` in `tauri.conf.json`) — required for notarization.
- **Verification:**
  ```bash
  codesign -dvv /path/to/Ensemble.app
  # Look for:  Authority=Developer ID Application: BoZhi Yuan (4WZ6SMP55G)
  #            flags=0x10000(runtime)   ← hardened runtime
  ```

### Notarization

- **Method:** Tauri 2 CLI built-in notarization via `xcrun notarytool`. When the three required env vars are set, `tauri build` calls `xcrun notarytool submit <dmg> --wait` internally and then staples the ticket.
- **Trigger:** Notarization fires automatically when ALL THREE of these env vars are set at build time:
  | Env var | Value |
  |---|---|
  | `APPLE_ID` | Your Apple Developer account email |
  | `APPLE_PASSWORD` | An app-specific password (generated at appleid.apple.com) |
  | `APPLE_TEAM_ID` | `4WZ6SMP55G` |
- **Alternative method (API key):** Tauri also supports `APPLE_API_KEY` + `APPLE_API_ISSUER` + `APPLE_API_KEY_PATH` (App Store Connect API key). The v1.0.0 notarization used the `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID` path (this is the simpler, more common path for individual developers).
- **Stapling:** Done automatically by Tauri after notarization succeeds (the `--skip-stapling` flag suppresses this). Stapling embeds the ticket in the `.app` and `.dmg` so Gatekeeper can verify offline.
- **Timing:** First-time notarization can take minutes to hours. `tauri build` blocks until complete. Subsequent runs are typically 1–5 minutes.
- **Where credentials are stored:** The Apple ID and app-specific password are NOT stored in the repo or keychain under any profile name (no `xcrun notarytool store-credentials` profile was found in the system keychain). They must be passed as env vars each build. **This means the Lead Agent must ask the user for `APPLE_ID` and `APPLE_PASSWORD` before running the release build.**

---

## Ground-truth Verification of Currently-installed App

The installed `/Applications/Ensemble.app` is v1.0.0 (confirmed via `CFBundleShortVersionString`). This app was signed AFTER the 2026-02-07 release (timestamp: 2026-05-11 at 9:15:29 PM) and is currently **NOT notarized**.

**`codesign -dvv /Applications/Ensemble.app` output:**
```
Executable=/Applications/Ensemble.app/Contents/MacOS/ensemble
Identifier=io.github.o0000-code.ensemble
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20500 size=33545 flags=0x10000(runtime) hashes=1041+3 location=embedded
Signature size=8971
Authority=Developer ID Application: BoZhi Yuan (4WZ6SMP55G)
Authority=Developer ID Certification Authority
Authority=Apple Root CA
Timestamp=May 11, 2026 at 9:15:29 PM
Info.plist entries=15
TeamIdentifier=4WZ6SMP55G
Runtime Version=26.4.0
Sealed Resources version=2 rules=13 files=13
Internal requirements count=1 size=192
```

**`spctl -a -v /Applications/Ensemble.app` output:**
```
/Applications/Ensemble.app: rejected
source=Unnotarized Developer ID
```

**Interpretation:** The currently installed app is properly code-signed with the Developer ID certificate (correct identity, hardened runtime enabled, correct team ID). However, it has NOT been notarized — `spctl` rejects it with `Unnotarized Developer ID`. This is consistent with the build workflow: the current installed version is a dev build that was signed locally but not submitted to Apple's notarization service (the three required env vars were not set during that build).

This confirms that:
1. The signing cert and identity are valid and present in the keychain — signing will work.
2. Notarization requires the `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` env vars to be set at build time — they were NOT set for this dev build.
3. The v1.0.0 release that WAS notarized (confirmed by commit `9b3b83c` on 2026-02-14) was built with these env vars set.

---

## Version Files That Must Be Bumped

All three files must be updated consistently (as established by commit `74dcc6b` for v1.0.0):

| File | Key | Current value | Target |
|---|---|---|---|
| `src-tauri/tauri.conf.json` | `"version"` | `"1.0.0"` | `"2.0.0"` |
| `package.json` | `"version"` | `"1.0.0"` | `"2.0.0"` |
| `src-tauri/Cargo.toml` | `version` | `"1.0.0"` | `"2.0.0"` |

Note: `src-tauri/Cargo.lock` will auto-update on next `cargo build` — no manual edit needed.

---

## Risks / Unknowns

1. **APPLE_PASSWORD must be obtained from the user.** No app-specific password is stored in keychain or the repo. The user must generate one at appleid.apple.com → Security → App-Specific Passwords. The Lead Agent must request this before running the release build.

2. **APPLE_ID must be confirmed.** The Apple ID email associated with the developer account (Team ID `4WZ6SMP55G`) is not discoverable from the repo. The user must supply it. (Likely `a1732928500@gmail.com` based on git config but this must be confirmed — Apple Developer accounts can use any email.)

3. **Notarization duration is unpredictable.** First notarization after a gap can take 30 min to several hours. Plan for the build command to block for an extended period. Do NOT Ctrl-C — interrupting notarization mid-flight leaves the submission orphaned.

4. **`--skip-stapling` behavior.** If for some reason the first notarization is done with `--skip-stapling`, the DMG will be notarized but not stapled — users in offline environments will get Gatekeeper warnings. Do NOT use `--skip-stapling` for the release build.

5. **Universal binary not confirmed.** v1.0.0 shipped as `aarch64` only. If v2.0.0 needs to support Intel Macs, `--target universal-apple-darwin` and both Rust targets must be added. Currently not configured.

6. **DMG naming with Cargo workspace.** The DMG filename is derived from `productName` + version + arch in Tauri. Confirmed pattern from `installation.md`: `Ensemble_<version>_aarch64.dmg`. For v2.0.0: `Ensemble_2.0.0_aarch64.dmg`.

---

## Files Touched in v1.0.0 Build / Notarize Pipeline

| Commit | Files | Notes |
|---|---|---|
| `74dcc6b` (2026-02-05) | `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml` | Version bump 0.0.1 → 1.0.0; added `signingIdentity`, `hardenedRuntime`, `minimumSystemVersion` |
| `2295f2c` (2026-02-07) | `README.md`, `docs/installation.md` | Added notarization-pending warning ("signed but not notarized") |
| `9b3b83c` (2026-02-14) | `README.md`, `docs/installation.md` | Removed notarization warning after successful notarization — confirms notarization completed between 2026-02-07 and 2026-02-14 |

The gap between `2295f2c` (added warning) and `9b3b83c` (removed it) places the successful notarization between 2026-02-07 and 2026-02-14. No script or automated pipeline was added in any commit — notarization was run manually by passing env vars to `npm run tauri build`.
