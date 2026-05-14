A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules.

A polish release closing four UI gaps where Rules were silently dropped from view. No data-shape change, no behavioural change to install / sync / clear.

## Fixed

- **Scene detail panel** -- Includes a new `Included Rules` section and a Rules count cell. The previous build accepted Rules in the Create Scene modal and wrote them to disk on Sync, but the detail view showed only Skills and MCP Servers.
- **Scene list rows** -- Rules chip (alongside Skills / MCPs / Docs) so the binding is visible without opening the detail panel.
- **Project Configuration panel** -- New `Rules` card under Configuration Status, with the same `Synced` badge logic as Skills / MCP Servers / CLAUDE.md. The "Assigned Scene" subtitle also reports the Rules count.
- **Project list rows** -- Rules chip mirrors the Scene list addition.

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.1.2_aarch64.dmg`
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
| `Ensemble_2.1.2_aarch64.dmg` | `aa39ad8ff02a96f72bfa64a9f7658ba8c4d945842d858d5d6e32ca585433572a` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v2.1.1...v2.1.2
