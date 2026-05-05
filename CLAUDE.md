# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Ensemble is a macOS desktop app for managing Claude Code configurations (Skills, MCP Servers, CLAUDE.md files). Built with Tauri 2 (Rust backend) + React/TypeScript frontend. It imports configs from `~/.claude/` and `~/.claude.json`, organizes them with categories/tags, bundles them into Scenes, and deploys Scenes to projects via symlinks and `.mcp.json` files.

## Commands

```bash
# Development (runs Vite frontend + Rust backend concurrently)
npm run tauri dev

# Production build (outputs .app to src-tauri/target/release/bundle/macos/)
npm run tauri build

# Frontend-only dev server (no Tauri IPC — limited functionality)
npm run dev

# Tests
npm test                          # Frontend (vitest)
npm run test:watch                # Frontend watch mode
cd src-tauri && cargo test        # Rust backend
npm run test:all                  # Both frontend + backend

# Lint
npx eslint src/                   # ESLint (flat config)
```

## Architecture

### IPC Boundary

Frontend calls Rust via `safeInvoke()` (`src/utils/tauri.ts`), which wraps Tauri's `invoke()` with environment detection. All backend commands are registered in `src-tauri/src/lib.rs` via `tauri::generate_handler![]`. The Rust command modules live in `src-tauri/src/commands/` — one file per domain (skills, mcps, config, data, etc.).

Types must stay in sync across the boundary:
- Rust: `src-tauri/src/types.rs` (all types use `#[serde(rename_all = "camelCase")]`)
- TypeScript: `src/types/index.ts`, `src/types/claudeMd.ts`, `src/types/plugin.ts`, `src/types/trash.ts`

### State Management

Each domain has its own Zustand store (`src/stores/`). Stores call `safeInvoke()` for persistence and apply optimistic updates. The `appStore` handles categories, tags, and cross-cutting UI state; domain stores (skillsStore, mcpsStore, scenesStore, etc.) handle their respective entities.

Reorder operations use a two-phase commit: synchronous optimistic update + queued async IPC, with version counters to detect stale responses.

### Data Storage

All app data lives in `~/.ensemble/`:
- `data.json` — categories, tags, scenes, projects, metadata (canonical backend state, protected by `DATA_MUTEX`)
- `settings.json` — user preferences
- `skills/` — managed skill directories
- `mcps/` — MCP config JSON files
- `claude-md/{id}/CLAUDE.md` — managed CLAUDE.md files (content stored as independent files, not in data.json)
- `trash/` — soft-deleted items (recoverable)

`ENSEMBLE_DATA_DIR` env var overrides the data directory (used for test isolation).

### MCP Configuration Locations

Claude Code reads MCP config from `~/.claude.json` (NOT `~/.claude/settings.json`). The `ClaudeJson` type in `types.rs` models this: user-scope MCPs at `mcpServers`, project-scope at `projects[path].mcpServers`. Project-level deployment writes `.mcp.json` in the project root.

Both stdio MCPs (command + args) and HTTP MCPs (url, no command) are supported. `ClaudeMcpConfig.command` defaults to `""` via `#[serde(default)]` to handle HTTP MCPs that lack a command field.

### Project Deployment (Sync)

When a Scene is synced to a project:
1. Skills: symlinked into `<project>/.claude/skills/`
2. MCPs: written to `<project>/.mcp.json`
3. CLAUDE.md: copied to configurable path (`.claude/CLAUDE.md`, `CLAUDE.md`, or `CLAUDE.local.md`)

### Routing

React Router in `src/App.tsx`. `MainLayout` wraps all pages with a sidebar. Pages: Skills, MCP Servers, CLAUDE.md, Scenes, Projects, Settings, plus dynamic Category/Tag filter pages.

### Window Behavior

macOS-standard: close hides the window (app stays in background). Dock icon click restores it. The `--launch` CLI flag starts hidden — used by the Finder Quick Action integration.

## Key Patterns

- **Path handling**: `expand_path()` / `expand_tilde()` in `src-tauri/src/utils/path.rs` expand `~` to home dir. `collapse_tilde()` does the reverse for display.
- **Frontend path alias**: `@/` maps to `src/` (configured in both `vite.config.ts` and `vitest.config.ts`).
- **Serde `#[serde(default)]` on String** = empty string when key missing, not when parse fails. Serde HashMap: if ANY entry fails to deserialize, the entire HashMap fails.
- **Plugin support**: Skills/MCPs can come from Claude Code marketplace plugins (`~/.claude/plugins/`). Plugin-sourced items have `installSource: "plugin"` with `pluginId`, `pluginName`, `marketplace` fields.
- **`McpConfigFile`** is constructed in both `import.rs` and `plugins.rs` — when adding fields to it, update both.
- **Husky + lint-staged**: pre-commit runs ESLint + Prettier on staged `src/` files.
