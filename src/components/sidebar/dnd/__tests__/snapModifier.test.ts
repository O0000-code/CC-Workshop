import { describe, it, expect, beforeEach } from 'vitest';
import type { Active, ClientRect, Over } from '@dnd-kit/core';
import { resetSnapStrength, snapModifier, snapStrengthRef } from '../snapModifier';

// dnd-kit v6.3.1 doesn't re-export `Transform` from the package root.
// Inlined here as the documented modifier transform shape.
type Transform = { x: number; y: number; scaleX: number; scaleY: number };

// ---------------------------------------------------------------------------
// Helpers — minimal fixtures for a single modifier frame
// ---------------------------------------------------------------------------

function rect(top: number, left: number, height: number, width: number): ClientRect {
  return {
    top,
    left,
    height,
    width,
    right: left + width,
    bottom: top + height,
  };
}

function makeArgs({
  transform,
  draggingNodeRect,
  over,
  active,
}: {
  transform: Transform;
  draggingNodeRect: ClientRect | null;
  over: Over | null;
  active: Active | null;
}) {
  return {
    transform,
    draggingNodeRect,
    over,
    active,
    // The modifier doesn't read the rest, but the dnd-kit type insists.
    activatorEvent: null,
    activeNodeRect: null,
    containerNodeRect: null,
    overlayNodeRect: null,
    scrollableAncestors: [],
    scrollableAncestorRects: [],
    windowRect: null,
  };
}

const ZERO_TRANSFORM: Transform = { x: 0, y: 0, scaleX: 1, scaleY: 1 };

// ---------------------------------------------------------------------------
// V2.2 D5 — snapStrengthRef tunable strength
// ---------------------------------------------------------------------------

describe('snapModifier — V2.2 D5 strength tuning', () => {
  // Snap singleton holds closure state across calls. Reset between tests by:
  //   1. resetting strength to 1.0
  //   2. running the modifier with a fresh active.id so internal state.dx/dy
  //      get cleared (snapModifier.ts: "Reset state when a new drag starts").
  beforeEach(() => {
    resetSnapStrength();
    // Drive a new-active-id frame to flush internal state.
    snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect: null,
        over: null,
        active: { id: '__reset__' } as Active,
      }),
    );
  });

  it('resetSnapStrength sets the ref back to 1.0', () => {
    snapStrengthRef.current = 0.3;
    resetSnapStrength();
    expect(snapStrengthRef.current).toBe(1.0);
  });

  it('strength=1.0: at moderate proximity the modifier pulls the transform toward over center', () => {
    // Dragging a 32-px row whose center is 8 px above the over slot center.
    // dist = 8 px (< SNAP_RANGE_PX = 12), so gravity is non-zero.
    snapStrengthRef.current = 1.0;
    const draggingNodeRect = rect(100, 0, 32, 200); // center y = 116
    const overRect = rect(108, 0, 32, 200); // center y = 124, dy = +8
    const result = snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect,
        over: { id: 'B', rect: overRect } as unknown as Over,
        active: { id: 'A' } as Active,
      }),
    );
    // First-frame lerp: state.dx/dy starts at 0 → moves toward target × LERP_FACTOR (0.35).
    // strength = (1 - 8/12)^2 = (1/3)^2 ≈ 0.111. target dy ≈ 8 × 0.111 ≈ 0.889.
    // applied dy ≈ 0.889 × 0.35 ≈ 0.311 (modulo floating-point).
    // We assert direction (positive y pull) and an ordering bound that
    // distinguishes strength=1.0 from strength=0.3 below.
    expect(result.y).toBeGreaterThan(0);
    expect(result.y).toBeLessThan(1); // first-frame is always small
  });

  it('strength=0.3: pull magnitude is roughly 30% of strength=1.0 (single frame)', () => {
    const draggingNodeRect = rect(100, 0, 32, 200);
    const overRect = rect(108, 0, 32, 200);

    snapStrengthRef.current = 1.0;
    // Switch active id to flush state, then run with strength=1.0
    snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect: null,
        over: null,
        active: { id: 'A1' } as Active,
      }),
    );
    const full = snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect,
        over: { id: 'B', rect: overRect } as unknown as Over,
        active: { id: 'A1' } as Active,
      }),
    );

    // Reset state with new active id, then run strength=0.3
    snapStrengthRef.current = 0.3;
    snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect: null,
        over: null,
        active: { id: 'A2' } as Active,
      }),
    );
    const weak = snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect,
        over: { id: 'B', rect: overRect } as unknown as Over,
        active: { id: 'A2' } as Active,
      }),
    );

    // Both pull in the same direction.
    expect(full.y).toBeGreaterThan(0);
    expect(weak.y).toBeGreaterThan(0);
    // weak ≈ 0.3 × full. Allow ±5% tolerance for floating-point drift.
    const ratio = weak.y / full.y;
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.35);
  });

  it('strength=0: no pull is applied (transform passes through within decay tolerance)', () => {
    snapStrengthRef.current = 0;
    // Fresh active id to flush state.
    snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect: null,
        over: null,
        active: { id: 'A3' } as Active,
      }),
    );
    const draggingNodeRect = rect(100, 0, 32, 200);
    const overRect = rect(108, 0, 32, 200);
    const result = snapModifier(
      makeArgs({
        transform: { x: 5, y: 7, scaleX: 1, scaleY: 1 },
        draggingNodeRect,
        over: { id: 'B', rect: overRect } as unknown as Over,
        active: { id: 'A3' } as Active,
      }),
    );
    // No new pull added, only state.dx/dy decay (which started at 0 anyway).
    expect(result.x).toBe(5);
    expect(result.y).toBe(7);
  });

  it('large distance (≥ SNAP_RANGE_PX): no pull regardless of strength', () => {
    snapStrengthRef.current = 1.0;
    snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect: null,
        over: null,
        active: { id: 'A4' } as Active,
      }),
    );
    const draggingNodeRect = rect(100, 0, 32, 200); // center y = 116
    const overRect = rect(150, 0, 32, 200); // center y = 166, dy = +50 (> 12)
    const result = snapModifier(
      makeArgs({
        transform: ZERO_TRANSFORM,
        draggingNodeRect,
        over: { id: 'B', rect: overRect } as unknown as Over,
        active: { id: 'A4' } as Active,
      }),
    );
    // dist > SNAP_RANGE_PX → strength = 0; first frame applies 0 pull.
    expect(result.y).toBe(0);
    expect(result.x).toBe(0);
  });
});
