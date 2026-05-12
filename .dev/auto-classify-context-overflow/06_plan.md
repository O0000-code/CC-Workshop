# Implementation Plan — Auto-classify context overflow + model config + scope filter

## Goal

Fix three issues in the auto-classify feature, in one coordinated change:

1. **Context overflow on Skills** — `skillsStore.autoClassify` sends every SKILL.md's full body in one prompt; 56-skill libraries hit ~210 K tokens, exceeding Sonnet's 200 K window. **Fix**: truncate to description-only (see `05_recommendation.md`).
2. **Hardcoded `--model sonnet`** — backend always uses Sonnet regardless of preference. **Fix**: read `classify_model` from settings (default `opus`), expose Opus / Sonnet / Haiku dropdown in `SettingsPage`.
3. **CategoryPage / TagPage "Auto Classify" classifies all items, not just scoped items** — buttons exist on these pages but ignore the current category/tag filter. **Fix**: add optional `scopeFilter` argument to each store's `autoClassify` method; pages pass current filter.

## Mandatory reading before implementation

Any agent picking up a task below MUST read:

- `.dev/auto-classify-context-overflow/05_recommendation.md` — truncation decision + numbers
- `.claude/rules/design-language.md` — UI tokens (font sizes, spacing, easing) for the SettingsPage addition
- `CLAUDE.md` (project root) — Tauri IPC + serde + path patterns

Reading the prior `.dev/auto-classify-analysis.md` is optional context (the line numbers there are slightly stale).

## Scope (what's in / out)

**In scope**:
- `src-tauri/src/commands/classify.rs` — read `classify_model` from settings, pass to `claude -p`
- `src-tauri/src/types.rs` — add `classify_model: String` field to `AppSettings` (default `"opus"`)
- `src/types/index.ts` — add `classifyModel: string` to `AppSettings` interface
- `src/stores/settingsStore.ts` — `classifyModel` state + `setClassifyModel` setter + persistence wiring
- `src/pages/SettingsPage.tsx` — new section (or row inside existing Marketplace section) with `CustomSelect` (Opus / Sonnet / Haiku)
- `src/stores/skillsStore.ts` — remove `instructions` field from ClassifyItem mapping
- `src/stores/skillsStore.ts` / `mcpsStore.ts` / `claudeMdStore.ts` — add `scopeFilter?: { categoryId?: string; tagId?: string }` arg to `autoClassify`
- `src/pages/CategoryPage.tsx` / `TagPage.tsx` — pass categoryId / tagId to `autoClassify`
- `src/pages/SkillsPage.tsx` / `McpServersPage.tsx` / `ClaudeMdPage.tsx` — no change needed (no-arg call still classifies all)

**Out of scope** (deferred):
- `marketplace.rs::run_auto_classify` — single-item path, ≤ 48 KB; not affected by context overflow. It calls the same `auto_classify` function, so it automatically inherits the model change from settings — no code change needed.
- A fallback "if `description.length < 80` then include instructions[:500]" — corner case not seen in test data. Defer until reported.
- 1M-context model selector — data shows description-only volume on 56 skills is ~22 K tokens, far below 200 K. YAGNI.
- Reviewing CategoryPage/TagPage UX more broadly (e.g. button labeling when scoped). Minimal change: filter items, keep button text "Auto Classify".

## Dependency graph

```
  ┌──────────────────────────────────┐
  │ #4 backend: read settings.classify_model in classify.rs │
  └──────────────────────────────────┘
                  │  (no FE dependency — backend reads from disk)
                  ▼
  ┌──────────────────────────────────┐
  │ #5 settings: AppSettings field + settingsStore │
  └──────────────────────────────────┘
                  │
                  ▼
  ┌──────────────────────────────────┐
  │ #6 SettingsPage: model CustomSelect dropdown │
  └──────────────────────────────────┘

  ┌──────────────────────────────────┐
  │ #7 skillsStore: truncate instructions │  ← independent, parallel to #4-#6
  └──────────────────────────────────┘

  ┌──────────────────────────────────┐
  │ #8 three stores: scopeFilter arg │  ← independent, parallel to #4-#7
  └──────────────────────────────────┘
                  │
                  ▼
  ┌──────────────────────────────────┐
  │ #9 CategoryPage / TagPage: pass scope │
  └──────────────────────────────────┘

                       ↓
  ┌──────────────────────────────────┐
  │ #10 实测 (dev mode, all three flows) │
  └──────────────────────────────────┘
```

#4 + #5 + #6 form one chain (model config). #7 is fully independent (truncation). #8 + #9 form one chain (scope). All three chains converge at #10.

The main agent will execute the changes directly (small footprint, ~150 lines total across 8 files) — no SubAgent dispatch needed for code-writing. SubAgent already used for the research phase (Task #1, completed).

## Per-task notes

### #4 backend: read settings.classify_model in classify.rs

- Add `model: String` local in `auto_classify`, default to `"opus"` if settings unreadable (matches the rule in `marketplace.rs::spawn_auto_classify` of failing silent when settings broken — but here we fall back to a safe default since we're inside the auto_classify call itself and the user clicked the button).
- Pass `&model` to the `.arg("--model").arg(...)` chain.
- Validate model is one of `["opus", "sonnet", "haiku"]` before passing — protect against settings.json being hand-edited to a malicious value.
- No new dependency. Uses `crate::commands::data::read_settings()` (already used by `marketplace.rs`).

### #5 settings: types.rs + settingsStore.ts

- `AppSettings { classify_model: String, ... }` with `#[serde(default = "default_classify_model")]` → `"opus"`.
- Update `Default` impl + `test_app_settings_default` to include the field.
- Frontend `AppSettings` interface adds `classifyModel: string`, default in `defaultSettings`.
- Setter `setClassifyModel(model: 'opus' | 'sonnet' | 'haiku')` with persistence wiring matching existing setters.

### #6 SettingsPage: CustomSelect dropdown

- Reuse `CustomSelect` component (already used at SettingsPage line ~283 for `claudeMdDistributionPath`).
- Either: add a new "Auto-classify" section above Marketplace, OR add a row inside existing Marketplace section.
- Recommend: **new "Auto-classify" section** to make the setting discoverable and avoid coupling with the Marketplace-only toggle.
- Row label "Classification model" + description "Model used by the Auto Classify button on Skills / MCP / CLAUDE.md pages."
- Three options: `Opus (default — most accurate)`, `Sonnet (faster)`, `Haiku (fastest)`.
- Design-language constraint: row layout matches existing rows; no new tokens.

### #7 skillsStore: truncate instructions

- One-line change at `skillsStore.ts:343` — remove `instructions: s.instructions` from the items mapping. Replace with a 3-line comment pointing at `.dev/auto-classify-context-overflow/`.
- No other surface affected.

### #8 three stores: scopeFilter arg

- `autoClassify(scopeFilter?: { categoryId?: string; tagId?: string })` for all three stores.
- Inside each store: filter the items array by `scopeFilter` before sending to backend. Use `useAppStore.getState()` to resolve tag/category memberships if needed.
- For `claudeMdStore`: filter by `file.categoryId === scopeFilter.categoryId` or `file.tagIds.includes(scopeFilter.tagId)`.
- For `skillsStore` / `mcpsStore`: filter by `metadata[id].category === categoryName` (need name→id resolution).
- Empty-after-filter case: set error "No items to classify in this scope." Match existing empty-store handling.

### #9 CategoryPage / TagPage: pass scope

- `CategoryPage.handleAutoClassify`: call all three stores' `autoClassify({ categoryId })`. Currently only calls `useSkillsStore().autoClassify()` — need to look at what the button is doing on CategoryPage and whether it should also classify MCPs / CLAUDE.md in that category. Investigation in task #9 itself.
- `TagPage.handleAutoClassify`: same with `tagId`.

### #10 实测 — user-observable success criteria

Per `fix-must-define-user-observable-success.md`, declare success contract before push.

**Flow 1 — Skill auto-classify no longer overflows**:
- User action: 56 skills imported, click "Auto Classify" on Skills page
- Observable: Within ~30 sec, success animation plays; skills receive categories/tags. Spinner does not stall. No error toast about "Prompt is too long".
- Anti-observation: Does NOT show "Classification failed" or "Prompt is too long" error.

**Flow 2 — Model setting takes effect**:
- User action: Open Settings, change "Classification model" from Opus to Sonnet
- Observable: Setting persists across app restart. Next Auto Classify run uses Sonnet (verify via console log temporarily, or by cost/latency proxy).
- Anti-observation: Setting does NOT silently revert to Opus after restart.

**Flow 3 — CategoryPage Auto Classify is scoped**:
- User action: Open a Category that contains 5 skills (out of 56 total); click "Auto Classify" on the CategoryPage
- Observable: Only those 5 skills are reclassified (verify by spot-checking that skills in OTHER categories are unchanged).
- Anti-observation: Does NOT classify all 56 skills.

## Risk register

| Risk | Mitigation |
|---|---|
| `claude -p --model opus` not recognized as alias on user's CLI version | Confirmed alias support in `claude --help` (Tue 02:15 inspection). Validation list `["opus", "sonnet", "haiku"]` rejects typos. |
| User has hand-edited `~/.ensemble/settings.json` to add an invalid `classifyModel` | Backend validates list before passing to subprocess; fall back to `"opus"` with a console-warn. |
| `read_settings()` fails inside `auto_classify` (corrupt settings.json, missing file) | Fall back to `"opus"` default + log warning. Do not block the classify call. |
| Adding `classify_model` field breaks deserialization of pre-existing settings.json files | `#[serde(default = "default_classify_model")]` ensures missing field deserializes to `"opus"`. Same pattern as `warp_open_mode` in `types.rs:367`. |
| scopeFilter implementation incorrectly filters (e.g. mcps lookup uses category name where id was passed) | Test: `useAppStore.getState().categories.find(c => c.id === ...)` chain. Verify via spot-test in dev mode. |
| CategoryPage button now seems to do "less" than before to the user who's used to "all items" behavior | The current behavior is the bug. The button is on a category page; users expect it to act on the category. Acceptable change, document in commit message. |

## Out-of-scope items deliberately deferred

- **`autoClassifyNewItems` Marketplace gate's UI** — already implemented as a Toggle (Marketplace section, SettingsPage line ~310). Untouched.
- **HTML-overflow guard on backend** — could add a server-side prompt-length check that returns a clean error before invoking `claude`. Reasonable defense in depth, but with description-only truncation it's hard to ever overflow. Defer.
- **Tests** — this project's CI passes through manual `npm test` / `cargo test`; user's preference is dev-mode iteration over heavy test scaffolding. No new test added for this fix beyond updating the existing `test_app_settings_default` to include the new field. The user verifies via Flow 1 / 2 / 3 above.
