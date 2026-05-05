/**
 * Hierarchy-aware `KeyboardCoordinateGetter` for the depth-2 Categories
 * sidebar. Extends dnd-kit's default `sortableKeyboardCoordinates`
 * (which only handles ↑/↓ for vertical reorder) with ←/→ to drive
 * promote / demote depth changes during a keyboard-initiated drag.
 *
 * Behaviour (per `02_design_spec.md` V2 §3 keyboard flow):
 * - `↑` / `↓` (and any non-horizontal key): delegate to
 *   `sortableKeyboardCoordinates` for default vertical reorder. dnd-kit's
 *   own implementation calls `event.preventDefault()` for matched
 *   directions (`sortable.esm.js:670`) so we don't need to repeat it here
 *   for the pass-through path.
 * - `←` (Left Arrow): promote — if the projected depth is `> 0` we
 *   shift `currentCoordinates.x` by `-indentationWidth`, which feeds back
 *   into `dragOffsetX` accumulation, drives `getProjection` toward
 *   `depth - 1`, and ultimately surfaces as a child→root demotion at drop
 *   time. Refuses to act when already at root (`depth === 0`).
 * - `→` (Right Arrow): demote — if the projected depth is `< MAX_DEPTH`
 *   *and* the projection is not D5-invalid (parent → child of another
 *   parent), we shift by `+indentationWidth`. Refuses to act when at
 *   max depth or when D5-invalid.
 * - `Space` / `Enter` / `Esc` / `Tab`: not horizontal — fall through to
 *   default.
 *
 * Live-state sharing via `MutableRefObject<TreeSensorContext>` (V2
 * `[P0-ARCH-1]` fix):
 *   The keyboard sensor's coordinate getter is created exactly once via
 *   `useState(() => factory())`. That closure cannot capture the latest
 *   `flattenedItems` / `dragOffsetX` directly without becoming a stale
 *   snapshot. The dnd-kit Sortable Tree example uses a
 *   `MutableRefObject<{items, offset}>` pattern to feed live state into
 *   the closure — `useEffect` syncs the ref on every render, the closure
 *   reads `contextRef.current` on each event. We mirror that pattern.
 *
 * Critical invariant — `dragOffsetX` semantics:
 *   `currentCoordinates.x` from dnd-kit is the *absolute screen x*, not
 *   the accumulated horizontal drag offset. Passing it to `getProjection`
 *   as `dragOffset` would yield `Math.round(absoluteX / 16)` ≈ a huge
 *   number that always clamps to `MAX_DEPTH`, making ←/→ feel
 *   non-responsive (depth pinned to the boundary). We therefore *only*
 *   read the cumulative offset from `contextRef.current.offset`. The host
 *   component is responsible for maintaining that offset (`activator
 *   coordinates − current coordinates`, accumulated across `onDragMove`).
 *
 * Third-party source verification (per
 * `verify-third-party-behavior-firsthand` rule):
 * - `KeyboardCoordinateGetter` signature —
 *   `node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:18-22`
 *   confirms `(event, args) => Coordinates | void` and that
 *   `args.context` is `SensorContext` (with `active: Active | null`,
 *   `over: Over | null`).
 * - `sortableKeyboardCoordinates` calls `event.preventDefault()` for
 *   `[Down, Right, Up, Left]` —
 *   `node_modules/@dnd-kit/sortable/dist/sortable.esm.js:656-670`.
 *   We mirror this for our overridden ←/→ paths to prevent sidebar
 *   container scroll.
 * - `KeyboardCode.Left = 'ArrowLeft'`, `KeyboardCode.Right = 'ArrowRight'` —
 *   `node_modules/@dnd-kit/core/dist/sensors/keyboard/types.d.ts:6-7`.
 * - dnd-kit official Tree `keyboardCoordinates.ts` — the reference
 *   pattern for SensorContext ref + projection-driven coordinates:
 *   `https://github.com/clauderic/dnd-kit/blob/master/stories/3 - Examples/Tree/keyboardCoordinates.ts:42-72`.
 */

import type { MutableRefObject } from 'react';
import { KeyboardCode } from '@dnd-kit/core';
import type { KeyboardCoordinateGetter } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { getProjection, INDENT_STEP_PX, MAX_DEPTH, type FlattenedCategory } from './treeUtilities';

const horizontalKeys: string[] = [KeyboardCode.Left, KeyboardCode.Right];

/**
 * Live state shared between the host component and the closure-stable
 * keyboard coordinate getter. Refreshed via `useEffect` on every render
 * of `SortableCategoriesList` (see `03_tech_plan.md` V2 §5.1.B wiring
 * snippet).
 *
 * `items`: the *currently rendered* flat list (post-`removeChildrenOf`,
 *   post-dragOverrideExpand). Must reflect what the user sees, because
 *   `getProjection` indexes into it via `findIndex`.
 *
 * `offset`: the *accumulated horizontal drag offset* (NOT
 *   `currentCoordinates.x`). For mouse drags, derive from
 *   `event.delta.x` accumulator inside `onDragMove`. For keyboard drags,
 *   the offset is incremented by `±indentationWidth` per ←/→ press —
 *   the host re-syncs `contextRef.current.offset` after each emission.
 */
export interface TreeSensorContext {
  items: FlattenedCategory[];
  offset: number;
}

/**
 * Convenience alias — the type of ref consumers create with `useRef`.
 * Re-exported so call sites can declare the ref's typing without
 * importing `MutableRefObject` separately.
 */
export type TreeSensorContextRef = MutableRefObject<TreeSensorContext>;

/**
 * Build a hierarchy-aware `KeyboardCoordinateGetter` bound to a
 * `MutableRefObject<TreeSensorContext>` for live state and an
 * `indentationWidth` (defaults to `INDENT_STEP_PX` = 16).
 *
 * Returns a closure-stable `KeyboardCoordinateGetter` suitable for
 * passing once into `useState(() => factory(...))` per the dnd-kit
 * keyboard sensor contract.
 */
export function makeTreeKeyboardCoordinates(
  contextRef: TreeSensorContextRef,
  indentationWidth: number = INDENT_STEP_PX,
): KeyboardCoordinateGetter {
  return (event, args) => {
    const { currentCoordinates, context } = args;
    const { active, over } = context;

    // Pass-through for ↑/↓/Space/Enter/Esc/Tab — dnd-kit's default
    // implementation calls `event.preventDefault()` for matched directions
    // and returns the next coordinate based on its own collision walk.
    if (!horizontalKeys.includes(event.code)) {
      return sortableKeyboardCoordinates(event, args);
    }

    // Without an active drag or a defined `over` row we have no projection
    // basis; bail without preventing default so the user can still navigate
    // out of the drag with a stray ←/→.
    if (!active || !over) return undefined;

    // Prevent sidebar container scroll on horizontal drag-mode arrows
    // (mirrors dnd-kit's own `sortableKeyboardCoordinates` at sortable.esm.js:670).
    event.preventDefault();

    // Read live state from the ref — never close over a snapshot, never
    // use `currentCoordinates.x` as the offset (that's an absolute screen
    // coord, not an accumulated drag offset).
    const { items, offset } = contextRef.current;
    const projection = getProjection(items, active.id, over.id, offset, indentationWidth);

    switch (event.code) {
      case KeyboardCode.Left:
        // Promote: child → root. Only valid if there's depth left to give up.
        if (projection.depth > 0) {
          return {
            ...currentCoordinates,
            x: currentCoordinates.x - indentationWidth,
          };
        }
        return undefined;

      case KeyboardCode.Right:
        // Demote: root → child. Refused when already at MAX_DEPTH or when
        // the projection is D5-invalid (parent root with children cannot
        // become a child of another root).
        if (projection.depth < MAX_DEPTH && !projection.isInvalid) {
          return {
            ...currentCoordinates,
            x: currentCoordinates.x + indentationWidth,
          };
        }
        return undefined;

      default:
        return undefined;
    }
  };
}
