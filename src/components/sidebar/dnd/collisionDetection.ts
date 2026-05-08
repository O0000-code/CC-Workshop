import { closestCenter, pointerWithin } from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';

/**
 * Hybrid collision detection for hierarchy-aware sidebar drag.
 *
 * V2.2 D3 (2026-05-08, src=02 V2.2 §6.2 / r2 §1.5 / _synthesis_decisions D3):
 *
 * Default `closestCenter` receives `collisionRect` — the active rect AFTER
 * `applyModifiers(snapModifier, ...)` (`core.esm.js:2984`, verified in
 * `.dev/sidebar-hierarchy-fix/01_research/r2_dndkit_source_verification.md` §1.3).
 * `snapModifier` pulls the active rect toward the over slot's center, so
 * `closestCenter` scores the already-pulled rect and re-selects the very over
 * the snap is targeting. This is a self-reinforcing feedback loop that locks
 * `over` to whatever row the snap is currently pulling toward.
 *
 * In the hierarchy case this manifested as "user drags a child upward but
 * `over` never leaves the originalParent" — making V2.1's
 * `getProjection` immediate-promote (`treeUtilities.ts:535-548`) unreachable.
 * Reproducible as user-reported S3 "移除子类别失败" (r1 §1.2).
 *
 * The fix is a hybrid:
 *
 *   1. Run `pointerWithin` first. dnd-kit's `pointerCoordinates` is computed
 *      as `activationCoordinates + translate` (`core.esm.js:2977`), where
 *      `translate` is the raw sensor delta — *unmodified* by the modifier
 *      chain. When the pointer falls inside any droppable rect, that hit is
 *      authoritative and free of the snap feedback.
 *   2. If `pointerWithin` returns empty (pointer in inter-row gap or outside
 *      the list), fall back to `closestCenter`. This preserves the V3
 *      invariant #22 behavior for the cases where pointerWithin has no
 *      answer, and prevents the "DragOverlay drifts away from pointer because
 *      over=null" failure mode.
 *
 * Reference: V3 invariant #22 hierarchy override is documented in
 * `.dev/category-hierarchy/02_design_spec.md` V2.2 §6.2 and
 * `.dev/sidebar-reorder/02_design_spec.md` V3 invariants table.
 */
export const sidebarCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};
