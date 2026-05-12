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
  it('uses pl-2.5 + pr-[11px] on the className (no inline paddingLeft style)', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    const overlay = getOverlayElement(container);
    // V2.9 (2026-05-12): split V3 `px-2.5` into `pl-2.5 pr-[11px]` so the
    // overlay's right padding (11 px) matches the inline row's pr-[11px]
    // — keeping count/name right-alignment consistent with Library nav
    // items (whose 1 px border consumed 1 px from the right). Padding-left
    // is still hard-coded via className when no paddingLeft prop supplied.
    expect(overlay.style.paddingLeft).toBe('');
    expect(overlay.className).toContain('pl-2.5');
    expect(overlay.className).toContain('pr-[11px]');
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
    // No chevron-spacer either: V2.5 (2026-05-12) moved the inline chevron
    // to absolute positioning inside the row's own padding-left region, so
    // the inline source row no longer reserves a flex-leading 16 px slot.
    // The overlay therefore needs no compensating spacer to align dot/text.
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
  it('paddingLeft undefined (default): keeps the pl-2.5 baseline className', () => {
    const { container } = render(<DragOverlayCategoryRow category={buildCategory()} />);
    const overlay = getOverlayElement(container);
    // V2.9 (2026-05-12): `px-2.5` split into `pl-2.5 pr-[11px]` so the
    // overlay's right edge matches inline row alignment.
    expect(overlay.className).toContain('pl-2.5');
    expect(overlay.className).toContain('pr-[11px]');
    expect(overlay.style.paddingLeft).toBe('');
  });

  it('paddingLeft=18 (root active): inline paddingLeft 18 px, pr-[11px] only (no pl-2.5)', () => {
    // V2.7 (2026-05-12): root paddingLeft widened 14 → 18 px so the
    // chevron has 4 px breathing room from the hover-bg left edge.
    // V2.9: pr widened 2.5 → [11px] to match inline row count alignment.
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory()} paddingLeft={18} />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('18px');
    expect(overlay.className).toContain('pr-[11px]');
    expect(overlay.className).not.toContain('pl-2.5');
  });

  it('paddingLeft=34 (child active): inline paddingLeft 34 px so dot/text align with inline depth=1 row', () => {
    // The bug this fixes: pre-V2.3 the overlay was always px-2.5 (10 px),
    // so dropping a child active showed a right-jump after unmount.
    // V2.7 (2026-05-12): child padding follows base 18 + indent 16 = 34.
    // V2.9 (2026-05-12): pr widened 2.5 → [11px] for count alignment.
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory({ parentId: 'p' })} paddingLeft={34} />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('34px');
    expect(overlay.className).toContain('pr-[11px]');
    expect(overlay.className).not.toContain('pl-2.5');
  });

  it('paddingLeft + isInvalid combine without conflict', () => {
    const { container } = render(
      <DragOverlayCategoryRow category={buildCategory()} paddingLeft={34} isInvalid />,
    );
    const overlay = getOverlayElement(container);
    expect(overlay.style.paddingLeft).toBe('34px');
    expect(overlay.style.opacity).toBe('0.5');
    expect(overlay.style.cursor).toBe('not-allowed');
  });
});
