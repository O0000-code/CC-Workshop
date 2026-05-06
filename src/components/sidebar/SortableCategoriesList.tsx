import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragCancelEvent,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
  DropAnimation,
  UniqueIdentifier,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';
import type { Category } from '@/types';
import { useAppStore } from '@/stores/appStore';
import { CategoryInlineInput } from './CategoryInlineInput';
import { SortableCategoryRow } from './SortableCategoryRow';
import { DragOverlayCategoryRow } from './DragOverlayCategoryRow';
import { CustomMouseSensor } from './dnd/CustomMouseSensor';
import { snapModifier } from './dnd/snapModifier';
import { makeAnnouncements, sidebarScreenReaderInstructions } from './dnd/announcements';
import { CATEGORY_DROP_ANIMATION } from './dnd/animations';
import {
  ABS_X_THRESHOLD_PX,
  INDENT_STEP_PX,
  flattenTree,
  getVisibleDropIntoProjection,
  getProjection,
  getSubtreeReorderIds,
  isPointerBelowRowCenter,
  removeChildrenOf,
  type FlattenedCategory,
  type Projection,
} from './dnd/treeUtilities';
import { makeTreeKeyboardCoordinates, type TreeSensorContext } from './dnd/treeKeyboardCoordinates';

/**
 * 1D vertical drag-and-drop list container for the sidebar's Categories
 * section — V2 hierarchy-aware (depth=2, parent + child).
 *
 * Single-SortableContext + projected-depth pattern (the dnd-kit official
 * Sortable Tree example, adapted with project-specific MAX_DEPTH=1 +
 * 12px X threshold + 80ms dwell + parent-becoming-child invalidity).
 *
 * Design / architecture references (V2):
 * - `02_design_spec.md` V2 §2.7 (drop indicator wrapper paddingLeft),
 *   §2.14 (dwell state machine OUT/HOVER_NEAR/DROP_INTO_READY), §2.15
 *   (expandedSet localStorage), §3 (keyboard flow), §6.3 (12 px + 80 ms),
 *   §6.5 (max depth=2), §7 (V3 invariants 1-23).
 * - `03_tech_plan.md` V2 §5.2 (this file's complete spec — handler bodies,
 *   useMemo wiring, ref pattern), §6 (dnd-kit tree details), §8 (DndContext
 *   config).
 *
 * V3 invariants preserved (every one of 23):
 *  1. 4 px CustomMouseSensor activation distance — `:115`
 *  2. Two-stage lift (80ms + 120ms) — driven by SortableCategoryRow
 *  3. Multi-layer hsl shadow — `.drag-overlay-row` class (unchanged)
 *  4. 12px Y-axis quadratic snap — `snapModifier` in DndContext modifiers
 *  5. 220ms cascade — `useSortable.transition` in SortableCategoryRow
 *  6. Distance-aware settle — handleDragEnd dropAnimationConfig logic
 *  7. 280ms cancel snap-back — handleDragCancel resets dropAnimationConfig
 *  8. DndContext.modifiers = [snapModifier] only — no restrictToVerticalAxis
 *  9. DragOverlay.modifiers = [restrictToWindowEdges] only
 * 10. CSS tokens reused (--ease-drag, --duration-drag-*); only added --indent-step
 * 11. DATA_MUTEX serialised by backend (frontend just dispatches)
 * 12. categoriesVersion bump in appStore (out of scope here)
 * 13. enqueueReorder serial IPC queue (handled inside appStore)
 * 14. data-no-dnd + CustomMouseSensor — preserved via SortableCategoryRow
 * 15. SortableContext.disabled when isInputMounted — `:209`-style
 * 16. KeyboardSensor + makeTreeKeyboardCoordinates + announcements (with
 *     hierarchy parentMap + expandedSet)
 * 17. prefers-reduced-motion — handled in CSS layer (T4)
 * 18. "Show X more" auto-expand on drag start — preserved
 * 19. justDroppedRef 50ms guard — preserved
 * 20. Refresh button disabled — owned by MainLayout (out of scope here)
 * 21. DragOverlay does not carry inline-row padding — owned by
 *     DragOverlayCategoryRow's hard-coded `px-2.5`
 * 22. closestCenter collision detection — preserved
 * 23. MeasuringStrategy.Always — preserved
 */
interface SortableCategoriesListProps {
  categories: Category[];
  activeCategoryId: string | null;
  editingCategoryId: string | null;
  isAddingCategory: boolean;
  showAll: boolean;
  setShowAll: (show: boolean) => void;
  /** Threshold above which the "Show X more" collapse UI appears.
   *  Counted at the *root level only* per V2 §2.16 — children do not
   *  contribute to the "Show X more" budget. */
  maxVisible: number;
  /**
   * V2 [P0-ARCH-3]: must return a Promise so handleDragEnd can await before
   * computing the next IPC's payload (subtree splice → reorder). Existing
   * MainLayout `handleReorderCategories` is `async` — declared `void` here
   * is structurally compatible (`Promise<void> | void` accepted). We always
   * `await` the result; awaiting a non-Promise is a no-op.
   */
  onReorder: (orderedIds: string[]) => Promise<void> | void;
  /**
   * V2 hierarchy [P0-ARCH-3]: change a category's parent_id. Must return
   * Promise<void> so handleDragEnd can await before re-reading the
   * canonical `categories` from `useAppStore.getState()` and computing the
   * follow-up reorder. Optional — when omitted, all parent-changing drops
   * fall back to a same-level reorder (defensive default; the production
   * call site in MainLayout/Sidebar wires this through to
   * `appStore.moveCategoryToParent`).
   */
  onSetCategoryParent?: (id: string, newParentId: string | null) => Promise<void> | void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCategoryClick: (categoryId: string) => void;
  onCategoryDoubleClick: (categoryId: string) => void;
  onCategoryContextMenu: (category: Category, e: React.MouseEvent) => void;
  onCategoryColorChange: (categoryId: string, color: string) => void;
  onCategorySave: (id: string | null, name: string) => void;
  onCategoryEditCancel: () => void;
}

/** localStorage key for the user's persisted expanded-parent set.
 *  V2 [P0-VIZ-3]: aligned with 02 V2 §2.15 — `set contains id ⇒ expanded`.
 *  Toggle collapsed→expanded = `add(id)`; toggle expanded→collapsed = `delete(id)`. */
const EXPANDED_KEY = 'ensemble.sidebar.expandedCategories';

/** 80 ms dwell timer per 02 V2 §2.14 / 03 V2 §6.4 (HOVER_NEAR → DROP_INTO_READY).
 *  Same numeric value as `--duration-drag-snap` but semantically independent
 *  (snap is a continuous gravity well in the modifier; dwell is a React state
 *  lazy commit). Hardcoded per 02 V2 §5 token table note. */
const DWELL_MS = 80;

function isKeyboardActivator(event: Event | null): boolean {
  return event instanceof KeyboardEvent || event?.type === 'keydown';
}

/** Helper: compute the default-expanded set (every parent that has children).
 *  Matches 02 V2 §2.15 "默认状态 (首次启动 / localStorage 为空) → 全部父类默认展开". */
function computeDefaultExpanded(categories: Category[]): Set<string> {
  const defaults = new Set<string>();
  for (const cat of categories) {
    if (categories.some((c) => c.parentId === cat.id)) {
      defaults.add(cat.id);
    }
  }
  return defaults;
}

/** Read the persisted expanded set from localStorage; on first launch /
 *  parse error, fall back to the default-expanded set. */
function loadExpandedFromLocalStorage(categories: Category[]): Set<string> {
  if (typeof window === 'undefined') return computeDefaultExpanded(categories);
  try {
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x): x is string => typeof x === 'string'));
      }
    }
  } catch {
    // localStorage may be disabled (private browsing) — fall through to default.
  }
  return computeDefaultExpanded(categories);
}

/** Persist the expanded set to localStorage. Silent on failure (private
 *  browsing / disabled storage). */
function persistExpanded(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export function SortableCategoriesList({
  categories,
  activeCategoryId,
  editingCategoryId,
  isAddingCategory,
  showAll,
  setShowAll,
  maxVisible,
  onReorder,
  onSetCategoryParent,
  onDragStart,
  onDragEnd,
  onCategoryClick,
  onCategoryDoubleClick,
  onCategoryContextMenu,
  onCategoryColorChange,
  onCategorySave,
  onCategoryEditCancel,
}: SortableCategoriesListProps) {
  // ------------------------------------------------------------------
  // Drag state — V3 baseline + V2 hierarchy additions
  // ------------------------------------------------------------------

  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  /** Accumulated horizontal drag offset (event.delta.x). Drives
   *  getProjection's depth computation — NOT the absolute screen coord. */
  const [offsetLeft, setOffsetLeft] = useState(0);
  /**
   * Whether the actual pointer is currently below the over row's center.
   * Drives the position-aware `previousItem` / `nextItem` resolution in
   * `getProjection` — see the position-aware mode docs in
   * `dnd/treeUtilities.ts`. `null` = unknown (no active drag, keyboard
   * drag, or over === active).
   */
  const [pointerBelowOver, setPointerBelowOver] = useState<boolean | null>(null);
  const [isKeyboardDrag, setIsKeyboardDrag] = useState(false);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerCurrentRef = useRef<{ x: number; y: number } | null>(null);
  /** True for the single frame after this row was just dropped. The 50 ms
   *  guard window in handleDragEnd covers the React render after drop +
   *  the synthetic click that fires on mouseup. V3 invariant #19. */
  const [justDroppedId, setJustDroppedId] = useState<UniqueIdentifier | null>(null);
  /** Distance-aware drop animation per V3 §2.6 (invariant #6) — recomputed
   *  on each drag end based on travel distance. `null` means skip the
   *  drop animation entirely (used when snap has aligned within 4 px). */
  const [dropAnimationConfig, setDropAnimationConfig] = useState<DropAnimation | null>(
    CATEGORY_DROP_ANIMATION,
  );

  // V2 [P0-VIZ-3 / 02 V2 §2.15]: expandedSet semantics — set contains id ⇒
  // expanded. Default at first launch: every parent with children. Lazy
  // initialiser only runs once on mount.
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() =>
    loadExpandedFromLocalStorage(categories),
  );
  // V2 [P1-11 / Reviewer F P1-F7]: when true, the render path uses an
  // override set that contains every parent-with-children, so collapsed
  // parents temporarily auto-expand for the duration of the drag. Does NOT
  // mutate persisted expandedSet.
  const [dragOverrideExpand, setDragOverrideExpand] = useState(false);

  // V2 [P0-VIZ-4 / 02 V2 §2.14]: dwell state machine. dwellState is the
  // user-perceptible state; the timer ref is the actual `setTimeout` handle
  // (may be null = idle). dwellOverIdRef tracks which `over.id` the timer
  // is currently armed against, for "over row changed" detection.
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dwellOverIdRef = useRef<UniqueIdentifier | null>(null);
  const [dwellState, setDwellState] = useState<'OUT' | 'HOVER_NEAR' | 'DROP_INTO_READY'>('OUT');
  // Bug fix 2026-05-05 (P0-1 — Maximum update depth): handleDragMove reads
  // the dwell state via a ref rather than the React-state closure, so the
  // closure is no longer recreated by every render. This eliminates a class
  // of feedback loops where:
  //   1. dnd-kit fires onDragMove → setOffsetLeft + conditional setDwellState
  //   2. React re-renders → new handleDragMove closure → new
  //      `dwellState === 'HOVER_NEAR'` branch reads the previous render's
  //      stale value
  //   3. The branch sets state again (HOVER_NEAR ↔ OUT flap) → infinite render
  // Also lets us bail out cheaply when state would not change.
  const dwellStateRef = useRef<'OUT' | 'HOVER_NEAR' | 'DROP_INTO_READY'>('OUT');
  useEffect(() => {
    dwellStateRef.current = dwellState;
  }, [dwellState]);

  useEffect(() => {
    if (activeId === null || isKeyboardDrag) return;

    const updatePointer = (event: Event) => {
      const coordinates = getEventCoordinates(event);
      if (coordinates) {
        pointerCurrentRef.current = coordinates;
      }
    };

    document.addEventListener('mousemove', updatePointer, { capture: true });
    document.addEventListener('touchmove', updatePointer, { capture: true, passive: true });

    return () => {
      document.removeEventListener('mousemove', updatePointer, { capture: true });
      document.removeEventListener('touchmove', updatePointer, { capture: true });
    };
  }, [activeId, isKeyboardDrag]);

  // V2 [P1-4 final-audit fix]: cursor onto the latest projected drop target
  // for the active row. Read by `makeAnnouncements` at drop time so the
  // SR announcement can phrase "promoted to root level" / "moved to child
  // of {parent}" / "moved to root level" correctly. Mutated synchronously
  // in handleDragMove (post-projection) and reset to null in handleDragStart
  // / handleDragEnd / handleDragCancel.
  const dropProjectionRef = useRef<{
    activeId: string;
    oldParentId: string | null;
    newParentId: string | null;
  } | null>(null);

  // The last projection that was actually represented by the blue
  // drop-into indicator. This is the single source of truth for committing
  // root→child drops: if the user saw the indicator, releasing must commit;
  // if they did not see it, release must not invent a hidden parent change.
  const visibleDropIntoProjectionRef = useRef<Projection | null>(null);

  // ------------------------------------------------------------------
  // Derived state — flatten + projection + sortedIds
  // ------------------------------------------------------------------

  // Effective expanded set during a drag: when dragOverrideExpand is true,
  // every parent-with-children is treated as expanded so the user can drop
  // into rows that were collapsed at drag start. Outside drag, the
  // persisted expandedSet wins.
  const effectiveExpandedSet = useMemo<Set<string>>(() => {
    if (!dragOverrideExpand) return expandedSet;
    const all = new Set<string>(expandedSet);
    for (const cat of categories) {
      if (categories.some((c) => c.parentId === cat.id)) {
        all.add(cat.id);
      }
    }
    return all;
  }, [categories, expandedSet, dragOverrideExpand]);

  // baseFlat = flatten with effectiveExpandedSet but WITHOUT removeChildrenOf.
  // baseFlat is what the SortableContext.items list is built from (every
  // visible row, including children of the active item) and what we hand to
  // makeTreeKeyboardCoordinates. handleDragEnd ALSO uses baseFlat (via
  // baseFlatRef) for subtree splice — never the displayFlat below, which
  // drops the active item's children.
  const baseFlat = useMemo<FlattenedCategory[]>(
    () => flattenTree(categories, effectiveExpandedSet),
    [categories, effectiveExpandedSet],
  );

  // displayFlat = baseFlat with the active item's children hidden (per the
  // dnd-kit Sortable Tree example pattern, R2 §2.5). Children of a dragged
  // parent should not be drop targets — the parent + subtree are conceptually
  // a single unit moving together. When activeId is null (no drag), this is
  // identical to baseFlat.
  //
  // V2 [P0-ARCH-2]: this is the list we render. We do NOT use it as the
  // source of truth in handleDragEnd — that path uses baseFlatRef so the
  // splice can re-emit the children adjacent to their parent.
  const displayFlat = useMemo<FlattenedCategory[]>(() => {
    if (activeId === null) return baseFlat;
    return removeChildrenOf(baseFlat, [activeId]);
  }, [baseFlat, activeId]);

  // Ref for handleDragEnd subtree splice (V2 [P0-ARCH-2]). Kept in sync
  // with baseFlat via useEffect so the handler closure always reads the
  // most recent value without re-creating itself on every render.
  const baseFlatRef = useRef<FlattenedCategory[]>(baseFlat);
  useEffect(() => {
    baseFlatRef.current = baseFlat;
  }, [baseFlat]);

  // Active row's *original* parent (pre-drag). Used for two things:
  //
  //   1. Indicator gating: the user-facing contract is "indicator visible ⇔
  //      drop will commit a setCategoryParent IPC ⇔ row becomes a child".
  //      When the projection's parentId equals the active row's existing
  //      parentId (same-level reorder, no hierarchy intent), the indicator
  //      must NOT render.
  //
  //   2. Asymmetric promote (V2.1 2026-05-05): passed as the 8th argument
  //      `originalActiveParentId` to `getProjection`. When non-null, the
  //      algorithm short-circuits to "promote on leaving the original
  //      subtree" — fires immediately when `over` is outside
  //      {originalParent, sibling, self}, with no X offset / dwell.
  //
  // Read from the canonical `categories` (NOT displayFlat, which strips
  // the active subtree's children) so the value is stable across the full
  // drag and survives any in-flight reflow of `displayFlat`.
  //
  // Declaration ordering: this useMemo and `isChildActive` below MUST be
  // declared *before* the `projected` useMemo because `projected` reads
  // both. JavaScript `let`/`const` block-scoped TDZ would otherwise throw.
  const activeOriginalParentId = useMemo<string | null>(() => {
    if (activeId === null) return null;
    const cat = categories.find((c) => c.id === String(activeId));
    return cat?.parentId ?? null;
  }, [activeId, categories]);

  // Whether the currently-active row was a CHILD before the drag started.
  // Drives two asymmetric-semantics gates:
  //   (a) `projected` useMemo skips the `dwellState === 'OUT'` early-return,
  //       so the "leave original subtree → promote" projection materialises
  //       the moment over.id changes (no dwell delay).
  //   (b) `handleDragEnd` recomputes `finalProjection` regardless of dwell
  //       state, so an immediate-promote drop commits even if the user
  //       released before the 80 ms HOVER_NEAR / DROP_INTO_READY window.
  const isChildActive = activeOriginalParentId !== null;

  // Projection rules (V2 + V2.1 2026-05-05):
  //
  // - For ROOT active (demote candidate): only compute once dwell has armed
  //   (HOVER_NEAR or DROP_INTO_READY). In OUT state we want zero projection
  //   so the drop indicator stays at baseline depth, avoiding visual jitter
  //   from projecting a depth change before the user has held still long
  //   enough. Demote is a *new* hierarchy commitment — explicit X intent
  //   (12 px) + dwell pause (80 ms) gate it.
  //
  // - For CHILD active (promote candidate): skip the dwell gate entirely.
  //   Promote is the user *undoing* a prior demote and must respond at the
  //   moment over.id leaves the original parent's subtree (no X / dwell).
  //   The asymmetry is enforced inside `getProjection` via the 8th argument
  //   `originalActiveParentId`; here we just stop the dwell-state gate from
  //   suppressing the projection on its way out.
  //
  // The 6th arg `pointerBelowOver ?? undefined` lets `getProjection` choose
  // between position-aware (mouse drag with known pointer side) and legacy
  // neighbour resolution. Legacy is still intentional for keyboard drags
  // and for the same-slot indent case (`over === active`): when a root row
  // stays in its original visual slot and the user drags right, the row
  // above that slot is the parent candidate.
  // See the bug-fix block in `dnd/treeUtilities.ts:getProjection` docs.
  //
  // Bug fix 2026-05-05 (P0-2): pass `baseFlat` as the 7th `originalItems`
  // argument so getProjection's D5 `activeHasChildren` detection sees the
  // pre-`removeChildrenOf` list. Without this, a parent-with-children
  // dragged toward a child slot reads `activeHasChildren = false`
  // (children already stripped from `displayFlat`), `isInvalid` stays
  // false, the indicator wrongly renders, and the IPC fires only to be
  // rejected by the backend with `Cannot demote a category that has
  // children` — manifesting as a snap-back the user reads as "the app
  // accepted my drop and then rolled it back".
  const projected = useMemo(() => {
    if (activeId === null || overId === null) return null;
    // Asymmetric gate: only ROOT-active demote requires dwell.
    if (!isChildActive && dwellState === 'OUT') return null;
    // Mouse/touch demote usually needs a resolved insertion side. Falling
    // back to the legacy arrayMove path for a different over row revives
    // the top-edge bug: dragging above a row can be projected as "make it
    // a child of that row". The important exception is `over === active`:
    // dnd-kit can report the active row's original invisible slot while
    // the pointer is visually below the row above it. In that same-slot
    // case, legacy neighbour resolution is exactly the right model: indent
    // the active row under its previous visible row.
    if (!isChildActive && !isKeyboardDrag && pointerBelowOver === null && overId !== activeId) {
      return null;
    }
    return getProjection(
      displayFlat,
      activeId,
      overId,
      offsetLeft,
      INDENT_STEP_PX,
      pointerBelowOver ?? undefined,
      baseFlat,
      activeOriginalParentId,
    );
  }, [
    displayFlat,
    baseFlat,
    activeId,
    overId,
    offsetLeft,
    dwellState,
    pointerBelowOver,
    isChildActive,
    isKeyboardDrag,
    activeOriginalParentId,
  ]);

  // Items list for SortableContext — comes from displayFlat (the rendered
  // rows). UniqueIdentifier is `string | number`; FlattenedCategory.id is
  // string, so coercion is a no-op.
  const sortedIds = useMemo<UniqueIdentifier[]>(
    () => displayFlat.map((it) => it.id),
    [displayFlat],
  );

  // V2 §2.14 [P0-VIZ-4] / user spec 2026-05-05:
  //   "蓝色下划线指示条有且仅仅出现在一个类别元素的下方，同时出现了，这个时候
  //    松手类别就一定能变成其子类。没有任何例外。"
  // Translated to code: indicator visible IFF the drop, if released now,
  // will fire `onSetCategoryParent` with a non-null parentId AND the
  // hierarchy projection is committed (DROP_INTO_READY, not HOVER_NEAR).
  //
  // Concretely we require *all four*:
  //   1. `projected !== null` (dwell is at least HOVER_NEAR — a stronger
  //      condition is layered on by point 2)
  //   2. `dwellState === 'DROP_INTO_READY'` (commit visible only after
  //      the 80 ms dwell has fired — HOVER_NEAR shows nothing)
  //   3. `!projected.isInvalid` (D5 parent-becoming-child rejected — the
  //      cancel snap-back visual handles that case, not the indicator)
  //   4. `projected.parentId !== activeOriginalParentId` (genuine parent
  //      change — same-parent reorder shows no indicator at all,
  //      cascade let-pass already communicates the visual)
  // Plus implicitly:
  //   5. `projected.parentId !== null` (when promoting child→root, the
  //      visual is "row floats back to the leftmost edge" — no indicator
  //      needed, and there is no "below which row?" anchor at the root
  //      gap). NB this also rules out the depth-0 case where parentId
  //      walks back to null due to a malformed drop position.
  // The `parentRowIdForIndicator` is the row id whose row the indicator
  // renders directly under (with 16 px paddingLeft to match the child
  // depth). When null, no indicator renders.
  const parentRowIdForIndicator = useMemo<string | null>(() => {
    if (!projected) return null;
    if (dwellState !== 'DROP_INTO_READY') return null;
    if (projected.isInvalid) return null;
    if (projected.parentId === null) return null;
    if (projected.parentId === activeOriginalParentId) return null;
    return projected.parentId;
  }, [projected, dwellState, activeOriginalParentId]);

  useLayoutEffect(() => {
    visibleDropIntoProjectionRef.current = getVisibleDropIntoProjection(
      projected,
      parentRowIdForIndicator,
      activeOriginalParentId,
    );
  }, [projected, parentRowIdForIndicator, activeOriginalParentId]);

  // V2 [P0-ARCH-1]: live state ref for the keyboard coordinate getter.
  // The closure created by makeTreeKeyboardCoordinates captures THIS ref
  // (not a snapshot of items/offset), and useEffect re-syncs the ref's
  // current value on every render. When the user presses ←/→ during a
  // keyboard drag, the closure reads the latest items + offset.
  const sensorContextRef = useRef<TreeSensorContext>({ items: displayFlat, offset: 0 });
  useEffect(() => {
    sensorContextRef.current = { items: displayFlat, offset: offsetLeft };
  }, [displayFlat, offsetLeft]);

  // V2: parentMap for hierarchy-aware A11y announcements (childId → parentName).
  // Built from the canonical Category[] (NOT displayFlat) so it reflects all
  // parent relationships even for collapsed-children rows that aren't in
  // the rendered list.
  const parentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const cat of categories) {
      if (cat.parentId) {
        const parent = categories.find((c) => c.id === cat.parentId);
        if (parent) m.set(cat.id, parent.name);
      }
    }
    return m;
  }, [categories]);

  // V2 [P0-ARCH-1]: stable coordinate getter created once. dnd-kit's
  // KeyboardSensor expects a fixed function reference per sensor instance
  // — recreating it on every render would defeat the closure's ref-reading
  // contract.
  const [coordinateGetter] = useState(() =>
    makeTreeKeyboardCoordinates(sensorContextRef, INDENT_STEP_PX),
  );

  const sensors = useSensors(
    useSensor(CustomMouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  // V3: when *any* inline input is mounted, the entire SortableContext is
  // disabled so editing/adding is never interrupted by an accidental drag
  // activation (V3 invariant #15).
  const isInputMounted = isAddingCategory || editingCategoryId !== null;

  // V2 [P0-VIZ-3 / 02 V2 §2.15]: toggle semantics aligned with expandedSet.
  //   chevron click on an expanded parent → delete(id) (collapse)
  //   chevron click on a collapsed parent → add(id) (expand)
  // Persistence is synchronous so the next mount reads the user's choice.
  const toggleExpanded = useCallback((id: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  }, []);

  // ------------------------------------------------------------------
  // "Show X more" — count root-level rows only (V2 §2.16)
  // ------------------------------------------------------------------

  const rootCategories = useMemo(
    () => categories.filter((c) => c.parentId === undefined),
    [categories],
  );
  const overflowRootIds = useMemo<Set<string>>(() => {
    if (showAll || rootCategories.length <= maxVisible) return new Set();
    // Collect the ids of root rows beyond `maxVisible` — they (and their
    // children) are excluded from rendering until "Show X more" is clicked.
    const overflow = new Set<string>();
    for (let i = maxVisible; i < rootCategories.length; i += 1) {
      const root = rootCategories[i];
      overflow.add(root.id);
    }
    return overflow;
  }, [showAll, rootCategories, maxVisible]);

  const remainingRootCount = Math.max(0, rootCategories.length - maxVisible);

  // visibleFlat = displayFlat minus rows whose root-ancestor is in overflowRootIds.
  // V2 §2.16: maxVisible counts root-level rows ONLY; collapsed children are
  // not counted in the budget but are not visible either.
  const visibleFlat = useMemo<FlattenedCategory[]>(() => {
    if (overflowRootIds.size === 0) return displayFlat;
    return displayFlat.filter((it) => {
      // A child row's "owning root" is its parentId; for root rows it's its own id.
      const rootId = it.parentId ?? it.id;
      return !overflowRootIds.has(rootId);
    });
  }, [displayFlat, overflowRootIds]);

  // ------------------------------------------------------------------
  // Drag handlers — V2 dwell state machine + subtree splice + double IPC
  // ------------------------------------------------------------------

  const activeCategory = useMemo(
    () => (activeId !== null ? (categories.find((c) => c.id === String(activeId)) ?? null) : null),
    [activeId, categories],
  );

  const handleDragStart = (event: DragStartEvent) => {
    // V3 §2.10: auto-expand "Show X more" so the user can drop into the
    // overflow rows. (V3 invariant #18.)
    if (!showAll && rootCategories.length > maxVisible) {
      setShowAll(true);
    }
    // V2 [P1-11 / 02 V2 §2.15]: temporarily expand all collapsed parents
    // during the drag so the user can target rows that were hidden under
    // a collapsed chevron. Render-only override; persisted expandedSet is
    // untouched.
    setDragOverrideExpand(true);
    setActiveId(event.active.id);
    setOverId(event.active.id); // start "over" = self for cleaner getProjection
    setOffsetLeft(0);
    setPointerBelowOver(null);
    const startedByKeyboard = isKeyboardActivator(event.activatorEvent);
    setIsKeyboardDrag(startedByKeyboard);
    pointerStartRef.current = startedByKeyboard ? null : getEventCoordinates(event.activatorEvent);
    pointerCurrentRef.current = pointerStartRef.current;
    // Bug fix 2026-05-05 (P0-1): keep ref + state in lockstep at start.
    dwellStateRef.current = 'OUT';
    // V2 [P1-4]: clear projection ref so the announcer doesn't read a stale
    // value from the previous drag.
    dropProjectionRef.current = null;
    visibleDropIntoProjectionRef.current = null;
    onDragStart();
  };

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const newOffset = event.delta.x;
    // Bail out cheaply if value is unchanged. `setState` on identical values
    // already short-circuits in React, but skipping the function call keeps
    // the dispatcher off the trace stack and removes one source of the
    // "Maximum update depth exceeded" warning under StrictMode + Always
    // measuring (P0-1).
    setOffsetLeft((prev) => (prev === newOffset ? prev : newOffset));

    // Bug fix 2026-05-06: compute which side of `over` the actual pointer
    // is on, so getProjection can use position-aware
    // previousItem/nextItem resolution. Without this, dragging A "below B"
    // could pick over=C (closestCenter geometry) and make A a child of C,
    // and dragging A "above B" picks over=B making A a child of B —
    // the inverse of Things 3 / Linear / Notion convention.
    //
    // The previous implementation compared the dragged overlay center to
    // the over row center. That center includes DragOverlay measurement and
    // the magnetic snap modifier, so it can be above the target while the
    // user's cursor is below it (or vice versa). Prefer the live pointer
    // captured from document-level mouse/touch events; fall back to dnd-kit's
    // event delta only before the first move event reaches that listener.
    let nextPointerBelowOver: boolean | null = null;
    if (event.over) {
      const start = pointerStartRef.current;
      const current = pointerCurrentRef.current;
      const pointerY = current?.y ?? (start ? start.y + event.delta.y : null);
      if (start && event.over.id !== event.active.id) {
        nextPointerBelowOver = isPointerBelowRowCenter(pointerY, event.over.rect);
      }
    }
    setPointerBelowOver((prev) => (prev === nextPointerBelowOver ? prev : nextPointerBelowOver));

    // V2 [P0-VIZ-4 / 02 V2 §2.14] dwell state machine —
    //   OUT / HOVER_NEAR / DROP_INTO_READY transitions.
    //
    // Bug fix 2026-05-05 (P0-1): read current state from the ref, not from
    // the React-state closure. Closure-based reads in this repeatedly-fired
    // callback can see a stale `dwellState` and re-set the same transition
    // twice, fueling render loops under StrictMode + MeasuringStrategy.Always.
    const newOverId = event.over?.id ?? null;
    setOverId((prev) => (prev === newOverId ? prev : newOverId));
    const overChanged = newOverId !== dwellOverIdRef.current;
    const xPassesThreshold = Math.abs(newOffset) >= ABS_X_THRESHOLD_PX;

    // Inline helper: clear an armed dwell timer (synchronous; the spec at
    // 02 V2 §2.14 explicitly forbids waiting for natural expire on transition).
    const clearTimer = () => {
      if (dwellTimerRef.current !== null) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
    };

    // Inline helper: arm a fresh 80 ms timer, capturing the over.id at
    // arm time so the callback can guard against late firings (over row
    // changed in the meantime).
    const armTimer = (id: UniqueIdentifier | null) => {
      clearTimer();
      dwellTimerRef.current = setTimeout(() => {
        // Only commit if we are still over the same row when the timer
        // fires. If overChanged in the interim, the new arm replaces this one.
        if (dwellOverIdRef.current === id && dwellStateRef.current !== 'DROP_INTO_READY') {
          dwellStateRef.current = 'DROP_INTO_READY';
          setDwellState('DROP_INTO_READY');
        }
        dwellTimerRef.current = null;
      }, DWELL_MS);
    };

    // Bail-on-unchanged: only call setState when the target state differs
    // from the current state, eliminating render churn on stable hover.
    const setDwellIfChanged = (next: 'OUT' | 'HOVER_NEAR' | 'DROP_INTO_READY') => {
      if (dwellStateRef.current === next) return;
      dwellStateRef.current = next;
      setDwellState(next);
    };

    if (overChanged) {
      // 02 V2 §2.14 "HOVER_NEAR → HOVER_NEAR (new over row): cancel timer
      // + restart 80ms" — and the same applies coming from DROP_INTO_READY.
      clearTimer();
      dwellOverIdRef.current = newOverId;
      if (newOverId !== null && xPassesThreshold) {
        setDwellIfChanged('HOVER_NEAR');
        armTimer(newOverId);
      } else {
        setDwellIfChanged('OUT');
      }
      return;
    }

    // Same over row — handle X threshold transitions only.
    if (xPassesThreshold) {
      // Re-enter HOVER_NEAR if previously OUT; stay if already HOVER_NEAR
      // / DROP_INTO_READY.
      if (dwellStateRef.current === 'OUT' && newOverId !== null) {
        setDwellIfChanged('HOVER_NEAR');
        armTimer(newOverId);
      }
      return;
    }

    // |X| < 12 — depending on current state, retreat one level.
    if (dwellStateRef.current === 'DROP_INTO_READY') {
      // 02 V2 §2.14 "DROP_INTO_READY → HOVER_NEAR: X 重新 < 12" —
      // visual reverts (drop indicator wrapper paddingLeft 16 → 0 over
      // 150 ms), dwell timer stays idle (no rearm until X ≥ 12 again).
      setDwellIfChanged('HOVER_NEAR');
    } else if (dwellStateRef.current === 'HOVER_NEAR') {
      clearTimer();
      setDwellIfChanged('OUT');
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const next = event.over?.id ?? null;
    setOverId((prev) => (prev === next ? prev : next));
  }, []);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    let endPointerBelowOver: boolean | undefined;
    if (over) {
      const start = pointerStartRef.current;
      const current = pointerCurrentRef.current;
      const pointerY = current?.y ?? (start ? start.y + event.delta.y : null);
      const pointerSide =
        over.id === active.id ? null : isPointerBelowRowCenter(pointerY, over.rect);
      endPointerBelowOver = pointerSide ?? undefined;
    }

    // Recompute only the projections that are supposed to be hidden from the
    // blue drop-into contract. Root→child demotion is governed by
    // `visibleDropIntoProjectionRef`: the last projection actually painted as
    // the indicator. This keeps the user-facing invariant exact:
    //   indicator visible ⇔ release commits that parent
    // and prevents the final DragEndEvent's geometry from silently swapping
    // parent candidates or reviving the legacy "above row" parent bug.
    //
    // Gating (V2 + V2.1 2026-05-05):
    //   - ROOT active: only the last visible drop-into projection may commit
    //     a parent change. HOVER_NEAR or a one-frame DragEnd recompute is
    //     treated as same-level reorder. Demote needs explicit X intent,
    //     intentional pause, and a painted indicator.
    //   - CHILD active: always recompute. Promote (child → root) responds
    //     to over.id leaving the original subtree, with no X / dwell. If we
    //     gated on dwell here, a quick drag-and-release that crosses out of
    //     the original parent would silently fall back to "stay child" —
    //     contradicting the user contract that promote does not require
    //     dwell. The `getProjection` algorithm itself enforces the
    //     "still-in-subtree → keep child / left subtree → promote" decision
    //     from `originalActiveParentId`.
    //
    // Bug fix 2026-05-05 (P0-2): pass `baseFlat` as the 7th argument
    // (`originalItems`) so D5 `activeHasChildren` reads the pre-strip
    // tree. Without this the indicator and IPC would let a
    // parent-with-children become another root's child — backend rejects,
    // UI snaps back.
    let finalProjection: Projection | null = visibleDropIntoProjectionRef.current;
    if (over && isChildActive) {
      finalProjection = getProjection(
        displayFlat,
        active.id,
        over.id,
        event.delta.x,
        INDENT_STEP_PX,
        endPointerBelowOver,
        baseFlatRef.current,
        activeOriginalParentId,
      );
    } else if (!finalProjection) {
      finalProjection = null;
    }

    // V2 [P1-4]: write the projected drop target to dropProjectionRef BEFORE
    // any state clear, so the dnd-kit monitor's announcement.onDragEnd
    // (dispatched synchronously after our handler returns; see
    // node_modules/@dnd-kit/core dist line ~3162) can read it. We clear it
    // again on the next drag-start / drag-cancel.
    {
      const activeStr = String(active.id);
      const activeRow = baseFlatRef.current.find((it) => String(it.id) === activeStr);
      const oldParentId: string | null = activeRow?.parentId ?? null;
      let newParentId: string | null;
      if (finalProjection) {
        newParentId = finalProjection.parentId;
      } else {
        // No projection (dwell never armed) — same-level reorder; parent
        // stays unchanged.
        newParentId = oldParentId;
      }
      dropProjectionRef.current = {
        activeId: activeStr,
        oldParentId,
        newParentId,
      };
    }

    // Always clean up dwell state first so the next drag starts fresh.
    if (dwellTimerRef.current !== null) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    dwellOverIdRef.current = null;
    dwellStateRef.current = 'OUT';
    setDwellState('OUT');

    // V3 §2.6 distance-aware dropAnimation — same logic as V3.
    if (active.rect.current.translated && over) {
      const a = active.rect.current.translated;
      const o = over.rect;
      const dx = o.left + o.width / 2 - (a.left + a.width / 2);
      const dy = o.top + o.height / 2 - (a.top + a.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      setDropAnimationConfig(
        dist < 4
          ? null
          : {
              duration: Math.min(280, 120 + dist * 0.5),
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            },
      );
    }

    // Capture local snapshots before clearing — needed by the IPC dispatch
    // path below. `localProjected` is the recomputed `finalProjection`
    // (event-derived), not the React-state useMemo `projected`, to avoid
    // a one-frame stale value at drop time.
    const localActiveId = active.id;
    const localOverId = over?.id ?? null;
    const localProjected = finalProjection;
    const localPointerBelowOver = endPointerBelowOver;

    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setPointerBelowOver(null);
    setDragOverrideExpand(false);
    setIsKeyboardDrag(false);
    pointerStartRef.current = null;
    pointerCurrentRef.current = null;
    visibleDropIntoProjectionRef.current = null;
    onDragEnd();

    if (over) {
      // V2 [P0-ARCH-2]: read baseFlat (NOT displayFlat which has the active
      // subtree's children removed). Reading via ref to avoid closure-stale
      // baseFlat after the in-flight setActiveId(null).
      const preDragBaseFlat = baseFlatRef.current;
      const activeItem = preDragBaseFlat.find((it) => String(it.id) === String(active.id));
      if (!activeItem) {
        // Defensive — should never happen.
        setJustDroppedId(localActiveId);
        setTimeout(() => setJustDroppedId(null), 50);
        return;
      }

      // Reject D5-invalid projections (parent → child of another parent).
      // 02 V2 §2.13: cursor not-allowed state — the user already saw the
      // 0.5 opacity feedback during dragMove; here we simply skip IPC.
      if (localProjected?.isInvalid) {
        setJustDroppedId(localActiveId);
        setTimeout(() => setJustDroppedId(null), 50);
        return;
      }

      const finalParentId = localProjected
        ? localProjected.parentId
        : (activeItem.parentId ?? null);
      const oldParentId = activeItem.parentId ?? null;
      const parentChanged = finalParentId !== oldParentId;

      // Same-id same-parent → genuine no-op. Skip both IPCs.
      if (String(active.id) === String(over.id) && !parentChanged) {
        setJustDroppedId(localActiveId);
        setTimeout(() => setJustDroppedId(null), 50);
        return;
      }

      try {
        // Parent changes and order changes are intentionally asymmetric:
        // demote root→child only changes parentId because flattenTree will
        // render the child under its new parent. Promote child→root must
        // also preserve the user's vertical drop slot, so after the parent
        // change succeeds we issue a queued root-level reorder.
        if (parentChanged) {
          if (onSetCategoryParent) {
            await onSetCategoryParent(String(active.id), finalParentId);
          }
          if (oldParentId !== null && finalParentId === null && localOverId !== null) {
            const newOrderedIds = getSubtreeReorderIds(
              preDragBaseFlat,
              active.id,
              localOverId,
              localPointerBelowOver,
            );
            if (newOrderedIds) {
              const freshCategories = useAppStore.getState().categories;
              const freshExpanded = computeDefaultExpanded(freshCategories);
              for (const id of expandedSet) freshExpanded.add(id);
              const freshBaseFlat = flattenTree(freshCategories, freshExpanded);
              const currentOrder = freshBaseFlat.map((it) => String(it.id));
              const orderChanged =
                currentOrder.length !== newOrderedIds.length ||
                currentOrder.some((id, i) => id !== newOrderedIds[i]);

              if (orderChanged) {
                await onReorder(newOrderedIds);
              }
            }
          }
        } else if (String(active.id) !== String(over.id)) {
          // Same-level reorder: build the new ordered_ids from a
          // subtree-aware splice over the FRESH baseFlat (read from
          // store).
          const freshCategories = useAppStore.getState().categories;
          const freshExpanded = computeDefaultExpanded(freshCategories);
          for (const id of expandedSet) freshExpanded.add(id);
          const freshBaseFlat = flattenTree(freshCategories, freshExpanded);

          const newOrderedIds = getSubtreeReorderIds(
            freshBaseFlat,
            active.id,
            localOverId,
            localPointerBelowOver,
          );
          if (!newOrderedIds) {
            setJustDroppedId(localActiveId);
            setTimeout(() => setJustDroppedId(null), 50);
            return;
          }

          // No-op guard: skip the reorder IPC if order is unchanged.
          const preDragOrder = freshBaseFlat.map((it) => String(it.id));
          const orderChanged =
            preDragOrder.length !== newOrderedIds.length ||
            preDragOrder.some((id, i) => id !== newOrderedIds[i]);

          if (orderChanged) {
            await onReorder(newOrderedIds);
          }
        }
      } catch (err) {
        // setCategoryParent or reorder failed — appStore handles the
        // fallback (V2 [P1-7]: get_categories pull, snapshot revert).
        // UI state already cleared above.
        console.error('handleDragEnd hierarchy IPC failed:', err);
      }
    }

    // 50 ms guard window — covers the React render after onDragEnd plus
    // the synthetic click that fires on mouseup. SortableCategoryRow
    // checks `justDropped` and short-circuits its onClick during the window
    // (V3 invariant #19).
    setJustDroppedId(localActiveId);
    setTimeout(() => setJustDroppedId(null), 50);
  };

  const handleDragCancel = (_event: DragCancelEvent) => {
    void _event;
    if (dwellTimerRef.current !== null) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    dwellOverIdRef.current = null;
    dwellStateRef.current = 'OUT';
    setDwellState('OUT');
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setPointerBelowOver(null);
    setDragOverrideExpand(false);
    setIsKeyboardDrag(false);
    pointerStartRef.current = null;
    pointerCurrentRef.current = null;
    // V2 [P1-4]: clear projection ref so the announcer's onDragCancel
    // doesn't accidentally read a stale value from a prior drag-end.
    dropProjectionRef.current = null;
    visibleDropIntoProjectionRef.current = null;
    // V3 P2-3 (invariant #7): reset dropAnimationConfig so the next drag
    // starts with the default animation (otherwise a previous distance-aware
    // `null` would leak into the next drop).
    setDropAnimationConfig(CATEGORY_DROP_ANIMATION);
    onDragEnd();
  };

  // ------------------------------------------------------------------
  // Render — empty fallback, then the full DndContext
  // ------------------------------------------------------------------

  // Empty-state fallback — kept outside DndContext because there is
  // nothing to sort (no items, no overlay). Mirrors V3 behaviour.
  if (categories.length === 0) {
    return (
      <div className="flex flex-col gap-0.5">
        {isAddingCategory ? (
          <div data-no-dnd="true">
            <CategoryInlineInput
              mode="add"
              onSave={(name) => onCategorySave(null, name)}
              onCancel={() => onCategoryEditCancel()}
            />
          </div>
        ) : (
          <p className="text-xs text-[#A1A1AA] px-2.5">No categories</p>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      // V3 §7 invariant #8: snap-only here. The DragOverlay declares its own
      // restrictToWindowEdges below; do NOT add restrictToVerticalAxis (the
      // V2 P0 bug that clamped the overlay to X=0).
      modifiers={[snapModifier]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        // V2: pass hierarchy context (parentMap + expandedSet +
        // dropProjectionRef) so announcements can phrase "moved to child of
        // {parent}" / "promoted to root level" / "moved to root level"
        // / "Expanded category {name}" correctly. The projection ref is
        // populated by handleDragEnd before dnd-kit's monitor dispatches
        // the announcement, so the announcer sees the post-drop parent.
        announcements: makeAnnouncements(categories, 'category', {
          parentMap,
          expandedSet,
          dropProjectionRef,
        }),
        screenReaderInstructions: sidebarScreenReaderInstructions,
      }}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        // sortedIds = displayFlat ids — every row currently rendered is in
        // the items list. Children of the active item are excluded
        // (removeChildrenOf) so they cannot be drop targets while their
        // parent is in flight.
        items={sortedIds}
        strategy={verticalListSortingStrategy}
        disabled={isInputMounted}
      >
        <div data-sortable-list className="flex flex-col gap-0.5">
          {visibleFlat.map((item) => {
            const isEditing = editingCategoryId === item.id;
            const itemCategory = toCategory(item);

            // Inline edit takes over the slot — render the input in place
            // of the sortable row. Wrapping with `data-no-dnd="true"` is
            // defence-in-depth (the parent SortableContext is also
            // disabled when editing).
            if (isEditing) {
              return (
                <div key={item.id} data-no-dnd="true">
                  <CategoryInlineInput
                    mode="edit"
                    category={itemCategory}
                    onSave={(name) => onCategorySave(item.id, name)}
                    onCancel={() => onCategoryEditCancel()}
                  />
                </div>
              );
            }

            // V2 [Reviewer D P1-1]: live depth follows the projected depth
            // for the active row during drag — so the inline source row
            // (under opacity 0) keeps its DOM padding-left in sync with
            // where the indicator says it'll land. For non-active rows,
            // depth comes straight from the flatten output.
            const renderDepth =
              localStringEq(item.id, activeId) && projected
                ? (Math.max(0, Math.min(1, projected.depth)) as 0 | 1)
                : (item.depth as 0 | 1);

            // User spec 2026-05-05: indicator must render directly under
            // the row that will become the new parent (so the user reads
            // "this row is the parent" from spatial proximity) — NOT under
            // the active row's slot, which is invisible (opacity 0) and
            // can be anywhere in the list (e.g. the very top, leading to
            // the "indicator under CATEGORIES header" bug from screenshot 1).
            // The indicator is anchored on `parentRowIdForIndicator`
            // (computed above with strict gating: DROP_INTO_READY +
            // !isInvalid + parentId !== originalParentId + parentId !== null).
            // depth is always 1 here (child indent) since we only render
            // the indicator when the drop will create a child.
            const showDropIndicatorAfterThisRow =
              parentRowIdForIndicator !== null && item.id === parentRowIdForIndicator;

            return (
              <div key={item.id}>
                <SortableCategoryRow
                  category={itemCategory}
                  depth={renderDepth}
                  hasChildren={item.hasChildren}
                  isExpanded={!item.collapsed && item.hasChildren}
                  onToggleExpanded={() => toggleExpanded(item.id)}
                  isActive={activeCategoryId === item.id}
                  isEditing={false}
                  justDropped={localStringEq(item.id, justDroppedId)}
                  onClick={() => onCategoryClick(item.id)}
                  onDoubleClick={() => onCategoryDoubleClick(item.id)}
                  onContextMenu={(e) => onCategoryContextMenu(itemCategory, e)}
                  onColorChange={(color) => onCategoryColorChange(item.id, color)}
                  showDropIndicatorAfter={showDropIndicatorAfterThisRow}
                />
              </div>
            );
          })}

          {/* Add input appended at end of the visible list — wrapped in a
              data-no-dnd container so the focused input can't be hijacked
              by an accidental drag activation. */}
          {isAddingCategory && (
            <div data-no-dnd="true">
              <CategoryInlineInput
                mode="add"
                onSave={(name) => onCategorySave(null, name)}
                onCancel={() => onCategoryEditCancel()}
              />
            </div>
          )}

          {/* "Show X more" / "Show less" — V2 §2.16: counted at root level only.
              data-no-dnd guards against accidental activation if the user
              clicks-then-drags the chevron. */}
          {remainingRootCount > 0 && (
            <button
              data-no-dnd="true"
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-[12px] font-medium text-[#A1A1AA] hover:bg-[#F4F4F5] transition-colors"
            >
              {showAll ? (
                <>
                  <ChevronUp size={12} />
                  <span>Show less</span>
                </>
              ) : (
                <>
                  <ChevronDown size={12} />
                  <span>Show {remainingRootCount} more</span>
                </>
              )}
            </button>
          )}
        </div>
      </SortableContext>

      {/* V3 §7 invariant #9: explicit modifiers on the DragOverlay only —
          restrictToWindowEdges stops the floating clone from escaping the
          viewport while keeping pointer-follow free in both axes.
          dropAnimation is recomputed in handleDragEnd; `null` means "skip"
          (already snapped to slot).

          V2 hierarchy invariant #21 (02 V2 §2.5 + §2.22 + §11): the overlay
          is depth-agnostic — it does NOT receive depth / hasChildren props.
          Hierarchy depth is expressed via the inline source row's projected
          paddingLeft (see `renderDepth` below) and the drop-indicator
          wrapper, not via the floating clone. */}
      <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={dropAnimationConfig}>
        {activeCategory && <DragOverlayCategoryRow category={activeCategory} />}
      </DragOverlay>
    </DndContext>
  );
}

/** Tiny helper: equality on UniqueIdentifier values, coerced to string.
 *  UniqueIdentifier is `string | number`; our domain is always string,
 *  but we compare via `String()` for defensive symmetry with FlattenedCategory.id. */
function localStringEq(
  a: UniqueIdentifier | null | undefined,
  b: UniqueIdentifier | null | undefined,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

/** Strip the flatten-only fields and normalise `parentId: null` → `undefined`
 *  so a `FlattenedCategory` is structurally usable wherever a `Category` is
 *  expected (`CategoryInlineInput`, `SortableCategoryRow`, etc.).
 *
 *  `FlattenedCategory.parentId: string | null` is an explicit-null field
 *  for the flatten output; `Category.parentId: string | undefined` is the
 *  canonical shape. We map `null → undefined` (root rows lose the key)
 *  and `string → string` (children keep their parent id). */
function toCategory(flat: FlattenedCategory): Category {
  const { id, name, color, count, parentId } = flat;
  return parentId === null ? { id, name, color, count } : { id, name, color, count, parentId };
}

export default SortableCategoriesList;
