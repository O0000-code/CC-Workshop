import type { Modifier } from '@dnd-kit/core';
import { SNAP_DISTANCE_PX } from './animations';

/**
 * Magnetic snap with continuous gravity well + frame-to-frame lerp smoothing.
 *
 * Why a factory:
 *   The dnd-kit `Modifier` signature is a pure function with no setState/dispatch.
 *   But the modifier function itself is JS — its closure can hold state across
 *   frames. We use this to (1) detect drag-id changes (reset state on new drag),
 *   (2) lerp the snap offset across frames so a single mousemove tick doesn't
 *   warp the overlay by 12px in one frame (the visible "thunk" the V2 binary-
 *   threshold version produced).
 *
 * Why continuous gravity (no threshold):
 *   The previous binary "dist <= 12 → fully snap" caused three visible jolts:
 *   entering the threshold (12px instant warp), staying inside (overlay pinned
 *   to slot center, mouse decoupled), exiting (12px instant warp back).
 *   `g(dist) = max(0, 1 - dist/range)^EXPONENT` is C^0 continuous, smooth, and
 *   matches the macOS Finder / generic "magnetic field" mental model where the
 *   pull strengthens with proximity. Quadratic (p=2) is the standard choice in
 *   game easing for "magnet-like" feel.
 *
 * Frame stability:
 *   The lerp factor smooths jitter from sub-pixel cursor movement and ensures a
 *   single large mousemove (e.g. fast cursor) doesn't translate into a sudden
 *   visible jump. With LERP_FACTOR=0.35 the overlay reaches >95% of its target
 *   snap offset within ~7 frames (~120ms @ 60fps) — fast enough to feel
 *   responsive, slow enough to avoid frame-level pops.
 *
 * V2.2 D5 (2026-05-08, src=02 V2.2 §2.9 / r2 §5.2 / r3 §6.2 /
 * _synthesis_decisions D5):
 *   The `strengthRef` parameter lets the host tune snap strength per-drag.
 *   `strengthRef.current = 1.0` is V3 baseline behavior (default for ROOT
 *   active drags). When the host drags a CHILD row (V2.1 promote / same-parent
 *   reorder context), it sets `strengthRef.current = 0.3` in onDragStart,
 *   weakening the in-flight pull so the snap doesn't lock the active rect to
 *   the originalParent's slot center. The pulled rect feeds collisionRect
 *   (`core.esm.js:2984`) which feeds closestCenter, so a strong in-flight snap
 *   creates a feedback loop that locks `over` to originalParent — preventing
 *   V2.1's immediate-promote from triggering when the user drags upward
 *   (S3 root cause; r1 §1.2). 0.3 is a calibration default; dev-mode tuning
 *   per acceptance A2 may adjust it.
 *
 *   Reference set (Finder / Linear / Things 3 / Notion / Apple Notes — r3 §4.1)
 *   uses **no** in-flight magnetic snap in their hierarchy sidebars. Setting
 *   strength to 0 for child active would align fully with the reference set;
 *   0.3 keeps a faint pull at the lift/drop endpoints to preserve V3's macOS
 *   gestalt — the trade-off documented in 02 V2.2 §2.9.
 *
 * @see `.dev/sidebar-reorder/06_snap_research.md` for derivation, alternative
 *      approaches, and tuning guidance.
 */

/**
 * V2.2 D5 — Module-level mutable ref consumed by the singleton modifier.
 * The host (SortableCategoriesList.tsx) writes to `current` in onDragStart /
 * onDragEnd / onDragCancel. `1.0` is V3 baseline; `0.3` is the child-active
 * weakening. Other values are reserved for future tuning.
 */
export interface SnapStrengthRef {
  current: number;
}

export const snapStrengthRef: SnapStrengthRef = { current: 1.0 };

/** Reset to V3 baseline. Called from onDragEnd / onDragCancel. */
export function resetSnapStrength(): void {
  snapStrengthRef.current = 1.0;
}

// Tuning constants. Adjust SNAP_DISTANCE_PX in animations.ts only — keep
// EXPONENT/LERP_FACTOR proportional. See 06_snap_research.md §5.
const SNAP_RANGE_PX = SNAP_DISTANCE_PX;
const EXPONENT = 2; // gravity falloff (1 = linear, 2 = quadratic, 3 = cubic)
const LERP_FACTOR = 0.35; // 0..1; how much of the target snap to apply per frame
const RESET_THRESHOLD_PX = 0.5; // if no over and |snap| < this, reset to 0

interface SnapState {
  dx: number;
  dy: number;
  activeId: string | number | null;
}

function createMagneticSnapModifier(): Modifier {
  const state: SnapState = { dx: 0, dy: 0, activeId: null };

  return (args) => {
    const { transform, draggingNodeRect, over, active } = args;

    // Reset state when a new drag starts (different active id).
    const currentActiveId = active?.id ?? null;
    if (currentActiveId !== state.activeId) {
      state.dx = 0;
      state.dy = 0;
      state.activeId = currentActiveId;
    }

    // No drag, no rect, or no slot under cursor → decay state to 0 smoothly so
    // the overlay doesn't stick at a stale snap offset when leaving slots.
    if (!draggingNodeRect || !over || !over.rect) {
      if (Math.abs(state.dx) < RESET_THRESHOLD_PX && Math.abs(state.dy) < RESET_THRESHOLD_PX) {
        state.dx = 0;
        state.dy = 0;
        return transform;
      }
      state.dx *= 1 - LERP_FACTOR;
      state.dy *= 1 - LERP_FACTOR;
      return {
        ...transform,
        x: transform.x + state.dx,
        y: transform.y + state.dy,
      };
    }

    const overRect = over.rect;

    // Dragged element's "intended" center — what the cursor really wants
    // before our snap offset is applied. We subtract the previously applied
    // snap (state.dx/dy) so the gravity calculation is relative to the
    // unsnapped pointer position, not the position we've already pulled it to.
    const draggedCenterX =
      draggingNodeRect.left + draggingNodeRect.width / 2 + transform.x - state.dx;
    const draggedCenterY =
      draggingNodeRect.top + draggingNodeRect.height / 2 + transform.y - state.dy;

    const slotCenterX = overRect.left + overRect.width / 2;
    const slotCenterY = overRect.top + overRect.height / 2;

    const dx = slotCenterX - draggedCenterX;
    const dy = slotCenterY - draggedCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Continuous gravity well: 1 at dist=0, 0 at dist≥SNAP_RANGE_PX.
    // Smooth in between — no binary entry/exit pop.
    // V2.2 D5: scaled by `snapStrengthRef.current` (host-tunable per drag).
    let strength = 0;
    if (dist < SNAP_RANGE_PX) {
      const t = 1 - dist / SNAP_RANGE_PX; // 0..1, 1 at center
      strength = Math.pow(t, EXPONENT) * snapStrengthRef.current;
    }

    // Target snap offset this frame (ideally apply this much).
    const targetDx = dx * strength;
    const targetDy = dy * strength;

    // Lerp from previous snap offset to target — frame-to-frame smoothing
    // (filters cursor jitter, prevents single-frame visible jumps).
    state.dx += (targetDx - state.dx) * LERP_FACTOR;
    state.dy += (targetDy - state.dy) * LERP_FACTOR;

    return {
      ...transform,
      x: transform.x + state.dx,
      y: transform.y + state.dy,
    };
  };
}

// Singleton — DndContext shares the same modifier instance for the page
// lifetime, so closure state persists across drags. The activeId check
// inside the closure resets state when a new drag starts.
export const snapModifier: Modifier = createMagneticSnapModifier();
