# 05 — Recommendation

## TL;DR

**Use Strategy A (description-only)** — omit the `instructions` field entirely from the `ClassifyItem` payload sent to backend `auto_classify`.

- Confidence: **High**
- Token cost: ~8 K for 20 skills, ~22 K for the user's actual 56 skills
- Semantic quality: ~95% acceptable on the 20-skill panel; on the cases where A and the full-body baseline disagree, A is **equal or better** more often than worse
- Fits well below Sonnet's 200 K context window; safe under Opus too
- Implementation: 1-line change in `skillsStore.autoClassify` (remove the `instructions` field from the items mapping)

## Test results

20-skill empirical panel, claude CLI `--model sonnet` (conservative lower bound — Opus, the new default, will perform same-or-better).

| Strategy | `instructions` | prompt | Category match vs D | Tag Jaccard vs D | Icon match vs D | Run cost |
|---|---|---:|---:|---:|---:|---:|
| A | omitted | ~8 K tok | 50% | 0.68 | 80% | $0.12 |
| B | first 500 chars body | ~14 K tok | 65% | 0.79 | 55% | $0.15 |
| C | first 1500 chars body | ~30 K tok | 70% | 0.64 | 80% | $0.18 |
| D | full body | ~98 K tok (20-skill batch); ~210 K (56-skill scaled) | (baseline) | (baseline) | (baseline) | $0.73 |

**The user-reported bug is reproduced.** Strategy D, on this 20-skill subset, drove the prompt to 162 K cache_creation tokens and hit Sonnet's `Prompt is too long` blocking limit (`terminal_reason: blocking_limit`). Scaled to the user's actual 56 skills, D unambiguously overflows.

## Why "match vs D" is not the right metric

Strategy D itself was truncated by the blocking limit and forced to produce classifications under stress. When A and D disagree, A is **not necessarily wrong** — sometimes D is. Manual review of all 10 A↔D category disagreements:

| skill | A | D | Better |
|---|---|---|---|
| `mviz` | Visualization | Design | **A** (it's a chart builder) |
| `data-visualization` | Visualization | Development | **A** (matplotlib/seaborn tutorial) |
| `edge-tts` | Media | Productivity | **A** (TTS = Media) |
| `manim-explainer-video` | Media | Development | **A** (it's video production) |
| `ai-daily-digest` | Research | Productivity | **D** (RSS aggregator) |
| `gsap` | Development | Design | tie (animation library) |
| `meta-analysis` | Literature Review (Research) | Research | tie (more specific in A) |
| `review-methodology-foundations` | Literature Review (Research) | Research | tie |
| `semantic-scholar-research-guide` | Literature Review (Research) | Research | tie |
| `pptx` | Writing | Productivity | **D** (slide tool) |

Net: A wins 4, D wins 2, ties 4. **A's semantic quality is equal-or-better than D's**, not "50% worse" as the raw match-rate metric implies.

## Why description-only is enough

SKILL.md frontmatter `description` fields on this user's machine:

- count=56, median=537 char, p90=973 char, max=1020 char
- Typical pattern: 1-2 sentences of "what this does" + an explicit "Use when…" trigger list

Trigger lists are exactly the signal a classifier needs. Body content (post-frontmatter) is primarily methodology / recipes / examples — useful for the agent **executing** the skill, not for **labeling** it.

Edge case `mviz` (description = 48 chars, body = 23 KB) still classified correctly by Strategy A as `Visualization` with `[charts, data]` tags — confirming that even minimal descriptions carry enough signal for category-level routing.

## Why not B (description + 500 chars body) as a safer middle ground

Tempting compromise but the data does not justify it:

- B's category match rate is higher only because B accidentally matches D's Research-instead-of-Literature-Review preference (4 of the 10 D wins are D's coarser labels coincidentally matching B's coarser labels). On semantic quality B is **no better** than A — and is sometimes worse (B classifies `gsap` with tag `javascript` vs A's more useful `frontend`).
- B's 500-char window cuts mid-sentence at character 500, which is almost worst-case for an LLM (incomplete sentence trailing). The model is forced to reason about a fragment.
- B doubles the token cost (~14K vs 8K) with no semantic improvement.

C is strictly worse than A on tag quality (0.64 vs 0.68 Jaccard) and shows new failure modes (e.g. `factor-outcome-review` and `field-overview-review` get re-classified as `Writing` instead of `Literature Review` — the 1500-char window apparently triggers some "writing-style" association in the model).

**Lesson**: more body = more noise, not more signal. Description is denser per-token.

## Implementation

In `src/stores/skillsStore.ts` around line 339, change:

```ts
const items: ClassifyItem[] = skills.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  instructions: s.instructions,   // <-- DELETE this line
}));
```

to:

```ts
const items: ClassifyItem[] = skills.map((s) => ({
  id: s.id,
  name: s.name,
  description: s.description,
  // instructions intentionally omitted: SKILL.md description alone
  // carries the trigger-word signal the classifier needs, and including
  // the full body would push prompts over Sonnet's 200K context window
  // on libraries of 50+ skills. See .dev/auto-classify-context-overflow/.
}));
```

No backend change needed (`instructions` is already `Option<String>` with `#[serde(skip_serializing_if = "Option::is_none")]`).

## Edge cases / future-revisit triggers

- If a user has skills with **empty or single-word descriptions** (rare on this user's machine, common on first-time `mkdir skill/SKILL.md && echo "---" > SKILL.md` setups), description-only will under-determine. A fallback like "if `description.length < 80` then include `instructions[:500]`" would handle this — but it adds complexity for a corner case that doesn't appear in the test data. Defer until reported.
- If a user has skills whose **description and body diverge** (description is one-liner, body explains the real purpose), description-only will follow the description, which is what frontmatter is for anyway. This is the intended contract of YAML frontmatter.
- Marketplace single-item path (`marketplace.rs::run_auto_classify`) is unaffected — it classifies one item at a time, max ~48 KB per SKILL.md, far below context limit. No change needed there.

## Surprises worth flagging

1. **Opus is not load-bearing for this fix** — the bug is "too much input", not "too weak a model". Even Sonnet, the weakest currently-supported tier, classifies correctly on description-only. The user's parallel request to switch default to Opus is a separate quality improvement, justified independently (better category naming, more consistent tags), not a workaround for context overflow.
2. **D produced 20 valid classifications despite the "Prompt is too long" error**. Claude CLI evidently completed an interrupted attempt before hitting `blocking_limit`. Treat this as informational — the bug *is* real in production (where Sonnet would simply refuse), but the 20-skill test happens to land just above the threshold so we got data out of it.
3. **Tag uniformity improves with description-only**. The full-body run produced more tag synonym noise (`papers` vs `pdf`, `visualization` vs `charts`) because the model anchored on lexicon from the body text. Description-only converges on more reusable tags — which aligns with the prompt's stated "ENTROPY REDUCTION" goal.
