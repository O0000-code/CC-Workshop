A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules.

A polish release on top of v2.1.0. No functional change.

## Fixed

- **Sidebar header alignment** -- macOS native window controls (close / minimize / zoom) sit on the same horizontal line as the sidebar's refresh button. The previous `trafficLightPosition.y = 25` left the traffic-light center ~5 logical px above the refresh button center; tuned to `y: 29` so both centers land on the same row.

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.1.1_aarch64.dmg`
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
| `Ensemble_2.1.1_aarch64.dmg` | `0f3a1a1840909187cc26cb37e70e334ee4df96312cc8ba6de38b4bab32dc2ec8` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v2.1.0...v2.1.1
