# v2.0 Feature Inventory — commits since v1.0.0

Range: v1.0.0 (2026-02-07) → HEAD (`59211c3`)
Total commits analyzed: 52

---

## Theme 1: Marketplace — Skill + MCP Discovery & Installation

The largest net-new surface in v2.0. A full in-app catalog for browsing, previewing, and installing Skills from skills.sh and MCP Servers from the official MCP Registry, all without leaving Ensemble.

### Added

- **Marketplace sidebar section**: a new "MARKETPLACE" navigation group (above the existing nav) with two entries — Skill Marketplace and MCP Marketplace — matching the visual density and interaction model of the Skills/MCP list pages. ([b61d6b5])

- **Skill Marketplace page**: live catalog backed by skills.sh internal API (~200 skills per page). Shows install count, yesterday delta, topics, GitHub stars, and an install button. Supports search and tag-based filtering. A "Source" badge distinguishes skills.sh items from any future source. ([b61d6b5], [62eaf7f])

- **MCP Marketplace page**: live catalog backed by the official MCP Registry (`registry.modelcontextprotocol.io`) with cursor pagination. Shows server name, description, and registry metadata. ([b61d6b5], [e01b014])

- **One-click install**: selecting a marketplace item and clicking Install downloads it into `~/.ensemble/skills/` (Skills) or `~/.ensemble/mcps/` (MCPs), with a confirmation banner toast. All install paths go through `sanitize_resource_name` to prevent path traversal. ([b61d6b5], [e7145ef], [be19817])

- **Skill installation via codeload tarball**: bypasses GitHub API rate limits by fetching the skill directory directly via GitHub's `codeload.github.com` tarball endpoint rather than the REST Contents API. ([be19817])

- **Collision handling**: if the item being installed already exists (or exists in Trash), a modal offers Replace or Restore-from-Trash. Restore round-trips the previous category/tags/icon from the Trash metadata snapshot so no organization is lost. ([b61d6b5])

- **Auto-Classify on install**: immediately after install, a single-item classify is triggered to suggest a category for the newly installed item, surfacing the same AI-powered classification flow as the existing bulk classify button. ([b61d6b5])

- **Add-to-Scene shortcut**: a shortcut banner and popover let the user add a freshly installed item to the last-edited Scene without navigating away from the marketplace. Active-Scene tracking persists `last_edited_scene_id` in `data.json`. ([b61d6b5])

- **24-hour catalog cache with SWR persistence**: catalog responses are stored in `~/.ensemble/` with a 24-hour TTL. A background refresh runs on app launch and surfaces a sync indicator badge in the sidebar while in progress. The persisted Zustand store (v4) keeps the catalog across app restarts so the page renders instantly on re-open. ([b61d6b5], [0271217])

- **Per-item icons derived from skill/MCP name**: an icon mapping utility (`marketplaceIcon.ts`) maps skills and MCPs to appropriate Lucide glyphs based on name keywords, so each list item shows a relevant icon rather than a generic placeholder. ([b369de2])

- **MCP "missing env vars" alert on Projects page**: `ProjectConfigPanel` shows a red "MCP CONFIGURATION ISSUES" alert listing any deployed MCPs that have required environment variables not yet filled in. ([b61d6b5])

- **Skill detail — Markdown README rendering**: the marketplace skill detail panel fetches the skill's README from GitHub and renders it as styled Markdown using `react-markdown` + `remark-gfm`. Headings, paragraphs, lists, code blocks, and tables all render with design-language tokens. ([7dbab0d])

- **Skill detail — GitHub stars**: the detail panel shows the upstream repository's star count alongside install metrics. ([7dbab0d])

- **Skill detail — AI Summary**: scrapes the skills.sh summary text (a one-paragraph description curated by the skills.sh team) and displays it above the README as a distinct block. ([5a2c71c])

- **Skill detail — Related skills**: surfaces up to 5 related skills filtered by shared topic (primary) or same owner/repo (fallback), sorted by install count descending. Sub-label reads "More in \<topic>" or "More from \<owner/repo>". ([5a2c71c])

- **MCP detail — publisher metadata (Phase A)**: mirrors `title`, `websiteUrl`, `publisher`, `license`, and `keywords[]` from the MCP Registry's `_meta.io.modelcontextprotocol.registry/publisher-provided` block. The header uses the server's human `title` (e.g. "inference.sh") instead of its reverse-DNS `id` (e.g. "io.inference/mcp"). A Publisher / License / Website info strip and a keyword chip row appear in the detail panel when present. ([ad6cfce])

- **MCP detail — publisher-curated examples (Phase A)**: a new `McpExamplesBlock` component renders publisher-provided example snippets (name + description + command or config JSON) between the README and the Configuration section. ([ad6cfce])

- **MCP install — env-var enrichment (Phase B)**: the MCP Registry wire schema is now fully deserialized (camelCase fields, `transport`, `environmentVariables[]`, `packageArguments[]`, `runtimeArguments[]`). Per-ecosystem install command derivation: `npm` → `npx -y`, `pypi` → `uvx`, `oci` → `docker run --rm -i`. Required env vars are surfaced in a simplified input form before install; secret fields render as password inputs with autocomplete disabled. ([59211c3])

- **MCP install — URL variables and HTTP headers (Phase B)**: HTTP MCPs from the registry that define URL template variables (`{VAR}`) or required headers get a dedicated input form at install time. Variable substitution writes the final URL to `.mcp.json`; headers are written as a `headers` map and forwarded to Claude Code via project `.mcp.json` sync. A "Save connection settings" button persists changes post-install via a new `update_mcp_http_config` IPC command. ([59211c3])

- **Full README in detail panels**: the 3 KB truncation on marketplace README content was removed; full README is fetched and displayed. ([b475726])

### Improved / Changed

- **Source link accuracy**: marketplace source links use the verified repository subpath (derived from live API data) rather than the display name, preventing broken links for skills whose repo path differs from their human name. ([31f8cc1])

- **"From" row in detail panels**: Scope and Source are shown as separate rows in the Skill and MCP detail panels. Marketplace-installed items show a dedicated "From" row containing the `MarketplaceSourceBadge` (skills.sh or MCP Registry link), rather than replacing the Install Scope display. ([db3e93f], [de81e53])

- **Default landing on Marketplace open**: navigating to the Marketplace sidebar entry lands on the Skill Marketplace page by default (not a blank state). ([0271217])

---

## Theme 2: Sidebar — Hierarchical Categories (Depth-2 Nesting)

### Added

- **Depth-2 category hierarchy**: categories can be organized into a two-level tree by dragging one category into another (drop-into). Child categories are indented 16 px under their parent; the parent row shows a disclosure chevron. A category with children cannot be made a child itself (max depth 2 enforced). ([a4cdcf7])

- **Drag-to-nest and drag-to-promote**: dragging a child category out of its parent (past the de-nesting threshold) promotes it back to root. Dragging a root category onto another makes it a child. The drop indicator correctly distinguishes "nest into" from "reorder before/after". ([a4cdcf7], [7821c07], [d0503cc], [e642b30], [66ae781])

- **Hierarchy-aware collision detection**: a custom `collisionDetection` algorithm distinguishes drop-into targets (center overlap) from reorder targets (edge proximity), preventing the overlay from snapping to the wrong target during fast drags. ([611c21c])

- **Category filter pages reflect hierarchy**: the Category filter page (CategoryPage) shows items belonging to both parent and child categories when filtering by a parent, so hierarchy is semantically meaningful for organization, not just visual. ([a4cdcf7])

- **Auto-Classify hierarchy awareness**: the auto-classify prompt and result type (`ClassifyResult.suggested_parent_category`) support the two-level hierarchy, allowing classification to suggest placement under a parent category. The backend `classify.rs` and `classifyHelpers.ts` helper were extended accordingly. ([b61d6b5] carry-over from hierarchy branch)

- **Data model migration**: existing flat-category data is automatically migrated to the new hierarchical schema on first launch; the `parent_id` field defaults to `null` preserving all prior organization. ([a4cdcf7])

- **Keyboard navigation for hierarchical drag**: `treeKeyboardCoordinates.ts` provides tree-aware keyboard drag support (left/right arrow promote/demote, up/down reorder), ensuring accessibility parity with mouse drag. ([a4cdcf7])

- **`CategoryTreeDropdown` component**: a new dropdown that renders the two-level category tree (with indented children) for use in item assignment forms (Skill/MCP detail panels, CLAUDE.md detail panel, Scene creation). ([a4cdcf7])

### Improved / Changed

- **Drop animation polish**: the drag overlay correctly transitions between "floating" and "settling" states with a distance-aware settle duration (120 + Δ × 0.5 ms, capped 280 ms), matching the design spec V2.3. Lift uses the documented two-stage 吸盘→拉离 physics. ([7b90e76])

- **Chevron + dot + name + count alignment**: sidebar category rows are pixel-measured to ensure the chevron, color dot, name text, and item count are all baseline-aligned regardless of whether the chevron is present (root categories with children vs. root categories without). ([05f1dc8])

- **Asymmetric promote/demote thresholds**: promoting a child to root requires dragging further (larger threshold) than demoting a root to a child, reducing accidental promotions during reorder. ([7821c07])

### Fixed

- **Drop indicator contract**: the drop position indicator (the thin blue line showing where an item will land) is correctly cleared when the pointer leaves the droppable area, preventing a stale indicator from persisting after a cancelled drag. ([d0503cc])

- **Stable drop-into targeting**: rapid pointer movement no longer causes the drop-into target to flicker between candidates; targeting uses a dwell-stabilized selection that only updates after the pointer settles. ([e642b30])

- **Promoted category drop position**: when a child category is promoted back to root during a drag, it lands at the correct list position (at the pointer location) rather than snapping to the end. ([66ae781])

- **Hierarchy drag systematic fixes (D1–D7)**: seven systematic drag bugs addressed — overlay position drift, snap modifier double-application, incorrect collision detection on deep nesting, keyboard sensor interference, and pointer-up ghost events. ([611c21c])

---

## Theme 3: Sidebar — Drag-and-Drop Reordering for Categories and Tags

### Added

- **Drag-to-reorder Categories**: sidebar categories can be reordered by dragging. Uses dnd-kit with a custom `CustomMouseSensor` (4 px activation distance, no long-press), a `DragOverlay` with three-layer hsl shadow, and a magnetic snap modifier for precise positioning near edges. ([17a2e62])

- **Drag-to-reorder Tags**: sidebar tag pills can be reordered by dragging in the same way. Tags use a pill-shaped overlay matching their resting style. ([17a2e62])

- **Keyboard reorder support**: both categories and tags support keyboard drag via the dnd-kit keyboard sensor; announcements (`announcements.ts`) provide screen-reader feedback for grab, move, and drop. ([17a2e62])

- **Reorder persistence**: reorder operations are persisted to `~/.ensemble/data.json` via a two-phase commit (synchronous optimistic update + async IPC with version counters to detect stale responses). ([17a2e62])

### Improved / Changed

- **CSS `translate3d` only for sortable rows**: sortable items use `CSS.Translate.toString(transform)` (not `CSS.Transform.toString`) to prevent row squeezing when neighbour heights differ during drag. ([17a2e62])

- **`cursor: default` on hover, `grabbing` only during drag**: macOS-native grab cursor behavior — no `grab` cursor shown on hover, matching Finder/Notes convention. ([17a2e62])

---

## Theme 4: View Options — Group + Sort Across List Pages

### Added

- **Unified ViewOptionsMenu component**: a popover menu accessible from every list page header that exposes independent Group and Sort axes. Sort preferences are persisted per-page in a new `sortPreferencesStore`. ([4fe27f3])

- **Skills page — Group by**: None / Categories / Tags. Tags grouping is a multi-valued pivot (a skill with multiple tags appears once in each matching bucket), consistent with Linear/Notion multi-tag behavior. ([4fe27f3])

- **Skills page — Sort by**: Name (A→Z) / Recently added / Recently used / Most used. Plugin-installed skills are implicitly sorted to the bottom within any sort axis ("plugin sink"). ([4fe27f3])

- **MCP Servers page — Group by**: None / Categories / Tags. **Sort by**: Name / Recently added / Recently used / Most used. Same plugin sink applies. ([4fe27f3])

- **CLAUDE.md page — Group by**: None / Categories / Tags. **Sort by**: Name / Recently added. ([4fe27f3])

- **Scenes page — Sort by**: Name / Recently created / Recently used. (No Group — Scenes have no categories/tags.) ([4fe27f3])

- **Projects page — Sort by**: Name / Recently synced. ([4fe27f3])

---

## Theme 5: Ghostty Terminal Support

### Added

- **Ghostty as a supported terminal**: Ensemble's Finder Quick Action and launch flow now support Ghostty in addition to Terminal.app, iTerm2, Warp, and Alacritty. The Settings page exposes Ghostty as a selectable terminal option. ([0f35b76], [a006a5c])

- **Version-gated Ghostty tab API**: Ghostty's tab-launch AppleScript is guarded by a version check; older Ghostty versions that do not support the tab API fall back to opening a new window, preventing launch errors on outdated installs. ([0a4eb82])

- **Preserve existing Ghostty instance**: if Ghostty is already running, the launch flow reuses the existing instance (activating it) rather than opening a duplicate. ([a7713e3])

### Fixed

- **Warp new-tab command restored**: a regression in the Warp terminal launch path (new tab command) introduced during the Ghostty branch merge was corrected. ([61ca971])

---

## Theme 6: Import & Settings UX Improvements

### Fixed

- **No pre-selected item on first launch**: the import modals (Skills and MCPs) now open with no item pre-selected, preventing accidental one-click imports before the user has reviewed the list. ([109417c])

- **Warning for local-file imports that relocate sources**: a tooltip clarifies that importing a locally-stored skill or MCP will copy it into `~/.ensemble/`, moving it away from its original location. ([109417c])

- **Null args/env omitted from MCP config**: `ClaudeMcpConfig` fields `args` and `env` skip serialization when `null`, preventing Claude Code from rejecting configs that include explicit `null` values for optional array/object fields. ([3779d79])

---

## Theme 7: Detail Panels — Scope/Source Cleanup

### Improved / Changed

- **Scope and Source as separate rows**: in both Skill and MCP detail panels, "Install Scope" (user/project scope selector) and "From" (marketplace source badge) are shown as distinct rows. Previously the marketplace badge replaced the scope selector for marketplace items, making it impossible to see or change scope on marketplace-installed items. ([db3e93f])

- **Dead detail pages removed**: the standalone `McpDetailPage` and `SkillDetailPage` routed pages (unused since the slide-panel model was adopted) were deleted, reducing dead code. ([de81e53])

---

## Theme 8: Auto-Classify Improvements

### Fixed

- **Auto-Classify button disabled when nothing to classify**: the "Auto-Classify" button on Skills, MCP Servers, CLAUDE.md, and Category pages is disabled (not just visually suppressed) when the visible item list is empty or all items already have a category assigned, preventing spurious API calls. ([c58ec90])

---

## Theme 9: Scene & Project List Polish

### Fixed

- **Ellipsis button visibility in SceneListItem**: the three-dot context menu button on scene rows was not always visible on hover due to a z-index conflict; corrected. ([f084912])

- **Stats text overflow in SceneListItem**: long stats text (item counts) no longer overflows the list item row boundary. ([25f3e3e], [ff9ee78])

- **Long description truncation in Scene detail header**: scene descriptions that exceed one line are now truncated with an ellipsis in the detail panel header rather than reflowing the layout. ([54fa8e8])

- **Project cards collapse when New Project panel opens**: expanding the "Add New Project" slide panel now collapses any expanded project card, preventing two open panels simultaneously. ([e6a7d13])

---

## Theme 10: CLAUDE.md Page Polish

### Fixed

- **Empty state vertical centering**: the CLAUDE.md page empty state (shown when no CLAUDE.md files are imported) is now vertically centered in the viewport rather than anchored to the top. ([208997a])

---

## Theme 11: Test Infrastructure

### Added / Fixed (infrastructure only — not user-visible)

- **Test isolation panic guard**: `get_app_data_dir()` now panics with a descriptive message if called during `cargo test` without `ENSEMBLE_DATA_DIR` set, making it physically impossible for tests to accidentally write to `~/.ensemble/`. A `ScopedDataDir` helper manages the env var for test cases. ([116bdda])

- **Comprehensive frontend test suite**: added via `8067af4` — Vitest config, test helpers, and component/store tests for Badge, EmptyState, Toggle, `appStore`, `settingsStore`, `parseDescription`, `tauri` utils, and `constants`. ([8067af4])

- **Category hierarchy test suite**: `SortableCategoriesList`, `SortableCategoryRow`, `DragOverlayCategoryRow`, `treeUtilities`, `treeKeyboardCoordinates`, `categoryTree`, `CategoryPage`, `appStore.moveCategoryToParent`, `appStore.moveCategoryToParentAtPosition`, and `appStore.migration` tests added. ([a4cdcf7], [611c21c])

---

## Exclude from user-facing release notes

- **Codex autonomous development workflow** (`8067af4`, `b1667a5`, `26ae0d2`): `.codex/`, `.github/workflows/codex.yml`, `AGENTS.md`, GitHub Actions CI/PR workflows, husky + prettier setup. These are developer tooling and CI infrastructure; they don't affect the app the user downloads.

- **`.dev/` research artifacts** (multiple `docs:` and `chore:` commits): `.dev/sidebar-reorder/`, `.dev/category-hierarchy/`, `.dev/sidebar-hierarchy-fix/`, `.dev/marketplace-prd/`, `.dev/marketplace-impl/`, `.dev/mcp-marketplace-impl/`, `.dev/session-review/`, `.dev/release-execution-plan.md`, `.dev/auto-classify-analysis.md`, `.dev/release-readiness-analysis.md`. All internal design/planning documents — not shipped to users.

- **`.claude/rules/` additions** (`a4cdcf7`, `b1667a5`, `be7bace`, `72b0449`, `62eaf7f`, `e7145ef`): project-level Claude Code rules (`design-language.md`, `cross-document-cascade-discipline.md`, `fix-must-define-user-observable-success.md`, `replace-installed-app-in-place.md`, `validate-curated-upstream-ids.md`, `validate-no-public-api-claim.md`, `measure-before-iterative-tuning.md`, etc.). Developer workflow tooling.

- **Session retrospectives** (`be7bace`): `.dev/session-review/` documents. Internal.

- **Merge commit** (`4334574`): `Merge remote-tracking branch 'origin/main' into agent/feat/CLA-152-add-ghostty-terminal`. No user-visible change.

- **README/docs-only commits** (`f0b950f`, `5f8c354`, `6de6929`, `0ddd166`, `9b3b83c`, `b970a8c`, `f3866b9`, `72b0449`, `be7bace`): screenshots, README fixes, notarization notice removal, research artifact docs. None touch app code.

- **CI/GitHub Actions removal** (`26ae0d2`): removes scheduled Codex check from `.github/workflows/codex.yml`. CI plumbing.

---

## Suggested Release-Note Top-Line Highlights (5 bullets)

1. **In-app Marketplace**: browse and install 200+ Skills from skills.sh and 100+ MCP Servers from the official MCP Registry directly inside Ensemble — complete with live stats, Markdown READMEs, GitHub stars, AI summaries, and one-click install with auto-classify.

2. **Hierarchical Categories**: organize your Skills, MCPs, and CLAUDE.md files into a two-level category tree by dragging items into parent categories — the sidebar, filter pages, and auto-classify all understand the hierarchy.

3. **Drag-to-Reorder Sidebar**: categories and tags can now be reordered by dragging, with macOS-grade physics (magnetic snap, distance-aware settle, multi-layer lift shadow) and full keyboard accessibility.

4. **Group + Sort on every list page**: a new View Options menu lets you group by Category or Tag and sort by name, recency, or usage on the Skills, MCP Servers, CLAUDE.md, Scenes, and Projects pages — with preferences persisted per page.

5. **Ghostty terminal support**: the Finder Quick Action and launch flow now support Ghostty alongside Terminal.app, iTerm2, Warp, and Alacritty.

---

## Open Questions for Lead Agent

1. **MCP Phase B — user-visible completeness**: the env-var enrichment and HTTP headers work in `59211c3` involves several interaction states (secret fields, URL variable substitution, post-install "Save connection settings"). Should release notes describe this in detail or summarize as "MCP install now fills in required environment variables and HTTP headers at install time"?

2. **Warp restore (`61ca971`) vs. v1.0.0 baseline**: Warp new-tab was present in v1.0.0 but was broken by the Ghostty branch merge and then restored. Should this appear as a "Fixed" bullet (it is a regression fix) or be omitted (the end state is the same as v1.0.0)?

3. **`3779d79` null-args fix**: this fix prevents `null` args/env from reaching Claude Code's schema validation. Users who manually edited MCPs with null fields would have silently broken configs. Include as a "Fixed" bullet for transparency, or omit as too low-level?

4. **Test infrastructure commits**: the `8067af4` Codex commit added a significant vitest + CI test suite alongside the Codex workflow files. The test suite itself is user-quality-relevant (regression prevention) but invisible to the end user. Mention it in a "Technical" section of the changelog?

5. **CLAUDE.md + auto-classify context on the hierarchy carry-over**: the auto-classify hierarchy-aware changes landed in `b61d6b5` as a "carry-over" from the hierarchy branch. Should they be credited to the Marketplace theme or the Hierarchical Categories theme in the changelog?
