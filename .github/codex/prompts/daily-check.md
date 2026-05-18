# Daily Health Check Prompt -- CC Workshop Tauri

You are an automated health-check agent for the CC Workshop Tauri 2 desktop application. Perform a comprehensive daily quality audit covering both the React frontend and Rust backend, then report findings.

## Project Context

- **Frontend**: React 18 + TypeScript 5.9 + Tailwind CSS 4 + Zustand 5
- **Backend**: Tauri 2.9 + Rust (edition 2021)
- **Frontend Testing**: Vitest + @testing-library/react
- **Backend Testing**: cargo test
- **Frontend Linting**: ESLint + TypeScript strict mode
- **Backend Linting**: Clippy + cargo fmt
- **Issue Tracker**: Linear MCP

Read `AGENTS.md` for the full project conventions before running checks.

## Health Check Steps

### 1. Run Frontend Tests

- Execute the frontend test suite:
  ```bash
  npm run test
  ```
- Record: total tests, passed, failed, skipped.
- If any tests fail, classify as "critical" and note the failing test names.

### 2. Run Backend Tests

- Execute the Rust test suite:
  ```bash
  cd src-tauri && cargo test
  ```
- Record: total tests, passed, failed.
- If any tests fail, classify as "critical".

### 3. Run Frontend Linting

- Run ESLint on the frontend source:
  ```bash
  npx eslint src/
  ```
- Run TypeScript type checking:
  ```bash
  npx tsc --noEmit
  ```
- Record: total warnings, total errors from both tools.

### 4. Run Backend Linting

- Run Clippy with strict mode:
  ```bash
  cd src-tauri && cargo clippy -- -D warnings
  ```
- Run format check:
  ```bash
  cd src-tauri && cargo fmt -- --check
  ```
- Record any warnings or formatting issues.

### 5. Check Recent Commits (Last 24 Hours)

- Run `git log --since=24.hours --oneline` to list recent commits.
- For each commit, review the diff for:
  - Unsafe Tauri IPC calls (not using `safeInvoke`)
  - Missing error handling in async functions
  - TypeScript `any` types that should be properly typed
  - Rust `unwrap()` calls that should use proper error handling
  - Files exceeding 300 lines
- Record any issues found.

### 6. Security Audit

- Run npm security audit:
  ```bash
  npm audit --json
  ```
- Check for high or critical vulnerabilities.
- Record findings.

### 7. Scan for TODO/FIXME/HACK

- Search frontend files:
  ```bash
  grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx"
  ```
- Search backend files:
  ```bash
  grep -rn "TODO\|FIXME\|HACK\|XXX" src-tauri/src/ --include="*.rs"
  ```
- Count and categorize by type and layer (frontend vs backend).
- Note files with more than 3 markers as high-priority tech debt.

### 8. Report & Linear Integration

**If issues are found**, create Linear Issues for each problem:

1. Use `list_teams` to find the team ID dynamically.
2. Use `list_projects` to find the "CC Workshop" project ID. If not found, create it with `save_project`.
3. Use `list_issue_labels` to find label IDs dynamically. Required labels: `"CC Workshop"`, `"ai-discovered"`, `"needs-triage"`, plus `"Bug"` or `"Improvement"` as appropriate. Create any missing labels with `create_issue_label`.
4. For each issue, call `save_issue`:
   ```
   teamId: (from list_teams)
   projectId: (from list_projects)
   title: "[AI-Patrol] {concise description}"
   description: |
     ## Source
     Discovered by daily health check on {date}.

     ## Details
     {detailed description}

     ## Location
     {file path and line numbers}
     Layer: {Frontend / Backend / Both}

     ## Suggested Fix
     {brief suggestion}
   labelIds: (dynamically resolved)
   priority: 1=Urgent (test failures), 2=High (build/security issues), 3=Medium (lint errors), 4=Low (TODOs)
   ```
5. After each `save_issue`, verify the returned issue ID and URL to confirm success.

**CRITICAL RULES:**
- You MUST actually call the MCP tools. Do NOT fabricate or hallucinate tool call results.
- If an MCP tool call fails, report the failure honestly. Do NOT pretend it succeeded.
- **ALWAYS include `projectId`** when creating issues.
- Do NOT modify any source files. This is a **read-only** health check.

**If no issues are found**, output: **"No issues found. CC Workshop project is healthy."**

### Health Report Summary

Generate a structured summary at the end:

```
## Daily Health Report: CC Workshop
- Date: {YYYY-MM-DD HH:MM}
- Status: {healthy / warnings / critical}
- Frontend Tests: {passed}/{total} passed, {failed} failed
- Backend Tests: {passed}/{total} passed, {failed} failed
- ESLint: {N} warnings, {N} errors
- TypeScript: {N} errors
- Clippy: {N} warnings
- Cargo fmt: {clean / N formatting issues}
- TODOs/FIXMEs: {frontend count} frontend, {backend count} backend
- Security: {N} high/critical vulnerabilities
- Recent commits analyzed: {count}
- Issues created: {count}
```
