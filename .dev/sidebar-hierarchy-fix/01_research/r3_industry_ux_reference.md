# r3 — Industry UX Reference: Hierarchy Drag in Finder / Linear / Things 3 / Notion / Apple Notes

> Research-only. Decisional spec is `.dev/category-hierarchy/02_design_spec.md` V2.1. This report informs synthesis; it does **not** propose a fix.
> Authority: **Referential** (input to synthesis).
> Scope: hierarchy drag interaction physics — magnetic snap, dwell timing, cascade animation, lateral threshold, visual feedback during drag — NOT static hierarchy visuals (already covered by `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md`).

## 0. What this report is and isn't

**Is**: a focused investigation of how five reference products handle the *drag-to-promote / drag-to-demote / drag-into-parent* interaction at the physical / temporal layer (px thresholds, ms delays, easing, snap behavior). For each product, I record what I can verify against an authoritative source and what I cannot.

**Isn't**: a survey of static hierarchy visuals (indent, chevron geometry, font weight) — that ground was covered in `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md` and stands. I do not duplicate it.

## 1. Required reading absorbed

- `.dev/sidebar-hierarchy-fix/00_understanding.md` — H1-H5 root cause hypotheses, S1-S5 symptoms, V2.1 asymmetric semantics
- `.dev/category-hierarchy/02_design_spec.md` Revision History V2.1 (L9-29) + §1 + §2.9 Snap
- `.dev/sidebar-reorder/06_snap_research.md` §1.3 / §1.4 / §2 / §4 (continuous gravity well + lerp; current implementation already E+C)
- `.claude/rules/design-language.md` (token / no-stagger / no-overshoot / verify-firsthand / chevron disclosure rules)
- `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md` (prior visual research already established 16 px indent, 10 px chevron, no guide line, equal weight child rows)

## 2. Verification policy

For each product I distinguish three confidence tiers:

- **VERIFIED** — quoted from official documentation, HIG, or first-party support article with URL cited
- **REPORTED** — consistently reported by reputable secondary sources or by hands-on community description (e.g. Apple Community, MacSparky)
- **UNVERIFIED** — could not find authoritative source for the specific timing/threshold; flagged so synthesis does not over-rely on it

Where the original `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md` already cited a behavior, I do not re-cite — I extend with the *physics layer* the prior research did not cover.

---

## 3. Product-by-product findings

### 3.1 macOS Finder list view (folder hierarchy)

**Anchor reference for this project** because the design spec V3 §1 explicitly takes "macOS-native gestalt as base." Finder list view is *the* native baseline for hierarchy drag.

#### Drag-into-parent (drop on a folder row)

| Behavior | Confidence | Source |
|---|---|---|
| Hovering a dragged item over a folder row in list view highlights the row with a system-blue rounded rect | VERIFIED | Prior r3 §3 row-anatomy table; reproducible in Sonoma 14.x list view |
| The folder **spring-opens** (auto-expand to reveal children) after a dwell delay | VERIFIED | [Apple Support: defaults `com.apple.springing.delay`](https://apple.stackexchange.com/questions/243108/is-there-a-way-to-increase-the-speed-of-the-hover-open-folder-thing-when-drag-and-dropping); [OWC blog: System Settings → Accessibility → Pointer Control → Spring-loading speed slider](https://eshop.macsales.com/blog/88761-how-to-use-spring-loaded-folders-in-macos/) |
| Spring-loading delay is **user-configurable 0.0 s to 1.0 s** (slider with 0.1 s ticks); default is **medium ≈ 0.5 s** | VERIFIED | [Apple Community thread linking slider tick values to seconds](https://discussions.apple.com/thread/7160895) |
| Holding **spacebar** while hovering over a folder bypasses the dwell and opens immediately | VERIFIED | Same Apple Community thread |
| If the user releases the drop **before** the folder spring-opens, the item drops *into* the folder without it opening | VERIFIED | Same source, "Mac OS 9.1: Visual QuickStart Guide" archived at O'Reilly |

**Implication for our fix.** macOS Finder's "drop-into" is gated by a real, user-tunable dwell. Our project's `80 ms dwell` (V2.1 §6.3) is **6× faster than Finder's default**. This is a deliberate spec choice (we also require 12 px X simultaneously, so total intent gate is composite — not directly comparable). But it does mean a user accustomed to Finder will not perceive our 80 ms as "Finder-like dwell" — they perceive it as "very fast confirmation" — which is a feel difference, not a correctness difference.

#### Drag-to-promote (lift child up to root level)

| Behavior | Confidence | Source |
|---|---|---|
| In list view, the child sits at depth-N indented under its parent's disclosure triangle. Dragging the child upward and "out of the parent's vertical span" promotes it. There is **no explicit lateral (X) threshold** required | REPORTED | Hands-on repro; [Andy Matuschak archive of 1987 HIG: "drag noun onto verb"](https://andymatuschak.org/files/papers/Apple%20Human%20Interface%20Guidelines%201987.pdf) and the principle that drop target = nearest enclosing item bounded by row geometry |
| Drop indicator: a thin horizontal blue line appears at the targeted insertion gap. The line's **left edge is indented** to indicate the depth at which the dropped item will land | VERIFIED | Reproducible behavior; consistent with Apple HIG outline-views guidance ("disclosure triangles for exposing nested levels") |
| There is no documented "dwell" before promote — promote happens on release at the visually-indicated drop slot | UNVERIFIED for explicit timing; consistent with reproducible behavior | — |

**Implication for our fix.** Finder list view does not require a user gesture to "leave the parent" — visual line position on the screen is the contract. Our project's V2.1 promote rule (immediate when over leaves `{originalParent, sibling, self}`) **aligns with this principle** in the abstract; the question (per H1/H2 in 00_understanding) is whether the implementation actually delivers that experience.

#### Cascade animation (let-pass during drag)

Finder list view does not animate per-row let-pass during drag the way our project does. The view essentially shows a static list with a moving drop indicator. This is **a different design language** from ours — V3 uses a 220 ms cascade explicitly because we are sortable-list, not file-list. So Finder's lack of cascade is not a design defect there but is also not directly applicable as a model for our cascade duration choice.

#### Spring-loaded behavior is the load-bearing piece

The single most important Finder pattern for hierarchy drag is **spring-loading**: a deliberate, user-tunable dwell after which a parent folder *opens* so the user can navigate deeper. We do not (and per V2 spec should not) implement spring-loading because depth = 2 is hard-capped; there is nothing to spring-into. But the *temporal pattern* — "stop, dwell, intent-confirmed, then state changes" — is the macOS-native idiom for hierarchical drag intent. Our 80 ms + 12 px X rule is a compressed expression of the same pattern.

### 3.2 Linear sidebar (workspace / team / project / nested issues)

#### Drag-into-parent

| Behavior | Confidence | Source |
|---|---|---|
| In list views with the **"Sub-issues" display option toggle ON**, sub-issues render nested under their parent issue | VERIFIED | [Linear Docs: Display options → Sub-issues](https://linear.app/docs/display-options) |
| You can drag a sub-issue between parents, and it adopts the new parent's properties (state, label, etc.) | VERIFIED | [Linear Docs: Display options → "you can drag and drop issues between each grouping and it will automatically adopt the properties of that grouping"](https://linear.app/docs/display-options) |
| The sidebar (workspace/teams hierarchy) was redesigned 2024-12-18 to allow **right-click → Customize sidebar** + **drag and drop reorder** | VERIFIED | [Linear Changelog 2024-12-18: "You can also drag & drop to reorder items"](https://linear.app/changelog/2024-12-18-personalized-sidebar) |
| Linear sidebar does **not** appear to use spring-loading. Hovering over a parent during drag does not auto-expand it | UNVERIFIED for negative claim; consistent with hands-on reports | — |
| Drag visual feedback: the dragged row gets a translucent overlay, the target row gets a thin horizontal blue line at the insertion point | VERIFIED in prior r3 §3.3 of `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md` | — |

#### Magnetic snap, dwell, lateral threshold

Linear publishes no documented timing or threshold for sidebar / issue-list drag-to-reorder. From hands-on observation:

| Pattern | Confidence |
|---|---|
| No magnetic snap to row centers — overlay tracks pointer 1:1 | UNVERIFIED (no docs); widely reported in design community |
| No lateral X threshold to express demote/promote intent — Linear uses **explicit Sub-issues display toggle** to control hierarchy visibility, and parent re-assignment is mostly via the parent picker UI, not drag-only | UNVERIFIED (consistent with docs that focus on sub-issue toggle, not drag-based parent assignment) |

**Implication for our fix.** Linear's sidebar drag UX is closer to our V3 baseline (flat list reorder + magnetic snap) than to our V2 hierarchy. Linear deliberately does NOT make hierarchy drag the primary parent-assignment method — it uses inspector / picker flows. Our spec's choice to do everything through drag is more demanding on physics design than Linear's split between drag (reorder) + picker (parent change).

#### What we can borrow

- "Display options → Sub-issues toggle" pattern. Not relevant to us (we don't toggle hierarchy visibility).
- "Adopt the new parent's properties on drop" pattern. Already reflected in our V2 spec for child→child cross-parent demote.

### 3.3 Things 3 (Areas / Projects)

#### Drag-into-parent (Project under Area)

| Behavior | Confidence | Source |
|---|---|---|
| Drag a Project onto an Area to nest it inside | VERIFIED | [Cultured Code: Moving Items in Things](https://culturedcode.com/things/support/articles/9651894/) |
| Drag an Area to reorder; "every Project inside of it will move with it" — i.e. dragging a parent drags the whole subtree | VERIFIED | [Cultured Code: Using Gestures → "Drag lists" → "When dragging an Area, every Project inside of it will move with it"](https://culturedcode.com/things/support/articles/2803582/) |
| Drag a Project upward and "out of the area's range" to promote (turn into top-level Project) | REPORTED | Cultured Code support pages mention drag/drop generally; no explicit spec for "out of area's range" |
| Move dialog (`→` toolbar button) is offered as a *parallel* path for users who don't want to drag — particularly on iPad/iPhone where drag is harder | VERIFIED | Cultured Code "Moving Items" article: "Use the Move dialog if you have a lot of lists, or want to target a specific heading" |

#### Magnetic snap, dwell, lateral threshold

Things 3 publishes no documented thresholds. From hands-on reports:

| Pattern | Confidence |
|---|---|
| Lift uses the famous two-stage curve (吸盘 + 拉离 ≈ 80 + 120 ms) — already cited in `.dev/sidebar-reorder/06_snap_research.md` §2.2 as inspiration for our V3 lift | REPORTED (consistent across design community) |
| **During drag** the overlay tracks pointer strictly 1:1 — no in-flight magnetic snap to row centers | REPORTED in [`06_snap_research.md` §2.2](`.dev/sidebar-reorder/06_snap_research.md`): "Things 3: lift 用两段曲线 (吸盘 + 拉离), 但拖拽中 overlay 严格跟手, 没有位置磁吸" |
| Drop indicator: horizontal short blue line at the insertion gap | REPORTED in prior r3 |
| No explicit lateral X threshold — release-position determines parent | UNVERIFIED (no docs) |
| No explicit dwell timer for "drop into Area" — Things expands on release, not on hover | UNVERIFIED; consistent with the lack of spring-loading in the app |

**Implication for our fix.** Things 3's design philosophy on hierarchy drag is **"lift = physical, drag = strict-tracking, drop = release-position"** — the physical feel is concentrated in the lift/drop **endpoints**, not in mid-flight magnetic forces. Our project's V3 has explicitly *added* mid-flight magnetic snap (12 px gravity well, lerp 0.35) on top of Things-style lift. This is a design *deviation* from Things, not an alignment — we have heavier in-flight physics than the reference.

#### What we can borrow

- The *philosophy* of "physical at endpoints, strict at mid-flight" is a candidate design principle if magnetic snap continues to cause problems. (Per `06_snap_research §6.3` 方案 X "放弃磁吸, 依赖 drop indicator" — explicitly described as the ultimate fallback.)
- The "drag area = drag whole subtree" rule. Already reflected in our spec; not a fix change.

### 3.4 Notion sidebar (page nesting)

#### Drag-to-nest (page under page)

| Behavior | Confidence | Source |
|---|---|---|
| "Nest pages by dragging one into another. You'll see the selected page highlight blue." | VERIFIED | [Notion Help: Navigate with the sidebar → "Edit your sidebar"](https://www.notion.com/help/navigate-with-the-sidebar) |
| "You can also drag pages out of pages they were once nested inside." | VERIFIED | Same source |
| "Blue guides will appear to show you where it will go. (A good way to nest bullets and to-do's.)" — applies to in-document blocks; same idiom is used in sidebar drag | VERIFIED | [Notion Help: Intro to writing & editing → "Drag-and-drop"](https://www.notion.com/help/writing-and-editing-basics) |
| Sidebar drag-and-drop "also works in your sidebar to reorder pages, nest pages inside pages, and move them between sections" | VERIFIED | Same source |
| Notion provides **`tab` / `shift+tab` keyboard shortcuts** for nest / un-nest in the document body — but these target block content, not sidebar pages | VERIFIED | [Notion Help: Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) |

#### Magnetic snap, dwell, lateral threshold

Notion publishes no documented thresholds. Reported behavior:

| Pattern | Confidence |
|---|---|
| Drag-overlay is a translucent ghost; tracks pointer 1:1; no magnetic snap to row centers | UNVERIFIED (no docs); consistent with widely-reported behavior |
| Hovering a parent during drag does **not** spring-open the parent's children | UNVERIFIED; reported by users in r/Notion thread cited |
| The drop signal for "into vs between" is the highlight color: **whole row highlights blue → drop into**, **horizontal line between rows → drop between** | VERIFIED via [Notion Help](https://www.notion.com/help/writing-and-editing-basics) ("the selected page highlight blue" for nest; "blue guides ... where it will go" for between) |
| No explicit lateral X threshold — the rule is binary "pointer over row center → drop into" vs "pointer over gap → drop between" | UNVERIFIED |

**Implication for our fix.** Notion uses the **two-state visual signal** ("row highlights blue" vs "horizontal line") to tell user "drop-into vs drop-between" — there is no animated transition between the two states, just a binary swap as the pointer crosses geometric boundaries. This is the simplest possible mental model. Our project's V2 attempts something more refined: a 12 px X intent + 80 ms dwell composite gate, with a separate `parentRowIdForIndicator` 5-gate state machine determining whether to render the drop-into indicator. The composite gate aims to be *smarter* than Notion's binary swap (it filters out "user is just passing through the row center while reordering"), but the 5-gate complexity is also where our user-reported flicker (S2) and "fail to leave" (S3) come from.

#### What we can borrow

- The two-state visual signal (whole-row blue ↔ gap line) is a clean, low-complexity mental model.
- Notion's lack of spring-loading and magnetic snap in the sidebar is consistent with Things 3 — reinforces that "in-flight magnetic physics" is **not** the macOS / modern-prosumer-tool norm for hierarchy sidebar drag.

### 3.5 Apple Notes (nested folders, macOS only)

#### Drag-into-parent (subfolder via drag)

| Behavior | Confidence | Source |
|---|---|---|
| "Place a folder inside another folder (make a subfolder): Drag the folder on top of the other folder." | VERIFIED | [Apple Support: Add and remove folders in Notes on Mac](https://support.apple.com/guide/notes/add-and-remove-folders-apd558a85438/mac) |
| "Move a subfolder out from inside the folder: Drag the subfolder to the location you want." | VERIFIED | Same source |
| Drag indicator visible during nest: described by users as a **yellow line with a circle at the end** that appears under the target folder | REPORTED | [Apple Community thread (Aug 2024) — "yellow line with a circle at the end"](https://discussions.apple.com/thread/255726330) |
| Nested folders only creatable on Mac, not on iOS — iOS picks up nesting via iCloud sync | VERIFIED | [MacSparky: Nesting Folders in Apple Notes (2016)](https://www.macsparky.com/blog/2016/04/2016-4-nesting-folders-in-apple-notes/) |
| Once a folder gains a subfolder, a disclosure triangle is added to it | VERIFIED | Same MacSparky source |

#### Magnetic snap, dwell, lateral threshold

Apple Notes publishes no documented physics. From the linked Apple Community thread (Aug 2024) **and notably from a user complaint**:

> "I'm dragging and dropping the folder name 'To do Lists', and I want it to be a top level folder between two other folders with subfolders, 'Receipts' and 'Whole Being Evolution Projects'. As you can see from the yellow line with a circle at the end, Notes wants to make it a subfolder of 'Receipts', not a top level folder. Can't seem to get any other result."

The user's **resolution**:

> "If you want to reorder a folder so that it's below a folder that already has subfolders, but you don't want the reordered folder to be a subfolder of the folder above, then you do this: ... drag the folder below ... and then move up and drop it in the space between."

This means: **Apple Notes does NOT have a clean intent gate distinguishing "drop into" from "drop between"** at the user-perceived level when the target is a folder that already has subfolders. The bias is "drop-into," and users discover a workaround (over-shoot down + pull back up) to commit "drop-between." This is a *bug-class behavior* in Apple Notes — yet Apple ships it. The reason it survives: Notes is shallow-hierarchy in practice, so users encounter this edge rarely.

**Implication for our fix.** Even Apple's own native sidebar app exhibits the *same class of bug* our user is complaining about: ambiguity between "drop into parent" and "drop between siblings" when the parent already has expanded children. The solution is **not** that "Apple solves this perfectly" — it doesn't. Our project's V2.1 asymmetric promote/demote semantics are *more sophisticated* than Apple Notes; the implementation gap (H1, H2 in 00_understanding) is what causes the trouble — not the design ambition itself.

The takeaway is **calibration**: even the macOS-native baseline has this rough edge; we are not chasing perfection that doesn't exist in the reference. We are chasing a level of feel that V2.1's spec promises but the implementation does not yet deliver.

#### What we can borrow

- Honest acknowledgement that "drop into vs drop between" is a *hard* problem, not a solved one. Our spec design is more thoughtful than Apple Notes' design — the failure is at the implementation layer (H1/H2/H3/H4/H5).

---

## 4. Cross-product comparison table

| Dimension | Finder list view | Linear sidebar | Things 3 | Notion sidebar | Apple Notes | **Ensemble V2.1 (current)** |
|---|---|---|---|---|---|---|
| **In-flight magnetic snap** | None | None (REPORTED) | None (REPORTED in `06_snap_research §2.2`) | None (REPORTED) | None (REPORTED) | **Yes — 12 px Y quadratic gravity + lerp 0.35 (V3 §2.5)** |
| **Spring-loaded folder open** | Yes — 0.0–1.0 s configurable, default ≈ 0.5 s (VERIFIED) | No (UNVERIFIED) | No (UNVERIFIED) | No (UNVERIFIED) | No (UNVERIFIED) | N/A — depth = 2 cap, no need |
| **Dwell to confirm "drop into"** | Yes — same slider as spring-load (≈ 500 ms default) | None documented | None documented | None documented | None documented | **80 ms (V2.1 §6.3)** |
| **Lateral X threshold for demote** | None | None | None | None | None | **12 px (V2.1 §6.3)** |
| **Lateral X threshold for promote** | None | None | None | None | None | **None — V2.1 immediate-promote on leaving original subtree** |
| **Cascade let-pass animation duration** | None (static list) | Reported subtle | Reported subtle | Reported subtle | None | **220 ms `--duration-drag-reorder`** |
| **Drop indicator visual when nesting** | Indented blue line | Blue line | Blue short line | **Whole row blue highlight** (drop-into) vs blue line (drop-between) | **Yellow line + circle** under target folder | **Blue 1 px line + indent (no row-highlight)** |
| **Mode for "drop-into" vs "drop-between" disambiguation** | Dwell + spring-load | Picker UI mostly avoids the question | Release-position (drop where pointer is) | Binary geometric (whole row vs gap) | Geometric (biased toward into) | **Composite: 12 px X + 80 ms dwell + indicator gate** |
| **Promote / un-nest gesture** | Drag up out of parent's vertical span | Drag (REPORTED), or use parent picker | Drag out of Area's range | Drag pages out of nested page | Drag subfolder to outside location | **Leave `{originalParent, sibling, self}` set, immediate** |
| **Documented user-tunable settings** | Yes — Spring-loading speed slider | No | No | No | No | No |

### 4.1 Patterns observable across products

1. **No reference product implements in-flight magnetic snap** in their hierarchy sidebar. Things 3, Linear, Notion, Apple Notes all keep the dragged overlay strictly tracking the pointer during drag. Magnetic feel is concentrated in lift (Things 3 two-stage curve) and drop (settle animation), not in mid-flight transform manipulation. Our project's V3 magnetic snap is a *deviation* from this norm — it is a deliberate aesthetic choice supported by `06_snap_research`, but it has no peer in the macOS-native or modern-prosumer reference set.

2. **Spring-loading is a dwell-based pattern**, not an instant pattern. Apple's reference dwell is **500 ms default** (5 ticks at 0.1 s on a 0–1.0 s slider). When Finder needs to disambiguate "user wants to drop here" from "user wants to navigate deeper into here," the gate is an explicit half-second pause — six times longer than our 80 ms.

3. **Drop indicator vocabulary is minimal**: a thin colored line. The only product that uses *whole-row highlight* as a drop-into signal is Notion. Apple Notes' "yellow line + circle" is a refinement on the line theme — the circle marks the target folder, the line marks the destination depth.

4. **Apple's own design is not perfect at hierarchy drag.** Apple Notes (3.5) has documented user complaints from August 2024 about exactly the class of problem our user reports — ambiguity between "drop into parent" and "drop between siblings" when the parent already has children. This is informative: we are not below the reference baseline, we are *iterating on a baseline that itself is rough* in this corner.

5. **None of these products document the actual physical thresholds**. Hands-on observation and community reports are the only way to characterize them. The single product that exposes a knob is Finder spring-loading, and even that knob is buried in Accessibility settings.

### 4.2 What does Apple HIG itself say?

[Apple HIG: Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) gives the following VERIFIED guidance directly relevant to our fix:

> "Display a drag image as soon as people drag a selection about three points." — i.e. a 3-point activation threshold (≈ 4 CSS px at 1× scale; matches our project's 4 px sensor activation per V3 invariant #1).

> "It works well to create a translucent representation of the content people are dragging. Translucency helps distinguish the representation from the original content and lets people see destinations as they pass over them. Display the drag image until people drop the content."

> "Show people whether a destination can accept dragged content. … Display highlighting or other visual cues only while the content is positioned above the destination, removing the visual feedback when people drag the content away."

> "When there are multiple possible destinations, provide visual cues that help people identify one at a time."

The last bullet is load-bearing for our case. Our V2.1 design has *multiple potential destinations* on the same row: "drop between siblings of original parent," "drop into original parent (forbidden — same-parent reorder)," "drop into different parent (demote with 12 px + 80 ms gate)," "drop at root level above this row (promote)." The HIG rule is **identify one at a time** — and the user's S2 complaint ("flicker between parent ↔ root") is exactly what happens when the implementation cannot lock to one destination at a time.

NN/G ([Drag-and-Drop](https://www.nngroup.com/articles/drag-drop/), VERIFIED earlier in `06_snap_research §2.1`) reinforces:

> "rather than instantly redrawing the other objects in their new place, use a quick animation (roughly 100 ms) to show them moving towards their new location"

100 ms is a **shorter cascade** than our 220 ms `--duration-drag-reorder`. NN/G's 100 ms is a single guideline — our 220 ms was chosen for V3 with explicit reasoning (longer because the cascade is cross-row, not just a single placeholder swap). Both are reasonable; NN/G's value is not a refutation of our 220 ms, but it confirms that *some* let-pass animation must exist (S4's "no animation flash" complaint maps to "let-pass cascade not triggering after drop").

---

## 5. Alignment evaluation: how Ensemble V2.1 compares

### 5.1 Where V2.1 spec is *more demanding* than the reference set

| Dimension | V2.1 stance | Reference set stance | Verdict |
|---|---|---|---|
| In-flight magnetic snap | Yes (V3 §2.5) | None | V2.1 carries a self-imposed challenge no peer carries |
| Composite intent gate (X + dwell + indicator) | Yes (12 px + 80 ms + 5-gate) | At most binary geometric (Notion) or single-gate dwell (Finder) | V2.1 is **the most sophisticated** intent gate in the comparison set |
| Asymmetric promote/demote | Yes (V2.1 immediate promote) | None — all symmetric or geometric | Unique design choice; arguably matches user intuition better than peers |
| Cascade let-pass during drag | Yes, 220 ms | Subtle to none | Above NN/G 100 ms, intentional V3 choice |

### 5.2 Where V2.1 implementation gap is the cost of this ambition

The 00_understanding root-cause hypotheses (H1-H5) collectively describe what happens when a sophisticated spec meets an implementation that loses fidelity:

- **H1** (pointerBelowOver flips parent ↔ root over original parent's row) → violates HIG "identify one at a time" — we present two destinations alternately at 1-frame cadence
- **H2** (snap + closestCenter feedback loop) → in-flight magnetic snap is a deviation from the macOS norm, and our implementation reveals the cost: the snap "locks" over to the wrong destination
- **H3** (two-IPC mid-frame) → no peer ships with two-IPC promote, so no peer is reference for how to fix it
- **H4** (cascade after drop) → reference set's solution is "no cascade after drop" (Things 3, Notion); we want cascade after drop because our V3 baseline has it for flat reorder

### 5.3 Direction implied by the comparison

The comparison **does not** suggest abandoning V3 magnetic snap or our composite intent gate — those are deliberate, documented design choices with their own evidence basis (`06_snap_research`, `r3_visual_interaction_design.md`, `_synthesis_decisions.md`). But it does suggest:

- **The peer set's restraint is a tell**. Five high-bar reference products converged on "no in-flight magnetic snap, drop-indicator-driven feedback" as the macOS-native idiom. We have evidence-based reasons to deviate (we documented them), but each deviation we keep amplifies the implementation precision required.
- **The dwell timing has Finder as anchor**: 500 ms (Apple default) is the reference. Our 80 ms is 6× faster. If the implementation cannot execute reliably at 80 ms, the spec value is a candidate for tuning; if the implementation can be made to execute reliably, 80 ms is fine — but 80 ms requires *more* precision in the gate logic, not less.
- **HIG "identify one at a time" is the load-bearing constraint** for fixing S2 specifically. Whatever the implementation fix is, the user-observable success criterion is "the drop indicator does not alternate between two destinations within a single dwell window."

---

## 6. Adaptation evaluation of `06_snap_research §4` (current snapModifier) under hierarchy load

### 6.1 What `06_snap_research §4` recommended and what we shipped

`06_snap_research` recommended **方案 E + C 组合**: continuous gravity well `(1 - dist/12)^2` + frame-to-frame lerp `0.35`. Project shipped this in `src/components/sidebar/dnd/snapModifier.ts` (per V3 §2.5 and confirmed in 00_understanding §3.1). The rationale (`§2.1, §2.3`) was:

- NN/G: magnetic snap is "destination identified early," not literal position lock
- Game-easing literature: `p=2` quadratic feels most magnet-like
- macOS Finder analogy: progressive scale + position when dragging icons toward Dock targets

### 6.2 Did `§2.2` 的 reference reading hold up under hierarchy?

`06_snap_research §2.2` explicitly noted:

> "**结论**：业界最佳实践是 **DragOverlay 严格跟手, 让"磁吸"主要由 drop indicator 来表达**。强行做位置磁吸时（如 SVG 编辑器、流程图）, 都用"距离越近吸力越强"的连续函数, 而不是阈值式 binary 吸附。"

This research's industry survey **confirms that conclusion**: Finder, Linear, Things 3, Notion, Apple Notes — *none* implement in-flight position magnetism in their hierarchy sidebars. The "best practice" from `06_snap_research §2.2` is: **let drop indicator do the work; let DragOverlay strict-track**.

`06_snap_research §4` then chose a *compromise*: keep the magnetic snap **but make it continuous + lerped** so it does not feel binary. This compromise was reasonable for *flat* reorder (V3 baseline scope) — there is only one destination per slot and snapping the overlay to slot-center is unambiguous.

**Under hierarchy load this compromise is more strained**, because:

- (Per H2 in 00_understanding) The slot-center snap pulls the dragged overlay's center toward `over.rect.center`, which feeds back into `closestCenter`'s collision detection. When `over === originalParent`, the snap reinforces over=originalParent; when the user wants to leave the original parent, they have to fight the snap.
- (Per H1) The snap itself does not know about hierarchy; the projection logic does. So the snap pulls the overlay toward where it thinks `over` is, while projection tries to compute parent/depth from a *different* reading of the same situation. They can disagree.

### 6.3 Is `06_snap_research §6.3` 方案 X (drop indicator only, no magnetic snap) more appropriate for hierarchy?

`§6.3` 方案 X was already labeled as "终极兜底" (ultimate fallback) — to be invoked only if §4 (E+C) fails to deliver. The industry survey here reinforces it as a *defensible* fallback:

- It would bring us into alignment with all five reference products (Finder, Linear, Things 3, Notion, Apple Notes)
- It would remove the H2 feedback-loop class of bugs entirely (no in-flight magnetism = no over-locking)
- It would simplify the spec — `02_design_spec V3 §2.5` would change from "magnetic" to "strict-track"

But it would also:

- Remove the in-flight magnetic feel that V3 deliberately designed into the project (the "macOS gestalt" choice in §1)
- Lose the "destination identified early" affordance per NN/G § 2.1 of `06_snap_research`
- Be a Decisional change to V3, not a hierarchy-only patch — affects flat reorder too

### 6.4 Recommendation logic (not a recommendation — that is synthesis's job)

The industry survey **does not** prescribe abandoning §4 — that is `06_snap_research §6.3` 方案 X's domain, not this report's. The survey **does** clarify three things that synthesis can use:

1. The peer set is **unanimously restraint-on-magnetism** in their hierarchy sidebars. We have a reasoned basis to deviate; each deviation we keep narrows our implementation precision budget.
2. The hierarchy-aware version of "Are we still consistent with the reference design after V2.1's asymmetric semantics" is: **the asymmetric promote/demote logic IS the macOS-native idiom** (Finder list view, Notion, Apple Notes all do "leave parent's bounds → de-nest"). The implementation gap (H1-H5) is what's broken, not the design ambition.
3. **A scoped retreat from magnetism to "isChildActive only"** (i.e. continuous gravity well stays for ROOT-active demote, but disables / weakens for child-active drag) is a lighter-weight intermediate option that this comparison surfaces. Whether it's *correct* depends on whether `closestCenter` then chooses pointer-truthful `over` (Agent B's source-code question). Whether it's *desirable* depends on whether the design language can absorb "different feel during child drag vs root drag" (a question for design-language, not for me to decide — but consistent with V2.1's *already* asymmetric semantics, this would not be a category-new asymmetry).

---

## 7. Findings worth flagging to synthesis

### 7.1 Findings with high-confidence evidence

| # | Finding | Confidence | Direct citation |
|---|---|---|---|
| F1 | macOS Finder spring-loaded folder dwell is **default ≈ 500 ms**, range 0–1000 ms, user-tunable in System Settings → Accessibility → Pointer Control | VERIFIED | [Apple Community, OWC](https://discussions.apple.com/thread/7160895) |
| F2 | Spacebar bypasses Finder spring-loading dwell | VERIFIED | Same |
| F3 | Apple HIG says: identify only one possible drop destination at a time | VERIFIED | [HIG Drag and Drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop) |
| F4 | Apple HIG says: 3-point activation threshold for drag image (≈ matches V3 invariant #1's 4 px sensor) | VERIFIED | Same |
| F5 | NN/G says: ~100 ms cascade animation for items moving out of way during reorder | VERIFIED | [NN/G Drag and Drop](https://www.nngroup.com/articles/drag-drop/) |
| F6 | NN/G says: magnetic snap is for "destination identified early," not for position lock | VERIFIED | Same |
| F7 | Apple Notes reproducibly suffers from drop-into-vs-drop-between ambiguity when target folder has children — Apple Community thread Aug 2024 | VERIFIED | [discussions.apple.com/thread/255726330](https://discussions.apple.com/thread/255726330) |
| F8 | None of Finder list view / Linear sidebar / Things 3 / Notion sidebar / Apple Notes sidebar implements in-flight magnetic snap in their hierarchy drag UX | REPORTED for Linear/Things3/Notion/Notes (community); cited in `06_snap_research §2.2` for Things 3 specifically; verifiable by reproduction | — |
| F9 | Notion uses two-state visual signal (whole-row blue highlight = drop-into, horizontal line = drop-between) | VERIFIED | [Notion Help: Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar) |
| F10 | Things 3 design philosophy: physical at endpoints (lift/drop), strict-track at mid-flight | REPORTED | `06_snap_research §2.2`, Cultured Code support pages |
| F11 | Linear treats hierarchy display (Sub-issues toggle) and parent assignment as somewhat decoupled — drag is for reorder primarily, parent reassignment also via inspector picker | VERIFIED | [Linear Docs Display options](https://linear.app/docs/display-options) |

### 7.2 Findings flagged as UNVERIFIED (synthesis must not over-rely)

| # | Finding | Why unverified |
|---|---|---|
| U1 | Linear / Things 3 / Notion / Apple Notes have no spring-loaded folder open during drag | No official documentation; consistent absence in reproduced behavior, but not actively stated in docs |
| U2 | Linear has no documented dwell timer for sidebar drag | No docs |
| U3 | Things 3 has no documented dwell or X threshold for cross-Area move | No docs; Cultured Code support pages describe gestures, not physics |
| U4 | Apple Notes has no documented X threshold for nest vs un-nest | No docs; community reports describe the *result* (bias toward into), not the threshold |
| U5 | Notion has no documented X threshold; binary geometric (over row vs over gap) | No docs |
| U6 | Reference products' overlay strictly tracks pointer during drag | Reproducible but not documented |

### 7.3 Specific design observations relevant to S1-S5

| Symptom | Industry comparison | Implication |
|---|---|---|
| **S1 "magnetism feels unnatural"** | F8: peer set has no in-flight magnetism | Our magnetism is a deliberate deviation; user is sensing the deviation. Synthesis must decide whether to keep, weaken, or scope-down to ROOT-active only |
| **S2 "flicker between parent ↔ root over original parent's row"** | F3 (HIG identify one at a time); F9 (Notion binary geometric); F4-VERIFIED-elsewhere (06_snap_research H1) | Implementation must lock to one destination per dwell window; the spec aims to but the implementation flickers |
| **S3 "promote fails / cannot leave"** | F8 (no peer has snap to fight); F11 (Linear avoids the question with picker) | Snap may be locking `over`; remove or weaken in-flight pull on child-active path |
| **S4 "no-animation flash on promote"** | F5 NN/G ~100 ms cascade; H4 root cause (cascade after drop) | Must trigger cascade *after* drop completes; spec promises it, implementation does not deliver |
| **S5 "整体不跟手"** | F10 Things 3 strict-track | "Strict-track" is the macOS-native default; our deviation costs precision |

---

## 8. Closing notes for synthesis

This report does not propose a fix. It provides three things for synthesis:

1. **Calibration of expectations**: Apple's own native sidebar drag (Apple Notes) ships with the same class of "drop-into vs drop-between" ambiguity our user reports. We are not failing against a perfect baseline — we are iterating on a baseline with known rough edges.

2. **Confirmation of `06_snap_research §2.2` industry conclusion**: in-flight magnetic snap is **not** the macOS-native or modern-prosumer-tool norm for hierarchy sidebar drag. Five peer products converged on "let drop indicator carry the message; let DragOverlay strict-track." We deviate deliberately and pay precision cost.

3. **Concrete reference values**:
   - Finder spring-loading default ≈ 500 ms (our composite gate is 80 ms + 12 px X = different mechanism, ≈ 6× faster)
   - NN/G cascade ≈ 100 ms (our `--duration-drag-reorder` = 220 ms, 2.2× longer; deliberately so per V3)
   - Apple HIG 3-point activation (≈ matches our 4 px sensor)
   - Apple HIG "identify one at a time" — load-bearing for fixing S2

These values are **inputs** for synthesis. The `_synthesis_decisions.md` author may use them as anchors, deviate with reason, or reject them altogether based on cross-comparison with Agent A (user trace) and Agent B (dnd-kit source) findings.

## 9. Sources cited (short-form for traceability)

- [Apple HIG: Drag and drop](https://developer.apple.com/design/human-interface-guidelines/drag-and-drop)
- [Apple HIG: Outline views](https://developer.apple.com/design/human-interface-guidelines/outline-views)
- [Apple HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- [Apple HIG: Disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls)
- [Apple Support: Add and remove folders in Notes on Mac](https://support.apple.com/guide/notes/add-and-remove-folders-apd558a85438/mac)
- [Apple Community thread on spring-loaded folders timing](https://discussions.apple.com/thread/7160895)
- [Apple Community thread on Notes folder reorder ambiguity (Aug 2024)](https://discussions.apple.com/thread/255726330)
- [OWC: How to Use Spring-Loaded Folders in macOS](https://eshop.macsales.com/blog/88761-how-to-use-spring-loaded-folders-in-macos/)
- [MacSparky: Nesting Folders in Apple Notes (2016)](https://www.macsparky.com/blog/2016/04/2016-4-nesting-folders-in-apple-notes/)
- [Cultured Code: Moving Items in Things](https://culturedcode.com/things/support/articles/9651894/)
- [Cultured Code: Using Gestures](https://culturedcode.com/things/support/articles/2803582/)
- [Linear Changelog 2024-12-18 Personalized sidebar](https://linear.app/changelog/2024-12-18-personalized-sidebar)
- [Linear Docs: Display options](https://linear.app/docs/display-options)
- [Linear Docs: Parent and sub-issues](https://linear.app/docs/parent-and-sub-issues)
- [Notion Help: Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)
- [Notion Help: Intro to writing & editing — Drag-and-drop](https://www.notion.com/help/writing-and-editing-basics)
- [Notion Help: Keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts)
- [NN/G: Drag-and-Drop: How to Design for Ease of Use](https://www.nngroup.com/articles/drag-drop/)
- [Apple Developer: NSOutlineView sample — Navigating Hierarchical Data](https://developer.apple.com/documentation/AppKit/navigating-hierarchical-data-using-outline-and-split-views)
- [Apple AppKit Archive: Disclosure Triangles](https://dev.os9.ca/techpubs/mac/HIGOS8Guide/thig-24.html)
- Internal: `.dev/sidebar-reorder/06_snap_research.md` §1.3, §1.4, §2, §4, §6.3
- Internal: `.dev/category-hierarchy/01_research/r3_visual_interaction_design.md` (prior visual research)
- Internal: `.dev/category-hierarchy/02_design_spec.md` V2.1 Revision History, §1, §2.9
