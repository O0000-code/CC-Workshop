# Uncommitted Changes Triage

## Summary
- 14 modified files (analyzed below)
- 4 untracked `.dev/` dirs (analyzed below)
- `.gitignore` status for `.dev/`: **not mentioned** — `.dev/` is not gitignored, and the project convention is to commit `.dev/` research artifacts selectively (11 sub-paths are currently tracked; the 4 new ones are not)

---

## Modified Files — File-by-File

### src-tauri/src/commands/classify.rs
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Two independent changes. (1) The auto-classify prompt's Step 3 sub-category guidance is expanded from "optional, use when helpful" to "mandatory when ≥2 items share the same root but distinct sub-domains" — adds an explicit examples table and a clear "when NOT to nest" list. (2) The hardcoded `--model sonnet` CLI arg is replaced by a runtime lookup from `read_settings()` with a small allow-list validation (`opus | sonnet | haiku`), defaulting to `opus` on unknown/error.
- **Status:** Complete. No debug markers, no TODO, both changes are coherent and independently useful.
- **Recommended grouping:** `feat(classify): configurable model + stronger sub-category guidance`

---

### src-tauri/src/commands/data.rs
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Three additions. (1) `delete_category` gains a cascade-clear loop: when a category is deleted, all `skill_metadata`, `mcp_metadata`, and `claude_md_files` entries that referenced it (by id or legacy name) are cleared of their `category_id`/`category` references atomically before `write_app_data`. (2) `delete_tag` gains the equivalent cascade for tag deletion — clears tag from `skill_metadata.tags`, `mcp_metadata.tags` (by name, since those are name-based), and `claude_md_files.tag_ids` (by id). (3) New `#[tauri::command] reset_auto_classify_data()` clears all categories, tags, and every item's category/tag assignments in a single atomic write — used by the Settings page "Reset" button.
- **Status:** Complete. The command is registered in `lib.rs` at line 116. The cascade logic is well-commented and handles both the id-based and legacy name-based reference paths. No debug markers.
- **Recommended grouping:** `feat(classify): cascade-clear on category/tag delete + reset command`

---

### src/components/claude-md/ClaudeMdDetailPanel.tsx
- **Last commit:** `a4cdcf7 feat(sidebar): hierarchical (depth-2) Categories with drop-into nesting`
- **Diff summary:** The raw `whitespace-pre-wrap` div used to render CLAUDE.md content is replaced with `<MarkdownBody source={selectedFile.content} />`. The "no content" empty state is also improved from an unstyled div to a muted `<span>` with zinc-400 color. This makes CLAUDE.md files render their Markdown formatting (headers, code blocks, lists) the same way the marketplace already does.
- **Status:** Complete. `MarkdownBody` is an existing marketplace component; this is a straightforward reuse.
- **Recommended grouping:** `feat(detail-panels): render instructions/content as Markdown`

---

### src/components/sidebar/SortableTagsList.tsx
- **Last commit:** `17a2e62 feat(sidebar): add drag-and-drop reordering for Categories and Tags`
- **Diff summary:** Two related layout fixes for the collapsed tags list. (1) `minHeight` calculation changes from `tags.length / 4` to `visibleTags.length / 4` — when the list is collapsed (showing 10 of 30+), the old formula produced a `minHeight` far exceeding the actual rendered content, causing `flex-wrap` to stretch empty space between rows. (2) The sortable container gains `content-start` Tailwind class to override `align-content: stretch` default, which further prevents phantom row stretching.
- **Status:** Complete. A targeted layout bug fix triggered by an auto-classify session screenshot (referenced in the `.dev/auto-classify-context-overflow/` research). No debug markers.
- **Recommended grouping:** `fix(sidebar): tags list minHeight + content-start when collapsed`

---

### src/components/skills/SkillDetailPanel.tsx
- **Last commit:** `db3e93f fix(detail-panels): show marketplace source as a dedicated "From" row`
- **Diff summary:** Identical Markdown rendering upgrade as `ClaudeMdDetailPanel`. The instructions content area switches from `whitespace-pre-wrap` plain text to `<MarkdownBody source={selectedSkill.instructions ?? ''} />`. The description paragraph keeps its own `whitespace-pre-wrap` style (appropriate since description is always short plain text). This mirrors the identical change in `SkillsPage.tsx`.
- **Status:** Complete.
- **Recommended grouping:** `feat(detail-panels): render instructions/content as Markdown` (same commit as ClaudeMdDetailPanel)

---

### src/pages/CategoryPage.tsx
- **Last commit:** `a4cdcf7 feat(sidebar): hierarchical (depth-2) Categories with drop-into nesting`
- **Diff summary:** The `handleAutoClassify` function previously called only `autoClassifySkills()`. It now calls all three store auto-classify functions in parallel (`autoClassifySkills`, `autoClassifyMcps`, `autoClassifyClaudeMd`) with a `{ categoryIds: visibleIds }` scope so only items assigned to the current category (and its descendants) are classified. The `isClassifying` spinner state is OR'd from all three store flags so the button reflects any in-flight run.
- **Status:** Complete. The `ClassifyScope` type and the `autoClassify(scope?)` signature were already added to all three stores (see store diffs).
- **Recommended grouping:** `feat(classify): scope-aware classify in CategoryPage + TagPage`

---

### src/pages/SettingsPage.tsx
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Four additions. (1) The "Marketplace" section is renamed to "Auto Classify" and gains a new "Classification model" row with a `CustomSelect` dropdown (Opus / Sonnet / Haiku) wired to the new `classifyModel` setting. (2) A "Reset auto-classify data" row with a danger-variant `ActionButton` that opens a confirm modal. (3) The confirm modal is a new `<Modal>` with stat rows (tabular-nums aligned numbers) showing counts of categories, tags, and classified items that will be cleared — zero counts are hidden. (4) `ActionButton` gains `variant` and `disabled` props; `CustomSelect` gains a `minWidth` prop; `Row` gains `gap-4` to prevent text/control collision. The Reset button is disabled when there is nothing to reset.
- **Status:** Complete. The `reset_auto_classify_data` backend command is registered. All counts reload correctly after reset via `Promise.all([loadCategories, loadTags, loadSkills, loadMcps, loadClaudeMdFiles])`. No dangling TODO, no console.log.
- **Recommended grouping:** `feat(settings): classify model picker + reset auto-classify action`

---

### src/pages/SkillsPage.tsx
- **Last commit:** `de81e53 fix(detail-panels): apply Scope/Source separation to remaining callsites + remove dead pages`
- **Diff summary:** Identical Markdown rendering upgrade as `SkillDetailPanel` — the inline skill detail panel (rendered on the Skills page directly) switches from raw `whitespace-pre-wrap` to `<MarkdownBody>` for the `instructions` content. The description paragraph keeps its own plain-text style.
- **Status:** Complete.
- **Recommended grouping:** `feat(detail-panels): render instructions/content as Markdown` (same commit)

---

### src/pages/TagPage.tsx
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Mirrors the `CategoryPage.tsx` change exactly — `handleAutoClassify` now calls all three stores in parallel with a `{ tagId }` scope instead of calling only `autoClassifySkills()` unscoped. The `isClassifying` OR pattern is identical.
- **Status:** Complete.
- **Recommended grouping:** `feat(classify): scope-aware classify in CategoryPage + TagPage` (same commit)

---

### src/stores/__tests__/settingsStore.test.ts
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** A single line: adds `classifyModel: 'opus'` to the expected default settings object in the test. This keeps the test in sync with the new `classifyModel` field added to `defaultSettings` in `settingsStore.ts`.
- **Status:** Complete. A necessary test maintenance change.
- **Recommended grouping:** part of `feat(settings): classify model picker + reset auto-classify action`

---

### src/stores/claudeMdStore.ts
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** The `autoClassify()` signature gains an optional `scope?: ClassifyScope` parameter. When a scope is provided, the function filters `files` to only those matching the scope's `categoryIds` set or `tagId` before building the classify payload. CLAUDE.md uses id-only references (`categoryId` + `tagIds`), so no legacy-name fallback is needed. The error message also differentiates between "no files at all" vs "no files in scope."
- **Status:** Complete.
- **Recommended grouping:** `feat(classify): scope-aware classify in CategoryPage + TagPage` (same cluster)

---

### src/stores/mcpsStore.ts
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Identical scope-filter addition as `claudeMdStore` and `skillsStore`. `autoClassify()` gains `scope?: ClassifyScope`. MCP servers use the same dual-read pattern (prefer `categoryId`, fall back to category name) as skills. Tag matching resolves the id to a name via `tagNameById` map.
- **Status:** Complete.
- **Recommended grouping:** `feat(classify): scope-aware classify in CategoryPage + TagPage` (same cluster)

---

### src/stores/settingsStore.ts
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Adds `classifyModel: ClassifyModel` to `SettingsState`, `defaultSettings` (defaulting to `'opus'`), `setClassifyModel` action, `loadSettings` deserializer, and `saveSettings` serializer. The `ClassifyModel` type is imported from `@/types`. Setting is persisted to `~/.ensemble/settings.json` via the existing `saveSettings` path.
- **Status:** Complete. Wired end-to-end: frontend → `settingsStore` → `write_settings` → `settings.json` → `classify.rs` reads at classify-time.
- **Recommended grouping:** `feat(settings): classify model picker + reset auto-classify action` (same commit)

---

### src/stores/skillsStore.ts
- **Last commit:** `b61d6b5 feat(marketplace): implement V2.0 Skill + MCP Marketplace`
- **Diff summary:** Two changes. (1) `autoClassify()` gains `scope?: ClassifyScope` with the same dual-read filter pattern as `mcpsStore`. (2) The `instructions` field is **removed** from the `ClassifyItem` payload — only `name` and `description` are sent. A detailed comment cites the `Prompt is too long` context-overflow failure that prompted this (documented in `.dev/auto-classify-context-overflow/05_recommendation.md`) and the empirical finding that description-only produces equal accuracy.
- **Status:** Complete. This is a meaningful behavioral change (omitting instructions reduces token count substantially for large skill libraries).
- **Recommended grouping:** Belongs with the scope-aware classify cluster, but the `instructions` omission is a behavioral fix worth calling out in the commit message. Could be separate or combined depending on Lead Agent preference.

---

## Untracked .dev/ Directories

### .dev/auto-classify-context-overflow/
- **Contents:** 23 files — Python scripts (`build_prompt.py`, `compare.py`, `extract.py`, `run.sh`), 4 Claude JSON output samples (`03_run_A/B/C/D.json`), a comparison report (`04_comparison.md`), 49K metrics file, recommendation doc (`05_recommendation.md`), implementation plan (`06_plan.md`), plus sample/sanity inputs. All timestamps: 2026-05-12 ~02:14–02:29.
- **Task it researched:** The "Prompt is too long" context-overflow failure in auto-classify when instructions were included in the payload. The research compared description-only vs description+instructions across 4 Claude runs and produced the recommendation to drop `instructions` from the payload (implemented in `skillsStore.ts`).
- **Convention check:** 11 other `.dev/` sub-paths are tracked. The project clearly commits research artifacts as documentation of "why" decisions were made. This directory is the direct evidence base for the `skillsStore` `instructions` omission change — it is referenced by name in the code comment.
- **Recommendation:** **Commit alongside the classify feature commit.** The code comment in `skillsStore.ts` cites `05_recommendation.md` by name; leaving it untracked makes the citation a dead link. Omit the binary outputs (`03_run_*.json`, `04_metrics.json`, `02_sanity_A2.json`) and the generated scripts if size is a concern, but the recommendation doc and plan should be tracked. Alternatively, commit the whole directory — it's 80K of text + tiny JSONs.

---

### .dev/mcp-detail-audit/
- **Contents:** `screenshots/` subdirectory only — 6 image files (1 PNG ~1.3MB, 1 PNG ~255KB, 2 Playwright screenshots ~14MB + 920KB + 1.7MB, 1 EXA result image ~1MB). All timestamps: 2026-05-12 14:51–15:06.
- **Task it researched:** Visual audit of the MCP detail panel UX — screenshots from Smithery, Glama, PulseMCP, MCP.so and Chrome DevTools showing stdio vs HTTP MCP display patterns. This appears to be research for how to render the MCP detail panel (related to the MCP Phase A/B commits).
- **Recommendation:** **Do not commit.** Screenshots-only directories with no markdown analysis documents are pure machine-local artifacts. Total size ~18MB of PNG/JPEG. Nothing to reference from code.

---

### .dev/project-understanding/
- **Contents:** 6 files — `00_index.md` (6.1K), `A_marketing_positioning.md` (13K), `B_feature_panorama.md` (17K), `C_backend_architecture.md` (15K), `D_frontend_architecture.md` (15K), `E_design_language_evolution.md` (19K). All timestamps: 2026-05-12 15:54–16:00.
- **Task it researched:** A comprehensive project understanding baseline — 5 parallel Explore SubAgents produced domain analyses (marketing, features, backend arch, frontend arch, design language). The index states its purpose: "为未来 session 提供完整、可引用的 Ensemble 项目认知基线" (provide a complete, citable project cognition baseline for future sessions).
- **Recommendation:** **Commit.** This is explicitly intended for future session use ("通过 `@.dev/project-understanding/<file>.md` 直接 inline 到提示中"). It's all markdown, no images (~85K total). Consistent with the project convention of committing research artifacts that serve as reference documentation.

---

### .dev/skills-detail-audit/
- **Contents:** `screenshots/` subdirectory only — 4 image files (3 JPEG ~4.5MB + 2.2MB + 1MB, 1 wide JPEG ~1MB). All timestamps: 2026-05-12 10:58–11:00.
- **Task it researched:** Visual audit of the Skills detail panel — screenshots from Claude Code marketplace and Microsoft Foundry, likely research for how to render the skill detail panel (related to the Markdown rendering changes in `SkillDetailPanel.tsx` and `SkillsPage.tsx`).
- **Recommendation:** **Do not commit.** Screenshots-only, no markdown analysis, ~9MB of JPEG. Same reasoning as `mcp-detail-audit`.

---

## .gitignore Status

`.dev/` is **not in `.gitignore`**. The project convention (confirmed by `git ls-files .dev/`) is selective tracking: 11 sub-paths are committed, 4 are currently untracked. Adding `.dev/` to `.gitignore` would break existing tracked content. The correct approach is to continue the selective pattern — tracking research artifacts that are referenced from code or intended for future session use, leaving ephemeral image-only audit directories untracked.

No change to `.gitignore` is recommended.

---

## Recommended Commit Plan

The 14 modified files cluster into 4 logical themes. Suggested order (each is independent):

### Commit 1 — Classify: Scoped classify, model picker, instructions omission, prompt improvements
**Files:**
- `src-tauri/src/commands/classify.rs`
- `src-tauri/src/commands/data.rs`
- `src/stores/skillsStore.ts`
- `src/stores/mcpsStore.ts`
- `src/stores/claudeMdStore.ts`
- `src/pages/CategoryPage.tsx`
- `src/pages/TagPage.tsx`
- `src/stores/settingsStore.ts`
- `src/stores/__tests__/settingsStore.test.ts`
- `src/pages/SettingsPage.tsx`

**Draft message:**
```
feat(classify): scope-aware classify, configurable model, cascade deletes, reset

- CategoryPage + TagPage auto-classify now runs all 3 item types (skills, MCPs,
  CLAUDE.md) in parallel, scoped to the current category/tag hierarchy
- classify.rs reads classifyModel from settings.json at call time (opus/sonnet/haiku,
  validated allowlist; default opus) — replaces hardcoded --model sonnet
- skillsStore drops `instructions` from ClassifyItem payload to prevent context-
  overflow on large libraries; description-only shown equal-or-better accuracy
  (see .dev/auto-classify-context-overflow/05_recommendation.md)
- classify.rs prompt Step 3 expanded: sub-category nesting is now mandatory when
  ≥2 items share root but distinct sub-domains; adds examples table + "when not to
  nest" rules
- data.rs: delete_category + delete_tag now cascade-clear item references atomically
- data.rs: new reset_auto_classify_data command wipes all categories/tags/assignments
- settingsStore: classifyModel persisted to settings.json; Settings page gains model
  picker (Opus/Sonnet/Haiku) + Reset section with confirm modal showing counts
```

If the Lead Agent prefers to split Settings UI from backend logic, the natural seam is:
- **1a** (backend + stores): classify.rs, data.rs, skillsStore, mcpsStore, claudeMdStore, CategoryPage, TagPage
- **1b** (settings UI): settingsStore, settingsStore.test, SettingsPage

---

### Commit 2 — Detail panels: Markdown rendering for instructions/content
**Files:**
- `src/components/skills/SkillDetailPanel.tsx`
- `src/pages/SkillsPage.tsx`
- `src/components/claude-md/ClaudeMdDetailPanel.tsx`

**Draft message:**
```
feat(detail-panels): render skill instructions and CLAUDE.md content as Markdown

Replaces whitespace-pre-wrap plain-text rendering with <MarkdownBody> in the
skill detail panel (SkillDetailPanel + SkillsPage inline panel) and CLAUDE.md
detail panel. Short description paragraphs retain their own pre-wrap styling.
```

---

### Commit 3 — Sidebar: Tags list layout fix
**Files:**
- `src/components/sidebar/SortableTagsList.tsx`

**Draft message:**
```
fix(sidebar): tags list minHeight and content-start when list is collapsed

minHeight was computed from total tags.length; when collapsed (showing 10 of 30+),
this produced excess height that flex-wrap's stretch alignment spread across rows.
Fix: use visibleTags.length for minHeight and add content-start to the container.
```

---

### Commit 4 — Research artifacts
**Files to add:**
- `.dev/auto-classify-context-overflow/` (all files — referenced from skillsStore.ts comment)
- `.dev/project-understanding/` (all .md files — intended as future-session reference)

**Draft message:**
```
docs(dev): auto-classify context-overflow research + project understanding baseline

auto-classify-context-overflow: empirical comparison of description-only vs
description+instructions payloads across 4 Claude runs; 05_recommendation.md is
cited by skillsStore.ts as the rationale for dropping instructions from the payload.

project-understanding: 5-domain baseline (marketing, features, backend, frontend,
design-language) generated 2026-05-12 for future session reference.
```

---

## Open Questions for Lead Agent

1. **Commit 1 split:** The Settings UI changes (model picker + reset modal) are frontend-only while the backend cascade/reset/model changes are Rust + store logic. Split into 1a + 1b, or keep as one commit? Keeping together makes the feature story clearer; splitting makes individual diffs smaller.

2. **`instructions` omission in `skillsStore`:** This is a behavioral regression for users who rely on instructions content for accurate classification (edge case: skills with generic names but rich instruction bodies). The code comment justifies it empirically. Should this be called out more prominently in the commit message, or is the current approach (comment + research artifact citation) sufficient?

3. **`.dev/auto-classify-context-overflow/` commit scope:** The directory includes Python scripts and raw JSON output files in addition to the markdown docs. Commit all 23 files, or only the markdown analysis docs (`04_comparison.md`, `05_recommendation.md`, `06_plan.md`)? The scripts and JSONs add context but also noise.

4. **`.dev/mcp-detail-audit/` and `.dev/skills-detail-audit/`:** These are screenshot-only directories (~27MB combined). Recommendation is to leave untracked. Confirm, or should they be explicitly gitignored individually?
