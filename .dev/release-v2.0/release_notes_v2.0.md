A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, and CLAUDE.md files.

## Highlights

- **Skill Marketplace** -- Browse and install community Skills from skills.sh directly into your library, with Markdown READMEs, GitHub stars, AI summaries, and one-click install
- **MCP Marketplace** -- Browse and install MCP Servers from the official MCP Registry (`registry.modelcontextprotocol.io`) with publisher metadata, example snippets, and a guided env-var / header form at install time
- **Hierarchical Categories** -- Organize Skills, MCPs, and CLAUDE.md files into depth-2 nested categories by dragging one category into another
- **Sidebar Reorder** -- Drag to reorder categories and tags in the sidebar with macOS-grade physics (magnetic snap, distance-aware settle, multi-layer lift shadow)
- **View Options** -- Unified Group + Sort menu across Skills, MCP Servers, CLAUDE.md, Scenes, Projects, and category / tag filter pages, with preferences persisted per page
- **Ghostty Terminal Support** -- Added Ghostty alongside Terminal.app, iTerm2, Warp, and Alacritty for launching Claude Code from the Finder Quick Action

## What's Included

### Marketplace

- Skill Marketplace mirrors the skills.sh catalog with topic filtering, GitHub stars, AI summaries, README previews, and Related Skills
- MCP Marketplace mirrors `registry.modelcontextprotocol.io` with cursor-paginated browsing, a Recently Updated feed, and full-text search
- Per-ecosystem install command derivation for MCPs: `npm` -> `npx -y`, `pypi` -> `uvx`, `oci` -> `docker run --rm -i`
- Required environment variables surfaced as a form before install; secret fields render as password inputs
- HTTP MCPs with URL template variables (`{VAR}`) or required headers get a dedicated input form
- 24-hour SWR catalog cache with a background refresh on app launch
- Auto-Classify suggestion fires after each install; collision modal offers Replace or Restore from Trash

### Organization

- Categories support one level of nesting; filter pages aggregate parent and descendant items
- Categories and tags reorder via drag with macOS-native cursor and physics
- View Options menu (funnel icon) on every list page: Group by Categories or Tags, Sort by Name / Recently added / Recently used / Most used (subset per page)
- Auto-Classify model is configurable in Settings (Opus / Sonnet / Haiku, defaults to Opus)
- Reset auto-classify data action clears categories, tags, and item assignments after an explicit confirm
- Cascade-clear on category or tag delete so item references no longer dangle

### Detail Panels

- Skill instructions and CLAUDE.md content render as Markdown
- Scope and Source displayed as separate rows; marketplace-installed items show a dedicated "From" badge
- MCP detail uses the upstream `title` (e.g. "inference.sh") when published, falling back to the reverse-DNS id

### System Integration

- Finder Quick Action and launch flow add Ghostty support (version-gated tab API, instance reuse)
- Trash and recovery system for deleted items (unchanged from v1.0.0)
- Configurable terminal: Terminal.app, iTerm2, Warp, Alacritty, Ghostty

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.0.0_aarch64.dmg`
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
| `Ensemble_2.0.0_aarch64.dmg` | `1cb699c8c102ec60373d91c71ddf180c18dbebf0189daf1c82b76b4ec520babf` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v1.0.0...v2.0.0
