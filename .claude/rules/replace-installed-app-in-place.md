# Replace Installed Apps In Place — No Timestamped Backups

When the current task installs a build artifact (`.app`, `.dmg`, binary) to a fixed system location (`/Applications/`, `~/Applications/`, `~/.local/bin/`, …), the install MUST overwrite the same-name artifact in place. It MUST NOT create a timestamped, numbered, or "Backups/" copy of the previous version "just in case". Each canonical artifact role has exactly one entry on disk; older versions are recovered from git, not from a local backup pile.

## Why

On 2026-05-08 the lead agent had to clean the following accumulated detritus before the user could find their current build:

- `/Applications/CC Workshop.app` (current production)
- `/Applications/CC Workshop Dev.app` (current test)
- `/Applications/CC Workshop Backups/CC Workshop-20260506-134612.app` (timestamped backup that the 2026-05-06 install silently created)
- `~/Downloads/CC Workshop_1.0.0_aarch64-2.dmg` (a February DMG nobody ever opened)
- `src-tauri/target/release/bundle/macos/CC Workshop.app` + DMG (build output, never cleaned)
- `src-tauri/target/debug/bundle/macos/CC Workshop Dev.app` + DMG

A Spotlight search for "CC Workshop" returned five `.app` / `.dmg` hits and the user could not tell which one was current. The complaint — "保持干净，不然哪个是哪个都不知道" — names exactly this failure mode.

The 2026-05-06 install added the timestamped backup automatically on the "safety: copy old before overwriting" reflex. The cost-benefit was negative the moment the backup was created:

- The backup was never opened, never compared against, never rolled back to.
- Backups never auto-clean — each install adds another one indefinitely.
- Spotlight indexes them, polluting every future CC Workshop search.
- This project tracks every release in git; any historical version is reproducible via `git checkout <sha> && npm run tauri build`. A local `.app` backup carries zero information git does not already hold.

The fix that matters going forward is not "delete this batch" — it is making the reflex itself a documented violation so it does not regrow next session.

## Rule

When the current task installs build output to a fixed install location:

1. **Overwrite same-name in place.** `rm -rf /Applications/CC Workshop.app && cp -R <new> /Applications/CC Workshop.app`. No `mv` of the old `.app` to a side path between the `rm` and the `cp`.
2. **One canonical name per artifact role.** Production = `/Applications/CC Workshop.app`; test = `/Applications/CC Workshop Dev.app`. Names like `CC Workshop-2.app`, `CC Workshop (1).app`, `CC Workshop-YYYYMMDD-HHMMSS.app`, `CC Workshop-old.app` are forbidden — even temporarily inside the same task.
3. **Clean project `target/bundle/` after install** unless the task explicitly produces a DMG to ship or an archive to keep. Leaving `src-tauri/target/{release,debug}/bundle/` populated makes Spotlight return project-internal duplicates of every `.app` already installed.
4. **Rollback uses git, not local backups.** When an older version is needed, `git checkout <sha>` and rebuild. Never "preserve the old `.app` in case we need to compare."

## How to Apply

**Trigger** — the current task contains any of:

- `cp -R … .app /Applications/` or `cp -R … .app ~/Applications/`
- `mv … .app /Applications/`
- `npm run tauri build` followed by deployment to a fixed install location
- Any "ship build for user testing" handoff

**Required**:

- The previous `/Applications/<name>.app` is removed by `rm -rf` immediately before the `cp -R` of the new build. No `mv`, rename, or "Backups/" move sits between the two.
- After installing, run `rm -rf src-tauri/target/{release,debug}/bundle/` unless the task explicitly retains the bundle output (e.g. preparing a release DMG for upload).
- Two artifacts of different roles (production vs test) live at different canonical paths AND carry distinct `CFBundleName` / `CFBundleIdentifier`, so they do not visually collide in Dock / Cmd-Tab / About.

**Forbidden**:

- Creating `CC Workshop Backups/`, `CC Workshop Old/`, or any directory whose purpose is "preserve last `.app` before the new one lands"
- Renaming the old `.app` with a timestamp or version-number suffix prior to the overwrite
- Co-existing `CC Workshop.app` and `CC Workshop (1).app` / `CC Workshop-2.app` / `CC Workshop-old.app` in any install location
- Citing "safety" as a justification for keeping a local backup. Git is the rollback path.

## When This Does Not Apply

- The user **explicitly** asks to keep the previous version alongside the new one (e.g. "leave the old build so I can A/B compare"). Follow the user's naming and timing exactly, and at task end remind them when the kept-around copy should be deleted.
- Two artifacts that are genuinely different roles, not backups of each other — `CC Workshop.app` + `CC Workshop Dev.app` with distinct `CFBundleIdentifier`. Each role independently obeys the rule (one `.app` per role per location).
- A DMG or archive being prepared for distribution (GitHub Releases, etc.) lands in a clearly-named distribution directory, NOT `/Applications/` and NOT `~/Downloads/`. That directory must have an explicit retention policy stated in the task description.

## Anti-Patterns

- `cp -R /Applications/CC Workshop.app "/Applications/CC Workshop Backups/CC Workshop-$(date +%Y%m%d-%H%M%S).app" && cp -R new /Applications/CC Workshop.app` — the canonical "safety backup" reflex; forbidden.
- Leaving `target/release/bundle/macos/CC Workshop.app` populated **after** copying it to `/Applications/CC Workshop.app` — same `.app` in two locations, Spotlight returns two hits.
- Using `~/Downloads/` as the place to "keep the DMG around for a while" — `~/Downloads/` is the system trash bin, not a release archive; old DMGs accumulate forever and pollute Spotlight.
- Naming a kept-around old version `CC Workshop-old.app`, `CC Workshop.bak.app`, `CC Workshop-prev.app` — a single such artifact is already an accumulation.

## Relation to Other Rules

- `~/.claude/rules/persistence-system.md` is the same "single canonical location" principle in the information layer. This rule is its install-artifact analogue: each role lives in exactly one canonical path, and recovery comes from a source-of-truth (git for code, the persistence tiers for context), never from local backups.
- `fix-must-define-user-observable-success.md` covers the pre-push fix gate; this rule covers the install/deploy step that may follow.
