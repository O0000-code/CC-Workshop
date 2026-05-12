# 04 — A/B/C vs D Comparison

**Baseline strategy**: `D` (20 classifications).

## Errors / fallbacks
- Strategy **D**: is_error=true: Prompt is too long

## Summary metrics (vs baseline)

| Strategy | Skills | Category match | Tag Jaccard (mean) | Icon match | Quality bar met? |
|---|---:|---:|---:|---:|---|
| **A** | 20 | 50% | 0.68 | 80% | ✗ |
| **B** | 20 | 65% | 0.79 | 55% | ✗ |
| **C** | 20 | 70% | 0.64 | 80% | ✗ |

Quality bar = **category match ≥ 85% AND tag Jaccard ≥ 0.70**.

## Per-skill diff: strategy A vs D

| id | cat match | tag J | icon match | strat (cat / tags / icon) | baseline (cat / tags / icon) |
|---|:---:|---:|:---:|---|---|
| ai-daily-digest | ✗ | 1.00 | ✗ | `Research` / ['news', 'rss'] / `Search` | `Productivity` / ['news', 'rss'] / `Sparkles` |
| data-visualization | ✗ | 0.33 | ✓ | `Visualization` / ['charts', 'python'] / `Image` | `Development` / ['python', 'visualization'] / `Image` |
| dokobot | ✓ | 1.00 | ✓ | `Web` / ['browser', 'scraping'] / `Globe` | `Web` / ['browser', 'scraping'] / `Globe` |
| edge-tts | ✗ | 1.00 | ✓ | `Media` / ['audio', 'tts'] / `Mic` | `Productivity` / ['audio', 'tts'] / `Mic` |
| factor-outcome-review | ✓ | 0.33 | ✓ | `Literature Review` / ['chinese', 'review'] / `FileText` | `Literature Review` / ['academic', 'review'] / `FileText` |
| field-overview-review | ✓ | 1.00 | ✓ | `Literature Review` / ['academic', 'review'] / `FileText` | `Literature Review` / ['academic', 'review'] / `FileText` |
| gsap | ✗ | 1.00 | ✓ | `Development` / ['animation', 'frontend'] / `Code` | `Design` / ['animation', 'frontend'] / `Code` |
| humanizer-zh | ✓ | 1.00 | ✓ | `Writing` / ['chinese', 'editing'] / `FileText` | `Writing` / ['chinese', 'editing'] / `FileText` |
| manim-explainer-video | ✗ | 1.00 | ✓ | `Media` / ['animation', 'video'] / `Image` | `Development` / ['animation', 'video'] / `Image` |
| meta-analysis | ✗ | 0.33 | ✗ | `Literature Review` / ['academic', 'statistics'] / `FileText` | `Research` / ['academic', 'analysis'] / `Brain` |
| mviz | ✗ | 0.00 | ✓ | `Visualization` / ['charts', 'data'] / `Image` | `Design` / ['visualization'] / `Image` |
| paper-downloader-portable | ✓ | 0.33 | ✗ | `Research` / ['academic', 'pdf'] / `FileText` | `Research` / ['academic', 'papers'] / `Search` |
| pptx | ✗ | 0.00 | ✓ | `Writing` / ['office', 'presentation'] / `FileText` | `Productivity` / ['presentations'] / `FileText` |
| practical-ui | ✓ | 1.00 | ✓ | `Design` / ['accessibility', 'ui'] / `Palette` | `Design` / ['accessibility', 'ui'] / `Palette` |
| review-methodology-foundations | ✗ | 1.00 | ✗ | `Literature Review` / ['academic', 'methodology'] / `FileText` | `Research` / ['academic', 'methodology'] / `Brain` |
| semantic-scholar-research-guide | ✗ | 1.00 | ✓ | `Literature Review` / ['academic', 'search'] / `Search` | `Research` / ['academic', 'search'] / `Search` |
| skill-creator | ✓ | 0.50 | ✓ | `Development` / ['ai', 'automation'] / `Wrench` | `Development` / ['automation'] / `Wrench` |
| taste-skill | ✓ | 1.00 | ✓ | `Design` / ['frontend', 'ui'] / `Palette` | `Design` / ['frontend', 'ui'] / `Palette` |
| web-design-guidelines | ✓ | 0.33 | ✓ | `Design` / ['accessibility', 'ui'] / `Palette` | `Design` / ['review', 'ui'] / `Palette` |
| web-search-research-methodology | ✓ | 0.33 | ✓ | `Research` / ['search', 'web'] / `Search` | `Research` / ['methodology', 'search'] / `Search` |

## Per-skill diff: strategy B vs D

| id | cat match | tag J | icon match | strat (cat / tags / icon) | baseline (cat / tags / icon) |
|---|:---:|---:|:---:|---|---|
| ai-daily-digest | ✓ | 1.00 | ✗ | `Productivity` / ['news', 'rss'] / `Globe` | `Productivity` / ['news', 'rss'] / `Sparkles` |
| data-visualization | ✓ | 1.00 | ✗ | `Development` / ['python', 'visualization'] / `Palette` | `Development` / ['python', 'visualization'] / `Image` |
| dokobot | ✓ | 1.00 | ✓ | `Web` / ['browser', 'scraping'] / `Globe` | `Web` / ['browser', 'scraping'] / `Globe` |
| edge-tts | ✗ | 1.00 | ✓ | `Media` / ['audio', 'tts'] / `Mic` | `Productivity` / ['audio', 'tts'] / `Mic` |
| factor-outcome-review | ✗ | 1.00 | ✓ | `Research` / ['academic', 'review'] / `FileText` | `Literature Review` / ['academic', 'review'] / `FileText` |
| field-overview-review | ✗ | 1.00 | ✗ | `Research` / ['academic', 'review'] / `Search` | `Literature Review` / ['academic', 'review'] / `FileText` |
| gsap | ✗ | 0.33 | ✓ | `Development` / ['animation', 'javascript'] / `Code` | `Design` / ['animation', 'frontend'] / `Code` |
| humanizer-zh | ✓ | 1.00 | ✓ | `Writing` / ['chinese', 'editing'] / `FileText` | `Writing` / ['chinese', 'editing'] / `FileText` |
| manim-explainer-video | ✗ | 1.00 | ✓ | `Media` / ['animation', 'video'] / `Image` | `Development` / ['animation', 'video'] / `Image` |
| meta-analysis | ✓ | 0.33 | ✓ | `Research` / ['academic', 'statistics'] / `Brain` | `Research` / ['academic', 'analysis'] / `Brain` |
| mviz | ✗ | 0.50 | ✗ | `Development` / ['reporting', 'visualization'] / `Palette` | `Design` / ['visualization'] / `Image` |
| paper-downloader-portable | ✓ | 0.33 | ✗ | `Research` / ['download', 'papers'] / `FileText` | `Research` / ['academic', 'papers'] / `Search` |
| pptx | ✓ | 0.00 | ✓ | `Productivity` / ['office', 'presentation'] / `FileText` | `Productivity` / ['presentations'] / `FileText` |
| practical-ui | ✓ | 1.00 | ✓ | `Design` / ['accessibility', 'ui'] / `Palette` | `Design` / ['accessibility', 'ui'] / `Palette` |
| review-methodology-foundations | ✓ | 1.00 | ✗ | `Research` / ['academic', 'methodology'] / `FileText` | `Research` / ['academic', 'methodology'] / `Brain` |
| semantic-scholar-research-guide | ✓ | 1.00 | ✓ | `Research` / ['academic', 'search'] / `Search` | `Research` / ['academic', 'search'] / `Search` |
| skill-creator | ✗ | 1.00 | ✗ | `Productivity` / ['automation'] / `Settings` | `Development` / ['automation'] / `Wrench` |
| taste-skill | ✓ | 1.00 | ✗ | `Design` / ['frontend', 'ui'] / `Code` | `Design` / ['frontend', 'ui'] / `Palette` |
| web-design-guidelines | ✓ | 0.33 | ✗ | `Design` / ['guidelines', 'ui'] / `Wrench` | `Design` / ['review', 'ui'] / `Palette` |
| web-search-research-methodology | ✓ | 1.00 | ✓ | `Research` / ['methodology', 'search'] / `Search` | `Research` / ['methodology', 'search'] / `Search` |

## Per-skill diff: strategy C vs D

| id | cat match | tag J | icon match | strat (cat / tags / icon) | baseline (cat / tags / icon) |
|---|:---:|---:|:---:|---|---|
| ai-daily-digest | ✓ | 0.33 | ✗ | `Productivity` / ['automation', 'news'] / `FileText` | `Productivity` / ['news', 'rss'] / `Sparkles` |
| data-visualization | ✗ | 1.00 | ✗ | `Design` / ['python', 'visualization'] / `Sparkles` | `Development` / ['python', 'visualization'] / `Image` |
| dokobot | ✓ | 1.00 | ✓ | `Web` / ['browser', 'scraping'] / `Globe` | `Web` / ['browser', 'scraping'] / `Globe` |
| edge-tts | ✗ | 0.33 | ✓ | `Media` / ['audio', 'speech'] / `Mic` | `Productivity` / ['audio', 'tts'] / `Mic` |
| factor-outcome-review | ✗ | 1.00 | ✓ | `Writing` / ['academic', 'review'] / `FileText` | `Literature Review` / ['academic', 'review'] / `FileText` |
| field-overview-review | ✗ | 1.00 | ✓ | `Writing` / ['academic', 'review'] / `FileText` | `Literature Review` / ['academic', 'review'] / `FileText` |
| gsap | ✗ | 0.33 | ✓ | `Development` / ['animation', 'javascript'] / `Code` | `Design` / ['animation', 'frontend'] / `Code` |
| humanizer-zh | ✓ | 1.00 | ✓ | `Writing` / ['chinese', 'editing'] / `FileText` | `Writing` / ['chinese', 'editing'] / `FileText` |
| manim-explainer-video | ✗ | 1.00 | ✓ | `Media` / ['animation', 'video'] / `Image` | `Development` / ['animation', 'video'] / `Image` |
| meta-analysis | ✓ | 0.33 | ✓ | `Research` / ['academic', 'statistics'] / `Brain` | `Research` / ['academic', 'analysis'] / `Brain` |
| mviz | ✓ | 0.00 | ✗ | `Design` / ['charts', 'dashboard'] / `Sparkles` | `Design` / ['visualization'] / `Image` |
| paper-downloader-portable | ✓ | 0.33 | ✗ | `Research` / ['academic', 'pdf'] / `FileText` | `Research` / ['academic', 'papers'] / `Search` |
| pptx | ✓ | 0.00 | ✓ | `Productivity` / ['presentation', 'slides'] / `FileText` | `Productivity` / ['presentations'] / `FileText` |
| practical-ui | ✓ | 1.00 | ✓ | `Design` / ['accessibility', 'ui'] / `Palette` | `Design` / ['accessibility', 'ui'] / `Palette` |
| review-methodology-foundations | ✓ | 1.00 | ✓ | `Research` / ['academic', 'methodology'] / `Brain` | `Research` / ['academic', 'methodology'] / `Brain` |
| semantic-scholar-research-guide | ✓ | 1.00 | ✓ | `Research` / ['academic', 'search'] / `Search` | `Research` / ['academic', 'search'] / `Search` |
| skill-creator | ✓ | 0.50 | ✓ | `Development` / ['automation', 'testing'] / `Wrench` | `Development` / ['automation'] / `Wrench` |
| taste-skill | ✓ | 0.33 | ✓ | `Design` / ['css', 'frontend'] / `Palette` | `Design` / ['frontend', 'ui'] / `Palette` |
| web-design-guidelines | ✓ | 0.33 | ✓ | `Design` / ['accessibility', 'ui'] / `Palette` | `Design` / ['review', 'ui'] / `Palette` |
| web-search-research-methodology | ✓ | 1.00 | ✓ | `Research` / ['methodology', 'search'] / `Search` | `Research` / ['methodology', 'search'] / `Search` |

## Strategy notes

- **A** = description-only (no `instructions` field). Total ≈ 8 K tokens for 20-skill batch.
- **B** = first 500 chars of SKILL.md body. Total ≈ 14 K tokens.
- **C** = first 1500 chars of SKILL.md body. Total ≈ 30 K tokens.
- **D** = full SKILL.md body. Total ≈ 180 K tokens on full 56-skill set (overflows Sonnet's 200 K context).
