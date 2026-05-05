import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import type { Category } from '@/types';
import { SortableCategoryRow } from '../SortableCategoryRow';
import { INDENT_STEP_PX } from '../dnd/treeUtilities';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PADDING_LEFT_PX = 10; // V3 base `px-2.5` = 10 px

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Development',
    color: '#FF6B6B',
    count: 4,
    ...overrides,
  };
}

interface RenderArgs {
  category?: Category;
  isActive?: boolean;
  isEditing?: boolean;
  justDropped?: boolean;
  depth?: 0 | 1;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onColorChange?: (color: string) => void;
}

/**
 * `useSortable` requires a `SortableContext` ancestor, which itself requires
 * a `DndContext`. We provide minimal wrappers so the unit tests can exercise
 * `SortableCategoryRow` in isolation without driving real drags.
 */
function renderRow(args: RenderArgs = {}) {
  const category = args.category ?? buildCategory();
  return render(
    <DndContext>
      <SortableContext items={[category.id]}>
        <SortableCategoryRow
          category={category}
          isActive={args.isActive ?? false}
          isEditing={args.isEditing ?? false}
          justDropped={args.justDropped ?? false}
          depth={args.depth ?? 0}
          hasChildren={args.hasChildren ?? false}
          isExpanded={args.isExpanded ?? false}
          onToggleExpanded={args.onToggleExpanded ?? (() => {})}
          onClick={args.onClick ?? (() => {})}
          onDoubleClick={args.onDoubleClick ?? (() => {})}
          onContextMenu={args.onContextMenu ?? (() => {})}
          onColorChange={args.onColorChange ?? (() => {})}
        />
      </SortableContext>
    </DndContext>,
  );
}

/**
 * Locate the row element (the `<div role="button">` rendered by
 * `SortableCategoryRow`). Multiple `role=button` exist in the tree because
 * the chevron is also a `<button>`; we filter to the row by class signature.
 */
function getRowElement(): HTMLElement {
  // The row container has `h-8` and the rounded class — the chevron `<button>`
  // does not. Use querySelector on the document.
  const row = document.querySelector('div.h-8.pr-2\\.5') as HTMLElement | null;
  if (!row) {
    throw new Error('Could not locate row element by class signature');
  }
  return row;
}

function getChevronButton(): HTMLElement | null {
  return document.querySelector('button[data-chevron="true"]') as HTMLElement | null;
}

// ---------------------------------------------------------------------------
// Depth + padding-left
// ---------------------------------------------------------------------------

describe('SortableCategoryRow — depth + padding', () => {
  it('depth=0 with hasChildren=true → renders chevron + paddingLeft = 10 (base only)', () => {
    renderRow({ depth: 0, hasChildren: true, isExpanded: false });
    const row = getRowElement();
    expect(row.style.paddingLeft).toBe(`${BASE_PADDING_LEFT_PX}px`);
    expect(getChevronButton()).not.toBeNull();
  });

  it('depth=1 → paddingLeft = 26 (base 10 + indent 16)', () => {
    renderRow({ depth: 1 });
    const row = getRowElement();
    expect(row.style.paddingLeft).toBe(`${BASE_PADDING_LEFT_PX + INDENT_STEP_PX}px`);
  });

  it('depth=0 + hasChildren=false → no chevron rendered (no DOM element, no 16 px gutter)', () => {
    renderRow({ depth: 0, hasChildren: false });
    expect(getChevronButton()).toBeNull();
    // Row padding-left should be exactly the V3 base — no chevron gutter.
    const row = getRowElement();
    expect(row.style.paddingLeft).toBe(`${BASE_PADDING_LEFT_PX}px`);
  });

  it('depth=1 + hasChildren=false → no chevron rendered (children never have grandchildren in MAX_DEPTH=1)', () => {
    renderRow({ depth: 1, hasChildren: false });
    expect(getChevronButton()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Chevron rotation: collapsed vs expanded
// ---------------------------------------------------------------------------

describe('SortableCategoryRow — chevron rotation', () => {
  it('isExpanded=true → ChevronRight rotated 90deg (= ChevronDown visual)', () => {
    renderRow({ depth: 0, hasChildren: true, isExpanded: true });
    const chevron = getChevronButton();
    expect(chevron).not.toBeNull();
    expect(chevron!.getAttribute('aria-expanded')).toBe('true');
    // The icon is a child <svg> with inline style transform: rotate(90deg).
    const svg = chevron!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect((svg as SVGElement).style.transform).toBe('rotate(90deg)');
  });

  it('isExpanded=false → ChevronRight rotated 0deg (right-pointing)', () => {
    renderRow({ depth: 0, hasChildren: true, isExpanded: false });
    const chevron = getChevronButton();
    expect(chevron).not.toBeNull();
    expect(chevron!.getAttribute('aria-expanded')).toBe('false');
    const svg = chevron!.querySelector('svg');
    expect((svg as SVGElement).style.transform).toBe('rotate(0deg)');
  });

  it('chevron rotation transition uses var(--ease-drag) at 120 ms (design-language token)', () => {
    renderRow({ depth: 0, hasChildren: true });
    const chevron = getChevronButton();
    const svg = chevron!.querySelector('svg');
    expect((svg as SVGElement).style.transition).toBe('transform 120ms var(--ease-drag)');
  });
});

// ---------------------------------------------------------------------------
// Click separation: chevron click vs row click
// ---------------------------------------------------------------------------

describe('SortableCategoryRow — chevron click vs row navigate', () => {
  it('chevron click → calls onToggleExpanded but NOT onClick (stopPropagation works)', () => {
    const onToggleExpanded = vi.fn();
    const onClick = vi.fn();
    renderRow({
      depth: 0,
      hasChildren: true,
      onToggleExpanded,
      onClick,
    });
    const chevron = getChevronButton();
    expect(chevron).not.toBeNull();
    // Use fireEvent.click — synthesises a single click event, which the
    // chevron's React onClick will receive synchronously. user-event's
    // pointer-event sequence (pointerdown → mousedown → pointerup → mouseup
    // → click) interacts with dnd-kit's pointer listeners on the row in
    // ways that complicate jsdom; fireEvent gives us the boundary test we
    // actually want: "did the React onClick handler fire and stop propagation".
    fireEvent.click(chevron!);
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('row click (outside chevron) → calls onClick', () => {
    const onClick = vi.fn();
    renderRow({ depth: 0, hasChildren: true, onClick });
    // Click the row container directly (the name span has truncate +
    // pointer-events: auto inherited from the row).
    const row = getRowElement();
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('chevron mouseDown handler calls stopPropagation on React synthetic event', () => {
    // Why this test exists: dnd-kit's PointerSensor / MouseSensor activate
    // via React-synthetic `onMouseDown` registered at the row. If the
    // chevron's `onMouseDown` does NOT call `stopPropagation()`, the row's
    // synthetic `onMouseDown` (and dnd-kit's listener composed into it via
    // `useSortable`'s spread `{...listeners}`) would still fire on a
    // chevron click, potentially starting a drag.
    //
    // The PRIMARY defence is `data-no-dnd="true"` (CustomMouseSensor walks
    // ancestors). This is the second safety net.
    //
    // We assert behaviourally via a spy: render a container that captures
    // `onMouseDown` at the row container (React synthetic), trigger a
    // mousedown on the chevron, and confirm that React's synthetic
    // propagation was stopped (the row's synthetic handler does not run
    // OR receives an event whose isPropagationStopped() is true).
    let rowSyntheticFired = false;
    const onRowMouseDown = (e: React.MouseEvent) => {
      void e;
      rowSyntheticFired = true;
    };
    render(
      <DndContext>
        <SortableContext items={['cat-1']}>
          <div onMouseDown={onRowMouseDown} data-test-row-wrapper="true">
            <SortableCategoryRow
              category={buildCategory()}
              isActive={false}
              isEditing={false}
              justDropped={false}
              depth={0}
              hasChildren={true}
              isExpanded={false}
              onToggleExpanded={() => {}}
              onClick={() => {}}
              onDoubleClick={() => {}}
              onContextMenu={() => {}}
              onColorChange={() => {}}
            />
          </div>
        </SortableContext>
      </DndContext>,
    );
    const chevron = getChevronButton();
    expect(chevron).not.toBeNull();
    fireEvent.mouseDown(chevron!);
    expect(rowSyntheticFired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Defence-in-depth: data-no-dnd, accessibility, click-guard
// ---------------------------------------------------------------------------

describe('SortableCategoryRow — chevron defence-in-depth attributes', () => {
  it('chevron has data-no-dnd="true" so CustomMouseSensor short-circuits', () => {
    renderRow({ depth: 0, hasChildren: true });
    const chevron = getChevronButton();
    expect(chevron!.getAttribute('data-no-dnd')).toBe('true');
  });

  it('chevron is a real <button> (not <div role="button">) per design-language Anti-pattern', () => {
    renderRow({ depth: 0, hasChildren: true });
    const chevron = getChevronButton();
    expect(chevron!.tagName).toBe('BUTTON');
  });

  it('chevron tabIndex=0 → keyboard reachable', () => {
    renderRow({ depth: 0, hasChildren: true });
    const chevron = getChevronButton();
    expect(chevron!.tabIndex).toBe(0);
  });

  it('chevron aria-label includes the category name (VoiceOver friendly)', () => {
    renderRow({
      depth: 0,
      hasChildren: true,
      category: buildCategory({ name: 'Frontend' }),
    });
    const chevron = getChevronButton();
    expect(chevron!.getAttribute('aria-label')).toBe('Toggle Frontend children');
  });
});

// ---------------------------------------------------------------------------
// V3 click guard preservation: justDropped=true must swallow row click
// ---------------------------------------------------------------------------

describe('SortableCategoryRow — V3 click guard preserved', () => {
  it('justDropped=true → row click does NOT call onClick (50ms guard window)', () => {
    const onClick = vi.fn();
    renderRow({ justDropped: true, onClick });
    const row = getRowElement();
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });
});
