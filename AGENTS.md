# CC Workshop -- AI Agent Project Guide

## Project Overview

CC Workshop is a **Tauri 2** desktop application for managing Claude Code Skills, MCP Servers,
and CLAUDE.md configuration files. It provides a unified GUI to organize, import, export,
and deploy these resources across projects.

- **Platform**: macOS only (minimum macOS 12.0)
- **Identifier**: `io.github.o0000-code.ensemble`
- **Data directory**: `~/.cc-workshop/` (data.json, settings.json, skills/, mcps/, claude-md/)

## Architecture

**Tauri 2 dual-process model**: a Rust backend (core logic + filesystem) communicates with
a React frontend (UI + state) via Tauri IPC commands.

### Directory Map

```
CC Workshop2/
├── src/                        # React frontend
│   ├── components/             # UI components (10 groups: common, layout, skills, mcps, ...)
│   ├── pages/                  # Page components (12 pages)
│   ├── stores/                 # Zustand state management (12 stores)
│   ├── types/                  # TypeScript type definitions
│   └── utils/                  # Helpers (tauri.ts, constants.ts, parseDescription.ts, text.ts)
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands/           # Tauri IPC commands (13 modules: skills, mcps, claude_md, ...)
│   │   ├── utils/              # Parser + path utilities
│   │   ├── types.rs            # Shared data types (serde-serializable)
│   │   ├── lib.rs              # Tauri app builder + command registration
│   │   └── main.rs             # Entry point
│   └── Cargo.toml
├── docs/                       # Project documentation
└── package.json
```

### IPC Communication

- Frontend calls Rust via `safeInvoke<T>(command, args)` from `src/utils/tauri.ts`
- `safeInvoke` wraps `@tauri-apps/api/core` `invoke` with Tauri environment detection
- Backend commands are annotated with `#[tauri::command]` and registered in `lib.rs`

## Tech Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Frontend | React 18 + TypeScript 5.9                     |
| Styling  | Tailwind CSS 4 (`@tailwindcss/vite` plugin)   |
| State    | Zustand 5                                     |
| Routing  | react-router-dom 7                            |
| Backend  | Tauri 2.9 + Rust (edition 2021)               |
| Build    | Vite 6 (frontend) + Cargo (backend)           |
| Icons    | lucide-react                                  |

## Build & Run

### Prerequisites

- Node.js 20+ (`nvm use 20`)
- Rust stable (latest, via `rustup`)
- Tauri CLI: `cargo install tauri-cli`

### Setup

```bash
npm install                          # Frontend dependencies
cd src-tauri && cargo fetch          # Rust dependencies
```

### Development

```bash
npm run tauri dev                    # Start full app (frontend + backend, hot-reload)
npm run dev                          # Frontend-only dev server (port 1420)
```

### Production Build

```bash
npm run tauri build                  # Build distributable macOS app
npm run build                        # Frontend-only build (tsc + vite build)
```

## Testing

### Quick Validation

```bash
npx tsc --noEmit && cd src-tauri && cargo test
```

### Frontend Tests

- **Framework**: Vitest + @testing-library/react + jsdom
- Run: `npm run test`
- Coverage: `npm run test:coverage`
- Full suite: `npm run test:all`

### Backend Tests

- Run: `cd src-tauri && cargo test`
- Lint: `cd src-tauri && cargo clippy -- -D warnings`
- Format check: `cd src-tauri && cargo fmt --check`

### Post-Change Verification

- After **frontend** changes: `npx tsc --noEmit && npm run test`
- After **Rust** changes: `cd src-tauri && cargo test && cargo clippy -- -D warnings`
- After **both**: `npx tsc --noEmit && npm run test && cd src-tauri && cargo test && cargo clippy -- -D warnings`

## Key Conventions

- **Path alias**: `@/` maps to `src/` (configured in tsconfig.json + vite.config.ts)
- **Components**: Functional components + React Hooks only
- **Styling**: Tailwind CSS 4 utility classes (no CSS modules)
- **Commits**: Conventional Commits format (`type(scope): description`)
- **Detailed docs**: Maintained in `docs/` directory

## Agent Instructions

### Workflow

1. For team or PR-based work, prefer **independent branches**; use Linear Issue's `gitBranchName` when available
2. Run post-change verification (see Testing section) before committing
3. Create Linear Issue for new discoveries (label: `needs-triage`)

### PR Naming

- Format: `Fixes PER-{N}: {short description}`
- Reference the Linear Issue ID in the PR body

### Linear Project Binding

- Use Linear MCP to dynamically discover team and project information
- All issues MUST be assigned to the "CC Workshop" project (create it if it doesn't exist)
- All issues MUST include an "CC Workshop" label for proper routing (create it if it doesn't exist)
- Do NOT hardcode any Linear IDs — always resolve them dynamically via MCP tools

### Dual-Language Awareness (TypeScript + Rust)

- Frontend types in `src/types/` must stay in sync with Rust types in `src-tauri/src/types.rs`
- When modifying IPC command signatures, update **both** the Rust `#[tauri::command]` handler
  and the corresponding `safeInvoke` call on the frontend
- Rust changes may require `cargo build` to verify compilation before running tests

### Prohibited Actions

- **NEVER** modify `tauri.conf.json` signing identity, version, or bundle configuration
- **NEVER** modify `Cargo.lock` directly (it is managed by Cargo)
- **NEVER** force-push to `main` or delete protected branches
- **NEVER** commit secrets, API keys, or credentials
- **NEVER** modify this `AGENTS.md` without explicit human approval
