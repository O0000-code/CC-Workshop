A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules.

## Highlights

- **Rules Management** -- Treat Claude Code Rule files (`.claude/rules/*.md`) as first-class managed objects alongside Skills, MCPs, and CLAUDE.md: scan, import, edit, organize with categories and tags, mark any number as global, distribute to projects via Scenes
- **Scenes include Rules** -- Bundle multiple Rules into a Scene; project sync writes each Rule to `<project>/.claude/rules/<filename>.md` alongside Skills, `.mcp.json`, and CLAUDE.md

## What's Included

### Rules Management

- Scans `~/.claude/rules/` (user-scope) and `<project>/.claude/rules/` (project-scope) for `.md` rule files
- Imports preserve the original filename (Claude Code indexes Rules by filename); the displayed name can be renamed independently
- Per-Rule `Set as Global` toggle writes to `~/.claude/rules/<filename>.md` -- any number of Rules can be global simultaneously
- Editing the content of a globally-active Rule propagates to `~/.claude/rules/<filename>.md` immediately (no re-toggle required)
- Distribute a Rule to a project at `<project>/.claude/rules/<filename>.md` -- Claude Code's only scanned location for project Rules
- Multi-select Rules tab in the Create Scene modal; project sync batch-distributes all selected Rules
- Clearing a project's config removes only Ensemble-managed Rule filenames; user-authored `.md` files in `<project>/.claude/rules/` are never touched
- Soft-delete to trash; restore from Settings

### Integration

- Sidebar navigation has a Rules entry between CLAUDE.md and Scenes
- Category and Tag filter pages include a Rules section alongside Skills, MCPs, and CLAUDE.md
- Rules participate in the same auto-classify and View Options (Group + Sort) flows as the other managed types

## Installation

### macOS (Apple Silicon)

1. Download `Ensemble_2.1.0_aarch64.dmg`
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
| `Ensemble_2.1.0_aarch64.dmg` | `0b496d7a8faae2d9cb31a042dc1b7da4bb28905c0bc1f81cc0745faf01e9b98f` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---

**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v2.0.0...v2.1.0
