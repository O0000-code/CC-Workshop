import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { Category } from '@/types';
import { DragOverlayCategoryRow } from '../DragOverlayCategoryRow';

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'Development',
    color: '#FF6B6B',
    count: 4,
    ...overrides,
  };
}

function getOverlayElement(container: HTMLElement): HTMLElement {
  const overlay = container.querySelector('div.drag-overlay-row') as HTMLElement | null;
  if (!overlay) {
    throw new Error('Could not locate .drag-overlay-row element');
  }
  return overlay;
}

describe('DragOverlayCategoryRow — depth-agnostic naked clone (V2 §2.5 / §2.22 / §11 invariant #21)', () => {
  it('uses px-2.5 on the className (no inline paddingLeft style)', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    const overlay = getOverlayElement(container);
    // 02 V2 §2.5: padding-left is hard-coded as px-2.5 on the className,
    // never via inline style. The overlay must not carry depth-derived
    // padding.
    expect(overlay.style.paddingLeft).toBe('');
    expect(overlay.className).toContain('px-2.5');
  });

  it('renders the same naked-row className regardless of source category', () => {
    const { container: c1 } = render(
      <DragOverlayCategoryRow category={buildCategory({ id: 'a', name: 'Root' })} />,
    );
    const { container: c2 } = render(
      <DragOverlayCategoryRow
        category={buildCategory({ id: 'b', name: 'Child', parentId: 'a' })}
      />,
    );
    // The overlay's outer geometry must not branch on the category's depth /
    // parent / hasChildren — that's the V3 invariant #21 contract.
    expect(getOverlayElement(c1).className).toBe(getOverlayElement(c2).className);
  });

  it('never renders an interactive chevron <button> (V2 §2.5 — non-clickable visual clone)', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    // The interactive chevron has `data-chevron="true"` (set in
    // SortableCategoryRow only). The overlay must never render it.
    expect(container.querySelector('button[data-chevron="true"]')).toBeNull();
    // No chevron-spacer either — the spacer was a P0 spec violation that
    // was reverted (the overlay must be a depth-agnostic naked clone).
    expect(container.querySelector('[data-chevron-spacer="true"]')).toBeNull();
  });

  it('omits the count number (V3 §2.2)', () => {
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory({ count: 99 })} />,
    );
    expect(container.textContent).not.toContain('99');
  });
});
