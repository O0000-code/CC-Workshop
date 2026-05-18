# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **cmux terminal support** ([#6](https://github.com/O0000-code/CC-Workshop/issues/6)). Settings → Launch Configuration → Terminal Application now offers **cmux** alongside Terminal / iTerm2 / Warp / Ghostty / Alacritty. cmux's "tab vs new window" Open Mode is honoured (same toggle as Warp / Ghostty).
- Launch path uses cmux's bundled CLI at `/Applications/cmux.app/Contents/Resources/bin/cmux` (argv-only — no shell, no AppleScript), so folder names with spaces, quotes, or shell metacharacters cannot inject. Each `cmux ping` probe during cold-start polling is hard-capped at 500 ms to prevent a wedged socket from hanging the launch flow.

### Setup note (cmux only)

cmux ships with `automation.socketControlMode = "cmuxOnly"` in `~/.config/cmux/cmux.json` by default, which rejects external CLI control. The first time CC Workshop tries to launch cmux, you'll see a multi-line hint with the one-time fix:

1. Open `~/.config/cmux/cmux.json`
2. Add or set `"automation": { "socketControlMode": "automation" }`
3. **Fully quit cmux (Cmd-Q) and reopen it** — `cmux reload-config` does NOT pick up this setting.

### Changed

- **Open Mode label is now brand-agnostic**: the row previously titled "Warp Open Mode" / "Ghostty Open Mode" is now "Open new sessions as" for all three brands. Avoids the awkward sentence-start lowercase "cmux Open Mode" while reading cleanly for every supported terminal.

## [2.3.0] - 2026-05-18

### Changed

- **Data directory renamed: `~/.ensemble/` → `~/.cc-workshop/`.** Automatic one-time migration on first launch — no user action required. Your installed Skills, MCPs, Categories, Tags, Scenes, Projects, CLAUDE.md, and Rules are moved atomically, and every absolute-path string inside `data.json` and `settings.json` (HashMap keys + Scene `skillIds` / `mcpIds` + per-entry `sourcePath`) is rewritten so the `Skill::id == sourcePath` invariant holds across the move. A pre-migration backup of `data.json` is kept at `~/.cc-workshop/data.json.pre-migration.bak` for one-shot inspection.
- **Environment variable**: `CC_WORKSHOP_DATA_DIR` is the new name for test isolation and power-user overrides. The legacy `ENSEMBLE_DATA_DIR` is still honoured (back-compat), with `CC_WORKSHOP_DATA_DIR` taking priority when both are set.
- **Breadcrumb left at old location**: `~/.ensemble/MOVED_TO_CC_WORKSHOP.txt` explains where your data went. The legacy directory contains nothing else and is safe to delete.

### Edge cases handled

- Plugin-sourced Skills (symlinks into `~/.claude/plugins/cache/`) are preserved as symlinks across the move (`cp -RP` in the cross-volume fallback).
- Cross-volume `$HOME` (rename returns `EXDEV`): falls back to `cp -RP` + post-copy verification + `rm -rf`; refuses to delete the source unless the copy is verified.
- Symlinked legacy directory (user-aliased `~/.ensemble` to an external volume): skip migration to preserve user intent.
- Both `~/.ensemble/` and `~/.cc-workshop/` already populated: surface a non-blocking conflict notice; neither directory is modified.
- Idempotent: re-running after a successful migration is an O(1) no-op (legacy dir contains only the breadcrumb).

### Surfacing

A dismissible bottom-left notice appears once per launch with the migration outcome (`migrated` / `conflict` / `failed`). Startup is never blocked — the notice is informational only.

## [2.2.0] - 2026-05-18

### Changed

- **Renamed: Ensemble → CC Workshop.** The product, GitHub repo, Bundle ID, Cargo crate, and npm package all renamed in a single coordinated change. The old GitHub URL `O0000-code/Ensemble` automatically redirects to `O0000-code/CC-Workshop`, so existing references (X posts, shared links) continue to resolve. The `~/.ensemble/` data directory is intentionally preserved — your installed Skills, MCPs, Categories, Tags, Scenes, Projects, CLAUDE.md, and Rules are not touched. The previous app at `/Applications/Ensemble.app` will need to be replaced manually with the new `/Applications/CC Workshop.app`; both Bundle IDs are different so they will coexist if the old one is not removed.

## [2.1.4] - 2026-05-16

### Fixed

#### Filesystem & Startup
- Skill / MCP ids normalise to Unicode NFC (macOS Finder rename creates NFD; git clone / Linux scp / iCloud creates NFC; previously tracked as separate entries) -- a one-shot migration rewrites existing `data.json` keys
- Startup `~/.ensemble/` writability probe with structured `CCWorkshopDirUnwritable:` error and a `chown` hint in a dedicated alertdialog (previously a silent fallback to empty AppData)
- Quick Action uses `std::env::current_exe()` instead of hard-coded `/Applications/CC Workshop.app`

#### Plugin Install & Trash
- Plugin import returns structured `PluginImportResult` with per-item reasons; partial failures surface as a red banner inside the modal
- Empty Trash button + per-row permanent delete on every Trash Recovery tab (with inline confirm overlays)
- Plugin marker orphan cleanup on detect -- re-installed plugins are visible again after CC Workshop notices the previous install was wiped

#### Sync, Input & Reliability
- HTTP MCP install / update rejects empty URLs and unresolved `{VAR}` placeholders
- `fetch_mcp_tools` captures child-process stderr so MCP startup failures are visible to the user
- Terminal pre-flight check before launch (no more silent no-op when the configured terminal is uninstalled)
- `syncProject` reports per-step success / failure (partial sync no longer indistinguishable from full success)
- IME composition guard on 11 text-input Enter handlers (Chinese / Japanese / Korean users)

## [2.1.3] - 2026-05-15

### Security

- AppleScript injection guard for Terminal.app and iTerm launch paths -- project paths and Claude argv are now escaped before AppleScript interpolation, matching the existing Warp and Ghostty paths
- GitHub `owner` / `repo` validation in marketplace skill install -- the codeload URL is built from sanitized identifiers; unexpected characters in the catalog `source` field abort before any network request
- MCP Registry `registryType` allowlist -- unknown registry types no longer fall through to treating the package identifier as a binary to spawn
- Child-process environment isolation for `fetch_mcp_tools` so API keys present in CC Workshop's parent shell do not leak to third-party MCP servers

### Fixed (data integrity)

- Atomic `data.json` writes with last-known-good recovery -- power loss / disk full / process kill during a write can no longer corrupt the canonical app state
- File lock on `~/.claude.json` writes -- concurrent updates from CC Workshop and Claude Code itself no longer race and drop user-added MCP entries
- `clear_project_config` removes only CC Workshop-managed CLAUDE.md / `.mcp.json` / Rules; user-authored files at the same paths are no longer touched
- Trash restore round-trips full metadata (category, tags, icon, scope, usage stats) for Skills, MCP Servers, CLAUDE.md, Rules, **and Scenes / Projects** -- the previous version lost the curated metadata and Scenes / Projects could not be restored at all
- `claude_md` scan includes `.claude/CLAUDE.md` (the dotfile filter was previously too aggressive, hiding the most common location)
- Ownership mismatch on `~/.ensemble/` is reported instead of silently falling back to a different data directory
- Fresh-install default categories appear reliably (init order is now atomic)

### Fixed (marketplace install)

- Codeload tarball downloads now use a separate 120 s timeout (was sharing the 15 s JSON-API budget). On slower connections or larger curated repos (`microsoft/azure-skills`, `github/awesome-copilot`) the previous 15 s budget was cut mid-stream and reqwest surfaced the cut-off as the misleading `error decoding response body`
- Codeload download is streamed with bytes-so-far reporting; when a download does fail, the error now names the actual reqwest kind (Timeout / Decode / Connect / Body) and the byte count, instead of the bare body-decode label

### Fixed (UX)

- Trash Recovery modal includes a Rules tab and lists deleted Scenes / Projects -- the previous version made some delete operations effectively irreversible
- Deleting a Category or Tag cascades to Rules (previously left orphaned `categoryId` / `tagIds` references)
- `syncProject` rolls back partial state on failure mid-sync; the failure is surfaced to the UI
- Detail SlidePanel closes cleanly when the selected Skill / MCP is deleted (previously lingered empty)
- Add Category / Tag / Scene validate name uniqueness
- All Enter handlers guard against IME composition (no accidental submit during Chinese / Japanese / Korean input)
- HTTP MCP install rejects empty URLs and unsubstituted `{VAR}` placeholders at install time
- `importStore.importMcps` derives the right source directory for users with a custom `mcpSourceDir` setting
- `update_rule` / `update_claude_md` support clearing `categoryId`
- `syncProject` on filesystems without symlink support reports the failure instead of silent no-op
- Terminal launcher fallbacks are more resilient when the configured terminal is uninstalled
- Plugin import errors surface to the UI instead of being swallowed by `eprintln`

## [2.1.2] - 2026-05-14

### Fixed

- Scene detail panel surfaces an "Included Rules" section and a Rules count cell (the previous build accepted Rules in the Create Scene modal and wrote them on Sync, but the detail view rendered only Skills and MCP Servers)
- Scene list rows include a Rules chip alongside Skills / MCPs / Docs
- Project Configuration panel has a Rules card with the same Synced badge logic as Skills / MCP Servers / CLAUDE.md; the Assigned Scene subtitle reports the Rules count
- Project list rows include a Rules chip

## [2.1.1] - 2026-05-14

### Fixed

- Sidebar header alignment -- macOS native window controls (close / minimize / zoom) now sit on the same horizontal line as the sidebar's refresh button (`trafficLightPosition.y` tuned from 25 to 29 so both centers align)

## [2.1.0] - 2026-05-14

### Added

#### Rules Management
- **Rule** as a first-class managed entity alongside Skills, MCPs, and CLAUDE.md
  - Scans `~/.claude/rules/` (user-scope) and `<project>/.claude/rules/` (project-scope) for `.md` files
  - Imports preserve the original filename (Claude Code indexes Rules by filename); the displayed name can be renamed independently
  - Per-Rule `Set as Global` toggle writes to `~/.claude/rules/<filename>.md`; any number of Rules can be global simultaneously
  - Edits to a globally-active Rule propagate to `~/.claude/rules/<filename>.md` immediately (no re-toggle required)
  - Distribute a Rule to a project at `<project>/.claude/rules/<filename>.md` (Claude Code's only scanned location for project Rules)
  - Soft-delete to trash; restore from Settings; clearing a project's config removes only CC Workshop-managed Rule filenames (user-authored `.md` files in the same directory are never touched)
- **Scenes include Rules**: multi-select Rules tab in the Create Scene modal; Project sync writes each selected Rule via batch distribute
- **Category and Tag pages** include a Rules section alongside Skills, MCPs, and CLAUDE.md

[Unreleased]: https://github.com/O0000-code/CC-Workshop/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/O0000-code/CC-Workshop/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/O0000-code/CC-Workshop/compare/v2.1.4...v2.2.0
[2.1.4]: https://github.com/O0000-code/CC-Workshop/compare/v2.1.3...v2.1.4
[2.1.3]: https://github.com/O0000-code/CC-Workshop/compare/v2.1.2...v2.1.3
[2.1.2]: https://github.com/O0000-code/CC-Workshop/compare/v2.1.1...v2.1.2
[2.1.1]: https://github.com/O0000-code/CC-Workshop/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/O0000-code/CC-Workshop/compare/v2.0.0...v2.1.0

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
- **Finder Quick Action**: Right-click "Open with CC Workshop" for folders in Finder
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

[2.0.0]: https://github.com/O0000-code/CC-Workshop/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/O0000-code/CC-Workshop/releases/tag/v1.0.0
