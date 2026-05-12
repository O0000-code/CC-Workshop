import { useMemo, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DropAnimation } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';

import type { Tag } from '@/types';
import { CustomMouseSensor } from './dnd/CustomMouseSensor';
import { TAG_DROP_ANIMATION } from './dnd/animations';
import { makeAnnouncements, sidebarScreenReaderInstructions } from './dnd/announcements';
import { snapModifier } from './dnd/snapModifier';
import { SortableTagPill } from './SortableTagPill';
import { DragOverlayTagPill } from './DragOverlayTagPill';
import { TagInlineInput } from './TagInlineInput';

/**
 * 2D wrap drag-and-drop container for the Sidebar Tags section. Mirrors
 * `SortableCategoriesList` (T8) but uses `rectSortingStrategy` because tags
 * wrap across multiple rows.
 *
 * Architectural decisions (V3 — see `03_tech_plan.md` §7.1):
 * - **`DndContext.modifiers = [snapModifier]`** only. We do NOT apply
 *   `restrictToVerticalAxis` (Tags are 2D wrap) nor `restrictToParentElement`
 *   (V3 removed it to fix the X=0 follow-finger bug). The sortable strategy
 *   itself handles let-pass direction.
 * - **`<DragOverlay modifiers={[restrictToWindowEdges]}>`** keeps the
 *   floating clone from leaving the viewport but otherwise lets it follow the
 *   pointer freely.
 * - **`measuring.droppable.strategy = MeasuringStrategy.Always`** is required
 *   for wrap layouts so let-pass calculations stay accurate as siblings
 *   shift between rows mid-drag.
 * - **Container `minHeight`** prevents the wrap container from snapping to
 *   shorter heights mid-drag (which would re-flow the rest of the sidebar).
 *   We use `max(1, ceil(tags.length / 4)) * 28 px` — assuming ~4 pills per
 *   row at typical widths, with a single-row floor.
 * - **`SortableContext.disabled = isAddingTag || editingTagId !== null`** —
 *   list-wide disable rather than per-pill, so the inline add input's
 *   keyboard / click events don't accidentally activate a sibling sortable.
 * - **`+N / Less` button is wrapped in `data-no-dnd="true"`** so clicking it
 *   to expand/collapse never trips the CustomMouseSensor activator.
 * - **`distance-aware dropAnimation`** — when a drop lands within 4px of
 *   target (i.e. snapModifier already aligned it), we set `dropAnimation` to
 *   `null` and the overlay disappears instantly; otherwise we compute a
 *   `min(280, 120 + dist*0.5)` ms cubic-bezier(0.16, 1, 0.3, 1) settle.
 *
 * Folded-state auto-expand: if the user starts dragging while the list is
 * collapsed (`showAll === false` and `tags.length > maxVisible`), `onDragStart`
 * eagerly calls `setShowAll(true)` so the overflow tags become valid drop
 * targets. Per spec §2.10, we do NOT auto-collapse on drop.
 *
 * @see `02_design_spec.md` V3 §2.4 (cascade), §2.5 (snap), §2.6 (settle), §2.10
 * @see `03_tech_plan.md` V3 §7.1 (Tags DndContext template)
 */
interface SortableTagsListProps {
  tags: Tag[];
  /**
   * Tag ids currently in the active filter set (controls which pills render
   * with the dark "selected" background, both in-place and in the overlay).
   */
  activeTagIds: string[];
  editingTagId: string | null;
  isAddingTag: boolean;
  showAll: boolean;
  setShowAll: (show: boolean) => void;
  /** Cap before "+N" button appears (matches Sidebar's `MAX_VISIBLE_TAGS = 10`). */
  maxVisible: number;
  onReorder: (orderedIds: string[]) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onTagClick: (tagId: string) => void;
  onTagDoubleClick: (tagId: string) => void;
  onTagContextMenu: (tag: Tag, e: ReactMouseEvent) => void;
  /** id === null when saving from the "add" inline input. */
  onTagSave: (id: string | null, name: string) => void;
  onTagEditCancel: () => void;
}

export function SortableTagsList({
  tags,
  activeTagIds,
  editingTagId,
  isAddingTag,
  showAll,
  setShowAll,
  maxVisible,
  onReorder,
  onDragStart,
  onDragEnd,
  onTagClick,
  onTagDoubleClick,
  onTagContextMenu,
  onTagSave,
  onTagEditCancel,
}: SortableTagsListProps) {
  // CustomMouseSensor: 4px activation distance (the project-wide drag/click
  // discriminator — see `02_design_spec.md` V3 §2.1) plus respect for
  // `data-no-dnd` ancestors via the subclass's overridden activator.
  const sensors = useSensors(
    useSensor(CustomMouseSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  // Initial value is the symmetric default (`TAG_DROP_ANIMATION`) — onDragEnd
  // recomputes per drop based on distance; null means "skip the dropAnimation".
  const [dropAnimationConfig, setDropAnimationConfig] = useState<DropAnimation | null>(
    TAG_DROP_ANIMATION,
  );

  const activeTag = useMemo(() => tags.find((t) => t.id === activeId) ?? null, [tags, activeId]);

  // Visible / overflow split. We keep this derivation here (rather than at
  // the call site) so SortableContext.items always matches what's actually
  // rendered — the +N button and overflow tags both stay out of the items
  // array when collapsed.
  const visibleTags = showAll ? tags : tags.slice(0, maxVisible);
  const remainingCount = tags.length - maxVisible;

  // Reserve container height to prevent wrap-row count from collapsing
  // mid-drag (which would shake the rest of the sidebar). 28px per row
  // matches the pill height (~26px) + gap (~2px effective). Floor at 1 row.
  //
  // Use `visibleTags.length`, not `tags.length`: when the list is collapsed
  // (showAll === false) tags hold the full 30+ count but only 10 are
  // rendered, so `tags.length / 4` produces a minHeight far above the
  // actual content. Combined with flex-wrap's default `align-content:
  // stretch`, the extra space stretches between rows and makes the section
  // look spaced-out — see auto-classify session screenshot.
  const minHeight = `${Math.max(1, Math.ceil(visibleTags.length / 4)) * 28}px`;

  const handleDragStart = (event: DragStartEvent) => {
    // Auto-expand collapsed list so overflow tags become valid drop targets
    // (§2.10). We don't auto-collapse on drop — staying expanded matches the
    // user's "I just touched these items" mental model.
    if (!showAll && tags.length > maxVisible) {
      setShowAll(true);
    }
    setActiveId(String(event.active.id));
    onDragStart();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const wasReorder = over !== null && active.id !== over.id;

    // Distance-aware dropAnimation (V3 §2.6 / §7.2): if the snapModifier
    // already aligned the overlay to within 4px of the target slot center,
    // skip the settle animation entirely (it would just play a 220ms
    // no-op). Otherwise scale duration by distance, capped at 280ms.
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
    } else {
      // Drop with no `over` (released outside any slot) — restore default so
      // the next drag cycle has a sane fallback.
      setDropAnimationConfig(TAG_DROP_ANIMATION);
    }

    const droppedId = String(active.id);
    setActiveId(null);
    onDragEnd();

    if (wasReorder) {
      const oldIdx = tags.findIndex((t) => t.id === active.id);
      const newIdx = tags.findIndex((t) => t.id === over!.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        onReorder(arrayMove(tags, oldIdx, newIdx).map((t) => t.id));
      }
    }

    // Suppress the click event that fires on mouseup-after-drop on the
    // original pill. SortableTagPill checks `justDropped` and bails out of
    // its onClick. 50ms is enough to outlast the synthetic click; longer
    // than that and a fast user could miss a real click.
    setJustDroppedId(droppedId);
    setTimeout(() => setJustDroppedId(null), 50);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    // V3 P2-3: reset to default so next drag starts clean.
    setDropAnimationConfig(TAG_DROP_ANIMATION);
    onDragEnd();
  };

  const containerStyle: CSSProperties = { minHeight };

  // Empty state: no tags AND not currently adding → flat "No tags" message,
  // matches Sidebar.tsx:483-494. We render NO DndContext here — there's
  // nothing to sort and no overlay to render, so the lighter render path
  // also avoids setting up sensors needlessly.
  if (tags.length === 0 && !isAddingTag) {
    return (
      <div className="flex flex-wrap gap-1.5">
        <p className="text-xs text-[#A1A1AA] px-2.5">No tags</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[snapModifier]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements: makeAnnouncements(tags, 'tag'),
        screenReaderInstructions: sidebarScreenReaderInstructions,
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={tags.map((t) => t.id)}
        strategy={rectSortingStrategy}
        disabled={isAddingTag || editingTagId !== null}
      >
        <div
          data-sortable-list
          className="flex flex-wrap content-start gap-1.5"
          style={containerStyle}
        >
          {visibleTags.map((tag) => {
            const isEditing = editingTagId === tag.id;

            // Edit mode: replace the pill entirely with the inline input.
            // The input lives inside the wrap container but OUTSIDE the
            // SortableContext.items array (we feed `tags.map(t => t.id)`),
            // so dnd-kit treats it as inert layout, not a sortable.
            if (isEditing) {
              return (
                <TagInlineInput
                  key={tag.id}
                  mode="edit"
                  tag={tag}
                  onSave={(name) => onTagSave(tag.id, name)}
                  onCancel={onTagEditCancel}
                />
              );
            }

            return (
              <SortableTagPill
                key={tag.id}
                tag={tag}
                isActive={activeTagIds.includes(tag.id)}
                isEditing={false}
                justDropped={justDroppedId === tag.id}
                onClick={() => onTagClick(tag.id)}
                onDoubleClick={() => onTagDoubleClick(tag.id)}
                onContextMenu={(e) => onTagContextMenu(tag, e)}
              />
            );
          })}

          {/* "+N" / "Less" button. Wrapped in data-no-dnd so clicking the
              button never trips CustomMouseSensor's activator (otherwise a
              clean click on the toggle could be swallowed if the user moves
              ≥ 4px while pressing). */}
          {remainingCount > 0 && (
            <div data-no-dnd="true">
              <button
                type="button"
                onClick={() => setShowAll(!showAll)}
                className="px-2.5 py-[5px] rounded text-[11px] font-medium text-[#A1A1AA] border border-[#E5E5E5] hover:bg-[#F4F4F5] transition-colors"
                aria-label={showAll ? 'Show less tags' : `Show ${remainingCount} more tags`}
              >
                {showAll ? 'Less' : `+${remainingCount}`}
              </button>
            </div>
          )}

          {/* Inline add input rendered at the end of the wrap. Outside the
              SortableContext.items array — same rationale as edit mode. */}
          {isAddingTag && (
            <TagInlineInput
              mode="add"
              onSave={(name) => onTagSave(null, name)}
              onCancel={onTagEditCancel}
            />
          )}
        </div>
      </SortableContext>

      <DragOverlay modifiers={[restrictToWindowEdges]} dropAnimation={dropAnimationConfig}>
        {activeTag && (
          <DragOverlayTagPill tag={activeTag} isActive={activeTagIds.includes(activeTag.id)} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default SortableTagsList;
