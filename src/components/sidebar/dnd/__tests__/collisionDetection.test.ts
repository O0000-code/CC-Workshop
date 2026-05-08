import { describe, it, expect } from 'vitest';
import type { Active, ClientRect, DroppableContainer } from '@dnd-kit/core';
import { sidebarCollisionDetection } from '../collisionDetection';

// dnd-kit v6.3.1 does not export `RectMap`; the underlying type is a
// `Map<UniqueIdentifier, ClientRect>`. We use the resolved Map shape
// directly here to avoid the missing-export tsc error.

// ---------------------------------------------------------------------------
// Helpers — minimal fixtures for dnd-kit collision args
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

function makeDroppable(id: string, _r: ClientRect): DroppableContainer {
  return {
    id,
    key: id,
    disabled: false,
    node: { current: null },
    rect: { current: _r },
    data: { current: undefined },
  } as unknown as DroppableContainer;
}

function makeArgs({
  pointer,
  collisionRect,
  rects,
}: {
  pointer: { x: number; y: number } | null;
  collisionRect: ClientRect;
  rects: Record<string, ClientRect>;
}) {
  const droppableRects = new Map(Object.entries(rects));
  const droppableContainers = Object.entries(rects).map(([id, r]) => makeDroppable(id, r));
  return {
    active: {
      id: 'active',
      rect: { current: { initial: collisionRect, translated: collisionRect } },
    } as unknown as Active,
    collisionRect,
    droppableRects,
    droppableContainers,
    pointerCoordinates: pointer,
  };
}

// ---------------------------------------------------------------------------
// V2.2 D3 — sidebarCollisionDetection
// ---------------------------------------------------------------------------

describe('sidebarCollisionDetection — pointerWithin → closestCenter hybrid', () => {
  // Three stacked rows, each 32 px tall, 200 px wide, no gap between them.
  const rowA = rect(0, 0, 32, 200);
  const rowB = rect(32, 0, 32, 200);
  const rowC = rect(64, 0, 32, 200);

  it('pointer inside a row → uses pointerWithin (returns that row even if collisionRect is centered elsewhere)', () => {
    // collisionRect is shifted toward rowC center (simulating snap pull),
    // but pointer is firmly inside rowA. pointerWithin must win.
    const args = makeArgs({
      pointer: { x: 100, y: 16 }, // inside rowA
      collisionRect: rect(60, 0, 32, 200), // collisionRect ≈ rowC's slot
      rects: { A: rowA, B: rowB, C: rowC },
    });
    const result = sidebarCollisionDetection(args);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('A');
  });

  it('pointer outside all rows → falls back to closestCenter (uses collisionRect)', () => {
    // Pointer is far below the list — pointerWithin returns empty.
    // closestCenter should rank by distance from collisionRect center to
    // each row's center; closest is whichever the collisionRect is near.
    const args = makeArgs({
      pointer: { x: 100, y: 500 }, // below all rows
      collisionRect: rect(64, 0, 32, 200), // collisionRect over rowC
      rects: { A: rowA, B: rowB, C: rowC },
    });
    const result = sidebarCollisionDetection(args);
    expect(result.length).toBeGreaterThan(0);
    // closestCenter: collisionRect center (100, 80) → distances:
    //   A center (100, 16) → 64; B center (100, 48) → 32; C center (100, 80) → 0.
    // C wins.
    expect(result[0].id).toBe('C');
  });

  it('pointer in inter-row gap (but rows here are adjacent — synthesize a 1px gap) → fallback to closestCenter', () => {
    // Synthesize a 1 px gap between rowA and rowB to simulate the gap
    // scenario: pointer at y=33, x=100. Rows are at y∈[0,32] and y∈[34,66]
    // — pointer is in the 1 px gap.
    const A = rect(0, 0, 32, 200);
    const B = rect(34, 0, 32, 200); // gap at y∈(32,34)
    const args = makeArgs({
      pointer: { x: 100, y: 33 },
      collisionRect: rect(0, 0, 32, 200), // collisionRect over rowA
      rects: { A, B },
    });
    const result = sidebarCollisionDetection(args);
    // pointerWithin: pointer (100, 33) is NOT in A [0,32] nor B [34,66] → empty.
    // Fallback: closestCenter ranks; collisionRect center (100, 16) is at A's
    // center → A wins.
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('A');
  });

  it('pointer at exact boundary of two rows is handled by pointerWithin (semantics inherited from dnd-kit)', () => {
    // Pointer at y=32 (boundary between rowA bottom and rowB top). This test
    // documents that boundary handling is whatever dnd-kit's isPointWithinRect
    // decides — sidebarCollisionDetection is a thin wrapper.
    const args = makeArgs({
      pointer: { x: 100, y: 32 },
      collisionRect: rect(0, 0, 32, 200),
      rects: { A: rowA, B: rowB },
    });
    const result = sidebarCollisionDetection(args);
    // We don't assert which row wins — we only assert the result is non-empty
    // (i.e. either pointerWithin found a hit, or closestCenter fell through).
    expect(result.length).toBeGreaterThan(0);
  });

  it('null pointerCoordinates → falls back to closestCenter', () => {
    // Keyboard drag scenario: pointerCoordinates can be null.
    const args = makeArgs({
      pointer: null,
      collisionRect: rect(0, 0, 32, 200),
      rects: { A: rowA, B: rowB, C: rowC },
    });
    const result = sidebarCollisionDetection(args);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].id).toBe('A'); // closestCenter chooses A (collisionRect over A)
  });
});
