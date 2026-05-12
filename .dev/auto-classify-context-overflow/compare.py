#!/usr/bin/env python3
"""
Compare classifications across A/B/C/D strategies.

Reads 03_run_{A,B,C,D}.json files. Extracts each strategy's classifications,
computes:
- Category match rate (vs baseline)
- Tag Jaccard similarity (vs baseline)
- Icon match rate (vs baseline)
- Per-skill diff list

Writes a human-readable Markdown comparison to 04_comparison.md and a
machine-readable JSON summary to 04_metrics.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent

def load_run(strategy: str):
    p = HERE / f"03_run_{strategy}.json"
    if not p.exists() or p.stat().st_size == 0:
        return None, None
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        return None, f"JSON parse error: {e}"
    if data.get("is_error"):
        return data, f"is_error=true: {data.get('result')}"
    so = data.get("structured_output")
    if not so or "classifications" not in so:
        return data, f"missing structured_output.classifications"
    return data, None


def to_lookup(classifications):
    """{id: {'category': lower, 'tags': set(lower), 'icon': str}}"""
    out = {}
    for c in classifications:
        cat = (c.get("category") or "").strip()
        tags = [(t or "").strip().lower() for t in c.get("tags") or []]
        tags = {t for t in tags if t}
        icon = (c.get("icon") or "").strip()
        out[c["id"]] = {
            "category": cat,
            "category_lower": cat.lower(),
            "parent_category": (c.get("parent_category") or "").strip(),
            "tags": tags,
            "icon": icon,
        }
    return out


def jaccard(a, b):
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def compute_metrics(strat_lookup, baseline_lookup):
    ids = sorted(set(strat_lookup) & set(baseline_lookup))
    if not ids:
        return None
    cat_matches = 0
    tag_jaccards = []
    icon_matches = 0
    per_skill = []
    for sid in ids:
        s = strat_lookup[sid]
        b = baseline_lookup[sid]
        cat_match = s["category_lower"] == b["category_lower"]
        if cat_match:
            cat_matches += 1
        j = jaccard(s["tags"], b["tags"])
        tag_jaccards.append(j)
        icon_match = s["icon"] == b["icon"]
        if icon_match:
            icon_matches += 1
        per_skill.append({
            "id": sid,
            "category_match": cat_match,
            "tag_jaccard": j,
            "icon_match": icon_match,
            "strat": {"category": s["category"], "parent": s["parent_category"], "tags": sorted(s["tags"]), "icon": s["icon"]},
            "baseline": {"category": b["category"], "parent": b["parent_category"], "tags": sorted(b["tags"]), "icon": b["icon"]},
        })
    return {
        "ids": ids,
        "category_match_rate": cat_matches / len(ids),
        "tag_jaccard_mean": sum(tag_jaccards) / len(tag_jaccards),
        "icon_match_rate": icon_matches / len(ids),
        "per_skill": per_skill,
    }


def main():
    runs = {}
    errors = {}
    for s in ("A", "B", "C", "D"):
        data, err = load_run(s)
        if err:
            errors[s] = err
            print(f"[load] strategy {s}: {err}", file=sys.stderr)
        if data and data.get("structured_output"):
            runs[s] = to_lookup(data["structured_output"]["classifications"])
            print(f"[load] strategy {s}: {len(runs[s])} classifications", file=sys.stderr)

    # Pick baseline: D if available, else C
    baseline_strat = None
    for b in ("D", "C", "B"):
        if b in runs:
            baseline_strat = b
            break
    if baseline_strat is None:
        print("FATAL: no runs available as baseline", file=sys.stderr)
        sys.exit(1)
    baseline = runs[baseline_strat]

    summary = {
        "baseline_strategy": baseline_strat,
        "baseline_size": len(baseline),
        "errors": errors,
        "metrics": {},
    }
    for s in ("A", "B", "C", "D"):
        if s not in runs or s == baseline_strat:
            continue
        m = compute_metrics(runs[s], baseline)
        summary["metrics"][s] = m

    # Also include baseline vs itself (for sanity)
    self_metrics = compute_metrics(baseline, baseline)
    summary["metrics"][baseline_strat + "_self"] = self_metrics

    out = HERE / "04_metrics.json"
    out.write_text(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"wrote {out}", file=sys.stderr)

    # Generate Markdown comparison
    md = []
    md.append("# 04 — A/B/C vs D Comparison")
    md.append("")
    md.append(f"**Baseline strategy**: `{baseline_strat}` ({len(baseline)} classifications).")
    if errors:
        md.append("")
        md.append("## Errors / fallbacks")
        for s, e in errors.items():
            md.append(f"- Strategy **{s}**: {e}")
    md.append("")
    md.append("## Summary metrics (vs baseline)")
    md.append("")
    md.append("| Strategy | Skills | Category match | Tag Jaccard (mean) | Icon match | Quality bar met? |")
    md.append("|---|---:|---:|---:|---:|---|")
    for s in ("A", "B", "C", "D"):
        if s not in summary["metrics"]:
            continue
        m = summary["metrics"][s]
        if m is None:
            continue
        cm = m["category_match_rate"]
        tj = m["tag_jaccard_mean"]
        im = m["icon_match_rate"]
        bar = "✓" if (cm >= 0.85 and tj >= 0.70) else "✗"
        md.append(f"| **{s}** | {len(m['ids'])} | {cm:.0%} | {tj:.2f} | {im:.0%} | {bar} |")
    md.append("")
    md.append("Quality bar = **category match ≥ 85% AND tag Jaccard ≥ 0.70**.")
    md.append("")

    # Per-strategy diff lists
    for s in ("A", "B", "C", "D"):
        if s not in summary["metrics"] or s == baseline_strat:
            continue
        m = summary["metrics"][s]
        if m is None:
            continue
        md.append(f"## Per-skill diff: strategy {s} vs {baseline_strat}")
        md.append("")
        md.append("| id | cat match | tag J | icon match | strat (cat / tags / icon) | baseline (cat / tags / icon) |")
        md.append("|---|:---:|---:|:---:|---|---|")
        for row in m["per_skill"]:
            sm = "✓" if row["category_match"] else "✗"
            im = "✓" if row["icon_match"] else "✗"
            strat_str = f"`{row['strat']['category']}` / {row['strat']['tags']} / `{row['strat']['icon']}`"
            base_str = f"`{row['baseline']['category']}` / {row['baseline']['tags']} / `{row['baseline']['icon']}`"
            md.append(f"| {row['id']} | {sm} | {row['tag_jaccard']:.2f} | {im} | {strat_str} | {base_str} |")
        md.append("")

    md.append("## Strategy notes")
    md.append("")
    md.append("- **A** = description-only (no `instructions` field). Total ≈ 8 K tokens for 20-skill batch.")
    md.append("- **B** = first 500 chars of SKILL.md body. Total ≈ 14 K tokens.")
    md.append("- **C** = first 1500 chars of SKILL.md body. Total ≈ 30 K tokens.")
    md.append("- **D** = full SKILL.md body. Total ≈ 180 K tokens on full 56-skill set (overflows Sonnet's 200 K context).")
    md.append("")

    out_md = HERE / "04_comparison.md"
    out_md.write_text("\n".join(md))
    print(f"wrote {out_md}", file=sys.stderr)


if __name__ == "__main__":
    main()
