A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules.

A reliability and hardening release following a full backend + frontend bug audit. No schema change; no behavioural change to the install / sync / clear flows from the user's perspective.

## Security Hardening

- **AppleScript injection guard** for Terminal.app and iTerm launch paths. Project paths and Claude argv are now escaped before being interpolated into AppleScript, matching the existing Warp and Ghostty paths. A folder named with shell metacharacters can no longer execute arbitrary commands when launching Claude Code from Ensemble.
- **GitHub owner/repo validation** in marketplace skill install. The codeload URL is now built from sanitized identifiers; a catalog entry whose `source` carries unexpected characters is rejected before any network request.
- **MCP Registry registry-type allowlist**. The internal `derive_stdio_command` helper now refuses unknown `registryType` values rather than treating the package identifier as a binary to spawn.
- **Child-process env isolation** for MCP tool discovery. `fetch_mcp_tools` no longer forwards Ensemble's full environment to child MCP servers, preventing API keys present in the parent shell from leaking to third-party MCPs.

## Data Integrity

- **Atomic `data.json` writes** with last-known-good recovery. Power loss, disk full, or process kill during a write can no longer corrupt the canonical app state.
- **File lock on `~/.claude.json`** when Ensemble updates it. Concurrent writes from Ensemble and Claude Code itself no longer race; the previous behaviour could drop user-added MCP servers when both tools wrote within the same window.
- **`clear_project_config` is now scoped**. Clearing a project removes only Ensemble-managed CLAUDE.md / `.mcp.json` / Rules; user-authored files at the same paths are never touched. The previous version deleted by path regardless of origin.
- **Trash restore recovers full metadata** (category, tags, icon, scope, usage stats). The previous version restored the file but lost the curated metadata. Restoring Skills, MCP Servers, CLAUDE.md, Rules, **and Scenes / Projects** now round-trips cleanly.
- **`claude_md` scan no longer drops `.claude/`**. CLAUDE.md files living under `.claude/CLAUDE.md` were silently invisible to import because the dotfile filter was too aggressive; this is now consistent with how `rules` is scanned.
- **Ownership mismatch on `~/.ensemble/` fails loudly**. Previously a sudo-launched session could silently fall back to a different data directory and the user would think their categories had vanished. Ensemble now refuses to start and explains the cause.
- **Fresh-install default categories** appear reliably. The init path was non-atomic and order-dependent; a new user occasionally landed on an empty sidebar.

## Marketplace Install Reliability

- **Codeload tarball downloads no longer time out at 15 s**. The global 15 s budget covered both small JSON API calls and multi-MB tarball downloads; on slower connections or larger curated repos (such as `microsoft/azure-skills`, `github/awesome-copilot`) the timeout fired mid-stream and reqwest surfaced the cut-off as `error decoding response body` -- a misleading message that named the wrong layer. Codeload downloads now run on a separate 120 s budget; the JSON-API budget is unchanged.
- **Streaming download** with bytes-so-far reporting. If a download does fail, the error now names the actual `kind` (Timeout / Decode / Connect / Body) and reports how many bytes arrived before the failure, instead of the bare `error decoding response body`.

## Bug Fixes & UX

- **Trash now covers Scenes, Projects, and Rules**. The Recovery modal has a Rules tab; deleting a Scene or Project by accident is now reversible.
- **Category / Tag delete cascades to Rules**. Previously a deleted category left orphaned `categoryId` references on Rule entries.
- **`syncProject` is rollback-safe**. A failure in the middle of the four-step sync no longer leaves the project in a half-synced state with no UI feedback.
- **SlidePanel no longer lingers** after deleting the selected Skill / MCP. The detail panel now closes cleanly when its target row goes away.
- **Add Category / Tag / Scene** validate name uniqueness instead of accepting duplicates that confuse later lookups.
- **IME composition guards on Enter** for all text inputs. Chinese / Japanese / Korean users can finish a composition with Enter without accidentally submitting the surrounding form.
- **HTTP MCP install** rejects empty URLs and unsubstituted `{VAR}` placeholders at install time rather than producing an unusable entry.
- **`importStore.importMcps`** now derives the right source directory for users with a custom `mcpSourceDir` setting.
- **`update_rule` / `update_claude_md`** support clearing `categoryId` (previously a one-way set).
- **`syncProject` on filesystems without symlink support** now reports the failure instead of silently no-op'ing.
- **Terminal launcher fallbacks** are more resilient when the configured terminal is uninstalled.
- **Plugin import error reporting** surfaces failures to the UI instead of swallowing them with `eprintln`.

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.1.3_aarch64.dmg`
2. Open the DMG and drag **Ensemble** to Applications

### Build from Source

```bash
git clone https://github.com/O0000-code/Ensemble.git
cd Ensemble
npm install
npm run tauri build
```

> **Requirements:** Node.js 18+, Rust 1.77+, macOS

## Checksums (SHA-256)

| File | SHA-256 |
|------|---------|
| `Ensemble_2.1.3_aarch64.dmg` | `94d8af0f60d61d704285dce1e473811a06ec8c9ce20e4169150b6d915cd877e5` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v2.1.2...v2.1.3
