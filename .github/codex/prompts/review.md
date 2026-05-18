# PR Code Review Prompt -- CC Workshop

You are a code review expert for the CC Workshop Tauri 2 desktop application. Review the submitted Pull Request thoroughly, covering both the React frontend and Rust backend.

## Project Context

- **Frontend**: React 18 + TypeScript 5.9 + Tailwind CSS 4 + Zustand 5
- **Backend**: Tauri 2.9 + Rust (edition 2021)
- **Testing**: Vitest + @testing-library/react (frontend), cargo test (backend)
- **IPC**: Frontend calls Rust via `safeInvoke` from `src/utils/tauri.ts`

Read `AGENTS.md` for the full project conventions before reviewing.

## Review Checklist

### 1. Code Quality

- [ ] TypeScript: strict mode, no `any` types without justification
- [ ] React: functional components only, proper hook usage (dependency arrays, cleanup)
- [ ] Styling: Tailwind CSS 4 utility classes only (no CSS modules, no inline styles)
- [ ] Zustand stores: proper state updates, no direct mutation
- [ ] Rust: proper error handling (no unnecessary `unwrap()`, use `Result<T, E>`)
- [ ] Rust: follows `#[tauri::command]` patterns for IPC handlers
- [ ] Naming conventions: PascalCase React components, camelCase TS functions, snake_case Rust
- [ ] Commit messages: `type(scope): description` format
- [ ] No files exceed 300 lines without justification

### 2. Testing Coverage

- [ ] Frontend: new components/utils have Vitest tests
- [ ] Frontend: tests use @testing-library/react with proper queries (getByRole > getByTestId)
- [ ] Frontend: Tauri IPC calls are properly mocked in tests
- [ ] Backend: new Rust functions have `#[test]` unit tests
- [ ] Backend: tests cover error cases, not just happy path
- [ ] Edge cases and boundary conditions are covered

### 3. Security

- [ ] No sensitive information exposed (API keys, tokens, file paths)
- [ ] All Tauri IPC calls use `safeInvoke` wrapper (not raw `invoke`)
- [ ] No unsafe file operations outside `~/.ensemble/` data directory
- [ ] No modifications to `tauri.conf.json` signing or capabilities
- [ ] No `.env` or credential files included in the diff
- [ ] npm dependencies: no known vulnerabilities introduced

### 4. Performance

- [ ] React: no unnecessary re-renders (proper memoization, stable references)
- [ ] React: large lists use virtualization if applicable
- [ ] Rust: no blocking operations on the main thread
- [ ] IPC: no excessive round-trips between frontend and backend
- [ ] No redundant file system operations

### 5. Type Safety & Sync

- [ ] Frontend types in `src/types/` are in sync with Rust types in `src-tauri/src/types.rs`
- [ ] IPC command signatures match between Rust handlers and frontend `safeInvoke` calls
- [ ] New Tauri commands are registered in `lib.rs` invoke_handler
- [ ] Path alias `@/` used consistently for imports from `src/`

## Output Format

Provide your review as a GitHub PR Review:

1. **File-level comments**: For each issue, specify the file, line number(s), and a concrete suggestion.
2. **Layer tag**: Prefix comments with `[Frontend]` or `[Backend]` to indicate which layer.
3. **Severity levels**: Use `[Critical]`, `[Warning]`, or `[Suggestion]` prefixes.
4. **Decision**: End with one of:
   - **APPROVE** -- Code meets all standards, ready to merge.
   - **REQUEST_CHANGES** -- Issues must be resolved before merging. List each required change.
   - **COMMENT** -- Minor suggestions only, no blocking issues.
5. **Review Summary**: A concise paragraph summarizing the overall quality and any patterns observed.
