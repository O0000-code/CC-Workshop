# Design Language

This Rule defines Ensemble's visual and motion design language. Any code, spec, or document that affects what the user sees or how things move MUST conform. The standard is Apple / Linear / Things 3 — macOS-native restraint with physical-grade motion. "Looks fine" is not the bar.

## When this applies

- Editing or creating visual code: `src/components/**`, `src/index.css`, `src/pages/**`, anything emitting JSX/Tailwind/CSS
- Writing visual or motion specs (`.dev/**/02_design_spec.md`, etc.)
- Adding new tokens (color, easing, duration, radius, shadow, spacing)
- Designing new components, animations, or interaction patterns
- Reviewing PRs touching any of the above

If a session edits visual code without consulting this Rule, the result is a violation regardless of how it looks.

## Philosophy

1. **Minimalism — "如无必要勿增实体".** Every pixel, line, border, and transition must answer "can this be deleted?". Default is delete; addition requires justification. The sidebar's `cursor: default` on hover (not `grab`) is the pattern: refuse decorative affordance because the system-level mental model already implies it.

2. **Restraint — define by what we refuse.** No rotation on lift. No stagger on reorder. No overshoot bounce on settle. No long-press activation. No decorative emoji. No grab-cursor hover. No spring overshoot precision claims that don't reproduce. These refusals are the language; tasteful motion is what's left after subtracting them.

3. **Crafted — every spec has a reason.** No magic numbers. Curves, durations, radii, and shadows come from named tokens; tokens come from external references (macOS HIG, NSColor, easing literature). DragOverlay uses three layered hsl shadows because single-layer is a "cheap lift". Spring vs cubic-bezier is decided by reproduction, not by feel.

4. **Physical — continuous force, not discrete jumps.** Magnetic snap is a continuous gravity well `(1 - dist/12)²`, not a binary threshold. Settle duration is distance-aware (`120 + Δ × 0.5`, capped 280 ms), not fixed. Lift is two-stage (吸盘 80 ms → 拉离 120 ms) to model "stick to finger, then peel up". Per-frame lerp keeps motion causally continuous with input.

5. **macOS-native — anchor everything to the system.** Accent color is `#0063E1` (light) / `#0A84FF` (dark) — NSColor.controlAccentColor, not "a nice blue". Activation distance 4 px aligns with `kRecognizesDragMovement`. Traffic-light area gets a 52-px placeholder that draws nothing. Window drag uses `getCurrentWindow().startDragging()`. Font fallback chain ends in `-apple-system, BlinkMacSystemFont`. When a behavior has a macOS-native counterpart, mirror it.

## Principles

- **Animation tokens are mandatory.** Every transition's duration and easing MUST reference `--ease-drag*` / `--duration-drag-*` (or the inline allow-list in §Constraints). Self-invented cubic-beziers and stray `200ms` literals are forbidden.
  - Forbidden: `style={{ transition: 'transform 320ms cubic-bezier(0.7, 0, 0.3, 1)' }}`
  - Required: `transition: transform var(--duration-drag-reorder) var(--ease-drag)`

- **Color tokens are mandatory.** Every color MUST be a CSS variable or a value from the documented zinc palette / accent / status set. Self-invented grays are forbidden.
  - Forbidden: `text-[#3B4252]`, `bg-[#374151]`, `border-[#9CA3AF]`
  - Required: zinc-only — `#18181B / #3F3F46 / #52525B / #71717A / #A1A1AA / #D4D4D8 / #E4E4E7 / #E5E5E5 / #F4F4F5 / #FAFAFA`, plus `var(--color-accent)` and the documented status colors

- **No stagger.** Reorder let-pass MUST be synchronous. `transitionDelay` based on index, `staggerChildren`, or any temporal sequence across siblings is forbidden — synchronous let-pass reads as crisper for tool-grade UI.

- **No settle / snap-back overshoot.** Settle, drop, cancel, and indicator move MUST be monotonic to target. Overshoot curves like `(0.34, 1.32, 0.64, 1)` are allowed ONLY in micro-effects ≤ 80 ms where the overshoot is sub-pixel and unobservable. Spring step-responses claiming a numerical match to ease-out cubic-beziers are forbidden (the curve families differ at t=0; see `validate-numerical-equivalence-claims.md`).

- **4 px distance activation, never long-press.** Drag sensors MUST use `activationConstraint: { distance: 4 }`. Time-based activation (`delay: 500`) is touch-paradigm and forbidden on macOS.

- **Suppress `cursor: grab` on hover.** Sortable items MUST keep `cursor: default` on hover and switch to `grabbing` only on `:active`. macOS Finder / Notes do not advertise drag affordance via cursor; we mirror that. dnd-kit's hover grab is overridden in `src/index.css:622-628`.

- **Drag transforms use translate3d only.** Sortable rows MUST use `CSS.Translate.toString(transform)`, never `CSS.Transform.toString` — the latter includes `scaleX/scaleY` and squeezes rows when neighbour heights differ.

- **Multi-layer hsl shadow for any DragOverlay-class lift.** Items lifted off the surface MUST use three layered `hsl(0 0% 0% / α)` stops (near hard, mid soft, far diffuse). Single-layer shadows look "cheap".
  - Forbidden: `box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)` for a lifted card
  - Required: three stops at distinct distance / opacity tiers (see `.drag-overlay-row` / `.drag-overlay-pill`)

- **`prefers-reduced-motion: reduce` MUST be honored.** Any new animation or transition needs a reduced-motion fallback degrading to instant. Existing coverage in `src/index.css:671-680` is sidebar-only; new motion MUST extend coverage to its own selectors.

- **No decorative emoji and no decorative icons.** Functional `lucide-react` icons only. Unicode emoji as ornament is forbidden. Decorative gradients are forbidden except in explicitly-labeled async/AI status feedback (e.g. `classify-success-bloom`).

- **Visual hierarchy ≤ 3 layers.** Page → header + main → list (or list + detail) → row + slide-panel. No four-deep modal-on-modal-on-popover stacks. New "show me yet another floating panel above the floating panel" patterns are forbidden — flatten or replace.

- **Hierarchy is expressed by position, not by decoration.** When a parent-child relationship is shown (sidebar tree rows, dropdown options, any nested list), the child item MUST share font weight, color, dot/swatch size, and dot opacity with its parent. Indent (padding-left, one step per depth — 16 px in the sidebar) is the only visual differentiator. Indent guide lines, dot color fading, child-row font-weight reduction, smaller child rows, or dimmed child borders are forbidden — they overwrite the user's color/typography choices and degrade minimalist coherence.
  - Forbidden: `<div className="border-l border-zinc-200 pl-4">…children…</div>` (indent guide line)
  - Forbidden: `<ColorPickerDot style={{ opacity: 0.7 }} />` for child rows (dot fading)
  - Forbidden: `text-[13px] font-normal` for child rows when parent is `text-[13px] font-medium` (weight downgrade)
  - Required: child row = parent row attributes + `padding-left: depth * 16px` (and chevron only on rows that have children)

## Constraints

**Color tokens** (full table: `src/index.css:30-44`, `:599-619`):
`--color-primary` `--color-secondary` `--color-tertiary` · `--color-bg-primary` `--color-bg-secondary` `--color-bg-tertiary` · `--color-border` `--color-divider` · `--color-success(-bg)` `--color-warning(-bg)` `--color-error(-bg)` · `--color-accent` `--color-accent-soft`. User-defined category colors come from `ColorPicker.PRESET_COLORS` (18 swatches) only.

**Easing tokens** (`src/index.css:602-605`): `--ease-drag` (cascade / settle / indicator move), `--ease-drag-lift` (lift 吸盘 only, ≤ 80 ms), `--ease-drag-cancel` (cancel snap-back).

**Allowed inline easing** (when token doesn't fit): `cubic-bezier(0, 0, 0.2, 1)` (standard ease-out, lift 拉离 段), `cubic-bezier(0.4, 0, 0.2, 1)` (Material standard, list↔detail compact / SlidePanel), `linear` (lift opacity only), `ease-out` keyword (indicator fade in / button transitions). Any other curve requires Rule update.

**Chevron / disclosure rotation**: `transition: transform 120ms var(--ease-drag)` — duration is inline (disclosure rotation is too short for a dedicated token; aligned with other small disclosure controls in this codebase) but easing MUST reuse `--ease-drag`. No new disclosure-specific easing token; reusing the same curve as cascade and settle is the consistency guarantee. Forbidden: `transition: transform 120ms ease-in-out` or any self-invented cubic-bezier on a chevron.

**Duration tokens** (`src/index.css:606-613`): `--duration-drag-lift-grip` 80 ms · `--duration-drag-lift-pull` 120 ms · `--duration-drag-reorder` 220 ms · `--duration-drag-settle` 220 ms (default; actual is distance-aware) · `--duration-drag-cancel` 280 ms · `--duration-drag-snap` 80 ms · `--duration-drag-indicator-fade` 100 ms · `--duration-drag-indicator-move` 150 ms.

**Distance-aware settle formula** (V3 §2.6): `duration = (distance < 4) ? 0 : Math.min(280, 120 + distance * 0.5)`.

**Radius gradient** (`src/index.css:46-52`): `--radius-sm` 3 · `--radius-base` 4 · `--radius-md` 6 · `--radius-lg` 8 · `--radius-xl` 10 · `--radius-2xl` 11 · `--radius-3xl` 16. Self-invented 5/7/9/12/14 px corners are forbidden.

**Shadow tiers**: `--shadow-dropdown` (popovers, tooltips, context menus); `--shadow-card` (cards, list-internal dropdowns); three-layer hsl (DragOverlay only — see `.drag-overlay-row` / `.drag-overlay-pill` in `src/index.css:631-647`); modal-only `0 25px 50px rgba(0,0,0,0.1)`. New shadow values require Rule update.

**Spacing scale** (Tailwind gap-*): `0.5` (2 px) sidebar nav · `1` (4) dot↔badge · `1.5` (6) tag wrap · `2` (8) icon↔text · `2.5` (10) row internal · `3` (12) section internal · `3.5` (14) list-card icon↔info · `4` (16) section-between · `5` `6` `7` `8`.

**Font sizes**: 10 (uppercase section header / active badge) · 11 (count / tag pill / stats / tooltip body) · 12 (description / path / placeholder) · 13 (body / sidebar row / input — most common) · 14 (list-card name / section title / button label) · 16 (page title / detail title) · 18 (modal title). Self-invented 15/17 px are forbidden.

**Font weights**: 400 (body) · 500 (label / row name default) · 600 (section title / selected row name / page / modal title).

**Hover/active**: hover bg `#FAFAFA` · active/selected bg `#F4F4F5` · focus ring `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]` · pressed (rare) `active:scale-95` · drag-period sibling fade `opacity-40 pointer-events-none`.

## Anti-patterns

Each item below is a concrete forbidden action observed or actively guarded against in this codebase.

- **`transform: scale(...)` for reorder let-pass.** Use `translate3d` only. Scale-based let-pass squeezes rows when neighbours measure differently. (See `SortableCategoryRow.tsx:60-62` for the explicit ban.)
- **Stagger via index-based delay.** `transitionDelay: ${i * 30}ms` or framer-motion `staggerChildren` is forbidden. Synchronous let-pass is the language.
- **Spring with explicit overshoot expectations.** `{ stiffness: 300, damping: 12 }` for settle / drop / cancel is forbidden. Use the documented cubic-beziers; if you genuinely need a spring, prove it reproduces and update this Rule.
- **`cursor: grab` on hover** for any sortable item — macOS doesn't switch the cursor on hover. Suppressed in `src/index.css:622-628`.
- **`delay: 500ms` long-press** to begin drag — touch-paradigm; macOS uses spatial 4 px.
- **DragOverlay rotation, scale-up, or decorative meta.** No `rotate(2deg)` on lift. No showing `count` / secondary badges in the overlay (see `DragOverlayCategoryRow.tsx` — `showCount={false}` is mandatory).
- **Single-layer cheap shadows on lifted items.** `0 8px 16px rgba(0,0,0,0.1)` is forbidden for DragOverlay-class lifts.
- **Decorative emoji or gradients as ornament.** Only the explicitly-named AI/async feedback animations may use multi-color motion.
- **Numerical equivalence claims between curve families without reproduction** (see `validate-numerical-equivalence-claims.md`). "Spring `{500, 40}` ≈ `cubic-bezier(0.16, 1, 0.3, 1)`" is forbidden unless reproduced and bounded.
- **Self-invented hex colors, radii, durations, or curves.** Anything outside the documented sets above is forbidden — extend the Rule first, then use it.
- **Comments asserting library default behavior without source link** — see `verify-third-party-behavior-firsthand.md`. "DragOverlay provides intrinsic transition" is forbidden unless followed by `node_modules/@dnd-kit/core/...:line` proving it.
- **Inline indent guide lines or vertical hairlines for parent/child structure.** `border-left: 1px solid var(--color-divider)` (or any `border-l-*` Tailwind class) wrapping a child group is forbidden. Hierarchy is expressed by `padding-left: depth * 16px` only; a guide line adds a decorative entity that violates "如无必要勿增实体" and competes with the user's category color swatch as a visual anchor on the left edge.
- **Color-faded child swatches or text** (`opacity < 1` on a child's `ColorPicker` dot, lighter text color, lower font weight) **as a hierarchy signal.** The child shares the parent's visual weight; only `padding-left` distinguishes them. A faded child dot also overwrites the user's chosen category color, which is forbidden by the color-token Principle.
- **Chevrons rendered with non-token easing or self-invented curves.** `transition: transform 120ms ease-in-out` is forbidden — chevron rotation easing MUST be `var(--ease-drag)` (see Constraints / Chevron / disclosure rotation).
- **Chevron spoofed with `<div role="button">`.** Disclosure controls MUST be a real `<button>` element (keyboard reachability + screen reader semantics). Faux-button divs break Tab order and `aria-expanded` reporting.

## Required reading for visual / motion work

- `src/index.css` — canonical token source. All CSS variables live here.
- `.dev/sidebar-reorder/02_design_spec.md` V3 — the highest-resolution living example of this design language. Read in full when designing any motion or drag interaction.
- `.dev/sidebar-reorder/06_snap_research.md` — derivation of the magnetic-snap physics, when designing similar continuous-force interactions.
- `.claude/rules/validate-numerical-equivalence-claims.md` — any "X is equivalent to Y" between curves / springs / animations MUST reproduce or be retracted to qualitative wording.
- `.claude/rules/verify-third-party-behavior-firsthand.md` — any "the library handles this" claim MUST link to `node_modules/...` source or `.d.ts`.

## Conflict resolution

- This Rule is **Decisional** for the design language layer (philosophy, hard constraints, token discipline).
- `.dev/<task>/02_design_spec.md` (current version) is **Decisional** for task-level specifics (exact px / ms / sequencing).
- When task spec and this Rule conflict, prefer compatibility; if incompatible, the task spec MUST cite this Rule and document the deviation explicitly. Silent deviation is a violation.
- When this Rule is silent, fall back in order: (1) `02_design_spec.md` V3 of `sidebar-reorder` as the most-evolved reference, (2) macOS Finder / Notes / Things 3 native behavior, (3) Apple HIG. Never "what feels right".

## Why this Rule exists

This project's bar is Apple / Linear / Things 3, not "AI-default acceptable". The user has had to repeatedly re-state "极简 / 克制 / 考究 / 物理级 / macOS 原生" across sessions because design intent does not survive context boundaries when undocumented. Without this Rule, every new component drifts toward generic Material defaults; every new animation reaches for inline magic numbers; every new color reaches for "a nice gray". Each drift is small; the accumulated drift destroys the design.

The role of this Rule is not to teach taste — taste lives in `02_design_spec.md` V3 and the codebase. The role is to make non-conformance loud: a session that adds a self-invented `cubic-bezier(0.7, 0, 0.3, 1)`, a 7-px corner, or a stagger `transitionDelay` is now provably violating a documented constraint, not a vibe.
