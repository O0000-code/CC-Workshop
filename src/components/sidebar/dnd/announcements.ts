import type { Announcements, ScreenReaderInstructions } from '@dnd-kit/core';

/**
 * Screen-reader instructions shown when the user focuses a draggable item.
 * Tells assistive-tech users how to operate the keyboard sensor.
 */
export const sidebarScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a sortable item, press space or enter. While dragging, use arrow keys to move. Press space or enter to drop, escape to cancel.',
};

interface NamedItem {
  id: string;
  name: string;
}

/**
 * Optional hierarchy context for announcements. When supplied (Categories
 * with depth-2 hierarchy), announcements gain "moved to child of {parent}"
 * / "promoted to root level" / "moved to root level" phrasing on drag end
 * (per `02_design_spec.md` V2 §3 keyboard / A11y table). When omitted (Tags,
 * V3-style category lists during the migration window), the announcements
 * degrade gracefully to the V3 "was dropped at position N" wording.
 *
 * Field semantics (aligned with `03_tech_plan.md` V2 §5.6):
 * - `parentMap`: childId → parentName. Built by the host component via
 *   `useMemo` over the canonical `Category[]` (NOT the flattened list, so
 *   it covers all parent relationships even when children are collapsed).
 * - `expandedSet`: ids of currently-expanded parents. Aligned with
 *   `02_design_spec.md` V2 §2.15 "set contains id ⇒ expanded" semantics.
 *   Reserved for future ←/→ collapse/expand announcements (per spec §3).
 * - `dropProjectionRef`: live cursor onto the host's last-known projection
 *   for the active row, written during drag-move and cleared on drag-end.
 *   Lets the announcement layer see the *post-drop* parent that the host
 *   has already committed to (active row's `newParentId`), not just the
 *   over-row's parent (which is one hop too shallow for promote / cross-
 *   parent transitions). Final-audit P1-4 fix.
 */
export interface HierarchyContext {
  parentMap: Map<string, string>;
  expandedSet: Set<string>;
  dropProjectionRef?: {
    current: { activeId: string; oldParentId: string | null; newParentId: string | null } | null;
  };
}

/**
 * Build accessible drag announcements for a sortable list. Critically, all
 * announcements reference the human-readable `name` of each item (e.g.
 * "Coding") rather than the underlying UUID — see `03_tech_plan.md` V3 §12
 * and the V3 review note about VoiceOver speaking UUIDs being unusable.
 *
 * Args:
 * - `items`: the current ordered list of sortable items (id + name).
 * - `label`: the kind of item being announced ("category" | "tag"); shapes
 *   the natural-language phrasing.
 * - `hierarchy` (optional): when supplied, drag-end announcements include
 *   "moved to child of {parentName}" phrasing. Tags pass `undefined`.
 *   See `02_design_spec.md` V2 §3.
 */
export function makeAnnouncements(
  items: NamedItem[],
  label: 'category' | 'tag',
  hierarchy?: HierarchyContext,
): Announcements {
  const findName = (id: string | number): string => {
    const found = items.find((item) => item.id === String(id));
    return found ? found.name : String(id);
  };

  const findPosition = (id: string | number): number => {
    const idx = items.findIndex((item) => item.id === String(id));
    return idx === -1 ? -1 : idx + 1;
  };

  const total = items.length;

  return {
    onDragStart({ active }) {
      const name = findName(active.id);
      const position = findPosition(active.id);
      return `Picked up ${label} ${name}. Position ${position} of ${total}.`;
    },
    onDragOver({ active, over }) {
      const activeName = findName(active.id);
      if (!over) {
        return `${
          label.charAt(0).toUpperCase() + label.slice(1)
        } ${activeName} is no longer over a droppable area.`;
      }
      const overName = findName(over.id);
      const overPosition = findPosition(over.id);
      return `${
        label.charAt(0).toUpperCase() + label.slice(1)
      } ${activeName} was moved over ${label} ${overName} at position ${overPosition} of ${total}.`;
    },
    onDragEnd({ active, over }) {
      const activeName = findName(active.id);
      if (!over) {
        return `${
          label.charAt(0).toUpperCase() + label.slice(1)
        } ${activeName} was dropped outside of a droppable area.`;
      }
      if (active.id === over.id) {
        return `${
          label.charAt(0).toUpperCase() + label.slice(1)
        } ${activeName} was dropped in its original position.`;
      }
      // V2 hierarchy: enrich announcement with parent change info.
      // Final-audit P1-4: prefer the host's `dropProjectionRef` (which
      // reflects the projection at the moment the user released the drag —
      // i.e. the parent the row is *actually* moving to) over the
      // pre-drop `parentMap`. The ref is populated by the host
      // (SortableCategoriesList) during drag-move and cleared on drag-
      // start; reading it here lets us phrase promote / demote / cross-
      // parent transitions correctly.
      const cap = label.charAt(0).toUpperCase() + label.slice(1);
      if (hierarchy) {
        const proj = hierarchy.dropProjectionRef?.current;
        if (proj && proj.activeId === String(active.id)) {
          const { oldParentId, newParentId } = proj;
          if (newParentId !== oldParentId) {
            // Parent changed — pick phrasing per spec V2 §3 announcements
            // table (HIG NSOutlineView vocabulary).
            if (newParentId === null) {
              // Was a child → now a root: promote.
              if (oldParentId !== null) {
                return `${cap} ${activeName} promoted to root level.`;
              }
              // Was already root and stayed root — fall through.
            } else {
              const newParentName = items.find((it) => it.id === newParentId)?.name ?? newParentId;
              if (oldParentId === null) {
                // Was root → now a child: demote.
                return `${cap} ${activeName} moved to child of ${newParentName}.`;
              }
              // Was already a child of A, now child of B: cross-parent.
              return `${cap} ${activeName} moved to child of ${newParentName}.`;
            }
          }
        }
        // Fallback: parentMap-based "moved to child of" hint when projection
        // ref is unavailable (e.g. keyboard drag without dwell timer).
        const overParent = hierarchy.parentMap.get(String(over.id));
        if (overParent) {
          return `${cap} ${activeName} moved to child of ${overParent}.`;
        }
      }
      const overName = findName(over.id);
      const overPosition = findPosition(over.id);
      return `${cap} ${activeName} was dropped at position ${overPosition} of ${total}, replacing ${label} ${overName}.`;
    },
    onDragCancel({ active }) {
      const activeName = findName(active.id);
      return `Dragging was cancelled. ${
        label.charAt(0).toUpperCase() + label.slice(1)
      } ${activeName} was returned to its original position.`;
    },
  };
}
