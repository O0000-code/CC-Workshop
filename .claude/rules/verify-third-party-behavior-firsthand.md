# Verify Third-Party Behavior Firsthand

Whenever a spec, comment, or piece of code relies on the behavior of a third-party library, browser default, framework, or other external layer ("provided by X"), that behavior must be verified by reading source code or type signatures — not inferred from documentation, tutorials, training-time memory, or prior comments in the same file.

## Why

Documentation lies. Tutorials are out of date. Comments rot — including comments you wrote yourself. Training-time memory is two model generations behind the actual library. The cost of believing any of these instead of looking is paid downstream by everyone who reads the spec or trusts the comment.

In this project, V1 and V2 of `02_design_spec.md` claimed that the snap animation's smoothness would be "provided by DragOverlay's intrinsic CSS transition on transform." This was written into the source comment of `snapModifier.ts`. A user-facing magnetic snap felt jarring; investigation showed dnd-kit v6.3.1's `defaultTransition` returns `undefined` for mouse-driven drags, the project's `.drag-overlay-row` and `.drag-overlay-pill` had no `transition: transform` rule, and the comment in `snapModifier.ts` had been wrong from the moment it was written. ~1.5 hours of rework, three rounds of revision, and a research SubAgent reading 1000+ lines of dnd-kit source were required to find the root cause. The fix did not require any new dependency — the original assumption was simply unverified.

This rule extends `Global Rules.md` ("Investigate Before Answering") into the spec-and-code-writing layer. The global rule says investigate before *answering*; this one says verify before *writing*. They are not redundant — the failure modes are different and the verification artifacts are different.

This rule is also a peer to `academic-reference-verification.md` (cite verification for academic outputs) — same principle (don't trust your own memory of an external source), different artifact (citation metadata vs library API behavior).

## How to Apply

**Trigger** — your spec or code about to commit contains any of:
- "provided by X" / "X handles this automatically" / "the library/browser/runtime takes care of Y"
- A non-trivial use of a third-party API where you have not personally tested the case at hand
- A claim about a default value, default behavior, or fallback that you have not seen in source

**Required artifact** — pick one and link to it inline (in spec) or in commit message:
- File-line reference into `node_modules/<lib>/<dist-or-src-file>:<line>` showing the actual code path that produces the claimed behavior.
- The library's `.d.ts` (or equivalent typed signature) confirming return type, default parameter, or method contract.
- A minimal reproduction script's actual output (saved as evidence).

**Forbidden**: relying on official documentation alone when the claim is non-trivial. Documentation is a starting point for finding the right source file, not the verification itself.

**Special hazard — your own comments**: when you write `// X is provided by the library`, that comment is a claim that becomes your verification source for the next person who reads it. Treat the comment-writing moment as the verification moment. If you cannot link to source at the time of writing, the comment must say so explicitly: `// TODO verify: assumed lib provides this; not checked`.

## When This Does Not Apply

Trivial, well-established API surfaces (basic stdlib, language built-ins like `Array.prototype.map`, idiomatic React `useState`) do not need source verification. The trigger is non-trivial behavior or default-value reliance.
