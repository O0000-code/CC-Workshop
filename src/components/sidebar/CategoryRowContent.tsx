import type { Category } from '@/types';
import { ColorPicker } from '@/components/common';

/**
 * Shared inner content of a category row — used by both the inline sortable
 * row (`SortableCategoryRow`) and the floating drag clone
 * (`DragOverlayCategoryRow`). Avoids ~60% JSX duplication between the two.
 *
 * Renders ColorPicker dot + name + (optional) count. Does NOT render the
 * outer row container — each caller wraps this with its own container so
 * they can apply their own className / event handlers.
 *
 * V2 hierarchy note: this component is **depth-agnostic**. Per
 * `02_design_spec.md` V2 §2.3 + D11, child categories share the same dot
 * size / text color / font weight as parents — hierarchy is expressed via
 * padding-left at the row wrapper level (`SortableCategoryRow`), not by
 * tweaking content visuals. The DragOverlay itself never carries any
 * chevron-related visual (per V2 §2.5 / §2.22 anti-pattern — DragOverlay is
 * a naked depth-agnostic clone), so this component does not reserve any
 * chevron-gutter space.
 *
 * @see `02_design_spec.md` V2 §2.3 (child = parent visuals + indent only)
 * @see `02_design_spec.md` V2 §2.5 (DragOverlay padding parity)
 * @see `03_tech_plan.md` V2 §5.4 (component split)
 */
interface CategoryRowContentProps {
  category: Category;
  /** When false (e.g. inside DragOverlay), the count number is hidden. */
  showCount?: boolean;
  /** Active state drives bold + darker text; ignored for DragOverlay. */
  isActive?: boolean;
  /** Color change callback. Omit when used inside DragOverlay (no editing). */
  onColorChange?: (color: string) => void;
}

export function CategoryRowContent({
  category,
  showCount = false,
  isActive = false,
  onColorChange,
}: CategoryRowContentProps) {
  return (
    <>
      {/*
        ColorPicker is wrapped with `data-no-dnd="true"` so CustomMouseSensor
        bails out before initiating a drag, AND `onMouseDown` stopPropagation
        as a second safety net (the panel renders into a portal — its events
        do not bubble through the row, but the trigger button itself sits
        inside the row and would otherwise start a drag).
        See `02_design_spec.md` V3 §2.9.
      */}
      <span
        data-no-dnd="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="inline-flex items-center"
      >
        <ColorPicker value={category.color} onChange={(color) => onColorChange?.(color)} />
      </span>

      {/* Category Name */}
      <span
        className={`
          text-[13px] flex-1 text-left truncate
          ${isActive ? 'font-medium text-[#18181B]' : 'font-normal text-[#52525B]'}
        `}
      >
        {category.name}
      </span>

      {/* Category Count (omitted in DragOverlay per spec §2.2) */}
      {showCount && (
        <span className="text-[11px] font-medium text-[#A1A1AA]">{category.count}</span>
      )}
    </>
  );
}

export default CategoryRowContent;
