import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { Category } from '@/types';

// ============================================================================
// V2.2 D4 (2026-05-08) — atomic merge of setCategoryParent + reorder
// ============================================================================
// Refs: 02 V2.2 §6.2 / r1 §1.3 / r2 §3.5 / _synthesis_decisions D4 /
// _risk_distillation R-impl-1 + R-arch-2 + R-arch-4.
//
// Mock parity: same `vi.mock('@/utils/tauri')` pattern as the existing
// appStore.moveCategoryToParent.test.ts to avoid introducing a new mock
// dialect. The store's two-phase commit branches on `isTauri()`; tests must
// keep it returning true unless a specific case (browser-mode short-circuit)
// flips it.
// ============================================================================
vi.mock('@/utils/tauri', () => ({
  isTauri: vi.fn(() => true),
  safeInvoke: vi.fn(),
  BROWSER_MODE_MESSAGE: 'mock browser mode',
}));

import { safeInvoke } from '@/utils/tauri';
const mockSafeInvoke = vi.mocked(safeInvoke);

const cat = (id: string, parentId?: string): Category => ({
  id,
  name: `name-${id}`,
  color: '#000000',
  count: 0,
  ...(parentId ? { parentId } : {}),
});

// flushPromises — yields microtasks long enough for the queued enqueueReorder
// task (which awaits TWO sequential safeInvoke IPCs + a possible
// get_categories fallback) to fully settle. We use 12 yields because the
// success path chains: enqueueReorder.then → IPC1 await → IPC2 await → set;
// the failure path chains: IPC1 await → catch → get_categories await → set.
// Each `await` is a microtask, plus React's set batching adds a few more.
const flushPromises = async () => {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
};

// ============================================================================
// Suite
// ============================================================================
describe('appStore.moveCategoryToParentAtPosition — V2.2 D4 atomic merge', () => {
  beforeEach(() => {
    mockSafeInvoke.mockReset();

    useAppStore.setState({
      activeCategory: null,
      activeTags: [],
      // Pre-state: A is a root, B is a child of A, C is a root, D is a root.
      // Promote B → root with target slot between C and D produces:
      //   [A, C, B, D]
      categories: [cat('A'), cat('B', 'A'), cat('C'), cat('D')],
      tags: [],
      categoriesVersion: 0,
      tagsVersion: 0,
      counts: { skills: 0, mcpServers: 0, scenes: 0, projects: 0 },
      isLoading: false,
      error: null,
      editingCategoryId: null,
      isAddingCategory: false,
      editingTagId: null,
      isAddingTag: false,
    });
  });

  afterEach(() => {
    mockSafeInvoke.mockReset();
  });

  // ----------------------------------------------------------------------
  // Atomic optimistic invariant — Stage 1 commits parentId AND order in
  // ONE React frame. This is the whole reason the method exists; if the
  // synchronous post-call state shows parentId without the new order (or
  // vice versa), the dual-await pattern has been silently re-introduced.
  // R-arch-2 / R-arch-4.
  // ----------------------------------------------------------------------
  it('Stage 1: applies parentId AND new order atomically in a single set call', () => {
    // Backend returns the same shape as the optimistic state — Stage 2 will
    // be a no-op match. We do NOT await; we observe the synchronous Stage 1.
    mockSafeInvoke.mockResolvedValue([cat('A'), cat('C'), cat('B'), cat('D')]);

    const versionBefore = useAppStore.getState().categoriesVersion;

    // Promote B → root with target slot [A, C, B, D].
    void useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);

    const stateAfterSync = useAppStore.getState();

    // Single version bump for Stage 1 (parentId + order in one set).
    expect(stateAfterSync.categoriesVersion).toBe(versionBefore + 1);

    // B's parentId cleared (promoted to root).
    expect(stateAfterSync.categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();

    // Order matches `newOrderedIds` exactly.
    expect(stateAfterSync.categories.map((c) => c.id)).toEqual(['A', 'C', 'B', 'D']);

    // Other categories' parentId unchanged.
    expect(stateAfterSync.categories.find((c) => c.id === 'A')?.parentId).toBeUndefined();
    expect(stateAfterSync.categories.find((c) => c.id === 'C')?.parentId).toBeUndefined();
    expect(stateAfterSync.categories.find((c) => c.id === 'D')?.parentId).toBeUndefined();
  });

  // ----------------------------------------------------------------------
  // Happy path — both IPCs succeed, canonical equals optimistic.
  // ----------------------------------------------------------------------
  it('Stage 2 success: dispatches set_category_parent then reorder_categories in series', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') return [cat('A'), cat('B'), cat('C'), cat('D')];
      if (cmd === 'reorder_categories') return [cat('A'), cat('C'), cat('B'), cat('D')];
      return null;
    });

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);
    await flushPromises();

    // Both IPCs were called.
    const ipcSequence = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcSequence).toEqual(['set_category_parent', 'reorder_categories']);

    // IPC 1 args.
    const setParentCall = mockSafeInvoke.mock.calls.find(([n]) => n === 'set_category_parent');
    expect(setParentCall?.[1]).toEqual({ id: 'B', newParentId: null });

    // IPC 2 args.
    const reorderCall = mockSafeInvoke.mock.calls.find(([n]) => n === 'reorder_categories');
    expect(reorderCall?.[1]).toEqual({ orderedIds: ['A', 'C', 'B', 'D'] });

    // Stage 2 saw identical canonical state → no second set; version stays
    // at +1 (Stage 1 only).
    const finalState = useAppStore.getState();
    expect(finalState.categoriesVersion).toBe(versionBefore + 1);
    expect(finalState.categories.map((c) => c.id)).toEqual(['A', 'C', 'B', 'D']);
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();
  });

  it('Stage 2 success with diverging canonical: re-applies backend state', async () => {
    // Backend canonical orders things differently from the optimistic Vec.
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') return [cat('A'), cat('B'), cat('C'), cat('D')];
      // Canonical disagrees with optimistic — backend put B at position 0.
      if (cmd === 'reorder_categories') return [cat('B'), cat('A'), cat('C'), cat('D')];
      return null;
    });

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);
    await flushPromises();

    const finalState = useAppStore.getState();
    // version bumped twice: Stage 1 optimistic + Stage 2 reconciliation.
    expect(finalState.categoriesVersion).toBe(versionBefore + 2);
    // Backend order took over.
    expect(finalState.categories.map((c) => c.id)).toEqual(['B', 'A', 'C', 'D']);
  });

  // ----------------------------------------------------------------------
  // Atomic fallback — R-impl-1 / R-arch-4.
  // The contract: if EITHER IPC fails, the store ends up at the canonical
  // backend state (preferred) or the call-time snapshot (last resort).
  // It NEVER stays in a partial-commit state.
  // ----------------------------------------------------------------------
  it('Stage 1 IPC failure: set_category_parent fails → does NOT send reorder, falls back to canonical', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') {
        throw new Error('IPC failure: validation rejected');
      }
      if (cmd === 'reorder_categories') {
        // If this fires, the test fails — IPC 1 throw must short-circuit IPC 2.
        return [cat('Z')];
      }
      if (cmd === 'get_categories') {
        // Canonical: B is still under A, original order untouched.
        return [cat('A'), cat('B', 'A'), cat('C'), cat('D')];
      }
      return null;
    });

    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);
    await flushPromises();

    // The reorder IPC was NEVER dispatched (IPC 1 throw short-circuits).
    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('set_category_parent');
    expect(ipcNames).not.toContain('reorder_categories');
    expect(ipcNames).toContain('get_categories');

    // State is canonical — B back to root NOT promoted.
    const finalState = useAppStore.getState();
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBe('A');
    expect(finalState.categories.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(finalState.error).toContain('validation rejected');
  });

  it('Stage 2 IPC failure: reorder fails after setParent succeeded → atomic fallback (no half-commit)', async () => {
    // Backend successfully sets parent (post-IPC-1 canonical = B at root, old
    // order [A, B, C, D]) but then reorder_categories fails. The store MUST
    // re-sync to canonical — which now reflects the partial backend mutation
    // — never leave it stuck on the optimistic Vec.
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') return [cat('A'), cat('B'), cat('C'), cat('D')];
      if (cmd === 'reorder_categories') {
        throw new Error('disk full');
      }
      if (cmd === 'get_categories') {
        // Canonical reflects the IPC-1 success: B promoted, but original order.
        return [cat('A'), cat('B'), cat('C'), cat('D')];
      }
      return null;
    });

    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);
    await flushPromises();

    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toEqual(['set_category_parent', 'reorder_categories', 'get_categories']);

    const finalState = useAppStore.getState();
    // Store now matches canonical: B promoted, but order is the backend's
    // (NOT the optimistic [A, C, B, D]). This is correct: parent change
    // persisted, order did not — frontend is in sync with backend, not
    // stuck on a half-applied optimistic projection.
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();
    expect(finalState.categories.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(finalState.error).toContain('disk full');
  });

  it('Double IPC failure with get_categories also failing: reverts to call-time snapshot', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') {
        throw new Error('disk full');
      }
      if (cmd === 'reorder_categories') {
        return [cat('Z')]; // should never fire
      }
      if (cmd === 'get_categories') {
        throw new Error('also dead');
      }
      return null;
    });

    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);
    await flushPromises();

    const finalState = useAppStore.getState();
    // Snapshot revert: B is back under A, original order.
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBe('A');
    expect(finalState.categories.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D']);
    expect(finalState.error).toBeTruthy();

    // reorder_categories must never have been dispatched.
    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).not.toContain('reorder_categories');
  });

  // ----------------------------------------------------------------------
  // Pre-validation — same 6 rules as moveCategoryToParent. Reject before
  // any optimistic mutation or IPC; surface the same error messages.
  // R-impl-4 (must mirror backend validate_hierarchy).
  // ----------------------------------------------------------------------
  describe('frontend pre-validation (parity with moveCategoryToParent)', () => {
    it('rejects depth-2 demotion (new parent is itself a child)', async () => {
      // Setup: A root, B child of A, C root. Try to make C a child of B.
      useAppStore.setState({
        categories: [cat('A'), cat('B', 'A'), cat('C')],
      });
      const versionBefore = useAppStore.getState().categoriesVersion;

      await expect(
        useAppStore.getState().moveCategoryToParentAtPosition('C', 'B', ['A', 'B', 'C']),
      ).rejects.toThrow(/depth limit/i);

      expect(mockSafeInvoke).not.toHaveBeenCalled();
      expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
    });

    it('rejects demote-with-children (target itself has children)', async () => {
      useAppStore.setState({
        categories: [cat('A'), cat('B', 'A'), cat('C')],
      });
      const versionBefore = useAppStore.getState().categoriesVersion;

      await expect(
        useAppStore.getState().moveCategoryToParentAtPosition('A', 'C', ['C', 'A', 'B']),
      ).rejects.toThrow(/demote a category that has children/i);

      expect(mockSafeInvoke).not.toHaveBeenCalled();
      expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
    });

    it('rejects self-as-parent', async () => {
      const versionBefore = useAppStore.getState().categoriesVersion;
      await expect(
        useAppStore.getState().moveCategoryToParentAtPosition('A', 'A', ['A', 'B', 'C', 'D']),
      ).rejects.toThrow(/own parent/i);
      expect(mockSafeInvoke).not.toHaveBeenCalled();
      expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
    });

    it('rejects orphan parent (id not in categories)', async () => {
      const versionBefore = useAppStore.getState().categoriesVersion;
      await expect(
        useAppStore
          .getState()
          .moveCategoryToParentAtPosition('A', 'does-not-exist', ['A', 'B', 'C', 'D']),
      ).rejects.toThrow(/not found/i);
      expect(mockSafeInvoke).not.toHaveBeenCalled();
      expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
    });

    // Note: the cycle rule (validateMoveToParent rule 5) is unreachable on a
    // well-formed depth=2 tree because rule 3 (parent must be root) intercepts
    // any case where newParentId is itself a child. The cycle check is
    // belt-and-braces against malformed trees and is exercised by the
    // moveCategoryToParent suite via the same shared helper. We don't repeat
    // the contrived setup here.
  });

  // ----------------------------------------------------------------------
  // Browser-mode short-circuit — when not running in Tauri, the method
  // resolves to undefined without dispatching any IPC. Mirrors every
  // other store action.
  // ----------------------------------------------------------------------
  it('isTauri() === false short-circuits to no-op (no IPC, no store mutation)', async () => {
    const { isTauri } = await import('@/utils/tauri');
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParentAtPosition('B', null, ['A', 'C', 'B', 'D']);

    expect(mockSafeInvoke).not.toHaveBeenCalled();
    expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
    // Original state preserved.
    expect(useAppStore.getState().categories.find((c) => c.id === 'B')?.parentId).toBe('A');
  });
});
