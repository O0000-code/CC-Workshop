# Validate Numerical Equivalence Claims

When a spec, doc, comment, or commit message claims two numerical entities are "equivalent", "equal", "matches", or "can replace" each other, that claim must be backed by numerical reproduction — running both entities under the same inputs and showing the output difference is below a stated tolerance. Without reproduction, the claim must be retracted to a qualitative one ("similar in shape", "same family", "comparable feel") — not a stronger numerical claim.

## Why

Numerical equivalence is a precision claim. Precision claims propagate: a downstream reader trusts your "equivalent" and substitutes one for the other in their own reasoning. If the equivalence does not actually hold, every downstream substitution carries hidden error. Ad-hoc precision in specs is worse than no precision — it manufactures false confidence.

In this project, `02_design_spec.md` V1 and V2 claimed that a CSS `cubic-bezier(0.16, 1, 0.3, 1)` transition over 220 ms was "equivalent" to a Framer Motion spring `{ stiffness: 500, damping: 40 }`. A V2 review SubAgent reproduced both curves in Python (cubic-bezier via Newton-Raphson, spring via the standard underdamped step response) and found:
- Maximum difference 48% at t=41 ms
- RMSE across the full 0–400 ms window of 20%
- Visual completion time gap of 89 ms (65% of total animation duration)

The cubic-bezier completes 99% of progress by 137 ms; the "equivalent" spring is still at 87% at 220 ms. The two are not in the same family of curves: cubic-bezier ease-out has nonzero initial velocity, while a spring step response always starts from zero velocity. No spring parameters can match the cubic-bezier within 5% RMSE — they are mathematically distinct curve families. V3 retracted the "equivalent" claim, replaced it with "similar in shape, not numerically equivalent — pick the spring only if you change the implementation to motion".

About 2 hours of indirect rework. Worse: had this not been caught, every developer reading the spec would carry the false belief that cubic-bezier and spring are interchangeable and substitute them inside other animations.

## How to Apply

**Trigger** — your text contains any of:
- "X is equivalent to Y" with at least one being numerical
- "X matches Y", "X = Y", "X replaces Y", "swap X for Y", in a numerical context
- Tables claiming parameter equivalences across libraries or curve families
- Migration notes that assume equal behavior across versions or implementations

**Required action**:
1. **Reproduce**. Spawn a SubAgent (or do it yourself) to evaluate both entities at sufficient sample points using their actual definitions, not approximations.
2. **Measure**. Compute RMSE across the relevant window and the maximum point-wise difference. State both.
3. **Threshold**. If RMSE > 5% or max difference > 10%, the claim does not hold. Either remove the claim or restate it qualitatively.

**Honest retraction is the correct move**, not a defect. When a reviewer points out that your precision exceeds your evidence, the right response is to weaken the claim to what evidence supports — not to add more numbers in an attempt to make the false precision feel real. A doc that says "spring and cubic-bezier are similar in shape but cannot be exactly substituted; pick one and stick with it" is a *better* spec than one that asserts equivalence with three decimal places of false confidence.

**Spec hygiene**: when retracting, keep the previously-claimed numbers as "informational reference, not equivalence", clearly labeled. Do not silently delete — the retraction itself is information for future readers.

## When This Does Not Apply

Approximate guidance ("around 200 ms", "roughly the same feel", "in the right neighborhood") is qualitative from the start and does not trigger the rule. The trigger is precision claims that look numerically substitutable.

This rule is the spec-side complement of `verify-third-party-behavior-firsthand.md`: the latter verifies what the library actually does; this one verifies that two numerical descriptions you wrote actually mean the same thing.
