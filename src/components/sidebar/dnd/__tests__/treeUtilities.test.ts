import { describe, it, expect } from 'vitest';
import type { Category } from '@/types';
import {
  flattenTree,
  buildTree,
  getProjection,
  getVisibleDropIntoProjection,
  getSubtreeReorderIds,
  isPointerBelowRowCenter,
  removeChildrenOf,
  getChildCount,
  MAX_DEPTH,
  INDENT_STEP_PX,
  ABS_X_THRESHOLD_PX,
  type FlattenedCategory,
} from '../treeUtilities';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a `Category` with optional `parentId`. Mirrors `categoryTree.test.ts`
 *  helper so this file stays compilable independent of merge order. */
function cat(id: string, parentId?: string, name = id): Category {
  const base: Category = { id, name, color: '#000000', count: 0 };
  if (parentId !== undefined) {
    return { ...base, parentId };
  }
  return base;
}

/** Convenience: build a flattened item directly (skips `flattenTree`),
 *  for tests that only need a deterministic in-memory shape. */
function flat(
  id: string,
  depth: number,
  parentId: string | null,
  index: number,
  hasChildren = false,
  collapsed = false,
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
    collapsed,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('exported constants', () => {
  it('MAX_DEPTH is 1 (depth 0 root + depth 1 child only)', () => {
    expect(MAX_DEPTH).toBe(1);
  });

  it('INDENT_STEP_PX is 16 (matches design_spec V2 §5 --indent-step token)', () => {
    expect(INDENT_STEP_PX).toBe(16);
  });

  it('ABS_X_THRESHOLD_PX is 12 (matches design_spec V2 §6.3)', () => {
    expect(ABS_X_THRESHOLD_PX).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// getVisibleDropIntoProjection
// ---------------------------------------------------------------------------

describe('getVisibleDropIntoProjection — indicator/commit contract', () => {
  it('accepts a valid projected parent only when it matches the visible indicator row', () => {
    const projection = { depth: 1, parentId: 'Analysis', isInvalid: false };

    expect(getVisibleDropIntoProjection(projection, 'Analysis', null)).toBe(projection);
  });

  it('rejects a hidden final projection whose parent differs from the painted indicator', () => {
    const projection = { depth: 1, parentId: 'Writing', isInvalid: false };

    expect(getVisibleDropIntoProjection(projection, 'Analysis', null)).toBeNull();
  });

  it('rejects top-edge demote projections when no indicator was visible', () => {
    const projection = { depth: 1, parentId: 'Analysis', isInvalid: false };

    expect(getVisibleDropIntoProjection(projection, null, null)).toBeNull();
  });

  it('rejects invalid, root-level, and same-parent projections', () => {
    expect(
      getVisibleDropIntoProjection(
        { depth: 0, parentId: 'Analysis', isInvalid: true },
        'Analysis',
        null,
      ),
    ).toBeNull();
    expect(
      getVisibleDropIntoProjection(
        { depth: 0, parentId: null, isInvalid: false },
        'Analysis',
        null,
      ),
    ).toBeNull();
    expect(
      getVisibleDropIntoProjection(
        { depth: 1, parentId: 'Analysis', isInvalid: false },
        'Analysis',
        'Analysis',
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pointer-side helper
// ---------------------------------------------------------------------------

describe('isPointerBelowRowCenter', () => {
  const rowRect = { top: 100, height: 32 };

  it('returns false for the upper half and true for the lower half of a row', () => {
    expect(isPointerBelowRowCenter(112, rowRect)).toBe(false);
    expect(isPointerBelowRowCenter(117, rowRect)).toBe(true);
  });

  it('returns null when the pointer or row rect is unavailable', () => {
    expect(isPointerBelowRowCenter(null, rowRect)).toBeNull();
    expect(isPointerBelowRowCenter(117, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

describe('flattenTree', () => {
  it('returns an empty array for an empty input list', () => {
    expect(flattenTree([], new Set())).toEqual([]);
  });

  it('flattens a single root with no children to one row at depth=0', () => {
    const result = flattenTree([cat('only')], new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'only',
      depth: 0,
      parentId: null,
      index: 0,
      hasChildren: false,
      collapsed: false,
    });
  });

  it('preserves root order for multiple roots', () => {
    const result = flattenTree([cat('a'), cat('b'), cat('c')], new Set());
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('emits children directly after their parent when the parent is expanded', () => {
    const cats = [cat('root1'), cat('childA', 'root1'), cat('childB', 'root1'), cat('root2')];
    const result = flattenTree(cats, new Set(['root1']));
    expect(result.map((r) => r.id)).toEqual(['root1', 'childA', 'childB', 'root2']);
    expect(result[0]).toMatchObject({ depth: 0, hasChildren: true, collapsed: false });
    expect(result[1]).toMatchObject({ depth: 1, parentId: 'root1', hasChildren: false });
    expect(result[2]).toMatchObject({ depth: 1, parentId: 'root1', hasChildren: false });
    expect(result[3]).toMatchObject({ depth: 0, hasChildren: false });
  });

  it('hides children when their parent is collapsed (not in expandedSet)', () => {
    const cats = [cat('root'), cat('child', 'root')];
    const result = flattenTree(cats, new Set()); // empty expandedSet
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'root',
      hasChildren: true,
      collapsed: true,
    });
  });

  it('preserves child order within each parent', () => {
    const cats = [cat('root'), cat('z', 'root'), cat('a', 'root'), cat('m', 'root')];
    const result = flattenTree(cats, new Set(['root']));
    expect(result.map((r) => r.id)).toEqual(['root', 'z', 'a', 'm']);
  });

  it('assigns sequential index numbers to all emitted rows', () => {
    const cats = [cat('r1'), cat('c1', 'r1'), cat('r2'), cat('c2', 'r2')];
    const result = flattenTree(cats, new Set(['r1', 'r2']));
    expect(result.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  it('assigns hasChildren=false and collapsed=false to child rows (MAX_DEPTH=1)', () => {
    const cats = [cat('root'), cat('child', 'root')];
    const result = flattenTree(cats, new Set(['root']));
    expect(result[1]).toMatchObject({ hasChildren: false, collapsed: false });
  });

  it('drops orphan children whose parentId points to a non-existent node', () => {
    // Defensive: backend validate_hierarchy rejects orphans, but if one
    // leaks through the flattened output should not include it.
    const cats = [cat('root'), cat('orphan', 'gone')];
    const result = flattenTree(cats, new Set(['root']));
    expect(result.map((r) => r.id)).toEqual(['root']);
  });

  it('marks parents without children as hasChildren=false and collapsed=false', () => {
    // A childless parent is just a root row with no chevron — collapsed
    // semantics are meaningless here.
    const cats = [cat('childless')];
    const result = flattenTree(cats, new Set());
    expect(result[0]).toMatchObject({ hasChildren: false, collapsed: false });
  });
});

// ---------------------------------------------------------------------------
// buildTree (round-trip)
// ---------------------------------------------------------------------------

describe('buildTree', () => {
  it('round-trips an empty list', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('round-trips a single root (root has no parentId key)', () => {
    const original = [cat('only')];
    const flatList = flattenTree(original, new Set());
    const rebuilt = buildTree(flatList);
    expect(rebuilt).toHaveLength(1);
    expect(rebuilt[0].id).toBe('only');
    // Roots are represented by *absent* parentId (matches `parentId?: string`
    // on Category — Rust serde drops `None` via `skip_serializing_if`).
    expect(rebuilt[0].parentId).toBeUndefined();
  });

  it('round-trips parents and children preserving order and parentId', () => {
    const original = [cat('r1'), cat('c1a', 'r1'), cat('c1b', 'r1'), cat('r2'), cat('c2', 'r2')];
    const flatList = flattenTree(original, new Set(['r1', 'r2']));
    const rebuilt = buildTree(flatList);
    expect(rebuilt.map((c) => c.id)).toEqual(['r1', 'c1a', 'c1b', 'r2', 'c2']);
    expect(rebuilt[0].parentId).toBeUndefined();
    expect(rebuilt[1].parentId).toBe('r1');
    expect(rebuilt[2].parentId).toBe('r1');
    expect(rebuilt[3].parentId).toBeUndefined();
    expect(rebuilt[4].parentId).toBe('r2');
  });

  it('strips depth/index/hasChildren/collapsed flatten-only fields', () => {
    const flatList = [flat('only', 0, null, 0)];
    const rebuilt = buildTree(flatList);
    expect(rebuilt[0]).not.toHaveProperty('depth');
    expect(rebuilt[0]).not.toHaveProperty('index');
    expect(rebuilt[0]).not.toHaveProperty('hasChildren');
    expect(rebuilt[0]).not.toHaveProperty('collapsed');
  });

  it('preserves Category fields (name, color, count) verbatim', () => {
    const flatList: FlattenedCategory[] = [
      {
        id: 'rich',
        name: 'Rich Category',
        color: '#FF0000',
        count: 42,
        parentId: null,
        depth: 0,
        index: 0,
        hasChildren: false,
        collapsed: false,
      },
    ];
    const rebuilt = buildTree(flatList);
    expect(rebuilt[0]).toMatchObject({
      id: 'rich',
      name: 'Rich Category',
      color: '#FF0000',
      count: 42,
    });
  });
});

// ---------------------------------------------------------------------------
// removeChildrenOf
// ---------------------------------------------------------------------------

describe('removeChildrenOf', () => {
  it('returns the input array unchanged when hideParentIds is empty', () => {
    const items = [flat('a', 0, null, 0), flat('b', 0, null, 1)];
    expect(removeChildrenOf(items, [])).toBe(items); // same reference
  });

  it('removes children of the specified parent only', () => {
    const items = [
      flat('p1', 0, null, 0, true),
      flat('c1a', 1, 'p1', 1),
      flat('c1b', 1, 'p1', 2),
      flat('p2', 0, null, 3, true),
      flat('c2', 1, 'p2', 4),
    ];
    const result = removeChildrenOf(items, ['p1']);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2', 'c2']);
  });

  it('removes children of multiple parents at once', () => {
    const items = [
      flat('p1', 0, null, 0),
      flat('c1', 1, 'p1', 1),
      flat('p2', 0, null, 2),
      flat('c2', 1, 'p2', 3),
    ];
    const result = removeChildrenOf(items, ['p1', 'p2']);
    expect(result.map((r) => r.id)).toEqual(['p1', 'p2']);
  });

  it('preserves root rows even when their id is in hideParentIds', () => {
    // The function hides *children of* the listed ids, not the rows
    // themselves — the parent stays visible.
    const items = [flat('p', 0, null, 0), flat('c', 1, 'p', 1)];
    const result = removeChildrenOf(items, ['p']);
    expect(result.map((r) => r.id)).toEqual(['p']);
  });

  it('is a no-op when no items match the hideParentIds set', () => {
    const items = [flat('a', 0, null, 0), flat('b', 0, null, 1)];
    const result = removeChildrenOf(items, ['nonexistent']);
    expect(result).toEqual(items);
  });

  it('coerces UniqueIdentifier (number) to string for parentId comparison', () => {
    const items = [flat('p', 0, null, 0), flat('c', 1, 'p', 1)];
    const result = removeChildrenOf(items, [123 as unknown as string]); // simulate numeric id
    // 'p' comparison fails (parentId is 'p', not '123'), nothing removed.
    expect(result.map((r) => r.id)).toEqual(['p', 'c']);
  });
});

// ---------------------------------------------------------------------------
// getSubtreeReorderIds
// ---------------------------------------------------------------------------

describe('getSubtreeReorderIds', () => {
  it('moves a promoted child below a target root when pointer is below the target', () => {
    const items: FlattenedCategory[] = [
      flat('Writing', 0, null, 0, true),
      flat('Analysis', 1, 'Writing', 1),
      flat('Development', 0, null, 2),
    ];

    expect(getSubtreeReorderIds(items, 'Analysis', 'Development', true)).toEqual([
      'Writing',
      'Development',
      'Analysis',
    ]);
  });

  it('moves a promoted child above its original parent when pointer is above that parent', () => {
    const items: FlattenedCategory[] = [
      flat('Writing', 0, null, 0, true),
      flat('Analysis', 1, 'Writing', 1),
      flat('Development', 0, null, 2),
    ];

    expect(getSubtreeReorderIds(items, 'Analysis', 'Writing', false)).toEqual([
      'Analysis',
      'Writing',
      'Development',
    ]);
  });

  it('keeps an active parent subtree together during same-level reorder', () => {
    const items: FlattenedCategory[] = [
      flat('A', 0, null, 0, true),
      flat('A-child', 1, 'A', 1),
      flat('B', 0, null, 2),
      flat('C', 0, null, 3),
    ];

    expect(getSubtreeReorderIds(items, 'A', 'C', true)).toEqual(['B', 'C', 'A', 'A-child']);
  });

  it('returns null when over is inside the active subtree', () => {
    const items: FlattenedCategory[] = [
      flat('A', 0, null, 0, true),
      flat('A-child', 1, 'A', 1),
      flat('B', 0, null, 2),
    ];

    expect(getSubtreeReorderIds(items, 'A', 'A-child', true)).toBeNull();
  });

  it('keeps current order when over is the active row itself', () => {
    const items: FlattenedCategory[] = [
      flat('A', 0, null, 0),
      flat('B', 0, null, 1),
      flat('C', 0, null, 2),
    ];

    expect(getSubtreeReorderIds(items, 'B', 'B')).toEqual(['A', 'B', 'C']);
  });
});

// ---------------------------------------------------------------------------
// getProjection
// ---------------------------------------------------------------------------

describe('getProjection', () => {
  // A simple fixture: two roots, the second of which has one child (expanded).
  // ['root1', 'root2', 'child']  depth = [0, 0, 1]
  const baseItems: FlattenedCategory[] = [
    flat('root1', 0, null, 0),
    flat('root2', 0, null, 1, true),
    flat('child', 1, 'root2', 2),
  ];

  it('returns zero defaults when activeId is not in the list', () => {
    const result = getProjection(baseItems, 'missing', 'root1', 0);
    expect(result).toEqual({ depth: 0, parentId: null, isInvalid: false });
  });

  it('returns zero defaults when overId is not in the list', () => {
    const result = getProjection(baseItems, 'root1', 'missing', 0);
    expect(result).toEqual({ depth: 0, parentId: null, isInvalid: false });
  });

  it('does not change depth when |dragOffsetX| < ABS_X_THRESHOLD_PX', () => {
    // Use a children-free fixture so the algorithm's own minDepth (the
    // nextItem's depth) doesn't push us up a level. With two roots only:
    //   arrayMove([root1, root2], 0, 1) → [root2, root1]
    //   overItemIndex=1, previousItem=root2, nextItem=undefined
    //   minDepth = 0, maxDepth = min(1, 1) = 1
    //   dragDepth = 0 (below threshold) → projected = 0 → depth = 0.
    const items: FlattenedCategory[] = [flat('root1', 0, null, 0), flat('root2', 0, null, 1)];
    const result = getProjection(items, 'root1', 'root2', 8);
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  it('promotes a child to root when dragOffsetX = -16 over a root row', () => {
    // Drag the child to a position over root1 with offset -16:
    //   arrayMove([root1, root2, child], 2, 0) → [child, root1, root2]
    //   overItemIndex=0, previousItem=undefined, nextItem=root1 (depth 0)
    //   maxDepth = 0, minDepth = 0
    //   dragDepth = sign(-16) * floor(16/16) = -1 → projected = 1 + (-1) = 0
    //   depth = clamp(0, 0, 0) = 0 → root.
    const items: FlattenedCategory[] = [
      flat('root1', 0, null, 0),
      flat('root2', 0, null, 1, true),
      flat('child', 1, 'root2', 2),
    ];
    const result = getProjection(items, 'child', 'root1', -INDENT_STEP_PX);
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
    expect(result.isInvalid).toBe(false);
  });

  it('clamps demotion to MAX_DEPTH = 1 even with large positive offset', () => {
    // Drag root1 over root2 with absurdly large horizontal offset.
    // Without clamp, projectedDepth would be huge; clamp pulls it to MAX_DEPTH=1.
    const items: FlattenedCategory[] = [flat('root1', 0, null, 0), flat('root2', 0, null, 1)];
    const result = getProjection(items, 'root1', 'root2', 999);
    expect(result.depth).toBeLessThanOrEqual(MAX_DEPTH);
  });

  it('demotes a childless root to become a child when offset = +16 over a child boundary', () => {
    // Drag root1 over the existing child position with offset +16 (one full
    // indent step). After arrayMove(items, 0, 2) → [root2, child, root1],
    // overItemIndex = 2, previousItem = 'child' (depth 1, parentId 'root2'),
    // maxDepth = min(MAX_DEPTH, 2) = 1. dragDepth = floor(16/16) = 1.
    // projectedDepth = 0 + 1 = 1 → depth = 1.
    // depth equals previousItem.depth → parentId = previousItem.parentId = 'root2'.
    const items: FlattenedCategory[] = [
      flat('root1', 0, null, 0),
      flat('root2', 0, null, 1, true),
      flat('child', 1, 'root2', 2),
    ];
    const result = getProjection(items, 'root1', 'child', 16);
    expect(result.depth).toBe(1);
    expect(result.parentId).toBe('root2');
    expect(result.isInvalid).toBe(false);
  });

  it('flags isInvalid when a parent root with children would become a child', () => {
    // root2 is a parent (has 'child'). Drag root2 over child position with
    // offset +16:
    //   arrayMove([root1, root2, child], 1, 2) → [root1, child, root2]
    //   overItemIndex=2, previousItem=child (depth 1, parentId 'root2')
    //   maxDepth = min(1, 2) = 1, dragDepth = floor(16/16) = 1
    //   projectedDepth = 0 + 1 = 1 → depth = 1
    //   activeHasChildren=true (child.parentId='root2'), activeItem.depth=0
    //   → isInvalid=true → depth force back to 0.
    const items: FlattenedCategory[] = [
      flat('root1', 0, null, 0),
      flat('root2', 0, null, 1, true),
      flat('child', 1, 'root2', 2),
    ];
    const result = getProjection(items, 'root2', 'child', 16);
    expect(result.isInvalid).toBe(true);
    expect(result.depth).toBe(0);
  });

  it('does NOT flag isInvalid for a childless root being demoted', () => {
    // root1 has no children → demotion to depth 1 is a legal D5 case.
    const items: FlattenedCategory[] = [
      flat('root1', 0, null, 0),
      flat('root2', 0, null, 1, true),
      flat('child', 1, 'root2', 2),
    ];
    const result = getProjection(items, 'root1', 'child', 16);
    expect(result.isInvalid).toBe(false);
  });

  it('respects the 12px threshold — an +11px offset over a childless neighbour stays at depth 0', () => {
    // Children-free fixture (no nextItem at depth 1 to push minDepth).
    const items: FlattenedCategory[] = [flat('root1', 0, null, 0), flat('root2', 0, null, 1)];
    const result = getProjection(items, 'root1', 'root2', 11);
    expect(result.depth).toBe(0);
  });

  it('crosses the threshold cleanly — a +16px offset registers depth=1 against a child boundary', () => {
    // After arrayMove([root1, root2, child], 0, 2) → [root2, child, root1],
    // overItemIndex=2, previousItem=child (depth=1) → maxDepth=1.
    // dragDepth = floor(16/16) = 1 → projected = 0 + 1 = 1 → depth = 1.
    const items: FlattenedCategory[] = [
      flat('root1', 0, null, 0),
      flat('root2', 0, null, 1, true),
      flat('child', 1, 'root2', 2),
    ];
    const result = getProjection(items, 'root1', 'child', 16);
    expect(result.depth).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Position-aware mode (Bug 2026-05-04 fix) — pointerBelowOver = true|false
  //
  // Before this fix the algorithm trusted dnd-kit's `closestCenter` over
  // selection as the user-perceived target. With closestCenter, dragging
  // root A "below B" can yield over=C (A's center crossed B's center and
  // is closer to C); the legacy arrayMove path then treated C as the
  // parent candidate and A became C's child instead of B's. The fix:
  // when the host knows which side of `over` the active center is on,
  // resolve previousItem/nextItem from that gap directly, not from
  // arrayMove(items, activeIdx, overIdx).
  //
  // Convention (matches Things 3 / Linear / Notion):
  //   pointerBelowOver = true  → insert AFTER over → previousItem = over
  //   pointerBelowOver = false → insert BEFORE over → previousItem = items[overIdx-1]
  // -----------------------------------------------------------------------
  describe('position-aware mode (Bug 2026-05-04 fix)', () => {
    // Three roots, no children — the canonical regression fixture for
    // the "drag A below B picks over=C" geometry.
    const threeRoots: FlattenedCategory[] = [
      flat('A', 0, null, 0),
      flat('B', 0, null, 1),
      flat('C', 0, null, 2),
    ];

    it('drag A "below B" with offset +16, over=C, pointerBelowOver=false → A becomes child of B (not C)', () => {
      // closestCenter picks over=C because A's center crossed B's. But
      // the user's visible insertion gap is between B and C — A above C
      // means previousItem=B, so A becomes B's child.
      const result = getProjection(threeRoots, 'A', 'C', 16, INDENT_STEP_PX, false);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('B');
      expect(result.isInvalid).toBe(false);
    });

    it('drag A "below B" with offset +16, over=B, pointerBelowOver=true → A becomes child of B', () => {
      // Pointer is below B's center, insert AFTER B → previousItem=B.
      const result = getProjection(threeRoots, 'A', 'B', 16, INDENT_STEP_PX, true);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('B');
      expect(result.isInvalid).toBe(false);
    });

    it('drag B right in its original slot below A, over=B, pointer side unknown → B becomes child of A', () => {
      // This covers the real DnD boundary from the sidebar: dnd-kit can
      // report `over === active` while the pointer is in the active row's
      // original invisible slot between A and C. In that same-slot case,
      // the legacy neighbour model is correct: previousItem=A, so B can
      // become a child of A without waiting for C to be pushed down.
      const result = getProjection(threeRoots, 'B', 'B', 16, INDENT_STEP_PX);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('A');
      expect(result.isInvalid).toBe(false);
    });

    it('drag A "above B" with offset +16, over=B, pointerBelowOver=false → A stays root before B (no parent)', () => {
      // Pointer is above B's center, insert BEFORE B. previousItem =
      // items[B-1] = A itself; skip-active logic falls back to undefined
      // → maxDepth = 0 → depth clamps to 0 → A remains root.
      // This is the corrective fix for Bug 2 ("drag above + indent ⇒
      // becomes child of B" was wrong; should not auto-parent).
      const result = getProjection(threeRoots, 'A', 'B', 16, INDENT_STEP_PX, false);
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
      expect(result.isInvalid).toBe(false);
    });

    it('drag B "above A" with offset +16, over=A, pointerBelowOver=false → B stays root before A', () => {
      // B's center above A's center, over=A (closestCenter), pointer below = false.
      // Insert before A → previousItem = items[A-1] = undefined → maxDepth=0.
      const result = getProjection(threeRoots, 'B', 'A', 16, INDENT_STEP_PX, false);
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
    });

    it('drag B "below A" with offset +16, over=A, pointerBelowOver=true → B becomes child of A', () => {
      // Insert after A → previousItem=A → B becomes A's child.
      const result = getProjection(threeRoots, 'B', 'A', 16, INDENT_STEP_PX, true);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('A');
    });

    it('drag C "above B" with offset +16, over=B, pointerBelowOver=false → C becomes child of A', () => {
      // Insert before B → previousItem = items[B-1] = A → C becomes A's child.
      // (A has no children, so this is a legal demote.)
      const result = getProjection(threeRoots, 'C', 'B', 16, INDENT_STEP_PX, false);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('A');
    });

    it('promote a child to root via "below sibling" drag with offset -16', () => {
      // Tree: [P (parent), c1 (child), c2 (child)]. Drag c1 down past c2
      // with offset -16 (left ⇒ promote). pointerBelowOver=true picks
      // previousItem=c2 (depth=1). dragDepth = sign(-16)*floor(16/16) = -1
      // → projectedDepth = 1 + -1 = 0 → depth=0 → parentId=null.
      const items: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c1', 1, 'P', 1),
        flat('c2', 1, 'P', 2),
      ];
      const result = getProjection(items, 'c1', 'c2', -16, INDENT_STEP_PX, true);
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
    });

    it('child reordered "below sibling" within same parent stays a child of that parent', () => {
      // Tree: [P, c1, c2]. Drag c1 below c2 (over=c2, pointerBelowOver=true)
      // with offset 0 (no horizontal intent). previousItem=c2 (depth=1,
      // parentId=P). dragDepth=0 → projectedDepth=1 → depth=1 →
      // parentId = previousItem.parentId = P. So c1 stays under P after c2.
      const items: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c1', 1, 'P', 1),
        flat('c2', 1, 'P', 2),
      ];
      const result = getProjection(items, 'c1', 'c2', 0, INDENT_STEP_PX, true);
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('P');
    });

    it('parent with children dragged "below sibling root" with offset +16 is flagged isInvalid (D5)', () => {
      // Tree: [P (parent of c), c (child of P), Q (childless root)].
      // Drag P below Q, offset +16, pointerBelowOver=true. Without the
      // D5 invalid clamp, P would become Q's child and c would land at
      // depth 2 (forbidden). With the clamp, depth is forced back to 0
      // and isInvalid=true.
      const items: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c', 1, 'P', 1),
        flat('Q', 0, null, 2),
      ];
      const result = getProjection(items, 'P', 'Q', 16, INDENT_STEP_PX, true);
      expect(result.isInvalid).toBe(true);
      expect(result.depth).toBe(0);
    });

    it('legacy mode (pointerBelowOver = undefined) preserves the official Tree example behaviour', () => {
      // Same scenario as the regression test above but in legacy mode:
      // arrayMove([A,B,C], 0, 2) = [B,C,A], previousItem=C, depth=1 →
      // parentId=C. This proves the new param is opt-in and that the
      // keyboard / fallback path still uses the upstream algorithm.
      const result = getProjection(threeRoots, 'A', 'C', 16, INDENT_STEP_PX);
      expect(result.parentId).toBe('C');
    });
  });

  // -----------------------------------------------------------------------
  // originalItems parameter — Bug fix 2026-05-05 (P0-2)
  //
  // Production caller passes `displayFlat` (which has had the active
  // subtree's children stripped via removeChildrenOf) as `items`. The
  // D5 `activeHasChildren` check would then read `false` because the
  // children are no longer in the list, and `isInvalid` would stay
  // `false` even when dragging a parent-with-children. The 7th
  // parameter `originalItems` (= `baseFlat`, pre-strip) restores
  // children-presence detection.
  // -----------------------------------------------------------------------
  describe('originalItems parameter — children-presence detection (P0-2)', () => {
    it('when items has had children stripped, originalItems restores D5 detection', () => {
      // Simulate the production state at drop time: P is a parent with
      // child `c`. `displayFlat` is what gets rendered (children stripped
      // for the active subtree); `baseFlat` still contains `c`.
      const baseFlat: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c', 1, 'P', 1),
        flat('Q', 0, null, 2),
      ];
      // displayFlat = removeChildrenOf(baseFlat, ['P']) — c is gone.
      const displayFlat: FlattenedCategory[] = [flat('P', 0, null, 0, true), flat('Q', 0, null, 1)];

      // Without originalItems: items=displayFlat → activeHasChildren=false
      // → isInvalid=false (the bug).
      const buggy = getProjection(displayFlat, 'P', 'Q', 16, INDENT_STEP_PX, true);
      expect(buggy.isInvalid).toBe(false); // documenting the bug shape

      // With originalItems=baseFlat: D5 fires correctly.
      const fixed = getProjection(displayFlat, 'P', 'Q', 16, INDENT_STEP_PX, true, baseFlat);
      expect(fixed.isInvalid).toBe(true);
      expect(fixed.depth).toBe(0);
    });

    it('originalItems defaults to items when omitted (back-compat)', () => {
      // Existing callers (tests, possibly future helpers) that pass a
      // single complete tree as `items` should still get correct D5.
      const items: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c', 1, 'P', 1),
        flat('Q', 0, null, 2),
      ];
      const result = getProjection(items, 'P', 'Q', 16, INDENT_STEP_PX, true);
      expect(result.isInvalid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Asymmetric promote / demote semantics — V2.1 micro-revision 2026-05-05
  //
  // Background: V2 applied symmetric 12 px X offset + 80 ms dwell gates to
  // both promote (child → root) and demote (root → child). User feedback
  // (verbatim 2026-05-05) found promote too sticky:
  //   "磁吸力太强了，需要稍微调弱一点，让它移动到正上方时就能自然地移除
  //    子类别状态。"
  //   "无论移动到多远的位置都不行，必须同时向右移动才能解除子类别状态。
  //    但正常来说，只要移除出它原本子类别的位置（比如移动到父类别的正
  //    上方），就应该能够正常解除。"
  //
  // V2.1 splits the rule:
  //   - promote: triggered by `over` leaving the original parent's subtree
  //     region ({originalParent, sibling, self}); no X offset / dwell.
  //   - demote: retains full V2 discipline (12 px + 80 ms) — handled by the
  //     SortableCategoriesList dwell gate around getProjection, not inside
  //     getProjection itself, so the demote tests below verify the
  //     algorithm's standard X-offset path stays untouched.
  // -----------------------------------------------------------------------
  describe('asymmetric promote semantics (V2.1 2026-05-05)', () => {
    /** Fixture: parent P with two children c1, c2; siblings root Q and R. */
    const fixtureWithChildAndSiblingRoots: FlattenedCategory[] = [
      flat('P', 0, null, 0, true),
      flat('c1', 1, 'P', 1),
      flat('c2', 1, 'P', 2),
      flat('Q', 0, null, 3),
      flat('R', 0, null, 4),
    ];

    it('child dragged to a non-parent root row → immediate promote (no X offset)', () => {
      // Active = c1 (originally child of P). Over = Q (a different root).
      // No X offset (offset = 0), no dwell (the algorithm itself does not
      // know about dwell). The "leave original subtree" rule should fire
      // and produce a root-level projection.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'Q',
        0, // dragOffsetX = 0 — explicitly no horizontal intent
        INDENT_STEP_PX,
        true, // pointerBelowOver
        fixtureWithChildAndSiblingRoots, // originalItems
        'P', // originalActiveParentId
      );
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
      expect(result.isInvalid).toBe(false);
    });

    it('child dragged to ANOTHER root that is not its parent → immediate promote even with no X', () => {
      // User example verbatim: "大类别 1 下面有一个子类别 1。如果我把
      // 子类别 1 拖动到它下方的大类别 2 的位置，正常也应该移除它作为
      // 大类别 1 子类别的身份，让它变成一个独立的大类别。"
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'R', // an even further root
        0,
        INDENT_STEP_PX,
        false, // pointerBelowOver doesn't matter — promote short-circuits
        fixtureWithChildAndSiblingRoots,
        'P',
      );
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
    });

    it('child dragged to its ORIGINAL parent → stays child (no spurious promote)', () => {
      // over = P (the original parent itself). Inside the original subtree
      // → keep child status, run standard algorithm.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'P',
        0,
        INDENT_STEP_PX,
        true,
        fixtureWithChildAndSiblingRoots,
        'P',
      );
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('P');
    });

    it('child dragged to a SIBLING (= another child of original parent) → stays child', () => {
      // over = c2 (sibling of c1, both under P). Inside original subtree.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'c2',
        0,
        INDENT_STEP_PX,
        true,
        fixtureWithChildAndSiblingRoots,
        'P',
      );
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('P');
    });

    it('child dragged with NO X offset to a non-parent root → still promotes (no X required)', () => {
      // Symmetric V2 algorithm would have required X >= 12 to register any
      // depth change. V2.1 rejects that — dragOffsetX = 0 is fine.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'Q',
        0,
        INDENT_STEP_PX,
        true,
        fixtureWithChildAndSiblingRoots,
        'P',
      );
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
    });

    it('root dragged to another root WITHOUT X >= 12 → does NOT demote (V2 demote discipline preserved)', () => {
      // Active = Q (root, originalActiveParentId = null). Over = R.
      // Offset = 0 (no horizontal intent). The asymmetric branch must NOT
      // fire (originalActiveParentId is null), and the standard algorithm
      // should keep Q at depth 0.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'Q',
        'R',
        0,
        INDENT_STEP_PX,
        true,
        fixtureWithChildAndSiblingRoots,
        null, // originalActiveParentId = null → root active
      );
      expect(result.depth).toBe(0);
      expect(result.parentId).toBeNull();
    });

    it('root dragged to another root WITH X >= 12 → demotes normally (V2 demote path intact)', () => {
      // Use a fixture where R has a leading row to provide a valid demote
      // anchor: previousItem.depth + 1 = 1 caps maxDepth correctly.
      const items: FlattenedCategory[] = [
        flat('P', 0, null, 0, true),
        flat('c', 1, 'P', 1),
        flat('Q', 0, null, 2),
        flat('R', 0, null, 3),
      ];
      // Drag R below Q with offset +16, pointerBelowOver = true.
      // previousItem = Q (depth 0) → maxDepth = 1. dragDepth = 1 → depth = 1
      // → parentId = Q.
      const result = getProjection(
        items,
        'R',
        'Q',
        16,
        INDENT_STEP_PX,
        true,
        items,
        null, // root active
      );
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('Q');
    });

    it('originalActiveParentId omitted → standard symmetric algorithm runs (back-compat)', () => {
      // No 8th argument → pre-V2.1 callers (legacy unit tests, keyboard
      // drags where the host hasn't wired this through yet) get the
      // standard projection.
      const result = getProjection(
        fixtureWithChildAndSiblingRoots,
        'c1',
        'Q',
        0,
        INDENT_STEP_PX,
        true,
        fixtureWithChildAndSiblingRoots,
        // originalActiveParentId omitted
      );
      // Standard algorithm: previousItem=Q (depth 0), nextItem=R (depth 0),
      // maxDepth=1, minDepth=0, dragDepth=0 (offset 0 < threshold) →
      // projectedDepth = 1 + 0 = 1, depth = clamp(1, 0, 1) = 1, parent = Q.
      expect(result.depth).toBe(1);
      expect(result.parentId).toBe('Q');
    });
  });
});

// ---------------------------------------------------------------------------
// getChildCount
// ---------------------------------------------------------------------------

describe('getChildCount', () => {
  it('returns 0 for an id not in the list', () => {
    const items = [flat('a', 0, null, 0)];
    expect(getChildCount(items, 'missing')).toBe(0);
  });

  it('returns 0 for a leaf (no children)', () => {
    const items = [flat('leaf', 0, null, 0)];
    expect(getChildCount(items, 'leaf')).toBe(0);
  });

  it('counts the number of immediate children', () => {
    const items = [
      flat('p', 0, null, 0, true),
      flat('c1', 1, 'p', 1),
      flat('c2', 1, 'p', 2),
      flat('c3', 1, 'p', 3),
    ];
    expect(getChildCount(items, 'p')).toBe(3);
  });

  it('does not count grandchildren (MAX_DEPTH=1 invariant)', () => {
    // Even if a malformed input has a grandchild, getChildCount should
    // count immediate children only.
    const items = [
      flat('root', 0, null, 0, true),
      flat('mid', 1, 'root', 1),
      flat('grand', 2, 'mid', 2), // illegal; defensive
    ];
    expect(getChildCount(items, 'root')).toBe(1);
  });
});
