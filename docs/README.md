# Ensemble Documentation

Welcome to the Ensemble documentation. This guide covers everything you need to install, use, and contribute to Ensemble -- a macOS desktop application for managing Claude Code Skills, MCP Servers, CLAUDE.md files, and Rules.

For a high-level overview, see the [project README](../README.md).

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [Installation Guide](./installation.md) | System requirements, download, build from source, and verification |
| [Usage Guide](./usage.md) | Core concepts, features, and day-to-day workflows |
| [Development Guide](./development.md) | Architecture, tech stack, project structure, and contributing |

---

## Getting Started

1. **Install** -- [Download a pre-built release](./installation.md#option-1-download-pre-built-release) or [build from source](./installation.md#option-2-build-from-source)
2. **First-Time Setup** -- [Launch and import existing configurations](./usage.md#first-time-setup)
3. **Learn the Core Concepts** -- Read about the five building blocks below

---

## Core Concepts

These are the primary modules you will work with inside Ensemble. Each section links to its detailed description in the [Usage Guide](./usage.md).

| Concept | Description | Link |
|---------|-------------|------|
| **Skills** | Claude Code skill modules (markdown files that give Claude specialized capabilities). Managed in `~/.ensemble/skills/` with global or project-level scope. | [Usage Guide -- Skills](./usage.md#skills) |
| **MCP Servers** | Model Context Protocol servers that extend Claude Code with additional tools and data sources. Configurations stored in `~/.ensemble/mcps/`. | [Usage Guide -- MCP Servers](./usage.md#mcp-servers) |
| **CLAUDE.md** | Context files that provide instructions to Claude Code at the global or project level. | [Usage Guide -- CLAUDE.md](./usage.md#claudemd) |
| **Rules** | Modular `.md` instruction files under `.claude/rules/` that Claude Code loads to scope behaviour (e.g. coding conventions, review checklists). Managed in `~/.ensemble/rules/`. | [Usage Guide -- Rules](./usage.md#rules) |
| **Scenes** | Configuration bundles that combine multiple Skills, MCP Servers, CLAUDE.md files, and Rules into reusable templates. | [Usage Guide -- Scenes](./usage.md#scenes) |
| **Projects** | Link Scenes to local project directories so configurations can be deployed with one click. | [Usage Guide -- Projects](./usage.md#projects) |

---

## Additional Features

| Feature | Description | Link |
|---------|-------------|------|
| **Marketplace** | Browse and install Skills and MCP Servers from community catalogs directly into your library. | [Usage Guide -- Marketplace](./usage.md#marketplace) |
| **AI Auto-Classification** | Use the Claude CLI to automatically categorize, tag, and assign icons to Skills, MCPs, and CLAUDE.md files. | [Usage Guide -- Auto-Classification](./usage.md#auto-classification) |
| **Finder Integration** | Install a Quick Action to open project folders with Claude Code directly from Finder's right-click menu. | [Usage Guide -- Finder Integration](./usage.md#finder-integration-macos) |
| **Terminal Support** | Choose your preferred terminal (Terminal.app, iTerm2, Warp, Alacritty, or Ghostty) for launching Claude Code sessions. | [Usage Guide -- Terminal Support](./usage.md#terminal-support) |
| **Trash & Recovery** | Deleted items are moved to trash and can be restored from Settings. | [Usage Guide -- Trash & Recovery](./usage.md#trash-and-recovery) |

---

## For Contributors

If you want to contribute to Ensemble, the [Development Guide](./development.md) covers:

- [Architecture Overview](./development.md#architecture-overview) -- Tauri 2 + React + Rust
- [Tech Stack](./development.md#tech-stack) -- Frontend and backend dependencies
- [Development Setup](./development.md#development-setup) -- Prerequisites and getting started
- [Project Structure](./development.md#project-structure-complete) -- Frontend and backend layout
- [Building](./development.md#building) -- Development and production builds
- [Contributing](./development.md#contributing) -- Code style, PR process, and issue reporting
