# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-05-14

### Added

#### Rules Management
- **Rule** as a first-class managed entity alongside Skills, MCPs, and CLAUDE.md
  - Scans `~/.claude/rules/` (user-scope) and `<project>/.claude/rules/` (project-scope) for `.md` files
  - Imports preserve the original filename (Claude Code indexes Rules by filename); the displayed name can be renamed independently
  - Per-Rule `Set as Global` toggle writes to `~/.claude/rules/<filename>.md`; any number of Rules can be global simultaneously
  - Edits to a globally-active Rule propagate to `~/.claude/rules/<filename>.md` immediately (no re-toggle required)
  - Distribute a Rule to a project at `<project>/.claude/rules/<filename>.md` (Claude Code's only scanned location for project Rules)
  - Soft-delete to trash; restore from Settings; clearing a project's config removes only Ensemble-managed Rule filenames (user-authored `.md` files in the same directory are never touched)
- **Scenes include Rules**: multi-select Rules tab in the Create Scene modal; Project sync writes each selected Rule via batch distribute
- **Category and Tag pages** include a Rules section alongside Skills, MCPs, and CLAUDE.md

[Unreleased]: https://github.com/O0000-code/Ensemble/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/O0000-code/Ensemble/compare/v2.0.0...v2.1.0

## [2.0.0] - 2026-05-12

### Added

#### Marketplace
- **Skill Marketplace**: Browse and install community Skills from skills.sh
  - Live catalog with topic filtering, GitHub star counts, AI-generated summaries, and README previews
  - One-click install via the GitHub codeload tarball endpoint (no GitHub API rate limit)
  - Collision handling: Replace or Restore-from-Trash when an item already exists
  - Auto-Classify suggestion fires immediately after install
  - SWR-style 24-hour catalog cache with a background refresh on app launch
- **MCP Marketplace**: Browse and install MCP Servers from `registry.modelcontextprotocol.io`
  - Cursor-paginated browsing, a Recently Updated feed, and full-text search
  - Publisher metadata (title, website, license, keywords) and publisher-curated example snippets in the detail panel
  - Per-ecosystem install command derivation: `npm` → `npx -y`, `pypi` → `uvx`, `oci` → `docker run --rm -i`
  - Required environment variables surfaced as a form at install time; secret fields render as password inputs
  - HTTP MCPs with URL template variables (`{VAR}`) or required headers get a dedicated input form at install time and a "Save connection settings" action post-install

#### Organization
- **Hierarchical Categories**: Categories support one level of nesting -- drag a subcategory under a parent in the sidebar
  - Filter pages aggregate items from both parent and child categories
  - Auto-classify can suggest placement under a parent category
  - Asymmetric promote/demote thresholds reduce accidental drag-out promotions during reorder
- **Sidebar Reorder**: Drag categories and tags in the sidebar to reorder them
  - macOS-grade drag physics: 4 px activation, magnetic snap, distance-aware settle, multi-layer lift shadow
  - Keyboard reorder support with screen-reader announcements
- **View Options**: Unified Group + Sort menu (funnel icon) on Skills, MCP Servers, CLAUDE.md, Scenes, Projects, Category, and Tag pages
  - Group by: Categories, Tags, or None (multi-valued for Tags)
  - Sort by: Name, Recently added, Recently used, or Most used (per-page applicability)
  - Plugin-installed items implicitly sort to the bottom within any axis
  - Preferences persisted per page

#### System Integration
- **Ghostty Terminal**: Added Ghostty alongside Terminal.app, iTerm2, Warp, and Alacritty for launching Claude Code
  - Version-gated tab API: older Ghostty versions fall back to a new window
  - Reuses an existing Ghostty instance when one is already running

#### User Experience
- Skill instructions and CLAUDE.md content render as Markdown in the detail panels
- Auto-classify model is configurable from Settings (Opus, Sonnet, or Haiku; defaults to Opus)
- Reset auto-classify data action in Settings (clears all categories, tags, and item assignments after an explicit confirm with item counts)
- Auto-Classify on the Category and Tag filter pages runs Skills + MCPs + CLAUDE.md in parallel, scoped to the current category (and descendants) or tag
- Per-item icons on Marketplace list rows derived from skill / MCP name keywords
- "From" row in Skill and MCP detail panels surfaces the marketplace source as a distinct row from Scope
- MCP "missing environment variables" alert on the Projects page lists any deployed MCPs whose required env vars are not yet filled

### Changed

- Default landing page on app launch is now the Skill Marketplace
- Cascade-clear on category or tag delete: item references are atomically cleared before write
- Sidebar category rows: chevron, dot, name, and count are pixel-aligned with measurement-driven geometry
- MCP detail panel uses the upstream `title` (e.g. "inference.sh") rather than the reverse-DNS `id` when available

### Fixed

- Auto-Classify button is disabled when there are no items to classify
- Import modals open with no item pre-selected; a tooltip warns that local-file imports relocate sources into `~/.ensemble/`
- MCP config serialization omits `args` and `env` when null (Claude Code schema compliance)
- CLAUDE.md empty state is vertically centered
- SceneListItem: ellipsis button visibility and stats text overflow
- Scene detail panel header truncates long descriptions
- Project cards collapse when the "New Project" panel opens
- Sidebar tags list: minHeight and content-start when the list is collapsed (eliminates phantom row stretching)
- Sidebar hierarchical drag: drop-into target stability under rapid pointer movement, drop indicator clears on cancel, promoted categories land at the pointer position

## [1.0.0] - 2026-02-06

### Added

#### Core Management
- **Skills Management**: Import, organize, and deploy Claude Code skill files
  - Scan and import from `~/.claude/skills/`
  - Support for plugin-installed skills
  - Category and tag organization with custom icons
  - AI-powered auto-classification via Claude CLI
  - Global or project-level scope control
  - Usage statistics tracking

- **MCP Servers Management**: Manage Model Context Protocol server configurations
  - Import MCP configurations from `~/.claude.json`
  - Automatic tool discovery via MCP protocol
  - Category and tag organization
  - AI-powered auto-classification
  - Environment variable management
  - Scope control (global/project) with `~/.claude.json` sync

- **CLAUDE.md Management**: Manage Claude Code instruction files
  - Filesystem scanning for existing CLAUDE.md, CLAUDE.local.md, and `.claude/CLAUDE.md` files
  - Import and centrally manage CLAUDE.md files
  - Set a file as global context (`~/.claude/CLAUDE.md`)
  - Distribute to project directories with configurable paths

#### Organization
- **Categories**: Create and manage categories with custom colors
- **Tags**: Flexible tagging system with multi-item support
- **Category View**: Aggregate view of Skills, MCPs, and CLAUDE.md by category
- **Tag View**: Aggregate view of Skills, MCPs, and CLAUDE.md by tag

#### Scenes & Projects
- **Scenes**: Bundle Skills, MCPs, and CLAUDE.md files into reusable configuration presets
- **Projects**: Associate local project folders with Scenes
  - One-click configuration sync via symlinks (Skills) and `.mcp.json` (MCPs)
  - Configuration status tracking
  - Clear and re-sync as needed

#### System Integration
- **Finder Quick Action**: Right-click "Open with Ensemble" for folders in Finder
- **Terminal Selection**: Support for Terminal.app, iTerm2, Warp, and Alacritty
- **Configuration Sync**: Symlink-based Skills deployment and MCP config generation

#### User Experience
- Slide-in detail panel for all items
- Search and filter with category/tag sidebar
- Empty state guidance for new users
- Trash and recovery system for deleted items
- Import existing Claude Code configurations on first launch
- Plugin-installed Skills and MCPs detection

#### Technical Foundation
- Built with Tauri 2 (Rust backend + React frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

[2.0.0]: https://github.com/O0000-code/Ensemble/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/O0000-code/Ensemble/releases/tag/v1.0.0
