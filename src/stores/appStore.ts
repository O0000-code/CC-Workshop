import { create } from 'zustand';
import type { AppData, Category, MigrationReport, Tag } from '@/types';
import { isTauri, safeInvoke } from '@/utils/tauri';
import { isAncestorOf } from '@/utils/categoryTree';

// ====================================================================
// Reorder serial queue
// ====================================================================
//
// All reorder IPC calls must be serialized to preserve user intent: when
// the user issues two rapid reorders (e.g. drag A→B then immediately
// B→A), they must be persisted in that order. Without serialization the
// later IPC could complete first and the canonical backend state would
// not reflect the user's final intent.
//
// `then(task, task)` ensures the next task runs even if the previous
// one rejected; `result.catch(() => {})` keeps the queue alive forever
// while still letting outer callers `.catch()` their own task.
// ====================================================================
let reorderQueue: Promise<unknown> = Promise.resolve();

const enqueueReorder = <T>(task: () => Promise<T>): Promise<T> => {
  const result = reorderQueue.then(task, task);
  reorderQueue = result.catch(() => {});
  return result;
};

// Pure helper: rebuild a Vec to match orderedIds, appending unmentioned
// items in their original order. Mirrors Rust `apply_reorder`.
const applyReorder = <T extends { id: string }>(items: T[], orderedIds: string[]): T[] => {
  const byId = new Map<string, T>(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const result: T[] = [];

  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    const item = byId.get(id);
    if (item) {
      seen.add(id);
      result.push(item);
      byId.delete(id);
    }
  }

  // Append remainder in original order (NOT byId iteration order)
  for (const item of items) {
    if (byId.has(item.id)) {
      result.push(item);
    }
  }

  return result;
};

// ============================================================
// Hierarchy pre-validation — shared by `moveCategoryToParent` and
// `moveCategoryToParentAtPosition`. Mirrors backend `validate_hierarchy`
// (`src-tauri/src/commands/data.rs`):
//   Rule 1: promote-to-root is always valid.
//   Rule 2: self-as-parent → reject.
//   Rule 3: new parent must itself be a root (depth ≤ 1).
//   Rule 4: new parent must exist.
//   Rule 5: cycle — checked via `isAncestorOf`.
//   Rule 6: target must not have children (demote-with-children).
// Returns `null` on success or an error message string on rejection. We
// surface the message verbatim to `set({ error })` so existing tests that
// match on /depth limit/i, /demote a category that has children/i etc.
// continue to pass.
// ============================================================
const validateMoveToParent = (
  id: string,
  newParentId: string | null,
  categories: Category[],
): string | null => {
  if (newParentId === null) return null;
  if (newParentId === id) return 'Cannot set category as its own parent';
  const newParent = categories.find((c) => c.id === newParentId);
  if (!newParent) return 'Parent category not found';
  if (newParent.parentId !== undefined) return 'Hierarchy depth limit exceeded (max 2)';
  if (isAncestorOf(id, newParentId, categories)) return 'Setting parent would create a cycle';
  const targetHasChildren = categories.some((c) => c.parentId === id);
  if (targetHasChildren) return 'Cannot demote a category that has children';
  return null;
};

interface AppState {
  // Navigation state (frontend-only)
  activeCategory: string | null;
  activeTags: string[];

  // Data
  categories: Category[];
  tags: Tag[];

  // Version counters — bumped on every mutation to categories/tags.
  // Used by loadCategories/loadTags to detect concurrent reorder during
  // an in-flight IPC, so we don't overwrite optimistic state with stale
  // canonical state. See loadCategories/loadTags below.
  categoriesVersion: number;
  tagsVersion: number;

  // Counts
  counts: {
    skills: number;
    mcpServers: number;
    scenes: number;
    projects: number;
  };

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Editing state - Categories
  editingCategoryId: string | null;
  isAddingCategory: boolean;

  // Editing state - Tags
  editingTagId: string | null;
  isAddingTag: boolean;

  // Frontend-only Actions
  setActiveCategory: (categoryId: string | null) => void;
  toggleActiveTag: (tagId: string) => void;
  clearActiveTags: () => void;

  // Data setters (for receiving Tauri data)
  setCategories: (categories: Category[]) => void;
  setTags: (tags: Tag[]) => void;
  setCounts: (counts: Partial<AppState['counts']>) => void;

  // Tauri-integrated Actions
  loadCategories: () => Promise<void>;
  loadTags: () => Promise<void>;
  addCategory: (name: string, color: string, parentId?: string) => Promise<Category>;
  updateCategory: (id: string, name?: string, color?: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addTag: (name: string) => Promise<Tag>;
  updateTag: (id: string, name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  reorderCategories: (orderedIds: string[]) => Promise<void>;
  reorderTags: (orderedIds: string[]) => Promise<void>;
  /**
   * V1 hierarchy: move a category to a new parent (or promote to root with
   * `null`). Two-phase commit — applies optimistic state synchronously, then
   * persists via the shared `enqueueReorder` queue so concurrent reorder /
   * setParent calls execute in user-intent order.
   *
   * Returns a `Promise<void>` so callers (e.g. `onDragEnd` chaining setParent
   * → reorder) can `await` Stage 2 completion before deriving the next IPC's
   * payload — see 03_tech_plan V2 §4.3 / P0-ARCH-3.
   */
  moveCategoryToParent: (id: string, newParentId: string | null) => Promise<void>;
  /**
   * V2.2 D4 (2026-05-08): atomic optimistic merge of `setCategoryParent` +
   * `reorder` into a SINGLE React commit. Used by promote-with-position
   * (child → root with explicit drop slot). The dual-await pattern in
   * `handleDragEnd` (setParent IPC then reorder IPC) produced two React
   * renders — the intermediate frame shows the row at its old slot under a
   * different parent, which violates `useSortable`'s 50 ms cascade window
   * (`sortable.esm.js:565-579`) and produces the S4 "no animation" jump.
   *
   * Stage 1 (synchronous, atomic): apply parentId AND order in one `set`
   * call so React commits a single frame. Pre-validation runs first (same
   * 6 rules as `moveCategoryToParent`) — invalid moves reject without
   * touching state.
   *
   * Stage 2 (queued, async): two IPCs awaited in series inside the same
   * `enqueueReorder` task — `set_category_parent` first, then
   * `reorder_categories`. Either failure path → atomic fallback via
   * `get_categories` (snapshot revert as last resort). Importantly this is
   * NOT a partial commit: a Stage-1-success / Stage-2-IPC-2-failure leaves
   * the canonical backend in the post-IPC-1 state but the store ends up at
   * whatever `get_categories` returns, so the frontend cannot drift from
   * canonical.
   *
   * Refs: 02 V2.2 §6.2 / r1 §1.3 / r2 §3.5 / _synthesis_decisions D4 /
   * _risk_distillation R-impl-1 + R-arch-2 + R-arch-4.
   */
  moveCategoryToParentAtPosition: (
    id: string,
    newParentId: string | null,
    newOrderedIds: string[],
  ) => Promise<void>;
  initApp: () => Promise<void>;

  // Editing state Actions
  clearAllEditingStates: () => void;
  startEditingCategory: (id: string) => void;
  stopEditingCategory: () => void;
  startAddingCategory: () => void;
  stopAddingCategory: () => void;
  startEditingTag: (id: string) => void;
  stopEditingTag: () => void;
  startAddingTag: () => void;
  stopAddingTag: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  activeCategory: null,
  activeTags: [],
  categories: [],
  tags: [],
  categoriesVersion: 0,
  tagsVersion: 0,
  counts: {
    skills: 0,
    mcpServers: 0,
    scenes: 0,
    projects: 0,
  },
  isLoading: false,
  error: null,

  // Editing state initial values
  editingCategoryId: null,
  isAddingCategory: false,
  editingTagId: null,
  isAddingTag: false,

  // Frontend-only Actions
  setActiveCategory: (categoryId) => set({ activeCategory: categoryId }),

  toggleActiveTag: (tagId) =>
    set((state) => ({
      activeTags: state.activeTags.includes(tagId)
        ? state.activeTags.filter((id) => id !== tagId)
        : [...state.activeTags, tagId],
    })),

  clearActiveTags: () => set({ activeTags: [] }),

  // Data setters — bump version since downstream data has changed
  setCategories: (categories) =>
    set((state) => ({
      categories,
      categoriesVersion: state.categoriesVersion + 1,
    })),
  setTags: (tags) =>
    set((state) => ({
      tags,
      tagsVersion: state.tagsVersion + 1,
    })),
  setCounts: (counts) => set((state) => ({ counts: { ...state.counts, ...counts } })),

  // Tauri-integrated Actions
  loadCategories: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot load categories in browser mode');
      return;
    }

    // Snapshot version BEFORE async IPC. If a reorder/add/update/delete
    // bumps the version while we wait for the backend, our response is
    // stale and would overwrite the user's optimistic state.
    const versionBefore = get().categoriesVersion;

    try {
      const categories = await safeInvoke<Category[]>('get_categories');
      if (!categories) return;

      const versionAfter = get().categoriesVersion;
      if (versionAfter !== versionBefore) {
        console.warn('[appStore] loadCategories skipped (version changed during IPC)');
        return;
      }

      set((state) => ({
        categories,
        categoriesVersion: state.categoriesVersion + 1,
      }));
    } catch (error) {
      console.error('Failed to load categories:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
    }
  },

  loadTags: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot load tags in browser mode');
      return;
    }

    const versionBefore = get().tagsVersion;

    try {
      const tags = await safeInvoke<Tag[]>('get_tags');
      if (!tags) return;

      const versionAfter = get().tagsVersion;
      if (versionAfter !== versionBefore) {
        console.warn('[appStore] loadTags skipped (version changed during IPC)');
        return;
      }

      set((state) => ({
        tags,
        tagsVersion: state.tagsVersion + 1,
      }));
    } catch (error) {
      console.error('Failed to load tags:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
    }
  },

  addCategory: async (name: string, color: string, parentId?: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot add category in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      const category = await safeInvoke<Category>('add_category', { name, color, parentId });
      if (category) {
        set((state) => ({
          categories: [...state.categories, category],
          categoriesVersion: state.categoriesVersion + 1,
        }));
        return category;
      }
      throw new Error('Failed to create category');
    } catch (error) {
      console.error('Failed to add category:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  updateCategory: async (id: string, name?: string, color?: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot update category in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      await safeInvoke('update_category', { id, name, color });
      set((state) => ({
        categories: state.categories.map((c) =>
          c.id === id
            ? { ...c, ...(name !== undefined && { name }), ...(color !== undefined && { color }) }
            : c,
        ),
        categoriesVersion: state.categoriesVersion + 1,
      }));
    } catch (error) {
      console.error('Failed to update category:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  deleteCategory: async (id: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot delete category in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      await safeInvoke('delete_category', { id });
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
        categoriesVersion: state.categoriesVersion + 1,
        activeCategory: state.activeCategory === id ? null : state.activeCategory,
      }));
    } catch (error) {
      console.error('Failed to delete category:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  addTag: async (name: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot add tag in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      const tag = await safeInvoke<Tag>('add_tag', { name });
      if (tag) {
        set((state) => ({
          tags: [...state.tags, tag],
          tagsVersion: state.tagsVersion + 1,
        }));
        return tag;
      }
      throw new Error('Failed to create tag');
    } catch (error) {
      console.error('Failed to add tag:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  deleteTag: async (id: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot delete tag in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      await safeInvoke('delete_tag', { id });
      set((state) => ({
        tags: state.tags.filter((t) => t.id !== id),
        tagsVersion: state.tagsVersion + 1,
        activeTags: state.activeTags.filter((t) => t !== id),
      }));
    } catch (error) {
      console.error('Failed to delete tag:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  updateTag: async (id: string, name: string) => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot update tag in browser mode');
      throw new Error('Not available in browser mode');
    }

    try {
      await safeInvoke('update_tag', { id, name });
      set((state) => ({
        tags: state.tags.map((t) => (t.id === id ? { ...t, name } : t)),
        tagsVersion: state.tagsVersion + 1,
      }));
    } catch (error) {
      console.error('Failed to update tag:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message });
      throw error;
    }
  },

  // ============================================================
  // Reorder — two-phase commit
  // ============================================================
  // Stage 1 (synchronous): apply the new order locally + bump
  //         version, so the UI updates immediately.
  // Stage 2 (queued, async): persist via IPC. Backend holds the
  //         DATA_MUTEX, so concurrent add/delete/reorder are
  //         serialized server-side. We trust the canonical Vec
  //         it returns and re-set state.
  // Failure: try `get_categories` to pull canonical state; if that
  //          also fails, fall back to the snapshot taken at call
  //          time (best-effort consistency).
  // ============================================================
  reorderCategories: (orderedIds: string[]) => {
    if (!isTauri()) return Promise.resolve();

    // Stage 1: optimistic, synchronous
    const snapshotForFallback = get().categories;
    const reordered = applyReorder(snapshotForFallback, orderedIds);

    set((state) => ({
      categories: reordered,
      categoriesVersion: state.categoriesVersion + 1,
    }));

    // Stage 2: queued IPC
    return enqueueReorder(async () => {
      try {
        const updated = await safeInvoke<Category[]>('reorder_categories', { orderedIds });
        if (updated) {
          // V3 P1-2: only set when backend differs from current local state.
          // Stage 1 already produced an optimistic equal Vec; the canonical
          // backend usually matches. Skipping the no-op set avoids extra
          // re-renders and avoids forcing concurrent loadCategories to skip.
          const current = get().categories;
          const sameOrder =
            current.length === updated.length && current.every((c, i) => c.id === updated[i].id);
          if (!sameOrder) {
            set((state) => ({
              categories: updated,
              categoriesVersion: state.categoriesVersion + 1,
            }));
          }
        }
      } catch (error) {
        console.error('Failed to reorder categories:', error);
        const message = typeof error === 'string' ? error : String(error);

        // Attempt to recover canonical state from backend
        try {
          const real = await safeInvoke<Category[]>('get_categories');
          if (real) {
            set((state) => ({
              categories: real,
              categoriesVersion: state.categoriesVersion + 1,
              error: message,
            }));
            return;
          }
        } catch (recoverError) {
          console.error('Failed to recover canonical categories:', recoverError);
        }

        // Last resort: revert to snapshot taken at call time
        set((state) => ({
          categories: snapshotForFallback,
          categoriesVersion: state.categoriesVersion + 1,
          error: message,
        }));
      }
    });
  },

  reorderTags: (orderedIds: string[]) => {
    if (!isTauri()) return Promise.resolve();

    // Stage 1: optimistic, synchronous
    const snapshotForFallback = get().tags;
    const reordered = applyReorder(snapshotForFallback, orderedIds);

    set((state) => ({
      tags: reordered,
      tagsVersion: state.tagsVersion + 1,
    }));

    // Stage 2: queued IPC
    return enqueueReorder(async () => {
      try {
        const updated = await safeInvoke<Tag[]>('reorder_tags', { orderedIds });
        if (updated) {
          // V3 P1-2: only set when backend differs from current local state.
          const current = get().tags;
          const sameOrder =
            current.length === updated.length && current.every((t, i) => t.id === updated[i].id);
          if (!sameOrder) {
            set((state) => ({
              tags: updated,
              tagsVersion: state.tagsVersion + 1,
            }));
          }
        }
      } catch (error) {
        console.error('Failed to reorder tags:', error);
        const message = typeof error === 'string' ? error : String(error);

        try {
          const real = await safeInvoke<Tag[]>('get_tags');
          if (real) {
            set((state) => ({
              tags: real,
              tagsVersion: state.tagsVersion + 1,
              error: message,
            }));
            return;
          }
        } catch (recoverError) {
          console.error('Failed to recover canonical tags:', recoverError);
        }

        set((state) => ({
          tags: snapshotForFallback,
          tagsVersion: state.tagsVersion + 1,
          error: message,
        }));
      }
    });
  },

  // ============================================================
  // Move category to parent — two-phase commit (V1 hierarchy)
  // ============================================================
  // Stage 1 (synchronous): apply parentId locally + bump
  //         categoriesVersion so the sidebar updates immediately.
  // Stage 2 (queued, async): persist via the shared `enqueueReorder`
  //         queue, so concurrent reorderCategories / moveCategoryToParent
  //         IPCs run in submission order — preserving user intent
  //         when onDragEnd issues both setParent and reorder back-to-back
  //         (P0-ARCH-3).
  // Failure: try `get_categories` first (canonical state — may include
  //          legitimate concurrent changes we don't want to throw away);
  //          fall back to the snapshot taken at call time only if that
  //          also fails (P1-7).
  // Returns: Promise<void> so callers can `await` Stage 2 before
  //          computing the next IPC's payload.
  // ============================================================
  moveCategoryToParent: (id: string, newParentId: string | null) => {
    if (!isTauri()) return Promise.resolve();

    const snapshotForFallback = get().categories;

    // ============================================================
    // Frontend pre-validation (P0-4 — defensive depth/cycle clamp)
    // ============================================================
    // The backend validator (`validate_hierarchy`) is the source of truth,
    // but if we wait for IPC to reject, the optimistic Stage 1 has already
    // mutated the store and the user sees a transiently illegal tree
    // (e.g. a 3-level nesting until the rollback round-trips). Mirror the
    // backend's invariants here so the optimistic update is *only* applied
    // when the move would actually succeed.
    //
    // Validation rules live in module-level `validateMoveToParent` so the
    // V2.2 D4 `moveCategoryToParentAtPosition` can reuse the exact same
    // contract — see _synthesis_decisions D4 / r1 §1.3 / 02 V2.2 §6.2.
    {
      const validationError = validateMoveToParent(id, newParentId, snapshotForFallback);
      if (validationError !== null) {
        set({ error: validationError });
        return Promise.reject(new Error(validationError));
      }
    }

    // Stage 1: optimistic, synchronous (only after pre-validation passes).
    const optimistic = snapshotForFallback.map((c) =>
      c.id === id ? { ...c, parentId: newParentId ?? undefined } : c,
    );

    set((state) => ({
      categories: optimistic,
      categoriesVersion: state.categoriesVersion + 1,
    }));

    // Stage 2: queued IPC
    return enqueueReorder(async () => {
      try {
        const updated = await safeInvoke<Category[]>('set_category_parent', {
          id,
          newParentId,
        });
        if (updated) {
          // V3 P1-2 pattern + V2 hierarchy upgrade: only set when backend
          // differs from current local state. Compare both id ORDER and
          // parentId (not just id order) since this mutation changes the
          // hierarchy graph, not the sibling order.
          const current = get().categories;
          const sameOrderAndHierarchy =
            current.length === updated.length &&
            current.every(
              (c, i) =>
                c.id === updated[i].id && (c.parentId ?? null) === (updated[i].parentId ?? null),
            );
          if (!sameOrderAndHierarchy) {
            set((state) => ({
              categories: updated,
              categoriesVersion: state.categoriesVersion + 1,
            }));
          }
        }
      } catch (error) {
        console.error('Failed to set category parent:', error);
        const message = typeof error === 'string' ? error : String(error);

        // V2 [P1-7]: fallback to canonical backend first. snapshot revert is
        // a last resort because the snapshot may be stale relative to other
        // concurrent reorder/setParent calls that succeeded in between.
        try {
          const real = await safeInvoke<Category[]>('get_categories');
          if (real) {
            set((state) => ({
              categories: real,
              categoriesVersion: state.categoriesVersion + 1,
              error: message,
            }));
            return;
          }
        } catch (recoverError) {
          console.error('Failed to recover canonical categories:', recoverError);
        }

        // Last resort: revert to snapshot taken at call time
        set((state) => ({
          categories: snapshotForFallback,
          categoriesVersion: state.categoriesVersion + 1,
          error: message,
        }));
      }
    });
  },

  // ============================================================
  // Move category to parent AT POSITION — V2.2 D4 atomic merge
  // ============================================================
  // Refs: 02 V2.2 §6.2 / r1 §1.3 (intermediate-frame trace) / r2 §3.5
  // (sortable.esm.js cascade 50 ms window) / _synthesis_decisions D4 /
  // _risk_distillation R-impl-1 + R-arch-2 + R-arch-4.
  //
  // Why this exists: the dual-await chain in handleDragEnd (setParent IPC
  // then reorder IPC) commits two React frames. Frame 1 shows the row with
  // new parentId but its OLD position — violating useSortable's
  // `defaultAnimateLayoutChanges` window (closes 50 ms after drop). Result:
  // S4 "promote 后无动效闪烁".
  //
  // Stage 1 (synchronous, ATOMIC): single `set` mutates parentId AND order
  // in one React commit. Cannot split into two `set` calls — that re-
  // introduces the intermediate frame this method exists to eliminate.
  //
  // Stage 2 (queued, async): two IPCs awaited in series within ONE
  // `enqueueReorder` task. set_category_parent first; then
  // reorder_categories with `newOrderedIds`. Both must succeed for the
  // optimistic state to be considered confirmed.
  //
  // Atomic fallback (R-impl-1): any IPC failure → catch → get_categories
  // (preferred — picks up legitimate concurrent changes) → snapshot
  // revert (last resort if get_categories also fails). NEVER partial-
  // commit: even if IPC 1 succeeded and IPC 2 failed, the store is rebuilt
  // from canonical `get_categories`, not left in a half-applied state.
  // ============================================================
  moveCategoryToParentAtPosition: (
    id: string,
    newParentId: string | null,
    newOrderedIds: string[],
  ) => {
    if (!isTauri()) return Promise.resolve();

    const snapshotForFallback = get().categories;

    // Pre-validation (same 6 rules as `moveCategoryToParent`).
    {
      const validationError = validateMoveToParent(id, newParentId, snapshotForFallback);
      if (validationError !== null) {
        set({ error: validationError });
        return Promise.reject(new Error(validationError));
      }
    }

    // Stage 1: atomic optimistic — parentId + order in ONE set call.
    // We first map parentId, then applyReorder (V3 P3 helper, mirrors
    // backend `apply_reorder`). Critically this is one `set`, not two —
    // splitting into two would commit two React frames and reintroduce
    // the bug this whole method exists to fix.
    const withNewParent = snapshotForFallback.map((c) =>
      c.id === id ? { ...c, parentId: newParentId ?? undefined } : c,
    );
    const optimistic = applyReorder(withNewParent, newOrderedIds);

    set((state) => ({
      categories: optimistic,
      categoriesVersion: state.categoriesVersion + 1,
    }));

    // Stage 2: queued task that awaits BOTH IPCs in series. Either failure
    // → catch → atomic fallback. The `enqueueReorder` queue keeps this
    // task ordered relative to other concurrent reorder/setParent calls
    // (P0-ARCH-3 user-intent ordering preserved).
    return enqueueReorder(async () => {
      try {
        // IPC 1: setCategoryParent. If this throws, IPC 2 is never sent
        // and we fall through to the catch below — atomic.
        await safeInvoke<Category[]>('set_category_parent', { id, newParentId });

        // IPC 2: reorder_categories. Failure here means the canonical
        // backend has new parentId but old order. We do NOT partial-
        // commit; the catch below pulls canonical state via
        // `get_categories` so the frontend re-syncs to whatever the
        // backend actually has.
        const updated = await safeInvoke<Category[]>('reorder_categories', {
          orderedIds: newOrderedIds,
        });

        if (updated) {
          // V3 P1-2 + V2 hierarchy: only set when canonical differs from
          // local state. Compare both id ORDER and parentId because we
          // mutated both. Stage 1 produces an optimistic-equal Vec in the
          // common case → this no-ops.
          const current = get().categories;
          const sameOrderAndHierarchy =
            current.length === updated.length &&
            current.every(
              (c, i) =>
                c.id === updated[i].id && (c.parentId ?? null) === (updated[i].parentId ?? null),
            );
          if (!sameOrderAndHierarchy) {
            set((state) => ({
              categories: updated,
              categoriesVersion: state.categoriesVersion + 1,
            }));
          }
        }
      } catch (error) {
        console.error('Failed to move category to parent at position:', error);
        const message = typeof error === 'string' ? error : String(error);

        // Atomic fallback (R-impl-1): pull canonical first; snapshot revert
        // is the last resort. Either branch fully replaces the store —
        // never partial. If IPC 1 succeeded and IPC 2 failed, canonical
        // reflects the post-IPC-1 state, which the frontend will adopt
        // verbatim — that's correct: the parent change persisted, the
        // ordering did not.
        try {
          const real = await safeInvoke<Category[]>('get_categories');
          if (real) {
            set((state) => ({
              categories: real,
              categoriesVersion: state.categoriesVersion + 1,
              error: message,
            }));
            return;
          }
        } catch (recoverError) {
          console.error('Failed to recover canonical categories:', recoverError);
        }

        // Last resort: revert to snapshot taken at call time.
        set((state) => ({
          categories: snapshotForFallback,
          categoriesVersion: state.categoriesVersion + 1,
          error: message,
        }));
      }
    });
  },

  initApp: async () => {
    // Skip in non-Tauri environment
    if (!isTauri()) {
      console.warn('AppStore: Cannot initialize app in browser mode');
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await safeInvoke('init_app_data');
      await Promise.all([get().loadCategories(), get().loadTags()]);

      // ====================================================================
      // V1 hierarchy: one-time category_id backfill for legacy data.json
      // ====================================================================
      // The migration is idempotent and gated by `data.hasCompletedCategoryIdMigration`
      // (stored in AppData, not AppSettings — so settingsStore.saveSettings
      // can never reset it accidentally; see 03_tech_plan V2 §3.5 / P0-DATA-1).
      //
      // Failure handling (per Phase-1 audit P0-1 + 03 V2 §4.10):
      //   - IPC throws (write_app_data failure / DATA_MUTEX poisoning)
      //     → log warning, leave flag false, retry on next launch.
      //     App keeps working: dual-read fallback (category_id ? lookup :
      //     name lookup) is operational regardless of migration state.
      //   - IPC succeeds with orphaned skills/mcps in the report
      //     → backend has already advanced the flag (orphan names are a
      //     terminal user state, not a retry signal). Frontend just logs
      //     the orphan counts; a future UI may surface a re-classify prompt.
      //
      // We do NOT block app initialisation on migration outcome — even a
      // total IPC failure leaves the app in a usable (dual-read) state.
      try {
        const data = await safeInvoke<AppData>('read_app_data');
        if (data && !data.hasCompletedCategoryIdMigration) {
          const report = await safeInvoke<MigrationReport>('migrate_category_id_for_skills_mcps');
          if (report) {
            // Project ESLint: only `warn` and `error` are allowed (no
            // `info` / `log`). This is a one-time launch summary so we
            // emit at warn level to stay visible in production builds.
            console.warn(
              `[migrate_category_id] migrated ${report.migratedSkills} skills + ${report.migratedMcps} mcps; orphans: ${report.orphanedSkills.length} skills + ${report.orphanedMcps.length} mcps`,
            );
          }
        }
      } catch (migErr) {
        // Non-fatal — frontend keeps the dual-read fallback operational and
        // backend will retry on next launch (flag stays false).
        console.error('Category id migration failed (non-fatal):', migErr);
      }

      set({ isLoading: false });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      const message = typeof error === 'string' ? error : String(error);
      set({ error: message, isLoading: false });
    }
  },

  // Editing state Actions - Clear all (for mutual exclusion)
  clearAllEditingStates: () =>
    set({
      editingCategoryId: null,
      isAddingCategory: false,
      editingTagId: null,
      isAddingTag: false,
    }),

  // Category editing state Actions
  startEditingCategory: (id: string) => {
    get().clearAllEditingStates();
    set({ editingCategoryId: id });
  },

  stopEditingCategory: () => set({ editingCategoryId: null }),

  startAddingCategory: () => {
    get().clearAllEditingStates();
    set({ isAddingCategory: true });
  },

  stopAddingCategory: () => set({ isAddingCategory: false }),

  // Tag editing state Actions
  startEditingTag: (id: string) => {
    get().clearAllEditingStates();
    set({ editingTagId: id });
  },

  stopEditingTag: () => set({ editingTagId: null }),

  startAddingTag: () => {
    get().clearAllEditingStates();
    set({ isAddingTag: true });
  },

  stopAddingTag: () => set({ isAddingTag: false }),
}));
