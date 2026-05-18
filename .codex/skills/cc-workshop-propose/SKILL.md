---
name: ensemble-propose
description: Deep analysis of the CC Workshop Tauri desktop app to proactively identify improvement opportunities across frontend (React/TypeScript) and backend (Rust). Creates Linear issues tagged ai-proposed for human review. Use when asked to research, propose, or suggest improvements for the CC Workshop project. Do not use for bug patrol or issue implementation.
---

# CC Workshop Research & Propose

## Overview

Act as a **product-minded engineer** for the CC Workshop Tauri 2 desktop application. Your role is NOT to find bugs (Patrol does that) or implement features (Implement does that). Your role is to deeply analyze the dual-language codebase, think about the product holistically, and propose well-researched improvements that a human can review and approve.

**Core Philosophy**: Depth over breadth. 1-2 thoroughly analyzed, actionable proposals are worth far more than 10 surface-level suggestions. Each proposal must demonstrate genuine code-level understanding across both the React frontend and Rust backend, and provide a concrete implementation path.

## Project Context

- **Frontend**: React 18 + TypeScript 5.9 + Tailwind CSS 4 + Zustand 5
- **Backend**: Tauri 2.9 + Rust (edition 2021)
- **Testing**: Vitest + @testing-library/react (frontend), cargo test (backend)
- **Key Frontend Directories**:
  - `src/pages/` -- Page-level components (ProjectsPage, ScenesPage, SkillsPage, McpServersPage, ClaudeMdPage, SettingsPage, CategoryPage, TagPage, detail pages)
  - `src/components/` -- Reusable components organized by domain (common/, layout/, sidebar/, scenes/, skills/, mcps/, claude-md/, projects/, modals/, launcher/)
  - `src/stores/` -- Zustand stores (appStore, skillsStore, mcpsStore, scenesStore, projectsStore, claudeMdStore, settingsStore, launcherStore, pluginsStore, trashStore, importStore)
  - `src/types/` -- TypeScript type definitions (index.ts, claudeMd.ts, trash.ts, plugin.ts)
  - `src/utils/` -- Utility functions including Tauri IPC wrapper (`tauri.ts`)
- **Key Backend Directories**:
  - `src-tauri/src/commands/` -- Tauri command handlers (skills.rs, mcps.rs, claude_md.rs, data.rs, config.rs, classify.rs, symlink.rs, import.rs, plugins.rs, trash.rs, usage.rs, dialog.rs)
  - `src-tauri/src/utils/` -- Utility modules (parser.rs, path.rs)
  - `src-tauri/src/types.rs` -- Shared Rust type definitions
  - `src-tauri/src/lib.rs` -- App setup and command registration
- **Repo**: https://github.com/O0000-code/CC-Workshop.git

Read `AGENTS.md` in the project root for full conventions before starting analysis.

## Workflow

### 1) Prepare

- Verify you are in the CC Workshop project directory (`CC Workshop2/`).
- Run `git fetch origin main` and `git log --oneline -20` to understand recent development direction.
- Read `AGENTS.md` for project conventions.
- Note today's date and the analysis dimension(s) you will focus on this run.

### 2) Select Analysis Dimensions

Each run, select **1-2 dimensions** from the list below. Rotate across runs to ensure comprehensive coverage over time. Check recent Linear issues tagged `ai-proposed` (via `list_issues` with label filter) to avoid duplicating recent proposals.

#### Dimension A: Frontend UX Analysis (React + Tailwind + Zustand)

Deep-dive into the React component and interaction layer:

- **Navigation & Layout Flow**: Trace user journeys through the app (Sidebar -> Pages -> Detail Panels -> Modals). Identify friction points, inconsistent navigation patterns, or missing back-navigation paths. Analyze `MainLayout.tsx`, `Sidebar.tsx`, `ListDetailLayout.tsx`, and `SlidePanel.tsx` for coherence.
- **State Management Coherence**: Analyze Zustand store interactions. Look for stores that have become too large, state that should be derived rather than stored, cross-store dependencies that create coupling, or missing optimistic updates.
- **Component Reusability**: Check common components (`Button`, `Modal`, `Input`, `Dropdown`, `Tooltip`, etc.) for API consistency. Look for one-off implementations that should use shared components. Check for prop-drilling that could use context or stores.
- **Empty/Error/Loading States**: Verify every data-fetching path has proper loading indicators, error boundaries, and empty state messages. Check `ErrorBoundary.tsx`, `EmptyState.tsx`, `FilteredEmptyState.tsx` usage across pages.
- **Accessibility & Keyboard Navigation**: Check for missing ARIA labels, keyboard trap scenarios in modals, focus management in `SlidePanel`, and color contrast with Tailwind classes.
- **Import/Export Workflows**: Analyze the import modals (`ImportSkillsModal`, `ImportMcpModal`, `ImportClaudeMdModal`, `ScanClaudeMdModal`) for UX consistency and error handling.

**How to analyze**: Read Page components and trace their data dependencies to stores and IPC calls. Read modal components for error handling patterns. Compare similar components for consistency.

#### Dimension B: Rust Backend Architecture (Performance, Error Handling, API Design)

Analyze the Tauri command layer and Rust code quality:

- **Error Handling Patterns**: Search for `unwrap()` calls in production code paths. Check if error types are consistent across commands. Look for error messages that would be unhelpful to the frontend. Verify that filesystem operations have proper error recovery.
- **Command API Design**: Analyze the Tauri command signatures for consistency. Check parameter naming conventions, return type patterns, and whether CRUD operations follow a uniform interface. Look for commands that do too much (should be split) or too little (should be combined for fewer IPC round-trips).
- **Filesystem Operations Safety**: The app works with the filesystem extensively (skills, MCPs, Claude MD files, symlinks). Check for TOCTOU race conditions, proper path sanitization, cross-platform path handling, and atomic write operations.
- **Serialization/Deserialization**: Analyze `types.rs` and serde usage. Look for missing `#[serde(default)]` annotations, overly permissive deserialization, or type definitions that don't match frontend expectations.
- **Performance**: Look for blocking operations on the main thread, unnecessary file reads (could be cached), or commands that could benefit from batch processing.

**How to analyze**: Read command files in `src-tauri/src/commands/`. Search for `unwrap()`, `.expect()`, `panic!` across Rust code. Compare command signatures for consistency. Read `types.rs` alongside TypeScript type definitions.

#### Dimension C: Frontend-Backend Type Synchronization (IPC Safety)

Analyze the contract between React and Rust:

- **Type Parity Audit**: Compare `src/types/index.ts` (and other type files) against `src-tauri/src/types.rs`. Look for fields that exist in one but not the other, fields with different names (camelCase vs snake_case mismatches beyond serde), optional vs required mismatches.
- **IPC Call Safety**: Check all Tauri invoke calls. Are they all using `safeInvoke` from `src/utils/tauri.ts`? Are the command names matching registered commands in `lib.rs`? Are argument types correct?
- **Error Contract**: When Rust commands return errors, does the frontend handle them consistently? Look for unhandled promise rejections, generic error messages that lose backend context, or inconsistent error display patterns.
- **Data Flow Integrity**: Trace specific data flows end-to-end (e.g., creating a skill: frontend form -> Zustand store -> IPC call -> Rust command -> filesystem -> response -> store update -> UI render). Identify where data could be lost, transformed incorrectly, or become stale.

**How to analyze**: Read `src/utils/tauri.ts` first. Then grep for `invoke` calls across the frontend. Cross-reference each call's arguments with the corresponding Rust command's parameters. Read `lib.rs` for the command registration list.

#### Dimension D: Functional Completeness (Desktop App Feature Analysis)

Compare against what a configuration management desktop app should offer:

- **Core Feature Completeness**: Evaluate Scenes, Skills, MCPs, Claude MD, Projects management. Are CRUD operations complete? Are bulk operations supported? Is search/filter comprehensive?
- **Desktop-Native Features**: Check for: keyboard shortcuts, system tray integration, auto-start, window state persistence, native file dialogs, drag-and-drop support, clipboard integration, deep linking.
- **Data Management**: Analyze trash/recovery (`TrashRecoveryModal`), backup/export, data migration, conflict resolution for symlinked files.
- **Launcher UX**: Analyze the `LauncherModal` for quick-access patterns. Is it fast enough? Does it support fuzzy search? Does it remember recent actions?
- **Project Scoping**: Analyze how projects and categories organize content. Are there missing organizational features (tagging, favorites, recently used, pinning)?

**How to analyze**: Read page components to understand feature coverage. Read stores to understand data model completeness. Check modal components for supported operations. Read settings page for configuration options.

#### Dimension E: Test Coverage Analysis (Vitest + cargo test)

Identify gaps in the testing strategy:

- **Frontend Test Coverage**: Check which components and stores have tests. Currently `src/components/__tests__/` has Badge, EmptyState, Toggle tests and `src/stores/__tests__/` has appStore, settingsStore tests. Identify critical untested stores (skillsStore, mcpsStore, scenesStore) and components (modals, detail panels).
- **Backend Test Coverage**: Check which Rust command modules have `#[cfg(test)]` blocks. Identify untested command handlers, especially those with complex filesystem logic.
- **Integration Gaps**: Look for IPC workflows that are tested on neither end -- the frontend mocks the IPC call, the backend tests the pure logic, but nobody tests the actual integration contract.
- **Test Quality**: Review existing tests for: meaningful assertions (not just snapshot tests), proper mocking of Tauri IPC, edge case coverage, async operation testing.

**How to analyze**: Read `src/components/__tests__/` and `src/stores/__tests__/`. Search for `#[cfg(test)]` in Rust files. Cross-reference tested modules against the full module list. Read test files for assertion quality.

### 3) Deep Analysis

For each selected dimension:

1. **Read the relevant source files** -- not just headers, read the full implementations.
2. **Trace data flows** end-to-end across the frontend-backend boundary (e.g., user action -> React component -> Zustand store -> safeInvoke -> Tauri command -> filesystem -> response -> store update -> re-render).
3. **Search for patterns** using grep across both `src/` and `src-tauri/src/` to quantify issues (e.g., how many commands lack error handling, how many stores lack tests).
4. **Compare against best practices** for React, TypeScript, Rust, and Tauri 2.
5. **Document specific file paths and line references** for every finding.

**IMPORTANT**: Do not skim files. Read them thoroughly. Your proposals must reference specific code, not generic patterns. For a dual-language project, always consider both sides of the IPC boundary.

### 4) Draft Proposals

For each finding worthy of a proposal, draft a comprehensive issue:

**Title**: `[AI-Propose] {Specific, actionable description}`

**Description** (Markdown format):

```markdown
## Analysis Background

{Why this proposal exists. What code did you analyze? What specific pattern/gap/opportunity did you find? Include file paths and code snippets as evidence.}

## Current State

{Describe what exists today. Be specific -- reference actual files, actual function names, actual behavior. For cross-layer issues, describe both the frontend and backend state.}

## Proposed Improvement

### Step 1: {First concrete action}
- **Layer**: {Frontend / Backend / Both}
- {Details with pseudocode or implementation hints}

### Step 2: {Second concrete action}
- **Layer**: {Frontend / Backend / Both}
- {Details}

### Step 3: {Third concrete action}
- **Layer**: {Frontend / Backend / Both}
- {Details}

{Add more steps as needed -- minimum 3 steps}

## Expected Benefits

- **User Impact**: {How does this improve the user's experience? Be specific.}
- **Code Quality**: {How does this improve maintainability/readability?}
- **Performance**: {Any performance implications?}
- **Type Safety**: {Does this improve the frontend-backend contract?}

## Implementation Complexity

- **Difficulty**: {Low / Medium / High}
- **Estimated Effort**: {e.g., "2-4 hours", "1-2 days"}
- **Layers Affected**: {Frontend / Backend / Both}
- **Risk Level**: {Low / Medium / High} -- {brief risk description}
- **Files Affected**:
  - Frontend: {list}
  - Backend: {list}

## Acceptance Criteria

- [ ] {Specific, testable criterion 1}
- [ ] {Specific, testable criterion 2}
- [ ] {Specific, testable criterion 3}
```

### 5) Quality Gate

Before creating any Linear issue, verify each proposal against these criteria:

- [ ] **Code Evidence**: Does the proposal reference specific files and code patterns from the actual codebase? (Not just "the app should...")
- [ ] **Cross-Layer Awareness**: For proposals affecting IPC, are both frontend and backend implications addressed?
- [ ] **Actionability**: Could another developer implement this from the description alone?
- [ ] **Non-Obvious**: Is this something that requires deep analysis to identify? (Not a surface-level TODO)
- [ ] **Impact**: Does this meaningfully improve UX, code quality, type safety, or performance?
- [ ] **Scope**: Is this a single coherent improvement, not a grab-bag of unrelated changes?

If a proposal fails any criterion, either strengthen it or discard it. Never create a weak proposal just to hit a quota.

### 6) Linear Integration

**CRITICAL RULES:**
- You MUST actually call the MCP tools. Do NOT fabricate or hallucinate tool call results.
- If an MCP tool call fails, report the failure honestly. Do NOT pretend it succeeded.
- Use `list_teams` to find your team ID. Use `list_projects` to find the "CC Workshop" project.
- **If the "CC Workshop" project does not exist, create it** using `save_project` with name "CC Workshop" and description "CC Workshop Tauri desktop app - AI-assisted autonomous development workflow".
- **ALWAYS include `projectId`** when creating issues to ensure they are assigned to the correct project.
- After calling `save_issue`, check the returned result for the issue ID and URL to confirm success.

#### Label Setup

Use `list_issue_labels` to find IDs for the following labels. If any don't exist, create them with `create_issue_label`:

- `ai-proposed` -- **Required on every issue**. Signals this needs human approval before implementation.
- One of: `type:feature`, `type:refactor`, `type:test`, `type:performance` -- based on the proposal category.
- Optionally: `frontend`, `backend`, `ipc`, `ux`, `architecture` -- for layer/dimension-specific tagging.

**IMPORTANT**: Do NOT use `agent-ready` label. These proposals must be reviewed by a human first. The human will change the label to `agent-ready` after approval, at which point the Implement automation will pick it up.

#### Issue Creation

```
Tool: mcp__linear-server__save_issue
Parameters:
  teamId: (from list_teams)
  projectId: (from list_projects, "CC Workshop" project)
  title: "[AI-Propose] {specific description}"
  description: {full proposal from Step 4}
  labelIds: [ai-proposed ID, type:* ID, optional layer/dimension tag IDs]
  priority: {2=High for UX/critical architecture, 3=Medium for quality improvements, 4=Low for nice-to-haves}
```

After creating each issue, post a comment summarizing the analysis dimension and key evidence:
```
Tool: mcp__linear-server__create_comment
Parameters:
  issueId: (from save_issue result)
  body: |
    **AI Research & Propose -- Analysis Log**
    - Dimension: {dimension name}
    - Layer Focus: {Frontend / Backend / Both}
    - Files analyzed: {count} files
    - Key files: {list of most relevant files}
    - Confidence: {High/Medium} -- {brief justification}
    - Date: {YYYY-MM-DD}
```

### 7) Summary Report

After all proposals are created (or if no proposals met the quality gate), output a structured summary:

```
## Research & Propose Report: CC Workshop
- Date: {YYYY-MM-DD HH:MM}
- Dimensions Analyzed: {list}
- Files Read: {frontend count} frontend, {backend count} backend
- Proposals Created: {count} / {count considered}
- Proposals Discarded: {count} (failed quality gate)
- Issues Created: {list with IDs and titles}
- Next Recommended Dimensions: {suggest which dimensions to analyze next run}
```

## Execution Constraints

- **Maximum 3 issues per run**. Quality over quantity.
- **No source file modifications**. This is a pure analysis and proposal skill.
- **No `agent-ready` label**. All proposals use `ai-proposed` only.
- **Minimum depth threshold**: Each proposal must reference at least 3 specific source files with concrete code-level observations.
- **Cross-layer awareness**: For IPC-related proposals, always document both the frontend and backend perspective.
- **Avoid duplicates**: Check existing `ai-proposed` issues before creating new ones on the same topic.
- **Be honest about uncertainty**: If analysis is inconclusive, say so. Don't inflate weak findings into proposals.
