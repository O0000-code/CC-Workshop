# README + docs Audit for v2.0

## Style Conventions (locked)

- **Heading case**: Title Case for all `##` and `###` headings (e.g. "Finder Integration", "Tech Stack", "Build from Source"). Sentence case is not used.
- **Dash convention**: `--` (double-hyphen, ASCII) is the in-sentence em-dash substitute throughout README.md and all docs files. The v1.0.0 GitHub release body used the Unicode `—` em-dash, but that is release-notes only (not docs). Do not introduce `—` into README.md or docs files.
- **Bullet style**: `- ` prefix always (never `*`). Bold-prefix bullets use `**Label**:` followed by prose on the same line (seen in CHANGELOG). Second-level bullets indented two spaces. No trailing punctuation on bullet items.
- **Bold prefix for feature bullets**: `**Feature Name**: Description` (colon immediately after the closing `**`). This is the CHANGELOG and release-notes pattern. README feature bullets omit the bold prefix; they just describe the capability directly.
- **Voice**: Third-person product description throughout (README, docs/README.md, docs/installation.md). Second-person instructional ("Navigate to...", "Click...") appears only in usage.md step-by-step sections. Do not mix.
- **Code-block conventions**: Fenced triple-backtick blocks with language tag when applicable (`bash`, `rust`, `typescript`, `tsx`, `css`). Inline code with single backticks for paths, file names, commands, flags.
- **Section ordering in README.md**: Overview → Features (sub-headed) → Installation → Usage → Tech Stack → Documentation → License → Contributing. Do not reorder.
- **Image embed conventions**: Top-level hero image as bare `![alt](path)`. Secondary screenshots as a centered `<p align="center">` block with three `<img>` thumbnails at `width="32%"`. Alt text is a brief descriptive phrase.
- **Table style**: Pipe-aligned markdown tables. Header separator is `|------|------|`. Used for structured data only (data locations, tech stack, routing).

---

## Per-file Verdicts

### ./README.md

**Status**: small-edits

Three concrete stale items; several things are already abstract enough to remain accurate without change.

**Stale / incorrect content:**

1. **Line 33 — "Support for plugin-installed skills (from Claude Code marketplace)"**
   The parenthetical `(from Claude Code marketplace)` is now ambiguous: Ensemble v2.0 ships its own Skill and MCP Marketplace (different from Claude Code's plugin system). The clause should be removed or rephrased to distinguish the two.
   - Line 33: `- Support for plugin-installed skills (from Claude Code marketplace)` → `- Support for plugin-installed skills (from Claude Code plugins)`

2. **Lines 123-124 — `backups/` in the data location tree is present; the `installation.md` first-launch section omits it but the README includes it**
   The `backups/` directory is real (confirmed in `~/.ensemble/`) — no change needed here; it is already accurate in README.md.
   Status on this item: **no change needed**.

3. **Lines 61-69 — Organization and Finder Integration sections are still accurate**
   The new sidebar drag-and-drop reorder and hierarchical categories are organizational UI improvements to the sidebar, not a new top-level feature category that README-level users need called out separately. The existing "Organization" bullet (`Categories and tags for Skills, MCP Servers, and CLAUDE.md files`) correctly describes the capability at the right abstraction level.
   Status: **no change needed**.

**Missing v2.0 content that should be added:**

4. **Marketplace** — The biggest new feature in v2.0 is the Skill Marketplace and MCP Marketplace. The README's Features section has no mention of it. This is user-facing enough to warrant a new bullet under Features, at the same level as the existing sub-sections. It should be placed between "Organization" and "Finder Integration" (discovery before deployment).

   Add a new `### Marketplace` sub-section after `### Organization`:

   ```markdown
   ### Marketplace
   - Browse and install Skills from the community Skills catalog (skills.sh)
   - Browse and install MCP Servers from the MCP Registry (registry.modelcontextprotocol.io)
   - One-click install into your managed library, with auto-classification
   ```

5. **Ghostty terminal** — Line 68 lists terminals as "Terminal.app, iTerm2, Warp, or Alacritty". Ghostty was added in v2.0. Should be updated to include it.
   - Line 68: `- Configurable terminal: Terminal.app, iTerm2, Warp, or Alacritty` → `- Configurable terminal: Terminal.app, iTerm2, Warp, Alacritty, or Ghostty`
   - Line 68 (Finder Integration paragraph, launching sentence): no change — the launch sentence is generic.

**Things that are already fine and should not change:**

- The Overview section and core workflow steps (lines 9-20) remain accurate.
- The hero image and thumbnail block (lines 21-27) have no stale references.
- The Skills, MCP Servers, CLAUDE.md, Scenes, Projects sections accurately describe the capabilities (the new Marketplace supplements these; it does not replace them).
- The Installation section is accurate.
- The Usage / Quick Start section is accurate.
- The Data Location section: `backups/` is present and real; no change.
- The Tech Stack section is accurate.
- The Documentation links point to real files.

---

### ./CHANGELOG.md

**Status**: needs-section-add

The `## [Unreleased]` section is empty. For v2.0 release, it should become `## [2.0.0] - <date>` with a new empty `## [Unreleased]` above it, and the footer link table should gain a `[2.0.0]` row.

See the CHANGELOG.md [2.0.0] section template at the end of this document.

---

### ./docs/README.md

**Status**: small-edits

The docs/README.md is an index table with links. Most of it is accurate at the abstraction level it operates at.

**Missing v2.0 content:**

1. **Additional Features table** (lines 43-49) does not list the Marketplace. The Marketplace is user-visible enough to appear here alongside AI Auto-Classification and Finder Integration. Add a row:

   ```markdown
   | **Marketplace** | Browse and install Skills and MCP Servers from community catalogs directly into your library. | [Usage Guide -- Marketplace](./usage.md#marketplace) |
   ```

   Place it as the first row in the Additional Features table (it is the headline new feature).

2. **Core Concepts table** (lines 33-38): The five concepts (Skills, MCP Servers, Scenes, Projects, CLAUDE.md) remain accurate. The hierarchical categories and drag-and-drop reorder are sidebar navigation improvements, not a new primary concept. No change needed here.

**Things that are already fine:**

- Getting Started steps (Install → First-Time Setup → Learn the Core Concepts) remain accurate.
- The For Contributors section links are all still valid.

---

### ./docs/installation.md

**Status**: unchanged

All content is accurate for v2.0:
- System requirements (macOS 12.0+, Apple Silicon or Intel) — unchanged.
- Download instructions — unchanged.
- Build from source steps — unchanged.
- First-launch data directory structure — accurate (omits `backups/` and `marketplace-cache/`, which are fine to omit from installation docs; they are created lazily and are not user-facing at first launch).
- Verification steps — accurate.
- Uninstallation instructions — accurate; the Finder Quick Action path is still correct.

No change needed.

---

### ./docs/usage.md

**Status**: needs-section-add + small-edits

**Missing v2.0 content:**

1. **Marketplace section entirely absent.** The Marketplace is the primary new user-facing surface in v2.0. A new `## Marketplace` section should be added before `## Auto-Classification` (the existing section order is: First-Time Setup → Core Concepts → Auto-Classification → Finder Integration → Terminal Support → Trash and Recovery → Plugin Support → Tips). The Marketplace belongs between Plugin Support and Tips, or between Auto-Classification and Finder Integration. Given its prominence, it should come directly after the Core Concepts block and before Auto-Classification.

2. **View Options (Group + Sort menu)** — The Skills, MCP Servers, CLAUDE.md, and related pages now have a unified View Options menu for grouping and sorting. This is a non-trivial discoverability feature. It warrants a single bullet mention in the relevant per-concept "Managing" sections (Skills step 2, MCPs step 2) or a brief callout in the Tips section.

3. **Ghostty terminal missing from Terminal Support table** (lines 211-218). The table lists Terminal.app, iTerm2, Warp, and Alacritty. Ghostty was added in v2.0.

   Add a row to the terminal table:
   ```markdown
   | **Ghostty** | Uses Ghostty's AppleScript API to open a new window or tab. |
   ```

4. **Hierarchical categories** — The Categories and Tags section (lines 162-167) says "Categories have names and colors. Navigate to a category in the sidebar to view all items in that category." In v2.0, categories can be nested (depth-2 parent/child). The description should note this.
   - Line 166: `- **Categories** -- Each item can belong to one category. Categories have names and colors. Navigate to a category in the sidebar to view all items in that category.`
   → `- **Categories** -- Each item can belong to one category. Categories have names and colors and can be nested (subcategories appear indented under a parent). Navigate to a category in the sidebar to view all items in that category.`

5. **Sidebar reorder** — Categories and Tags can now be reordered via drag-and-drop in the sidebar. Worth one brief note in the Categories and Tags section.
   - Append to the existing Categories and Tags paragraph: `Categories and tags can be reordered by dragging within the sidebar.`

**Specific line-level changes:**

| Location | Current | Replace with |
|---|---|---|
| Line 210 (terminal table) | _(end of Alacritty row)_ | Add Ghostty row (see text above) |
| Line 166 | `Categories have names and colors.` | `Categories have names and colors and can be nested (subcategories appear indented under a parent).` |
| Line 167 | `Categories and tags can be created, renamed, and deleted from the sidebar.` | `Categories and tags can be created, renamed, deleted, and reordered by dragging within the sidebar.` |

**Things that are already fine:**

- All Core Concepts sections (Skills, MCP Servers, Scenes, Projects, CLAUDE.md) remain accurate.
- Auto-Classification section is accurate.
- Finder Integration section is accurate.
- Trash and Recovery is accurate.
- Plugin Support is accurate.
- Tips section is accurate (Tip 3 about auto-classification and Tip 4 about Finder integration remain valid).

---

### ./docs/development.md

**Status**: small-edits

**Stale / incorrect content:**

1. **Line 268 — Default route table says "Redirects to `/skills`"**
   In v2.0 the default route redirects to `/marketplace-skills` (confirmed in `src/App.tsx` line 21). The routing table must be corrected.
   - Line 268: `| \`/\` | Redirects to \`/skills\` | Default route |` → `| \`/\` | Redirects to \`/marketplace-skills\` | Default route |`

2. **Lines 268-276 — Routing table missing marketplace routes**
   Two new routes exist: `marketplace-skills` and `marketplace-mcps`. Add them:
   ```
   | `/marketplace-skills` | `SkillMarketplacePage` | Skill Marketplace |
   | `/marketplace-mcps` | `McpMarketplacePage` | MCP Marketplace |
   ```
   Place them immediately after the `/` default-redirect row.

3. **Lines 194, 200 — Project Structure lists `McpDetailPage.tsx` and `SkillDetailPage.tsx`**
   These files no longer exist in `src/pages/`. The current page list is: `CategoryPage`, `ClaudeMdPage`, `McpMarketplacePage`, `McpServersPage`, `ProjectsPage`, `SceneDetailPage`, `ScenesPage`, `SettingsPage`, `SkillMarketplacePage`, `SkillsPage`, `TagPage`.
   Remove the stale entries; add the marketplace pages.

4. **Lines 459-505 — "Registered Tauri Commands (Complete)" section**
   Multiple new command groups exist that are not listed:
   - Under **Data** (`commands/data.rs`): add `reorder_categories`, `set_category_parent`, `migrate_category_id_for_skills_mcps`, `reorder_tags`, `reset_auto_classify_data`
   - New section **Marketplace** (`commands/marketplace.rs`): `list_marketplace_skills`, `search_marketplace_skills`, `get_marketplace_skill_readme`, `get_marketplace_mcp_readme`, `get_marketplace_repo_stars`, `get_marketplace_skill_summary`, `list_skill_topics_map`, `list_marketplace_mcps_page`, `list_recently_updated_mcps`, `search_marketplace_mcps`, `update_mcp_http_config`, `install_marketplace_skill`, `install_marketplace_mcp`, `auto_classify_marketplace_item`, `refresh_marketplace_cache`, `update_mcp_env_vars`

5. **Line 55 — reqwest purpose comment is "HTTP client (for Anthropic API)"**
   reqwest is now also used for Marketplace API calls (skills.sh, registry.modelcontextprotocol.io). The description should be widened.
   - Line 55: `| reqwest | 0.12 (features: json) | HTTP client (for Anthropic API) |` → `| reqwest | 0.12 (features: json, gzip) | HTTP client (Anthropic API, Marketplace catalog fetches) |`

6. **Line 581 — "Ensemble version (currently 1.0.0)"**
   Should be updated to `2.0.0` at release time.
   - Line 581: `- Ensemble version (currently 1.0.0)` → `- Ensemble version (currently 2.0.0)`

**Things that are already fine:**

- Architecture overview, tech stack table (except reqwest note), development setup, available scripts — all accurate.
- Frontend project structure directory tree (except the two stale page files noted above) — accurate.
- Backend (`src-tauri/`) project structure tree is accurate; `marketplace.rs` and `marketplace_seed.rs` are not listed but this section never claimed to be exhaustive for backend files (it shows top-level modules only, and `mod.rs` implicitly covers them).
- Key Concepts sections (Tauri Commands pattern, safeInvoke, path aliases, state management, styling, data storage) — all accurate.
- Building section — accurate.
- Contributing section — accurate (except the version number noted above).

---

### ./docs/bugfix-scenes-ellipsis.md

**Status**: recommend retire at v2.0

This file is an internal developer bug-analysis document, not a user-facing document. It is a snapshot of a specific bug investigation that was resolved before v1.0.0 shipped. It has no ongoing value for v2.0 users or contributors:

- The bug (SceneListItem ellipsis button visibility) was fixed in the `f084912` commit and has been stable since.
- The file is not linked from `docs/README.md` or any other documentation.
- A new contributor encountering this file would assume it describes an unfixed bug, which could be confusing.

**Recommendation**: Move to `.dev/` or delete entirely. If the root-cause analysis is considered historically valuable, move it to `.dev/bugfix-archive/scenes-ellipsis.md`. Do not update or republish it as part of the v2.0 docs set.

---

## v2.0 GitHub Release Body — Template

```markdown
A macOS desktop application for managing Claude Code configurations -- Skills, MCP Servers, and CLAUDE.md files.

## Highlights

- **Skill Marketplace** -- Browse and install community Skills from skills.sh directly into your library, with AI-powered auto-classification on install
- **MCP Marketplace** -- Browse and install MCP Servers from the MCP Registry (registry.modelcontextprotocol.io) with one click
- **Hierarchical Categories** -- Organize with depth-2 nested categories (subcategories indent under a parent in the sidebar)
- **Sidebar Reorder** -- Drag to reorder categories and tags in the sidebar
- **View Options** -- Unified Group + Sort menu across Skills, MCP Servers, CLAUDE.md, and category/tag filter pages
- **Ghostty Terminal Support** -- Added Ghostty alongside Terminal.app, iTerm2, Warp, and Alacritty

## What's Included

### Marketplace
- Skill Marketplace mirrors skills.sh catalog with topic filtering, GitHub stars, AI summaries, and README previews
- MCP Marketplace mirrors registry.modelcontextprotocol.io with cursor-paginated browsing, recently-updated feed, and search
- One-click install adds items to your managed library and auto-classifies them
- Environment variable configuration available immediately after MCP install

### Organization
- Categories support one level of nesting -- drag a subcategory under a parent in the sidebar
- Categories and tags can be reordered by dragging
- View Options menu (funnel icon) on list pages lets you group by category or scope, and sort by name, date added, or usage

### Core Management (unchanged from v1.0.0)
- Import existing configurations from `~/.claude/` and `~/.claude.json`
- Category and tag organization with custom colors and icons
- AI-powered auto-classification via Claude CLI
- Global or project-level scope control
- Usage statistics tracking

### Scenes & Projects (unchanged)
- Bundle Skills, MCPs, and CLAUDE.md files into reusable Scenes
- One-click configuration sync via symlinks (Skills) and `.mcp.json` (MCPs)

### System Integration
- Finder Quick Action for right-click folder access
- Terminal selection: Terminal.app, iTerm2, Warp, Alacritty, **Ghostty**
- Trash and recovery system for deleted items

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

## Checksums (SHA-256)

| File | SHA-256 |
|------|---------|
| `Ensemble_2.0.0_aarch64.dmg` | `<sha256>` |

## Technical Stack

- Tauri 2 (Rust backend + WebView frontend)
- React 18 + TypeScript + Tailwind CSS 4
- Zustand state management
- Native macOS window with custom titlebar

---
**Full Changelog**: https://github.com/O0000-code/Ensemble/compare/v1.0.0...v2.0.0
```

---

## CHANGELOG.md [2.0.0] Section — Template

Insert between `## [Unreleased]` and `## [1.0.0]`. Replace the empty `## [Unreleased]` block with a new empty one above. Update the footer link table.

```markdown
## [Unreleased]

## [2.0.0] - 2026-MM-DD

### Added

#### Marketplace
- **Skill Marketplace**: Browse and install community Skills from skills.sh
  - Topic filtering, GitHub stars, AI-generated summaries, and README previews
  - One-click install with auto-classification
  - SWR-style cache with manual refresh
- **MCP Marketplace**: Browse and install MCP Servers from registry.modelcontextprotocol.io
  - Cursor-paginated browsing, recently-updated feed, and full-text search
  - One-click install with environment variable configuration
  - Publisher metadata, example prompts, and README previews

#### Organization
- **Hierarchical Categories**: Categories now support one level of nesting -- drag a subcategory under a parent in the sidebar
- **Sidebar Reorder**: Drag to reorder categories and tags in the sidebar
- **View Options**: Unified Group + Sort menu (funnel icon) on Skills, MCP Servers, CLAUDE.md, Category, and Tag pages
  - Group by: category, scope, or none
  - Sort by: name, date added, or usage count

#### System Integration
- **Ghostty Terminal**: Added Ghostty alongside Terminal.app, iTerm2, Warp, and Alacritty for launching Claude Code

### Changed

- Default landing page is now the Skill Marketplace (was Skills list)
- Auto-classify disabled when there are no items to classify

### Fixed

- Sidebar category rows: chevron, dot/name, and count alignment corrected
- Detail panels: Scope and Source rows separated across all panels
- SceneListItem: ellipsis button visibility and position
- Import: default no-selection on first launch; warning when local imports relocate sources
- CLAUDE.md: centered empty state vertically

[Unreleased]: https://github.com/O0000-code/Ensemble/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/O0000-code/Ensemble/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/O0000-code/Ensemble/releases/tag/v1.0.0
```

> Note: The existing `[Unreleased]` and `[1.0.0]` footer lines should be replaced with all three lines above.

---

## Open Questions for Lead Agent

1. **Release date**: The CHANGELOG template uses `2026-MM-DD`. Confirm the exact date before committing.

2. **`bugfix-scenes-ellipsis.md` disposition**: Recommend retiring (moving to `.dev/` or deleting). Confirm before acting.

3. **`01_features_changelog.md` not available**: The cross-reference document was not written when this audit ran (the `.dev/release-v2.0/` directory was empty). This audit is based on direct git-log and codebase inspection. If `01_features_changelog.md` is written later and lists features not covered here (e.g. additional bug fixes, minor UX changes), the CHANGELOG template's `### Fixed` and `### Changed` sections should be extended accordingly.

4. **`reqwest` version in development.md**: The Cargo.toml shows `reqwest = { version = "0.12", features = ["json", "gzip"] }` -- the `gzip` feature was added for Marketplace. If the tech-stack table in development.md is kept as a living document, the version+features cell should be updated. Confirm the Lead Agent should update this.

5. **Screenshots**: The README hero image and thumbnails reference `docs/screenshots/skill-detail.png`, `docs/screenshots/claude-md-list.png`, `docs/screenshots/mcp-detail.png`, and `docs/screenshots/category-filter.png`. If any of these screens changed substantially (e.g. if the Skills page now shows View Options or if the category-filter page shows hierarchical categories), new screenshots may be warranted. This audit cannot assess this without visual inspection.
