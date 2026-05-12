import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight } from 'lucide-react';
import type { Category } from '@/types';
import { CategoryRowContent } from './CategoryRowContent';
import { INDENT_STEP_PX } from './dnd/treeUtilities';

/**
 * Sortable wrapper around a category row. Lives inside `SortableContext`
 * (set by `SortableCategoriesList`). When a drag is active for this row,
 * the inline DOM goes to `opacity: 0` to make space for the let-pass
 * cascade — the visible drag clone is rendered by `DragOverlay`
 * (`DragOverlayCategoryRow`).
 *
 * V2 hierarchy: receives `depth` (0 = root, 1 = child) which drives
 * `padding-left = depth * INDENT_STEP_PX + 18` (V2.7 2026-05-12: base
 * bumped 14 → 18 to give the chevron 4 px breathing room on its left
 * side (between chevron container and hover-bg left edge) while keeping
 * the chevron→dot gap at ~10 px. V2.6 bumped 10 → 14; V3 had base 10.
 * For parents with `hasChildren = true`, a chevron disclosure
 * `<button>` is rendered as the leading element (16 px gutter = 10 px icon
 * + 6 px gap), with three-layer defence against dnd-kit drag activation:
 *
 *   1. `data-no-dnd="true"` so `CustomMouseSensor` short-circuits
 *   2. `onMouseDown` stopPropagation so dnd-kit's `onPointerDown` listener
 *      on the parent row never starts a drag
 *   3. Inside `onClick`, stopPropagation so the parent row's `onClick`
 *      navigation never fires — chevron click is *only* a toggle
 *
 * Plus an `onKeyDown` stopPropagation for Space / Enter so the chevron
 * focused via keyboard does not bubble into dnd-kit's row keyboard listener
 * (which would lift the row).
 *
 * @see `02_design_spec.md` V2 §2.3 (child row anatomy)
 * @see `02_design_spec.md` V2 §2.4 (chevron three-layer defence)
 * @see `02_design_spec.md` V2 §2.8 (padding-left transition 220ms)
 * @see `03_tech_plan.md` V2 §5.3 (P1-10 paddingLeft transition + P0-VIZ-2)
 * @see `.claude/rules/design-language.md` (chevron 120ms reuses `--ease-drag`)
 */
interface SortableCategoryRowProps {
  category: Category;
  isActive: boolean;
  isEditing: boolean;
  /**
   * True for the single frame after this row was just dropped. Suppresses
   * the click navigation that would otherwise fire from the synthetic
   * mouseup at drop position. Cleared by parent ~50ms later.
   * See `02_design_spec.md` V3 §2.9.
   */
  justDropped: boolean;
  /**
   * Tree depth: 0 = root, 1 = child. Drives `padding-left = depth * INDENT_STEP_PX + 18`.
   * `MAX_DEPTH = 1` is enforced in `dnd/treeUtilities` and on the Rust
   * `validate_hierarchy` side; this prop is the read-only render flag.
   *
   * Defaults to `0` so V3 (pre-hierarchy) call sites still render correctly
   * during the staged T3a-then-T3b handoff. T3a will supply the real value
   * once the call site is updated.
   * See `02_design_spec.md` V2 §6.5.
   */
  depth?: 0 | 1;
  /**
   * True when this is a parent (depth = 0) that has at least one child.
   * Drives chevron rendering. Per V2 §2.4 the chevron does *not* render at
   * all (no DOM element, no 16 px gutter) when `hasChildren = false`.
   * Defaults to `false` for V3 call-site compatibility.
   */
  hasChildren?: boolean;
  /**
   * True when this parent's children are visible. Drives chevron rotation
   * (collapsed = 0deg / expanded = 90deg) and `aria-expanded`. Ignored when
   * `hasChildren = false` — pass any value (false is conventional).
   * Defaults to `false`.
   */
  isExpanded?: boolean;
  /**
   * Toggle the expanded state of this parent. Called only when the chevron
   * `<button>` is clicked / activated by keyboard — never from a row click.
   * Defaults to a no-op (chevron only rendered when `hasChildren`).
   */
  onToggleExpanded?: () => void;
  /**
   * Render the hierarchy drop-into indicator directly under this row. The
   * indicator lives inside the sortable element so it follows dnd-kit's
   * transform instead of lagging behind as an untransformed sibling.
   */
  showDropIndicatorAfter?: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onColorChange: (color: string) => void;
}

export function SortableCategoryRow({
  category,
  isActive,
  isEditing,
  justDropped,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpanded = () => {},
  showDropIndicatorAfter = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onColorChange,
}: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    // Editing-mode rows must not be draggable (defence-in-depth — the parent
    // SortableContext is also disabled when any row is being edited).
    disabled: isEditing,
    // 220ms cascade matches `--duration-drag-reorder` in tokens; easing
    // mirrors `--ease-drag` (`cubic-bezier(0.16, 1, 0.3, 1)`).
    transition: {
      duration: 220,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
  });

  // V2 [P1-10]: extend (do not replace) the useSortable transition string so
  // a depth change after drop animates `padding-left` over 220 ms with the
  // same `--ease-drag` curve — consistent with the cascade timing the user
  // already perceives. We only enable the padding-left transition when not
  // actively dragging, otherwise the row would jitter horizontally as the
  // depth projection updates frame-by-frame during the drag.
  //
  // useSortable returns `transition` as `transform 220ms cubic-bezier(...)`
  // when settling, and `undefined` otherwise.
  const paddingTransition = isDragging ? null : 'padding-left 220ms cubic-bezier(0.16, 1, 0.3, 1)';
  const composedTransition = isDragging
    ? transition
    : transition === undefined
      ? (paddingTransition ?? undefined)
      : paddingTransition
        ? `${transition}, ${paddingTransition}`
        : transition;

  const style: CSSProperties = {
    // CSS.Translate.toString — emits only `translate3d(x, y, 0)`, no scale.
    // We must NOT use CSS.Transform.toString because dnd-kit's default
    // Transform includes scaleX/scaleY which would squeeze the row when
    // neighbours' measured rects differ (V3 explicitly forbids this).
    transform: CSS.Translate.toString(transform),
    transition: composedTransition,
    // V3 spec §2.1: the inline DOM "disappears to make space" — the visible
    // dragged clone is the DragOverlay. Using opacity 0 (not 0.4) keeps the
    // cascade visually clean. Pointer events stay live so dnd-kit can still
    // receive over/end events on the source slot if the drag returns.
    opacity: isDragging ? 0 : 1,
    // V2 hierarchy: indent expressed only via padding-left.
    // V2.7 (2026-05-12) base 14 → 18 px so the chevron has 4 px breathing
    // room between its container and the row's hover-bg left edge — user
    // reading "chevron 卡在灰色框最左边". Combined with chevron `left: 4`
    // (Tailwind `left-1`), chevron container now sits at row.left + 4..14,
    // and dot sits at row.left + 18, preserving the V2.6 chevron→dot
    // visual gap of ~10 px. Cascade: SortableCategoriesList.tsx settle
    // animation (`preDragPaddingLeft` / `finalPaddingLeft`) and DragOverlay
    // `paddingLeft` injection both use the same formula and must stay in
    // lock-step. depth=0 → 18 px; depth=1 → 34 px (18 + 16).
    paddingLeft: depth * INDENT_STEP_PX + 18,
  };

  const handleClick = (e: React.MouseEvent) => {
    // Drop fires a synthetic click on mouseup that we must swallow when the
    // pointer ends back on the source row. The 50ms guard window in the
    // parent covers the React render after onDragEnd.
    if (justDropped) {
      e.preventDefault();
      return;
    }
    onClick();
  };

  // V3 P0-2 fix: do NOT shadow dnd-kit's KeyboardSensor onKeyDown.
  // The sensor (configured with sortableKeyboardCoordinates in the parent
  // List) needs Space/Enter to lift the row for keyboard reorder. We chain:
  // run dnd-kit's listener first; only navigate on Space/Enter if it didn't
  // pre-empt the event (e.g., when keyboard drag is not active).
  const dndKeyDown = listeners?.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    dndKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  // Spread listeners but override onKeyDown with our chained handler, so
  // dnd-kit's other listeners (onPointerDown etc.) still apply.
  const { onKeyDown: _dndOnKeyDown, ...listenersWithoutKeyDown } =
    listeners ?? ({} as Record<string, unknown>);
  void _dndOnKeyDown;

  // V2 §2.4 chevron three-layer defence handlers. Defined inside the
  // component so they close over the toggle callback; aria-expanded mirrors
  // `isExpanded` (only meaningful when `hasChildren = true`).
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // layer 3: do NOT navigate; only toggle.
    onToggleExpanded();
  };

  const handleChevronMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation(); // layer 2: prevent dnd-kit's pointer-based drag activation.
  };

  const handleChevronKeyDown = (e: React.KeyboardEvent) => {
    // Space / Enter on the chevron must toggle but never bubble into the
    // row's dnd-kit KeyboardSensor (which would lift the row). All other
    // keys propagate normally so Tab navigation still works.
    if (e.key === ' ' || e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listenersWithoutKeyDown}
      // className must mirror Sidebar.tsx:295-308 exactly so the migration
      // is visually a no-op outside drag interactions. cursor (default vs
      // grabbing) is handled in CSS via [aria-roledescription='sortable'].
      // V2: padding-left moved to inline style; pr-2.5 keeps the right side.
      className={`
        relative h-8 pr-[11px] flex items-center gap-2.5 rounded-[6px] cursor-pointer
        transition-colors duration-150
        ${isActive ? 'bg-[#F4F4F5]' : 'hover:bg-[#F4F4F5]'}
      `}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {/*
        Chevron disclosure — absolute-positioned inside the row's own
        padding-left region so that it does NOT shift dot/name to the
        right. Only rendered when `hasChildren = true`; childless roots
        and depth=1 children render no chevron and no spacer, preserving
        the V3 dot position (sidebar.left + 26).

        V2.5 (2026-05-12, user feedback round 2) override of V2 §2.2
        chevron-as-flex-leading layout: making chevron a flex sibling
        pushed all root content right by 26 px (chevron 16 + gap 10).
        Spacing the leading chevron INTO the row's padding-left region
        keeps dot/name aligned with V3 while still surfacing the
        disclosure control. Cost: chevron hit-target reduces from
        16×32 to 10×32 px (still within reach; widen if click affordance
        proves unreliable).

        Geometry:
        - row.padding-left = 10 px → dot at row.left + 10
        - chevron: position: absolute; left: 0; width: 10 px
          → container occupies row.left + 0..10 (= row's own pad-left)
          → ChevronRight icon (lucide 10×10, visible glyph ~2.5 px wide
            in viewBox center) renders centered around row.left + 5
          → visual gap between chevron glyph and dot ≈ 5 px

        - Three-layer defence vs dnd-kit drag activation kept intact:
          data-no-dnd (sensor short-circuit) + onMouseDown stop (pointer
          drag bail) + onClick stop (no row nav) + onKeyDown stop on
          Space/Enter (no row lift via KeyboardSensor).
        - Icon color #A1A1AA (--color-tertiary), rotates 0deg → 90deg
          over 120 ms with `var(--ease-drag)` per design-language.md.
      */}
      {hasChildren && (
        <button
          type="button"
          data-no-dnd="true"
          data-chevron="true"
          onClick={handleChevronClick}
          onMouseDown={handleChevronMouseDown}
          onKeyDown={handleChevronKeyDown}
          aria-label={`Toggle ${category.name} children`}
          aria-expanded={isExpanded}
          tabIndex={0}
          className="absolute left-1 top-0 w-2.5 h-8 flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B]"
        >
          <ChevronRight
            size={10}
            className="text-[#A1A1AA]"
            style={{
              transition: 'transform 120ms var(--ease-drag)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              // Visual-only shift: the lucide ChevronRight path occupies
              // viewBox x=9..15 (of 24) — RIGHT-biased relative to viewBox
              // center. At size=10 inside a 10 px button container, the
              // visible glyph mass lands at row.left + ~3.7..6.7, leaving
              // only ~3.3 px gap to the dot at row.left + 10. Shifting the
              // SVG element 3 px left via marginLeft moves the visible
              // glyph to row.left + ~0.7..3.7, restoring the spec V2 §2.2
              // ~6 px chevron→dot gap.
              //
              // Why marginLeft on the SVG (not button.left: -3):
              //   1. Button hit-target stays at row.left + 0..10 — fully
              //      INSIDE the row's padding-left region (the row's
              //      visible bounds), so chevron does not appear to leak
              //      outside the row's rounded background.
              //   2. SVG's transparent canvas region (the 3 px that now
              //      sits at row.left + (-3)..0) is invisible to the user
              //      — only the colored path is drawn. The p-4 wrapper's
              //      overflow-hidden clips that 3 px transparent strip
              //      anyway, with zero visible consequence.
              //   3. Transform: rotate(90deg) for expanded state still
              //      rotates around the SVG's own center (now shifted),
              //      so the down-chevron (▾) sits at the same visual
              //      offset as the right-chevron (▸).
              marginLeft: -3,
            }}
          />
        </button>
      )}
      <CategoryRowContent
        category={category}
        showCount
        isActive={isActive}
        onColorChange={onColorChange}
      />
      {showDropIndicatorAfter && (
        <div
          className="drop-indicator-wrapper"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -2,
            paddingLeft: INDENT_STEP_PX,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <div className="drop-indicator-h" />
        </div>
      )}
    </div>
  );
}

export default SortableCategoryRow;
