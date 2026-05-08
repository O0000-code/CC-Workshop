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

// ---------------------------------------------------------------------------
// V2.2 D6 — D5-invalid visual feedback
// ---------------------------------------------------------------------------

describe('DragOverlayCategoryRow — V2.2 D6 isInvalid prop', () => {
  it('default render (no isInvalid) carries no opacity/cursor inline style', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    const overlay = getOverlayElement(container);
    expect(overlay.style.opacity).toBe('');
    expect(overlay.style.cursor).toBe('');
  });

  it('isInvalid=true sets opacity 0.5 and cursor not-allowed', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} isInvalid />);
    const overlay = getOverlayElement(container);
    expect(overlay.style.opacity).toBe('0.5');
    expect(overlay.style.cursor).toBe('not-allowed');
  });

  it('isInvalid=false renders identically to default (no inline style)', () => {
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory()} isInvalid={false} />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.opacity).toBe('');
    expect(overlay.style.cursor).toBe('');
  });
});

// ---------------------------------------------------------------------------
// V2.3 D9 — pre-drag depth padding
// ---------------------------------------------------------------------------

describe('DragOverlayCategoryRow — V2.3 D9 paddingLeft prop', () => {
  it('paddingLeft undefined (default): keeps the V3 px-2.5 baseline className', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    const overlay = getOverlayElement(container);
    // Tailwind px-2.5 className still applies (V3 invariant #21 baseline).
    expect(overlay.className).toContain('px-2.5');
    expect(overlay.style.paddingLeft).toBe('');
  });

  it('paddingLeft=10 (root active): inline paddingLeft 10 px, pr-2.5 only', () => {
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory()} paddingLeft={10} />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('10px');
    expect(overlay.className).toContain('pr-2.5');
    expect(overlay.className).not.toContain('px-2.5');
  });

  it('paddingLeft=26 (child active): inline paddingLeft 26 px so dot/text align with inline depth=1 row', () => {
    // The bug this fixes: pre-V2.3 the overlay was always px-2.5 (10 px),
    // so dropping a child active showed a 16 px right-jump after unmount.
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory({ parentId: 'p' })} paddingLeft={26} />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('26px');
    expect(overlay.className).toContain('pr-2.5');
    expect(overlay.className).not.toContain('px-2.5');
  });

  it('paddingLeft + isInvalid combine without conflict', () => {
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory()} paddingLeft={26} isInvalid />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('26px');
    expect(overlay.style.opacity).toBe('0.5');
    expect(overlay.style.cursor).toBe('not-allowed');
  });
});
