/**
 * Unit tests for `MainLayout.categoriesWithCounts` aggregation (D8=B).
 *
 * Per `.dev/category-hierarchy/01_research/_synthesis_decisions.md` §2.1
 * (decision D8 = B):
 * - Parent category count = self-count + sum of every descendant's self-count.
 * - Leaf (no children) count = self-count only.
 * - Aggregation must agree with the CategoryPage filter so that the sidebar
 *   number always equals the number of items the user sees inside the page.
 *
 * MainLayout itself is a heavy integration shell (router, Tauri IPC, all
 * stores). To keep this test focused on the *math* — which is the
 * load-bearing claim of the spec — we reproduce the production formula
 * verbatim via the same `collectDescendantIds` helper that MainLayout
 * imports, and assert the per-category counts on a representative fixture.
 *
 * If the formula in `MainLayout.tsx` ever drifts from this test, both must
 * be updated together — the test is the executable copy of the spec.
 */

import { describe, it, expect } from 'vitest';
import type { Category, Skill, McpServer } from '@/types';
import type { ClaudeMdFile } from '@/types/claudeMd';
import { collectDescendantIds } from '@/utils/categoryTree';

// Verbatim copy of the production formula from MainLayout.tsx
// (`categoriesWithCounts` useMemo). If this test passes and MainLayout
// passes, both agree on the spec.
function computeCategoriesWithCounts(
  categories: Category[],
  skills: Pick<Skill, 'category' | 'categoryId'>[],
  mcpServers: Pick<McpServer, 'category' | 'categoryId'>[],
  claudeMdFiles: Pick<ClaudeMdFile, 'categoryId'>[],
): (Category & { count: number })[] {
  return categories.map((cat) => {
    const idSet = collectDescendantIds(cat.id, categories);
    const nameSet = new Set(categories.filter((c) => idSet.has(c.id)).map((c) => c.name));
    return {
      ...cat,
      count:
        skills.filter((s) => (s.categoryId ? idSet.has(s.categoryId) : nameSet.has(s.category)))
          .length +
        mcpServers.filter((m) => (m.categoryId ? idSet.has(m.categoryId) : nameSet.has(m.category)))
          .length +
        claudeMdFiles.filter((f) => f.categoryId !== undefined && idSet.has(f.categoryId)).length,
    };
  });
}

// Test-only fixtures use the loose `Pick<...>` shape — full Skill/McpServer
// shapes carry many fields irrelevant to the count formula.
function skillFixture(category: string, categoryId?: string) {
  return { category, categoryId } as Pick<Skill, 'category' | 'categoryId'>;
}
function mcpFixture(category: string, categoryId?: string) {
  return { category, categoryId } as Pick<McpServer, 'category' | 'categoryId'>;
}
function claudeMdFixture(categoryId: string | undefined) {
  return { categoryId } as Pick<ClaudeMdFile, 'categoryId'>;
}
function cat(id: string, name: string, parentId?: string): Category {
  const base = { id, name, color: '#A1A1AA', count: 0 };
  return parentId === undefined ? (base as Category) : ({ ...base, parentId } as Category);
}

describe('MainLayout categoriesWithCounts aggregation (D8=B)', () => {
  it('parent count = self + every descendant (canonical fixture)', () => {
    // Tree:
    //   Development (root)  ← 2 own
    //   ├── Frontend         ← 3 own
    //   └── Backend          ← 5 own
    //   Other (root, leaf)   ← 1 own
    const categories: Category[] = [
      cat('dev', 'Development'),
      cat('fe', 'Frontend', 'dev'),
      cat('be', 'Backend', 'dev'),
      cat('other', 'Other'),
    ];

    // 2 skills under Development (parent), 3 skills under Frontend, 4 mcps
    // under Backend, 1 mcp + 1 claude-md under Other. Counts use categoryId
    // (post-migration SoT).
    const skills = [
      skillFixture('Development', 'dev'),
      skillFixture('Development', 'dev'),
      skillFixture('Frontend', 'fe'),
      skillFixture('Frontend', 'fe'),
      skillFixture('Frontend', 'fe'),
    ];
    const mcps = [
      mcpFixture('Backend', 'be'),
      mcpFixture('Backend', 'be'),
      mcpFixture('Backend', 'be'),
      mcpFixture('Backend', 'be'),
      mcpFixture('Other', 'other'),
    ];
    const claudeMd = [claudeMdFixture('other')];

    const result = computeCategoriesWithCounts(categories, skills, mcps, claudeMd);

    const byId = new Map(result.map((c) => [c.id, c.count]));

    // Leaves count their own:
    expect(byId.get('fe')).toBe(3);
    expect(byId.get('be')).toBe(4);
    // 'other' has 1 mcp + 1 claudeMd:
    expect(byId.get('other')).toBe(2);
    // Parent aggregates self + descendants: 2 (own skills) + 3 (Frontend) + 4 (Backend) = 9
    expect(byId.get('dev')).toBe(9);
  });

  it('falls back to category name when categoryId is missing (dual-read)', () => {
    // Migration in progress: some skills still carry only the cached
    // `category` name. The formula must fall back to the descendant name set.
    const categories: Category[] = [cat('dev', 'Development'), cat('fe', 'Frontend', 'dev')];
    const skills = [
      skillFixture('Development'), // no categoryId — name fallback path
      skillFixture('Frontend'), // no categoryId — name fallback path
      skillFixture('Frontend', 'fe'), // post-migration
    ];

    const result = computeCategoriesWithCounts(categories, skills, [], []);
    const byId = new Map(result.map((c) => [c.id, c.count]));

    expect(byId.get('fe')).toBe(2); // 1 by name + 1 by id
    expect(byId.get('dev')).toBe(3); // self (1 by name) + Frontend (2)
  });

  it('leaf root with no children counts only its own items', () => {
    const categories: Category[] = [cat('solo', 'Solo')];
    const skills = [skillFixture('Solo', 'solo'), skillFixture('Solo', 'solo')];

    const result = computeCategoriesWithCounts(categories, skills, [], []);
    expect(result[0].count).toBe(2);
  });

  it('child counts are independent of sibling counts', () => {
    // Regression guard: collectDescendantIds(child) must NOT pick up sibling
    // items via shared parent.
    const categories: Category[] = [
      cat('root', 'Root'),
      cat('a', 'A', 'root'),
      cat('b', 'B', 'root'),
    ];
    const skills = [skillFixture('A', 'a'), skillFixture('A', 'a'), skillFixture('B', 'b')];

    const result = computeCategoriesWithCounts(categories, skills, [], []);
    const byId = new Map(result.map((c) => [c.id, c.count]));

    expect(byId.get('a')).toBe(2);
    expect(byId.get('b')).toBe(1);
    expect(byId.get('root')).toBe(3); // 0 self + 2 (A) + 1 (B)
  });

  it('claudeMd entries with undefined categoryId never contribute to any count', () => {
    // ClaudeMd does not have a `category` name fallback (only `categoryId`).
    // Files with `categoryId === undefined` must be invisible to all counts.
    const categories: Category[] = [cat('root', 'Root')];
    const claudeMd = [
      claudeMdFixture(undefined),
      claudeMdFixture(undefined),
      claudeMdFixture('root'),
    ];

    const result = computeCategoriesWithCounts(categories, [], [], claudeMd);
    expect(result[0].count).toBe(1);
  });
});
