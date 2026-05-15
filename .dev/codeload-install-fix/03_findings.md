# Codeload install — broad-sample diagnosis findings

## Headline

**Bug reproduced locally.** 7 of 32 sampled skills fail; **5 fail with the user-reported `codeload read error: error decoding response body`**, all at 15001–15013 ms elapsed. The other 2 are unrelated layout misses.

The 5 reproducible failures all hit the **`HTTP_TIMEOUT_SECS = 15`** global client timeout fired *mid-body-stream*. reqwest classifies a body-collection failure (which includes tower-timeout abortion of `bytes()` / `chunk()`) as `Kind::Decode`, whose `Display` is the misleading `"error decoding response body"`. Verified in `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/reqwest-0.12.28/src/async_impl/response.rs:290-297` (both `bytes()` and `chunk()` wrap underlying errors with `crate::error::decode`).

## What was sampled

`live_codeload_broad_install_sample` test (in `marketplace.rs` tests module). Curated 32 entries covering:

- **9 different repos**: microsoft/azure-skills, anthropics/skills, vercel-labs/skills, vercel-labs/agent-skills, obra/superpowers, wshobson/agents, github/awesome-copilot, agentspace-so/runcomfy-agent-skills, mattpocock/skills, pbakaus/impeccable, supabase/agent-skills, xixu-me/skills
- **3 layouts**: canonical `skills/<id>`, plugin-nested `.github/plugins/.../skills/<id>` (microsoft-foundry), plugin path variant (wshobson `plugins/...`), root-level (agentspace-so)
- **Wide size range**: 0.5s (find-skills) → 15s+ (awesome-copilot, impeccable)
- **Known fail/work pair** included: `azure-prepare` + `entra-app-registration` (both succeeded locally — see "Network variance" below)

## Raw output (baseline, before fix)

```
| owner | repo | skill_id | elapsed_ms | files | outcome |
|---|---|---|---:|---:|---|
| microsoft | azure-skills | azure-prepare | 4613 | 164 | OK `skills/azure-prepare` |
| microsoft | azure-skills | entra-app-registration | 3531 | 16 | OK `skills/entra-app-registration` |
| microsoft | azure-skills | azure-ai | 3549 | 16 | OK `skills/azure-ai` |
| microsoft | azure-skills | azure-deploy | 3390 | 41 | OK `skills/azure-deploy` |
| microsoft | azure-skills | azure-storage | 3791 | 14 | OK `skills/azure-storage` |
| microsoft | azure-skills | azure-validate | 3185 | 17 | OK `skills/azure-validate` |
| microsoft | azure-skills | azure-cost | 3405 | 21 | OK `skills/azure-cost` |
| microsoft | azure-skills | azure-observability | 3623 | - | FAIL `could not locate SKILL.md ...` |
| microsoft | azure-skills | azure-kusto | 3447 | 1 | OK `skills/azure-kusto` |
| microsoft | azure-skills | microsoft-foundry | 3391 | 91 | OK `skills/microsoft-foundry` |
| anthropics | skills | frontend-design | 4211 | 2 | OK `skills/frontend-design` |
| anthropics | skills | webapp-testing | 3903 | 6 | OK `skills/webapp-testing` |
| anthropics | skills | skill-creator | 3839 | 18 | OK `skills/skill-creator` |
| vercel-labs | skills | find-skills | 627 | 1 | OK `skills/find-skills` |
| vercel-labs | agent-skills | vercel-react-best-practices | 707 | - | FAIL `could not locate SKILL.md ...` |
| vercel-labs | agent-skills | web-design-guidelines | 644 | 1 | OK `skills/web-design-guidelines` |
| obra | superpowers | brainstorming | 578 | 8 | OK `skills/brainstorming` |
| wshobson | agents | python-performance-optimization | 1969 | 2 | OK `plugins/python-development/skills/python-performance-optimization` |
| wshobson | agents | python-testing-patterns | 2026 | 2 | OK `plugins/python-development/skills/python-testing-patterns` |
| wshobson | agents | python-design-patterns | 1980 | 1 | OK `plugins/python-development/skills/python-design-patterns` |
| github | awesome-copilot | python-mcp-server-generator | 15013 | - | FAIL `codeload read error: error decoding response body` |
| github | awesome-copilot | dataverse-python-quickstart | 15002 | - | FAIL `codeload read error: error decoding response body` |
| agentspace-so | runcomfy-agent-skills | image-edit | 2420 | 1 | OK `image-edit` |
| agentspace-so | runcomfy-agent-skills | seedance-v2 | 594 | 1 | OK `seedance-v2` |
| agentspace-so | runcomfy-agent-skills | video-inpainting | 1516 | 1 | OK `video-inpainting` |
| mattpocock | skills | to-prd | 1423 | 1 | OK `skills/engineering/to-prd` |
| pbakaus | impeccable | critique | 15002 | - | FAIL `codeload read error: error decoding response body` |
| pbakaus | impeccable | quieter | 15005 | - | FAIL `codeload read error: error decoding response body` |
| pbakaus | impeccable | normalize | 15001 | - | FAIL `codeload read error: error decoding response body` |
| supabase | agent-skills | supabase-postgres-best-practices | 1291 | 35 | OK `skills/supabase-postgres-best-practices` |
| xixu-me | skills | openclaw-secure-linux-cloud | 521 | 2 | OK `skills/openclaw-secure-linux-cloud` |
| xixu-me | skills | opensource-guide-coach | 512 | 4 | OK `skills/opensource-guide-coach` |

Summary: 25/32 succeeded; total 139709 ms; mean 4365 ms/skill
```

## Analysis

### Failure class A — timeout-induced "Decode" (5 cases)

All 5 failed at exactly the 15s `HTTP_TIMEOUT_SECS` boundary:

- `github/awesome-copilot` × 2 — repo is enormous (thousands of agent skills); tarball cannot stream in 15s on a typical broadband link
- `pbakaus/impeccable` × 3 — small repo on the catalog (only 3 skills in our sample) but every download timed out; suggests cold CDN edge / consistently slow upstream for that repo

The reqwest source confirms the misleading error: `bytes()` (line 290–297) wraps any underlying body-collection error (including `tower::timeout::error::Elapsed` cast in `cast_to_internal_error`) into `Kind::Decode`, whose `Display` is `"error decoding response body"`. There is no surface-level signal that the real cause was a timeout.

### Failure class B — layout miss (2 cases, unrelated)

- `microsoft/azure-skills :: azure-observability` — skill listed in skills.sh but not present in the repo at any path matching `skills/azure-observability` or `*/azure-observability/SKILL.md`. Likely renamed/removed upstream; the catalog hasn't caught up.
- `vercel-labs/agent-skills :: vercel-react-best-practices` — same shape.

These are **catalog-vs-repo drift**, not a download bug. Out of scope for this fix.

### Network variance — why user sees azure-prepare fail and we don't

`azure-prepare` succeeded locally at 4.6s. The same skill failed for the user. The same-tarball variant `entra-app-registration` succeeded for the user but at the same elapsed-time ballpark. This matches `01_diagnosis.md` hypothesis #2 (slow-network edge case): on the user's connection, `azure-skills` (3.3 MB tarball) crosses 15s some fraction of the time while sibling installs in the same session might come in just under. **The `Decode` symptom is identical regardless of which specific skill triggers it** — it's a timeout-vs-network race, not a per-skill defect.

## Why the existing `live_codeload_install` / `live_codeload_install_plugin_nested` tests didn't catch this

Both tests target `microsoft/azure-skills`, whose tarball comes in well under 15s on a fast link. They never exercise the >15s tarball case. The fix adds a third explicit per-skill test (`live_codeload_install_azure_prepare`) for the user-reported case + this broad sample test for the wide coverage the user explicitly asked for.

## Implications for the fix (informs Deliverable 2)

1. **Single biggest win**: raise the codeload-tarball timeout to something realistic for multi-MB downloads on consumer connections (120s). Done as a per-request `.timeout(...)` override on the existing client (simpler than a second `OnceLock<Client>`, no behavioral change for JSON API calls).
2. **Surface real error class** so the next user report carries useful info (`is_timeout()` / `is_decode()` / `is_connect()` + bytes-downloaded + elapsed). The current bare-`Display` masking of "timeout looks like decode" is what made this bug expensive to diagnose.
3. **Stream the body** so we *can* report bytes-so-far at error time. Use `chunk()` (no extra cargo feature needed; `bytes_stream()` requires `stream` feature).
4. **No-gzip dedicated client (2d) NOT needed.** Verified that codeload responds without `Content-Encoding: gzip`, so reqwest's auto-decompression (`gzip(true)`) is a no-op for this path (`reqwest-0.12.28/src/async_impl/client.rs:1218-1227`: "if its headers contain a `Content-Encoding` value of `gzip`..."). Skipping 2d.
