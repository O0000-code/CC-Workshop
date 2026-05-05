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
 * `padding-left = depth * INDENT_STEP_PX + 10` (10 px is the V3 base
 * `px-2.5`). For parents with `hasChildren = true`, a chevron disclosure
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
   * Tree depth: 0 = root, 1 = child. Drives `padding-left = depth * INDENT_STEP_PX + 10`.
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
    // V2 hierarchy: indent expressed only via padding-left. Base 10 px
    // (V3 `px-2.5`) is preserved so depth = 0 rows remain pixel-identical
    // to V3. depth = 1 → 26 px (10 + 16).
    paddingLeft: depth * INDENT_STEP_PX + 10,
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
        h-8 pr-2.5 flex items-center gap-2.5 rounded-[6px] cursor-pointer
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
        V2 §2.4 chevron disclosure — rendered ONLY when `hasChildren` is
        true. When false, no DOM element exists (no 16 px gutter), so a
        leaf parent row is pixel-identical to V3.
        - Width 16 px (10 chevron + 6 gap, per §2.2)
        - Icon 10×10, color #A1A1AA (--color-tertiary)
        - rotate(0deg) collapsed → rotate(90deg) expanded over 120 ms
          using `var(--ease-drag)` (per design-language.md "Chevron /
          disclosure rotation" + Anti-pattern "non-token easing")
        - Single ChevronRight + transform: rotate (NOT two icons swap), so
          the rotation animation actually plays each toggle.
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
          className="w-4 h-8 flex items-center justify-start cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#18181B] flex-shrink-0"
        >
          <ChevronRight
            size={10}
            className="text-[#A1A1AA]"
            style={{
              transition: 'transform 120ms var(--ease-drag)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
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
    </div>
  );
}

export default SortableCategoryRow;
