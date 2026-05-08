import type { Category } from '@/types';
import { CategoryRowContent } from './CategoryRowContent';

/**
 * Visible drag clone shown inside `<DragOverlay>` while a category row is
 * being dragged. The inline source row goes to `opacity: 0`; this component
 * is the user-perceived "lifted" element.
 *
 * Visuals (multi-layer hsl shadow, 6 px radius, white background, grabbing
 * cursor) come from the `.drag-overlay-row` class in `src/index.css` —
 * see `02_design_spec.md` V3 §2.2 and `03_tech_plan.md` V3 §10.
 *
 * Per spec V3 §2.2 the count number is omitted in the overlay.
 *
 * **V2 hierarchy invariant #21 (02 V2 §2.5 + §2.22 + §11)**: this component
 * **does not accept** `depth`, `paddingLeft`, or `hasChildren` props.
 * `padding-left` is hard-coded as `px-2.5` (10 px) regardless of the source
 * row's depth — the overlay is a "naked row" by design. Drop indicator +
 * inline source row's projected paddingLeft are the channels that express
 * hierarchy depth during a drag; the DragOverlay itself stays depth-agnostic
 * so it always equals the picked-up row's CURRENT visual (V3 strict
 * hand-tracking — equals current form, not future form).
 *
 * Adding `depth` / `paddingLeft` / `hasChildren` props here is listed as an
 * explicit anti-pattern in 02 V2 §2.22 — do not re-introduce.
 *
 * @see `02_design_spec.md` V2 §2.5 (DragOverlay padding-left invariant)
 * @see `02_design_spec.md` V2 §2.22 (anti-pattern listing)
 * @see `02_design_spec.md` V2 §11 (V3 invariant #21)
 */
interface DragOverlayCategoryRowProps {
  category: Category;
  /**
   * V2.2 D6 (2026-05-08, src=02 V2.2 §2.13 / §2.14 / _synthesis_decisions D6):
   * When `true`, the drop is currently in a D5-invalid configuration
   * (a parent-with-children would become a child of another root). The
   * overlay drops to `opacity: 0.5` and the cursor switches to `not-allowed`,
   * matching V3 cancel-state visual semantics. Switching is instantaneous —
   * no fade transition (per 02 V2 §2.14 + §2.22 anti-pattern).
   *
   * Default `false` keeps every other call site visually identical to V3.
   */
  isInvalid?: boolean;
}

export function DragOverlayCategoryRow({
  category,
  isInvalid = false,
}: DragOverlayCategoryRowProps) {
  return (
    <div
      className="drag-overlay-row h-8 px-2.5 flex items-center gap-2.5"
      style={isInvalid ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
    >
      <CategoryRowContent category={category} showCount={false} />
    </div>
  );
}

export default DragOverlayCategoryRow;
