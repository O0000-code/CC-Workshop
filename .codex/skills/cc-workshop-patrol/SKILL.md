---
name: ensemble-patrol
description: Run a comprehensive QA patrol on the CC Workshop Tauri desktop app. Use when asked to check Tauri project health, run tests, lint code, or audit for issues. Do not use for iOS projects.
---

# CC Workshop Tauri Project Patrol

## Overview

Perform a comprehensive quality audit on the CC Workshop Tauri 2 desktop application, covering both the React frontend and Rust backend.

## Workflow

### 1) Prepare

- Verify you are in the CC Workshop project directory (`CC Workshop2/`).
- Run `git fetch origin main` to ensure you have the latest state.
- Note the current branch and HEAD commit for the patrol report.

### 2) Run Frontend Tests

- Execute the frontend test suite:
  ```bash
  npm run test
  ```
- Record: total tests, passed, failed, skipped.
- If any tests fail, classify as "critical" and note the failing test names.

### 3) Run Backend Tests

- Execute the Rust test suite:
  ```bash
  cd src-tauri && cargo test
  ```
- Record: total tests, passed, failed.
- If any tests fail, classify as "critical".

### 4) Frontend Linting

- Run ESLint on the frontend source:
  ```bash
  npx eslint src/
  ```
- Run TypeScript type checking:
  ```bash
  npx tsc --noEmit
  ```
- Record: total warnings, total errors from both tools.

### 5) Rust Linting

- Run Clippy with strict mode:
  ```bash
  cd src-tauri && cargo clippy -- -D warnings
  ```
- Run format check:
  ```bash
  cd src-tauri && cargo fmt -- --check
  ```
- Record any warnings or formatting issues.

### 6) Scan for TODO/FIXME/HACK

- Search all source files for tech debt markers:
  ```bash
  grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx"
  grep -rn "TODO\|FIXME\|HACK\|XXX" src-tauri/src/ --include="*.rs"
  ```
- Count and categorize by type and layer (frontend vs backend).
- Note files with more than 3 markers as high-priority tech debt.

### 7) Check Recent Changes

- Run `git log --since=24.hours --oneline` to list recent commits.
- For each commit, review the diff for:
  - Unsafe Tauri IPC calls (not using `safeInvoke`)
  - Missing error handling in async functions
  - TypeScript `any` types that should be properly typed
  - Rust `unwrap()` calls that should use proper error handling
  - Files exceeding 300 lines
- Record any issues found.

### 8) Security Audit

- Run npm security audit:
  ```bash
  npm audit --json
  ```
- Check for high or critical vulnerabilities.
- Record findings.

### 9) Report & Linear Integration

**CRITICAL RULES:**
- You MUST actually call the MCP tools. Do NOT fabricate or hallucinate tool call results.
- If an MCP tool call fails, report the failure honestly. Do NOT pretend it succeeded.
- Use `list_teams` to find your team ID. Use `list_projects` to find the "CC Workshop" project.
- **If the "CC Workshop" project does not exist, create it** using `save_project` with name "CC Workshop" and description "CC Workshop Tauri desktop app - AI-assisted autonomous development workflow".
- **ALWAYS include `projectId`** when creating issues to ensure they are assigned to the correct project.
- After calling `save_issue`, check the returned result for the issue ID and URL to confirm success.

#### If issues are found:

For each issue discovered, create a Linear Issue using the Linear MCP:

```
Tool: mcp__linear-server__save_issue
Parameters:
  teamId: (use list_teams to find the team ID)
  projectId: (use list_projects to find "CC Workshop" project ID; if not found, create it first with save_project)
  title: "[AI-Patrol] {concise description of issue}"
  description: |
    ## Source
    Discovered by automated patrol on {date}.

    ## Details
    {detailed description of the issue}

    ## Location
    {file path and line numbers}
    Layer: {Frontend / Backend / Both}

    ## Suggested Fix
    {brief suggestion if applicable}
  labelIds: (use list_issue_labels to find IDs for: "CC Workshop" (create if not exists), "Bug" or "Improvement", "ai-discovered", "needs-triage")
  priority: {1=Urgent for test failures, 2=High for build/security issues, 3=Medium for lint errors, 4=Low for TODOs}
```

#### If no issues are found:

Output: **"No issues found. CC Workshop project is healthy."**

#### Patrol Summary

Generate a structured summary:
```
## Patrol Report: CC Workshop
- Date: {YYYY-MM-DD HH:MM}
- Status: {healthy / warnings / critical}
- Frontend Tests: {passed}/{total} passed, {failed} failed
- Backend Tests: {passed}/{total} passed, {failed} failed
- ESLint: {N} warnings, {N} errors
- TypeScript: {N} errors
- Clippy: {N} warnings
- TODOs/FIXMEs: {frontend count} frontend, {backend count} backend
- Security: {N} high/critical vulnerabilities
- Recent commits analyzed: {count}
- Issues created: {count}
```
