# CC Workshop

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/O0000-code/CC-Workshop)](https://github.com/O0000-code/CC-Workshop/releases)
[![macOS](https://img.shields.io/badge/macOS-12.0%2B-black?logo=apple)](https://github.com/O0000-code/CC-Workshop/releases)

A macOS desktop application for managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) configurations -- Skills, MCP Servers, CLAUDE.md files, and Rules -- with visual organization, one-click project deployment, and Finder integration.

## Overview

As your collection of Claude Code Skills, MCP Servers, CLAUDE.md context files, and Rule instruction files grows, managing them through manual file editing becomes tedious and error-prone. CC Workshop provides a native macOS interface to organize, bundle, and deploy these configurations to your projects.

Core workflow:

1. **Import** existing configurations from `~/.claude/` and `~/.claude.json`
2. **Organize** with categories and tags (manual or AI-assisted)
3. **Bundle** related items into Scenes
4. **Deploy** Scenes to project folders via symlinks
5. **Launch** Claude Code from Finder with the right configuration

![CC Workshop - Skills Management with Detail Panel](docs/screenshots/skill-detail.png)

<p align="center">
  <a href="docs/screenshots/claude-md-list.png"><img src="docs/screenshots/claude-md-list.png" width="32%" alt="CLAUDE.md Management" /></a>
  <a href="docs/screenshots/mcp-detail.png"><img src="docs/screenshots/mcp-detail.png" width="32%" alt="MCP Server Detail" /></a>
  <a href="docs/screenshots/category-filter.png"><img src="docs/screenshots/category-filter.png" width="32%" alt="Category Filter" /></a>
</p>

## Features

### Skills Management
- Import existing skills from `~/.claude/skills/`
- Support for plugin-installed skills (from Claude Code plugins)
- Global or project-level scope control
- Usage statistics tracking from Claude Code logs

### MCP Servers Management
- Import MCP configurations from `~/.claude.json` (both user-scope and project-scope)
- Automatic tool discovery via MCP protocol
- Environment variable management
- Scope control (global/project) with automatic `~/.claude.json` sync

### CLAUDE.md Management
- Scan the filesystem for existing CLAUDE.md, CLAUDE.local.md, and `.claude/CLAUDE.md` files
- Import and centrally manage CLAUDE.md files
- Set a file as global context (`~/.claude/CLAUDE.md`)
- Distribute CLAUDE.md files to project directories
- Configurable distribution path: `.claude/CLAUDE.md`, `CLAUDE.md`, or `CLAUDE.local.md`

### Rules Management
- Scan `~/.claude/rules/` and project `.claude/rules/` directories for `.md` rule files
- Import and centrally manage Rule files; original filename is preserved (Claude Code indexes Rules by filename)
- Mark any number of Rules as global (`~/.claude/rules/<filename>.md`); edits propagate to the global copy immediately
- Distribute Rules to project directories at `<project>/.claude/rules/<filename>.md`
- Add multiple Rules to a Scene for batch deployment alongside Skills, MCPs, and CLAUDE.md

### Marketplace
- Browse and install Skills from the community Skills catalog (skills.sh)
- Browse and install MCP Servers from the MCP Registry (registry.modelcontextprotocol.io)
- One-click install into your managed library, with auto-classification on install
- README previews, GitHub stars, and AI summaries in the detail panel

### Scenes
- Bundle multiple Skills, MCP Servers, CLAUDE.md files, and Rules into reusable configuration sets
- One-click deployment to projects
- Scenes serve as templates for consistent project setup

### Projects
- Associate local project folders with Scenes
- Sync configurations via symlinks (Skills) and `.mcp.json` (MCPs)
- Clear and re-sync configurations as needed

### Organization
- Categories and tags for Skills, MCP Servers, CLAUDE.md files, and Rules
- Categories can be nested one level deep (subcategories indent under a parent in the sidebar)
- Drag to reorder categories and tags in the sidebar
- AI-powered auto-classification using the Claude CLI (`claude` command); choose between Opus, Sonnet, and Haiku
- Sidebar filtering by category and tag
- Group and sort options on every list page (by name, recency, or usage)

### Finder Integration
- "Open with CC Workshop" right-click Quick Action for folders in Finder
- Automatically syncs the project's Scene configuration and launches Claude Code
- Configurable terminal: Terminal.app, iTerm2, Warp, Alacritty, or Ghostty
- Customizable launch command

### Trash and Recovery
- Deleted Skills, MCPs, CLAUDE.md files, and Rules are moved to trash
- Recover deleted items from Settings

## Installation

### Prerequisites
- macOS 12.0 or later
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed

### Download
Download the latest `.dmg` from the [Releases](https://github.com/O0000-code/CC-Workshop/releases) page.

### Build from Source

Requirements:
- Node.js 18+
- Rust 1.77+

```bash
git clone https://github.com/O0000-code/CC-Workshop.git
cd CC Workshop

npm install

# Development
npm run tauri dev

# Production build
npm run tauri build
```

## Usage

### Quick Start

1. **Launch CC Workshop** -- on first launch, it detects existing Skills and MCPs and offers to import them
2. **Organize** -- add categories and tags, or use Auto Classify
3. **Create a Scene** -- bundle related Skills, MCPs, CLAUDE.md files, and Rules
4. **Add a Project** -- select a folder and assign a Scene
5. **Sync** -- deploy the Scene's configuration to the project

### Data Location

CC Workshop stores its data in `~/.ensemble/`:
```
~/.ensemble/
├── data.json           # Application data (skills, MCPs, scenes, projects, categories, tags, rules)
├── settings.json       # User preferences
├── skills/             # Managed skill directories
├── mcps/               # MCP configuration files (.json)
├── claude-md/          # CLAUDE.md files (each in its own subdirectory)
├── rules/              # Rule files (each in its own subdirectory)
├── backups/            # Timestamped backups from import operations
└── trash/              # Deleted items (recoverable)
    ├── skills/
    ├── mcps/
    ├── claude-md/
    └── rules/
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS 4, Zustand
- **Backend**: Tauri 2, Rust
- **Build**: Vite 6

## Documentation

See the [docs](./docs) directory for detailed guides:
- [Installation Guide](./docs/installation.md)
- [Usage Guide](./docs/usage.md)
- [Development Guide](./docs/development.md)

## License

MIT License

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.
