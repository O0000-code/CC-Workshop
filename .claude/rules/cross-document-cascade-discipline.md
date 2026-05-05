# Cross-Document Cascade Discipline

When a project has two or more Decisional documents that together define ground truth (e.g. `design_spec.md` + `tech_plan.md` + `implementation_plan.md`), and the documents go through versioned iteration (V1 → V2 → V3), every revision must do two things:

1. **Declare cascade footprint in the revising document's Revision History** — list which sections in *other* documents are affected by this change.
2. **Before transitioning to the next phase** (implementation, review, release), spawn one independent alignment SubAgent whose sole job is to scan all decisional documents for cross-document consistency. This is a different SubAgent from any content review.

## Why

Decisional documents that reference each other drift silently. Updating `02_design_spec.md` from V2 to V3 changes section numbers, parameter values, and acceptance criteria; `04_implementation_plan.md` and the SubAgent task cards inside it can easily continue pointing at V2 content even after the spec author "finished" the V3 revision. The downstream SubAgent picking up an implementation task reads the stale plan, implements against V2, and reproduces the bugs V3 was meant to fix.

In this project, V2 → V3 revision of `02_design_spec.md` and `03_tech_plan.md` left `04_implementation_plan.md` unchanged. The drift introduced three P0s into the implementation contract: T8's `modifiers` config still pointed at V2 (which would have re-introduced the X=0 DragOverlay bug), T13b acceptance #4 still described V2's fixed-220ms settle (V3 made it distance-aware), and T13b acceptance #8 still claimed a "spring micro-overshoot" that V3 had explicitly retracted. A T0 alignment SubAgent caught all three before any T1 implementation SubAgent fired. Without that gate, ~4–6 hours of rework would have been required after the implementing SubAgent completed work that didn't match V3 spec.

This is complementary to `document-authority-ranking.md` (in `~/.claude/rules/`), not a duplicate. Authority ranking answers "who wins when two documents conflict"; cascade discipline answers "after I edit document A, who else needs to change". Both must hold simultaneously.

## How to Apply

**Trigger**: Two or more Decisional-tier documents have been revised to a new shared version (V_n → V_{n+1}) and the next phase is about to start.

**Action 1: Revision History with explicit cascade footprint.** The Revision History block at the top of each revised document must list the touched sections in *other* documents:

```markdown
## Revision History (V2 → V3)

V2 review surfaced N residual P0s. V3 fixes:
- §2.5 magnetic-snap algorithm (continuous gravity well, replaces V2 binary threshold)
  → cascade: invalidates 03_tech_plan §11 implementation pseudocode → must rewrite
  → cascade: invalidates 04_implementation_plan §T8 acceptance #5 → must reword
- §6.1 acceptance criteria reworded for distance-aware settle
  → cascade: 04_implementation_plan §T13b #4 must mirror new wording
```

If the cascade footprint is unknown when you finish editing, that is itself the signal that you do not yet understand the change.

**Action 2: Alignment SubAgent.** A blocking, single-purpose SubAgent that:
- Reads the current versions of all decisional documents (verbatim, not summaries).
- Cross-checks every section number, every numeric parameter, every acceptance bullet, and every cross-reference for consistency.
- Reports P0 contradictions (one document says X, another says ¬X) separately from P1 stylistic drift.
- Does *not* evaluate content quality — that is the content reviewer's job.

The alignment SubAgent must run *after* the human author thinks the revision is complete and *before* any phase that consumes the documents (implementation, content review, publication). Its existence as a separate SubAgent — not folded into the content reviewer — is the point: content reviewers focus on whether ideas are good and miss version drift; alignment reviewers focus on consistency and stay neutral on content.

**Loop**: If the alignment SubAgent finds P0 contradictions, the author must fix them and re-run the alignment SubAgent before the next phase. Same-version content reviews can run in parallel; alignment must succeed before consumption.

## When This Does Not Apply

Single-document specs, specs without versioned iteration, or one-shot drafts that go straight from idea to implementation without intermediate revision do not need this gate.
