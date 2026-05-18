---
name: ensemble-implement
description: Scan Linear for agent-ready issues in the CC Workshop project, pick the highest priority one, implement it following TDD, verify with frontend and backend tests/lint, and create a PR. Use when asked to implement issues, fix bugs, or develop features for the CC Workshop Tauri desktop app. Do not use for iOS projects.
version: 1.0.0
---

# CC Workshop Issue Implementation

## Overview

Autonomously discover, claim, implement, and deliver a single agent-ready Issue from the CC Workshop Linear project. This skill covers the full cycle: query Linear for work, write code via TDD across React frontend and Rust backend, verify all checks, and submit a Pull Request.

## Project Context

- **Frontend**: React 18 + TypeScript 5.9 + Tailwind CSS 4 + Zustand 5
- **Backend**: Tauri 2.9 + Rust (edition 2021)
- **Testing**: Vitest + @testing-library/react (frontend), cargo test (backend)
- **Repo**: https://github.com/O0000-code/CC-Workshop.git

Read `AGENTS.md` for the full project conventions before starting.

## Workflow

### 1) Discover Agent-Ready Issues

**CRITICAL RULES:**
- You MUST actually call the MCP tools. Do NOT fabricate or hallucinate tool call results.
- If an MCP tool call fails, report the failure honestly. Do NOT pretend it succeeded.
- Use `list_teams` to find your team ID dynamically. NEVER hardcode team IDs.
- Use `list_projects` to find the "CC Workshop" project. NEVER hardcode project IDs.
- Use `list_issue_labels` to find label IDs dynamically. NEVER hardcode label IDs.

Query Linear for issues ready for agent implementation:

1. Use `list_teams` to get the team ID.
2. Use `list_projects` to find the "CC Workshop" project ID.
3. Use `list_issue_labels` to find the IDs for labels: `agent-ready` and `CC Workshop`.
4. Use `list_issues` with filters to find issues that have the `agent-ready` label AND belong to the CC Workshop project.
5. Sort results by priority (1=Urgent is highest, 4=Low is lowest).
6. Select the single highest-priority issue.

**If no agent-ready issues are found**: report "No pending agent-ready issues in CC Workshop" and **exit immediately**. Do NOT proceed further.

### 2) Read the Issue

- Use `get_issue` to fetch the full Issue details of the selected issue.
- Read the Description and all comments carefully.
- Use `list_comments` to read all existing comments on the issue.
- If any requirements are unclear or ambiguous, use `create_comment` to ask for clarification and **stop execution** until answered.

### 3) Claim the Issue

- Use `list_issue_statuses` to find the status ID for "In Progress". NEVER hardcode status IDs.
- Use `list_issue_labels` to find the label ID for `agent-in-progress`. If the label does not exist, create it using `create_issue_label`.
- Update the Issue via `save_issue`:
  - `stateId`: set to the "In Progress" status ID
  - `labelIds`: add `agent-in-progress` label while **preserving all existing labels**
- Post a comment via `create_comment`:
  ```
  **Codex Agent Status: Claimed**
  Implementation plan:
  - {step 1}
  - {step 2}
  - ...
  Affected layers: {Frontend / Backend / Both}
  ```

### 4) Create Working Branch

- Use the Issue's `gitBranchName` if available; otherwise create:
  ```bash
  git checkout -b agent/{type}/{issue-id}
  ```
  Where `{type}` is `feat`, `fix`, `refactor`, `test`, `docs`, or `chore` based on the Issue type.

### 5) Analyze Impact

- Determine which layers are affected (Frontend, Backend, or Both).
- If both layers are affected, ensure type definitions stay in sync:
  - Frontend types: `src/types/`
  - Backend types: `src-tauri/src/types.rs`
- Check for downstream dependencies in stores, components, and Tauri commands.
- Review existing tests for the affected areas.

### 6) Implement Changes (TDD Preferred)

#### Frontend Changes

1. **Write tests first** using Vitest + @testing-library/react:
   - Place tests adjacent to source files or in `src/test/`
   - Mock Tauri IPC calls using `vi.mock`
   - Use proper RTL queries (`getByRole`, `getByText` over `getByTestId`)
2. **Implement the feature/fix**:
   - Functional components with hooks only
   - Tailwind CSS 4 utility classes for styling
   - Zustand stores for state management
   - `safeInvoke` from `src/utils/tauri.ts` for all Tauri IPC calls
   - Path alias `@/` for imports from `src/`
3. **For new pages**: add route in `App.tsx`, sidebar entry if needed.

#### Backend Changes

1. **Write tests first** using Rust `#[test]`:
   - Add `#[cfg(test)]` module at the bottom of the file
   - Focus on pure functions and data processing logic
   - Skip tests that require full Tauri App context
2. **Implement the feature/fix**:
   - Use `#[tauri::command]` for new IPC handlers
   - Register new commands in `lib.rs` invoke_handler
   - Use `Result<T, String>` for error handling
   - Use `serde` for serialization
3. **Update types**: If command signatures change, update both `types.rs` and `src/types/`.

### 7) Verify

- Run frontend checks:
  ```bash
  npx tsc --noEmit
  npm run test
  ```
- Run backend checks:
  ```bash
  cd src-tauri && cargo test
  cd src-tauri && cargo clippy -- -D warnings
  ```
- **All must pass before proceeding.** If any step fails, fix the issues and re-verify. Do NOT proceed to PR creation with failing builds, tests, or lint errors.

### 8) Create Pull Request

```bash
gh pr create \
  --title "Fixes {issue_identifier}: {short description}" \
  --body "## Summary
{concise description of changes}

## Changes
### Frontend
- {change 1}
- {change 2}

### Backend
- {change 1}
- {change 2}

## Test Results
- TypeScript: no errors
- Frontend tests: {passed}/{total} passed
- Rust tests: {passed}/{total} passed
- Clippy: clean

## Checklist
- [ ] Tests added for new functionality
- [ ] All existing tests pass
- [ ] TypeScript compiles without errors
- [ ] Clippy passes without warnings
- [ ] Frontend/backend types are in sync
- [ ] No protected files modified

Closes {issue_identifier}"
```

### 9) Update Linear

- Use `list_issue_labels` to find the label ID for `human-review`. If the label does not exist, create it using `create_issue_label`.
- Update Issue via `save_issue`:
  - `labelIds`: add `human-review` label while **preserving all existing labels**
- Post a comment via `create_comment`:
  ```
  **Codex Agent Status: Completed**
  PR: {pr_url}
  Layers affected: {Frontend / Backend / Both}
  Changes: {brief summary}
  Test results: Frontend {passed}/{total}, Backend {passed}/{total}
  ```

## CRITICAL RULES

### Dynamic Linear Strategy
- **NEVER hardcode any Linear IDs** (team IDs, project IDs, label IDs, status IDs). Always discover them dynamically using `list_teams`, `list_projects`, `list_issue_labels`, `list_issue_statuses`.
- **If a required label does not exist**, create it using `create_issue_label` before proceeding.
- **If the "CC Workshop" project does not exist**, create it using `save_project` with name "CC Workshop" and description "CC Workshop Tauri desktop app - AI-assisted autonomous development workflow".
- **ALWAYS include `projectId`** when creating or updating issues.
- After calling `save_issue`, check the returned result for the issue ID and URL to confirm success.

### Implementation Safety
- Stay strictly within the Issue's described scope.
- If you discover additional issues during implementation, create separate Linear Issues for them -- do not fix them in the current branch.
- Never push directly to `main`.
- Never modify protected files (`tauri.conf.json`, `Cargo.lock`, `package-lock.json`, `AGENTS.md`).
- When modifying IPC signatures, always update **both** the Rust handler and the frontend caller.
- Keep commit history clean with conventional commit messages: `type(scope): description`.
- If uncertain about any decision, post a Linear comment and wait for human guidance.

### One Issue Per Session
- Implement exactly **one** issue per invocation. Do NOT attempt to batch multiple issues.
- After completing the PR, update Linear and exit.
