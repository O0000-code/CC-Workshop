# 01 — 20-skill empirical sample

Source: `~/.claude/skills/` on user's machine (count=56). Coverage requirements (per task spec):
- ≥ 5 large (SKILL.md > 30 KB)
- ≥ 8 medium (10–30 KB)
- ≥ 7 small (< 10 KB)
- ≥ 8 distinct domains
- include `mviz` (very short `description`, 48 chars) AND `factor-outcome-review` (very large, 48 KB)

## Picks (20 total)

| # | Skill id | SKILL.md (B) | desc chars | body chars | Domain | Why representative |
|---|---|---:|---:|---:|---|---|
| 1 | `factor-outcome-review` | 48 693 | 754 | 30 163 | academic-review | Required edge case. Largest. Chinese, multi-trigger description with explicit "use whenever / do NOT use" structure. |
| 2 | `field-overview-review` | 43 853 | 931 | 28 604 | academic-review | Second-largest. Bilingual triggers, complex sibling-skill negative list. |
| 3 | `meta-analysis` | 38 033 | 1 002 | 24 535 | academic-stats | Statistics/quant research; rich `description` (~p90 of dataset). |
| 4 | `humanizer-zh` | 32 772 | 234 | 13 154 | writing/editing | Large body but short Chinese description — tests body-vs-desc tradeoff. |
| 5 | `skill-creator` | 33 168 | 319 | 32 624 | dev-tooling | Largest pure-body. Description is short and abstract; lots of signal lives in body. |
| 6 | `mviz` | 23 637 | **48** | 23 536 | data-viz | **Required edge case** — description is a single sentence ("A chart & report builder designed for use by AI."). Tests "description-only" failure mode. |
| 7 | `practical-ui` | 22 428 | 1 011 | 21 146 | ui-design | Rich description (close to max). Lots of trigger keywords. |
| 8 | `taste-skill` | 21 148 | 202 | 20 889 | ui-design | Note: `name` in frontmatter is `design-taste-frontend`. Short tagline-style description. |
| 9 | `review-methodology-foundations` | 22 093 | 964 | 13 319 | academic-meta | Edge case: **explicitly NOT user-triggered** (consumed by other review skills). Tests model's reasoning about negative triggers. |
| 10 | `semantic-scholar-research-guide` | 18 362 | 715 | 9 674 | research/search | Academic search; clear use-case list. |
| 11 | `manim-explainer-video` | 14 718 | 801 | 13 841 | video/animation | Multi-component pipeline (Manim + TTS + ffmpeg); good "complex tool" test. |
| 12 | `web-search-research-methodology` | 12 719 | 848 | 11 805 | research/search | Methodology focus rather than tool; tests Research vs Productivity boundary. |
| 13 | `data-visualization` | 11 051 | 255 | 10 725 | data-viz | Short description, long body — symmetric to humanizer-zh. |
| 14 | `gsap` | 3 431 | 577 | 2 813 | dev/animation | Small but rich description with explicit trigger list. |
| 15 | `web-design-guidelines` | 1 231 | 184 | 914 | ui-design | Smallest skill overall. Body barely 1 KB. |
| 16 | `dokobot` | 5 550 | 280 | 4 393 | web/scraping | Browser automation; clear domain. |
| 17 | `edge-tts` | 4 249 | 329 | 3 881 | audio/media | TTS — domain underrepresented in dataset. |
| 18 | `ai-daily-digest` | 6 842 | 429 | 4 495 | productivity/RSS | Tests Productivity vs Research boundary. |
| 19 | `paper-downloader-portable` | 5 292 | 253 | 4 964 | infrastructure | DOI/PDF downloader — tests Research vs Infrastructure boundary. |
| 20 | `pptx` | 9 182 | 694 | 8 344 | productivity/office | Slide-deck tool. Distinct domain. |

## Coverage check

- **Size**: large = 5 (#1–5), medium = 8 (#6–13), small = 7 (#14–20). ✓
- **Domains** (≥ 8 required): academic-review, academic-stats, academic-meta, writing/editing, dev-tooling, data-viz, ui-design, research/search, video/animation, dev/animation, web/scraping, audio/media, productivity, productivity/office, infrastructure. **15 distinct domains** ✓
- **Edge cases**: `mviz` (48 char desc) ✓ , `factor-outcome-review` (48 KB) ✓ , `review-methodology-foundations` (explicitly NOT user-triggered — a stress test for "what category does a shared internal library belong to") ✓ .

## What we deliberately did NOT include and why

- **Plugin-installed marketplaces** (e.g. `marketing-psychology 2`, `Session Reflection`): user-facing classifier won't include duplicates; would skew tag-match metric.
- **`learned`**: bare directory without normal frontmatter shape; behaves as an outlier.
- **Symlinked sibling skills** with identical content to a primary skill (kept primary only).

## Body-character footprint (relevant for prompt-size budgeting)

| Strategy | Total `instructions` chars across 20 | ≈ tokens (chars/4) |
|---|---:|---:|
| A — omit `instructions` | 0 | 0 |
| B — first 500 chars | min(500, body) × 20 ≈ 8 727 | ≈ 2 200 |
| C — first 1500 chars | min(1500, body) × 20 ≈ 24 327 | ≈ 6 100 |
| D — full body | 285 657 | ≈ 71 400 |

Strategy D's prompt itself (with the framework boilerplate + JSON serialization) sits at ~75 K tokens on this 20-skill sample. Scaled to the user's 56 skills, D would be ~210 K tokens — confirming the original bug.
