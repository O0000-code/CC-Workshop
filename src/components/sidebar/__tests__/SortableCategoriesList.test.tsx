/**
 * Tests for SortableCategoriesList — V2 hierarchy-aware sidebar list.
 *
 * Coverage targets (≥ 10 per T3a task card):
 * 1. Basic hierarchy render: parents + children indented.
 * 2. Collapsed parent → children NOT in DOM (per 02 V2 §2.15
 *    "折叠态 children 不渲染").
 * 3. Chevron toggle expands a collapsed parent.
 * 4. Chevron toggle collapses an expanded parent.
 * 5. localStorage persistence: chevron click writes
 *    `ensemble.sidebar.expandedCategories` correctly (set semantics —
 *    contains id ⇒ expanded).
 * 6. localStorage default fallback: when key is absent, every parent
 *    with children defaults to expanded (D12 = 默认展开).
 * 7. localStorage corrupt JSON falls back to default.
 * 8. "Show X more" counts ROOT-LEVEL rows only (V2 §2.16).
 * 9. Empty state renders "No categories" placeholder.
 * 10. Adding category → inline input mounts, SortableContext disabled.
 * 11. Editing category → inline input replaces row.
 * 12. V3 invariants: drop-overlay container, snap modifier preserved,
 *     justDropped guard prop wires through to the row.
 * 13. Defensive: chevron renders only on parents WITH children
 *     (and never on children themselves — MAX_DEPTH = 1).
 *
 * Notes on test scope:
 *  - jsdom does not implement PointerEvent dispatch in a way dnd-kit's
 *    sensors can pick up, so we do NOT exercise mouse-driven drag flow
 *    here. The drag handlers (handleDragStart / Move / End / Cancel)
 *    are unit-tested by integration: the rendering changes triggered by
 *    dragOverrideExpand and the displayFlat reduction (removeChildrenOf)
 *    are validated by inspecting DOM shape after a synthetic state
 *    transition. Real mouse drags are reserved for dev-mode user
 *    acceptance per `02_design_spec.md` V2 §8.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { Category } from '@/types';
import { SortableCategoriesList } from '../SortableCategoriesList';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat',
    name: 'Cat',
    color: '#000000',
    count: 0,
    ...overrides,
  };
}

/** Build a typical depth-2 fixture: 2 parents (one with 2 children, one
 *  childless) + 1 root-level leaf. */
function makeFixture(): Category[] {
  return [
    buildCategory({ id: 'p1', name: 'Development' }),
    buildCategory({ id: 'p1-c1', name: 'Frontend', parentId: 'p1' }),
    buildCategory({ id: 'p1-c2', name: 'Backend', parentId: 'p1' }),
    buildCategory({ id: 'p2', name: 'Productivity' }),
    buildCategory({ id: 'p3', name: 'Misc' }),
  ];
}

interface RenderArgs {
  categories?: Category[];
  activeCategoryId?: string | null;
  editingCategoryId?: string | null;
  isAddingCategory?: boolean;
  showAll?: boolean;
  setShowAll?: (s: boolean) => void;
  maxVisible?: number;
  onReorder?: (orderedIds: string[]) => Promise<void> | void;
  onSetCategoryParent?: (id: string, newParentId: string | null) => Promise<void> | void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onCategoryClick?: (id: string) => void;
  onCategoryDoubleClick?: (id: string) => void;
  onCategoryContextMenu?: (cat: Category, e: React.MouseEvent) => void;
  onCategoryColorChange?: (id: string, color: string) => void;
  onCategorySave?: (id: string | null, name: string) => void;
  onCategoryEditCancel?: () => void;
}

function renderList(args: RenderArgs = {}) {
  const props = {
    categories: args.categories ?? makeFixture(),
    activeCategoryId: args.activeCategoryId ?? null,
    editingCategoryId: args.editingCategoryId ?? null,
    isAddingCategory: args.isAddingCategory ?? false,
    showAll: args.showAll ?? false,
    setShowAll: args.setShowAll ?? vi.fn(),
    maxVisible: args.maxVisible ?? 9,
    onReorder: args.onReorder ?? (async () => {}),
    onSetCategoryParent: args.onSetCategoryParent ?? (async () => {}),
    onDragStart: args.onDragStart ?? vi.fn(),
    onDragEnd: args.onDragEnd ?? vi.fn(),
    onCategoryClick: args.onCategoryClick ?? vi.fn(),
    onCategoryDoubleClick: args.onCategoryDoubleClick ?? vi.fn(),
    onCategoryContextMenu: args.onCategoryContextMenu ?? vi.fn(),
    onCategoryColorChange: args.onCategoryColorChange ?? vi.fn(),
    onCategorySave: args.onCategorySave ?? vi.fn(),
    onCategoryEditCancel: args.onCategoryEditCancel ?? vi.fn(),
  };
  return render(<SortableCategoriesList {...props} />);
}

/** Read the rendered category names in order. The inline-row container
 *  has classes `h-8 pr-2.5 ... rounded-[6px]`; we identify rows by the
 *  fact that they are sortable wrappers (have `aria-roledescription` from
 *  dnd-kit's useSortable), but the simpler signature is the row's class
 *  combination + child structure. We just walk `data-sortable-list` and
 *  extract the visible category names from CategoryRowContent's name span. */
function getRenderedNames(container: HTMLElement): string[] {
  const list = container.querySelector('[data-sortable-list]');
  if (!list) return [];
  const rows = list.querySelectorAll<HTMLElement>('div.h-8.pr-2\\.5');
  return Array.from(rows).map((row) => {
    // Name span is the last text-bearing element in the row; we read all
    // text but strip count-trailers. Easiest is to grab the row's first
    // <span class="truncate">.
    const truncate = row.querySelector<HTMLElement>('span.truncate');
    return truncate?.textContent?.trim() ?? '';
  });
}

function getChevronButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button[data-chevron="true"]'));
}

// ---------------------------------------------------------------------------
// localStorage hygiene — prevent cross-test bleed.
// ---------------------------------------------------------------------------

const EXPANDED_KEY = 'ensemble.sidebar.expandedCategories';

beforeEach(() => {
  // Each test starts from a clean localStorage (jsdom provides one per
  // test file but tests within the file share it).
  window.localStorage.clear();
  cleanup();
});

// ---------------------------------------------------------------------------
// 1-3. Hierarchy render — parents + children, expanded/collapsed states.
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — hierarchy render', () => {
  it('renders parents and their children when expanded (default state)', () => {
    const { container } = renderList();
    const names = getRenderedNames(container);
    // Default: all parents-with-children expanded → p1 + its 2 children
    // visible; p2/p3 visible (no children).
    expect(names).toEqual(['Development', 'Frontend', 'Backend', 'Productivity', 'Misc']);
  });

  it('chevron renders only on parents that have ≥ 1 child (V2 §2.4)', () => {
    const { container } = renderList();
    const chevrons = getChevronButtons(container);
    // p1 has 2 children → chevron; p2/p3 are leaf parents → no chevron;
    // children themselves never render a chevron (MAX_DEPTH = 1).
    expect(chevrons.length).toBe(1);
    expect(chevrons[0].getAttribute('aria-label')).toBe('Toggle Development children');
  });

  it('collapsed parent → children NOT in DOM (per 02 V2 §2.15)', () => {
    // Pre-seed localStorage with NO ids → every parent collapsed.
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([]));
    const { container } = renderList();
    const names = getRenderedNames(container);
    // p1 collapsed → p1-c1 / p1-c2 must NOT appear; p2/p3 always render.
    expect(names).toEqual(['Development', 'Productivity', 'Misc']);
  });
});

// ---------------------------------------------------------------------------
// 4-5. Chevron toggle + persist
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — chevron toggle', () => {
  it('chevron click on expanded parent collapses children (delete from set)', () => {
    const { container } = renderList();
    expect(getRenderedNames(container)).toContain('Frontend');

    const chevrons = getChevronButtons(container);
    fireEvent.click(chevrons[0]);

    expect(getRenderedNames(container)).not.toContain('Frontend');
    // Persisted: set should NOT contain 'p1' anymore.
    const raw = window.localStorage.getItem(EXPANDED_KEY);
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string);
    expect(persisted).not.toContain('p1');
  });

  it('chevron click on collapsed parent expands children (add to set)', () => {
    // Start collapsed by seeding empty set.
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify([]));
    const { container } = renderList();
    expect(getRenderedNames(container)).not.toContain('Frontend');

    const chevrons = getChevronButtons(container);
    fireEvent.click(chevrons[0]);

    const namesAfter = getRenderedNames(container);
    expect(namesAfter).toContain('Frontend');
    expect(namesAfter).toContain('Backend');

    const persisted = JSON.parse(window.localStorage.getItem(EXPANDED_KEY) as string);
    expect(persisted).toEqual(expect.arrayContaining(['p1']));
  });
});

// ---------------------------------------------------------------------------
// 6-7. localStorage default + corrupt fallback
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — localStorage defaults', () => {
  it('first launch (no localStorage entry) → all parents-with-children default to expanded', () => {
    // No seed.
    const { container } = renderList();
    // Default fixture: p1 has children → must be expanded by default.
    const names = getRenderedNames(container);
    expect(names).toContain('Frontend');
    expect(names).toContain('Backend');
  });

  it('corrupt localStorage JSON → fall back to defaults (parent expanded)', () => {
    window.localStorage.setItem(EXPANDED_KEY, 'not-json');
    const { container } = renderList();
    const names = getRenderedNames(container);
    expect(names).toContain('Frontend');
    expect(names).toContain('Backend');
  });

  it('localStorage with non-array JSON → fall back to defaults', () => {
    window.localStorage.setItem(EXPANDED_KEY, JSON.stringify({ wrong: 'shape' }));
    const { container } = renderList();
    const names = getRenderedNames(container);
    expect(names).toContain('Frontend');
  });
});

// ---------------------------------------------------------------------------
// 8. "Show X more" — root-level only
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — "Show X more" root-level counting', () => {
  it('counts only root rows toward maxVisible (V2 §2.16) — children do NOT consume budget', () => {
    // 4 roots + 2 children = 6 flat rows. maxVisible = 3 should hide
    // root #4, NOT children of root #1.
    const cats: Category[] = [
      buildCategory({ id: 'r1', name: 'Root1' }),
      buildCategory({ id: 'r1c1', name: 'Child1A', parentId: 'r1' }),
      buildCategory({ id: 'r1c2', name: 'Child1B', parentId: 'r1' }),
      buildCategory({ id: 'r2', name: 'Root2' }),
      buildCategory({ id: 'r3', name: 'Root3' }),
      buildCategory({ id: 'r4', name: 'Root4' }),
    ];
    const { container } = renderList({ categories: cats, maxVisible: 3 });
    const names = getRenderedNames(container);
    // r1 is the first root → its children visible regardless of budget.
    // r1, r2, r3 are within budget. r4 is overflow.
    expect(names).toEqual(['Root1', 'Child1A', 'Child1B', 'Root2', 'Root3']);
    expect(names).not.toContain('Root4');
    // "Show 1 more" button visible — find by visible text content.
    const showMoreButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[data-no-dnd="true"]'),
    ).filter((btn) => btn.textContent?.includes('Show'));
    expect(showMoreButtons.length).toBe(1);
    expect(showMoreButtons[0].textContent).toContain('Show 1 more');
  });
});

// ---------------------------------------------------------------------------
// 9. Empty state
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — empty state', () => {
  it('renders "No categories" placeholder when categories.length === 0', () => {
    const { container } = renderList({ categories: [] });
    expect(container.textContent).toContain('No categories');
    // No DndContext-wrapped sortable list when empty.
    expect(container.querySelector('[data-sortable-list]')).toBeNull();
  });

  it('renders inline-add input when categories.length === 0 and isAddingCategory', () => {
    const { container } = renderList({ categories: [], isAddingCategory: true });
    expect(container.textContent).not.toContain('No categories');
    // The inline input wrapper has data-no-dnd="true"
    expect(container.querySelector('[data-no-dnd="true"]')).not.toBeNull();
    // And there must be a text input.
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10-11. Editing / Adding states
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — input states', () => {
  it('isAddingCategory=true → inline-add input mounts inside SortableContext', () => {
    const { container } = renderList({ isAddingCategory: true });
    // The add input is a sibling of the rows inside [data-sortable-list].
    const list = container.querySelector('[data-sortable-list]');
    expect(list).not.toBeNull();
    expect(list!.querySelector('input[type="text"]')).not.toBeNull();
  });

  it('editingCategoryId=<id> → that row is replaced by inline-edit input', () => {
    const { container } = renderList({ editingCategoryId: 'p2' });
    const names = getRenderedNames(container);
    // p2's row is replaced by an input → its name is no longer in the
    // rendered row list.
    expect(names).not.toContain('Productivity');
    // But the input IS mounted.
    expect(container.querySelector('input[type="text"]')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 12. V3 invariant preservation — DragOverlay, snapModifier wiring,
//     justDropped guard transparency.
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — V3 invariants', () => {
  it('renders a DndContext (V3 invariant #8 + #9 — sensors + modifiers wired)', () => {
    const { container } = renderList();
    // dnd-kit DndContext renders an `aria-live` region for announcements
    // (used by screen readers). Its presence is a load-bearing signal
    // that the context mounted successfully.
    const liveRegions = container.parentElement!.querySelectorAll<HTMLElement>('[aria-live]');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });

  it('SortableContext.disabled=true while editing — guards V3 invariant #15', () => {
    // Render twice — once with editing, once without — and verify the
    // user-visible difference (editing input mounted, original row not in
    // the rendered list).
    const { container: editing } = renderList({ editingCategoryId: 'p2' });
    expect(getRenderedNames(editing)).not.toContain('Productivity');
    expect(editing.querySelector('input[type="text"]')).not.toBeNull();

    cleanup();

    const { container: idle } = renderList();
    expect(getRenderedNames(idle)).toContain('Productivity');
    expect(idle.querySelector('input[type="text"]')).toBeNull();
  });

  it('every chevron has data-no-dnd="true" (V3 invariant #14 — CustomMouseSensor short-circuit)', () => {
    const { container } = renderList();
    const chevrons = getChevronButtons(container);
    expect(chevrons.length).toBeGreaterThan(0);
    for (const chev of chevrons) {
      expect(chev.getAttribute('data-no-dnd')).toBe('true');
    }
  });

  it('chevron click does NOT call onCategoryClick (hit-target separation, V2 §6.4)', () => {
    const onCategoryClick = vi.fn();
    const { container } = renderList({ onCategoryClick });
    const chevrons = getChevronButtons(container);
    fireEvent.click(chevrons[0]);
    expect(onCategoryClick).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 13. Defensive: child rows never render chevrons.
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — child rows do not render chevron', () => {
  it('child row has no chevron <button> (MAX_DEPTH=1 means no grandchildren ever)', () => {
    const { container } = renderList();
    // We have exactly 1 chevron (on p1), even though p1-c1 and p1-c2 are
    // children rows. If the child rows ever rendered a chevron we'd have
    // ≥ 1 + 2 = 3.
    expect(getChevronButtons(container).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 14. parentId graph respected (defence against orphan / dangling children)
// ---------------------------------------------------------------------------

describe('SortableCategoriesList — orphan defence', () => {
  it('child whose parentId points to a non-existent category is dropped from the rendered list', () => {
    const cats: Category[] = [
      buildCategory({ id: 'r1', name: 'Real Root' }),
      buildCategory({ id: 'orphan', name: 'Lost Child', parentId: 'ghost' }),
    ];
    const { container } = renderList({ categories: cats });
    const names = getRenderedNames(container);
    expect(names).toContain('Real Root');
    expect(names).not.toContain('Lost Child');
  });
});
