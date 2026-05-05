/**
 * Tree utilities for the depth-2 hierarchical Categories sidebar.
 *
 * Single-SortableContext + projected-depth model — flatten the
 * `parentId`-based Category list into a 1D ordered list of
 * `FlattenedCategory` rows, then compute a projected `{depth, parentId}`
 * from horizontal drag offset. Mirrors the dnd-kit official Sortable Tree
 * example with three project-specific hard caps:
 *
 * 1. `MAX_DEPTH = 1` — depth 0 = root, depth 1 = child; depth 2 forbidden.
 *    See `02_design_spec.md` V2 §6.5 + `03_tech_plan.md` V2 §2.3.
 * 2. Parent (root with children) cannot become a child of another parent
 *    (D5 = B-1: `02_design_spec.md` V2 §2.13). Surfaced via `isInvalid`.
 * 3. `ABS_X_THRESHOLD_PX = 12` — explicit horizontal threshold for
 *    "demote/promote intent" before any depth change is computed
 *    (`02_design_spec.md` V2 §6.3 / `03_tech_plan.md` V2 §5.1.A).
 *
 * Design references:
 * - `02_design_spec.md` V2 §2.7 (drop indicator), §2.14 (dwell), §2.15
 *   (expanded set), §6.3 (12px threshold), §6.5 (max depth=2).
 * - `03_tech_plan.md` V2 §5.1.A (this file's complete API), §6.1 (single
 *   SortableContext + projection mode), §6.2 (parent-drag handling).
 * - `01_research/r2_dnd_tree_architecture.md` §2.2-2.3 (dnd-kit
 *   official Tree example解构) — the reference implementation.
 *
 * Third-party source verification (per
 * `verify-third-party-behavior-firsthand` rule):
 * - `arrayMove<T>(array: T[], from: number, to: number): T[]` —
 *   `node_modules/@dnd-kit/sortable/dist/utilities/arrayMove.d.ts:4`.
 * - `UniqueIdentifier = string | number` —
 *   `node_modules/@dnd-kit/core/dist/types/index.d.ts` (re-exported via
 *   `@dnd-kit/core`).
 * - dnd-kit official Tree example `getProjection` algorithm —
 *   `https://github.com/clauderic/dnd-kit/blob/master/stories/3 - Examples/Tree/utilities.ts:6-65`
 *   (forms the basis of `getProjection` below; we add MAX_DEPTH clamp +
 *   ABS_X_THRESHOLD_PX gate + D5 invalid detection).
 */

import type { UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Category } from '@/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Hard cap on hierarchy depth. `depth = 0` is root, `depth = 1` is child.
 * `depth = 2` is forbidden by both backend `validate_hierarchy` and this
 * utility's clamp. See `02_design_spec.md` V2 §6.5.
 */
export const MAX_DEPTH = 1;

/**
 * Visual indent step per depth level, in CSS pixels. Mirrors the
 * `--indent-step: 16px` token introduced in `03_tech_plan.md` V2 §7.1
 * and is the default `indentationWidth` for `getProjection` /
 * `makeTreeKeyboardCoordinates`.
 */
export const INDENT_STEP_PX = 16;

/**
 * Horizontal drag offset (absolute value, in CSS pixels) below which we do
 * not register any depth-change intent at all. Lock-stepped with the
 * design spec "12px X threshold + 80ms dwell" rule
 * (`02_design_spec.md` V2 §6.3).
 *
 * Why explicit: a naive `Math.round(offset / 16)` flips at 8px, which is
 * sub-perceptual and causes nervous depth flicker. The 12px gate ensures
 * the user has expressed deliberate horizontal intent before any depth
 * commit is even considered.
 */
export const ABS_X_THRESHOLD_PX = 12;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A category row materialised into the flat 1D list consumed by the
 * single SortableContext. Carries enough information for the row
 * component to render (`depth`, `hasChildren`, `collapsed`) without
 * re-walking the parent graph for every render.
 *
 * Why `Omit<Category, 'parentId'> & {...}` rather than `extends Category`:
 *   `Category.parentId` is declared as `parentId?: string` (i.e.
 *   `string | undefined`); we narrow it to the always-present `string |
 *   null` here so flatten output never has the optional/undefined ambiguity.
 *   `extends Category` would emit a TS2430 since `null` is not assignable
 *   to `string | undefined`. `Omit` + intersection sidesteps the variance
 *   conflict while preserving every other Category field (id, name,
 *   color, count) verbatim.
 *
 * Field semantics:
 * - `parentId`: `null` for root rows; `string` for children. Always
 *   present (non-optional) on a `FlattenedCategory` — flattening normalises
 *   missing/undefined parents to `null`.
 * - `depth`: `0` for root, `1` for child. Always within `[0, MAX_DEPTH]`.
 * - `index`: visual position in the flattened list (0-based). Useful for
 *   announcements and accessibility positioning ("position 3 of 7").
 * - `hasChildren`: `true` only for root rows that have at least one child.
 *   Children always have `false` because `MAX_DEPTH = 1` forbids grandchildren.
 * - `collapsed`: `true` when the row is a parent whose children are
 *   currently hidden. Always `false` for child rows.
 */
export type FlattenedCategory = Omit<Category, 'parentId'> & {
  parentId: string | null;
  depth: number;
  index: number;
  hasChildren: boolean;
  collapsed: boolean;
};

/**
 * Result of `getProjection`. The caller (UI) uses `depth` + `parentId` to
 * render the drop indicator wrapper's `paddingLeft` and to compute the
 * final `setCategoryParent` IPC payload at drop time. `isInvalid` is
 * surfaced when the user's horizontal gesture *intends* a depth change
 * that we cannot honour (D5 = B-1: parent → child of another parent),
 * which the UI translates to DragOverlay `opacity: 0.5` +
 * `cursor: not-allowed` per `02_design_spec.md` V2 §2.14.
 */
export interface Projection {
  depth: number;
  parentId: string | null;
  /** True iff the projection violates D5 (parent root with children
   *  cannot become a child of another root). UI renders this as the
   *  "cancel snap-back invalid" visual state. */
  isInvalid: boolean;
}

// ---------------------------------------------------------------------------
// flattenTree
// ---------------------------------------------------------------------------

/**
 * Flatten a `parentId`-graph `Category[]` into a depth-aware 1D list,
 * preserving sibling order. Root-level categories appear in their input
 * `Vec` order; children of each root appear directly after their parent
 * (also in their input `Vec` order).
 *
 * `expandedSet` semantics (per `02_design_spec.md` V2 §2.15):
 * - A parent id is "expanded" iff it appears in `expandedSet`.
 * - When a parent is expanded, its children rows are emitted right after
 *   it in the flattened list.
 * - When a parent is collapsed, its children are *omitted* (not just
 *   hidden by CSS) so they don't participate in collision detection. See
 *   spec §2.15 "折叠态 children 不渲染".
 * - During an active drag, the caller may pass
 *   `expandedSet ∪ allParentIdsAlongDragPath` to temporarily auto-expand
 *   ancestors near the drag path (P1-11 fix).
 *
 * Defensive semantics:
 * - A child whose `parentId` points to a non-existent root is dropped from
 *   the output (orphan defence). The backend `validate_hierarchy` catches
 *   this; the helper just doesn't crash.
 * - `MAX_DEPTH = 1` is enforced by structure: children of children are
 *   never reached because we only emit children of root entries.
 *
 * Complexity: O(N) — one pass to bucket children by parent, one pass to
 * emit roots + their children.
 */
export function flattenTree(categories: Category[], expandedSet: Set<string>): FlattenedCategory[] {
  if (categories.length === 0) return [];

  // Build children-by-parent index in one pass. Skip nullish parentIds.
  const childrenByParent = new Map<string, Category[]>();
  for (const cat of categories) {
    const pid = cat.parentId;
    if (pid == null) continue; // null or undefined → root
    const existing = childrenByParent.get(pid);
    if (existing) {
      existing.push(cat);
    } else {
      childrenByParent.set(pid, [cat]);
    }
  }

  const result: FlattenedCategory[] = [];
  let index = 0;

  for (const cat of categories) {
    if (cat.parentId != null) continue; // children rendered below their parent

    const children = childrenByParent.get(cat.id) ?? [];
    const collapsed = children.length > 0 && !expandedSet.has(cat.id);

    result.push({
      ...cat,
      parentId: null,
      depth: 0,
      index: index++,
      hasChildren: children.length > 0,
      collapsed,
    });

    if (!collapsed) {
      for (const child of children) {
        result.push({
          ...child,
          parentId: cat.id,
          depth: 1,
          index: index++,
          // MAX_DEPTH = 1 → child cannot itself have children.
          hasChildren: false,
          collapsed: false,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// buildTree (inverse of flattenTree)
// ---------------------------------------------------------------------------

/**
 * Inverse of `flattenTree`: rebuild the canonical `Category[]` shape
 * from a `FlattenedCategory[]`, preserving the order in which entries
 * appear in the flattened list. Used after a drop to derive the
 * `(parentId)` that each row should carry, given the new flat ordering.
 *
 * Behaviour:
 * - Each output `Category` retains all original Category fields
 *   (name, color, count) and gains a `parentId` field reflecting the
 *   row's flattened-list parent.
 * - Output order matches input order — flattened ordering encodes
 *   siblings-after-parent, so the resulting list is suitable for direct
 *   assignment to `data.json` `Vec<Category>`.
 *
 * Note: `count` is *not* recomputed here — that's the caller's job
 * (`MainLayout.categoriesWithCounts`). This helper only handles
 * structural reshape.
 */
export function buildTree(flat: FlattenedCategory[]): Category[] {
  // Strip the flatten-only fields (depth/index/hasChildren/collapsed) and
  // keep parentId — the caller will normalise null → undefined when
  // writing to data.json (Rust `Option<String>` round-trips through JSON
  // as missing key when None). Explicit field projection avoids relying
  // on rest-spread quirks.
  return flat.map(({ id, name, color, count, parentId }) => ({
    id,
    name,
    color,
    count,
    // null → undefined so the resulting Category matches the
    // `parentId?: string` shape (root rows have no `parentId` key, rather
    // than an explicit `null`).
    ...(parentId === null ? {} : { parentId }),
  }));
}

// ---------------------------------------------------------------------------
// removeChildrenOf
// ---------------------------------------------------------------------------

/**
 * During an active drag, hide the children of the dragged node so they
 * do not become drop targets (the parent + its subtree should look like
 * a single unit being moved). Mirrors the dnd-kit Sortable Tree example
 * pattern — see `01_research/r2_dnd_tree_architecture.md` §2.5.
 *
 * Behaviour:
 * - Returns a *new* array (no mutation).
 * - Removes any item whose `parentId` is in `hideParentIds`.
 * - Preserves the relative order of all surviving items.
 * - Tolerant of `UniqueIdentifier` (string | number) — coerces to string
 *   for comparison since `parentId` is always a string in our domain.
 *
 * Defensive: if `hideParentIds` is empty, returns the original array
 * unchanged (no allocation in the common no-op case).
 */
export function removeChildrenOf(
  items: FlattenedCategory[],
  hideParentIds: UniqueIdentifier[],
): FlattenedCategory[] {
  if (hideParentIds.length === 0) return items;
  const hideSet = new Set(hideParentIds.map(String));
  return items.filter((item) => {
    if (item.parentId == null) return true;
    return !hideSet.has(item.parentId);
  });
}

// ---------------------------------------------------------------------------
// getProjection
// ---------------------------------------------------------------------------

/**
 * Compute the projected `{depth, parentId}` for the dragged item given
 * the current pointer position (`overId`), accumulated horizontal offset
 * (`dragOffsetX`), and — when available — which side of `over` the active
 * item is being dragged towards (`pointerBelowOver`). Augments the dnd-kit
 * Sortable Tree example algorithm (`01_research/r2_dnd_tree_architecture.md`
 * §2.3) with five project-specific changes:
 *
 * 1. `MAX_DEPTH = 1` clamp — depth 2 forbidden by D2 (parent + child
 *    only; no grandchildren).
 * 2. `ABS_X_THRESHOLD_PX = 12` gate — under naive `Math.round(offset/16)`
 *    the threshold is 8px, sub-perceptual; we use `floor + sign + threshold`
 *    so 12px is the actual transition point. See
 *    `02_design_spec.md` V2 §6.3.
 * 3. D5 invalid detection — if the active item is a *root with children*
 *    and the projection would demote it (depth > 0), we clamp depth back
 *    to 0 and set `isInvalid: true`. The UI surfaces this as
 *    `opacity: 0.5` + `cursor: not-allowed` per `02_design_spec.md`
 *    V2 §2.13/§2.14.
 * 4. **Position-aware neighbour resolution** (Bug fix 2026-05-04):
 *    The official dnd-kit Tree example computes `previousItem` /
 *    `nextItem` via `arrayMove(items, activeIdx, overIdx)`. That works
 *    only when `over` is selected by a strict-ordering algorithm. With
 *    `closestCenter` (which we use for visual snap consistency), `over`
 *    is the geometrically nearest droppable — which can be one row past
 *    the user's perceived target when the active row's visible center
 *    crosses `over.center.y`. The result was that dragging A "below B"
 *    (visual intent: become child of B) selected `over=C` and made A a
 *    child of C; dragging A "above B" selected `over=B` and made A a
 *    child of B. Both invert the Things 3 / Linear / Notion convention
 *    that the row visually ABOVE the insertion gap is the parent
 *    candidate.
 *
 *    The `pointerBelowOver` parameter, when supplied, replaces the
 *    `arrayMove`-based neighbour computation with an explicit
 *    insert-position model:
 *    - `pointerBelowOver === true` → insert AFTER over → previousItem = over.
 *    - `pointerBelowOver === false` → insert BEFORE over → previousItem =
 *      items[overIdx - 1] (skipping active if it sits in that slot).
 *    When `pointerBelowOver === undefined` (e.g. keyboard drags where no
 *    pointer position exists), the legacy `arrayMove` path is used. See
 *    `02_design_spec.md` V2 §2.7 for the position-aware drop indicator
 *    that consumes this projection.
 *
 * 5. **Asymmetric promote / demote semantics** (V2.1 micro-revision
 *    2026-05-05, user feedback):
 *    - **promote (child → root)** is the user *undoing* a prior demote;
 *      it must trigger as soon as the user moves the row *out of its
 *      original parent's subtree region*, with NO X offset and NO dwell
 *      requirement. Concretely: if the active row is currently a child
 *      and `over` is anywhere outside `{originalParent, sibling-of-active,
 *      active itself}`, promote immediately (depth=0, parentId=null).
 *      User original phrasing: "拖动到下方的大类别 2 的位置，正常也应该
 *      移除它作为大类别 1 子类别的身份"; "只要移除出它原本子类别的位置
 *      （比如移动到父类别的正上方），就应该能够正常解除".
 *    - **demote (root → child)** retains the full discipline: 12 px X
 *      offset *and* 80 ms dwell. demote is a *new* hierarchy commitment
 *      from the user — it deserves explicit horizontal intent + an
 *      intentional pause; promote does not, because the user is reverting
 *      a prior commitment.
 *
 *    The asymmetry is carried by the new `originalActiveParentId`
 *    parameter (10th arg). When supplied AND non-null (i.e. active is a
 *    pre-drag child), the algorithm short-circuits the standard X-offset
 *    path with the "leave-original-subtree" rule above. When `null` or
 *    omitted, the standard symmetric algorithm runs (legacy callers,
 *    keyboard drags where active is root, unit tests).
 *
 * Edge cases:
 * - `activeId` not found in `items` → `{ depth: 0, parentId: null,
 *   isInvalid: false }` (defensive no-op; should never happen in practice).
 * - `overId === activeId` (mouse path with `pointerBelowOver` known): the
 *   active row is the over — fall through to the legacy `arrayMove` path,
 *   which yields a no-op projection at the row's current depth.
 *
 * Complexity: O(N) — two `findIndex` walks plus optionally one `arrayMove`
 * slice (which is also O(N)). For N ≤ 50 this is well under a millisecond.
 */
export function getProjection(
  items: FlattenedCategory[],
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  dragOffsetX: number,
  indentationWidth: number = INDENT_STEP_PX,
  pointerBelowOver?: boolean,
  /**
   * Source list for the D5 `activeHasChildren` detection. Defaults to
   * `items`, which is correct when callers pass the full flat tree. The
   * real production caller (SortableCategoriesList) passes `displayFlat`
   * — a tree where the active item's children have been
   * `removeChildrenOf`-stripped — so without this dedicated parameter
   * the children check would always read `false` and D5 never fires
   * (a parent-with-children could be wrongly demoted, the backend then
   * rejects with `Cannot demote a category that has children` and the
   * UI snaps back). Pass `baseFlat` (the pre-strip list) here.
   * Bug fix 2026-05-05.
   */
  originalItems?: FlattenedCategory[],
  /**
   * The active row's parent id *before* the drag started (snapshotted at
   * onDragStart from the canonical `categories` list). When supplied and
   * non-null, enables the asymmetric promote semantics described in the
   * function doc point 5: any `over` row outside the original parent's
   * subtree triggers an immediate promote, no X offset / dwell required.
   *
   * Why a separate parameter rather than reading from `originalItems`:
   * the active row might already exist with a *new* projected parentId
   * in `items` (the position-aware mode shifts neighbours under it
   * mid-drag). Without an explicit pre-drag snapshot, the "still in
   * original subtree" check would self-confirm whatever the projection
   * just decided, defeating the asymmetry.
   *
   * V2.1 micro-revision 2026-05-05.
   */
  originalActiveParentId?: string | null,
): Projection {
  const overItemIndex = items.findIndex(({ id }) => id === overId);
  const activeItemIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeItemIndex];
  if (!activeItem || overItemIndex === -1) {
    return { depth: 0, parentId: null, isInvalid: false };
  }

  // -----------------------------------------------------------------------
  // Asymmetric promote (V2.1 2026-05-05) — fires before any X-offset /
  // depth-projection logic. Only applies when active was a pre-drag CHILD.
  // -----------------------------------------------------------------------
  // User feedback verbatim (2026-05-05):
  //   "磁吸力太强了… 移动到正上方时就能自然地移除子类别状态。"
  //   "无论移动到多远的位置都不行，必须同时向右移动才能解除子类别状态。
  //    但正常来说，只要移除出它原本子类别的位置（比如移动到父类别的正
  //    上方），就应该能够正常解除。"
  //
  // Implementation: the "original subtree region" is exactly:
  //   {originalParent, sibling-of-active (= other children of originalParent),
  //    active itself}
  // — *not* a coordinate band, *not* a vertical range. Whenever `over` is
  // any row outside this set, the user has visually moved out of the
  // original parent's territory and promotion is the correct response.
  //
  // We deliberately keep the parent row itself *inside* the subtree set
  // (over === originalParent) so that a child dragged "back into" its
  // parent (e.g. visual hover over the parent header) reads as a same-
  // parent reorder, not a redundant promote-then-demote oscillation.
  if (originalActiveParentId != null && originalActiveParentId !== '') {
    const overItem = items[overItemIndex];
    const overInOriginalSubtree =
      // over is the active row itself — drag hasn't moved out of own slot.
      String(overItem.id) === String(activeId) ||
      // over is the original parent row — still inside original subtree.
      String(overItem.id) === originalActiveParentId ||
      // over is a sibling (= another child of originalParent).
      overItem.parentId === originalActiveParentId;

    if (!overInOriginalSubtree) {
      // Outside original subtree → immediate promote, no X / dwell needed.
      return { depth: 0, parentId: null, isInvalid: false };
    }
    // Inside original subtree → fall through to the standard algorithm
    // below, which handles same-parent reorder (depth=1, parentId=originalParent).
  }

  // Resolve previousItem / nextItem in one of two modes. The "position-aware"
  // mode (pointerBelowOver supplied, over !== active) anchors on the
  // user-perceived insertion gap; the "legacy" mode falls back to the
  // dnd-kit Tree example pattern, which is correct for keyboard drags and
  // for the over === active edge case where there is no insertion gap.
  let previousItem: FlattenedCategory | undefined;
  let nextItem: FlattenedCategory | undefined;
  // For getParentId's "walk back to find ancestor at depth" lookup we need
  // a sequence + start index. The position-aware mode walks `items` from
  // the row above the insertion gap; the legacy mode keeps the original
  // arrayMove'd `newItems` walk.
  let walkBackArray: FlattenedCategory[];
  let walkBackStartIdx: number; // exclusive — walk from this index - 1 downwards.

  const positionAware = pointerBelowOver !== undefined && activeItemIndex !== overItemIndex;

  if (positionAware) {
    if (pointerBelowOver) {
      // Insert AFTER over. previousItem = over; nextItem = the row below
      // over (skipping active itself if it occupies that slot).
      previousItem = items[overItemIndex];
      let nextIdx = overItemIndex + 1;
      if (nextIdx === activeItemIndex) nextIdx += 1;
      nextItem = nextIdx < items.length ? items[nextIdx] : undefined;
      walkBackArray = items;
      walkBackStartIdx = overItemIndex + 1; // walk from overItemIndex downwards.
    } else {
      // Insert BEFORE over. previousItem = the row above over (skipping
      // active if it sits there); nextItem = over itself.
      let prevIdx = overItemIndex - 1;
      if (prevIdx === activeItemIndex) prevIdx -= 1;
      previousItem = prevIdx >= 0 ? items[prevIdx] : undefined;
      nextItem = items[overItemIndex];
      walkBackArray = items;
      walkBackStartIdx = prevIdx + 1; // walk from prevIdx downwards.
    }
  } else {
    // Legacy path (keyboard drags, or over === active edge case).
    const newItems = arrayMove(items, activeItemIndex, overItemIndex);
    previousItem = newItems[overItemIndex - 1];
    nextItem = newItems[overItemIndex + 1];
    walkBackArray = newItems;
    walkBackStartIdx = overItemIndex;
  }

  // Threshold gate: |offset| < 12 → no horizontal intent at all → dragDepth=0.
  // Above the threshold, `floor` (not `round`) makes 12px the actual
  // transition boundary. Then clamp the magnitude to MAX_DEPTH so a wild
  // horizontal swing can't propose depth > 1.
  let dragDepth = 0;
  if (Math.abs(dragOffsetX) >= ABS_X_THRESHOLD_PX) {
    const magnitude = Math.min(MAX_DEPTH, Math.floor(Math.abs(dragOffsetX) / indentationWidth));
    dragDepth = Math.sign(dragOffsetX) * magnitude;
  }
  const projectedDepth = activeItem.depth + dragDepth;

  // Cap by MAX_DEPTH and the previousItem-derived neighbour cap (a row
  // can be at most one level deeper than the row above it — otherwise we'd
  // propose a depth-2 leaf next to a depth-0 root, which is malformed).
  const previousDerivedMax = previousItem ? previousItem.depth + 1 : 0;
  const maxDepth = Math.min(MAX_DEPTH, previousDerivedMax);
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (depth > maxDepth) depth = maxDepth;
  if (depth < minDepth) depth = minDepth;
  if (depth < 0) depth = 0;

  // D5 invalid: a root with children cannot become a child of another root.
  // Detected from the *original* items list — children carry a `parentId`
  // pointing at the active id. NB: in production the caller passes
  // `displayFlat` for `items` (which has had the active subtree's children
  // stripped via `removeChildrenOf`), so we read the children-presence flag
  // from `originalItems` (= `baseFlat`) when supplied. Falling back to
  // `items` keeps backwards compatibility with unit tests that pass a
  // single flat list.
  const activeIdStr = String(activeItem.id);
  const childSource = originalItems ?? items;
  const activeHasChildren = childSource.some(
    (it) => it.parentId != null && it.parentId === activeIdStr,
  );
  const isParentBecomingChild = activeItem.depth === 0 && depth > 0 && activeHasChildren;
  if (isParentBecomingChild) {
    depth = 0;
  }

  return {
    depth,
    parentId: getParentId(),
    isInvalid: isParentBecomingChild,
  };

  /**
   * Resolve the parent id for the chosen depth, mirroring the dnd-kit
   * Tree example logic but using the position-aware previousItem when
   * `pointerBelowOver` is supplied:
   * - depth = 0 or no previous neighbour → root (parentId = null)
   * - depth equals previous's depth → share its parentId
   * - depth is exactly previous's depth + 1 → previous becomes parent
   * - otherwise → walk back to find a row at the target depth and inherit
   *   its parentId
   */
  function getParentId(): string | null {
    if (depth === 0 || !previousItem) return null;
    if (depth === previousItem.depth) return previousItem.parentId;
    if (depth > previousItem.depth) return String(previousItem.id);
    for (let i = walkBackStartIdx - 1; i >= 0; i -= 1) {
      const candidate = walkBackArray[i];
      // In position-aware mode, walkBackArray === items (which still
      // contains active). Skip active when walking back so we never use
      // its parentId as the inherited ancestor.
      if (positionAware && String(candidate.id) === activeIdStr) continue;
      if (candidate.depth === depth) return candidate.parentId;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// getChildCount
// ---------------------------------------------------------------------------

/**
 * Count immediate children of a category in the flattened list. Provided
 * for potential DragOverlay "+N" badge usage (per
 * `01_research/r2_dnd_tree_architecture.md` §2.5 / `02_design_spec.md` V2 §2.6
 * — V2 spec keeps DragOverlay as a single row clone without the badge,
 * but this helper is here for symmetry with the dnd-kit example and
 * potential future use).
 *
 * Edge cases:
 * - `id` not in `items` → returns 0.
 * - `MAX_DEPTH = 1` means the result is at most the number of root-level
 *   categories minus one (defensively).
 */
export function getChildCount(items: FlattenedCategory[], id: UniqueIdentifier): number {
  const idStr = String(id);
  return items.filter((it) => it.parentId === idStr).length;
}
