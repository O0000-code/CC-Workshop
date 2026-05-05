import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  getProjection,
  removeChildrenOf,
  type FlattenedCategory,
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
   * Whether the active row's visible center is currently below the over
   * row's visible center. Drives the position-aware `previousItem` /
   * `nextItem` resolution in `getProjection` — see the position-aware
   * mode docs in `dnd/treeUtilities.ts`. `null` = unknown (no active
   * drag, or over === active). Recomputed each `onDragMove` from
   * `event.active.rect.current.translated` and `event.over.rect`.
   */
  const [pointerBelowOver, setPointerBelowOver] = useState<boolean | null>(null);
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

  // Projection: only compute once dwell has armed (HOVER_NEAR or
  // DROP_INTO_READY). In OUT state we want zero projection (drop indicator
  // stays at baseline depth), avoiding the visual jitter of projecting a
  // depth change before the user has held still long enough.
  //
  // The 6th arg `pointerBelowOver ?? undefined` lets `getProjection` choose
  // between position-aware (mouse drag with known pointer side) and legacy
  // (over === active, or null for keyboard drags) neighbour resolution.
  // See the bug-fix block in `dnd/treeUtilities.ts:getProjection` docs.
  const projected = useMemo(() => {
    if (activeId === null || overId === null) return null;
    if (dwellState === 'OUT') return null;
    return getProjection(
      displayFlat,
      activeId,
      overId,
      offsetLeft,
      INDENT_STEP_PX,
      pointerBelowOver ?? undefined,
    );
  }, [displayFlat, activeId, overId, offsetLeft, dwellState, pointerBelowOver]);

  // Items list for SortableContext — comes from displayFlat (the rendered
  // rows). UniqueIdentifier is `string | number`; FlattenedCategory.id is
  // string, so coercion is a no-op.
  const sortedIds = useMemo<UniqueIdentifier[]>(
    () => displayFlat.map((it) => it.id),
    [displayFlat],
  );

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
    // V2 [P1-4]: clear projection ref so the announcer doesn't read a stale
    // value from the previous drag.
    dropProjectionRef.current = null;
    onDragStart();
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const newOffset = event.delta.x;
    setOffsetLeft(newOffset);

    // Bug fix 2026-05-04: compute which side of `over` the active row's
    // visible center is on, so getProjection can use position-aware
    // previousItem/nextItem resolution. Without this, dragging A "below B"
    // could pick over=C (closestCenter geometry) and make A a child of C,
    // and dragging A "above B" picks over=B making A a child of B —
    // the inverse of Things 3 / Linear / Notion convention.
    //
    // `active.rect.current.translated` is dnd-kit's per-frame rect of the
    // active item with the current drag transform applied (see
    // `node_modules/@dnd-kit/core/dist/store/types.d.ts:30-33`). `over.rect`
    // is the over droppable's rect (`store/types.d.ts:35-40`). Both are
    // measured in the same coordinate space, so center.y comparison is
    // direct.
    if (event.over) {
      const activeRect = event.active.rect.current.translated;
      const overRect = event.over.rect;
      if (activeRect && event.over.id !== event.active.id) {
        const activeCenterY = activeRect.top + activeRect.height / 2;
        const overCenterY = overRect.top + overRect.height / 2;
        setPointerBelowOver(activeCenterY > overCenterY);
      } else {
        // over === active (no insertion gap defined). Use null so
        // getProjection falls back to the legacy arrayMove path.
        setPointerBelowOver(null);
      }
    } else {
      setPointerBelowOver(null);
    }

    // V2 [P0-VIZ-4 / 02 V2 §2.14] dwell state machine —
    //   OUT / HOVER_NEAR / DROP_INTO_READY transitions.
    const newOverId = event.over?.id ?? null;
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
        if (dwellOverIdRef.current === id) {
          setDwellState('DROP_INTO_READY');
        }
        dwellTimerRef.current = null;
      }, DWELL_MS);
    };

    if (overChanged) {
      // 02 V2 §2.14 "HOVER_NEAR → HOVER_NEAR (new over row): cancel timer
      // + restart 80ms" — and the same applies coming from DROP_INTO_READY.
      clearTimer();
      dwellOverIdRef.current = newOverId;
      if (newOverId !== null && xPassesThreshold) {
        setDwellState('HOVER_NEAR');
        armTimer(newOverId);
      } else {
        setDwellState('OUT');
      }
      return;
    }

    // Same over row — handle X threshold transitions only.
    if (xPassesThreshold) {
      // Re-enter HOVER_NEAR if previously OUT; stay if already HOVER_NEAR
      // / DROP_INTO_READY.
      if (dwellState === 'OUT' && newOverId !== null) {
        setDwellState('HOVER_NEAR');
        armTimer(newOverId);
      }
      return;
    }

    // |X| < 12 — depending on current state, retreat one level.
    if (dwellState === 'DROP_INTO_READY') {
      // 02 V2 §2.14 "DROP_INTO_READY → HOVER_NEAR: X 重新 < 12" —
      // visual reverts (drop indicator wrapper paddingLeft 16 → 0 over
      // 150 ms), dwell timer stays idle (no rearm until X ≥ 12 again).
      setDwellState('HOVER_NEAR');
    } else if (dwellState === 'HOVER_NEAR') {
      clearTimer();
      setDwellState('OUT');
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    // ============================================================
    // DEBUG (2026-05-04): hierarchy drop "弹回" diagnostic
    // ============================================================
    // Surfaced via console.warn (visible in `npm run tauri dev` console)
    // and alert() so the user can read state without DevTools attached.
    // Remove this block once the root cause is confirmed.
    const __dbg_dwellState = dwellState;
    const __dbg_pointerBelowOver = pointerBelowOver;
    const __dbg_offsetLeft = offsetLeft;
    console.warn('[DragEnd] enter', {
      activeId: String(active.id),
      overId: over ? String(over.id) : null,
      deltaX: event.delta.x,
      deltaY: event.delta.y,
      dwellState: __dbg_dwellState,
      pointerBelowOver: __dbg_pointerBelowOver,
      offsetLeft: __dbg_offsetLeft,
      reactStateProjected: projected,
    });

    // Bug fix 2026-05-04: recompute the final projection from the drop-end
    // event itself, rather than relying on the React-state `projected`
    // useMemo. The state-based `projected` is one frame behind the last
    // setPointerBelowOver/setOffsetLeft (React batches setState until the
    // next render; useMemo only re-runs after that render). At drop time
    // we need the projection that reflects the user's exact final pointer
    // position, so we re-derive it here using the event's active/over
    // rects and the current `dwellState` snapshot for armed/unarmed gating.
    let finalProjection = projected;
    if (over && dwellState !== 'OUT') {
      const activeRect = active.rect.current.translated;
      let endPointerBelowOver: boolean | undefined;
      if (activeRect && over.id !== active.id) {
        const activeCenterY = activeRect.top + activeRect.height / 2;
        const overCenterY = over.rect.top + over.rect.height / 2;
        endPointerBelowOver = activeCenterY > overCenterY;
      }
      finalProjection = getProjection(
        displayFlat,
        active.id,
        over.id,
        event.delta.x,
        INDENT_STEP_PX,
        endPointerBelowOver,
      );
      console.warn('[DragEnd] recomputed projection', {
        endPointerBelowOver,
        finalProjection,
      });
    } else {
      console.warn('[DragEnd] skipped re-projection (no over or dwell=OUT)', {
        hasOver: Boolean(over),
        dwellState: __dbg_dwellState,
        keptProjected: projected,
      });
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
      } else if (over) {
        // No projection (dwell never armed) — same-level reorder; parent
        // stays unchanged.
        newParentId = oldParentId;
      } else {
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

    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setPointerBelowOver(null);
    setDragOverrideExpand(false);
    onDragEnd();

    // V2 hierarchy fix (2026-05-05): V3 used `if (over && active.id !== over.id)`
    // — but with hierarchy, dnd-kit's `closestCenter` after let-pass animation
    // may report `over === active` (active settled back into its own slot
    // visually) while the user has expressed a hierarchy intent (X >= 12 px +
    // dwell DROP_INTO_READY → projection.parentId resolved to a real parent).
    // The user's screenshot showed exactly this: `activeId === overId === Writing`
    // but `projection.parentId = Analysis`. The old guard skipped the IPC, and
    // Writing snapped back to root. Now we proceed whenever there is an `over`
    // AND either (a) active != over (V3 reorder path) OR (b) the projection
    // proposes a parent change.
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
      const parentChanged = finalParentId !== (activeItem.parentId ?? null);

      // Same-id same-parent → genuine no-op. Skip both IPCs.
      if (String(active.id) === String(over.id) && !parentChanged) {
        setJustDroppedId(localActiveId);
        setTimeout(() => setJustDroppedId(null), 50);
        return;
      }

      console.warn('[DragEnd] decision', {
        activeId: String(active.id),
        overId: localOverId ? String(localOverId) : null,
        localProjected,
        oldParentId: activeItem.parentId ?? null,
        finalParentId,
        parentChanged,
        hasOnSetCategoryParent: Boolean(onSetCategoryParent),
      });

      try {
        // V2 [P0-ARCH-3]: await setCategoryParent FIRST, then compute
        // reorder ordered_ids based on the FRESH categories (which now
        // reflect the new parent_id). This is the critical fix for the
        // double-IPC stale-payload bug — reorder must see post-setParent
        // hierarchy or it'll dispatch ordered_ids that put children at
        // the end of the Vec.
        if (parentChanged && onSetCategoryParent) {
          console.warn('[DragEnd] -> onSetCategoryParent BEFORE await');
          await onSetCategoryParent(String(active.id), finalParentId);
          console.warn('[DragEnd] -> onSetCategoryParent AFTER await', {
            postCallStateForActive: useAppStore
              .getState()
              .categories.find((c) => c.id === String(active.id)),
          });
        }

        // V2 [P0-ARCH-2 / P0-ARCH-3]: rebuild ordered_ids by subtree
        // splice over the FRESH baseFlat (read from store, not from the
        // pre-drag baseFlatRef). The subtree (active + active's children)
        // moves as a unit to the over.id position, preserving children
        // adjacent to their parent so the backend Vec stays
        // hierarchically sorted.
        const freshCategories = useAppStore.getState().categories;
        const freshExpanded = computeDefaultExpanded(freshCategories);
        // ∪ persisted user prefs — collapsed parents would otherwise drop
        // children from freshBaseFlat, breaking the splice indexing.
        for (const id of expandedSet) freshExpanded.add(id);
        const freshBaseFlat = flattenTree(freshCategories, freshExpanded);

        const freshActiveIdx = freshBaseFlat.findIndex((it) => String(it.id) === String(active.id));
        const freshOverIdx = freshBaseFlat.findIndex((it) => String(it.id) === String(localOverId));
        if (freshActiveIdx === -1 || freshOverIdx === -1) {
          // No-op — over no longer in flat list (shouldn't happen).
          setJustDroppedId(localActiveId);
          setTimeout(() => setJustDroppedId(null), 50);
          return;
        }

        // The active item's children in their canonical Vec order. With
        // MAX_DEPTH = 1 the only "subtree" possibility is the dragged row
        // + its immediate children; grandchildren are forbidden.
        const activeIdStr = String(active.id);
        const childIds = freshBaseFlat
          .filter((it) => it.parentId === activeIdStr)
          .map((it) => String(it.id));
        const subtreeIds = new Set<string>([activeIdStr, ...childIds]);

        const withoutSubtree = freshBaseFlat.filter((it) => !subtreeIds.has(String(it.id)));
        const overIdxAfterRemove = withoutSubtree.findIndex(
          (it) => String(it.id) === String(localOverId),
        );
        if (overIdxAfterRemove === -1) {
          setJustDroppedId(localActiveId);
          setTimeout(() => setJustDroppedId(null), 50);
          return;
        }

        // Insert position: if active was *before* over in fresh order,
        // splice in *after* over (the user dragged it down past over);
        // if active was *after* over, splice in *before* over (dragged up).
        const insertIdx =
          freshActiveIdx < freshOverIdx ? overIdxAfterRemove + 1 : overIdxAfterRemove;

        // The subtree itself in its canonical (fresh) order.
        const subtreeInOrder = freshBaseFlat.filter((it) => subtreeIds.has(String(it.id)));
        const newFlat = [
          ...withoutSubtree.slice(0, insertIdx),
          ...subtreeInOrder,
          ...withoutSubtree.slice(insertIdx),
        ];
        const newOrderedIds = newFlat.map((it) => String(it.id));

        // No-op guard: skip the reorder IPC if order is unchanged.
        const preDragOrder = freshBaseFlat.map((it) => String(it.id));
        const orderChanged =
          preDragOrder.length !== newOrderedIds.length ||
          preDragOrder.some((id, i) => id !== newOrderedIds[i]);

        console.warn('[DragEnd] reorder plan', {
          newOrderedIds,
          preDragOrder,
          orderChanged,
        });

        if (orderChanged) {
          await onReorder(newOrderedIds);
          console.warn('[DragEnd] -> onReorder AFTER await', {
            postReorderStateForActive: useAppStore
              .getState()
              .categories.find((c) => c.id === String(active.id)),
          });
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
    setDwellState('OUT');
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    setPointerBelowOver(null);
    setDragOverrideExpand(false);
    // V2 [P1-4]: clear projection ref so the announcer's onDragCancel
    // doesn't accidentally read a stale value from a prior drag-end.
    dropProjectionRef.current = null;
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

            // V2 §2.7 (P1-3): drop-indicator wrapper expresses projected
            // depth above the active row during drag. Wrapper paddingLeft
            // transitions over 150ms (CSS — `--duration-drag-indicator-move`)
            // when the user crosses the +/- 12 px X threshold + 80 ms dwell.
            // The `.drop-indicator-h` class is unchanged — geometry stays
            // block + margin-only + transform-driven (per V3).
            //
            // Only render at the active row's slot when dwell has armed
            // (HOVER_NEAR / DROP_INTO_READY) — i.e. when `projected` is
            // non-null. The active row's own paddingLeft (renderDepth above)
            // also tracks projection; both channels work in concert so the
            // user perceives one cohesive depth indication.
            const showDropIndicatorHere = localStringEq(item.id, activeId) && projected !== null;
            const indicatorDepth = projected
              ? (Math.max(0, Math.min(1, projected.depth)) as 0 | 1)
              : 0;

            return (
              <div key={item.id}>
                {showDropIndicatorHere && (
                  <div
                    className="drop-indicator-wrapper"
                    style={{ paddingLeft: indicatorDepth * INDENT_STEP_PX }}
                    aria-hidden="true"
                  >
                    <div className="drop-indicator-h" />
                  </div>
                )}
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
