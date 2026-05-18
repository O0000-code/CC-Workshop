# Safety Rules — CC Workshop

## Blocked Commands
Never execute the following commands:
- `rm -rf` or any recursive delete
- `sudo` anything
- `git push --force` or `git push -f`
- `git push origin main` or `git push origin master`
- `git reset --hard`
- `git branch -D`
- `git merge` (direct merge, use PR instead)
- `git rebase`
- `gh pr merge` (humans merge PRs)
- `npm install` (unless explicitly asked; use `npm install --save-exact`)
- `npm uninstall`
- `curl`, `wget`, `nc` (direct network requests)
- `printenv`, `env` (credential exposure)
- `osascript` (AppleScript)

## Blocked File Operations
Never read or modify:
- `.env`, `.env.*` files
- `~/.ssh/*`, `~/.aws/*`
- `src-tauri/tauri.conf.json` (signing configuration)
- `src-tauri/capabilities/default.json` (permission manifest)
- `src-tauri/icons/` directory

## Required Workflow
- Always work on a feature branch, never on main
- Always create a PR for code changes
- Run `npx tsc --noEmit` and `cargo clippy` before creating a PR
- Use commit message format: type(scope): description
- Do not merge your own PRs
