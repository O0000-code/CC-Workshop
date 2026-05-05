import { describe, it, expect, vi } from 'vitest';
import { KeyboardCode } from '@dnd-kit/core';
import type { Active, Over } from '@dnd-kit/core';
import { makeTreeKeyboardCoordinates, type TreeSensorContextRef } from '../treeKeyboardCoordinates';
import { INDENT_STEP_PX, type FlattenedCategory } from '../treeUtilities';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flattened item directly (avoid coupling to flattenTree mechanics). */
function flat(
  id: string,
  depth: number,
  parentId: string | null,
  index: number,
  hasChildren = false,
): FlattenedCategory {
  return {
    id,
    name: id,
    color: '#000000',
    count: 0,
    parentId,
    depth,
    index,
    hasChildren,
    collapsed: false,
  };
}

/** Build a `MutableRefObject<TreeSensorContext>` literal — the shape of a
 *  React `useRef`. */
function makeContextRef(items: FlattenedCategory[], offset = 0): TreeSensorContextRef {
  return { current: { items, offset } };
}

/** Build a partial dnd-kit `SensorContext` with the minimal fields read by
 *  `makeTreeKeyboardCoordinates`. The cast is required because dnd-kit's
 *  full SensorContext has ~14 fields, all of which our coordinate getter
 *  ignores. */
type CoordinateGetterArgs = Parameters<ReturnType<typeof makeTreeKeyboardCoordinates>>[1];

function makeArgs(opts: {
  active: Pick<Active, 'id'> | null;
  over: Pick<Over, 'id'> | null;
  currentX?: number;
  currentY?: number;
}): CoordinateGetterArgs {
  // We only need `currentCoordinates`, `context.active`, `context.over`.
  // The rest of SensorContext is irrelevant for our paths and is cast
  // through `unknown` to satisfy TS.
  return {
    active: opts.active ? opts.active.id : (null as unknown as Active['id']),
    currentCoordinates: { x: opts.currentX ?? 0, y: opts.currentY ?? 0 },
    context: {
      active: opts.active as Active | null,
      over: opts.over as Over | null,
    } as unknown as CoordinateGetterArgs['context'],
  };
}

/** Build a minimal KeyboardEvent surface — the spec only reads `code` and
 *  calls `preventDefault()`. */
function makeEvent(code: string): KeyboardEvent {
  const event = {
    code,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  return event;
}

// ---------------------------------------------------------------------------
// Setup: small flat fixtures used across tests.
//   `flatItems`: ['rA', 'rB']  — two flat roots, no children.
//   `treeItems`: ['root1', 'root2(parent)', 'child', 'root3']
//                 — with one parent that has one child.
// `flatItems` is used when we want depth=0 to actually resolve to 0 (no
// minDepth pressure from a deeper nextItem). `treeItems` is used to test
// hierarchy-specific paths like child promote and parent-with-children
// invalid demote.
// ---------------------------------------------------------------------------

const flatItems: FlattenedCategory[] = [flat('rA', 0, null, 0), flat('rB', 0, null, 1)];

const treeItems: FlattenedCategory[] = [
  flat('root1', 0, null, 0),
  flat('root2', 0, null, 1, true),
  flat('child', 1, 'root2', 2),
  flat('root3', 0, null, 3),
];

// ---------------------------------------------------------------------------
// Right Arrow → demote
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — Right Arrow (demote)', () => {
  it('shifts x by +indentationWidth when depth can grow (root → child)', () => {
    // Children-free fixture so projection.depth at offset=0 actually
    // resolves to 0 (no nextItem pushing minDepth up to 1).
    //   arrayMove([rA, rB], 0, 1) → [rB, rA]
    //   overItemIndex=1, previousItem=rB, nextItem=undefined
    //   maxDepth = min(MAX_DEPTH, 1) = 1, minDepth = 0
    //   dragDepth at offset=0 → 0 → depth = 0 < MAX_DEPTH → demote allowed.
    const ref = makeContextRef(flatItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Right);
    const args = makeArgs({
      active: { id: 'rA' },
      over: { id: 'rB' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toEqual({ x: 100 + INDENT_STEP_PX, y: 50 });
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('refuses demote when projected depth is already at MAX_DEPTH', () => {
    // child is already at depth 1. Drag child over root2 (its current
    // neighbour) — projection.depth resolves to 1 (= MAX_DEPTH) → Right
    // arrow has nowhere deeper to go → returns undefined.
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Right);
    const args = makeArgs({
      active: { id: 'child' },
      over: { id: 'root2' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toBeUndefined();
    // preventDefault still fires for horizontal keys (we own the event).
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('refuses demote when D5 invalid (parent root with children)', () => {
    // root2 is a parent. Drag it over child with offset=+16 →
    // projection would propose depth=1 but D5 force-clamps to 0 and sets
    // isInvalid=true → Right arrow refuses.
    const ref = makeContextRef(treeItems, INDENT_STEP_PX);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Right);
    const args = makeArgs({
      active: { id: 'root2' },
      over: { id: 'child' },
      currentX: 50,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toBeUndefined();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Left Arrow → promote
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — Left Arrow (promote)', () => {
  it('shifts x by -indentationWidth when depth > 0 (child → root)', () => {
    // Drag child over root2 with offset 0 → projection.depth resolves to
    // child's natural depth 1 (its sibling neighbours preserve the slot).
    // depth > 0 → Left arrow accepts the promote.
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Left);
    const args = makeArgs({
      active: { id: 'child' },
      over: { id: 'root2' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toEqual({ x: 100 - INDENT_STEP_PX, y: 50 });
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('refuses promote when already at root depth', () => {
    // rA at depth 0; Left arrow has nowhere to go.
    const ref = makeContextRef(flatItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Left);
    const args = makeArgs({
      active: { id: 'rA' },
      over: { id: 'rB' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toBeUndefined();
    // preventDefault still fires — we own the horizontal key path.
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Indentation override
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — custom indentationWidth', () => {
  it('uses the passed indentationWidth instead of the INDENT_STEP_PX default', () => {
    const customStep = 24;
    const ref = makeContextRef(flatItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref, customStep);

    const event = makeEvent(KeyboardCode.Right);
    const args = makeArgs({
      active: { id: 'rA' },
      over: { id: 'rB' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    expect(result).toEqual({ x: 100 + customStep, y: 50 });
  });
});

// ---------------------------------------------------------------------------
// Pass-through paths (Up / Down / Esc / Space / Enter / Tab)
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — non-horizontal pass-through', () => {
  it('delegates to sortableKeyboardCoordinates for Up Arrow', () => {
    // We can't easily mock the dnd-kit default getter, but we can verify
    // the coordinate getter does not call our preventDefault and does not
    // return our custom horizontal coordinates. The default dnd-kit
    // getter usually returns `undefined` when there's no collision —
    // jsdom doesn't render a collision tree — so we just assert that the
    // getter doesn't crash and that we did not consume the event.
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Up);
    const args = makeArgs({
      active: { id: 'root2' },
      over: { id: 'root1' },
      currentX: 100,
      currentY: 50,
    });

    // dnd-kit's default getter calls event.preventDefault internally when
    // the event matches its directions list (which Up is in). The point
    // here is: we do NOT short-circuit the call and we do NOT shift x
    // ourselves.
    const result = getter(event, args);
    // Result will not be our +/-16 shifted x because we delegated.
    if (result) {
      expect(result.x).not.toBe(100 + INDENT_STEP_PX);
      expect(result.x).not.toBe(100 - INDENT_STEP_PX);
    }
  });

  it('does not call preventDefault for non-horizontal keys via our wrapper', () => {
    // Our wrapper only calls preventDefault on Left/Right. dnd-kit's
    // default may call it for Up/Down internally — this test only
    // verifies the wrapper itself doesn't double-fire.
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    // Use a non-arrow key the default getter ignores entirely (e.g. Space).
    // Our wrapper passes through to the default, which won't call preventDefault.
    const event = makeEvent(KeyboardCode.Space);
    const args = makeArgs({
      active: { id: 'root1' },
      over: { id: 'root2' },
      currentX: 0,
      currentY: 0,
    });

    getter(event, args);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Defensive: missing active / over
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — defensive guards', () => {
  it('returns undefined when active is null on a horizontal key', () => {
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Right);
    const args = makeArgs({
      active: null,
      over: { id: 'root2' },
    });

    const result = getter(event, args);
    expect(result).toBeUndefined();
    // We bail before preventDefault when there's no active drag.
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('returns undefined when over is null on a horizontal key', () => {
    const ref = makeContextRef(treeItems, 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    const event = makeEvent(KeyboardCode.Left);
    const args = makeArgs({
      active: { id: 'child' },
      over: null,
    });

    const result = getter(event, args);
    expect(result).toBeUndefined();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Live-state ref reads
// ---------------------------------------------------------------------------

describe('makeTreeKeyboardCoordinates — live state via MutableRef', () => {
  it('reads the latest items from contextRef.current on each call', () => {
    // Demonstrate stale-snapshot avoidance: the closure reads current.items
    // at invocation time, not at factory creation time.
    const ref = makeContextRef([flat('root1', 0, null, 0), flat('root2', 0, null, 1)], 0);
    const getter = makeTreeKeyboardCoordinates(ref);

    // Mutate the ref's items between factory creation and getter call —
    // simulating what `useEffect` does in the host component.
    ref.current = {
      items: [
        flat('root1', 0, null, 0),
        flat('root2', 0, null, 1, true),
        flat('child', 1, 'root2', 2),
      ],
      offset: 0,
    };

    // Now drag 'child' (which only exists in the updated items list).
    const event = makeEvent(KeyboardCode.Left);
    const args = makeArgs({
      active: { id: 'child' },
      over: { id: 'root2' },
      currentX: 100,
      currentY: 50,
    });

    const result = getter(event, args);
    // If the closure had captured the original empty-of-'child' items,
    // child would not be in the list and the projection would default to
    // depth 0 → Left arrow refuses (returns undefined). With live ref
    // read, child is found at depth 1 → Left arrow accepts.
    expect(result).toEqual({ x: 100 - INDENT_STEP_PX, y: 50 });
  });
});
