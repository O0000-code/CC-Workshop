import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAppStore } from '../appStore';
import type { Category } from '@/types';

// ============================================================================
// Mock the safeInvoke + isTauri pair from '@/utils/tauri'.
// ============================================================================
// All store actions short-circuit in browser mode via `isTauri()`; tests must
// pretend we're in Tauri so the real two-phase commit path runs. `safeInvoke`
// is replaced with a per-test mock that the spec asserts against.
//
// We re-import `mockSafeInvoke` after `vi.mock` declares it because Vitest
// hoists `vi.mock` to the top of the module.
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

// flushPromises helper — yields to the microtask queue so queued enqueueReorder
// tasks run. We call it twice because Stage 2 chains promise.then(task) and
// then potentially calls another safeInvoke inside the catch path.
const flushPromises = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
};

// ============================================================================
// Suite
// ============================================================================
describe('appStore.moveCategoryToParent — V1 hierarchy two-phase commit', () => {
  beforeEach(() => {
    mockSafeInvoke.mockReset();

    useAppStore.setState({
      activeCategory: null,
      activeTags: [],
      categories: [cat('A'), cat('B'), cat('C')],
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

  it('Stage 1: applies parentId optimistically and bumps categoriesVersion synchronously', () => {
    // Backend returns the same shape the optimistic update produced — Stage 2
    // will be a no-op match. We don't await here, so we observe pure Stage 1.
    mockSafeInvoke.mockResolvedValue([cat('A'), cat('B', 'A'), cat('C')]);

    const versionBefore = useAppStore.getState().categoriesVersion;
    void useAppStore.getState().moveCategoryToParent('B', 'A');

    const stateAfterSync = useAppStore.getState();
    // categoriesVersion bumped exactly once for Stage 1
    expect(stateAfterSync.categoriesVersion).toBe(versionBefore + 1);
    // B now has parentId = 'A'
    expect(stateAfterSync.categories.find((c) => c.id === 'B')?.parentId).toBe('A');
    // Other rows untouched
    expect(stateAfterSync.categories.find((c) => c.id === 'A')?.parentId).toBeUndefined();
    expect(stateAfterSync.categories.find((c) => c.id === 'C')?.parentId).toBeUndefined();
  });

  it('Stage 1 + Stage 2 success: invokes set_category_parent IPC with correct args, no extra version bump on identical canonical state', async () => {
    mockSafeInvoke.mockResolvedValueOnce([cat('A'), cat('B', 'A'), cat('C')]);

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParent('B', 'A');
    await flushPromises();

    // Exactly one IPC call: set_category_parent with id+newParentId
    const setParentCalls = mockSafeInvoke.mock.calls.filter(
      ([cmd]) => cmd === 'set_category_parent',
    );
    expect(setParentCalls).toHaveLength(1);
    expect(setParentCalls[0][1]).toEqual({ id: 'B', newParentId: 'A' });

    // Stage 2 saw identical canonical state → no second set; version stays at +1
    expect(useAppStore.getState().categoriesVersion).toBe(versionBefore + 1);
    expect(useAppStore.getState().categories.find((c) => c.id === 'B')?.parentId).toBe('A');
  });

  it('Stage 2 success with diverging canonical: re-applies backend state and bumps version again', async () => {
    // Backend returns a different ORDER than the optimistic state.
    // Optimistic: [A, B(parent=A), C]; backend canonical: [B(parent=A), A, C]
    mockSafeInvoke.mockResolvedValueOnce([cat('B', 'A'), cat('A'), cat('C')]);

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParent('B', 'A');
    await flushPromises();

    const finalState = useAppStore.getState();
    // version bumped twice (Stage 1 optimistic + Stage 2 reconciliation)
    expect(finalState.categoriesVersion).toBe(versionBefore + 2);
    // Backend order took over
    expect(finalState.categories.map((c) => c.id)).toEqual(['B', 'A', 'C']);
    expect(finalState.categories[0].parentId).toBe('A');
  });

  it('Stage 2 failure: falls back to get_categories first (canonical), not the call-time snapshot', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') {
        throw 'IPC failure: validation rejected';
      }
      if (cmd === 'get_categories') {
        // canonical includes the original 3 categories untouched
        return [cat('A'), cat('B'), cat('C')];
      }
      return null;
    });

    await useAppStore.getState().moveCategoryToParent('B', 'A');
    await flushPromises();

    const finalState = useAppStore.getState();
    // Both set_category_parent and get_categories were invoked (the latter
    // is the V2 [P1-7] preferred fallback, not snapshot revert).
    const ipcNames = mockSafeInvoke.mock.calls.map(([n]) => n);
    expect(ipcNames).toContain('set_category_parent');
    expect(ipcNames).toContain('get_categories');

    // State is the canonical from get_categories — B back to root.
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();
    expect(finalState.error).toContain('validation rejected');
  });

  it('Stage 2 failure with get_categories also failing: reverts to snapshot taken at call time', async () => {
    mockSafeInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'set_category_parent') {
        throw new Error('disk full');
      }
      if (cmd === 'get_categories') {
        throw new Error('also dead');
      }
      return null;
    });

    // Snapshot captured pre-mutation: A, B (root), C — that's what we should
    // revert to since the canonical recovery path also failed.
    await useAppStore.getState().moveCategoryToParent('B', 'A');
    await flushPromises();

    const finalState = useAppStore.getState();
    // B is back to root — snapshot fallback worked
    expect(finalState.categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();
    expect(finalState.categories.map((c) => c.id)).toEqual(['A', 'B', 'C']);
    expect(finalState.error).toBeTruthy();
  });

  it('promote-to-root: passes newParentId=null in the IPC payload', async () => {
    // Pre-state: B is a child of A
    useAppStore.setState({
      categories: [cat('A'), cat('B', 'A'), cat('C')],
    });

    mockSafeInvoke.mockResolvedValueOnce([cat('A'), cat('B'), cat('C')]);

    await useAppStore.getState().moveCategoryToParent('B', null);
    await flushPromises();

    // IPC was called with null (NOT undefined — Tauri serialises null vs
    // omitted fields differently; the backend treats both as `None`, but we
    // contract on `null` for explicit promote-to-root).
    const setParentCalls = mockSafeInvoke.mock.calls.filter(
      ([cmd]) => cmd === 'set_category_parent',
    );
    expect(setParentCalls).toHaveLength(1);
    expect(setParentCalls[0][1]).toEqual({ id: 'B', newParentId: null });

    // Optimistic + canonical both have B as root.
    expect(useAppStore.getState().categories.find((c) => c.id === 'B')?.parentId).toBeUndefined();
  });

  it('isTauri() === false short-circuits to no-op (no IPC)', async () => {
    const { isTauri } = await import('@/utils/tauri');
    vi.mocked(isTauri).mockReturnValueOnce(false);

    const versionBefore = useAppStore.getState().categoriesVersion;
    await useAppStore.getState().moveCategoryToParent('B', 'A');

    // No IPC at all
    expect(mockSafeInvoke).not.toHaveBeenCalled();
    // categoriesVersion unchanged — no Stage 1 either
    expect(useAppStore.getState().categoriesVersion).toBe(versionBefore);
  });
});
