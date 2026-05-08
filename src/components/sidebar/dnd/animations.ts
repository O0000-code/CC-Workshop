import type { DropAnimation } from '@dnd-kit/core';
import { defaultDropAnimationSideEffects } from '@dnd-kit/core';

/**
 * Distance (in CSS pixels) within which the dragged item snaps to the
 * nearest droppable's center. See `02_design_spec.md` V3 §2.5 and
 * `snapModifier.ts`.
 */
export const SNAP_DISTANCE_PX = 12;

/**
 * V2.3 D10 (2026-05-09, src=02 V2.3 §2.6 / r4 §2.1-2.2 /
 * _synthesis_decisions D10):
 *
 * Drop-animation duration is distance-aware so a 4-px tweak releases in
 * 100 ms while a 200-px sling releases in 180 ms. The previous V3 formula
 * `min(280, 120 + dist × 0.5)` produced up to 280 ms with `cubic-bezier(0.16, 1, 0.3, 1)`
 * — that curve completes 95 % of progress in the first 42.6 % of the
 * timeline and spends the last 38 % covering 1 % (r4 §2.1). Users perceive
 * this tail as "悬浮 0.5 秒". V2.3 D10 caps the duration at 220 ms and
 * uses `cubic-bezier(0, 0, 0.2, 1)` std ease-out (last 5 % covers 29 % of
 * the timeline, vs the prior 57 % — r4 §2.2 table).
 */
export const DROP_DURATION_BASE_MS = 100;
export const DROP_DURATION_PER_PX_MS = 0.4;
export const DROP_DURATION_MAX_MS = 220;
export const DROP_EASING = 'cubic-bezier(0, 0, 0.2, 1)';

export function computeDropAnimationDuration(distance: number): number {
  return Math.min(DROP_DURATION_MAX_MS, DROP_DURATION_BASE_MS + distance * DROP_DURATION_PER_PX_MS);
}

/**
 * V2.3 D11 (2026-05-09, src=02 V2.3 §2.10 / r4 §1.4 §4.2 B3 /
 * _synthesis_decisions D11):
 *
 * sideEffects adds the `is-dropping` className to `dragOverlay.node` at
 * dropAnimation start (verified `core.esm.js:3700-3708` writes to
 * `setProperty/className` synchronously before the WAAPI `node.animate`
 * call). The className triggers the CSS `.drag-overlay-row.is-dropping`
 * rule in `src/index.css`, which transitions `opacity` + `box-shadow` to
 * 0 / none over 120 ms ease-out — by the time `setClonedChildren(null)`
 * runs (`core.esm.js:3582`), the overlay is already a transparent shell,
 * so the unmount frame is no longer the abrupt "shadow vanishes" moment
 * users reported (r4 §1.10).
 *
 * `styles.active.opacity = '0'` keeps the inline source row hidden during
 * the drop window (matches the default behavior; we replicate explicitly
 * because we override the `sideEffects` field).
 */
export const CATEGORY_DROP_SIDE_EFFECTS = defaultDropAnimationSideEffects({
  className: { dragOverlay: 'is-dropping' },
  styles: { active: { opacity: '0' } },
});

/**
 * Base drop animation for category rows.
 *
 * V2.3 D10/D11: duration capped at 220 ms, std ease-out curve, sideEffects
 * carries the `is-dropping` className so the overlay fades shadow+opacity
 * during the drop. Lists override this per-drop with a distance-aware
 * `duration` (see `SortableCategoriesList.tsx:handleDragEnd` +
 * `computeDropAnimationDuration` above).
 */
export const CATEGORY_DROP_ANIMATION: DropAnimation = {
  duration: DROP_DURATION_MAX_MS,
  easing: DROP_EASING,
  sideEffects: CATEGORY_DROP_SIDE_EFFECTS,
};

/**
 * Tag drop animation. Identical to category — kept as separate symbol so
 * future spec drift can change them independently without touching call sites.
 */
export const TAG_DROP_ANIMATION: DropAnimation = CATEGORY_DROP_ANIMATION;
