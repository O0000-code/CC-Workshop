/**
 * Tests for CategoryPage — V2 hierarchy aggregation (D7=A) + dual-read.
 *
 * Coverage targets per T3c task card:
 * 1. Parent view aggregates self + descendants (Skills, MCPs, CLAUDE.md).
 * 2. Child view shows only self.
 * 3. Dual-read fallback: skills with `category` (name) but no `categoryId`
 *    still resolve via the visibleNames set.
 * 4. Dual-read primary: when a skill has `categoryId`, that path takes
 *    precedence (id-based match wins; legacy name field is ignored).
 *
 * Notes on test design:
 *  - Heavy child components (SkillListItem, McpListItem, ClaudeMdCard,
 *    detail panels, PageHeader, etc.) are mocked with minimal probes so
 *    the test focuses on filter logic — not on rendering chrome that
 *    other test files (SortableCategoryRow.test.tsx, etc.) already cover.
 *  - `react-router-dom`'s `useParams` is mocked per-test to inject the
 *    target categoryId; this avoids needing a `MemoryRouter` wrapper
 *    while keeping each test independently parameterised.
 *  - Stores are populated directly via Zustand `setState` (no IPC needed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Category, Skill, McpServer } from '@/types';
import type { ClaudeMdFile } from '@/types/claudeMd';
import { useAppStore } from '@/stores/appStore';
import { useSkillsStore } from '@/stores/skillsStore';
import { useMcpsStore } from '@/stores/mcpsStore';
import { useClaudeMdStore } from '@/stores/claudeMdStore';

// ---------------------------------------------------------------------------
// Mocks — react-router-dom useParams
// ---------------------------------------------------------------------------
// `useParams` is replaced per-test by `mockUseParams.mockReturnValue(...)`.
// The rest of `react-router-dom` (Link, etc.) is preserved via importActual
// so any component CategoryPage renders that touches the router still works.
const mockUseParams = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => mockUseParams(),
  };
});

// ---------------------------------------------------------------------------
// Mocks — heavy child components (replaced by minimal probes)
// ---------------------------------------------------------------------------
// Each probe renders a `data-testid` + the entity id so tests can locate
// rendered items deterministically. We do not exercise the rich list-item
// chrome here — that's covered by other test files (SkillListItem.test.tsx
// etc., and component-level tests).

vi.mock('../../components/skills/SkillListItem', () => ({
  SkillListItem: ({ skill }: { skill: Skill }) => (
    <div data-testid="skill-item" data-skill-id={skill.id}>
      {skill.name}
    </div>
  ),
}));

vi.mock('../../components/skills/SkillDetailPanel', () => ({
  SkillDetailPanel: () => null,
}));

vi.mock('../../components/mcps/McpListItem', () => ({
  McpListItem: ({ mcp }: { mcp: McpServer }) => (
    <div data-testid="mcp-item" data-mcp-id={mcp.id}>
      {mcp.name}
    </div>
  ),
}));

vi.mock('../../components/mcps/McpDetailPanel', () => ({
  McpDetailPanel: () => null,
}));

vi.mock('../../components/claude-md/ClaudeMdCard', () => ({
  ClaudeMdCard: ({ file }: { file: ClaudeMdFile }) => (
    <div data-testid="claudeMd-item" data-file-id={file.id}>
      {file.name}
    </div>
  ),
}));

vi.mock('../../components/claude-md/ClaudeMdDetailPanel', () => ({
  ClaudeMdDetailPanel: () => null,
}));

vi.mock('../../components/common/FilteredEmptyState', () => ({
  FilteredEmptyState: () => <div data-testid="empty-state" />,
}));

// PageHeader pulls in icons / search input chrome we don't care about; render
// only the title so empty-state tests can still see the category name.
vi.mock('../../components/layout/PageHeader', () => ({
  default: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}));

// Button needs no real behaviour — disabled/click logic is irrelevant here.
vi.mock('../../components/common/Button', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

// Mock @/utils/tauri so any incidental safeInvoke calls (none expected) don't
// trip the missing Tauri runtime.
vi.mock('@/utils/tauri', () => ({
  isTauri: vi.fn(() => false),
  safeInvoke: vi.fn(),
  BROWSER_MODE_MESSAGE: 'mock browser mode',
}));

// ---------------------------------------------------------------------------
// Module under test (imported AFTER mocks so they are applied)
// ---------------------------------------------------------------------------
import { CategoryPage } from '../CategoryPage';

// ---------------------------------------------------------------------------
// Fixture builders
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

function buildSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    name: 'Skill 1',
    description: 'desc',
    category: 'Cat',
    categoryId: undefined,
    tags: [],
    enabled: true,
    sourcePath: '/skills/skill-1',
    scope: 'global',
    instructions: '',
    createdAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    ...overrides,
  };
}

function buildMcp(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'mcp-1',
    name: 'Mcp 1',
    description: 'desc',
    category: 'Cat',
    categoryId: undefined,
    tags: [],
    enabled: true,
    sourcePath: '/mcps/mcp-1',
    scope: 'global',
    command: 'mock',
    args: [],
    providedTools: [],
    createdAt: '2026-01-01T00:00:00Z',
    usageCount: 0,
    needsConfig: false,
    ...overrides,
  };
}

function buildClaudeMdFile(overrides: Partial<ClaudeMdFile> = {}): ClaudeMdFile {
  return {
    id: 'cmd-1',
    name: 'CMD 1',
    description: 'desc',
    sourcePath: '/cmd/CMD-1',
    sourceType: 'project',
    content: '',
    isGlobal: false,
    categoryId: undefined,
    tagIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    size: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Store seeding helpers
// ---------------------------------------------------------------------------

function seedCategories(categories: Category[]) {
  useAppStore.setState({ categories });
}

function seedSkills(skills: Skill[]) {
  useSkillsStore.setState({ skills });
}

function seedMcps(mcps: McpServer[]) {
  useMcpsStore.setState({ mcpServers: mcps });
}

function seedClaudeMd(files: ClaudeMdFile[]) {
  useClaudeMdStore.setState({ files });
}

// Helpers to read rendered items from the DOM.
function renderedSkillIds(): string[] {
  return Array.from(screen.queryAllByTestId('skill-item')).map(
    (el) => el.getAttribute('data-skill-id') ?? '',
  );
}

function renderedMcpIds(): string[] {
  return Array.from(screen.queryAllByTestId('mcp-item')).map(
    (el) => el.getAttribute('data-mcp-id') ?? '',
  );
}

function renderedClaudeMdIds(): string[] {
  return Array.from(screen.queryAllByTestId('claudeMd-item')).map(
    (el) => el.getAttribute('data-file-id') ?? '',
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('CategoryPage — D7=A aggregated view + dual-read', () => {
  beforeEach(() => {
    mockUseParams.mockReset();
    // Wipe stores between tests so leftover state never leaks.
    seedCategories([]);
    seedSkills([]);
    seedMcps([]);
    seedClaudeMd([]);
  });

  it('parent view: aggregates self + child items across Skills, MCPs, and CLAUDE.md', () => {
    // Tree:
    //   Development (parent)
    //     ├─ Frontend (child)
    //     └─ Backend  (child)
    //   Productivity (unrelated root)
    const parent = buildCategory({ id: 'p1', name: 'Development' });
    const child1 = buildCategory({ id: 'p1-c1', name: 'Frontend', parentId: 'p1' });
    const child2 = buildCategory({ id: 'p1-c2', name: 'Backend', parentId: 'p1' });
    const unrelated = buildCategory({ id: 'p2', name: 'Productivity' });
    seedCategories([parent, child1, child2, unrelated]);

    seedSkills([
      // Skill living directly on the parent (categoryId match)
      buildSkill({
        id: 's-parent',
        name: 'Skill on parent',
        categoryId: 'p1',
        category: 'Development',
      }),
      // Skill living on a child (must surface under parent view)
      buildSkill({
        id: 's-child',
        name: 'Skill on child',
        categoryId: 'p1-c1',
        category: 'Frontend',
      }),
      // Skill in an unrelated category (must NOT surface)
      buildSkill({
        id: 's-other',
        name: 'Skill on other',
        categoryId: 'p2',
        category: 'Productivity',
      }),
    ]);

    seedMcps([
      buildMcp({
        id: 'm-parent',
        name: 'Mcp on parent',
        categoryId: 'p1',
        category: 'Development',
      }),
      buildMcp({ id: 'm-child', name: 'Mcp on child', categoryId: 'p1-c2', category: 'Backend' }),
      buildMcp({ id: 'm-other', name: 'Mcp on other', categoryId: 'p2', category: 'Productivity' }),
    ]);

    seedClaudeMd([
      buildClaudeMdFile({ id: 'f-parent', name: 'Cmd on parent', categoryId: 'p1' }),
      buildClaudeMdFile({ id: 'f-child', name: 'Cmd on child', categoryId: 'p1-c2' }),
      buildClaudeMdFile({ id: 'f-other', name: 'Cmd on other', categoryId: 'p2' }),
    ]);

    mockUseParams.mockReturnValue({ categoryId: 'p1' });

    render(<CategoryPage />);

    expect(renderedSkillIds().sort()).toEqual(['s-child', 's-parent']);
    expect(renderedMcpIds().sort()).toEqual(['m-child', 'm-parent']);
    expect(renderedClaudeMdIds().sort()).toEqual(['f-child', 'f-parent']);
  });

  it('child view: shows only items belonging to the child itself (no sibling bleed)', () => {
    const parent = buildCategory({ id: 'p1', name: 'Development' });
    const child1 = buildCategory({ id: 'p1-c1', name: 'Frontend', parentId: 'p1' });
    const child2 = buildCategory({ id: 'p1-c2', name: 'Backend', parentId: 'p1' });
    seedCategories([parent, child1, child2]);

    seedSkills([
      buildSkill({
        id: 's-parent',
        name: 'Skill on parent',
        categoryId: 'p1',
        category: 'Development',
      }),
      buildSkill({
        id: 's-c1',
        name: 'Skill on Frontend',
        categoryId: 'p1-c1',
        category: 'Frontend',
      }),
      buildSkill({
        id: 's-c2',
        name: 'Skill on Backend',
        categoryId: 'p1-c2',
        category: 'Backend',
      }),
    ]);

    seedMcps([
      buildMcp({ id: 'm-c1', name: 'Mcp on Frontend', categoryId: 'p1-c1', category: 'Frontend' }),
      buildMcp({ id: 'm-c2', name: 'Mcp on Backend', categoryId: 'p1-c2', category: 'Backend' }),
    ]);

    seedClaudeMd([
      buildClaudeMdFile({ id: 'f-c1', name: 'Cmd on Frontend', categoryId: 'p1-c1' }),
      buildClaudeMdFile({ id: 'f-c2', name: 'Cmd on Backend', categoryId: 'p1-c2' }),
    ]);

    mockUseParams.mockReturnValue({ categoryId: 'p1-c1' });

    render(<CategoryPage />);

    // Child view = only `p1-c1`'s own items. Parent's own items and sibling
    // child's items must not appear.
    expect(renderedSkillIds()).toEqual(['s-c1']);
    expect(renderedMcpIds()).toEqual(['m-c1']);
    expect(renderedClaudeMdIds()).toEqual(['f-c1']);
  });

  it('dual-read fallback: skill with only `category` name (no `categoryId`) still matches via visibleNames', () => {
    // Pre-T1e migration: legacy entries carry `category: <name>` but no
    // `categoryId`. The aggregated view must still pick them up via the
    // visibleNames fallback set.
    const parent = buildCategory({ id: 'p1', name: 'Development' });
    const child = buildCategory({ id: 'p1-c1', name: 'Frontend', parentId: 'p1' });
    const unrelated = buildCategory({ id: 'p2', name: 'Productivity' });
    seedCategories([parent, child, unrelated]);

    seedSkills([
      // Legacy: name-only, parent
      buildSkill({
        id: 's-legacy-parent',
        name: 'Legacy parent skill',
        categoryId: undefined,
        category: 'Development',
      }),
      // Legacy: name-only, child (must surface under parent view via name fallback)
      buildSkill({
        id: 's-legacy-child',
        name: 'Legacy child skill',
        categoryId: undefined,
        category: 'Frontend',
      }),
      // Legacy: name-only, unrelated (must NOT surface)
      buildSkill({
        id: 's-legacy-other',
        name: 'Legacy other skill',
        categoryId: undefined,
        category: 'Productivity',
      }),
    ]);

    seedMcps([
      buildMcp({
        id: 'm-legacy-parent',
        name: 'Legacy parent mcp',
        categoryId: undefined,
        category: 'Development',
      }),
      buildMcp({
        id: 'm-legacy-child',
        name: 'Legacy child mcp',
        categoryId: undefined,
        category: 'Frontend',
      }),
      buildMcp({
        id: 'm-legacy-other',
        name: 'Legacy other mcp',
        categoryId: undefined,
        category: 'Productivity',
      }),
    ]);

    mockUseParams.mockReturnValue({ categoryId: 'p1' });

    render(<CategoryPage />);

    expect(renderedSkillIds().sort()).toEqual(['s-legacy-child', 's-legacy-parent']);
    expect(renderedMcpIds().sort()).toEqual(['m-legacy-child', 'm-legacy-parent']);
  });

  it('dual-read primary: when `categoryId` is set, id wins over a stale legacy `category` name', () => {
    // Build a stale state where `category` (name cache) is wrong but
    // `categoryId` (canonical) is right. Filter MUST follow the id, not
    // the stale name. This guards against regressions where the dual-read
    // condition collapses to `s.categoryId || visibleNames.has(s.category)`
    // (which would let stale name matches leak through when categoryId is
    // present but doesn't match the parent tree).
    const parent = buildCategory({ id: 'p1', name: 'Development' });
    const child = buildCategory({ id: 'p1-c1', name: 'Frontend', parentId: 'p1' });
    const unrelated = buildCategory({ id: 'p2', name: 'Productivity' });
    seedCategories([parent, child, unrelated]);

    seedSkills([
      // Skill canonically belongs to Productivity (categoryId='p2'), but its
      // legacy `category` cache says 'Development'. With dual-read primary
      // semantics, the id path runs FIRST and the skill is filtered OUT of
      // the Development view (because 'p2' is not in visibleIds for 'p1').
      buildSkill({
        id: 's-stale-cache',
        name: 'Skill with stale name',
        categoryId: 'p2',
        category: 'Development', // stale — name says Development, id says p2
      }),
      // Skill that genuinely belongs under Development (id match)
      buildSkill({
        id: 's-id-true',
        name: 'Skill truly under dev',
        categoryId: 'p1',
        category: 'Development',
      }),
    ]);

    seedMcps([
      buildMcp({
        id: 'm-stale-cache',
        name: 'Mcp with stale name',
        categoryId: 'p2',
        category: 'Frontend', // stale — would falsely match a child name
      }),
      buildMcp({
        id: 'm-id-true',
        name: 'Mcp truly under frontend',
        categoryId: 'p1-c1',
        category: 'Frontend',
      }),
    ]);

    mockUseParams.mockReturnValue({ categoryId: 'p1' });

    render(<CategoryPage />);

    // Only the id-true entries should render; the stale-cache entries (with
    // categoryId='p2') must be excluded from the Development tree view.
    expect(renderedSkillIds()).toEqual(['s-id-true']);
    expect(renderedMcpIds()).toEqual(['m-id-true']);
  });
});
