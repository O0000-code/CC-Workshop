# Validate Curated Upstream IDs Before Shipping

When code, config, or documentation contains a static list of identifiers that name external resources the runtime will dereference — npm package names, GitHub `owner/repo` slugs, REST endpoint ids, registry handles, domain names, file-system paths inside known repos — every entry must be verified against the real upstream before the list is allowed to merge. Author confidence ("these look right to me") is not verification.

## Why

LLM-written upstream identifier lists routinely contain a substantial fraction of plausible-but-fabricated entries. The model samples from a distribution shaped by training data; for any domain it lacks dense knowledge of, it returns names that match the *style* of real names without being real. The hallucinated entries pass `cargo build` (the strings compile), pass unit tests (mocks accept any string), and pass code review (reviewers cannot distinguish real from fake by eye). They fail only on first runtime dereference — by which point the list has shipped and a fix-cycle is required.

Verification at write-time is one HTTP call per entry. Verification at user-report time costs the engineer plus the user.

## How to apply

**Trigger** — any of:
- a static collection (`const`, JSON, YAML, markdown table) whose entries are upstream identifiers
- a SubAgent or AI tool was asked to **generate** such a list (vs. reproducing a list the user supplied verbatim)
- a list described as "curated" / "verified" with no per-entry citation

**Required evidence**, one per entry, retained in code or PR description:
- *npm packages*: `curl -o /dev/null -w '%{http_code}' https://registry.npmjs.org/<package>` returns 200
- *GitHub repos / paths*: HTML scrape of `https://github.com/<owner>/<repo>/tree/<branch>/<path>` (avoids the 60 req/h API rate limit)
- *REST endpoints*: `curl` with the exact runtime headers
- *Anything else*: a reproducible command whose output proves existence in the form the runtime calls

**Verify the exact form the runtime uses** — proving `https://github.com/<owner>/<repo>` exists does not prove `<path>/SKILL.md` inside it exists. The runtime dereferences a specific URL; verify that URL.

**Verify all entries**, not a sample. Hallucinations are uniformly distributed across the list, not concentrated at the start.

**Where possible, encode verification as an `#[ignore]` live integration test**:

```rust
#[test]
#[ignore = "live network"]
fn live_seed_entries_resolve() { /* curls each entry */ }
```

This makes regression detection cheap when the upstream evolves.

## Anti-patterns

- "Spot-check the first 5; the rest follow the same pattern." Hallucinations are random.
- Comment `// based on <directory> leaderboard` with no per-entry citation.
- Verifying via a different format than the runtime calls (e.g., checking the repo exists when the runtime dereferences a sub-path).
- "The user will tell us if any are wrong." The user is not free QA, and the cost of fix-cycles is many times the verification cost.
- Trusting `cargo build` / `npm test` to catch this. They cannot — fixtures use mock strings; the network is not exercised.

## Out of scope

- Lists handed by the user verbatim (the user is the authority).
- Single-entry references derived from a known source the author can quote.
- Lists where the runtime explicitly tolerates 404 / unknown entries as a normal flow (document the tolerance at the call site).

## Sibling rules

- `validate-no-public-api-claim.md` — same methodology applied to "does this API exist" rather than "does this identifier exist".
- `~/.claude/rules/academic-reference-verification.md` — the same principle in the academic-citation domain.
- `verify-third-party-behavior-firsthand.md` — same family applied to library API behavior.
- `~/.claude/rules/Global Rules.md` "Investigate Before Answering" — the parent principle.
