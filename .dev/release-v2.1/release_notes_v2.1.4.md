A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules.

A reliability + ergonomics release closing 10 round-2 findings from the 2026-05-15 bug audit (on top of the round-1 fixes that shipped in v2.1.3). No schema change; no behavioural change to install / sync / clear flows.

## Filesystem & Startup

- **Unicode-normalised skill / MCP ids**. The same skill stored as NFD on disk (after a macOS Finder rename) and NFC (from a git clone, Linux scp, or iCloud sync) used to be tracked as two separate metadata entries. Ids and `sourcePath` now normalise to NFC; a one-shot migration rewrites existing `data.json` under NFC keys, merging collisions by populatedness.
- **`~/.ensemble/` writability health check at startup**. Previously, a directory owned by root (e.g. after a `sudo open` of the app) caused a silent fallback to in-memory empty AppData -- users saw an empty sidebar with no explanation. Startup now runs a probe write and surfaces a dedicated alertdialog with the `chown` command (selectable for copy) and a Retry button when the probe fails.
- **Quick Action resolves the running app at runtime**. The Finder right-click integration previously hard-coded `/Applications/Ensemble.app`, which broke for users who installed elsewhere (`~/Applications/`, custom path). The installer now uses `std::env::current_exe()` to point at the actually-running binary.

## Plugin Install & Trash

- **Plugin import surfaces partial failures**. `detectPluginSkillsForImport` and `detectPluginMcpsForImport` now return a structured `PluginImportResult` with per-item success / failure reasons. Failures appear as a red banner inside the import modal so users can retry the surviving items without re-selecting everything.
- **Empty Trash + per-row permanent delete**. Trash Recovery modal has a top-level **Empty Trash** header button plus a hover-revealed trash icon on every row, on every tab. Both gated by inline confirm overlays.
- **Plugin marker orphan cleanup**. When a previously-installed plugin is uninstalled outside Ensemble (or its cache is wiped), the stale `imported_plugin_skills` / `imported_plugin_mcps` markers used to persist forever and block re-import. The detect path now calls `cleanup_orphan_plugin_imports` first so a re-installed plugin shows up as available again.

## Sync, Input & Reliability

- **HTTP MCP URL validation at install + update**. Empty URLs and unresolved `{VAR}` placeholders are caught before the entry is written, instead of producing an unusable MCP.
- **`fetch_mcp_tools` captures child stderr**. MCP servers that fail to start now surface their stderr in the UI; previously the diagnostic was thrown away and the user only saw a generic timeout.
- **Terminal launch pre-flight check**. Before launching Claude Code, the selected terminal app is verified to exist. If it doesn't, the user sees a clear "Terminal not installed" message instead of a silent no-op.
- **`syncProject` per-step result reporting**. The four-step sync (Skills / MCPs / CLAUDE.md / Rules) now reports per-step success / failure, so a partial sync no longer appears identical to a full success in the UI.
- **IME composition guard on 11 text-input Enter handlers**. Chinese / Japanese / Korean users finishing a composition with Enter no longer trigger accidental form submission.

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.1.4_aarch64.dmg`
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
| `Ensemble_2.1.4_aarch64.dmg` | `d1238d06540ad83707610ceb94443adb6dca7fb6bd1ed2596e7169d115ce7c82` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v2.1.3...v2.1.4
