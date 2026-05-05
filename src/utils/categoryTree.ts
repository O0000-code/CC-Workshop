/**
 * Category hierarchy utilities (max depth = 2).
 *
 * Pure helpers for traversing the depth-2 Category tree introduced by the
 * `parentId?: string` field on `Category`. Used by:
 * - `MainLayout` to compute aggregated parent counts (D8=B).
 * - `CategoryPage` to filter "self + descendants" content (D7=A).
 * - dnd validation in the sidebar to prevent cycle-creating drops.
 *
 * Design notes:
 * - Hierarchy is **max depth = 2** (D2): a category may have a parent or be a
 *   parent, but a child cannot have its own children. Backend `validate_hierarchy`
 *   enforces this; the helpers here are defensively safe even if a malformed
 *   payload sneaks through (cycles, deeper trees), because the frontend must
 *   never crash on bad data.
 * - `parentId === undefined` (or missing) means the category is a top-level root.
 * - `parentId` is added by T2a in parallel with this file. The local
 *   `CategoryNode` alias decouples this module from the exact `Category` shape
 *   so it compiles regardless of T2a merge order.
 */

import type { Category } from '@/types';

/** Subset of `Category` we actually read here — keeps the module independent
 *  of the wider `Category` shape and tolerant of pre/post-T2a builds. */
type CategoryNode = Pick<Category, 'id'> & { parentId?: string };

/**
 * Collect the descendant ids (including the root itself) of a given category.
 *
 * Returns a `Set<string>` so consumers can do O(1) `.has()` checks inside
 * filter loops over Skills/MCPs/CLAUDE.md files.
 *
 * Edge cases:
 * - Empty `all` → `Set` containing just `parentId`.
 * - `parentId` not present in `all` → `Set` containing just `parentId` (treated
 *   as a leaf with no descendants).
 * - Cyclic `parentId` chain (should never happen — backend rejects — but
 *   defended) → terminates via `visited` set without recursion explosion.
 *
 * Complexity: O(N * D) where D is the max depth (= 2 by design); for N ≤ 50
 * categories this is well under a millisecond.
 */
export function collectDescendantIds(parentId: string, all: Category[]): Set<string> {
  const result = new Set<string>([parentId]);
  if (all.length === 0) return result;

  const nodes = all as readonly CategoryNode[];
  // Stack-based DFS keeps the function depth-agnostic. If MAX_DEPTH ever grows
  // beyond 2, no rewrite is needed.
  const stack: string[] = [parentId];
  const visited = new Set<string>([parentId]);

  while (stack.length > 0) {
    const currentId = stack.pop() as string;
    for (const cat of nodes) {
      if (cat.parentId === currentId && !visited.has(cat.id)) {
        visited.add(cat.id);
        result.add(cat.id);
        stack.push(cat.id);
      }
    }
  }

  return result;
}

/**
 * Check whether `maybeAncestorId` is an ancestor of `descendantId`, where a
 * category is considered an ancestor of itself (reflexive).
 *
 * Used in two places:
 * 1. dnd validation — before issuing `set_category_parent`, refuse drops that
 *    would create a cycle (parenting A under one of A's own descendants).
 * 2. CategoryPage / MainLayout invariants — sanity-check derived state.
 *
 * Edge cases:
 * - `descendantId` not in `all` → `false` (cannot establish ancestry of a
 *   non-existent node).
 * - Cyclic `parentId` chain (defensive) → terminates via `visited` set.
 * - `maybeAncestorId === descendantId` → `true` (reflexive).
 *
 * Complexity: O(D + N) where D is the chain length walked upward.
 */
export function isAncestorOf(
  maybeAncestorId: string,
  descendantId: string,
  all: Category[],
): boolean {
  if (maybeAncestorId === descendantId) return true;
  if (all.length === 0) return false;

  const nodes = all as readonly CategoryNode[];
  const visited = new Set<string>();

  let current: string | undefined = descendantId;
  while (current !== undefined) {
    if (visited.has(current)) return false; // cycle defense
    visited.add(current);

    const node = nodes.find((c) => c.id === current);
    if (!node) return false;

    const next = node.parentId;
    if (next === undefined) return false; // reached root without finding ancestor
    if (next === maybeAncestorId) return true;

    current = next;
  }

  return false;
}

/**
 * Resolve the human-visible display name for a category reference, preferring
 * the canonical `categoryId` lookup and falling back to the cached `category`
 * name string when the id has not yet been migrated (legacy `data.json` row)
 * or has gone stale (category renamed/deleted between scans).
 *
 * Used by `SkillItem` / `McpItem` / `SkillListItem` / `McpListItem` /
 * `McpDetailPage` badge displays — the V1 hierarchy migration introduces a
 * dual-tracked reference (`categoryId` SoT + `category` cached display, see
 * `03_tech_plan.md` V2 §4.6) and the display layer must remain readable
 * during the rollout window where some entries have only the cached name.
 *
 * Edge cases:
 * - `categoryId` provided + matches a current category → returns
 *   `category.name` (canonical, picks up any post-rename change).
 * - `categoryId` provided + does NOT match (deleted / dangling) → falls back
 *   to `fallbackName` to avoid rendering a blank badge.
 * - Both undefined / empty → returns `''` (caller renders an "Uncategorized"
 *   placeholder or hides the badge entirely).
 *
 * Complexity: O(N) `find` over `all`. Categories are typically ≤ 50 entries
 * so this is negligible.
 */
export function getCategoryDisplayName(
  categoryId: string | undefined,
  fallbackName: string | undefined,
  all: Category[],
): string {
  if (categoryId) {
    const found = all.find((c) => c.id === categoryId);
    if (found) return found.name;
  }
  return fallbackName ?? '';
}

/**
 * Resolve the color associated with a category reference, mirroring the
 * `getCategoryDisplayName` resolution order: prefer `categoryId` lookup,
 * fall back to a name-keyed lookup against `all` only as a last resort
 * (legacy data with no migrated id). Returns `undefined` when nothing
 * resolves so callers can apply their own neutral default.
 *
 * Edge case parity with `getCategoryDisplayName`:
 * - dangling `categoryId` (deleted) → tries `fallbackName` against `all`,
 *   then gives up.
 * - both empty → `undefined`.
 */
export function getCategoryColor(
  categoryId: string | undefined,
  fallbackName: string | undefined,
  all: Category[],
): string | undefined {
  if (categoryId) {
    const found = all.find((c) => c.id === categoryId);
    if (found) return found.color;
  }
  if (fallbackName) {
    const byName = all.find((c) => c.name === fallbackName);
    if (byName) return byName.color;
  }
  return undefined;
}

/**
 * Find the root (top-level) ancestor of a given category.
 *
 * Walks upward via `parentId` until a node with no parent is found. Returns
 * the category itself if it has no parent. Returns `undefined` if `id` is
 * not present in `all`.
 *
 * Edge cases:
 * - `id` not in `all` → `undefined`.
 * - `id` is itself a root (`parentId === undefined`) → returns the category.
 * - Cyclic `parentId` chain (defensive) → returns the last successfully
 *   visited node before the cycle, never loops forever.
 * - Orphan child (`parentId` points to a missing node) → returns the orphan
 *   itself (closest reachable ancestor in `all`).
 *
 * Complexity: O(D + N) where D is the chain length walked upward.
 */
export function findRootOf(id: string, all: Category[]): Category | undefined {
  if (all.length === 0) return undefined;

  const nodes = all as readonly CategoryNode[];
  const visited = new Set<string>();

  let currentNode = nodes.find((c) => c.id === id);
  if (!currentNode) return undefined;

  while (currentNode.parentId !== undefined) {
    if (visited.has(currentNode.id)) {
      // cycle defense — return the last node before the cycle
      return currentNode as Category;
    }
    visited.add(currentNode.id);

    const parent = nodes.find((c) => c.id === currentNode!.parentId);
    if (!parent) {
      // orphan: parentId points to a missing node — currentNode is the
      // closest reachable ancestor in `all`
      return currentNode as Category;
    }
    currentNode = parent;
  }

  return currentNode as Category;
}
