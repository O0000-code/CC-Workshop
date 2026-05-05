# Fix Must Define User-Observable Success Criterion

When making a fix in response to user-reported behavior — a visual bug, an interaction bug, an "X doesn't work" complaint — the fix must declare a **user-observable success criterion** before push / build / install. A developer-observable proxy (console output, intermediate state, dwell-state values, jsdom test results) is not a substitute.

## Why

The failure mode this rule prevents is "false convergence via mid-state observation". The lead agent changes code, observes that some intermediate signal (a `console.warn`, a piece of internal state, a test that exercises one slice of the pipeline) now matches what the lead agent expected, and declares the fix complete. The build is pushed; the user re-tests; the user reports "no difference". The developer-side proxy was passing while the user-side bug was unchanged.

In this project's category-hierarchy session, rounds 1-3 of the "drop-into" fixes all followed this pattern: change code → console.warn now reports the correct dwell state → push build → user reports "still no difference". The lead agent was using the developer-side proxy (console output of `pointerBelowOver` selection) to claim the user-side bug was fixed. Three full rounds of build / install / user-test were burned before the lead agent stopped using console as the success proxy and began defining what the user should *see* on screen as the contract for "fix complete".

User-observable success is the fix's contract. Skipping it means using mid-state observation in place of end-state verification, and the cost compounds across rounds.

## How to Apply

**Trigger** — your current task has all of:

- A commit message that contains `fix:` or otherwise addresses a user-reported complaint
- A subsequent step that involves "push build", "let user test", "install to /Applications/", or similar user-facing handoff
- The fix changes runtime behavior (not pure refactoring or comment-only changes)

"User" here means the end user who originally reported the problem (or a stand-in for that role) — not a developer running unit tests, not the SubAgent that wrote the fix, not the lead agent reviewing logs. The whole point of the rule is to prevent developer-side proxies from substituting for end-user observation.

**Required action** — before declaring the fix complete, write three lines:

- **User action**: "User does X" — the concrete operation the user performs (e.g. "User drags row A onto row B")
- **Observable change**: "User sees Y" — what is now different on screen, in the rendered DOM, or in the running app from the user's seat (e.g. "Row A becomes indented under row B; row B shows a chevron")
- **Anti-observation (invariant)**: "User does NOT see Z" — what the bug used to do and must no longer do (e.g. "Row A does not snap back to root after the drop")

These three lines are the contract. Console output, intermediate state values, single-slice unit tests, and jsdom or other headless test results are developer-observable proxies — none of them satisfy this rule on their own. They can be useful as ancillary evidence, but the contract is the user-visible diff, and the contract is checked at the user-visible layer before push.

**Where to put it** — inline in the commit message body, or as a checklist comment on the PR / patch description, or in the implementation log. One short paragraph; not a full test plan, just the three lines and any notes that disambiguate them.

**Self-check before push** — the lead agent uses these three lines as its own pre-push gate. If the lead agent has not personally verified the "User sees Y" line in the actual built app (or, when a real build is impractical, by reasoning through the rendered output tree end-to-end and naming the specific DOM nodes that change), the fix is not ready to push.

## When This Does Not Apply

- Refactors that do not change runtime behavior
- Backend / data-layer changes that have no user-visible surface and are validated by structural assertions or contract tests
- Documentation-only changes
- Build-tooling changes (CI configs, lint rules) where the user-observable layer is the developer's own workflow, not an end user

## Anti-Patterns

- "console.warn now logs the right state" — developer-observable proxy
- "the unit test that targets the broken function now passes" — single-slice proxy; doesn't verify the broader behavior the user complained about
- "the dev tools panel shows the right value" — developer-observable
- "I traced through the code and the logic looks correct" — reasoning is not observation; reasoning is what produced the bug in the first place

## Relation to Other Rules

This rule is the "after the fix is implemented, before push" gate. It sits alongside `Global Rules.md` "Investigate Before Answering" and the project's research-before-bug-fix discipline (which guards the "before the fix is started" phase). Together they cover the full fix lifecycle: investigate before starting, define user-observable success before pushing.
