# SubAgent brief — diagnose-and-fix codeload install reliability

You are picking up a bug investigation. Read `01_diagnosis.md` first; everything below assumes you've absorbed that context.

Task is **diagnose + fix + validate**, in that order. Three deliverables.

## Deliverable 1 — Diagnosis report (`03_findings.md`)

Goal: empirically confirm or reject the hypotheses in `01_diagnosis.md` and identify the actual failure pattern.

Concrete steps:

1. **Sample 30+ diverse skills from skills.sh**. Use the internal API documented in `~/.claude/projects/-Users-bo-Documents-Development-Ensemble-Ensemble2/memory/reference_skills_sh_internal_api.md`. Get a mix of:
   - Different repos (anthropics/skills, microsoft/azure-skills, vercel-labs/skills, obra/superpowers, individual user repos — use `view=all-time` page 0 + `view=trending` page 0 + a couple `search` calls)
   - Different layouts (canonical `skills/<id>/`, plugin-nested `.github/plugins/.../skills/<id>/`, root-level `<id>/`)
   - Tarball sizes (some tiny, some huge — confirm by HEAD on codeload URL)
   - Specifically include `azure-prepare` and `entra-app-registration` as the known fail/work pair

2. **Write a `#[ignore]` integration test** (e.g. `live_codeload_broad_install_sample` in `marketplace.rs` tests module) that for each sampled skill:
   - Records: owner, repo, skill_id, candidate_paths constructed by the same logic as `install_marketplace_skill`
   - Times: total elapsed, bytes downloaded
   - Records: success (extracted subpath) OR failure (full error chain via `e.source()` recursion)
   - Output to a Vec then dump as a Markdown table at the end of the test

3. **Run the test on the lead agent's machine**: `cargo test --lib -- --ignored live_codeload_broad_install_sample --nocapture`. Capture full output to `03_findings.md`.

4. **Analyze**: Which skills failed? What was the pattern (size? layout? specific repo?). Does the local environment reproduce the user's failure? If not, document that as a finding too.

## Deliverable 2 — Fix in `install_skill_via_codeload`

Regardless of whether the local environment reproduced the bug, implement these robustness improvements (each is independently justified):

### 2a. Stream the download instead of `.bytes().await`

Replace `resp.bytes().await` with a chunked read loop using `resp.chunk().await` (or `resp.bytes_stream()` + iteration). Accumulate into `Vec<u8>`. Reasons:
- Avoids the single `.bytes()` call that triggers the entire body-decode path in one shot — partial failures become more diagnosable.
- Lets us record downloaded bytes when an error occurs (for error context).
- Pre-emptively defends against any reqwest auto-decode edge case.

### 2b. Separate timeout for codeload tarballs

The current `HTTP_TIMEOUT_SECS = 15` applies to the global client. JSON API calls (skills.sh) need short timeouts; tarball downloads can legitimately take longer on slow networks.

Either:
- Add a second `OnceLock<reqwest::Client>` for tarball downloads with `timeout(Duration::from_secs(120))`, OR
- Use the existing client but pass `.timeout(Duration::from_secs(120))` per-request to the codeload GET only

Pick whichever is simpler given the existing structure. Document the choice in a comment with the reason.

### 2c. Surface the full reqwest error chain

Replace the bare `format!("codeload read error: {}", e)` with one that walks `e.source()` recursively and includes:
- The reqwest error kind (Decode / Timeout / Connect / etc.)
- Each source layer's message
- Bytes downloaded so far (from the streaming loop)
- Total elapsed time

So a future user report will show, e.g., `codeload read error after 8.2s, 1.4MB downloaded: kind=Decode, source: hyper: stream closed unexpectedly` instead of bare `error decoding response body`.

Apply the same error-context pattern to the network error site (line 2520) too.

### 2d. Optional — disable transport gzip for the codeload path

If using the existing `marketplace_http()` client with its `gzip(true)` setting risks the auto-decode codepath, consider building a dedicated client with `.no_gzip()`. The skills.sh API needs gzip; codeload doesn't (response is `application/x-gzip` entity body, not transport-encoded). Only do this if 2a alone leaves any risk; otherwise skip.

### 2e. Don't break existing behavior

- All 4 existing tests in the marketplace tests module must still pass (`live_codeload_install`, `live_codeload_install_plugin_nested`, `live_internal_api_returns_skills` if it exists, etc.)
- API surface of `install_skill_via_codeload` must remain unchanged
- `install_marketplace_skill` callers see the same `InstallOutcome` shape

## Deliverable 3 — Validation (`04_validation.md`)

After the fix:

1. Run the broad sample test again. **All previously-working skills must still work** + **previously-failing skills (if any reproduced locally) must now work**.
2. Add azure-prepare specifically as a third explicit `live_codeload_install_*` test alongside the existing two (so this specific case gets CI-grade regression coverage).
3. Document in `04_validation.md`:
   - Per-skill before/after success matrix
   - Average download time before/after (to catch regressions)
   - The improved error message format (with one example)

## Constraints (non-negotiable)

- **Use Opus** (you are this session's main agent — confirmed in your env).
- **Read the project rules before writing code**: 
  - `.claude/rules/measure-before-iterative-tuning.md` (no guessing — measure first)
  - `.claude/rules/verify-third-party-behavior-firsthand.md` (any reqwest behavior claim links to source)
  - `.claude/rules/fix-must-define-user-observable-success.md` (define what user will see post-fix)
  - `.claude/rules/plan-document-style.md` (keep findings doc concise — it's research output, not a spec)
- **Don't refactor unrelated code.** Stay inside `install_skill_via_codeload` + tests + the small client/timeout setup. No drive-by changes to marketplace.rs.
- **Don't introduce new dependencies.** reqwest 0.12 already supports streaming (`resp.bytes_stream()` / `resp.chunk()`). flate2 + tar are already available.
- **Don't add comments narrating what code does.** Add comments only where the WHY is non-obvious (per CLAUDE.md guidance).
- **Verify reqwest behavior claims firsthand.** If you claim `resp.chunk()` doesn't trigger gzip auto-decode, link to `node_modules/...` — sorry, I mean the reqwest source path under `~/.cargo/registry/src/...`.

## Quality bar

This is a `Structural` task per `~/.claude/rules/plan-as-research-design.md` — a precedent (the existing live tests + the documented codeload flow) exists. Compact pipeline: research → spec → implementation → validation, no multi-stage reviewer pipeline needed. Don't overengineer.

But do measure broadly — the user's explicit ask is "确保 SKills.sh上面的大部分的都测试一下" (ensure most things on skills.sh have been tested). The broad sample test is the user-observable artifact that fulfills this request.

## Reporting back

Return a short summary covering:
1. Did the local env reproduce azure-prepare's failure? (yes/no)
2. What's the actual root cause based on data, OR "not reproducible locally; fix is defense-in-depth"
3. Files changed + brief description of each change
4. Test pass/fail counts after fix
5. Suggested commit message subject

Do NOT build the production .app — the lead agent will do that step after reviewing your work.
